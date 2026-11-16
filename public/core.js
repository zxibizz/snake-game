// Общая логика игры: одиночная игра в браузере и комнаты на сервере используют один и тот же код.
// Здесь нет DOM и сети — только мир, змейки, еда, боты и столкновения.

// Версия протокола и файлов: при изменении любого файла в public/ поднять и здесь, и в sw.js (тест сверяет).
export const VERSION = '3';
export const TAU = Math.PI * 2;
export const R = 6000;                  // радиус арены
export const BASE_SPEED = 175;          // пикс/с
export const BOOST_SPEED = 345;
export const MIN_BOOST_MASS = 12;
export const START_MASS = 15;
export const SNAKES_N = 100;            // змей на арене вместе с игроками
export const FOOD_N = 7000;
export const FEAST_LIFE = 45;           // сколько секунд лежит пир
const CELL = 100;
// еда по сети раздаётся крупными клетками: игроку — только клетки вокруг него
export const FOOD_CELL = 1000;
export const FOOD_CELLS = Math.ceil((2 * R) / FOOD_CELL);
export const foodCellOf = (x, y) => clamp(Math.floor((y + R) / FOOD_CELL), 0, FOOD_CELLS - 1) * FOOD_CELLS +
  clamp(Math.floor((x + R) / FOOD_CELL), 0, FOOD_CELLS - 1);
const GRID_OFF = R + 200;
const GRID_N = Math.ceil((2 * GRID_OFF) / CELL);
const G2 = GRID_N * GRID_N;

// mass — разброс масс ботов при создании мира; giants — сколько ботов не меньше giantMin держать на арене.
// aggr — как часто бот ищет, кого подрезать; humanAggr — насколько охотно выбирает игрока;
// maxHunters — сколько ботов сразу охотятся на одного игрока; grace — секунд после появления игрока без охоты;
// rest — средняя пауза бота между охотами, с.
export const DIFF = {
  easy: {
    label: 'Лёгкий', mass: [15, 8000], giants: 8, giantMin: 2000,
    speed: 0.97, turn: 0.95, react: 0.2, look: 230,
    aggr: 0.3, humanAggr: 0.45, maxHunters: 1, grace: 10, huntRange: 480, boost: 0.55, rest: 6,
    encircle: false, flee: false, edgeKills: false, respawn: true,
  },
  medium: {
    label: 'Средний', mass: [15, 10000], giants: 9, giantMin: 2500,
    speed: 1, turn: 1, react: 0.13, look: 280,
    aggr: 0.55, humanAggr: 0.85, maxHunters: 2, grace: 6, huntRange: 640, boost: 0.8, rest: 4,
    encircle: true, flee: true, edgeKills: true, respawn: false,
  },
  hard: {
    label: 'Сложный', mass: [20, 12000], giants: 10, giantMin: 3000,
    speed: 1.03, turn: 1.08, react: 0.08, look: 340,
    aggr: 0.9, humanAggr: 1.3, maxHunters: 4, grace: 3, huntRange: 820, boost: 0.95, rest: 2,
    encircle: true, flee: true, edgeKills: true, respawn: false,
  },
};

// Палитра: еда и сегменты змей ссылаются на цвет по номеру (так их дёшево передавать по сети).
export const PAL = [
  '#FF5A5F', '#FF8A3D', '#FFC93C', '#B6E35A', '#4CD07D', '#2EC4B6', '#3DB8F5', '#4F7CFF', // 0–7
  '#8B5CF6', '#D65DB1', '#FF7EB6', '#FFFFFF', '#2B2D42', '#FFD447', '#C9CED6', '#8A5A3B', // 8–15
  '#1E7A44', '#A8EBFF', '#FFE6B0', '#5E2CA5', '#22F0B4', '#FF3D7F', '#1B2A55', '#E8430C', // 16–23
  '#9EE7C9', '#FFB3C7', '#C7B6FF', '#7DF9FF', '#FFF27A', '#3A3F4B', '#B0F06A', '#FF9F1C', // 24–31
];
export const GOLD = 13;
export const FOOD_COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21, 27, 28];

// Раскраски: p — цвета по кругу, run — сегментов подряд одного цвета, head — цвет головы, lvl — с какого уровня открыта.
export const SKINS = [
  { name: 'Травка', p: [4, 3, 4, 30], run: 2, head: 4, lvl: 1 },
  { name: 'Небо', p: [6, 17, 7, 17], run: 2, head: 6, lvl: 1 },
  { name: 'Карамель', p: [0, 11], run: 2, head: 0, lvl: 1 },
  { name: 'Пчёлка', p: [2, 2, 12], run: 2, head: 2, lvl: 1 },
  { name: 'Радуга', p: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], run: 2, head: 0, lvl: 2 },
  { name: 'Арбуз', p: [16, 4, 16, 3], run: 2, head: 0, lvl: 3 },
  { name: 'Мороженое', p: [25, 18, 24, 26], run: 3, head: 25, lvl: 4 },
  { name: 'Огонь', p: [0, 23, 1, 31, 2, 28, 2, 31, 1, 23], run: 1, head: 23, lvl: 5 },
  { name: 'Океан', p: [22, 7, 6, 17, 27, 17, 6, 7], run: 1, head: 7, lvl: 6 },
  { name: 'Тигр', p: [31, 31, 12], run: 2, head: 31, lvl: 7 },
  { name: 'Фея', p: [10, 26, 17, 11, 17, 26], run: 2, head: 10, lvl: 8 },
  { name: 'Зебра', p: [11, 12], run: 2, head: 11, lvl: 9 },
  { name: 'Лес', p: [16, 4, 30, 15], run: 2, head: 16, lvl: 10 },
  { name: 'Неон', p: [21, 20, 27, 8], run: 2, head: 21, lvl: 12 },
  { name: 'Конфетти', p: [0, 2, 6, 4, 9, 1, 27, 28, 21, 3, 8, 5], run: 1, head: 11, lvl: 14 },
  { name: 'Ночь', p: [22, 22, 19, 22, 22, 11], run: 1, head: 19, lvl: 16 },
  { name: 'Дракон', p: [16, 16, 13, 16, 16, 23], run: 2, head: 23, lvl: 18 },
  { name: 'Серебро', p: [14, 11, 17, 11], run: 2, head: 14, lvl: 20 },
  { name: 'Золото', p: [13, 18, 13, 31], run: 2, head: 13, lvl: 25 },
  { name: 'Легенда', p: [21, 1, 28, 20, 27, 8, 9], run: 1, head: 13, lvl: 30 },
];
// цвет сегмента i: рисуется каждый второй сегмент («бусина»), полосы считаются по бусинам
export const segColor = (skin, i) => { const s = SKINS[skin] || SKINS[0]; return s.p[Math.floor((i >> 1) / s.run) % s.p.length]; };

// звания по длине — чувство роста за одну игру
export const TITLES = [
  [0, 'Малыш'], [60, 'Червячок'], [150, 'Змейка'], [350, 'Ужик'], [700, 'Полоз'], [1300, 'Питон'],
  [2200, 'Удав'], [3500, 'Анаконда'], [5500, 'Великий змей'], [8000, 'Змей Горыныч'], [12000, 'Легенда арены'],
];
export function titleOf(mass) {
  let i = 0;
  while (i + 1 < TITLES.length && mass >= TITLES[i + 1][0]) i++;
  return i;
}

export const BOT_NAMES = ['Шустрик', 'Пончик', 'Зигзаг', 'Кексик', 'Ракета', 'Бублик', 'Молния', 'Ириска',
  'Тортик', 'Шнурок', 'Пиксель', 'Фантик', 'Желейка', 'Комета', 'Бантик', 'Карамелька', 'Вжух',
  'Лапша', 'Носок', 'Колбаска', 'Мармелад', 'Спиралька', 'Кнопка', 'Зефирка', 'Хвостик', 'Чупик',
  'Вафелька', 'Сосиска', 'Тянучка', 'Мятка', 'Пряник', 'Сушка', 'Барбарис', 'Леденец', 'Пуговка',
  'Шарик', 'Кузя', 'Тошка', 'Вихрь', 'Гром', 'Буран', 'Тайфун', 'Смерч', 'Торнадо', 'Ураган',
  'Метеор', 'Астра', 'Орбита', 'Кварк', 'Байт', 'Глюк', 'Чип', 'Дракоша', 'Питоша', 'Удавчик',
  'Ужик', 'Кобра', 'Мамба', 'Ящерка', 'Тритон', 'Варан', 'Гекко', 'Хамелеон', 'Йогурт', 'Кефир',
  'Сырок', 'Блинчик', 'Оладушек', 'Пельмень', 'Вареник', 'Ватрушка', 'Плюшка', 'Булочка', 'Батон',
  'Круассан', 'Эклер', 'Пирожок', 'Компот', 'Морс', 'Лимонад', 'Мандарин', 'Киви', 'Банан',
  'Арбузик', 'Дынька', 'Вишенка', 'Черешня', 'Малинка', 'Клубничка', 'Ежевика', 'Черника',
  'Облепиха', 'Орешек', 'Фисташка', 'Миндаль', 'Зайка', 'Белка', 'Сова', 'Ёжик', 'Бобр', 'Енот',
  'Панда', 'Коала', 'Пингвин', 'Тюлень', 'Морж', 'Кашалот', 'Дельфин', 'Ламантин', 'Окапи'];

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const angDiff = (a, b) => { // a - b в диапазоне [-π, π]
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
};

// размеры змейки от массы — одни и те же у сервера и у клиента, который достраивает тела.
// До 900 толщина растёт быстро, дальше медленно: гиганты толстые, но не на пол-экрана.
export const radiusOf = (m) => (m <= 900 ? 9 + Math.sqrt(Math.max(0, m)) * 0.95 : 37.5 + 9 * Math.log(m / 900));
export const spacingOf = (m) => radiusOf(m) * 0.42;
export const bodyLenOf = (m) => 38 * Math.pow(Math.max(1, m), 0.55);
export const countOf = (m) => Math.max(6, Math.round(bodyLenOf(m) / spacingOf(m)));
export const foodRadiusOf = (v) => Math.min(13, 3.2 + Math.sqrt(v) * 2);

// каждый сегмент тянется за предыдущим на расстоянии sp
export function followChain(segs, sp) {
  const sp2 = sp * sp;
  for (let i = 1; i < segs.length; i++) {
    const p = segs[i - 1], q = segs[i];
    const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
    if (d2 > sp2) { const d = Math.sqrt(d2); q.x = p.x + dx / d * sp; q.y = p.y + dy / d * sp; }
  }
}
// рост и укорачивание — по сегменту за шаг, чтобы было плавно
export function fitLength(segs, n) {
  if (segs.length < n) { const t = segs[segs.length - 1]; segs.push({ x: t.x, y: t.y }); }
  else if (segs.length > n + 1) segs.pop();
}

// тело, уложенное плавной дугой назад от головы: длинные змеи появляются целиком, а не клубком
export function layBody(x, y, a, mass, curl, wig, ph) {
  const sp = spacingOf(mass), n = countOf(mass), segs = [{ x, y }];
  let dir = a + Math.PI, px = x, py = y;
  for (let i = 1; i < n; i++) {
    px += Math.cos(dir) * sp; py += Math.sin(dir) * sp;
    segs.push({ x: px, y: py });
    dir += sp * (curl + wig * Math.sin(i * sp / 260 + ph));
  }
  return segs;
}

export class Snake {
  constructor(id, x, y, mass, skin, name, human, team, a, segs) {
    this.id = id;
    this.name = name; this.skin = skin; this.human = human; this.team = team || 0;
    this.mass = mass; this.maxMass = mass; this.eaten = 0;
    this.a = a ?? Math.atan2(-y, -x) + rand(-1, 1);
    this.ta = this.a;
    this.boost = false; this.isBoosting = false;
    this.alive = true; this.inv = 0; this.age = 0;
    this.dropAcc = 0; this.thinkT = rand(0, 0.3);
    this.hunt = 0; this.huntTarget = 0; this.huntCd = rand(0, 3);
    this.pers = rand(0.4, 1.6);      // характер бота: насколько он задира
    this.goFeast = false;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.wander = this.a; this.kills = 0;
    this.r = radiusOf(mass);
    this.segs = segs || layBody(x, y, this.a, mass, 0, 0, 0);
  }
  get x() { return this.segs[0].x; }
  get y() { return this.segs[0].y; }
}

const OFFS = [0, 0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1];

export class World {
  // teams: змейки с одинаковым ненулевым team проходят друг сквозь друга (режим «семья против ботов»)
  constructor({ diff = 'easy', foodN = FOOD_N, bots = SNAKES_N - 1 } = {}) {
    this.diffKey = diff;
    this.D = DIFF[diff];
    this.targetBots = bots;
    this.foodN = foodN;
    this.snakes = [];
    this.foods = [];
    this.naturalCount = 0;
    this.respawnQueue = [];
    this.pending = [];
    this.events = [];
    this.nextSnakeId = 1;
    this.nextFoodId = 1;
    this.time = 0;
    this.byId = new Map();
    this.hunted = new Map();     // id змейки → сколько ботов на неё охотятся
    this.feast = null;           // { x, y, until }
    this.feastT = rand(20, 30);
    // для сервера: что изменилось с прошлой отправки
    this.track = false;
    this.foodAdded = [];
    this.foodRemoved = [];

    this.segHead = new Int32Array(G2);
    this.foodHead = new Int32Array(G2);
    this.segNext = new Int32Array(16384);
    this.segS = new Int32Array(16384);
    this.segK = new Int32Array(16384);
    this.foodNext = new Int32Array(16384);
    this.segHead.fill(-1); this.foodHead.fill(-1); // пустая сетка до первого шага

    for (let i = 0; i < foodN; i++) this.spawnNatural();
    for (let i = 0; i < this.targetBots; i++) this.spawnBot(true);
  }

  humans() { return this.snakes.filter((s) => s.human && s.alive); }

  // ---------- еда ----------
  addFood(x, y, v, c, life) {
    const d2 = x * x + y * y, lim = R - 15;
    if (d2 > lim * lim) { const k = lim / Math.sqrt(d2); x *= k; y *= k; }
    const f = { id: this.nextFoodId++, x, y, v, r: foodRadiusOf(v), c,
      ph: Math.random() * TAU, life: life || 0, age: 0, dead: false };
    this.foods.push(f);
    if (this.track) this.foodAdded.push(f);
    return f;
  }
  spawnNatural() {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * (R - 40);
    const roll = Math.random();
    this.addFood(Math.cos(a) * d, Math.sin(a) * d, roll < 0.7 ? 1 : roll < 0.93 ? 2 : 4,
      FOOD_COLORS[randi(0, FOOD_COLORS.length - 1)], 0);
    this.naturalCount++;
  }
  spawnFeast() {
    const p = this.randomSpot(R * 0.75, 200, this.humans(), 900);
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 300;
      this.addFood(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, rand(3, 7), i % 5 ? GOLD : FOOD_COLORS[randi(0, FOOD_COLORS.length - 1)], FEAST_LIFE);
    }
    this.feast = { x: p.x, y: p.y, until: this.time + FEAST_LIFE };
    for (const s of this.snakes) {
      if (!s.human) s.goFeast = Math.hypot(s.x - p.x, s.y - p.y) < 3200 && Math.random() < 0.4 * s.pers;
    }
    this.events.push({ type: 'feast', x: p.x, y: p.y, life: FEAST_LIFE });
  }

  // ---------- сетка ----------
  cellOf(x, y) {
    const cx = clamp(((x + GRID_OFF) / CELL) | 0, 0, GRID_N - 1);
    const cy = clamp(((y + GRID_OFF) / CELL) | 0, 0, GRID_N - 1);
    return cy * GRID_N + cx;
  }
  growSeg(n) {
    const sz = Math.max(n, this.segS.length * 2);
    const a = new Int32Array(sz), b = new Int32Array(sz), c = new Int32Array(sz);
    a.set(this.segNext); b.set(this.segS); c.set(this.segK);
    this.segNext = a; this.segS = b; this.segK = c;
  }
  buildGrids() {
    this.segHead.fill(-1);
    let m = 0;
    for (let si = 0; si < this.snakes.length; si++) {
      const s = this.snakes[si];
      if (!s.alive || s.inv > 0) continue; // неуязвимый — «призрак»
      const segs = s.segs;
      if (m + segs.length > this.segS.length) this.growSeg(m + segs.length);
      for (let k = 0; k < segs.length; k++) {
        const c = this.cellOf(segs[k].x, segs[k].y);
        this.segS[m] = si; this.segK[m] = k; this.segNext[m] = this.segHead[c]; this.segHead[c] = m; m++;
      }
    }
    this.foodHead.fill(-1);
    if (this.foods.length > this.foodNext.length) this.foodNext = new Int32Array(this.foods.length * 2);
    for (let i = 0; i < this.foods.length; i++) {
      const c = this.cellOf(this.foods[i].x, this.foods[i].y);
      this.foodNext[i] = this.foodHead[c]; this.foodHead[c] = i;
    }
  }

  // ---------- появление ----------
  isSafe(x, y, minDist) {
    const md2 = minDist * minDist;
    for (const s of this.snakes) {
      if (!s.alive) continue;
      for (let k = 0; k < s.segs.length; k += 2) {
        const dx = s.segs[k].x - x, dy = s.segs[k].y - y;
        if (dx * dx + dy * dy < md2) return false;
      }
    }
    return true;
  }
  randomSpot(maxR, minDist, away, awayDist) {
    let best = null;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * maxR;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      best = { x, y };
      if (away.some((h) => Math.hypot(h.x - x, h.y - y) < awayDist)) continue;
      if (this.isSafe(x, y, minDist)) return best;
    }
    return best;
  }
  pickName() {
    const used = new Set(this.snakes.filter((s) => s.alive).map((s) => s.name));
    const free = BOT_NAMES.filter((n) => !used.has(n));
    return free.length ? free[randi(0, free.length - 1)] : BOT_NAMES[randi(0, BOT_NAMES.length - 1)];
  }
  addSnake(s) {
    this.snakes.push(s);
    this.byId.set(s.id, s);
    return s;
  }
  botMass(initial) {
    const D = this.D, [lo, hi] = D.mass;
    if (initial) return lo * Math.pow(hi / lo, Math.pow(Math.random(), 1.7));
    let giants = 0;
    for (const s of this.snakes) if (!s.human && s.alive && s.mass >= D.giantMin) giants++;
    if (giants < D.giants && Math.random() < 0.5) return rand(D.giantMin, hi * 0.8);
    return lo * Math.pow(hi / lo, Math.pow(Math.random(), 3));
  }
  // место для бота: всё тело внутри арены, далеко от игроков и не поперёк чужой головы
  placeBot(mass) {
    const humans = this.humans(), L = bodyLenOf(mass), r = radiusOf(mass);
    const curl = L > 500 ? (1.1 * Math.PI) / L : 0;
    let segs = null, a = 0;
    for (let t = 0; t < 30; t++) {
      const pa = Math.random() * TAU, pd = Math.sqrt(Math.random()) * R * 0.9;
      const x = Math.cos(pa) * pd, y = Math.sin(pa) * pd;
      a = Math.atan2(-y, -x) + rand(-1.3, 1.3);
      segs = layBody(x, y, a, mass, curl * (Math.random() < 0.5 ? -1 : 1), 1 / 500, rand(0, TAU));
      let ok = this.isSafe(x, y, 250 + r);
      for (let k = 0; ok && k < segs.length; k += 3) {
        const q = segs[k];
        if (q.x * q.x + q.y * q.y > (R - r - 40) ** 2) ok = false;
        else for (const h of humans) if (Math.hypot(h.x - q.x, h.y - q.y) < 900) { ok = false; break; }
      }
      if (ok) break;
    }
    return { segs, a };
  }
  spawnBot(initial) {
    const mass = this.botMass(initial);
    const { segs, a } = this.placeBot(mass);
    return this.addSnake(new Snake(this.nextSnakeId++, segs[0].x, segs[0].y, mass,
      randi(0, SKINS.length - 1), this.pickName(), false, 0, a, segs));
  }
  addHuman({ name, skin, team = 0, mass = START_MASS, inv = 2 }) {
    let p = null;
    const mate = team ? this.humans().find((h) => h.team === team) : null;
    if (mate) { // в команде появляемся рядом со своими
      for (let i = 0; i < 25 && !p; i++) {
        const a = Math.random() * TAU, d = rand(250, 500);
        const x = mate.x + Math.cos(a) * d, y = mate.y + Math.sin(a) * d;
        if (x * x + y * y < (R * 0.8) ** 2 && this.isSafe(x, y, 300)) p = { x, y };
      }
    }
    if (!p) p = this.randomSpot(R * 0.7, 550, [], 0);
    const s = new Snake(this.nextSnakeId++, p.x, p.y, mass, skin, name, true, team);
    s.inv = inv;
    return this.addSnake(s);
  }

  // ---------- смерть ----------
  kill(s, killer) {
    if (!s.alive) return;
    s.alive = false;
    const total = Math.max(4, s.mass * 0.75);
    const n = Math.min(Math.round(s.segs.length * 1.2), Math.max(3, Math.round(total / 3)));
    const step = s.segs.length / n, v = total / n;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(i * step), p = s.segs[k];
      this.addFood(p.x + rand(-0.7, 0.7) * s.r, p.y + rand(-0.7, 0.7) * s.r, v, segColor(s.skin, k), 45);
    }
    const by = killer && killer.alive ? killer : null;
    if (by) by.kills++;
    this.events.push({ type: 'kill', victim: s, killer: by, vm: s.mass, km: by ? by.mass : 0 });
  }

  // ---------- ИИ ботов ----------
  rayDanger(b, bi, a, look) {
    const step = Math.max(16, b.r * 0.9);
    const ca = Math.cos(a), sa = Math.sin(a);
    const edge = R - b.r - 30, edge2 = edge * edge;
    const { segHead, segNext, segS, segK, snakes } = this;
    for (let d = step; d <= look; d += step) {
      const px = b.x + ca * d, py = b.y + sa * d;
      if (px * px + py * py > edge2) return 1.1 - d / look;
      for (let it = segHead[this.cellOf(px, py)]; it >= 0; it = segNext[it]) {
        if (segS[it] === bi) continue;
        const o = snakes[segS[it]], q = o.segs[segK[it]];
        const dx = q.x - px, dy = q.y - py, rr = o.r + b.r + 8;
        if (dx * dx + dy * dy < rr * rr) return 1.1 - d / look;
      }
    }
    return 0;
  }
  // головы соседей в радиусе rad вместе со скоростью — чтобы не столкнуться лоб в лоб
  nearHeads(b, bi, rad) {
    const out = [], D = this.D, r2 = rad * rad;
    const cr = Math.ceil(rad / CELL);
    const c0 = this.cellOf(b.x, b.y), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
    const { segHead, segNext, segS, segK, snakes } = this;
    for (let cy = Math.max(0, cy0 - cr); cy <= Math.min(GRID_N - 1, cy0 + cr); cy++) {
      for (let cx = Math.max(0, cx0 - cr); cx <= Math.min(GRID_N - 1, cx0 + cr); cx++) {
        for (let it = segHead[cy * GRID_N + cx]; it >= 0; it = segNext[it]) {
          if (segK[it] !== 0 || segS[it] === bi) continue;
          const o = snakes[segS[it]];
          const dx = o.x - b.x, dy = o.y - b.y;
          if (dx * dx + dy * dy > r2) continue;
          const v = (o.isBoosting ? BOOST_SPEED : BASE_SPEED) * (o.human ? 1 : D.speed);
          out.push({ x: o.x, y: o.y, r: o.r, vx: Math.cos(o.a) * v, vy: Math.sin(o.a) * v });
        }
      }
    }
    return out;
  }
  // кого подрезать: ближайшую змейку в радиусе охоты; на игрока — не больше maxHunters ботов сразу
  pickTarget(b) {
    const D = this.D;
    let best = null, bs = Infinity;
    for (const s of this.snakes) {
      if (s === b || !s.alive || s.inv > 0) continue;
      const d = Math.hypot(s.x - b.x, s.y - b.y);
      if (d > D.huntRange) continue;
      const n = this.hunted.get(s.id) || 0;
      let w;
      if (s.human) {
        if (s.age <= D.grace || n >= D.maxHunters || Math.random() > D.humanAggr) continue;
        w = 1;
      } else {
        if (n >= 2) continue;
        w = s.mass > b.mass * 4 ? 1.6 : 1; // на гиганта лезут неохотно, но лезут
      }
      if (d * w < bs) { bs = d * w; best = s; }
    }
    return best;
  }
  think(b, bi) {
    const D = this.D;
    const hx = b.x, hy = b.y;
    let desired;
    b.boost = false;

    let P = null;
    if (b.hunt > 0) {
      P = this.byId.get(b.huntTarget) || null;
      if (P && (!P.alive || P.inv > 0 || Math.hypot(P.x - hx, P.y - hy) > D.huntRange * 1.8)) P = null;
      if (!P) { b.hunt = 0; b.huntCd = rand(0.5, 1.5) * D.rest / b.pers; }
    }
    if (!P && b.huntCd <= 0 && b.mass > 25 && Math.random() < D.aggr * b.pers * 0.5) {
      P = this.pickTarget(b);
      if (P) { b.hunt = rand(2.5, 6); b.huntTarget = P.id; this.hunted.set(P.id, (this.hunted.get(P.id) || 0) + 1); }
      else b.huntCd = rand(0.5, 1.5);
    }

    if (P) {
      const dx = P.x - hx, dy = P.y - hy, dist = Math.hypot(dx, dy);
      const pc = Math.cos(P.a), ps = Math.sin(P.a);
      const along = -(dx * pc + dy * ps);     // > 0 — бот впереди головы цели
      const lat = dx * ps - dy * pc;          // с какой стороны от цели бот
      const side = lat >= 0 ? 1 : -1;
      const canBoost = b.mass > 30 && Math.random() < D.boost;
      if (D.encircle && b.mass > P.mass * 3 && dist < 320 && bodyLenOf(b.mass) > TAU * Math.max(dist, 80) * 1.15) {
        desired = Math.atan2(dy, dx) + b.side * (Math.PI / 2 - 0.35); // кружим и сжимаем кольцо
      } else if (along < 40) {
        // догоняем сбоку и обгоняем
        const gap = b.r + P.r + 50, lead = clamp(dist * 0.6, 90, 320);
        desired = Math.atan2(P.y + ps * lead + pc * side * gap - hy, P.x + pc * lead - ps * side * gap - hx);
        if (canBoost && along > -600 && Math.abs(lat) < 520) b.boost = true;
      } else {
        // обогнали — заворачиваем поперёк пути цели
        const lead = 50 + along * 0.4;
        desired = Math.atan2(P.y + ps * lead - hy, P.x + pc * lead - hx);
        if (canBoost && Math.abs(lat) < 380) b.boost = true;
      }
    } else {
      // ищем еду
      const view = D.look * 1.4 + b.r * 4;
      const cr = Math.ceil(view / CELL);
      const c0 = this.cellOf(hx, hy), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
      const ca = Math.cos(b.a), sa = Math.sin(b.a);
      let best = -1, bx = 0, by = 0, bv = 0, bd = 0;
      for (let cy = Math.max(0, cy0 - cr); cy <= Math.min(GRID_N - 1, cy0 + cr); cy++) {
        for (let cx = Math.max(0, cx0 - cr); cx <= Math.min(GRID_N - 1, cx0 + cr); cx++) {
          for (let i = this.foodHead[cy * GRID_N + cx]; i >= 0; i = this.foodNext[i]) {
            const f = this.foods[i];
            if (!f || f.dead) continue;
            const dx = f.x - hx, dy = f.y - hy, d = Math.sqrt(dx * dx + dy * dy) + 1;
            if (d > view) continue;
            const sc = f.v / (d + 40) * (1.3 + (dx * ca + dy * sa) / d);
            if (sc > best) { best = sc; bx = f.x; by = f.y; bv = f.v; bd = d; }
          }
        }
      }
      const F = this.feast;
      if (F && b.goFeast && Math.hypot(F.x - hx, F.y - hy) > 260 && bv < 3) desired = Math.atan2(F.y - hy, F.x - hx);
      else if (best > 0) {
        desired = Math.atan2(by - hy, bx - hx);
        // за богатой едой (останки змей, пир) — с ускорением
        if (bv >= 3 && bd < 380 && b.mass > 40 && Math.random() < D.boost * 0.35 * b.pers) b.boost = true;
      } else { b.wander += rand(-0.6, 0.6); desired = b.wander; }
      if (hx * hx + hy * hy > (R * 0.88) ** 2) desired = Math.atan2(-hy, -hx) + rand(-0.5, 0.5);
    }

    const look = D.look * (1 + b.r / 50) * (b.boost ? 1.4 : 1);
    const heads = this.nearHeads(b, bi, look);
    const vb = (b.boost ? BOOST_SPEED : BASE_SPEED) * D.speed;
    let bestA = b.a, bestScore = -1e9, bestDg = 0, aheadDg = 0;
    const dOff = clamp(angDiff(desired, b.a), -2.1, 2.1);
    for (let i = -1; i < OFFS.length; i++) {
      const off = i < 0 ? dOff : OFFS[i];
      const a = b.a + off;
      const dg = this.rayDanger(b, bi, a, look);
      if (i === 0) aheadDg = dg;
      // чужие головы: где окажемся мы и они через 0,15–0,45 с
      let hd = 0;
      for (const o of heads) {
        for (let t = 0.15; t <= 0.46; t += 0.15) {
          const dx = b.x + Math.cos(a) * vb * t - (o.x + o.vx * t), dy = b.y + Math.sin(a) * vb * t - (o.y + o.vy * t);
          const rr = b.r + o.r + 45, d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) { hd = Math.max(hd, 1.2 - t - Math.sqrt(d2) / rr * 0.4); }
        }
      }
      const sc = Math.cos(angDiff(desired, a)) - Math.max(dg, hd) * 4 - Math.abs(off) * 0.05;
      if (sc > bestScore) { bestScore = sc; bestA = a; bestDg = dg; }
    }
    if (bestDg > 0.3) b.boost = false;                        // впереди тесно — не разгоняемся
    else if (D.flee && aheadDg > 0.55 && b.mass > 30) b.boost = true; // выскакиваем из ловушки
    b.ta = bestA;
  }

  // ---------- движение ----------
  moveSnake(s, dt) {
    const D = this.D;
    s.r = radiusOf(s.mass);
    const turn = 4.6 / (1 + (s.r - 11) / 28) * (s.human ? 1 : D.turn);
    const d = angDiff(s.ta, s.a), mt = turn * dt;
    s.a += d > mt ? mt : d < -mt ? -mt : d;

    const boosting = s.boost && s.mass > MIN_BOOST_MASS;
    s.isBoosting = boosting;
    const v = (boosting ? BOOST_SPEED : BASE_SPEED) * (s.human ? 1 : D.speed);
    const segs = s.segs, h = segs[0];
    h.x += Math.cos(s.a) * v * dt; h.y += Math.sin(s.a) * v * dt;
    if (boosting) {
      const loss = (5 + s.mass * 0.004) * dt;
      s.mass -= loss; s.dropAcc += loss;
      if (s.dropAcc > 2) {
        const k = segs.length - 1, t = segs[k];
        this.addFood(t.x + rand(-4, 4), t.y + rand(-4, 4), s.dropAcc * 0.75, segColor(s.skin, k), 30);
        s.dropAcc = 0;
      }
    }

    const hd = Math.hypot(h.x, h.y);
    if (hd > R - s.r) {
      if ((s.human && !D.edgeKills) || s.inv > 0) { // мягкий край: отталкивает к центру
        const k = (R - s.r) / hd;
        h.x *= k; h.y *= k;
        s.a += angDiff(Math.atan2(-h.y, -h.x), s.a) * Math.min(1, dt * 6);
      } else {
        this.pending.push([s, null]);
      }
    }

    followChain(segs, spacingOf(s.mass));
    fitLength(segs, countOf(s.mass));
    if (s.mass > s.maxMass) s.maxMass = s.mass;
    if (s.inv > 0) s.inv -= dt;
    if (s.huntCd > 0) s.huntCd -= dt;
    s.age += dt;
  }

  // ---------- шаг ----------
  step(dt) {
    this.time += dt;
    const snakes = this.snakes;
    for (const s of snakes) if (s.alive) this.moveSnake(s, dt);
    this.buildGrids();
    const { segHead, segNext, segS, segK } = this;

    this.hunted.clear();
    for (const s of snakes) {
      if (s.human || !s.alive || s.hunt <= 0) continue;
      this.hunted.set(s.huntTarget, (this.hunted.get(s.huntTarget) || 0) + 1);
    }
    for (let i = 0; i < snakes.length; i++) {
      const b = snakes[i];
      if (b.human || !b.alive) continue;
      if (b.hunt > 0) { b.hunt -= dt; if (b.hunt <= 0) b.huntCd = rand(0.5, 1.5) * this.D.rest / b.pers; }
      b.thinkT -= dt;
      if (b.thinkT <= 0) { this.think(b, i); b.thinkT = this.D.react * rand(0.7, 1.3); }
    }

    // голова в чужое тело
    for (let si = 0; si < snakes.length; si++) {
      const s = snakes[si];
      if (!s.alive || s.inv > 0) continue;
      const h = s.segs[0];
      const c0 = this.cellOf(h.x, h.y), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
      let hit = null;
      for (let cy = cy0 - 1; cy <= cy0 + 1 && !hit; cy++) {
        if (cy < 0 || cy >= GRID_N) continue;
        for (let cx = cx0 - 1; cx <= cx0 + 1 && !hit; cx++) {
          if (cx < 0 || cx >= GRID_N) continue;
          for (let it = segHead[cy * GRID_N + cx]; it >= 0; it = segNext[it]) {
            if (segS[it] === si) continue;
            const o = snakes[segS[it]];
            if (s.team && o.team === s.team) continue; // свои не мешают
            const q = o.segs[segK[it]];
            const dx = q.x - h.x, dy = q.y - h.y, rr = s.r * 0.55 + o.r * 0.85;
            if (dx * dx + dy * dy < rr * rr) { hit = o; break; }
          }
        }
      }
      if (hit) this.pending.push([s, hit]);
    }

    // еда
    for (const s of snakes) {
      if (!s.alive) continue;
      const h = s.segs[0];
      const c0 = this.cellOf(h.x, h.y), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
      const reach = s.r + 40, reach2 = reach * reach, cr = reach > CELL ? 2 : 1;
      for (let cy = Math.max(0, cy0 - cr); cy <= Math.min(GRID_N - 1, cy0 + cr); cy++) {
        for (let cx = Math.max(0, cx0 - cr); cx <= Math.min(GRID_N - 1, cx0 + cr); cx++) {
          for (let i = this.foodHead[cy * GRID_N + cx]; i >= 0; i = this.foodNext[i]) {
            const f = this.foods[i];
            if (f.dead) continue;
            const dx = h.x - f.x, dy = h.y - f.y, d2 = dx * dx + dy * dy;
            if (d2 > reach2) continue;
            const er = s.r * 0.8 + f.r;
            if (d2 < er * er) {
              f.dead = true; s.mass += f.v; s.eaten += f.v;
              if (f.life === 0) this.naturalCount--;
            } else {
              const k = Math.min(1, dt * 7); // притягиваем к голове
              f.x += dx * k; f.y += dy * k;
            }
          }
        }
      }
    }

    for (const [s, k] of this.pending) this.kill(s, k);
    this.pending = [];

    const foods = this.foods;
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      if (!f.dead && f.life > 0) { f.age += dt; if (f.age > f.life) f.dead = true; }
      if (f.dead) {
        if (this.track) this.foodRemoved.push(f);
        foods[i] = foods[foods.length - 1]; foods.pop();
      }
    }
    for (let i = 0; i < 20 && this.naturalCount < this.foodN; i++) this.spawnNatural();

    // пир: время от времени где-то на арене появляется груда золотой еды
    this.feastT -= dt;
    if (this.feastT <= 0) { this.spawnFeast(); this.feastT = rand(50, 70); }
    if (this.feast && this.time > this.feast.until) this.feast = null;

    if (this.snakes.some((s) => !s.alive)) {
      for (const s of this.snakes) if (!s.alive) this.byId.delete(s.id);
      this.snakes = snakes.filter((s) => s.alive);
    }
    // держим нужное число ботов
    let bots = 0;
    for (const s of this.snakes) if (!s.human) bots++;
    for (let i = bots + this.respawnQueue.length; i < this.targetBots; i++) this.respawnQueue.push(rand(0.3, 1.2));
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      this.respawnQueue[i] -= dt;
      if (this.respawnQueue[i] <= 0) {
        this.respawnQueue.splice(i, 1);
        if (bots < this.targetBots) { this.spawnBot(false); bots++; }
      }
    }

    const ev = this.events;
    this.events = [];
    return ev;
  }
}
