// Сервер игры: отдаёт статику из public/ и держит комнаты для совместной игры по WebSocket (/ws).
// Мир считает тот же public/core.js, что и одиночная игра в браузере.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptUpgrade } from './ws.js';
import { World, R, DIFF, SKINS, SNAKES_N, TAU, VERSION, FOOD_CELL, FOOD_CELLS, FLY_MAX, keepMass } from '../public/core.js';

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const TICK = 1 / 40;            // шагов мира в секунду: 40
const SEND_EVERY = 2;           // снимков в секунду: 20
const LB_EVERY = 40;            // таблица лидеров и мини-карта: раз в секунду
const MAX_ROOMS = 8;            // комната — сотня змей, около 5 % ядра
const MAX_HUMANS = 8;
const MAX_CONN = 120;
const ROOM_IDLE_MS = 60_000;    // пустая комната живёт минуту — на случай переподключения
const MAX_CREATES = 5;          // комнат на одно соединение
const MSG_RATE = 30, MSG_BURST = 60; // сообщений в секунду на соединение
const TEAM = 1;

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- статика ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); res.end(); return; }
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, conns }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); res.end(); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(PUBLIC, '.' + p);
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(404); res.end(); return; }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
});

// ---------- комнаты ----------
const rooms = new Map();
let conns = 0;

function newCode() {
  for (let i = 0; i < 200; i++) {
    const c = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    if (!rooms.has(c)) return c;
  }
  return null;
}
function createRoom(mode, diff) {
  const code = newCode();
  if (!code) return null;
  const world = new World({ diff });
  world.track = true;
  const room = { code, mode, diff, world, clients: new Set(), tick: 0, emptySince: Date.now(), kills: [], feast: null, flies: [], joined: 0 };
  rooms.set(code, room);
  log(`room ${code} created: ${mode}/${diff}, rooms=${rooms.size}`);
  return room;
}
function updateBots(room) {
  room.world.targetBots = SNAKES_N - room.clients.size;
}
const flatSegs = (s) => {
  const out = new Array(s.segs.length * 2);
  s.segs.forEach((p, i) => { out[i * 2] = Math.round(p.x); out[i * 2 + 1] = Math.round(p.y); });
  return out;
};
const metaOf = (s) => ({ id: s.id, name: s.name, skin: s.skin, team: s.team, human: s.human, segs: flatSegs(s) });
// оставшаяся жизнь временной еды в секундах (0 — обычная еда, живёт всегда)
const lifeLeft = (f) => (f.life ? Math.max(1, Math.min(255, Math.ceil(f.life - f.age))) : 0);
const feastOf = (w) => (w.feast ? { x: Math.round(w.feast.x), y: Math.round(w.feast.y), life: Math.max(1, Math.round(w.feast.until - w.time)) } : null);

function cleanName(n) {
  const s = String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 12);
  return s || 'Игрок';
}
const cleanSkin = (k) => (Number.isInteger(k) && k >= 0 && k < SKINS.length ? k : 0);

// ---------- кого видит игрок ----------
// Змей на арене десятки, а на экране — единицы: каждому игроку шлём только тех, у кого хоть часть тела
// ближе AOI к его голове; уходит из вида с запасом HYST, чтобы не мигала. Еду — только из клеток вокруг игрока.
const AOI = 2300, HYST = 500, FOOD_AOI = 2600;
function viewCenter(c) {
  if (c.snake && c.snake.alive) { c.cx = c.snake.x; c.cy = c.snake.y; }
  return [c.cx, c.cy];
}
function visibleTo(c, w) {
  const [cx, cy] = viewCenter(c);
  const out = [];
  for (const s of w.snakes) {
    if (!s.alive) continue;
    if (s === c.snake) { out.push(s); continue; }
    const lim = AOI + (c.known.has(s.id) ? HYST : 0), lim2 = lim * lim;
    const segs = s.segs, step = Math.max(1, Math.floor(lim / (s.r * 0.42) / 6)); // шаг выборки — ~1/6 радиуса
    for (let k = 0; k < segs.length; k += step) {
      const dx = segs[k].x - cx, dy = segs[k].y - cy;
      if (dx * dx + dy * dy < lim2) { out.push(s); break; }
    }
  }
  return out;
}
function cellsFor(c) {
  const [cx, cy] = viewCenter(c);
  const out = new Set();
  for (let gy = 0; gy < FOOD_CELLS; gy++) {
    const y0 = gy * FOOD_CELL - R, ny = Math.max(y0, Math.min(cy, y0 + FOOD_CELL));
    for (let gx = 0; gx < FOOD_CELLS; gx++) {
      const x0 = gx * FOOD_CELL - R, nx = Math.max(x0, Math.min(cx, x0 + FOOD_CELL));
      if ((nx - cx) ** 2 + (ny - cy) ** 2 < FOOD_AOI * FOOD_AOI) out.add(gy * FOOD_CELLS + gx);
    }
  }
  return out;
}

// ---------- бинарные сообщения ----------
// Снимок: u8 тип=1 | u32 тик | u16 змей × [u32 id, i16 x·4, i16 y·4, u16 угол, u16 взгляд, f32 масса, u8 флаги]
//   | u16 новой еды × FOOD_REC | u16 съеденной × u32 id
// Вся еда вокруг (после входа и после догонялки): u8 тип=2 | u32 штук × FOOD_REC
// Клетки еды сменились: u8 тип=3 | u8 ушло × u8 клетка | u8 пришло × u8 клетка | u32 штук × FOOD_REC
// FOOD_REC (13 байт): u8 клетка, u32 id, i16 x·4, i16 y·4, u16 ценность·100, u8 цвет, u8 сколько секунд ещё лежит (0 — всегда)
// После еды в снимке — бабочки рядом: u8 штук × FLY_REC
// FLY_REC (16 байт): u16 id, i16 x·4, i16 y·4, u16 курс, u16 собрано·100, u8 флаги (1 — увёртывается), 5 × u8 цвет крошек (255 — нет)
const FR = 13, FLR = 16;
const q4 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 4)));
const qa = (a) => Math.round((((a % TAU) + TAU) % TAU) / TAU * 65535);
function writeFood(buf, o, f) {
  o = buf.writeUInt8(f.cell, o);
  o = buf.writeUInt32LE(f.id, o);
  o = buf.writeInt16LE(q4(f.x), o);
  o = buf.writeInt16LE(q4(f.y), o);
  o = buf.writeUInt16LE(Math.min(65535, Math.round(f.v * 100)), o);
  o = buf.writeUInt8(f.c, o);
  return buf.writeUInt8(lifeLeft(f), o);
}
const foodIn = (w, cells) => w.foods.filter((f) => !f.dead && cells.has(f.cell));
function allFood(w, cells) {
  const foods = foodIn(w, cells);
  const buf = Buffer.alloc(5 + foods.length * FR);
  let o = buf.writeUInt8(2, 0);
  o = buf.writeUInt32LE(foods.length, o);
  for (const f of foods) o = writeFood(buf, o, f);
  return buf;
}
function cellFood(w, leave, enter) {
  const foods = foodIn(w, new Set(enter));
  const buf = Buffer.alloc(1 + 1 + leave.length + 1 + enter.length + 4 + foods.length * FR);
  let o = buf.writeUInt8(3, 0);
  o = buf.writeUInt8(leave.length, o);
  for (const k of leave) o = buf.writeUInt8(k, o);
  o = buf.writeUInt8(enter.length, o);
  for (const k of enter) o = buf.writeUInt8(k, o);
  o = buf.writeUInt32LE(foods.length, o);
  for (const f of foods) o = writeFood(buf, o, f);
  return buf;
}
// изменения еды с прошлого снимка: общий список на комнату, каждому — из его клеток
function foodChanges(w) {
  const gone = new Set(w.foodRemoved.map((f) => f.id));
  const added = w.foodAdded.filter((f) => !gone.has(f.id)).map((f) => [f, f.cell]);
  const addedIds = new Set(w.foodAdded.map((f) => f.id));
  const removed = w.foodRemoved.filter((f) => !addedIds.has(f.id)).map((f) => [f.id, f.cell]);
  w.foodAdded = [];
  w.foodRemoved = [];
  return { added, removed };
}
function foodPart(ch, cells) {
  const added = ch.added.filter(([, k]) => cells.has(k)).slice(0, 65535);
  const removed = ch.removed.filter(([, k]) => cells.has(k)).slice(0, 65535);
  const buf = Buffer.alloc(2 + added.length * FR + 2 + removed.length * 4);
  let o = buf.writeUInt16LE(added.length, 0);
  for (const [f] of added) o = writeFood(buf, o, f);
  o = buf.writeUInt16LE(removed.length, o);
  for (const [id] of removed) o = buf.writeUInt32LE(id, o);
  return buf;
}
// бабочки рядом с игроком
function flyPart(w, c) {
  const [cx, cy] = viewCenter(c), lim2 = (AOI + 300) ** 2;
  const flies = w.flies.filter((f) => (f.x - cx) ** 2 + (f.y - cy) ** 2 < lim2).slice(0, 255);
  const buf = Buffer.alloc(1 + flies.length * FLR);
  let o = buf.writeUInt8(flies.length, 0);
  for (const f of flies) {
    o = buf.writeUInt16LE(f.id & 0xffff, o);
    o = buf.writeInt16LE(q4(f.x), o);
    o = buf.writeInt16LE(q4(f.y), o);
    o = buf.writeUInt16LE(qa(f.dir), o);
    o = buf.writeUInt16LE(Math.round(Math.min(f.n, FLY_MAX) * 100), o);
    o = buf.writeUInt8(f.dart > 0 ? 1 : 0, o);
    for (let i = 0; i < 5; i++) o = buf.writeUInt8(i < f.top.length ? f.top[i] : 255, o);
  }
  return buf;
}
function snakePart(tick, snakes) {
  const buf = Buffer.alloc(7 + snakes.length * 17);
  let o = buf.writeUInt8(1, 0);
  o = buf.writeUInt32LE(tick, o);
  o = buf.writeUInt16LE(snakes.length, o);
  for (const s of snakes) {
    o = buf.writeUInt32LE(s.id, o);
    o = buf.writeInt16LE(q4(s.x), o);
    o = buf.writeInt16LE(q4(s.y), o);
    o = buf.writeUInt16LE(qa(s.a), o);
    o = buf.writeUInt16LE(qa(s.ta), o);
    o = buf.writeFloatLE(s.mass, o);
    o = buf.writeUInt8((s.isBoosting ? 1 : 0) | (s.inv > 0 ? 2 : 0), o);
  }
  return buf;
}
// таблица лидеров и мини-карта: раз в секунду, одна на комнату
function leaderboard(room) {
  const w = room.world;
  const list = w.snakes.filter((s) => s.alive).sort((a, b) => b.mass - a.mass);
  const mm = [];
  for (const s of list) mm.push(Math.round(s.x / 25), Math.round(s.y / 25), Math.floor(s.mass));
  return {
    t: 'lb', n: list.length,
    top: list.slice(0, 10).map((s) => [s.id, s.name, Math.floor(s.mass), s.human ? 1 : 0, s.team]),
    hum: list.filter((s) => s.human).map((s) => [s.id, s.name, Math.round(s.x), Math.round(s.y), Math.floor(s.mass), s.team]),
    mm,
  };
}

function join(c, room) {
  // переподключение: тот же токен уже в комнате (старое соединение ещё не отвалилось) — забираем его змейку
  const old = c.token ? [...room.clients].find((x) => x.token === c.token) : null;
  if (!old && room.clients.size >= MAX_HUMANS) { c.send({ t: 'err', code: 'full' }); return; }
  c.room = room;
  room.clients.add(c);
  room.joined++;
  c.kills = 0; c.lastMass = 0; // в новой комнате — с начала; длину из прошлой не переносим
  if (old) {
    room.clients.delete(old);
    old.room = null;
    c.kills = old.kills; c.lastMass = old.lastMass;
    if (old.snake && old.snake.alive) { c.snake = old.snake; old.snake.name = c.name; }
    old.snake = null;
    old.ws.close(1000);
  }
  if (!c.snake) {
    c.snake = room.world.addHuman({ name: c.name, skin: c.skin, team: room.mode === 'team' ? TEAM : 0,
      mass: keepMass(room.diff, c.lastMass), inv: 2 });
  }
  updateBots(room);
  const w = room.world;
  c.known = new Set();
  const vis = visibleTo(c, w);
  for (const s of vis) c.known.add(s.id);
  c.cells = cellsFor(c);
  c.send({
    t: 'welcome', code: room.code, mode: room.mode, diff: room.diff, you: c.snake.id, tick: room.tick,
    snakes: vis.map(metaOf), feast: feastOf(w),
  });
  c.ws.sendBinary(allFood(w, c.cells));
  c.send(leaderboard(room));
  log(`room ${room.code}: ${old ? 'rejoin' : 'join'}, players=${room.clients.size}`);
}
function leave(c) {
  const room = c.room;
  if (!room) return;
  if (c.snake && c.snake.alive) room.world.kill(c.snake, null);
  c.snake = null;
  room.clients.delete(c);
  c.room = null;
  updateBots(room);
  log(`room ${room.code}: leave, players=${room.clients.size}`);
  if (room.clients.size) return;
  room.emptySince = Date.now();
  if (room.joined <= 1) { rooms.delete(room.code); log(`room ${room.code} closed (creator left), rooms=${rooms.size}`); }
}
const clientOf = (room, snake) => [...room.clients].find((c) => c.snake === snake);

function stepRoom(room) {
  const w = room.world;
  const events = w.step(TICK);
  room.tick++;
  for (const e of events) {
    if (e.type === 'feast') { room.feast = feastOf(w); continue; }
    if (e.type === 'fly') { room.flies.push([Math.round(e.x), Math.round(e.y), e.c, e.by.id, Math.round(e.v)]); continue; }
    const v = e.victim, k = e.killer;
    if (v.human || (k && k.human)) {
      room.kills.push({ v: v.id, vn: v.name, vh: v.human, vm: Math.floor(e.vm), k: k ? k.id : 0, kn: k ? k.name : '', kh: !!(k && k.human), km: Math.floor(e.km) });
    }
    if (k && k.human) { const kc = clientOf(room, k); if (kc) { kc.kills++; if (kc.rvId === v.id) kc.rvId = 0; } }
    if (v.human) {
      const c = clientOf(room, v);
      if (c) {
        c.snake = null;
        c.lastMass = v.mass;
        c.rvId = k ? k.id : 0; // обидчик: клиент обводит его красным и ждёт rv = 0, когда его не станет
        c.send({ t: 'dead', by: k ? k.name : null, byId: k ? k.id : 0, mass: Math.floor(v.mass), max: Math.floor(v.maxMass), kills: c.kills, eaten: Math.floor(v.eaten) });
      }
    }
  }
  if (room.tick % SEND_EVERY) return;
  const kills = room.kills, feast = room.feast, flyCaught = room.flies;
  room.kills = []; room.feast = null; room.flies = [];
  const food = foodChanges(w);
  const lb = room.tick % LB_EVERY === 0 ? JSON.stringify(leaderboard(room)) : null;
  for (const c of room.clients) {
    // медленный клиент пропускает снимки, а не копит очередь; когда догонит — получит всю еду заново,
    // иначе изменения еды из пропущенных снимков у него потеряются
    // победы копим, пока клиент отстаёт: иначе он не узнает о своей победе
    if (kills.length) { c.kq.push(...kills); if (c.kq.length > 200) c.kq.splice(0, c.kq.length - 200); }
    if (c.ws.buffered > 256 * 1024) { c.lagging = true; continue; }
    if (c.lagging && c.ws.buffered > 32 * 1024) continue;
    const vis = visibleTo(c, w);
    const myKills = c.kq;
    c.kq = [];
    if (c.lagging) {
      c.lagging = false;
      c.known = new Set(vis.map((s) => s.id));
      c.cells = cellsFor(c);
      c.send({ t: 'sync', snakes: vis.map(metaOf), feast: feastOf(w), kill: myKills });
      c.ws.sendBinary(allFood(w, c.cells));
    } else {
      const cells = cellsFor(c);
      const out = [...c.cells].filter((k) => !cells.has(k)), into = [...cells].filter((k) => !c.cells.has(k));
      c.cells = cells;
      if (out.length || into.length) c.ws.sendBinary(cellFood(w, out, into));
      const enter = [];
      const known = new Set();
      for (const s of vis) { known.add(s.id); if (!c.known.has(s.id)) enter.push(metaOf(s)); }
      c.known = known;
      // пойманные бабочки — тем, кто рядом (вспышка), и тому, кто поймал (звёзды)
      const [vx, vy] = viewCenter(c);
      const fly = flyCaught.filter((e) => (e[0] - vx) ** 2 + (e[1] - vy) ** 2 < AOI * AOI || (c.snake && e[3] === c.snake.id));
      if (enter.length || myKills.length || feast || fly.length) {
        const m = { t: 'ev' };
        if (enter.length) m.spawn = enter;
        if (myKills.length) m.kill = myKills;
        if (feast) m.feast = feast;
        if (fly.length) m.fly = fly;
        c.send(m);
      }
    }
    c.ws.sendBinary(Buffer.concat([snakePart(room.tick, vis), foodPart(food, c.cells), flyPart(w, c)]));
    if (lb) {
      c.ws.sendText(lb);
      const st = { t: 'st', eaten: c.snake && c.snake.alive ? Math.floor(c.snake.eaten) : 0, kills: c.kills };
      if (c.rvId) {
        const k = w.byId.get(c.rvId);
        if (k && k.alive) st.rv = [Math.round(k.x), Math.round(k.y)]; else { st.rv = 0; c.rvId = 0; }
      }
      if (c.snake && c.snake.alive || 'rv' in st) c.send(st);
    }
  }
}

let lastT = performance.now(), acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += (now - lastT) / 1000;
  lastT = now;
  let n = 0;
  while (acc >= TICK && n < 4) {
    acc -= TICK; n++;
    for (const room of rooms.values()) stepRoom(room);
  }
  if (acc > TICK * 4) acc = 0; // после долгой паузы не догоняем
}, 1000 * TICK);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.clients.size && now - room.emptySince > ROOM_IDLE_MS) { rooms.delete(code); log(`room ${code} closed, rooms=${rooms.size}`); }
  }
}, 5000);

// ---------- соединения ----------
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws') || conns >= MAX_CONN) { socket.destroy(); return; }
  const ws = acceptUpgrade(req, socket, head, { maxPayload: 1024 });
  if (!ws) return;
  conns++;
  const c = {
    ws, room: null, snake: null, name: 'Игрок', skin: 0, kills: 0, lastMass: 0, token: '', creates: 0, lagging: false,
    known: new Set(), cells: new Set(), cx: 0, cy: 0, rvId: 0, kq: [],
    tokens: MSG_BURST, refilled: Date.now(),
    send: (o) => ws.sendText(JSON.stringify(o)),
  };
  // общее для create и join: имя, цвет, токен сессии, версия клиента
  const hello = (m) => {
    c.name = cleanName(m.name); c.skin = cleanSkin(m.skin);
    c.token = typeof m.token === 'string' ? m.token.slice(0, 40) : '';
    if (m.v !== VERSION) { c.send({ t: 'err', code: 'version' }); return false; }
    return true;
  };
  const keepalive = setInterval(() => {
    if (Date.now() - ws.lastSeen > 45_000) ws.close(1001); else ws.ping();
  }, 15_000);
  ws.on('message', (txt) => {
    const now = Date.now();
    c.tokens = Math.min(MSG_BURST, c.tokens + (now - c.refilled) / 1000 * MSG_RATE);
    c.refilled = now;
    if (c.tokens < 1) return;
    c.tokens -= 1;
    let m;
    try { m = JSON.parse(txt); } catch { return; }
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'in':
        if (c.snake && c.snake.alive) {
          if (typeof m.a === 'number' && Number.isFinite(m.a)) c.snake.ta = m.a;
          c.snake.boost = !!m.b;
        }
        break;
      case 'create': {
        if (c.room || !hello(m)) return;
        if (rooms.size >= MAX_ROOMS || c.creates >= MAX_CREATES) { c.send({ t: 'err', code: 'limit' }); return; }
        c.creates++;
        const room = createRoom(m.mode === 'ffa' ? 'ffa' : 'team', Object.hasOwn(DIFF, m.diff) ? m.diff : 'easy');
        if (!room) { c.send({ t: 'err', code: 'limit' }); return; }
        join(c, room);
        break;
      }
      case 'join': {
        if (c.room || !hello(m)) return;
        const room = rooms.get(String(m.code));
        if (!room) { c.send({ t: 'err', code: 'no_room' }); return; }
        join(c, room);
        break;
      }
      case 'respawn':
        if (c.room && !c.snake) {
          c.snake = c.room.world.addHuman({
            name: c.name, skin: c.skin, team: c.room.mode === 'team' ? TEAM : 0,
            mass: keepMass(c.room.diff, c.lastMass), inv: 3,
          });
          c.send({ t: 'you', id: c.snake.id });
        }
        break;
      case 'leave':
        leave(c);
        break;
      case 'ping':
        c.send({ t: 'pong', at: m.at });
        break;
      default:
    }
  });
  ws.on('close', () => {
    clearInterval(keepalive);
    leave(c);
    conns--;
  });
});

server.listen(PORT, () => log(`snake-game on :${PORT}`));
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { log(`${sig}, exit`); server.close(); process.exit(0); });
}
