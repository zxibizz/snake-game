import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, Snake, countOf, spacingOf } from '../public/core.js';

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
