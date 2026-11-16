// Комната, которую ведёт браузер хозяина (public/room.js): проверяем без сети, на поддельных соединениях.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room, encodeSelf, MAX_HUMANS } from '../public/room.js';
import { VERSION, SNAKES_N, Snake, followChain, spacingOf } from '../public/core.js';

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
// где своя змейка: как её прислал бы клиент
function sendSelf(room, p, x, y, mass, seq) {
  const s = new Snake(p.w.me.id, x, y, mass, 0, '', true, 0, 0);
  room.self(p.c, new DataView(encodeSelf(s, seq).buffer));
}

test('вход: welcome со своей змейкой, едой и таблицей; людей вычитают из ботов', () => {
  const room = new Room({ code: '1234', mode: 'team', diff: 'easy' });
  const a = player(room, '<b>Папа</b>');
  assert.equal(a.w.code, '1234');
  assert.equal(a.w.mode, 'team');
  assert.ok(a.w.me.id > 0 && a.w.me.segs.length >= 2);
  assert.ok(!a.w.snakes.some((s) => s.id === a.w.me.id), 'свою змейку игрок считает сам — в мире её не шлём');
  assert.equal(room.world.byId.get(a.w.me.id).name, 'bПапа/b');
  assert.equal(a.k.bins[0][0], 2, 'вся еда вокруг');
  assert.ok(a.k.last('lb'));
  player(room, 'Мама');
  assert.equal(room.world.targetBots, SNAKES_N - 2);
  room.step();
  assert.equal(a.k.fasts.at(-1)[0], 1, 'снимок — без повторов');
});

test('чужая версия и полная комната', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const k = conn(), c = room.attach(k);
  room.message(c, { t: 'hello', name: 'x', v: '0' });
  assert.equal(k.last('err').code, 'version');
  for (let i = 0; i < MAX_HUMANS; i++) player(room, 'p' + i);
  const extra = player(room, 'лишний');
  assert.equal(extra.k.last('err').code, 'full');
});

test('змейку игрока мир не двигает: она там, куда её прислали; старый снимок — мимо', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A');
  const s = room.world.byId.get(a.w.me.id);
  sendSelf(room, a, 100, 200, 77, 5);
  assert.equal(s.x, 100); assert.equal(s.y, 200); assert.ok(Math.abs(s.mass - 77) < 0.01);
  sendSelf(room, a, 900, 900, 10, 4); // пришёл позже нового
  assert.equal(s.x, 100);
  for (let i = 0; i < 20; i++) room.step();
  assert.equal(s.x, 100, 'шаг мира её не сдвинул');
  assert.ok(s.alive);
});

test('съела — крошки пропадают у всех; поймала бабочку — событие fly', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A');
  const w = room.world, s = w.byId.get(a.w.me.id);
  const ids = w.foods.slice(0, 5).map((f) => f.id);
  room.message(a.c, { t: 'eat', ids });
  room.step();
  assert.ok(!w.foods.some((f) => ids.includes(f.id)));
  const f = w.flies[0];
  f.x = s.x + 2000; f.y = s.y; // далеко: проверку расстояния комната не делает — читеров не боимся
  room.message(a.c, { t: 'fly', id: f.id });
  assert.ok(!w.flies.includes(f));
  room.step();
  const ev = a.k.json.filter((m) => m.t === 'ev' && m.fly);
  assert.ok(ev.some((m) => m.fly.some((e) => e[3] === s.id)), 'поймавшему — его поимка');
});

test('разбилась о чужую змейку: останки, победа тому, в кого врезалась; продолжить — новая змейка', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A'), b = player(room, 'B');
  const w = room.world, sa = w.byId.get(a.w.me.id);
  const n0 = w.foods.length;
  room.message(a.c, { t: 'die', by: b.w.me.id });
  assert.ok(!sa.alive);
  assert.ok(w.foods.length > n0, 'останки');
  room.step();
  const kill = b.k.json.filter((m) => m.t === 'ev' && m.kill).flatMap((m) => m.kill);
  assert.ok(kill.some((k) => k.v === sa.id && k.k === b.w.me.id));
  room.message(a.c, { t: 'respawn' });
  const you = a.k.last('you');
  assert.ok(you && you.id !== sa.id && w.byId.get(you.id).alive);
});

test('бот, врезавшийся в тело игрока, проигрывает — победа игроку', () => {
  const room = new Room({ code: '1', mode: 'ffa', diff: 'easy' });
  const a = player(room, 'A');
  const w = room.world;
  // змейка игрока длинной стеной поперёк пути бота
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
  assert.ok(!bot.alive, 'бот разбился');
  assert.ok(s.alive, 'игрок жив — о своей смерти он решает сам');
  const kill = a.k.json.filter((m) => m.t === 'ev' && m.kill).flatMap((m) => m.kill);
  assert.ok(kill.some((k) => k.v === bot.id && k.k === s.id));
});

test('переподключение с тем же токеном — та же змейка', () => {
  const room = new Room({ code: '1', mode: 'team', diff: 'easy' });
  const a = player(room, 'A', 'tok');
  const a2 = player(room, 'A', 'tok');
  assert.equal(a2.w.me.id, a.w.me.id);
  assert.ok(a.k.closed, 'старое соединение закрыто');
  assert.equal(room.clients.size, 1);
});

test('ушёл — змейка пропадает, ботов снова больше', () => {
  const room = new Room({ code: '1', mode: 'team', diff: 'easy' });
  const a = player(room, 'A');
  room.detach(a.c);
  assert.ok(!room.world.byId.get(a.w.me.id) || !room.world.byId.get(a.w.me.id).alive);
  assert.equal(room.world.targetBots, SNAKES_N);
});
