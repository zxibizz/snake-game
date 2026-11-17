import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, Snake, safeCourse, rand, countOf, spacingOf, SNAKES_N, DIFF, R, GOLD, SKINS, PAL, STAGES, STAGE_R, MOLT_T, MOLT_WAIT, stageOf, growStage,
  speedOf, turnOf, remainsOf, radiusOf, boostCostOf, BASE_SPEED, BOOST_SPEED, MIN_BOOST_MASS, layBody, angDiff, keepMass, START_MASS,
  FLY_N, FLY_MAX, FLY_BASE, flyRadius, flyEase, flyGain, SKIN_NEAR, skinDist, TYPES, SKINS_OF, stickyRank, RANK_HOLD, RANK_HOLD_MIN, carefulOf, SPAWN_BELOW } from '../public/core.js';

// snake B lies across the path of snake A's head
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

test('in a team, teammates pass through each other', () => {
  const { a, b } = crossing(1, 1);
  assert.ok(a.alive && b.alive);
});

test('free for all: head into another body — a crash', () => {
  const { a, b } = crossing(0, 0);
  assert.equal(a.alive, false);
  assert.ok(b.alive);
});

test('the world lives for a minute without NaN and keeps the number of bots', () => {
  const w = new World({ diff: 'hard' });
  const h = w.addHuman({ name: 'H', skin: 0, inv: 999 });
  for (let i = 0; i < 60 * 40; i++) { h.ta += 0.01; w.step(1 / 40); }
  for (const s of w.snakes) {
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.mass), `NaN at ${s.name}`);
  }
  const bots = w.snakes.filter((s) => !s.human).length + w.respawnQueue.length;
  assert.ok(bots >= w.targetBots - 1, `bots ${bots}, need ${w.targetBots}`);
});

test('body length grows with mass', () => {
  assert.ok(countOf(200) > countOf(15));
  const s = new Snake(1, 0, 0, 50, 0, 'x', false, 0);
  assert.equal(s.segs.length, countOf(50));
});

test('the version in core.js and sw.js matches', async () => {
  const { readFile } = await import('node:fs/promises');
  const { VERSION } = await import('../public/core.js');
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.equal(sw.match(/const VERSION = '([^']+)'/)[1], VERSION);
});

test('at the start all snakes are in the arena, there are giants, bodies are inside the arena', () => {
  const w = new World({ diff: 'easy' });
  w.addHuman({ name: 'H', skin: 0 });
  assert.equal(w.snakes.length, SNAKES_N);
  const giants = w.snakes.filter((s) => s.mass >= DIFF.easy.giantMin).length;
  assert.ok(giants >= 2, `giants ${giants}`);
  for (const s of w.snakes) {
    for (const q of s.segs) assert.ok(Math.hypot(q.x, q.y) < R, `${s.name} went past the edge`);
  }
});

test('bots cut each other off, boost and keep the number of giants', () => {
  const w = new World({ diff: 'easy' });
  let botKills = 0, boosting = 0;
  for (let i = 0; i < 90 * 40; i++) {
    for (const e of w.step(1 / 40)) if (e.type === 'kill' && e.killer && !e.killer.human) botKills++;
    if (i % 40 === 0) boosting += w.snakes.filter((s) => s.isBoosting).length;
  }
  assert.ok(botKills >= 2, `bot wins in 90 s: ${botKills}`);
  // on easy chaos is intended (feud, slip), but the arena doesn't die out: giants remain (below)
  assert.ok(botKills <= 180, `not a total massacre: bot wins in 90 s: ${botKills}`);
  assert.ok(boosting >= 30, `boosted ${boosting}`);
  const giants = w.snakes.filter((s) => s.mass >= DIFF.easy.giantMin).length;
  assert.ok(giants >= 2, `giants after 90 s: ${giants}`);
});

test('feast: a heap of golden food and an event', () => {
  const w = new World({ diff: 'easy', foodN: 0 });
  const n0 = w.foods.length;
  w.spawnFeast();
  assert.ok(w.feast);
  assert.ok(w.foods.length - n0 >= 50);
  assert.ok(w.foods.filter((f) => f.c === GOLD).length >= 40);
  const ev = w.step(1 / 40);
  assert.ok(ev.some((e) => e.type === 'feast'));
});

test('a snake\'s remains are in its skin\'s colors', () => {
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

test('molts: stage by length, never lost during a life, thickness grows over MOLT_T', () => {
  assert.equal(stageOf(0), 0);
  assert.equal(stageOf(99), 0);
  assert.equal(stageOf(100), 1);
  assert.equal(stageOf(1e9), STAGES.length - 1);
  assert.equal(STAGES.length, STAGE_R.length);
  for (let i = 1; i < STAGE_R.length; i++) assert.ok(STAGE_R[i] > STAGE_R[i - 1] * 1.15, 'each molt is noticeably thicker');
  const s = new Snake(1, 0, 0, 90, 0, 't', true);
  assert.equal(s.stage, 0); assert.equal(s.r, STAGE_R[0]);
  s.mass = 120; growStage(s, 0.01);
  assert.equal(s.stage, 1);
  assert.equal(s.r, STAGE_R[0], 'first the glow — the thickness is still the old one');
  for (let t = 0; t < MOLT_WAIT + 0.1; t += 0.025) growStage(s, 0.025);
  assert.ok(s.r > STAGE_R[0] && s.r < STAGE_R[1], 'the thickness grows, not in a jump');
  for (let t = 0; t < MOLT_WAIT + MOLT_T + 0.05; t += 0.025) growStage(s, 0.025);
  assert.equal(s.r, STAGE_R[1]);
  const j = new Snake(3, 0, 0, 90, 0, 'j', true);
  j.mass = 400; // skipped a stage — grows over the same time
  for (let t = 0; t < MOLT_WAIT + MOLT_T + 0.05; t += 0.025) growStage(j, 0.025);
  assert.equal(j.stage, 2); assert.equal(j.r, STAGE_R[2]);
  s.mass = 40; growStage(s, 0.025);
  assert.equal(s.stage, 1, 'slimmed down by boosting — same stage');
  assert.equal(s.r, STAGE_R[1]);
  assert.equal(new Snake(2, 0, 0, 1000, 0, 'u', true).stage, 3, 'a new life — by length');
});

test('molting in the world: a snake that ate up to the threshold gets thicker', () => {
  const w = new World({ diff: 'easy', bots: 0, foodN: 0, flies: 0 });
  const me = w.addHuman({ name: 't', skin: 0, mass: 95, inv: 9 });
  assert.equal(me.stage, 0);
  me.mass = 101;
  for (let i = 0; i < 60; i++) w.step(0.025);
  assert.equal(me.stage, 1);
  assert.equal(me.r, STAGE_R[1]);
});

test('the palette fits in a byte, skins have colors', () => {
  assert.ok(PAL.length <= 256, `${PAL.length} colors: a food color index travels over the network as one byte`);
  for (const sk of SKINS) {
    assert.ok(sk.p.length > 0 && sk.p.every((c) => PAL[c]), sk.id);
    assert.ok(PAL[sk.head], sk.id);
  }
});

test('the higher the stage, the faster the snake, but a boosting little one outruns a giant', () => {
  assert.equal(speedOf(15, false), BASE_SPEED);
  assert.equal(speedOf(15, true), BOOST_SPEED);
  for (let i = 1; i < STAGES.length; i++) {
    assert.ok(speedOf(STAGES[i], false) > speedOf(STAGES[i] - 1, false), `speed step at ${STAGES[i]}`);
  }
  assert.ok(speedOf(15, true) > speedOf(1e6, false) * 1.3, 'a giant can be outrun while boosting');
  assert.ok(speedOf(1e6, true) > speedOf(1e6, false) * 1.3);
});

test('remains: three quarters of the length for little ones, a smaller share for giants', () => {
  assert.equal(remainsOf(40), 30);
  assert.ok(Math.abs(remainsOf(100) - 75) < 1e-9, 'no jump at the seam');
  assert.ok(remainsOf(1000) / 1000 < 0.33);
  assert.ok(remainsOf(4000) / 4000 < 0.2, 'you can\'t feast off a giant');
  for (let m = 20; m < 20000; m *= 1.3) assert.ok(remainsOf(m * 1.3) > remainsOf(m), 'a bigger snake — more remains');
});

test('a thick snake turns slower but doesn\'t freeze', () => {
  assert.ok(turnOf(radiusOf(15)) > 5);
  assert.ok(turnOf(radiusOf(15)) > turnOf(radiusOf(5000)));
  assert.ok(turnOf(radiusOf(20000)) > 2);
});

test('boosting is expensive: length goes faster the longer the snake, and it doesn\'t pay off without food', () => {
  for (const m0 of [100, 1000, 4000]) {
    const w = new World({ diff: 'easy', foodN: 0, bots: 0 });
    const s = w.addHuman({ name: 'H', skin: 0, mass: m0, inv: 999 });
    s.boost = true; // right after spawning, while the body is coiled into a point: you can't eat your own drop
    for (let i = 0; i < 40; i++) w.step(1 / 40);
    const lost = m0 - s.mass;
    assert.ok(Math.abs(lost - boostCostOf(m0)) < boostCostOf(m0) * 0.05, `in a second of boosting ${lost.toFixed(1)} of ${m0}`);
    assert.ok(lost >= 10 && lost >= m0 * 0.05 * 0.95, `a second of boosting burns 5% of the length, but ${lost.toFixed(1)} of ${m0} burned`);
    const left = w.foods.reduce((a, f) => a + f.v, 0);
    assert.ok(left <= lost * 0.55, `no more than half of what was spent is left behind: ${left.toFixed(1)} of ${lost.toFixed(1)}`);
  }
});

test('a little one can\'t boost', () => {
  const w = new World({ diff: 'easy', foodN: 0, bots: 0 });
  const s = w.addHuman({ name: 'H', skin: 0, inv: 999 });
  assert.ok(s.mass < MIN_BOOST_MASS);
  s.boost = true;
  w.step(1 / 40);
  assert.equal(s.isBoosting, false);
});

test('the player and new bots crawl out of a point, while at world creation bodies lie whole', () => {
  const w = new World({ diff: 'easy', foodN: 0 });
  const span = (s) => Math.hypot(s.segs[0].x - s.segs[s.segs.length - 1].x, s.segs[0].y - s.segs[s.segs.length - 1].y);
  assert.ok(w.snakes.filter((s) => s.mass > 500).every((s) => span(s) > 100), 'at world creation bodies are laid out');
  const h = w.addHuman({ name: 'H', skin: 0, mass: 400, inv: 3 });
  assert.equal(h.segs.length, countOf(400));
  assert.equal(span(h), 0);
  for (let i = 0; i < 40; i++) w.step(1 / 40);
  const s1 = span(h);
  assert.ok(s1 > 100 && s1 < 300, `in a second the body stretched to ${s1.toFixed(0)}`);
  let bot = null;
  for (let i = 0; i < 50 && !bot; i++) bot = w.spawnBot(false);
  assert.ok(bot);
  assert.equal(span(bot), 0);
});

// empty arena: a bot and a player with bodies laid straight back from the head
function duel(diff, bot, human) {
  const w = new World({ diff, foodN: 0, bots: 0, flies: 0 }); // butterflies would distract the bot from what we're testing
  w.D = { ...DIFF[diff], slip: 0, ...(bot.D || {}) }; // no random "lapses": the scene must be the same every time
  const mk = (o, isHuman) => {
    const s = new Snake(w.nextSnakeId++, o.x, o.y, o.mass, 0, isHuman ? 'H' : 'B', isHuman, 0, o.a, layBody(o.x, o.y, o.a, o.mass, 0, 0, 0));
    s.age = 30; s.inv = 0; s.huntCd = 99; s.pers = 1; s.cau = 1;
    return w.addSnake(s);
  };
  const b = mk(bot, false), h = mk(human, true);
  w.buildGrids();
  return { w, b, h };
}

test('a bot notices its path being cut and moves away along the other path', () => {
  for (const wary of [0, 1]) {
    const { w, b } = duel('hard', { x: 0, y: 0, a: 0, mass: 300, D: { wary } }, { x: 220, y: -150, a: Math.PI / 2, mass: 300 });
    w.think(b, 0);
    const turn = Math.abs(angDiff(b.ta, 0));
    if (wary) assert.ok(turn > 0.8, `didn't turn away: ${turn.toFixed(2)}`);
    else assert.ok(turn < 0.4, `didn't notice — goes straight: ${turn.toFixed(2)}`);
  }
});

test('ambush: the player crawls across the bot\'s body — the bot doesn\'t turn to food; no ambush on a small one', () => {
  for (const [aggr, mass, ambush] of [[0, 320, false], [5, 320, true], [5, 100, false]]) {
    const { w, b } = duel('hard', { x: 0, y: 0, a: 0, mass: 400, D: { aggr } }, { x: 250, y: -300, a: Math.PI / 2, mass });
    w.addFood(60, 250, 20, 0, 0);
    w.buildGrids();
    w.think(b, 0);
    if (ambush) assert.ok(Math.abs(angDiff(b.ta, 0)) < 0.2, `left the ambush: ${b.ta.toFixed(2)}`);
    else assert.ok(angDiff(b.ta, 0) > 0.6, `no ambush — to the food (aggr ${aggr}, player ${mass}): ${b.ta.toFixed(2)}`);
  }
});

test('a big bot doesn\'t hunt someone 30% or more shorter, and drops such a target', () => {
  for (const [mass, ok] of [[100, false], [300, false], [320, true], [2000, true]]) {
    const { w, b, h } = duel('hard', { x: 0, y: 0, a: 0, mass: 400, D: { humanAggr: [9, 9, 9] } }, { x: 300, y: 100, a: 0, mass });
    assert.equal(w.pickTarget(b) === h, ok, `player ${mass} vs bot 400`);
  }
  const { w, b, h } = duel('hard', { x: 0, y: 0, a: 0, mass: 400 }, { x: 300, y: 100, a: 0, mass: 350 });
  w.startHunt(b, h);
  h.mass = 250;
  w.think(b, 0);
  assert.equal(b.hunt, 0, 'the target slimmed down — the hunt is dropped');
});

test('bot anger grows with the player\'s place: on easy no hunting below 20th place, in the top 20 — yes', () => {
  const w = new World({ diff: 'easy', foodN: 0, bots: 0 });
  const h = w.addHuman({ name: 'H', skin: 0 });
  h.rank = 35; assert.equal(w.heatOf(h).p, 0);
  h.rank = 20; const at20 = w.heatOf(h); assert.ok(at20.p > 0.2 && at20.n === 1, `20th place: ${at20.p}`);
  h.rank = 1; const top = w.heatOf(h); assert.ok(top.p > at20.p && top.n === 2, `first place: ${top.p}, hunters ${top.n}`);
  for (const d of ['easy', 'medium', 'hard']) {
    const D = DIFF[d];
    assert.ok(D.humanAggr[0] <= D.humanAggr[1] && D.humanAggr[1] <= D.humanAggr[2], d);
  }
  assert.ok(DIFF.easy.humanAggr[2] < DIFF.medium.humanAggr[2] && DIFF.medium.humanAggr[2] < DIFF.hard.humanAggr[2]);
  // the place is computed on every step
  const w2 = new World({ diff: 'hard', foodN: 0 });
  const p = w2.addHuman({ name: 'P', skin: 0, mass: 1e6, inv: 0 });
  w2.step(1 / 40);
  assert.equal(p.rank, 1);
});

test('after "Continue" 80% of the length remains on easy, 40% on medium, on hard — from the start', () => {
  assert.equal(keepMass('easy', 1000), 800);
  assert.equal(keepMass('medium', 1000), 400);
  assert.equal(keepMass('hard', 1000), START_MASS);
  assert.equal(keepMass('easy', 10), START_MASS);
});

test('hunting: two come in from different sides, near the edge — from the center side', () => {
  const { w, b, h } = duel('hard', { x: 0, y: 200, a: 0, mass: 400 }, { x: 300, y: 0, a: 0, mass: 100 });
  const b2 = w.addSnake(new Snake(w.nextSnakeId++, 0, 260, 400, 0, 'B2', false, 0, 0, layBody(0, 260, 0, 400, 0, 0, 0)));
  w.startHunt(b, h);
  w.startHunt(b2, h);
  assert.notEqual(b.hside, 0);
  assert.equal(b2.hside, -b.hside);

  const e = duel('hard', { x: R * 0.6, y: 0, a: 0, mass: 400 }, { x: R * 0.8, y: 0, a: -Math.PI / 2, mass: 100 });
  e.w.startHunt(e.b, e.h);
  const ps = Math.sin(e.h.a), pc = Math.cos(e.h.a);
  const px = e.h.x - ps * e.b.hside * 100, py = e.h.y + pc * e.b.hside * 100; // the point the bot approaches from the side
  assert.ok(Math.hypot(px, py) < Math.hypot(e.h.x, e.h.y), 'near the edge the bot approaches from the center side');
});

test('a bot gathers to fresh remains from afar', () => {
  const { w, b } = duel('hard', { x: 0, y: 0, a: -Math.PI / 2, mass: 300 }, { x: -3000, y: 3000, a: 0, mass: 50 });
  // the remains lie vertically 1000 to the right — farther than the bot sees food, so only the smell of remains can turn it
  const v = w.addSnake(new Snake(w.nextSnakeId++, 1000, -400, 300, 0, 'V', false, 0, -Math.PI / 2, layBody(1000, -400, -Math.PI / 2, 300, 0, 0, 0)));
  w.kill(v, null);
  w.snakes = w.snakes.filter((s) => s.alive);
  w.decide = () => true; // the bot decided to go
  w.buildGrids();
  w.think(b, w.snakes.indexOf(b));
  assert.ok(Math.abs(angDiff(b.ta, 0)) < 1, `didn't turn to the remains: ${b.ta.toFixed(2)}`);
});

// an empty world with one butterfly: no bots and no other butterflies
function flyWorld() {
  const w = new World({ diff: 'easy', foodN: 0, bots: 0, flies: 0 });
  const f = w.spawnFly(false);
  f.x = 0; f.y = 0; f.vx = f.vy = 0; f.n = 0; f.cnt = new Map(); f.top = [];
  return { w, f };
}

test('butterflies: FLY_N at the start, some already fed; collected no more than FLY_MAX', () => {
  const w = new World({ diff: 'easy' });
  assert.equal(w.flies.length, FLY_N);
  assert.ok(w.flies.some((f) => f.n > 10));
  assert.ok(w.flies.every((f) => f.n <= FLY_MAX && f.top.length <= 5));
});

test('a butterfly finds food by itself, eats it and grows; crumbs are the color of what it ate', () => {
  const { w, f } = flyWorld();
  for (let i = 0; i < 12; i++) w.addFood(150 + i * 12, 40, 2, 4, 0);
  for (let i = 0; i < 6; i++) w.addFood(150, 60 + i * 12, 2, 8, 0);
  for (let i = 0; i < 40 * 8; i++) w.step(1 / 40);
  assert.ok(f.n >= 20, `collected ${f.n}`);
  assert.equal(f.top[0], 4);
  assert.ok(flyRadius(f.n) > flyRadius(0));
});

test('a butterfly doesn\'t fly through a snake\'s body', () => {
  const { w, f } = flyWorld();
  const s = w.addHuman({ name: 'H', skin: 0, mass: 400, inv: 0 });
  const lay = () => s.segs.forEach((p, k) => { p.x = 600 - k * 14; p.y = 200; }); // the body lies across, from x=600 far to the left
  lay();
  assert.ok(s.segs[s.segs.length - 1].x < -300);
  s.a = s.ta = 0;
  f.x = -100; f.y = 0; f.gx = -100; f.gy = 400; f.gT = 99; // the butterfly wants to go down, through the body
  for (let i = 0; i < 40 * 3; i++) {
    lay();                  // the body stays in place
    w.step(1 / 40);
    f.gx = f.x; f.gy = 400; f.gT = 99;
  }
  assert.ok(f.y < 200, `the butterfly ended up on the other side of the body: y=${f.y.toFixed(0)}`);
});

test('a butterfly dodges sideways from a head that faces it', () => {
  const { w, f } = flyWorld();
  const s = w.addHuman({ name: 'H', skin: 0, mass: 100, inv: 0 });
  s.segs.forEach((p, i) => { p.x = -200 - i * 5; p.y = 0; });
  s.a = s.ta = 0;
  w.step(1 / 40);
  assert.ok(f.dart > 0, 'didn\'t dodge');
  assert.ok(Math.abs(f.vy) > Math.abs(f.vx) * 1.5, 'the dodge must be across the snake\'s course');
});

test('a head catches a butterfly: what it collected spills out as food in the crumbs\' colors, a new one arrives', () => {
  const { w, f } = flyWorld();
  for (let i = 0; i < 40; i++) w.flyEat(f, 1, 6);
  f.cool = 99; // won't dodge
  const s = w.addHuman({ name: 'H', skin: 0, mass: 100, inv: 0 });
  s.segs.forEach((p, i) => { p.x = -i * 5; p.y = 0; });
  s.ta = s.a = 0;
  const n0 = w.foods.length;
  const ev = w.step(1 / 40);
  assert.equal(w.flies.length, 0);
  const e = ev.find((x) => x.type === 'fly');
  assert.ok(e && e.by === s && Math.abs(e.v - (FLY_BASE + 40)) < 1e-6);
  const drop = w.foods.slice(n0);
  assert.ok(drop.every((q) => q.c === 6));
  assert.ok(Math.abs(drop.reduce((a, q) => a + q.v, 0) - (FLY_BASE + 40)) < 1e-6);
  for (let i = 0; i < 40 * 11; i++) w.step(1 / 40);
  assert.equal(w.flies.length, 1);
});

test('butterflies by stage: easier for a little player to catch, twice the food for big ones', () => {
  assert.equal(flyEase({ human: true, mass: 15 }), 1);
  assert.equal(flyEase({ human: true, mass: 900 }), 0);
  assert.equal(flyEase({ human: false, mass: 15 }), 0, 'no break for bots');
  assert.equal(flyGain(300), 1);
  assert.equal(flyGain(2000), 2);
  const { w, f } = flyWorld();
  for (let i = 0; i < 40; i++) w.flyEat(f, 1, 6);
  f.cool = 99;
  const s = w.addHuman({ name: 'H', skin: 0, mass: 2000, inv: 0 });
  s.segs.forEach((p, i) => { p.x = -i * 5; p.y = 0; });
  s.ta = s.a = 0;
  const n0 = w.foods.length;
  const e = w.step(1 / 40).find((x) => x.type === 'fly');
  assert.ok(e && Math.abs(e.v - 2 * (FLY_BASE + 40)) < 1e-6);
  assert.ok(Math.abs(w.foods.slice(n0).reduce((a, q) => a + q.v, 0) - 2 * (FLY_BASE + 40)) < 1e-6);
});

test('an almost full butterfly doesn\'t eat beyond capacity, and a snake that crashed in this step doesn\'t catch it', () => {
  const { w, f } = flyWorld();
  for (let i = 0; i < FLY_MAX - 2; i++) w.flyEat(f, 1, 3);
  for (let i = 0; i < 4; i++) w.addFood(rand0(i), 0, 5, 3, 0);
  w.buildGrids(); w.stepFlies(1 / 40);
  assert.equal(f.n, FLY_MAX);
  assert.ok(w.foods.filter((q) => !q.dead).length >= 2, 'the excess food must stay on the field');
  // the snake is already in the list of crashed ones — it doesn't catch the butterfly
  const s = w.addHuman({ name: 'H', skin: 0, mass: 100, inv: 0 });
  s.segs.forEach((p, i) => { p.x = -i * 5; p.y = 0; });
  f.cool = 99; w.pending.push([s, null]);
  w.buildGrids(); w.stepFlies(1 / 40);
  assert.equal(w.flies.length, 1);
});
function rand0(i) { return [0, 3, -3, 6][i]; }

test('similar skins: pairs that get confused are near; dissimilar ones aren\'t', () => {
  const ix = (n) => SKINS.findIndex((s) => s.id === n);
  assert.ok(SKIN_NEAR[ix('pastel')].includes(ix('icecream')));
  assert.ok(SKIN_NEAR[ix('rainbow')].includes(ix('tutti')));
  assert.ok(!SKIN_NEAR[ix('ocean')].includes(ix('autumn')));
  SKINS.forEach((_, i) => { assert.ok(SKIN_NEAR[i].includes(i)); assert.equal(skinDist(i, i), 0); });
  // every skin leaves the bots something to choose from
  SKINS.forEach((_, i) => assert.ok(SKINS.length - SKIN_NEAR[i].length >= 6, SKINS[i].id));
});

test('bots don\'t wear the player\'s type', () => {
  for (let skin = 0; skin < SKINS.length; skin++) {
    const w = new World({ diff: 'hard' });
    w.addHuman({ name: 'H', skin, inv: 999 });
    for (let i = 0; i < 20 * 40; i++) w.step(1 / 40); // and newcomers mid-game
    const bad = w.snakes.filter((s) => !s.human && SKINS[s.skin].type === SKINS[skin].type);
    assert.equal(bad.length, 0, `${SKINS[skin].id}: ${bad.map((s) => SKINS[s.skin].id)}`);
  }
});

test('more humans than types: bots at least avoid similar skins', () => {
  const w = new World({ diff: 'easy' });
  const mine = SKINS_OF.map((l) => l[0]).concat([SKINS_OF[0][3]]);
  for (const skin of mine) w.addHuman({ name: 'H', skin, inv: 999 });
  for (const s of w.snakes) if (!s.human) assert.ok(mine.every((k) => !SKIN_NEAR[k].includes(s.skin)), SKINS[s.skin].id);
});

test('types and skins: every type has skins, color indices fit in a byte', () => {
  assert.ok(PAL.length <= 256);
  TYPES.forEach((t, ti) => {
    assert.ok(SKINS_OF[ti].length >= 4, t.id);
    for (const i of SKINS_OF[ti]) assert.equal(SKINS[i].type, ti);
  });
  assert.equal(SKINS_OF.flat().length, SKINS.length);
  // every type except beads and neon needs a pattern
  for (const s of SKINS) if (!['beads', 'neon'].includes(TYPES[s.type].id)) assert.ok(s.acc >= 0, s.id);
  // the first skins are the same as before types existed: indices in saves didn't shift
  assert.deepEqual(SKINS.slice(0, 12).map((s) => s.id), ['rainbow', 'pastel', 'icecream', 'ocean', 'tutti', 'candy',
    'sunset', 'forest', 'autumn', 'berries', 'aurora', 'peacock']);
});

test('a new player doesn\'t recolor bots that are already seen', () => {
  const w = new World({ diff: 'easy' });
  w.addHuman({ name: 'A', skin: 0, inv: 999 });
  const b = w.snakes.find((s) => !s.human);
  b.skin = 3; // like the second player's
  w.addHuman({ name: 'B', skin: 3, inv: 999, keep: new Set([b.id]) });
  assert.equal(b.skin, 3);
  assert.ok(w.snakes.filter((s) => !s.human && s !== b).every((s) => SKINS[s.skin].type !== SKINS[0].type));
});

// an empty world, a bot at (0, by) facing east; next to it — the body `other` (mass m), laid along points pts
function rayWorld(m, pts, human = false, by = 50, oa = 0) {
  const w = new World({ diff: 'easy', bots: 0, foodN: 0, flies: 0 });
  w.D = { ...w.D, slip: 0 }; // no random "lapses"
  w.snakes = []; w.byId.clear();
  const b = w.addSnake(new Snake(1, 0, by, 15, 0, 'bot', false, 0, 0));
  const o = w.addSnake(new Snake(2, pts[0].x, pts[0].y, m, 1, 'other', human, 0, oa, pts.map((p) => ({ ...p }))));
  w.buildGrids();
  return { w, b, o, look: w.D.look * (1 + b.r / 50) };
}
const line = (x0, y0, dx, dy, n) => Array.from({ length: n }, (_, i) => ({ x: x0 + dx * i, y: y0 + dy * i }));

test('a bot\'s ray sees a thick body lying with its middle in a neighboring cell', () => {
  // a body along y = 130 (cell row 100–200), the bot's path along y = 95 (row 0–100): the head would crash
  const { w, b, look } = rayWorld(3000, line(600, 130, -10, 0, 60), false, 95);
  assert.ok(radiusOf(3000) * 0.85 + b.r * 0.55 > 35, 'the body reaches the bot\'s path');
  assert.ok(w.rayDanger(b, 0, 0, look) > 0);
});

test('the path to a heading is checked as an arc: a sharp turn doesn\'t save from a body under the nose', () => {
  const { w, b, look } = rayWorld(60, line(45, -400, 0, 7, 120)); // a wall across, 45 px in front of the head
  assert.ok(w.rayDanger(b, 0, 2.1, look) > 0, 'the arc to heading 2.1 rad hits the wall');
  const { w: w2, b: b2 } = rayWorld(60, line(45, 2000, 0, 7, 120)); // no wall — the path is free
  assert.equal(w2.rayDanger(b2, 0, 2.1, look), 0);
});

test('a bot sees a player\'s body whole, and reacts with a delay to a tail that has just cut across its path', () => {
  // danger — whether the heading chosen by the bot runs into a body (with full sight); straight — the path straight ahead
  const run = (pts, human) => {
    const r = rayWorld(60, pts, human, 50, Math.PI / 2); // the player crawls north
    r.b.huntCd = 1e9;
    r.danger = () => r.w.rayDanger(r.b, 0, r.b.ta, r.look);
    r.straight = r.w.rayDanger(r.b, 0, 0, r.look);
    r.w.think(r.b, 0);
    return r;
  };
  // the player's head has just crawled across the bot's path right under its nose (80 px) and crawls north
  const pts = line(80, 110, 0, -spacingOf(60), countOf(60));
  const cut = run(pts, true);
  assert.ok(cut.straight > 0, 'the fresh tail is visible — there\'s no "hole" behind the head');
  assert.ok(cut.danger() > 0, 'at first the bot doesn\'t notice and crawls into the tail');
  cut.w.time += cut.w.D.fresh * 1.31;
  cut.w.think(cut.b, 0);
  assert.ok(cut.danger() < cut.straight, 'after D.fresh it turns away');
  // a fresh tail laid far ahead (beyond the level's cutNear, but in view), a tail that has lain for long,
  // and a bot's tail — avoided at once
  for (const [name, r] of [['far', run(line(250, 110, 0, -spacingOf(60), countOf(60)), true)],
    ['old', run(line(80, 50 + countOf(60) * spacingOf(60) - 40, 0, -spacingOf(60), countOf(60)), true)],
    ['bot', run(pts, false)]]) {
    assert.ok(r.straight > 0 && r.danger() < r.straight, name);
  }
  // "just laid" — no more than half a little one's body, and no longer while boosting
  const tiny = rayWorld(START_MASS, line(80, 70, 0, -spacingOf(START_MASS), countOf(START_MASS)), true);
  assert.ok(tiny.o.newK > 0 && tiny.o.newK <= tiny.o.segs.length / 2);
  const k0 = cut.o.newK;
  cut.o.isBoosting = true; cut.w.buildGrids();
  assert.equal(cut.o.newK, k0);
});

test('a well-fed bot (longer than giantMin) doesn\'t chase food', () => {
  const w = new World({ diff: 'easy', bots: 0, flies: 0, foodN: 0 });
  w.D = { ...w.D, slip: 0 };
  w.snakes = []; w.byId.clear();
  const full = w.addSnake(new Snake(1, 0, 0, DIFF.easy.giantMin + 100, 0, 'full', false, 0, 0));
  const hungry = w.addSnake(new Snake(2, 0, 3000, 300, 0, 'hungry', false, 0, 0));
  for (const s of [full, hungry]) for (let i = 0; i < 30; i++) w.addFood(s.x + rand(-20, 20), s.y + 400 + rand(-20, 20), 5, 0, 0);
  full.huntCd = hungry.huntCd = 1e9;
  w.buildGrids();
  const asked = new Set(), F = w.forage.bind(w);
  w.forage = (b, h) => { asked.add(b); return F(b, h); };
  w.think(full, 0); w.think(hungry, 1);
  assert.ok(!asked.has(full) && full.goalC === -1, 'the well-fed one doesn\'t look for food');
  assert.ok(asked.has(hungry) && hungry.goalC >= 0, 'the hungry one picked a cell with food');
});

// ---------- pause autopilot in a room ----------
const wallAt = (x, y0, y1, mass = 300) => { // a vertical body from y0 to y1 at x
  const s = new Snake(900, x, y0, mass, 0, 'wall', false, 0, Math.PI / 2);
  const n = s.segs.length;
  s.segs.forEach((q, i) => { q.x = x; q.y = y0 + (y1 - y0) * i / (n - 1); });
  return s;
};
test('autopilot: a body across the path — turns away instead of driving into it', () => {
  const me = new Snake(1, 0, 0, 60, 0, 'me', true, 0, 0);
  const wall = wallAt(180, -800, 800);
  const ta = safeCourse(me, [wall], []);
  assert.ok(Math.abs(angDiff(ta, 0)) > 1.2, `heading ${ta.toFixed(2)}`);
});
test('autopilot: free — keeps the heading; a teammate doesn\'t get in the way', () => {
  const me = new Snake(1, 0, 0, 60, 0, 'me', true, 1, 0.3);
  assert.ok(Math.abs(angDiff(safeCourse(me, [], []), 0.3)) < 0.01);
  const mate = wallAt(150, -800, 800); mate.team = 1;
  assert.ok(Math.abs(angDiff(safeCourse(me, [mate], []), 0.3)) < 0.01);
});
test('autopilot: the arena edge ahead — turns inward', () => {
  const me = new Snake(1, R - 200, 0, 60, 0, 'me', true, 0, 0);
  const ta = safeCourse(me, [], []);
  assert.ok(Math.cos(ta) < 0.3, `heading ${ta.toFixed(2)}`);
});
test('autopilot: another head is coming head-on — moves out of its way', () => {
  const me = new Snake(1, 0, 0, 60, 0, 'me', true, 0, 0);
  const o = new Snake(2, 500, 0, 60, 0, 'him', false, 0, Math.PI);
  o.segs.forEach((q, i) => { q.x = 500 + i * 5; q.y = 0; });
  const ta = safeCourse(me, [o], []);
  assert.ok(Math.abs(Math.sin(ta)) > 0.5, `heading ${ta.toFixed(2)}`);
});
test('autopilot: a wall ahead ends at the bottom — goes around it below, not via the long edge', () => {
  const me = new Snake(1, 0, 0, 60, 0, 'me', true, 0, 0);
  const walls = [wallAt(260, -900, 60)];
  const ta = safeCourse(me, walls, []);
  assert.ok(Math.sin(ta) > 0.3, `heading for the gap: ${ta.toFixed(2)}`);
});

// places don't flicker: near-equal snakes keep their order, a clearly longer one moves up
test('places: a near tie keeps the old order, newcomers go in by length', () => {
  const ids = (l) => l.map((s) => s.id);
  assert.deepEqual(ids(stickyRank([{ id: 1, mass: 100 }, { id: 2, mass: 300 }, { id: 3, mass: 200 }])), [2, 3, 1]);
  // 2 is a bit longer than 1, but 1 was above — stays above
  assert.deepEqual(ids(stickyRank([{ id: 1, mass: 1000 }, { id: 2, mass: 1030 }], [1, 2])), [1, 2]);
  // clearly longer — overtakes
  const lead = 1000 * (1 + RANK_HOLD) + RANK_HOLD_MIN + 1;
  assert.deepEqual(ids(stickyRank([{ id: 1, mass: 1000 }, { id: 2, mass: lead }], [1, 2])), [2, 1]);
  // the gap is the same in small snakes too: at least RANK_HOLD_MIN
  assert.deepEqual(ids(stickyRank([{ id: 1, mass: 20 }, { id: 2, mass: 20 + RANK_HOLD_MIN - 1 }], [1, 2])), [1, 2]);
  // a dead one drops out, a newcomer is put in by length
  assert.deepEqual(ids(stickyRank([{ id: 2, mass: 500 }, { id: 4, mass: 700 }, { id: 3, mass: 100 }], [1, 2, 3])), [4, 2, 3]);
});
test('places: nobody ends up below a snake it clearly overtakes', () => {
  // a chain of near ties: 3 isn't far ahead of 2, but is clearly ahead of 1 — goes up past both
  const out = stickyRank([{ id: 1, mass: 1000 }, { id: 2, mass: 1035 }, { id: 3, mass: 1070 }], [1, 2, 3]);
  assert.equal(out[0].id, 3);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // seeded — a failure repeats
  for (let n = 0; n < 200; n++) {
    let prev = [];
    const list = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, mass: 50 + rnd() * 3000 }));
    for (let k = 0; k < 20; k++) {
      for (const s of list) s.mass = Math.max(10, s.mass * (0.9 + rnd() * 0.2));
      const o = stickyRank(list, prev);
      prev = o.map((s) => s.id);
      assert.equal(o.length, list.length);
      for (let i = 0; i < o.length; i++) for (let j = 0; j < i; j++)
        assert.ok(o[i].mass <= o[j].mass * (1 + RANK_HOLD) + RANK_HOLD_MIN, `${o[i].mass} is below ${o[j].mass}`);
    }
  }
});

test('the crowned bot is careful: a sharper brain than its level, never sharper than hard; others think as usual', () => {
  const e = DIFF.easy, c = carefulOf(e), h = DIFF.hard, ch = carefulOf(h);
  assert.ok(c.react < e.react && c.wary > e.wary && c.look > e.look && c.slip < e.slip && c.feud < e.feud);
  assert.ok(c.react >= h.react && c.wary <= h.wary && !c.slipAny);
  assert.equal(c.speed, e.speed); assert.equal(c.turn, e.turn); assert.deepEqual(c.humanAggr, e.humanAggr);
  for (const k of ['react', 'look', 'wary', 'fresh', 'cutNear', 'foresee']) assert.equal(ch[k], h[k], k);
  const w = new World({ diff: 'easy' });
  const brains = new Map(), think = w.think.bind(w);
  w.think = (b, i) => { brains.set(b, w.D); think(b, i); };
  for (let i = 0; i < 40; i++) w.step(1 / 40);
  brains.clear();
  for (const s of w.snakes) s.thinkT = 0; // everyone thinks on the next step
  w.step(1 / 40);
  const lead = w.crowned;
  assert.ok(lead && !lead.human && lead.alive);
  assert.equal(brains.get(lead), w.carefulD);
  for (const [b, D] of brains) if (b !== lead) assert.equal(D, DIFF.easy);
  assert.equal(w.D, DIFF.easy);
});

test('the crown passes with the leaderboard\'s hold: a near tie keeps it, a clear lead takes it', () => {
  const w = new World({ diff: 'easy', foodN: 0 });
  w.targetBots = 0; w.snakes = []; w.byId.clear();
  const a = w.spawnBot(true), b = w.spawnBot(true);
  a.mass = 1000; b.mass = 900; a.inv = b.inv = 99;
  w.step(1 / 40);
  assert.equal(w.crowned, a);
  b.mass = a.mass * 1.02; w.step(1 / 40);
  assert.equal(w.crowned, a);
  b.mass = a.mass * (1 + RANK_HOLD) + RANK_HOLD_MIN + 5; w.step(1 / 40);
  assert.equal(w.crowned, b);
});

test('spawning: while a player wears a crown, no bot appears longer than them; without a crown giants appear as usual', () => {
  const w = new World({ diff: 'hard' });
  const me = w.addHuman({ name: 'P', skin: 0, inv: 99 });
  const bots = w.snakes.filter((s) => !s.human).sort((a, b) => b.mass - a.mass);
  me.mass = (bots[1].mass + bots[2].mass) / 2; // third place — the bronze crown
  for (const b of bots.slice(0, 30)) b.alive = false; // room for newcomers, the arena loses its giants
  bots[0].alive = bots[1].alive = true;
  const cap = me.mass * SPAWN_BELOW;
  for (let i = 0; i < 400; i++) {
    const b = w.botMass(false);
    assert.ok(b <= cap + 1e-9 && b >= DIFF.hard.mass[0], `${b} outside ${DIFF.hard.mass[0]}..${cap}`);
  }
  // shown with the bronze crown through the hold, though a hair shorter than the 4th — still protected
  const third = w.snakes.filter((s) => s.alive && s !== me).sort((a, b) => b.mass - a.mass)[2];
  me.mass = third.mass * 0.995;
  for (let i = 0; i < 200; i++) assert.ok(w.botMass(false) <= me.mass * SPAWN_BELOW + 1e-9);
  // a tiny crowned player in an almost empty arena: newcomers aren't smaller than the level's minimum
  me.mass = 5;
  for (let i = 0; i < 50; i++) assert.ok(w.botMass(false) >= DIFF.hard.mass[0]);
  me.mass = 20; // no crown any more — big newcomers again
  let big = 0;
  for (let i = 0; i < 400; i++) if (w.botMass(false) >= DIFF.hard.giantMin) big++;
  assert.ok(big > 50, `${big} giants of 400`);
});

test('save: a restored world has the same snakes, food and butterflies and keeps playing', () => {
  const w = new World({ diff: 'medium' });
  const me = w.addHuman({ name: 'Me', skin: 3, inv: 99, mass: 400 }); // can't be killed: the human checks below always run
  for (let i = 0; i < 200; i++) w.step(1 / 30);
  const data = JSON.parse(JSON.stringify(w.toSave()));
  const r = World.fromSave(data);
  assert.ok(r);
  assert.equal(r.diffKey, 'medium');
  assert.equal(r.snakes.length, w.snakes.filter((s) => s.alive).length);
  assert.equal(r.foods.length, w.foods.filter((f) => !f.dead).length);
  assert.equal(r.flies.length, w.flies.length);
  assert.equal(r.time, w.time);
  const me2 = r.byId.get(me.id);
  assert.ok(me.alive && me2 && me2.human && me2 instanceof Snake);
  assert.equal(me2.mass, me.mass);
  assert.equal(me2.stage, me.stage);
  assert.equal(me2.inv, me.inv);
  assert.equal(me2.segs.length, me.segs.length);
  assert.ok(Math.abs(me2.segs[5].x - me.segs[5].x) <= 0.5);
  const bot = w.snakes.find((s) => !s.human && s.alive), bot2 = r.byId.get(bot.id);
  assert.equal(bot2.skin, bot.skin);
  assert.equal(bot2.pers, bot.pers);
  assert.equal(bot2.name, bot.name);
  assert.equal(r.crowned && r.crowned.id, w.crowned && w.crowned.id);
  assert.ok(r.flies.every((f) => f.cnt instanceof Map));
  for (let i = 0; i < 300; i++) r.step(1 / 30);
  assert.ok(r.snakes.length > 30);
  const used = new Set(r.snakes.map((s) => s.id));
  assert.equal(used.size, r.snakes.length); // new bots get new ids
});

test('save: another format is dropped', () => {
  const w = new World({ diff: 'easy', foodN: 10, bots: 2, flies: 1 });
  assert.equal(World.fromSave({ ...w.toSave(), v: -1 }), null);
  assert.equal(World.fromSave(null), null);
});
