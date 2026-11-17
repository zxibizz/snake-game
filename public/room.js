// A shared-game room. It runs in the browser of whoever created it (the host): the host computes the world with bots,
// food and butterflies using the same core.js as the solo game. Each player (the host included) computes their own snake
// locally and reports where it is, what it ate, which butterfly it caught and what it crashed into; the host sends world snapshots to everyone.
// A connection to a player (conn) is a direct WebRTC channel (rtc.js) or a loopback inside the host's page:
//   conn.send(obj) — JSON, reliable; conn.bin(u8) — binary, reliable; conn.fast(u8) — binary without retransmits;
//   conn.buffered() — how much hasn't gone out on the reliable channel yet; conn.close().
import { World, R, SKINS, SNAKES_N, TAU, VERSION, FOOD_CELL, FOOD_CELLS, FLY_MAX, keepMass } from './core.js';

export const TICK = 1 / 40;      // world steps per second: 40; a snapshot every step: cheap over a direct link, and rendering can stay closer to "now"
const LB_EVERY = 40;             // leaderboard: once a second
const SLEEP_MS = 3000;           // no news from a player for this long — their snake "fell asleep" (the game was minimized), remove it
export const MAX_HUMANS = 8;
const TEAM = 1;

const AOI = 2300, HYST = 500, FOOD_AOI = 2600;
export const FR = 13, FLR = 16;
// food record → [id, x, y, value, color, life, cell]
export const readFood = (dv, o) => [dv.getUint32(o + 1, true), dv.getInt16(o + 5, true) / 4, dv.getInt16(o + 7, true) / 4,
  dv.getUint16(o + 9, true) / 100, dv.getUint8(o + 11), dv.getUint8(o + 12), dv.getUint8(o)];

const flatSegs = (s) => {
  const out = new Array(s.segs.length * 2);
  s.segs.forEach((p, i) => { out[i * 2] = Math.round(p.x); out[i * 2 + 1] = Math.round(p.y); });
  return out;
};
const metaOf = (s) => ({ id: s.id, name: s.name, skin: s.skin, team: s.team, human: s.human, segs: flatSegs(s) });
const lifeLeft = (f) => (f.life ? Math.max(1, Math.min(255, Math.ceil(f.life - f.age))) : 0);
const feastOf = (w) => (w.feast ? { x: Math.round(w.feast.x), y: Math.round(w.feast.y), life: Math.max(1, Math.round(w.feast.until - w.time)) } : null);
export function cleanName(n, fallback = 'Player') {
  const s = String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 12);
  return s || fallback;
}
const cleanSkin = (k) => (Number.isInteger(k) && k >= 0 && k < SKINS.length ? k : 0);
const q4 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 4)));
const qa = (a) => Math.round((((a % TAU) + TAU) % TAU) / TAU * 65535);

// ---------- binary encoding ----------
class Out {
  constructor(n) { this.u8 = new Uint8Array(n); this.dv = new DataView(this.u8.buffer); this.o = 0; }
  u8_(v) { this.dv.setUint8(this.o, v); this.o += 1; }
  u16(v) { this.dv.setUint16(this.o, v, true); this.o += 2; }
  i16(v) { this.dv.setInt16(this.o, v, true); this.o += 2; }
  u32(v) { this.dv.setUint32(this.o, v >>> 0, true); this.o += 4; }
  f32(v) { this.dv.setFloat32(this.o, v, true); this.o += 4; }
  done() { return this.o === this.u8.length ? this.u8 : this.u8.subarray(0, this.o); }
}
function writeFood(w, f) {
  w.u8_(f.cell); w.u32(f.id); w.i16(q4(f.x)); w.i16(q4(f.y));
  w.u16(Math.min(65535, Math.round(f.v * 100))); w.u8_(f.c); w.u8_(lifeLeft(f));
}
// Snapshot (no retransmits): u8 type=1 | u32 tick | u16 snakes × [u32 id, i16 x·4, i16 y·4, u16 angle, u16 aim, f32 mass, u8 flags]
//   | u8 butterflies × FLY_REC
// Food (reliable, ordered): 2 — everything around: u32 count × FOOD_REC; 3 — cells changed: u8 left × u8, u8 entered × u8, u32 × FOOD_REC;
//   4 — changes: u32 tick | u16 added × FOOD_REC | u16 eaten × u32 id
// FOOD_REC (13 bytes): u8 cell, u32 id, i16 x·4, i16 y·4, u16 value·100, u8 color, u8 seconds left to lie (0 — forever)
// FLY_REC (16 bytes): u16 id, i16 x·4, i16 y·4, u16 heading, u16 collected·100, u8 flags (1 — dodging), 5 × u8 crumb color (255 — none)
// From a player (no retransmits): u8 type=10 | u32 snake id | u16 seq | i16 x·4 | i16 y·4 | u16 angle | u16 aim | f32 mass | u8 flags
export const SELF_LEN = 20;
export function encodeSelf(s, seq) {
  const w = new Out(SELF_LEN);
  w.u8_(10); w.u32(s.id); w.u16(seq & 0xffff); w.i16(q4(s.segs[0].x)); w.i16(q4(s.segs[0].y));
  w.u16(qa(s.a)); w.u16(qa(s.ta)); w.f32(s.mass); w.u8_((s.isBoosting ? 1 : 0) | (s.inv > 0 ? 2 : 0) | (s.stage << 2));
  return w.done();
}
const foodIn = (w, cells) => w.foods.filter((f) => !f.dead && cells.has(f.cell));
function allFood(w, cells) {
  const foods = foodIn(w, cells), o = new Out(5 + foods.length * FR);
  o.u8_(2); o.u32(foods.length);
  for (const f of foods) writeFood(o, f);
  return o.done();
}
function cellFood(w, leave, enter) {
  const foods = foodIn(w, new Set(enter)), o = new Out(3 + leave.length + enter.length + 4 + foods.length * FR);
  o.u8_(3);
  o.u8_(leave.length); for (const k of leave) o.u8_(k);
  o.u8_(enter.length); for (const k of enter) o.u8_(k);
  o.u32(foods.length);
  for (const f of foods) writeFood(o, f);
  return o.done();
}
function foodPart(tick, ch, cells) {
  const added = ch.added.filter(([, k]) => cells.has(k)).slice(0, 65535);
  const removed = ch.removed.filter(([, k]) => cells.has(k)).slice(0, 65535);
  if (!added.length && !removed.length) return null;
  const o = new Out(1 + 4 + 2 + added.length * FR + 2 + removed.length * 4);
  o.u8_(4); o.u32(tick);
  o.u16(added.length); for (const [f] of added) writeFood(o, f);
  o.u16(removed.length); for (const [id] of removed) o.u32(id);
  return o.done();
}
function snapshot(tick, snakes, flies) {
  const o = new Out(7 + snakes.length * 17 + 1 + flies.length * FLR);
  o.u8_(1); o.u32(tick); o.u16(snakes.length);
  for (const s of snakes) {
    o.u32(s.id); o.i16(q4(s.x)); o.i16(q4(s.y)); o.u16(qa(s.a)); o.u16(qa(s.ta)); o.f32(s.mass);
    o.u8_((s.isBoosting ? 1 : 0) | (s.inv > 0 ? 2 : 0) | (s.stage << 2)); // bits 2–4 — stage (molt)
  }
  o.u8_(flies.length);
  for (const f of flies) {
    o.u16(f.id & 0xffff); o.i16(q4(f.x)); o.i16(q4(f.y)); o.u16(qa(f.dir));
    o.u16(Math.round(Math.min(f.n, FLY_MAX) * 100)); o.u8_(f.dart > 0 ? 1 : 0);
    for (let i = 0; i < 5; i++) o.u8_(i < f.top.length ? f.top[i] : 255);
  }
  return o.done();
}

export class Room {
  constructor({ code, mode, diff, botNames, playerName = 'Player' }) {
    this.playerName = playerName; // the host's language: fallback for guests without a name
    this.code = code;
    this.mode = mode === 'ffa' ? 'ffa' : 'team';
    this.diff = diff;
    this.world = new World({ diff, botNames });
    this.world.track = true;
    this.clients = new Set();   // said hello
    this.conns = new Set();     // all connections, including those that haven't said hello yet
    this.tick = 0;
    this.kills = []; this.feast = null; this.flies = [];
  }

  // ---------- who sees whom ----------
  viewCenter(c) {
    if (c.snake && c.snake.alive) { c.cx = c.snake.x; c.cy = c.snake.y; }
    return [c.cx, c.cy];
  }
  visibleTo(c) {
    const [cx, cy] = this.viewCenter(c), out = [];
    for (const s of this.world.snakes) {
      if (!s.alive || s === c.snake) continue; // players compute their own snake themselves
      const lim = AOI + (c.known.has(s.id) ? HYST : 0), lim2 = lim * lim;
      const segs = s.segs, step = Math.max(1, Math.floor(lim / (s.r * 0.42) / 6));
      for (let k = 0; k < segs.length; k += step) {
        const dx = segs[k].x - cx, dy = segs[k].y - cy;
        if (dx * dx + dy * dy < lim2) { out.push(s); break; }
      }
    }
    return out;
  }
  cellsFor(c) {
    const [cx, cy] = this.viewCenter(c), out = new Set();
    for (let gy = 0; gy < FOOD_CELLS; gy++) {
      const y0 = gy * FOOD_CELL - R, ny = Math.max(y0, Math.min(cy, y0 + FOOD_CELL));
      for (let gx = 0; gx < FOOD_CELLS; gx++) {
        const x0 = gx * FOOD_CELL - R, nx = Math.max(x0, Math.min(cx, x0 + FOOD_CELL));
        if ((nx - cx) ** 2 + (ny - cy) ** 2 < FOOD_AOI * FOOD_AOI) out.add(gy * FOOD_CELLS + gx);
      }
    }
    return out;
  }
  fliesNear(c) {
    const [cx, cy] = this.viewCenter(c), lim2 = (AOI + 300) ** 2;
    return this.world.flies.filter((f) => (f.x - cx) ** 2 + (f.y - cy) ** 2 < lim2).slice(0, 255);
  }
  seen() { const ids = new Set(); for (const o of this.clients) for (const id of o.known) ids.add(id); return ids; }
  leaderboard() {
    const list = this.world.snakes.filter((s) => s.alive).sort((a, b) => b.mass - a.mass);
    const mm = [];
    for (const s of list) mm.push(Math.round(s.x / 25), Math.round(s.y / 25), Math.floor(s.mass));
    return {
      t: 'lb', n: list.length,
      top: list.slice(0, 10).map((s) => [s.id, s.name, Math.floor(s.mass), s.human ? 1 : 0, s.team]),
      hum: list.filter((s) => s.human).map((s) => [s.id, s.name, Math.round(s.x), Math.round(s.y), Math.floor(s.mass), s.team]),
      mm,
    };
  }
  updateBots() { this.world.targetBots = SNAKES_N - this.clients.size; }
  spawn(c, inv) {
    const s = this.world.addHuman({ name: c.name, skin: c.skin, team: this.mode === 'team' ? TEAM : 0,
      mass: keepMass(this.diff, c.lastMass), inv, keep: this.seen() });
    s.remote = true;
    c.snake = s; c.seq = -1; c.heard = performance.now();
    return { id: s.id, segs: flatSegs(s), mass: s.mass, inv, team: s.team };
  }

  // ---------- connections ----------
  // a new connection: wait for its hello
  attach(conn) {
    const c = { conn, room: this, hello: false, snake: null, name: this.playerName, skin: 0, kills: 0, lastMass: 0, token: '', seq: -1,
      known: new Set(), cells: new Set(), cx: 0, cy: 0, rvId: 0, kq: [], lagging: false, heard: 0 };
    this.conns.add(conn);
    return c;
  }
  message(c, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') { if (!c.hello) this.join(c, m); return; }
    if (!c.hello) return;
    const w = this.world, s = c.snake && c.snake.alive ? c.snake : null;
    switch (m.t) {
      case 'eat': if (s && Array.isArray(m.ids)) w.eatIds(m.ids.filter(Number.isInteger).slice(0, 500), s); break;
      case 'drop':
        if (s && Array.isArray(m.f)) {
          for (const d of m.f.slice(0, 20)) {
            if (!Array.isArray(d) || !d.every(Number.isFinite)) continue;
            const [x, y, v, col] = d;
            if (x * x + y * y < R * R) w.addFood(x, y, Math.min(50, Math.max(0, v)), col | 0, 30);
          }
        }
        break;
      case 'fly': if (s && Number.isInteger(m.id)) w.claimFly(m.id, s); break;
      case 'die':
        if (s) {
          // where it crashed comes in the message itself: the last position on the fast channel may be stale or lost
          if (Array.isArray(m.at) && m.at.length === 3 && m.at.every(Number.isFinite) && m.at[2] > 0) {
            w.setRemote(s, m.at[0], m.at[1], s.a, s.ta, Math.min(m.at[2], 1e6), false, false);
          }
          const k = Number.isInteger(m.by) && m.by ? w.byId.get(m.by) : null;
          c.lastMass = s.mass;
          w.kill(s, k && k.alive && k !== s ? k : null);
          c.rvId = k ? k.id : 0;
          c.snake = null;
        }
        break;
      case 'respawn':
        if (!c.snake || !c.snake.alive) {
          const you = this.spawn(c, 3);
          this.updateBots();
          c.send({ t: 'you', ...you });
        }
        break;
      case 'leave': this.detach(c); c.conn.close(); break;
    }
  }
  // a player's own snake position (binary, no retransmits: old and foreign ones are ignored)
  self(c, dv) {
    if (!c.hello || dv.byteLength < SELF_LEN || dv.getUint8(0) !== 10) return;
    const s = c.snake;
    if (!s || !s.alive || dv.getUint32(1, true) !== s.id) return;
    const seq = dv.getUint16(5, true);
    if (c.seq >= 0 && ((seq - c.seq) & 0xffff) > 0x8000) return; // arrived after a newer one
    c.seq = seq;
    c.heard = performance.now();
    const x = dv.getInt16(7, true) / 4, y = dv.getInt16(9, true) / 4;
    const a = dv.getUint16(11, true) / 65535 * TAU, ta = dv.getUint16(13, true) / 65535 * TAU;
    const mass = dv.getFloat32(15, true), fl = dv.getUint8(19);
    if (![x, y, mass].every(Number.isFinite) || mass <= 0) return;
    this.world.setRemote(s, x, y, a, ta, Math.min(mass, 1e6), !!(fl & 1), !!(fl & 2), (fl >> 2) & 7);
  }
  join(c, m) {
    if (m.v !== VERSION) { c.conn.send({ t: 'err', code: 'version' }); return; }
    c.name = cleanName(m.name, this.playerName); c.skin = cleanSkin(m.skin);
    c.token = typeof m.token === 'string' ? m.token.slice(0, 40) : '';
    // reconnect: the same token is already in the room — take over its snake
    const old = c.token ? [...this.clients].find((x) => x.token === c.token) : null;
    if (!old && this.clients.size >= MAX_HUMANS) { c.conn.send({ t: 'err', code: 'full' }); return; }
    c.send = (o) => c.conn.send(o);
    c.hello = true;
    this.clients.add(c);
    let you = null;
    if (old) {
      this.clients.delete(old);
      c.kills = old.kills; c.lastMass = old.lastMass;
      if (old.snake && old.snake.alive) { c.snake = old.snake; c.snake.name = c.name; c.seq = -1; c.heard = performance.now(); }
      old.snake = null; old.hello = false;
      old.conn.close();
      if (c.snake) you = { id: c.snake.id, segs: flatSegs(c.snake), mass: c.snake.mass, inv: 0, team: c.snake.team };
    }
    if (!c.snake) you = this.spawn(c, 2);
    this.updateBots();
    const w = this.world;
    const vis = this.visibleTo(c);
    c.known = new Set(vis.map((s) => s.id));
    c.cells = this.cellsFor(c);
    c.send({ t: 'welcome', code: this.code, mode: this.mode, diff: this.diff, me: you, tick: this.tick,
      snakes: vis.map(metaOf), feast: feastOf(w) });
    c.conn.bin(allFood(w, c.cells));
    c.send(this.leaderboard());
  }
  detach(c) {
    this.conns.delete(c.conn);
    if (!this.clients.has(c)) return;
    if (c.snake && c.snake.alive) this.world.kill(c.snake, null);
    c.snake = null;
    this.clients.delete(c);
    this.updateBots();
  }
  // the host closed the room: tell everyone, including those who haven't said hello yet
  closeAll() { for (const conn of this.conns) conn.close(); this.conns.clear(); this.clients.clear(); }
  clientOf(snake) { for (const c of this.clients) if (c.snake === snake) return c; return null; }

  // ---------- step ----------
  step() {
    const w = this.world;
    const events = w.step(TICK);
    this.tick++;
    for (const e of events) {
      if (e.type === 'feast') { this.feast = feastOf(w); continue; }
      if (e.type === 'fly') { this.flies.push([Math.round(e.x), Math.round(e.y), e.c, e.by.id, Math.round(e.v)]); continue; }
      const v = e.victim, k = e.killer;
      if (v.human || (k && k.human)) {
        this.kills.push({ v: v.id, vn: v.name, vh: v.human, vm: Math.floor(e.vm), k: k ? k.id : 0, kn: k ? k.name : '', kh: !!(k && k.human), km: Math.floor(e.km) });
      }
      if (k && k.human) { const kc = this.clientOf(k); if (kc) { kc.kills++; if (kc.rvId === v.id) kc.rvId = 0; } }
      if (v.human) { const c = this.clientOf(v); if (c) { c.snake = null; c.lastMass = v.mass; } } // didn't leave on their own (left the room)
    }
    // the player minimized the game: the connection is alive but silent — the snake mustn't hang in the world like a frozen wall
    const now = performance.now();
    // the host itself stalled (tab minimized) — players' news didn't arrive through no fault of theirs
    if (this.stepAt && now - this.stepAt > 1000) for (const c of this.clients) c.heard = now;
    this.stepAt = now;
    if (this.tick % LB_EVERY === 0) {
      for (const c of this.clients) {
        if (!c.snake || !c.snake.alive || now - c.heard < SLEEP_MS) continue;
        c.lastMass = c.snake.mass;
        w.kill(c.snake, null);
        c.snake = null; c.rvId = 0;
        c.send({ t: 'slept' });
      }
    }
    const kills = this.kills, feast = this.feast, flyCaught = this.flies;
    this.kills = []; this.feast = null; this.flies = [];
    const food = this.foodChanges();
    const lb = this.tick % LB_EVERY === 0 ? this.leaderboard() : null;
    for (const c of this.clients) {
      if (kills.length) { c.kq.push(...kills); if (c.kq.length > 200) c.kq.splice(0, c.kq.length - 200); }
      // slow channel: don't let it pile up; once it drains, resend all the food around
      const buffered = c.conn.buffered();
      if (buffered > 256 * 1024) { c.lagging = true; continue; }
      if (c.lagging && buffered > 32 * 1024) continue;
      const vis = this.visibleTo(c);
      const myKills = c.kq;
      c.kq = [];
      if (c.lagging) {
        c.lagging = false;
        c.known = new Set(vis.map((s) => s.id));
        c.cells = this.cellsFor(c);
        c.send({ t: 'sync', snakes: vis.map(metaOf), feast: feastOf(w), kill: myKills });
        c.conn.bin(allFood(w, c.cells));
      } else {
        const cells = this.cellsFor(c);
        const out = [...c.cells].filter((k) => !cells.has(k)), into = [...cells].filter((k) => !c.cells.has(k));
        c.cells = cells;
        if (out.length || into.length) c.conn.bin(cellFood(w, out, into));
        const enter = [], known = new Set();
        for (const s of vis) { known.add(s.id); if (!c.known.has(s.id)) enter.push(metaOf(s)); }
        c.known = known;
        const [vx, vy] = this.viewCenter(c);
        const fly = flyCaught.filter((e) => (e[0] - vx) ** 2 + (e[1] - vy) ** 2 < AOI * AOI || (c.snake && e[3] === c.snake.id));
        if (enter.length || myKills.length || feast || fly.length) {
          const m = { t: 'ev' };
          if (enter.length) m.spawn = enter;
          if (myKills.length) m.kill = myKills;
          if (feast) m.feast = feast;
          if (fly.length) m.fly = fly;
          c.send(m);
        }
        const fp = foodPart(this.tick, food, c.cells);
        if (fp) c.conn.bin(fp);
      }
      c.conn.fast(snapshot(this.tick, vis, this.fliesNear(c)));
      if (lb) {
        c.send(lb);
        const st = { t: 'st', kills: c.kills };
        if (c.rvId) {
          const k = w.byId.get(c.rvId);
          if (k && k.alive) st.rv = [Math.round(k.x), Math.round(k.y)]; else { st.rv = 0; c.rvId = 0; }
        }
        c.send(st);
      }
    }
  }
  foodChanges() {
    const w = this.world;
    const gone = new Set(w.foodRemoved.map((f) => f.id));
    const added = w.foodAdded.filter((f) => !gone.has(f.id)).map((f) => [f, f.cell]);
    const addedIds = new Set(w.foodAdded.map((f) => f.id));
    const removed = w.foodRemoved.filter((f) => !addedIds.has(f.id)).map((f) => [f.id, f.cell]);
    w.foodAdded = []; w.foodRemoved = [];
    return { added, removed };
  }
}

// room clock: 40 steps per second; after a long pause (minimized tab) don't catch up
export function runRoom(room) {
  let lastT = performance.now(), acc = 0;
  const id = setInterval(() => {
    const now = performance.now();
    acc += (now - lastT) / 1000;
    lastT = now;
    let n = 0;
    while (acc >= TICK && n < 4) { acc -= TICK; n++; room.step(); }
    if (acc > TICK * 4) acc = 0;
  }, 1000 * TICK);
  return () => clearInterval(id);
}
