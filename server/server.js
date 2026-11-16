// Сервер игры: отдаёт статику из public/ и держит комнаты для совместной игры по WebSocket (/ws).
// Мир считает тот же public/core.js, что и одиночная игра в браузере.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptUpgrade } from './ws.js';
import { World, DIFF, SKINS, START_MASS, TAU, VERSION } from '../public/core.js';

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const TICK = 1 / 40;            // шагов мира в секунду: 40
const SEND_EVERY = 2;           // снимков в секунду: 20
const MAX_ROOMS = 20;
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
  const room = { code, mode, diff, world, clients: new Set(), tick: 0, emptySince: Date.now(), kills: [], joined: 0 };
  rooms.set(code, room);
  log(`room ${code} created: ${mode}/${diff}, rooms=${rooms.size}`);
  return room;
}
function updateBots(room) {
  room.world.targetBots = Math.max(6, DIFF[room.diff].bots - 2 * room.clients.size);
}
const flatSegs = (s) => {
  const out = new Array(s.segs.length * 2);
  s.segs.forEach((p, i) => { out[i * 2] = Math.round(p.x); out[i * 2 + 1] = Math.round(p.y); });
  return out;
};
const metaOf = (s) => ({ id: s.id, name: s.name, skin: s.skin, team: s.team, human: s.human, segs: flatSegs(s) });
// оставшаяся жизнь временной еды в секундах (0 — обычная еда, живёт всегда)
const lifeLeft = (f) => (f.life ? Math.max(1, Math.min(255, Math.ceil(f.life - f.age))) : 0);
const foodOf = (f) => [f.id, Math.round(f.x), Math.round(f.y), Math.round(f.v * 100) / 100, f.c, lifeLeft(f)];

function cleanName(n) {
  const s = String(n || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 12);
  return s || 'Игрок';
}
const cleanSkin = (k) => (Number.isInteger(k) && k >= 0 && k < SKINS.length ? k : 0);

function join(c, room) {
  // переподключение: тот же токен уже в комнате (старое соединение ещё не отвалилось) — забираем его змейку
  const old = c.token ? [...room.clients].find((x) => x.token === c.token) : null;
  if (!old && room.clients.size >= MAX_HUMANS) { c.send({ t: 'err', code: 'full' }); return; }
  c.room = room;
  room.clients.add(c);
  room.joined++;
  c.kills = 0;
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
      mass: Math.max(START_MASS, c.lastMass * 0.5), inv: 2 });
  }
  updateBots(room);
  const w = room.world;
  c.send({
    t: 'welcome', code: room.code, mode: room.mode, diff: room.diff, you: c.snake.id, tick: room.tick,
    snakes: w.snakes.filter((s) => s.alive).map(metaOf),
    foods: w.foods.filter((f) => !f.dead).map(foodOf),
  });
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

// ---------- снимок мира (бинарный) ----------
// u8 тип=1 | u32 тик | u16 змей × [u32 id, i16 x·4, i16 y·4, u16 угол, u16 взгляд, f32 масса, u8 флаги]
// | u16 новой еды × [u32 id, i16 x·4, i16 y·4, u16 ценность·100, u8 цвет, u8 временная] | u16 съеденной × u32 id
const q4 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 4)));
const qa = (a) => Math.round((((a % TAU) + TAU) % TAU) / TAU * 65535);
function buildSnapshot(room) {
  const w = room.world;
  const snakes = w.snakes.filter((s) => s.alive);
  const gone = new Set(w.foodRemoved);
  const added = w.foodAdded.filter((f) => !gone.has(f.id));
  const addedIds = new Set(w.foodAdded.map((f) => f.id));
  const removed = w.foodRemoved.filter((id) => !addedIds.has(id));
  const buf = Buffer.alloc(1 + 4 + 2 + snakes.length * 17 + 2 + added.length * 12 + 2 + removed.length * 4);
  let o = 0;
  o = buf.writeUInt8(1, o);
  o = buf.writeUInt32LE(room.tick, o);
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
  o = buf.writeUInt16LE(added.length, o);
  for (const f of added) {
    o = buf.writeUInt32LE(f.id, o);
    o = buf.writeInt16LE(q4(f.x), o);
    o = buf.writeInt16LE(q4(f.y), o);
    o = buf.writeUInt16LE(Math.min(65535, Math.round(f.v * 100)), o);
    o = buf.writeUInt8(f.c, o);
    o = buf.writeUInt8(lifeLeft(f), o);
  }
  o = buf.writeUInt16LE(removed.length, o);
  for (const id of removed) o = buf.writeUInt32LE(id, o);
  w.foodAdded = [];
  w.foodRemoved = [];
  return buf;
}

function stepRoom(room) {
  const w = room.world;
  const events = w.step(TICK);
  room.tick++;
  for (const e of events) {
    const v = e.victim, k = e.killer;
    if (v.human || (k && k.human)) {
      room.kills.push({ v: v.id, vn: v.name, vh: v.human, k: k ? k.id : 0, kn: k ? k.name : '', kh: !!(k && k.human) });
    }
    if (k && k.human) { const kc = clientOf(room, k); if (kc) kc.kills++; }
    if (v.human) {
      const c = clientOf(room, v);
      if (c) {
        c.snake = null;
        c.lastMass = v.mass;
        c.send({ t: 'dead', by: k ? k.name : null, mass: Math.floor(v.mass), max: Math.floor(v.maxMass), kills: c.kills });
      }
    }
  }
  if (room.tick % SEND_EVERY) return;
  if (w.spawned.length || room.kills.length) {
    const msg = JSON.stringify({ t: 'ev', spawn: w.spawned.filter((s) => s.alive).map(metaOf), kill: room.kills });
    for (const c of room.clients) c.ws.sendText(msg);
    w.spawned = [];
    room.kills = [];
  }
  const snap = buildSnapshot(room);
  for (const c of room.clients) {
    // медленный клиент пропускает снимки, а не копит очередь; когда догонит — получит всю еду заново,
    // иначе изменения еды из пропущенных снимков у него потеряются
    if (c.ws.buffered > 256 * 1024) { c.lagging = true; continue; }
    if (c.lagging) {
      if (c.ws.buffered > 32 * 1024) continue;
      c.lagging = false;
      c.send({ t: 'sync', snakes: w.snakes.filter((s) => s.alive).map(metaOf), foods: w.foods.filter((f) => !f.dead).map(foodOf) });
    }
    c.ws.sendBinary(snap);
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
            mass: Math.max(START_MASS, c.lastMass * 0.5), inv: 3,
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
