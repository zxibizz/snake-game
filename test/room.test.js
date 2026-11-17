// The room run by the host's browser (public/room.js): tested without a network, on fake connections.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, encodeSelf, MAX_HUMANS } from '../public/room.js';
import { VERSION, SNAKES_N, Snake, followChain, spacingOf, STAGE_R } from '../public/core.js';

function conn() {
  const c = { json: [], bins: [], fasts: [], closed: false };
  c.send = (o) => c.json.push(JSON.parse(JSON.stringify(o)));
  c.bin = (u8) => c.bins.push(u8.slice());
  c.fast = (u8) => c.fasts.push(u8.slice());
  c.buffered = () => 0;
  c.close = () => { c.closed = true; };
  c.last = (t) => c.json.filter((m) => m.t === t).pop();
  return c;
}
function player(room, name, token) {
  const k = conn(), c = room.attach(k);
  room.message(c, { t: 'hello', name, skin: 2, token: token || name, v: VERSION });
  return { k, c, w: k.last('welcome') };
}
// where your own snake is: the way a client would send it
function sendSelf(room, p, x, y, mass, seq) {
  const s = new Snake(p.w.me.id, x, y, mass, 0, '', true, 0, 0);
  room.self(p.c, new DataView(encodeSelf(s, seq).buffer));
}

test('joining: welcome with your own snake, food and leaderboard; humans are subtracted from the bots', () => {
  const room = new Room({ code: '1234', mode: 'team', diff: 'easy' });
  const a = player(room, '<b>Dad</b>');
  assert.equal(a.w.code, '1234');
  assert.equal(a.w.mode, 'team');
  assert.ok(a.w.me.id > 0 && a.w.me.segs.length >= 2);
  assert.ok(!a.w.snakes.some((s) => s.id === a.w.me.id), 'players compute their own snake — it isn\'t sent with the world');
  assert.equal(room.world.byId.get(a.w.me.id).name, 'bDad/b');
  assert.equal(a.k.bins[0][0], 2, 'all the food around');
  assert.ok(a.k.last('lb'));
  player(room, 'Mom');
  assert.equal(room.world.targetBots, SNAKES_N - 2);
  room.step();
  assert.equal(a.k.fasts.at(-1)[0], 1, 'a snapshot goes without retransmits');
});

test('a different version and a full room', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const k = conn(), c = room.attach(k);
  room.message(c, { t: 'hello', name: 'x', v: '0' });
  assert.equal(k.last('err').code, 'version');
  for (let i = 0; i < MAX_HUMANS; i++) player(room, 'p' + i);
  const extra = player(room, 'extra');
  assert.equal(extra.k.last('err').code, 'full');
});

test('the world doesn\'t move a player\'s snake: it is where it was sent; an old update is ignored', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A');
  const s = room.world.byId.get(a.w.me.id);
  sendSelf(room, a, 100, 200, 77, 5);
  assert.equal(s.x, 100); assert.equal(s.y, 200); assert.ok(Math.abs(s.mass - 77) < 0.01);
  sendSelf(room, a, 900, 900, 10, 4); // arrived after a newer one
  assert.equal(s.x, 100);
  for (let i = 0; i < 20; i++) room.step();
  assert.equal(s.x, 100, 'a world step didn\'t move it');
  assert.ok(s.alive);
});

test('ate — the crumbs disappear for everyone; caught a butterfly — a fly event', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A');
  const w = room.world, s = w.byId.get(a.w.me.id);
  const ids = w.foods.slice(0, 5).map((f) => f.id);
  room.message(a.c, { t: 'eat', ids });
  room.step();
  assert.ok(!w.foods.some((f) => ids.includes(f.id)));
  const f = w.flies[0];
  f.x = s.x + 2000; f.y = s.y; // far away: the room doesn't check distance — cheaters aren't a concern
  room.message(a.c, { t: 'fly', id: f.id });
  assert.ok(!w.flies.includes(f));
  room.step();
  const ev = a.k.json.filter((m) => m.t === 'ev' && m.fly);
  assert.ok(ev.some((m) => m.fly.some((e) => e[3] === s.id)), 'the catcher gets their catch');
});

test('crashed into another snake: remains, a win for the one it hit; continue — a new snake', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A'), b = player(room, 'B');
  const w = room.world, sa = w.byId.get(a.w.me.id);
  const n0 = w.foods.length;
  room.message(a.c, { t: 'die', by: b.w.me.id });
  assert.ok(!sa.alive);
  assert.ok(w.foods.length > n0, 'remains');
  room.step();
  const kill = b.k.json.filter((m) => m.t === 'ev' && m.kill).flatMap((m) => m.kill);
  assert.ok(kill.some((k) => k.v === sa.id && k.k === b.w.me.id));
  room.message(a.c, { t: 'respawn' });
  const you = a.k.last('you');
  assert.ok(you && you.id !== sa.id && w.byId.get(you.id).alive);
});

test('a bot that crashes into a player\'s body loses — a win for the player', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A');
  const w = room.world;
  // the player's snake as a long wall across the bot's path
  const s = w.byId.get(a.w.me.id);
  s.inv = 0;
  const mass = 400;
  sendSelf(room, a, 0, 0, mass, 1);
  s.segs.forEach((q, i) => { q.x = 0; q.y = -300 + i * spacingOf(mass); });
  followChain(s.segs, spacingOf(mass));
  const bot = w.snakes.find((x) => !x.human);
  bot.segs.forEach((q, i) => { q.x = -60 - i * 4; q.y = 0; });
  bot.a = 0; bot.ta = 0; bot.inv = 0; bot.think = () => {};
  w.think = () => {};
  for (let i = 0; i < 40 && bot.alive; i++) room.step();
  assert.ok(!bot.alive, 'the bot crashed');
  assert.ok(s.alive, 'the player is alive — they decide about their own death');
  const kill = a.k.json.filter((m) => m.t === 'ev' && m.kill).flatMap((m) => m.kill);
  assert.ok(kill.some((k) => k.v === bot.id && k.k === s.id));
});

test('reconnecting with the same token — the same snake', () => {
  const room = new Room({ code: '1', mode: 'team', diff: 'easy' });
  const a = player(room, 'A', 'tok');
  const a2 = player(room, 'A', 'tok');
  assert.equal(a2.w.me.id, a.w.me.id);
  assert.ok(a.k.closed, 'the old connection is closed');
  assert.equal(room.clients.size, 1);
});

test('left — the snake disappears, there are more bots again', () => {
  const room = new Room({ code: '1', mode: 'team', diff: 'easy' });
  const a = player(room, 'A');
  room.detach(a.c);
  assert.ok(!room.world.byId.get(a.w.me.id) || !room.world.byId.get(a.w.me.id).alive);
  assert.equal(room.world.targetBots, SNAKES_N);
});

test('no news from a player for 3 s (game minimized) — the snake leaves the world, the player gets slept', async () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A');
  const s = room.world.byId.get(a.w.me.id);
  a.c.heard = performance.now() - 4000;
  room.stepAt = performance.now();
  for (let i = 0; i < 40; i++) room.step();
  assert.ok(!s.alive);
  assert.ok(a.k.last('slept'));
});

test('crashed: the remains are where die said', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A');
  const w = room.world, n0 = w.foods.length;
  room.message(a.c, { t: 'die', by: 0, at: [3000, -2000, 200] });
  const rem = w.foods.slice(n0);
  assert.ok(rem.length && rem.every((f) => Math.hypot(f.x - 3000, f.y + 2000) < 600));
});

test('a butterfly is caught by its 16-bit id from the snapshot', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A');
  const w = room.world, f = w.flies[0];
  f.id += 70000;
  room.message(a.c, { t: 'fly', id: f.id & 0xffff });
  assert.ok(!w.flies.includes(f));
});

test('the host closed the room — connections that haven\'t said hello are closed too', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A');
  const k = conn();
  room.attach(k);
  room.closeAll();
  assert.ok(a.k.closed && k.closed);
});

test('molting in a room: a player\'s stage comes from them, isn\'t lost and goes to others in the snapshot', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A'), b = player(room, 'B');
  const s = room.world.byId.get(a.w.me.id), bw = room.world.byId.get(b.w.me.id);
  const me = new Snake(a.w.me.id, 100, 100, 400, 0, '', true, 0, 0); // stage 2
  room.self(a.c, new DataView(encodeSelf(me, 1).buffer));
  assert.equal(s.stage, 2);
  const cheat = new Snake(b.w.me.id, 300, 100, 20, 0, '', true, 0, 0); cheat.stage = 5;
  room.self(b.c, new DataView(encodeSelf(cheat, 1).buffer));
  assert.equal(bw.stage, 0, 'a stage above what the length has reached isn\'t accepted');
  me.mass = 60; // slimmed down by boosting — the stage stays the same
  room.self(a.c, new DataView(encodeSelf(me, 2).buffer));
  assert.equal(s.stage, 2);
  sendSelf(room, b, 300, 100, 20, 1);
  room.step();
  const snap = new DataView(b.k.fasts.at(-1).buffer), n = snap.getUint16(5, true);
  let fl = -1;
  for (let i = 0, o = 7; i < n; i++, o += 17) if (snap.getUint32(o, true) === s.id) fl = snap.getUint8(o + 16);
  assert.ok(fl >= 0, 'snake A is visible to B');
  assert.equal((fl >> 2) & 7, 2);
  assert.equal(bw.stage, 0);
});

test('a guest without a name gets the host\'s fallback name, in the host\'s language', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy', playerName: 'Guest' });
  const a = player(room, '   ', 'tok');
  assert.equal(room.world.byId.get(a.w.me.id).name, 'Guest');
  assert.equal(new Room({ code: '2', mode: 'ffa', diff: 'easy' }).playerName, 'Player');
});
