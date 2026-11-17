// Сервер игры: отдаёт статику из public/ и знакомит игроков (/ws). Саму совместную игру сервер не считает:
// мир ведёт браузер хозяина комнаты (public/room.js), а игроки связаны с ним напрямую (WebRTC, public/rtc.js).
// Здесь — только коды комнат и пересылка пары сообщений при входе (предложение, ответ, адреса).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptUpgrade } from './ws.js';

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const MAX_ROOMS = 200;
const MAX_CONN = 300;
const HOST_GONE_MS = 60_000;    // хозяин потерял связь с сайтом — код держим минуту, пока он не вернётся
const MSG_RATE = 40, MSG_BURST = 200; // сообщений в секунду на соединение (адресов при знакомстве бывает много)

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- статика ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
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
// code → { host: соединение хозяина или null, token, v, peers: id → соединение гостя, next, goneAt }
const rooms = new Map();
let conns = 0;

function newCode() {
  for (let i = 0; i < 200; i++) {
    const c = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    if (!rooms.has(c)) return c;
  }
  return null;
}
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (!r.host && now - r.goneAt > HOST_GONE_MS) { rooms.delete(code); log(`room ${code} closed, rooms=${rooms.size}`); }
  }
}, 5000).unref();

// ---------- соединения ----------
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws') || conns >= MAX_CONN) { socket.destroy(); return; }
  const ws = acceptUpgrade(req, socket, head, { maxPayload: 16 * 1024 });
  if (!ws) return;
  conns++;
  const c = { ws, room: null, code: '', id: -1, tokens: MSG_BURST, refilled: Date.now(), send: (o) => ws.sendText(JSON.stringify(o)) };
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
    const v = String(m.v || '').slice(0, 10);
    switch (m.t) {
      case 'host': {
        if (c.room) return;
        const token = typeof m.token === 'string' ? m.token.slice(0, 40) : '';
        let code = typeof m.code === 'string' ? m.code : '';
        let r = code && rooms.get(code);
        if (r && (r.token !== token || !token)) { r = null; code = ''; } // чужой код не забрать
        if (r) { // хозяин вернулся после обрыва
          if (r.host && r.host !== c) r.host.ws.close(1000);
          r.host = c; r.v = v;
        } else {
          if (rooms.size >= MAX_ROOMS) { c.send({ t: 'err', code: 'limit' }); return; }
          code = (code && !rooms.has(code) && /^\d{4}$/.test(code)) ? code : newCode();
          if (!code) { c.send({ t: 'err', code: 'limit' }); return; }
          r = { host: c, token, v, peers: new Map(), next: 1, goneAt: 0 };
          rooms.set(code, r);
          log(`room ${code} created, rooms=${rooms.size}`);
        }
        c.room = r; c.code = code; c.id = 0;
        c.send({ t: 'code', code });
        break;
      }
      case 'join': {
        if (c.room) return;
        const r = rooms.get(String(m.code));
        if (!r || !r.host) { c.send({ t: 'err', code: 'no_room' }); return; }
        if (v !== r.v) { c.send({ t: 'err', code: Number(v) > Number(r.v) ? 'old_host' : 'version' }); return; }
        if (r.peers.size >= 16) { c.send({ t: 'err', code: 'full' }); return; }
        c.room = r; c.code = String(m.code); c.id = r.next++;
        r.peers.set(c.id, c);
        r.host.send({ t: 'peer', id: c.id });
        c.send({ t: 'joined', id: c.id });
        break;
      }
      case 'sig': {
        const r = c.room;
        if (!r || !m.data || typeof m.data !== 'object') return;
        if (c.id === 0) { const p = r.peers.get(m.to); if (p) p.send({ t: 'sig', from: 0, data: m.data }); }
        else if (r.host) r.host.send({ t: 'sig', from: c.id, data: m.data });
        break;
      }
    }
  });
  ws.on('close', () => {
    conns--;
    clearInterval(keepalive);
    const r = c.room;
    if (!r) return;
    if (c.id === 0) { if (r.host === c) { r.host = null; r.goneAt = Date.now(); } }
    else r.peers.delete(c.id);
  });
});

server.listen(PORT, () => log(`snake-game on :${PORT}`));
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => { log(`${sig}, exit`); server.close(); process.exit(0); });
}
