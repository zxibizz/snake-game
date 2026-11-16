import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 18000 + Math.floor(Math.random() * 1000);
let proc;
before(async () => {
  proc = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise((res) => proc.stdout.on('data', (d) => { if (String(d).includes(`:${PORT}`)) res(); }));
});
after(() => proc.kill());

function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  ws.binaryType = 'arraybuffer';
  const inbox = [];
  const waiters = [];
  ws.onmessage = (e) => {
    const m = typeof e.data === 'string' ? JSON.parse(e.data) : { t: 'snap', bytes: e.data.byteLength };
    const i = waiters.findIndex((w) => w.t === m.t);
    if (i >= 0) waiters.splice(i, 1)[0].res(m); else inbox.push(m);
  };
  const next = (t) => {
    const i = inbox.findIndex((m) => m.t === t);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((res, rej) => { waiters.push({ t, res }); setTimeout(() => rej(new Error(`нет ${t}`)), 3000); });
  };
  const opened = new Promise((res) => { ws.onopen = res; });
  return { ws, next, opened, send: (o) => ws.send(JSON.stringify(o)) };
}

test('статика и healthz', async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Змейград/);
  const h = await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).json();
  assert.equal(h.ok, true);
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/%2e%2e/package.json`)).status, 404);
});

test('создать комнату, войти вторым игроком, получать снимки', async () => {
  const a = client();
  await a.opened;
  a.send({ t: 'create', name: '<b>Папа</b>', skin: 3, mode: 'team', diff: 'easy' });
  const wa = await a.next('welcome');
  assert.match(wa.code, /^\d{4}$/);
  assert.equal(wa.mode, 'team');
  const meA = wa.snakes.find((s) => s.id === wa.you);
  assert.equal(meA.name, 'bПапа/b');

  const b = client();
  await b.opened;
  b.send({ t: 'join', code: wa.code, name: 'Мама', skin: 99 });
  const wb = await b.next('welcome');
  assert.equal(wb.code, wa.code);
  assert.ok(wb.snakes.some((s) => s.id === wa.you), 'второй видит первого');
  assert.equal(wb.snakes.find((s) => s.id === wb.you).skin, 0, 'неверный цвет заменён');
  const snap = await b.next('snap');
  assert.ok(snap.bytes > 7);
  b.send({ t: 'in', a: 1.2, b: 1 });

  const c = client();
  await c.opened;
  c.send({ t: 'join', code: '99999', name: 'x' });
  assert.equal((await c.next('err')).code, 'no_room');
  for (const x of [a, b, c]) x.ws.close();
});
