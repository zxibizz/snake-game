import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { VERSION } from '../public/core.js';

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
    const m = typeof e.data === 'string' ? JSON.parse(e.data)
      : { t: new Uint8Array(e.data)[0] === 2 ? 'food' : 'snap', bytes: e.data.byteLength, n: new DataView(e.data).getUint16(5, true) };
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
  a.send({ t: 'create', name: '<b>Папа</b>', skin: 3, mode: 'team', diff: 'easy', v: VERSION });
  const wa = await a.next('welcome');
  assert.match(wa.code, /^\d{4}$/);
  assert.equal(wa.mode, 'team');
  const meA = wa.snakes.find((s) => s.id === wa.you);
  assert.equal(meA.name, 'bПапа/b');

  const b = client();
  await b.opened;
  b.send({ t: 'join', code: wa.code, name: 'Мама', skin: 99, v: VERSION });
  const wb = await b.next('welcome');
  assert.equal(wb.code, wa.code);
  assert.ok(wb.snakes.some((s) => s.id === wa.you), 'второй видит первого');
  assert.equal(wb.snakes.find((s) => s.id === wb.you).skin, 0, 'неверный цвет заменён');
  const snap = await b.next('snap');
  assert.ok(snap.bytes > 7);
  b.send({ t: 'in', a: 1.2, b: 1 });

  const c = client();
  await c.opened;
  c.send({ t: 'join', code: '99999', name: 'x', v: VERSION });
  assert.equal((await c.next('err')).code, 'no_room');
  for (const x of [a, b, c]) x.ws.close();
});

test('старый клиент получает err version', async () => {
  const a = client();
  await a.opened;
  a.send({ t: 'create', name: 'x', v: '0' });
  assert.equal((await a.next('err')).code, 'version');
  a.ws.close();
});

test('сложность constructor не принимается', async () => {
  const a = client();
  await a.opened;
  a.send({ t: 'create', name: 'x', diff: 'constructor', v: VERSION });
  assert.equal((await a.next('welcome')).diff, 'easy');
  a.ws.close();
});

test('переподключение с тем же токеном забирает ту же змейку', async () => {
  const a = client();
  await a.opened;
  a.send({ t: 'create', name: 'A', v: VERSION, token: 'tok-a' });
  const wa = await a.next('welcome');
  const b = client(); // второй игрок держит комнату открытой
  await b.opened;
  b.send({ t: 'join', code: wa.code, name: 'B', v: VERSION, token: 'tok-b' });
  await b.next('welcome');
  const a2 = client(); // старое соединение a ещё живо — как при смене Wi-Fi на LTE
  await a2.opened;
  a2.send({ t: 'join', code: wa.code, name: 'A', v: VERSION, token: 'tok-a' });
  const wa2 = await a2.next('welcome');
  assert.equal(wa2.you, wa.you, 'та же змейка');
  assert.equal(wa2.snakes.filter((s) => s.human).length, 2, 'без дубля');
  for (const x of [a, b, a2]) x.ws.close();
});

test('поток сообщений режется по времени', async () => {
  const a = client();
  await a.opened;
  for (let i = 0; i < 300; i++) a.send({ t: 'ping', at: i });
  let pongs = 0;
  try { for (;;) { await Promise.race([a.next('pong'), new Promise((_, rej) => setTimeout(rej, 300))]); pongs++; } } catch { /* тишина */ }
  assert.ok(pongs >= 50 && pongs < 120, `ответов ${pongs}`);
  a.ws.close();
});

test('игрок видит только змей рядом, таблица — по всей арене', async () => {
  const a = client();
  await a.opened;
  a.send({ t: 'create', name: 'A', mode: 'ffa', diff: 'easy', v: VERSION });
  const wa = await a.next('welcome');
  assert.ok(wa.snakes.length < 100, `в поле зрения ${wa.snakes.length} из 100`);
  assert.ok(wa.snakes.some((s) => s.id === wa.you), 'себя видно');
  const food = await a.next('food');
  assert.ok(food.bytes > 5 + 12 * 1000, 'вся еда пришла одним бинарным сообщением');
  const lb = await a.next('lb');
  assert.equal(lb.n, 100);
  assert.equal(lb.top.length, 10);
  assert.equal(lb.mm.length, 300);
  assert.ok(lb.top[0][2] >= lb.top[9][2]);
  const snap = await a.next('snap');
  assert.ok(snap.n <= wa.snakes.length + 5, `в снимке ${snap.n} змей`);
  a.ws.close();
});
