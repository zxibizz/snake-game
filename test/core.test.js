import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, Snake, countOf, spacingOf, SNAKES_N, DIFF, R, GOLD, SKINS, TITLES, titleOf } from '../public/core.js';

// змейка B лежит поперёк пути головы змейки A
function crossing(teamA, teamB) {
  const w = new World({ diff: 'easy', foodN: 0 });
  w.targetBots = 0;
  w.snakes = [];
  const a = w.addHuman({ name: 'A', skin: 0, team: teamA, inv: 0 });
  const b = w.addHuman({ name: 'B', skin: 1, team: teamB, inv: 0, mass: 60 });
  a.segs.forEach((p, i) => { p.x = -i * spacingOf(a.mass); p.y = 0; });
  a.a = a.ta = 0;
  b.segs.forEach((p, i) => { p.x = 20; p.y = -200 + i * spacingOf(b.mass); });
  b.a = b.ta = -Math.PI / 2;
  for (let i = 0; i < 20; i++) w.step(1 / 40);
  return { a, b };
}

test('в команде свои змейки проходят друг сквозь друга', () => {
  const { a, b } = crossing(1, 1);
  assert.ok(a.alive && b.alive);
});

test('все против всех: голова в чужом теле — проигрыш', () => {
  const { a, b } = crossing(0, 0);
  assert.equal(a.alive, false);
  assert.ok(b.alive);
});

test('мир живёт минуту без NaN и держит число ботов', () => {
  const w = new World({ diff: 'hard' });
  const h = w.addHuman({ name: 'H', skin: 0, inv: 999 });
  for (let i = 0; i < 60 * 40; i++) { h.ta += 0.01; w.step(1 / 40); }
  for (const s of w.snakes) {
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.mass), `NaN у ${s.name}`);
  }
  const bots = w.snakes.filter((s) => !s.human).length + w.respawnQueue.length;
  assert.ok(bots >= w.targetBots - 1, `ботов ${bots}, нужно ${w.targetBots}`);
});

test('длина тела растёт с массой', () => {
  assert.ok(countOf(200) > countOf(15));
  const s = new Snake(1, 0, 0, 50, 0, 'x', false, 0);
  assert.equal(s.segs.length, countOf(50));
});

test('версия в core.js и sw.js совпадает', async () => {
  const { readFile } = await import('node:fs/promises');
  const { VERSION } = await import('../public/core.js');
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], VERSION);
});

test('при старте на арене сотня змей и есть гиганты, тела внутри арены', () => {
  const w = new World({ diff: 'easy' });
  w.addHuman({ name: 'H', skin: 0 });
  assert.equal(w.snakes.length, SNAKES_N);
  const giants = w.snakes.filter((s) => s.mass >= DIFF.easy.giantMin).length;
  assert.ok(giants >= 4, `гигантов ${giants}`);
  for (const s of w.snakes) {
    for (const q of s.segs) assert.ok(Math.hypot(q.x, q.y) < R, `${s.name} вылез за край`);
  }
});

test('боты подрезают друг друга, ускоряются и держат число гигантов', () => {
  const w = new World({ diff: 'easy' });
  let botKills = 0, boosting = 0;
  for (let i = 0; i < 30 * 40; i++) {
    for (const e of w.step(1 / 40)) if (e.type === 'kill' && e.killer && !e.killer.human) botKills++;
    if (i % 40 === 0) boosting += w.snakes.filter((s) => s.isBoosting).length;
  }
  assert.ok(botKills >= 10, `побед ботов за 30 с: ${botKills}`);
  assert.ok(boosting >= 30, `ускорялись ${boosting}`);
  const giants = w.snakes.filter((s) => s.mass >= DIFF.easy.giantMin).length;
  assert.ok(giants >= 3, `гигантов через 30 с: ${giants}`);
});

test('пир: груда золотой еды и событие', () => {
  const w = new World({ diff: 'easy', foodN: 0 });
  const n0 = w.foods.length;
  w.spawnFeast();
  assert.ok(w.feast);
  assert.ok(w.foods.length - n0 >= 50);
  assert.ok(w.foods.filter((f) => f.c === GOLD).length >= 40);
  const ev = w.step(1 / 40);
  assert.ok(ev.some((e) => e.type === 'feast'));
});

test('останки змеи — в цветах её раскраски', () => {
  const w = new World({ diff: 'easy', foodN: 0, bots: 0 });
  const s = w.addHuman({ name: 'H', skin: 4, mass: 300, inv: 0 });
  const n0 = w.foods.length;
  w.kill(s, null);
  const cols = new Set(SKINS[4].p);
  const drop = w.foods.slice(n0);
  assert.ok(drop.length > 10);
  assert.ok(drop.every((f) => cols.has(f.c)));
  assert.ok(Math.abs(drop.reduce((a, f) => a + f.v, 0) - 300 * 0.75) < 1);
});

test('звания по длине', () => {
  assert.equal(titleOf(0), 0);
  assert.equal(TITLES[titleOf(400)][1], 'Ужик');
  assert.equal(titleOf(1e9), TITLES.length - 1);
});
