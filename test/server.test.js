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
    const m = JSON.parse(e.data);
    const i = waiters.findIndex((w) => w.t === m.t);
    if (i >= 0) waiters.splice(i, 1)[0].res(m); else inbox.push(m);
  };
  const next = (t) => {
    const i = inbox.findIndex((m) => m.t === t);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((res, rej) => { waiters.push({ t, res }); setTimeout(() => rej(new Error(`нет ${t}`)), 3000); });
  };
  const opened = new Promise((res) => { ws.onopen = res; });
  const count = (t) => inbox.filter((m) => m.t === t).length;
  return { ws, next, opened, count, send: (o) => ws.send(JSON.stringify(o)) };
}

test('статика и healthz', async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Змейка/);
  const h = await (await fetch(`http://127.0.0.1:${PORT}/healthz`)).json();
  assert.equal(h.ok, true);
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/%2e%2e/package.json`)).status, 404);
});

async function hostRoom(token = 'tok-h', v = '7', code) {
  const h = client();
  await h.opened;
  h.send({ t: 'host', v, token, code });
  return [h, (await h.next('code')).code];
}

test('знакомство: хозяин получает код, гость входит, сообщения идут в обе стороны', async () => {
  const [h, code] = await hostRoom();
  assert.match(code, /^\d{4}$/);
  const g = client();
  await g.opened;
  g.send({ t: 'join', code, v: '7' });
  const j = await g.next('joined');
  const p = await h.next('peer');
  assert.equal(p.id, j.id);
  h.send({ t: 'sig', to: p.id, data: { sdp: { type: 'offer', sdp: 'x' } } });
  const s1 = await g.next('sig');
  assert.equal(s1.from, 0);
  assert.equal(s1.data.sdp.type, 'offer');
  g.send({ t: 'sig', to: 0, data: { c: { candidate: 'y' } } });
  const s2 = await h.next('sig');
  assert.equal(s2.from, j.id);
  assert.equal(s2.data.c.candidate, 'y');

  const g2 = client();
  await g2.opened;
  g2.send({ t: 'join', code: '99999', v: '7' });
  assert.equal((await g2.next('err')).code, 'no_room');
  for (const x of [h, g, g2]) x.ws.close();
});

test('разные версии: старому гостю — обновиться, старому хозяину — тоже', async () => {
  const [h, code] = await hostRoom('tok-v', '10');
  const g = client();
  await g.opened;
  g.send({ t: 'join', code, v: '9' });
  assert.equal((await g.next('err')).code, 'version');
  const g2 = client();
  await g2.opened;
  g2.send({ t: 'join', code, v: '11' });
  assert.equal((await g2.next('err')).code, 'old_host');
  for (const x of [h, g, g2]) x.ws.close();
});

test('хозяин после обрыва возвращает свой код, чужой токен его не заберёт', async () => {
  const [h, code] = await hostRoom('tok-r');
  h.ws.close();
  await new Promise((r) => setTimeout(r, 100));
  const g = client(); // хозяина нет на связи — войти нельзя
  await g.opened;
  g.send({ t: 'join', code, v: '7' });
  assert.equal((await g.next('err')).code, 'no_room');
  const [x, other] = await hostRoom('tok-x', '7', code);
  assert.notEqual(other, code, 'чужой код не отдают');
  const [h2, same] = await hostRoom('tok-r', '7', code);
  assert.equal(same, code);
  const g2 = client();
  await g2.opened;
  g2.send({ t: 'join', code, v: '7' });
  await g2.next('joined');
  await h2.next('peer');
  for (const c of [g, x, h2, g2]) c.ws.close();
});

test('поток сообщений режется по времени', async () => {
  const [h, code] = await hostRoom('tok-f');
  const g = client();
  await g.opened;
  g.send({ t: 'join', code, v: '7' });
  const { id } = await g.next('joined');
  for (let i = 0; i < 600; i++) h.send({ t: 'sig', to: id, data: { i } });
  await new Promise((r) => setTimeout(r, 400));
  const n = g.count('sig');
  assert.ok(n >= 150 && n < 400, `дошло ${n} из 600`);
  for (const x of [h, g]) x.ws.close();
});
