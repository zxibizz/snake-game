import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, Snake, countOf, spacingOf, SNAKES_N, DIFF, R, GOLD, SKINS, PAL, TITLES, titleOf,
  speedOf, turnOf, remainsOf, radiusOf, boostCostOf, BASE_SPEED, BOOST_SPEED, MIN_BOOST_MASS } from '../public/core.js';

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

test('при старте на арене все змеи и есть гиганты, тела внутри арены', () => {
  const w = new World({ diff: 'easy' });
  w.addHuman({ name: 'H', skin: 0 });
  assert.equal(w.snakes.length, SNAKES_N);
  const giants = w.snakes.filter((s) => s.mass >= DIFF.easy.giantMin).length;
  assert.ok(giants >= 2, `гигантов ${giants}`);
  for (const s of w.snakes) {
    for (const q of s.segs) assert.ok(Math.hypot(q.x, q.y) < R, `${s.name} вылез за край`);
  }
});

test('боты подрезают друг друга, ускоряются и держат число гигантов', () => {
  const w = new World({ diff: 'easy' });
  let botKills = 0, boosting = 0;
  for (let i = 0; i < 90 * 40; i++) {
    for (const e of w.step(1 / 40)) if (e.type === 'kill' && e.killer && !e.killer.human) botKills++;
    if (i % 40 === 0) boosting += w.snakes.filter((s) => s.isBoosting).length;
  }
  assert.ok(botKills >= 2, `побед ботов за 90 с: ${botKills}`);
  assert.ok(botKills <= 90, `арена спокойная, а не свалка: побед ботов за 90 с: ${botKills}`);
  assert.ok(boosting >= 30, `ускорялись ${boosting}`);
  const giants = w.snakes.filter((s) => s.mass >= DIFF.easy.giantMin).length;
  assert.ok(giants >= 2, `гигантов через 90 с: ${giants}`);
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
  assert.ok(Math.abs(drop.reduce((a, f) => a + f.v, 0) - remainsOf(300)) < 1);
});

test('звания по длине', () => {
  assert.equal(titleOf(0), 0);
  assert.equal(TITLES[titleOf(400)][1], 'Ужик');
  assert.equal(titleOf(1e9), TITLES.length - 1);
});

test('палитра влезает в байт, у раскрасок есть цвета', () => {
  assert.ok(PAL.length <= 256, `цветов ${PAL.length}: номер цвета еды уходит по сети одним байтом`);
  for (const sk of SKINS) {
    assert.ok(sk.p.length > 0 && sk.p.every((c) => PAL[c]), sk.name);
    assert.ok(PAL[sk.head], sk.name);
  }
});

test('чем выше звание, тем быстрее змейка, но ускорение малыша обгоняет гиганта', () => {
  assert.equal(speedOf(15, false), BASE_SPEED);
  assert.equal(speedOf(15, true), BOOST_SPEED);
  for (let i = 1; i < TITLES.length; i++) {
    assert.ok(speedOf(TITLES[i][0], false) > speedOf(TITLES[i][0] - 1, false), `ступень скорости на звании «${TITLES[i][1]}»`);
  }
  assert.ok(speedOf(15, true) > speedOf(1e6, false) * 1.3, 'гиганта можно обогнать на ускорении');
  assert.ok(speedOf(1e6, true) > speedOf(1e6, false) * 1.3);
});

test('останки: у малышей три четверти длины, у гигантов доля меньше', () => {
  assert.equal(remainsOf(40), 30);
  assert.ok(Math.abs(remainsOf(100) - 75) < 1e-9, 'без скачка на стыке');
  assert.ok(remainsOf(4000) / 4000 < 0.35);
  for (let m = 20; m < 20000; m *= 1.3) assert.ok(remainsOf(m * 1.3) > remainsOf(m), 'больше змея — больше останков');
});

test('толстая змейка поворачивает медленнее, но не замирает', () => {
  assert.ok(turnOf(radiusOf(15)) > 5);
  assert.ok(turnOf(radiusOf(15)) > turnOf(radiusOf(5000)));
  assert.ok(turnOf(radiusOf(20000)) > 2);
});

test('рывок дорогой: длина уходит тем быстрее, чем длиннее змейка, и без еды он не окупается', () => {
  for (const m0 of [100, 1000, 4000]) {
    const w = new World({ diff: 'easy', foodN: 0, bots: 0 });
    const s = w.addHuman({ name: 'H', skin: 0, mass: m0, inv: 999 });
    s.boost = true; // сразу после появления, пока тело свёрнуто в точку: свой сброс съесть нельзя
    for (let i = 0; i < 40; i++) w.step(1 / 40);
    const lost = m0 - s.mass;
    assert.ok(Math.abs(lost - boostCostOf(m0)) < boostCostOf(m0) * 0.05, `за секунду рывка ${lost.toFixed(1)} из ${m0}`);
    assert.ok(lost >= 10 && lost >= m0 * 0.02, `рывок слишком дешёвый: ${lost.toFixed(1)} из ${m0}`);
    const left = w.foods.reduce((a, f) => a + f.v, 0);
    assert.ok(left <= lost * 0.55, `позади остаётся не больше половины потраченного: ${left.toFixed(1)} из ${lost.toFixed(1)}`);
  }
});

test('малыш ускориться не может', () => {
  const w = new World({ diff: 'easy', foodN: 0, bots: 0 });
  const s = w.addHuman({ name: 'H', skin: 0, inv: 999 });
  assert.ok(s.mass < MIN_BOOST_MASS);
  s.boost = true;
  w.step(1 / 40);
  assert.equal(s.isBoosting, false);
});

test('игрок и новые боты выползают из точки, а при создании мира тела лежат целиком', () => {
  const w = new World({ diff: 'easy', foodN: 0 });
  const span = (s) => Math.hypot(s.segs[0].x - s.segs[s.segs.length - 1].x, s.segs[0].y - s.segs[s.segs.length - 1].y);
  assert.ok(w.snakes.filter((s) => s.mass > 500).every((s) => span(s) > 100), 'при создании мира тела уложены');
  const h = w.addHuman({ name: 'H', skin: 0, mass: 400, inv: 3 });
  assert.equal(h.segs.length, countOf(400));
  assert.equal(span(h), 0);
  for (let i = 0; i < 40; i++) w.step(1 / 40);
  const s1 = span(h);
  assert.ok(s1 > 100 && s1 < 300, `за секунду тело вытянулось на ${s1.toFixed(0)}`);
  let bot = null;
  for (let i = 0; i < 50 && !bot; i++) bot = w.spawnBot(false);
  assert.ok(bot);
  assert.equal(span(bot), 0);
});
