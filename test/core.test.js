import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, Snake, rand, countOf, spacingOf, SNAKES_N, DIFF, R, GOLD, SKINS, PAL, TITLES, titleOf,
  speedOf, turnOf, remainsOf, radiusOf, boostCostOf, BASE_SPEED, BOOST_SPEED, MIN_BOOST_MASS, layBody, angDiff, keepMass, START_MASS,
  FLY_N, FLY_MAX, FLY_BASE, flyRadius, flyEase, flyGain, SKIN_NEAR, skinDist, TYPES, SKINS_OF } from '../public/core.js';

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
  // на лёгком хаос задуман (feud, slip), но арена не вымирает: гиганты остаются (ниже)
  assert.ok(botKills <= 180, `не сплошная бойня: побед ботов за 90 с: ${botKills}`);
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
  assert.ok(remainsOf(1000) / 1000 < 0.33);
  assert.ok(remainsOf(4000) / 4000 < 0.2, 'за гигантом не отожраться');
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
    assert.ok(lost >= 10 && lost >= m0 * 0.05 * 0.95, `за секунду рывка сгорает 5 % длины, а сгорело ${lost.toFixed(1)} из ${m0}`);
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

// пустая арена: бот и игрок с телами, уложенными прямо назад от головы
function duel(diff, bot, human) {
  const w = new World({ diff, foodN: 0, bots: 0, flies: 0 }); // бабочки отвлекали бы бота от того, что проверяем
  w.D = { ...DIFF[diff], slip: 0, ...(bot.D || {}) }; // без случайных «зевков»: сценка должна быть одинаковой
  const mk = (o, isHuman) => {
    const s = new Snake(w.nextSnakeId++, o.x, o.y, o.mass, 0, isHuman ? 'H' : 'B', isHuman, 0, o.a, layBody(o.x, o.y, o.a, o.mass, 0, 0, 0));
    s.age = 30; s.inv = 0; s.huntCd = 99; s.pers = 1; s.cau = 1;
    return w.addSnake(s);
  };
  const b = mk(bot, false), h = mk(human, true);
  w.buildGrids();
  return { w, b, h };
}

test('бот замечает, что ему перерезают путь, и уходит вдоль чужого пути', () => {
  for (const wary of [0, 1]) {
    const { w, b } = duel('hard', { x: 0, y: 0, a: 0, mass: 300, D: { wary } }, { x: 220, y: -150, a: Math.PI / 2, mass: 300 });
    w.think(b, 0);
    const turn = Math.abs(angDiff(b.ta, 0));
    if (wary) assert.ok(turn > 0.8, `не отвернул: ${turn.toFixed(2)}`);
    else assert.ok(turn < 0.4, `не заметил — едет прямо: ${turn.toFixed(2)}`);
  }
});

test('засада: игрок сам ползёт поперёк тела бота — бот не сворачивает к еде; на мелкого засаду не устраивает', () => {
  for (const [aggr, mass, ambush] of [[0, 320, false], [5, 320, true], [5, 100, false]]) {
    const { w, b } = duel('hard', { x: 0, y: 0, a: 0, mass: 400, D: { aggr } }, { x: 250, y: -300, a: Math.PI / 2, mass });
    w.addFood(60, 250, 20, 0, 0);
    w.buildGrids();
    w.think(b, 0);
    if (ambush) assert.ok(Math.abs(angDiff(b.ta, 0)) < 0.2, `свернул из засады: ${b.ta.toFixed(2)}`);
    else assert.ok(angDiff(b.ta, 0) > 0.6, `без засады — к еде (aggr ${aggr}, игрок ${mass}): ${b.ta.toFixed(2)}`);
  }
});

test('крупный бот не охотится на того, кто короче его на 30 % и больше, и бросает такую цель', () => {
  for (const [mass, ok] of [[100, false], [300, false], [320, true], [2000, true]]) {
    const { w, b, h } = duel('hard', { x: 0, y: 0, a: 0, mass: 400, D: { humanAggr: [9, 9, 9] } }, { x: 300, y: 100, a: 0, mass });
    assert.equal(w.pickTarget(b) === h, ok, `игрок ${mass} при боте 400`);
  }
  const { w, b, h } = duel('hard', { x: 0, y: 0, a: 0, mass: 400 }, { x: 300, y: 100, a: 0, mass: 350 });
  w.startHunt(b, h);
  h.mass = 250;
  w.think(b, 0);
  assert.equal(b.hunt, 0, 'цель похудела — охота брошена');
});

test('злость ботов растёт с местом игрока: на лёгком ниже 20-го места не охотятся, в двадцатке — да', () => {
  const w = new World({ diff: 'easy', foodN: 0, bots: 0 });
  const h = w.addHuman({ name: 'H', skin: 0 });
  h.rank = 35; assert.equal(w.heatOf(h).p, 0);
  h.rank = 20; const at20 = w.heatOf(h); assert.ok(at20.p > 0.2 && at20.n === 1, `20-е место: ${at20.p}`);
  h.rank = 1; const top = w.heatOf(h); assert.ok(top.p > at20.p && top.n === 2, `первое место: ${top.p}, охотников ${top.n}`);
  for (const d of ['easy', 'medium', 'hard']) {
    const D = DIFF[d];
    assert.ok(D.humanAggr[0] <= D.humanAggr[1] && D.humanAggr[1] <= D.humanAggr[2], d);
  }
  assert.ok(DIFF.easy.humanAggr[2] < DIFF.medium.humanAggr[2] && DIFF.medium.humanAggr[2] < DIFF.hard.humanAggr[2]);
  // место считается на каждом шаге
  const w2 = new World({ diff: 'hard', foodN: 0 });
  const p = w2.addHuman({ name: 'P', skin: 0, mass: 1e6, inv: 0 });
  w2.step(1 / 40);
  assert.equal(p.rank, 1);
});

test('после «Продолжить» остаётся 80 % длины на лёгком, 40 % на среднем, на сложном — с начала', () => {
  assert.equal(keepMass('easy', 1000), 800);
  assert.equal(keepMass('medium', 1000), 400);
  assert.equal(keepMass('hard', 1000), START_MASS);
  assert.equal(keepMass('easy', 10), START_MASS);
});

test('охота: вдвоём заходят с разных сторон, у края — со стороны центра', () => {
  const { w, b, h } = duel('hard', { x: 0, y: 200, a: 0, mass: 400 }, { x: 300, y: 0, a: 0, mass: 100 });
  const b2 = w.addSnake(new Snake(w.nextSnakeId++, 0, 260, 400, 0, 'B2', false, 0, 0, layBody(0, 260, 0, 400, 0, 0, 0)));
  w.startHunt(b, h);
  w.startHunt(b2, h);
  assert.notEqual(b.hside, 0);
  assert.equal(b2.hside, -b.hside);

  const e = duel('hard', { x: R * 0.6, y: 0, a: 0, mass: 400 }, { x: R * 0.8, y: 0, a: -Math.PI / 2, mass: 100 });
  e.w.startHunt(e.b, e.h);
  const ps = Math.sin(e.h.a), pc = Math.cos(e.h.a);
  const px = e.h.x - ps * e.b.hside * 100, py = e.h.y + pc * e.b.hside * 100; // точка, куда бот заходит сбоку
  assert.ok(Math.hypot(px, py) < Math.hypot(e.h.x, e.h.y), 'у края бот заходит со стороны центра');
});

test('на свежие останки бот сползается издалека', () => {
  const { w, b } = duel('hard', { x: 0, y: 0, a: -Math.PI / 2, mass: 300 }, { x: -3000, y: 3000, a: 0, mass: 50 });
  // останки лежат вертикально в 1000 справа — дальше, чем бот видит еду, так что повернуть его может только запах останков
  const v = w.addSnake(new Snake(w.nextSnakeId++, 1000, -400, 300, 0, 'V', false, 0, -Math.PI / 2, layBody(1000, -400, -Math.PI / 2, 300, 0, 0, 0)));
  w.kill(v, null);
  w.snakes = w.snakes.filter((s) => s.alive);
  w.decide = () => true; // бот решился пойти
  w.buildGrids();
  w.think(b, w.snakes.indexOf(b));
  assert.ok(Math.abs(angDiff(b.ta, 0)) < 1, `к останкам не повернул: ${b.ta.toFixed(2)}`);
});

// пустой мир с одной бабочкой: без ботов и без других бабочек
function flyWorld() {
  const w = new World({ diff: 'easy', foodN: 0, bots: 0, flies: 0 });
  const f = w.spawnFly(false);
  f.x = 0; f.y = 0; f.vx = f.vy = 0; f.n = 0; f.cnt = new Map(); f.top = [];
  return { w, f };
}

test('бабочки: в начале их FLY_N, кто-то уже наелся; собранное не больше FLY_MAX', () => {
  const w = new World({ diff: 'easy' });
  assert.equal(w.flies.length, FLY_N);
  assert.ok(w.flies.some((f) => f.n > 10));
  assert.ok(w.flies.every((f) => f.n <= FLY_MAX && f.top.length <= 5));
});

test('бабочка сама находит еду, съедает её и растёт; крошки — цвета съеденного', () => {
  const { w, f } = flyWorld();
  for (let i = 0; i < 12; i++) w.addFood(150 + i * 12, 40, 2, 4, 0);
  for (let i = 0; i < 6; i++) w.addFood(150, 60 + i * 12, 2, 8, 0);
  for (let i = 0; i < 40 * 8; i++) w.step(1 / 40);
  assert.ok(f.n >= 20, `собрано ${f.n}`);
  assert.equal(f.top[0], 4);
  assert.ok(flyRadius(f.n) > flyRadius(0));
});

test('бабочка не пролетает сквозь тело змеи', () => {
  const { w, f } = flyWorld();
  const s = w.addHuman({ name: 'H', skin: 0, mass: 400, inv: 0 });
  const lay = () => s.segs.forEach((p, k) => { p.x = 600 - k * 14; p.y = 200; }); // тело поперёк, от x=600 далеко влево
  lay();
  assert.ok(s.segs[s.segs.length - 1].x < -300);
  s.a = s.ta = 0;
  f.x = -100; f.y = 0; f.gx = -100; f.gy = 400; f.gT = 99; // бабочка хочет вниз, сквозь тело
  for (let i = 0; i < 40 * 3; i++) {
    lay();                  // тело лежит на месте
    w.step(1 / 40);
    f.gx = f.x; f.gy = 400; f.gT = 99;
  }
  assert.ok(f.y < 200, `бабочка оказалась по ту сторону тела: y=${f.y.toFixed(0)}`);
});

test('от головы, которая на неё смотрит, бабочка увёртывается вбок', () => {
  const { w, f } = flyWorld();
  const s = w.addHuman({ name: 'H', skin: 0, mass: 100, inv: 0 });
  s.segs.forEach((p, i) => { p.x = -200 - i * 5; p.y = 0; });
  s.a = s.ta = 0;
  w.step(1 / 40);
  assert.ok(f.dart > 0, 'не увернулась');
  assert.ok(Math.abs(f.vy) > Math.abs(f.vx) * 1.5, 'увёртка должна быть поперёк хода змеи');
});

test('голова ловит бабочку: собранное высыпается едой в цветах крошек, прилетает новая', () => {
  const { w, f } = flyWorld();
  for (let i = 0; i < 40; i++) w.flyEat(f, 1, 6);
  f.cool = 99; // не увернётся
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

test('бабочки по званию: малышу-игроку ловить легче, крупным — вдвое больше еды', () => {
  assert.equal(flyEase({ human: true, mass: 15 }), 1);
  assert.equal(flyEase({ human: true, mass: 700 }), 0);
  assert.equal(flyEase({ human: false, mass: 15 }), 0, 'ботам поблажки нет');
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

test('почти полная бабочка не съедает сверх вместимости, а проигравшая в этом шаге змея её не ловит', () => {
  const { w, f } = flyWorld();
  for (let i = 0; i < FLY_MAX - 2; i++) w.flyEat(f, 1, 3);
  for (let i = 0; i < 4; i++) w.addFood(rand0(i), 0, 5, 3, 0);
  w.buildGrids(); w.stepFlies(1 / 40);
  assert.equal(f.n, FLY_MAX);
  assert.ok(w.foods.filter((q) => !q.dead).length >= 2, 'лишняя еда должна остаться на поле');
  // змея уже в списке проигравших — бабочку не ловит
  const s = w.addHuman({ name: 'H', skin: 0, mass: 100, inv: 0 });
  s.segs.forEach((p, i) => { p.x = -i * 5; p.y = 0; });
  f.cool = 99; w.pending.push([s, null]);
  w.buildGrids(); w.stepFlies(1 / 40);
  assert.equal(w.flies.length, 1);
});
function rand0(i) { return [0, 3, -3, 6][i]; }

test('похожие раскраски: пары, которые путаются, — рядом; непохожие — нет', () => {
  const ix = (n) => SKINS.findIndex((s) => s.name === n);
  assert.ok(SKIN_NEAR[ix('Пастельная радуга')].includes(ix('Мороженое')));
  assert.ok(SKIN_NEAR[ix('Радуга')].includes(ix('Тутти-фрутти')));
  assert.ok(!SKIN_NEAR[ix('Океан')].includes(ix('Осень')));
  SKINS.forEach((_, i) => { assert.ok(SKIN_NEAR[i].includes(i)); assert.equal(skinDist(i, i), 0); });
  // у каждой раскраски остаётся из чего выбирать ботам
  SKINS.forEach((_, i) => assert.ok(SKINS.length - SKIN_NEAR[i].length >= 6, SKINS[i].name));
});

test('боты не носят вид игрока', () => {
  for (let skin = 0; skin < SKINS.length; skin++) {
    const w = new World({ diff: 'hard' });
    w.addHuman({ name: 'H', skin, inv: 999 });
    for (let i = 0; i < 20 * 40; i++) w.step(1 / 40); // и новички посреди игры
    const bad = w.snakes.filter((s) => !s.human && SKINS[s.skin].type === SKINS[skin].type);
    assert.equal(bad.length, 0, `${SKINS[skin].name}: ${bad.map((s) => SKINS[s.skin].name)}`);
  }
});

test('людей больше, чем видов: боты хотя бы не в похожих раскрасках', () => {
  const w = new World({ diff: 'easy' });
  const mine = SKINS_OF.map((l) => l[0]).concat([SKINS_OF[0][3]]);
  for (const skin of mine) w.addHuman({ name: 'H', skin, inv: 999 });
  for (const s of w.snakes) if (!s.human) assert.ok(mine.every((k) => !SKIN_NEAR[k].includes(s.skin)), SKINS[s.skin].name);
});

test('виды и раскраски: у каждого вида есть раскраски, номера цветов влезают в байт', () => {
  assert.ok(PAL.length <= 256);
  TYPES.forEach((t, ti) => {
    assert.ok(SKINS_OF[ti].length >= 4, t.name);
    for (const i of SKINS_OF[ti]) assert.equal(SKINS[i].type, ti);
  });
  assert.equal(SKINS_OF.flat().length, SKINS.length);
  // узор нужен всем видам, кроме бусинок и неона
  for (const s of SKINS) if (!['beads', 'neon'].includes(TYPES[s.type].id)) assert.ok(s.acc >= 0, s.name);
  // первые раскраски — те же, что были до видов: номера в сохранениях не сдвинулись
  assert.deepEqual(SKINS.slice(0, 12).map((s) => s.name), ['Радуга', 'Пастельная радуга', 'Мороженое', 'Океан', 'Тутти-фрутти', 'Конфетка',
    'Закат', 'Лес', 'Осень', 'Ягоды', 'Северное сияние', 'Павлин']);
});

test('новый игрок не перекрашивает ботов, которых уже видят', () => {
  const w = new World({ diff: 'easy' });
  w.addHuman({ name: 'A', skin: 0, inv: 999 });
  const b = w.snakes.find((s) => !s.human);
  b.skin = 3; // как у второго игрока
  w.addHuman({ name: 'B', skin: 3, inv: 999, keep: new Set([b.id]) });
  assert.equal(b.skin, 3);
  assert.ok(w.snakes.filter((s) => !s.human && s !== b).every((s) => SKINS[s.skin].type !== SKINS[0].type));
});

// пустой мир, бот в (0, by) смотрит на восток; рядом — тело other (массой m), уложенное по точкам pts
function rayWorld(m, pts, human = false, by = 50, oa = 0) {
  const w = new World({ diff: 'easy', bots: 0, foodN: 0, flies: 0 });
  w.D = { ...w.D, slip: 0 }; // без случайных «зевков»
  w.snakes = []; w.byId.clear();
  const b = w.addSnake(new Snake(1, 0, by, 15, 0, 'бот', false, 0, 0));
  const o = w.addSnake(new Snake(2, pts[0].x, pts[0].y, m, 1, 'другой', human, 0, oa, pts.map((p) => ({ ...p }))));
  w.buildGrids();
  return { w, b, o, look: w.D.look * (1 + b.r / 50) };
}
const line = (x0, y0, dx, dy, n) => Array.from({ length: n }, (_, i) => ({ x: x0 + dx * i, y: y0 + dy * i }));

test('луч бота видит толстое тело, которое лежит серединой в соседней клетке', () => {
  // тело вдоль y = 130 (ряд клеток 100–200), путь бота — по y = 95 (ряд 0–100): голова врезалась бы
  const { w, b, look } = rayWorld(3000, line(600, 130, -10, 0, 60), false, 95);
  assert.ok(radiusOf(3000) * 0.85 + b.r * 0.55 > 35, 'тело достаёт до пути бота');
  assert.ok(w.rayDanger(b, 0, 0, look) > 0);
});

test('путь к курсу проверяется дугой: резкий поворот не спасает от тела под носом', () => {
  const { w, b, look } = rayWorld(60, line(45, -400, 0, 7, 120)); // стена поперёк, в 45 px перед головой
  assert.ok(w.rayDanger(b, 0, 2.1, look) > 0, 'дуга к курсу 2,1 рад задевает стену');
  const { w: w2, b: b2 } = rayWorld(60, line(45, 2000, 0, 7, 120)); // стены нет — путь свободен
  assert.equal(w2.rayDanger(b2, 0, 2.1, look), 0);
});

test('тело игрока бот видит целиком, а на хвост, только что перерезавший путь, реагирует с опозданием', () => {
  // danger — упирается ли выбранный ботом курс в тело (полным зрением); straight — путь прямо
  const run = (pts, human) => {
    const r = rayWorld(60, pts, human, 50, Math.PI / 2); // игрок ползёт на север
    r.b.huntCd = 1e9;
    r.danger = () => r.w.rayDanger(r.b, 0, r.b.ta, r.look);
    r.straight = r.w.rayDanger(r.b, 0, 0, r.look);
    r.w.think(r.b, 0);
    return r;
  };
  // голова игрока только что проползла поперёк пути бота под самым его носом (80 px) и ползёт на север
  const pts = line(80, 110, 0, -spacingOf(60), countOf(60));
  const cut = run(pts, true);
  assert.ok(cut.straight > 0, 'свежий хвост виден — «дыры» за головой нет');
  assert.ok(cut.danger() > 0, 'сразу бот не замечает и ползёт в хвост');
  cut.w.time += cut.w.D.fresh * 1.31;
  cut.w.think(cut.b, 0);
  assert.ok(cut.danger() < cut.straight, 'через D.fresh — отворачивает');
  // свежий хвост, легший далеко впереди (дальше cutNear уровня, но в поле зрения), хвост, который лежит давно,
  // и хвост бота — объезжает сразу
  for (const [name, r] of [['далеко', run(line(250, 110, 0, -spacingOf(60), countOf(60)), true)],
    ['давно', run(line(80, 50 + countOf(60) * spacingOf(60) - 40, 0, -spacingOf(60), countOf(60)), true)],
    ['бот', run(pts, false)]]) {
    assert.ok(r.straight > 0 && r.danger() < r.straight, name);
  }
  // «только что легло» — не больше половины тела малыша и на рывке не длиннее
  const tiny = rayWorld(START_MASS, line(80, 70, 0, -spacingOf(START_MASS), countOf(START_MASS)), true);
  assert.ok(tiny.o.newK > 0 && tiny.o.newK <= tiny.o.segs.length / 2);
  const k0 = cut.o.newK;
  cut.o.isBoosting = true; cut.w.buildGrids();
  assert.equal(cut.o.newK, k0);
});

test('сытый бот (длиннее giantMin) за едой не гоняется', () => {
  const w = new World({ diff: 'easy', bots: 0, flies: 0, foodN: 0 });
  w.D = { ...w.D, slip: 0 };
  w.snakes = []; w.byId.clear();
  const full = w.addSnake(new Snake(1, 0, 0, DIFF.easy.giantMin + 100, 0, 'сытый', false, 0, 0));
  const hungry = w.addSnake(new Snake(2, 0, 3000, 300, 0, 'голодный', false, 0, 0));
  for (const s of [full, hungry]) for (let i = 0; i < 30; i++) w.addFood(s.x + rand(-20, 20), s.y + 400 + rand(-20, 20), 5, 0, 0);
  full.huntCd = hungry.huntCd = 1e9;
  w.buildGrids();
  const asked = new Set(), F = w.forage.bind(w);
  w.forage = (b, h) => { asked.add(b); return F(b, h); };
  w.think(full, 0); w.think(hungry, 1);
  assert.ok(!asked.has(full) && full.goalC === -1, 'сытый еду не ищет');
  assert.ok(asked.has(hungry) && hungry.goalC >= 0, 'голодный выбрал клетку с едой');
});

// ---------- автопилот на паузе в комнате ----------
import { safeCourse, AUTO, Snake as SnakeA, layBody as layBodyA, angDiff as angDiffA, R as RA } from '../public/core.js';
const wallAt = (x, y0, y1, mass = 300) => { // вертикальное тело от y0 до y1 на x
  const s = new SnakeA(900, x, y0, mass, 0, 'стена', false, 0, Math.PI / 2);
  const n = s.segs.length;
  s.segs.forEach((q, i) => { q.x = x; q.y = y0 + (y1 - y0) * i / (n - 1); });
  return s;
};
test('автопилот: тело поперёк пути — сворачивает, а не едет в него', () => {
  const me = new SnakeA(1, 0, 0, 60, 0, 'я', true, 0, 0);
  const wall = wallAt(180, -800, 800);
  const ta = safeCourse(me, [wall], []);
  assert.ok(Math.abs(angDiffA(ta, 0)) > 1.2, `курс ${ta.toFixed(2)}`);
});
test('автопилот: свободно — держит курс; свой по команде не мешает', () => {
  const me = new SnakeA(1, 0, 0, 60, 0, 'я', true, 1, 0.3);
  assert.ok(Math.abs(angDiffA(safeCourse(me, [], []), 0.3)) < 0.01);
  const mate = wallAt(150, -800, 800); mate.team = 1;
  assert.ok(Math.abs(angDiffA(safeCourse(me, [mate], []), 0.3)) < 0.01);
});
test('автопилот: край арены впереди — поворачивает внутрь', () => {
  const me = new SnakeA(1, RA - 200, 0, 60, 0, 'я', true, 0, 0);
  const ta = safeCourse(me, [], []);
  assert.ok(Math.cos(ta) < 0.3, `курс ${ta.toFixed(2)}`);
});
test('автопилот: чужая голова идёт навстречу — уходит с её пути', () => {
  const me = new SnakeA(1, 0, 0, 60, 0, 'я', true, 0, 0);
  const o = new SnakeA(2, 500, 0, 60, 0, 'он', false, 0, Math.PI);
  o.segs.forEach((q, i) => { q.x = 500 + i * 5; q.y = 0; });
  const ta = safeCourse(me, [o], []);
  assert.ok(Math.abs(Math.sin(ta)) > 0.5, `курс ${ta.toFixed(2)}`);
});
test('автопилот: в тесноте — путь не задевает тел, если выход есть', () => {
  // коридор: стены сверху и снизу, впереди стена с проходом снизу
  const me = new SnakeA(1, 0, 0, 60, 0, 'я', true, 0, 0);
  const walls = [wallAt(260, -900, 60)];
  const ta = safeCourse(me, walls, []);
  assert.ok(Math.sin(ta) > 0.3, `уходит к проходу: ${ta.toFixed(2)}`);
});
