// Общая логика игры: одиночная игра в браузере и комнаты на сервере используют один и тот же код.
// Здесь нет DOM и сети — только мир, змейки, еда, боты и столкновения.

// Версия протокола и файлов: при изменении любого файла в public/ поднять и здесь, и в sw.js (тест сверяет).
export const VERSION = '20';
export const TAU = Math.PI * 2;
export const R = 7000;                  // радиус арены (координаты по сети — Int16 / 4, предел 8191)
export const BASE_SPEED = 210;          // пикс/с — у «Малыша»; с каждым званием змейка быстрее, см. speedOf
export const BOOST_SPEED = 400;
export const SPEED_PER_TITLE = 0.035;   // прибавка к скорости за каждое звание
export const BOT_FEUD = 0.06;           // доля попыток охоты, в которых бот согласен подрезать другого бота: меньше — спокойнее арена
// Рывок дорогой: в секунду сгорает BOOST_SHARE всей длины, но не меньше BOOST_COST — едой по пути его не окупить,
// длинной змее он обходится в десятки длины в секунду. Половина потраченного остаётся едой позади.
export const BOOST_COST = 10;
export const BOOST_SHARE = 0.05;
export const BOOST_DROP = 0.5;
export const MIN_BOOST_MASS = 20;
export const START_MASS = 15;
export const SNAKES_N = 60;             // змей на арене вместе с игроками
export const FOOD_N = 4200;
export const FEAST_LIFE = 45;           // сколько секунд лежит пир
// Бабочки сами летают по арене и собирают еду в себя, растут от съеденного. Съесть бабочку может любая змея головой,
// но бабочка вёрткая: от головы, которая на неё смотрит, уходит вбок. Сквозь змей не летает — её прижимают телом
// или к краю. Толстая медленнее и хуже увёртывается. Пойманная высыпает всё собранное едой.
export const FLY_N = 40;                // бабочек на арене
export const FLY_MAX = 100;             // сколько еды вмещает бабочка
export const FLY_BASE = 3;              // столько стоит пустая бабочка
export const FLY_SPEED = 150;           // пикс/с — порхает (у полной на 30 % медленнее)
export const FLY_DART = 600;            // пикс/с — увёртка у пустой (у полной на 35 % медленнее)
export const FLY_SEE = 300;             // с какого расстояния до головы бабочка начинает увёртываться
export const flyK = (n) => Math.sqrt(clamp(n, 0, FLY_MAX) / FLY_MAX);
export const flyScale = (n) => 1.9 + 1.5 * flyK(n);   // рисунок: скобки радиусом 9,5 × масштаб
export const flyRadius = (n) => 8 * flyScale(n);      // для столкновений и еды
const CELL = 100;
// еда по сети раздаётся крупными клетками: игроку — только клетки вокруг него
export const FOOD_CELL = 1000;
export const FOOD_CELLS = Math.ceil((2 * R) / FOOD_CELL);
export const foodCellOf = (x, y) => clamp(Math.floor((y + R) / FOOD_CELL), 0, FOOD_CELLS - 1) * FOOD_CELLS +
  clamp(Math.floor((x + R) / FOOD_CELL), 0, FOOD_CELLS - 1);
const GRID_OFF = R + 200;
const GRID_N = Math.ceil((2 * GRID_OFF) / CELL);
const G2 = GRID_N * GRID_N;

// Крупный не охотится на мелкого: цель хотя бы на 30 % короче бота он не подрезает и засаду на неё не устраивает
export const PREY_GAP = 1.3;
export const preyFor = (b, s) => b.mass <= s.mass * PREY_GAP;
// с какого места в таблице боты охотятся на игрока всерьёз (см. heatOf)
export const RANK_HOT = 20;

// mass — разброс масс ботов при создании мира; giants — сколько ботов не меньше giantMin держать на арене.
// aggr — как часто бот ищет, кого подрезать; grace — секунд после появления игрока без охоты.
// Агрессия к игроку растёт с его местом в таблице: [ниже RANK_HOT, на месте RANK_HOT, на первом месте]
//   humanAggr — насколько охотно бот выбирает игрока целью (больше 1 — всегда, если игрок рядом и подходит по размеру),
//   maxHunters — сколько ботов сразу охотятся на одного игрока (засада тоже считается).
// rest — средняя пауза бота между охотами, с; foresee — на сколько секунд вперёд крупный бот просчитывает чужие головы
// (0 — только базовые 0,45 с): чем больше, тем труднее подрезать гиганта;
// wary — как часто бот замечает, что ему перерезают путь, и уходит вдоль чужого пути;
// keep — какая доля длины остаётся после «Продолжить» (0 — с самого начала).
export const DIFF = {
  easy: {
    label: 'Лёгкий', mass: [15, 2500], giants: 4, giantMin: 800,
    speed: 0.97, turn: 0.95, react: 0.2, look: 275,
    aggr: 0.3, humanAggr: [0, 0.7, 1], maxHunters: [1, 1, 2], grace: 10, huntRange: 480, boost: 0.55, rest: 6, foresee: 0, wary: 0.35,
    edgeKills: false, keep: 0.8,
  },
  medium: {
    label: 'Средний', mass: [15, 3500], giants: 5, giantMin: 1100,
    speed: 1, turn: 1, react: 0.13, look: 335,
    aggr: 0.55, humanAggr: [0.4, 0.85, 1.2], maxHunters: [1, 2, 3], grace: 6, huntRange: 640, boost: 0.8, rest: 4, foresee: 0.4, wary: 0.6,
    edgeKills: true, keep: 0.4,
  },
  hard: {
    label: 'Сложный', mass: [20, 6000], giants: 6, giantMin: 1800,
    speed: 1.03, turn: 1.08, react: 0.08, look: 410,
    aggr: 0.9, humanAggr: [0.9, 1.3, 1.7], maxHunters: [2, 4, 5], grace: 3, huntRange: 820, boost: 0.95, rest: 2, foresee: 0.9, wary: 0.85,
    edgeKills: true, keep: 0,
  },
};
// длина после «Продолжить»
export const keepMass = (diff, mass) => Math.max(START_MASS, mass * (DIFF[diff] || DIFF.easy).keep);

// Палитра: еда и сегменты змей ссылаются на цвет по номеру (так их дёшево передавать по сети).
export const PAL = [
  '#FF5A5F', '#FF8A3D', '#FFC93C', '#B6E35A', '#4CD07D', '#2EC4B6', '#3DB8F5', '#4F7CFF', // 0–7
  '#8B5CF6', '#D65DB1', '#FF7EB6', '#FFFFFF', '#2B2D42', '#FFD447', '#C9CED6', '#8A5A3B', // 8–15
  '#1E7A44', '#A8EBFF', '#FFE6B0', '#5E2CA5', '#22F0B4', '#FF3D7F', '#1B2A55', '#E8430C', // 16–23
  '#9EE7C9', '#FFB3C7', '#C7B6FF', '#7DF9FF', '#FFF27A', '#3A3F4B', '#B0F06A', '#FF9F1C', // 24–31
];
export const GOLD = 13;
export const FOOD_COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21, 27, 28];

// Раскраски — палитры по сегментам. Цвета дописываются в PAL (номер цвета уходит по сети одним байтом).
// p — номера цветов по кругу, run — бусин подряд одного цвета, head — цвет головы, stars — сколько звёзд нужно накопить, чтобы открыть.
// bounce — палитра идёт туда и обратно, чтобы цвета перетекали.
const palIdx = (hex) => { let k = PAL.indexOf(hex); if (k < 0) { k = PAL.length; PAL.push(hex); } return k; };
function skin(name, hexes, { bounce = false, head = hexes[0], stars = 0 } = {}) {
  const seq = bounce ? hexes.concat(hexes.slice(1, -1).reverse()) : hexes;
  return { name, p: seq.map(palIdx), run: 2, head: palIdx(head), stars };
}
export const SKINS = [
  skin('Радуга', ['#FF5A5F', '#FF8A3D', '#FFC93C', '#7ED957', '#2EC4B6', '#3D8BF5', '#8B5CF6']),
  skin('Пастельная радуга', ['#FFA8B5', '#FFC9A3', '#FFEFA3', '#C6F0A8', '#A8E6E0', '#B3CCFF', '#D4B8FF']),
  skin('Мороженое', ['#FFB3C7', '#FFF1C9', '#B5F2DA', '#B9D3FF', '#E3C8FF']),
  skin('Океан', ['#CFF5FA', '#90E0EF', '#48CAE4', '#00A6D6', '#0077B6', '#03508C'], { bounce: true, head: '#48CAE4' }),
  skin('Тутти-фрутти', ['#FF595E', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93'], { stars: 250 }),
  skin('Конфетка', ['#FF5D8F', '#FFE3EC', '#FF5D8F', '#B5F2DA'], { stars: 600 }),
  skin('Закат', ['#FFD166', '#FFA45B', '#FF6B6B', '#E05780', '#9D4EDD', '#6A2CB8'], { bounce: true, stars: 1600 }),
  skin('Лес', ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#95D5B2', '#C7EFCF'], { bounce: true, head: '#52B788', stars: 3000 }),
  skin('Осень', ['#8C1C13', '#BF4342', '#E05A1E', '#F48C06', '#FAA307', '#FFC93C'], { bounce: true, head: '#E05A1E', stars: 5850 }),
  skin('Ягоды', ['#3A0CA3', '#6A0DAD', '#9D1BB2', '#D61F8C', '#FF5D8F', '#FF9EBB'], { bounce: true, head: '#D61F8C', stars: 9600 }),
  skin('Северное сияние', ['#0E6B5C', '#1FAB89', '#62D2A2', '#A8F0C6', '#9A8CFF', '#6C4CD6'], { bounce: true, head: '#1FAB89', stars: 14250 }),
  skin('Павлин', ['#005F73', '#0A9396', '#94D2BD', '#E9D8A6', '#EE9B00', '#CA6702', '#9B2226'], { bounce: true, head: '#0A9396', stars: 21850 }),
];
// похожие раскраски: среднее расстояние до ближайшего цвета другой палитры в OKLab (обе стороны).
// Ниже SKIN_NEAR_D глазом на арене не различить (Пастельная радуга ~ Мороженое ≈ 0,04, Радуга ~ Закат ≈ 0,09).
// Бот не берёт раскраску человека и похожие на неё — иначе свою змейку легко спутать с чужой.
const SKIN_NEAR_D = 0.1;
const oklab = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757626 * q];
};
const skinLab = SKINS.map((s) => [...new Set(s.p)].map((k) => oklab(PAL[k])));
const coverOf = (A, B) => A.reduce((t, a) => t + Math.min(...B.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))), 0) / A.length;
export const skinDist = (i, j) => (coverOf(skinLab[i], skinLab[j]) + coverOf(skinLab[j], skinLab[i])) / 2;
// SKIN_NEAR[i] — раскраски, которые путаются с i (и сама i)
export const SKIN_NEAR = SKINS.map((_, i) => SKINS.map((_, j) => j).filter((j) => skinDist(i, j) < SKIN_NEAR_D));

// цвет сегмента i: рисуется каждый второй сегмент («бусина»), цвета считаются по бусинам
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

// скорость растёт ступенями — вместе со званием; ускорение прибавляет поменьше, чтобы гиганта всё ещё можно было обогнать
export function speedOf(mass, boosting) {
  const k = SPEED_PER_TITLE * titleOf(mass);
  return boosting ? BOOST_SPEED * (1 + k * 0.5) : BASE_SPEED * (1 + k);
}
// поворотливость, рад/с: толстая змейка поворачивает медленнее
export const turnOf = (r) => 7 / (1 + Math.max(0, r - 11) / 40);
// во сколько длины в секунду обходится рывок
export const boostCostOf = (m) => Math.max(BOOST_COST, m * BOOST_SHARE);
// сколько длины остаётся едой после проигрыша: у малышей — три четверти, у гигантов — заметно меньшая доля
export const remainsOf = (m) => (m <= 100 ? Math.max(4, m * 0.75) : 75 * Math.pow(m / 100, 0.75));

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

// тело, свёрнутое в точку: змейка «выползает» из неё по мере движения, а не возникает на арене целиком
export const coilBody = (x, y, mass) => Array.from({ length: countOf(mass) }, () => ({ x, y }));

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
    this.wander = this.a; this.kills = 0;
    // память бота: с какой стороны заходит на цель, куда ползёт за едой, кого заметил и на чьи останки идёт
    this.cau = rand(0.6, 1.3);       // осторожность: как часто замечает, что его подрезают
    this.hside = 0; this.huntT0 = 0;
    this.goalC = -1; this.goalT = 0; this.goalV = 0; this.ambTarget = 0; this.ambUntil = 0;
    this.mem = new Map();           // что бот решил о встрече (заметил угрозу, устроит засаду, пойдёт на останки) — на несколько секунд
    this.r = radiusOf(mass);
    this.segs = segs || layBody(x, y, this.a, mass, 0, 0, 0);
  }
  get x() { return this.segs[0].x; }
  get y() { return this.segs[0].y; }
}

const OFFS = [0, 0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1]; // резче не надо: луч прямой, а змея поворачивает дугой

// где пересекутся пути двух голов, идущих прямо: через t1 с туда доползёт первая, через t2 — вторая.
// null — пути параллельны или пересекаются позади
function crossing(bx, by, bvx, bvy, ox, oy, ovx, ovy) {
  const den = bvx * ovy - bvy * ovx;
  if (Math.abs(den) < 1e-6) return null;
  const dx = ox - bx, dy = oy - by;
  const t1 = (dx * ovy - dy * ovx) / den, t2 = (dx * bvy - dy * bvx) / den;
  return t1 > 0 && t2 > 0 ? [t1, t2] : null;
}

export class World {
  // teams: змейки с одинаковым ненулевым team проходят друг сквозь друга (режим «семья против ботов»)
  constructor({ diff = 'easy', foodN = FOOD_N, bots = SNAKES_N - 1, flies = FLY_N } = {}) {
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
    this.humanSkins = new Set(); // раскраски людей: боты их и похожие не берут
    this.nextFoodId = 1;
    this.time = 0;
    this.byId = new Map();
    this.hunted = new Map();     // id змейки → сколько ботов на неё охотятся
    this.huntSide = new Map();   // id змейки → с какой стороны заходит первый охотник
    this.deaths = [];            // недавние проигрыши: туда сползаются за останками
    this.feast = null;           // { x, y, until }
    this.feastT = rand(20, 30);
    this.flies = [];             // бабочки
    this.flyQueue = [];          // через сколько секунд прилетят новые бабочки взамен пойманных
    this.nextFlyId = 1;
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
    for (let i = 0; i < flies; i++) this.spawnFly(true);
  }

  humans() { return this.snakes.filter((s) => s.human && s.alive); }

  // ---------- еда ----------
  addFood(x, y, v, c, life) {
    const d2 = x * x + y * y, lim = R - 15;
    if (d2 > lim * lim) { const k = lim / Math.sqrt(d2); x *= k; y *= k; }
    const f = { id: this.nextFoodId++, x, y, v, r: foodRadiusOf(v), c,
      ph: Math.random() * TAU, life: life || 0, age: 0, dead: false, cell: foodCellOf(x, y) };
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

  // ---------- бабочки ----------
  spawnFly(initial) {
    const p = this.randomSpot(R * 0.92, 150, this.humans(), initial ? 0 : 900);
    const f = { id: this.nextFlyId++, x: p.x, y: p.y, vx: 0, vy: 0, dir: rand(0, TAU), n: 0, cnt: new Map(), top: [],
      dart: 0, cool: 0, gx: p.x, gy: p.y, gT: 0, ph: rand(0, TAU) };
    if (initial) { // в начале игры бабочки уже успели поесть — кто сколько
      const n = Math.round(Math.random() ** 2 * FLY_MAX * 0.8);
      const fav = [0, 1, 2].map(() => FOOD_COLORS[randi(0, FOOD_COLORS.length - 1)]);
      for (let i = 0; i < n; i++) this.flyEat(f, 1, fav[Math.random() < 0.6 ? 0 : Math.random() < 0.7 ? 1 : 2]);
    }
    this.flies.push(f);
    return f;
  }
  flyEat(f, v, c) {
    f.n = Math.min(FLY_MAX, f.n + v);
    f.cnt.set(c, (f.cnt.get(c) || 0) + v);
    f.top = [...f.cnt.keys()].sort((a, b) => f.cnt.get(b) - f.cnt.get(a)).slice(0, 5); // цвета крошек — что ела больше всего
  }
  // сколько места от точки до ближайшего тела (не дальше lim)
  segFree(x, y, lim) {
    const { segHead, segNext, segS, segK, snakes } = this;
    const c0 = this.cellOf(x, y), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0, cr = Math.ceil(lim / CELL);
    let best = lim;
    for (let cy = Math.max(0, cy0 - cr); cy <= Math.min(GRID_N - 1, cy0 + cr); cy++) {
      for (let cx = Math.max(0, cx0 - cr); cx <= Math.min(GRID_N - 1, cx0 + cr); cx++) {
        for (let it = segHead[cy * GRID_N + cx]; it >= 0; it = segNext[it]) {
          const o = snakes[segS[it]], q = o.segs[segK[it]];
          const d = Math.hypot(q.x - x, q.y - y) - o.r;
          if (d < best) best = d;
        }
      }
    }
    return best;
  }
  // увёртка: рывок поперёк хода змеи — в ту сторону, где свободнее
  flyDart(f, s) {
    const k = flyK(f.n), L = 160;
    let best = 0, bestFree = -1e9;
    for (const side of [-1, 1]) {
      for (const tilt of [0.25, 0.7]) {
        const a = s.a + side * (Math.PI / 2 - tilt * 0.6 + 0.1);
        const tx = f.x + Math.cos(a) * L, ty = f.y + Math.sin(a) * L;
        const free = Math.min(this.segFree(tx, ty, 200), R - 30 - Math.hypot(tx, ty)) + rand(0, 20);
        if (free > bestFree) { bestFree = free; best = a; }
      }
    }
    const v = FLY_DART * (1 - 0.35 * k);
    f.vx = Math.cos(best) * v; f.vy = Math.sin(best) * v;
    f.dart = 0.35; f.cool = rand(0.35, 0.5) * (1 + 0.5 * k);
  }
  // куда лететь: к богатой еде поблизости, а полной — просто порхать
  flyGoal(f) {
    f.gT = rand(1, 2);
    if (f.n < FLY_MAX) {
      const c0 = this.cellOf(f.x, f.y), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0, cr = 4;
      let best = 0, bc = -1;
      for (let cy = Math.max(0, cy0 - cr); cy <= Math.min(GRID_N - 1, cy0 + cr); cy++) {
        for (let cx = Math.max(0, cx0 - cr); cx <= Math.min(GRID_N - 1, cx0 + cr); cx++) {
          let v = 0, sx = 0, sy = 0;
          for (let i = this.foodHead[cy * GRID_N + cx]; i >= 0; i = this.foodNext[i]) {
            const q = this.foods[i];
            if (!q || q.dead) continue;
            v += q.v; sx += q.x * q.v; sy += q.y * q.v;
          }
          if (!v) continue;
          const x = sx / v, y = sy / v, sc = v / (Math.hypot(x - f.x, y - f.y) + 80);
          if (sc > best) { best = sc; bc = cy * GRID_N + cx; }
        }
      }
      // в лучшей клетке — к ближайшей крошке: к середине кучки нельзя, там бабочка зависает между крошками
      if (best > 0) {
        let bd = Infinity;
        for (let i = this.foodHead[bc]; i >= 0; i = this.foodNext[i]) {
          const q = this.foods[i];
          if (!q || q.dead) continue;
          const d2 = (q.x - f.x) ** 2 + (q.y - f.y) ** 2;
          if (d2 < bd) { bd = d2; f.gx = q.x; f.gy = q.y; }
        }
        return;
      }
    }
    const a = rand(0, TAU), d = rand(200, 700);
    f.gx = f.x + Math.cos(a) * d; f.gy = f.y + Math.sin(a) * d;
    const g = Math.hypot(f.gx, f.gy), lim = R * 0.9;
    if (g > lim) { f.gx *= lim / g; f.gy *= lim / g; }
  }
  stepFlies(dt) {
    const { segHead, segNext, segS, segK, snakes } = this;
    let maxR = 0;
    for (const s of snakes) if (s.alive && s.r > maxR) maxR = s.r;
    const dying = new Set(this.pending.map((p) => p[0]));
    for (let fi = this.flies.length - 1; fi >= 0; fi--) {
      const f = this.flies[fi], k = flyK(f.n), fr = flyRadius(f.n);
      f.cool -= dt;
      // голова близко и смотрит на бабочку (или совсем рядом) — увернуться от самой близкой такой
      if (f.cool <= 0) {
        let hs = null, hd = FLY_SEE + fr;
        for (const s of snakes) {
          if (!s.alive) continue;
          const d = Math.hypot(s.x - f.x, s.y - f.y) - s.r;
          if (d >= hd) continue;
          if (d < fr * 2.5 || Math.abs(angDiff(s.a, Math.atan2(f.y - s.y, f.x - s.x))) < 1.3) { hd = d; hs = s; }
        }
        if (hs) this.flyDart(f, hs);
      }
      if (f.dart > 0) f.dart -= dt;
      else {
        f.gT -= dt;
        if (f.gT <= 0 || (f.gx - f.x) ** 2 + (f.gy - f.y) ** 2 < 1600) this.flyGoal(f);
        const sp = FLY_SPEED * (1 - 0.3 * k), a = Math.atan2(f.gy - f.y, f.gx - f.x) + Math.sin(this.time * 5 + f.ph) * 0.6;
        const kk = Math.min(1, dt * 4);
        f.vx += (Math.cos(a) * sp - f.vx) * kk; f.vy += (Math.sin(a) * sp - f.vy) * kk;
      }
      f.x += f.vx * dt; f.y += f.vy * dt;
      // сквозь змей не летает: отскакивает от тел (голову не считаем — ею ловят)
      const c0 = this.cellOf(f.x, f.y), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
      const cr = Math.ceil((fr + maxR) / CELL);
      for (let cy = Math.max(0, cy0 - cr); cy <= Math.min(GRID_N - 1, cy0 + cr); cy++) {
        for (let cx = Math.max(0, cx0 - cr); cx <= Math.min(GRID_N - 1, cx0 + cr); cx++) {
          for (let it = segHead[cy * GRID_N + cx]; it >= 0; it = segNext[it]) {
            if (segK[it] < 2) continue;
            const o = snakes[segS[it]], q = o.segs[segK[it]];
            const dx = f.x - q.x, dy = f.y - q.y, rr = o.r + fr * 0.8, d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr || d2 < 1e-6) continue;
            const dd = Math.sqrt(d2), nx = dx / dd, ny = dy / dd, vn = f.vx * nx + f.vy * ny;
            f.x = q.x + nx * rr; f.y = q.y + ny * rr;
            if (vn < 0) { f.vx -= 1.6 * vn * nx; f.vy -= 1.6 * vn * ny; }
          }
        }
      }
      // край арены (после тел: прижатую к краю тело не выталкивает наружу)
      const d = Math.hypot(f.x, f.y), lim = R - fr - 10;
      if (d > lim) {
        const nx = f.x / d, ny = f.y / d, vn = f.vx * nx + f.vy * ny;
        f.x = nx * lim; f.y = ny * lim;
        if (vn > 0) { f.vx -= 1.6 * vn * nx; f.vy -= 1.6 * vn * ny; }
      }
      if (Math.abs(f.vx) + Math.abs(f.vy) > 10) f.dir = Math.atan2(f.vy, f.vx);
      // голова поймала (кто в этом шаге проиграл, тот уже не ловит)
      let by = null;
      for (const s of snakes) {
        if (!s.alive || s.inv > 0 || dying.has(s)) continue;
        const rr = s.r * 0.8 + fr * 0.5;
        if ((s.x - f.x) ** 2 + (s.y - f.y) ** 2 < rr * rr) { by = s; break; }
      }
      if (by) { this.catchFly(f, by); this.flies.splice(fi, 1); continue; }
      // ест еду
      if (f.n >= FLY_MAX) continue;
      const fc = this.cellOf(f.x, f.y), fx0 = fc % GRID_N, fy0 = (fc / GRID_N) | 0;
      for (let cy = Math.max(0, fy0 - 1); cy <= Math.min(GRID_N - 1, fy0 + 1); cy++) {
        for (let cx = Math.max(0, fx0 - 1); cx <= Math.min(GRID_N - 1, fx0 + 1); cx++) {
          for (let i = this.foodHead[cy * GRID_N + cx]; i >= 0; i = this.foodNext[i]) {
            const q = this.foods[i];
            if (!q || q.dead || f.n >= FLY_MAX) continue;
            const er = fr * 0.9 + q.r;
            if ((q.x - f.x) ** 2 + (q.y - f.y) ** 2 > er * er) continue;
            q.dead = true;
            if (q.life === 0) this.naturalCount--;
            this.flyEat(f, q.v, q.c);
          }
        }
      }
    }
  }
  // поймали: всё собранное высыпается едой в цветах крошек
  catchFly(f, s) {
    const total = FLY_BASE + f.n, m = clamp(Math.ceil(total / 6), 1, 16), v = total / m;
    const cols = f.top.length ? f.top : [GOLD], spread = 20 + total * 0.4;
    for (let i = 0; i < m; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * spread;
      this.addFood(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, v, cols[i % cols.length], 40);
    }
    this.flyQueue.push(rand(4, 10));
    this.events.push({ type: 'fly', x: f.x, y: f.y, by: s, v: total, c: cols[0] });
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
  // место для бота: всё тело внутри арены, далеко от игроков и не поперёк чужой головы.
  // Не нашлось — null (бот появится позже); при создании мира берём последнюю попытку.
  placeBot(mass, force) {
    const humans = this.humans(), L = bodyLenOf(mass), r = radiusOf(mass);
    const curl = L > 500 ? (1.1 * Math.PI) / L : 0;
    const heads = this.snakes.filter((s) => s.alive).map((s) => s.segs[0]);
    let inside = null;
    for (let t = 0; t < 30; t++) {
      const pa = Math.random() * TAU, pd = Math.sqrt(Math.random()) * R * 0.9;
      const x = Math.cos(pa) * pd, y = Math.sin(pa) * pd;
      const a = Math.atan2(-y, -x) + rand(-1.3, 1.3);
      const segs = layBody(x, y, a, mass, curl * (Math.random() < 0.5 ? -1 : 1), 1 / 500, rand(0, TAU));
      if (segs.some((q) => q.x * q.x + q.y * q.y > (R - r - 40) ** 2)) continue;
      inside = { segs, a };
      let ok = this.isSafe(x, y, 250 + r);
      for (let k = 0; ok && k < segs.length; k += 3) {
        const q = segs[k];
        for (const h of humans) if (Math.hypot(h.x - q.x, h.y - q.y) < 900) { ok = false; break; }
        for (const h of heads) if (ok && Math.abs(h.x - q.x) < 200 + r && Math.abs(h.y - q.y) < 200 + r) { ok = false; break; }
      }
      if (ok) return inside;
    }
    if (force && inside) return inside;
    if (!force) return null;
    const a = rand(0, TAU), d = rand(0, R * 0.3); // крайний случай: дугой недалеко от центра
    return { segs: layBody(Math.cos(a) * d, Math.sin(a) * d, a, mass, curl, 0, 0), a };
  }
  spawnBot(initial) {
    const mass = this.botMass(initial);
    // посреди игры бот выползает из точки — место ищем как для малыша, длинное тело укладывать негде и незачем
    const place = this.placeBot(initial ? mass : START_MASS, initial);
    if (!place) return null;
    const { segs, a } = place;
    // при создании мира тела лежат целиком; новички посреди игры выползают из точки —
    // длинное тело не возникает поперёк чужого пути
    return this.addSnake(new Snake(this.nextSnakeId++, segs[0].x, segs[0].y, mass,
      this.botSkin(), this.pickName(), false, 0, a, initial ? segs : coilBody(segs[0].x, segs[0].y, mass)));
  }
  // раскраска бота: не как у людей и не похожая; если людей столько, что похожие закрыли всё, — хотя бы не такая же
  botSkin() {
    const near = new Set(), own = this.humanSkins;
    for (const k of own) for (const j of SKIN_NEAR[k] || [k]) near.add(j);
    const all = SKINS.map((_, i) => i);
    let pool = all.filter((i) => !near.has(i));
    if (!pool.length) pool = all.filter((i) => !own.has(i));
    if (!pool.length) pool = all;
    return pool[randi(0, pool.length - 1)];
  }
  // keep — id змеек, которые кто-то уже видит: их не перекрашиваем, чтобы цвет не сменился на глазах
  addHuman({ name, skin, team = 0, mass = START_MASS, inv = 2, keep = null }) {
    if (!this.humanSkins.has(skin)) {
      this.humanSkins.add(skin);
      const near = new Set(SKIN_NEAR[skin] || [skin]);
      for (const b of this.snakes) if (!b.human && near.has(b.skin) && !(keep && keep.has(b.id))) b.skin = this.botSkin();
    }
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
    // игрок (и в начале, и после проигрыша) выползает из точки, а не появляется весь разом
    const s = new Snake(this.nextSnakeId++, p.x, p.y, mass, skin, name, true, team, undefined, coilBody(p.x, p.y, mass));
    s.inv = inv;
    return this.addSnake(s);
  }

  // ---------- смерть ----------
  kill(s, killer) {
    if (!s.alive) return;
    s.alive = false;
    const total = remainsOf(s.mass);
    const n = Math.min(Math.round(s.segs.length * 0.6), Math.max(3, Math.round(total / 4)));
    const step = s.segs.length / n, v = total / n;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(i * step), p = s.segs[k];
      this.addFood(p.x + rand(-0.7, 0.7) * s.r, p.y + rand(-0.7, 0.7) * s.r, v, segColor(s.skin, k), 45);
    }
    const by = killer && killer.alive ? killer : null;
    if (by) by.kills++;
    let cx = 0, cy = 0;                                      // куда сползаться: середина останков, а не голова
    for (const q of s.segs) { cx += q.x; cy += q.y; }
    this.deaths.push({ id: s.id, x: cx / s.segs.length, y: cy / s.segs.length, v: total, t: this.time });
    this.events.push({ type: 'kill', victim: s, killer: by, vm: s.mass, km: by ? by.mass : 0 });
  }

  // ---------- ИИ ботов ----------
  // Бот на каждом раздумье решает по порядку:
  // 1) угроза — чужая голова вот-вот проползёт поперёк его пути: уходит вдоль чужого пути, а не врезается;
  // 2) охота — подрезает цель: заходит сбоку с упреждением, вдвоём — с разных сторон, у края прижимает к стене,
  //    бросает погоню, если не догнать;
  // 3) засада — чужая голова сама идёт поперёк его тела: бот не сворачивает и дотягивает тело, при нужде рывком;
  // 4) еда — выбирает богатое место и держится его, на свежие останки сползается издалека, рывок — только когда окупится;
  // потом лучами обходит тела, край и чужие головы.
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
  nearHeads(b, rad) {
    const out = [], D = this.D, r2 = rad * rad;
    for (const o of this.snakes) {
      if (o === b || !o.alive || o.inv > 0) continue;
      const dx = o.x - b.x, dy = o.y - b.y;
      if (dx * dx + dy * dy > r2) continue;
      const v = speedOf(o.mass, o.isBoosting) * (o.human ? 1 : D.speed);
      out.push({ id: o.id, s: o, x: o.x, y: o.y, r: o.r, v, vx: Math.cos(o.a) * v, vy: Math.sin(o.a) * v });
    }
    return out;
  }
  // насколько боты злы на игрока: чем выше он в таблице, тем охотнее на него охотятся и тем больше охотников сразу
  heatOf(s) {
    const D = this.D, [p0, p1, p2] = D.humanAggr, [n0, n1, n2] = D.maxHunters, rk = s.rank || 99;
    if (rk > RANK_HOT) return { p: p0, n: n0 };
    const t = (RANK_HOT - rk) / (RANK_HOT - 1); // 0 — на месте RANK_HOT, 1 — на первом
    return { p: p1 + (p2 - p1) * t, n: Math.round(n1 + (n2 - n1) * t) };
  }
  // кого подрезать: ближайшую змейку в радиусе охоты, не намного короче себя; на игрока — не больше охотников, чем по heatOf
  pickTarget(b) {
    const D = this.D;
    let best = null, bs = Infinity;
    const feud = Math.random() < BOT_FEUD;
    for (const s of this.snakes) {
      if (s === b || !s.alive || s.inv > 0 || (!s.human && !feud) || !preyFor(b, s)) continue;
      const d = Math.hypot(s.x - b.x, s.y - b.y);
      if (d > D.huntRange) continue;
      const n = this.hunted.get(s.id) || 0;
      let w;
      if (s.human) {
        const h = this.heatOf(s);
        if (s.age <= D.grace || n >= h.n || Math.random() > h.p) continue;
        w = 1;
      } else {
        if (n >= 1) continue;
        w = s.mass > b.mass * 4 ? 1.6 : 1; // на гиганта лезут неохотно, но лезут
      }
      if (d * w < bs) { bs = d * w; best = s; }
    }
    return best;
  }
  // самая срочная угроза: чья голова пройдёт поперёк пути бота раньше него, и тело ещё будет лежать там,
  // когда бот доползёт. Заметить её успевает не каждый бот: вероятность — wary уровня и осторожность бота
  threatOf(b, heads, vb) {
    const D = this.D, bvx = Math.cos(b.a) * vb, bvy = Math.sin(b.a) * vb;
    let best = null, bt = 1.3;
    for (const o of heads) {
      const c = crossing(b.x, b.y, bvx, bvy, o.x, o.y, o.vx, o.vy);
      if (!c) continue;
      const [t1, t2] = c;
      if (t1 >= bt || t2 > t1 + 0.15 || t1 > t2 + bodyLenOf(o.s.mass) / o.v) continue;
      if (this.decide(b, 'a' + o.id, D.wary * b.cau)) { bt = t1; best = o; }
    }
    return best;
  }
  // засада: чья голова сама идёт поперёк тела бота — бот проходит точку раньше, и тело ещё лежит там, когда она доползёт
  ambushOf(b, heads, vb) {
    const D = this.D, bvx = Math.cos(b.a) * vb, bvy = Math.sin(b.a) * vb, body = bodyLenOf(b.mass) / vb;
    for (const o of heads) {
      const s = o.s;
      if (!preyFor(b, s)) continue;
      const mine = b.ambUntil > this.time && b.ambTarget === s.id ? 1 : 0;
      const h = s.human ? this.heatOf(s) : null;
      if (h ? s.age <= D.grace || h.p <= 0 || (this.hunted.get(s.id) || 0) - mine >= h.n : s.mass < 30) continue;
      const c = crossing(b.x, b.y, bvx, bvy, o.x, o.y, o.vx, o.vy);
      if (!c) continue;
      const [t1, t2] = c;
      if (t2 > 1.6 || t2 < t1 + 0.08 || t2 > t1 + body * 0.8) continue;
      // на бота — редко (как и охота друг на друга), на игрока — по задиристости уровня, месту игрока и характеру бота
      if (!this.decide(b, 'm' + o.id, h ? D.aggr * b.pers * Math.min(1.5, h.p / Math.max(0.1, D.humanAggr[1])) : BOT_FEUD * 3)) continue;
      // засада считается охотой: на игрока — не больше охотников, чем по heatOf
      if (!mine) this.hunted.set(s.id, (this.hunted.get(s.id) || 0) + 1);
      b.ambTarget = s.id; b.ambUntil = this.time + 0.6;
      return { o, t1, t2 };
    }
    return null;
  }
  // решение бота о встрече принимается один раз и держится 4 с — иначе он передумывал бы на каждом раздумье
  decide(b, key, p) {
    let m = b.mem.get(key);
    if (!m || m[1] < this.time) {
      if (b.mem.size > 24) for (const [k, v] of b.mem) if (v[1] < this.time) b.mem.delete(k);
      m = [Math.random() < p, this.time + 4];
      b.mem.set(key, m);
    }
    return m[0];
  }
  startHunt(b, P) {
    b.hunt = rand(2.5, 6); b.huntTarget = P.id; b.huntT0 = this.time;
    this.hunted.set(P.id, (this.hunted.get(P.id) || 0) + 1);
    const mate = this.huntSide.get(P.id);
    if (mate) { b.hside = -mate; return; } // второй охотник заходит с другой стороны
    const pc = Math.cos(P.a), ps = Math.sin(P.a);
    if (this.D.edgeKills && P.x * P.x + P.y * P.y > (R * 0.72) ** 2) {
      b.hside = ps * P.x - pc * P.y >= 0 ? 1 : -1;     // у края — со стороны центра: цели некуда свернуть, кроме стены
    } else {
      b.hside = (P.x - b.x) * ps - (P.y - b.y) * pc >= 0 ? 1 : -1; // с той стороны, где бот уже есть
    }
    this.huntSide.set(P.id, b.hside);
  }
  stopHunt(b) {
    if (this.huntSide.get(b.huntTarget) === b.hside) this.huntSide.delete(b.huntTarget);
    b.hunt = 0; b.huntCd = rand(0.5, 1.5) * this.D.rest / b.pers;
  }

  // еда: клетки сетки с едой, а не отдельные крошки. Цель держится, пока новая не окажется заметно лучше
  forage(b, heads) {
    const D = this.D, hx = b.x, hy = b.y;
    const view = D.look * 1.4 + b.r * 4, view2 = view * view;
    const cr = Math.ceil(view / CELL);
    const c0 = this.cellOf(hx, hy), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    // у чужой крупной головы не пасёмся
    const big = heads.filter((o) => o.s.mass > b.mass * 0.7);
    let best = 0, bc = -1, bx = 0, by = 0, bv = 0, keep = 0, kx = 0, ky = 0, kv = 0;
    for (let cy = Math.max(0, cy0 - cr); cy <= Math.min(GRID_N - 1, cy0 + cr); cy++) {
      for (let cx = Math.max(0, cx0 - cr); cx <= Math.min(GRID_N - 1, cx0 + cr); cx++) {
        const c = cy * GRID_N + cx;
        let v = 0, sx = 0, sy = 0;
        for (let i = this.foodHead[c]; i >= 0; i = this.foodNext[i]) {
          const f = this.foods[i];
          if (!f || f.dead) continue;
          v += f.v; sx += f.x * f.v; sy += f.y * f.v;
        }
        if (v === 0) continue;
        const fx = sx / v, fy = sy / v, dx = fx - hx, dy = fy - hy, d2 = dx * dx + dy * dy;
        if (d2 > view2) continue;
        const d = Math.sqrt(d2) + 1;
        let sc = Math.pow(v, 0.8) / (d + 60) * (1.25 + (dx * ca + dy * sa) / d);
        for (const o of big) if ((o.x - fx) ** 2 + (o.y - fy) ** 2 < (220 + o.r) ** 2) { sc *= 0.3; break; }
        if (c === b.goalC) { keep = sc * 1.4; kx = fx; ky = fy; kv = v; }
        if (sc > best) { best = sc; bc = c; bx = fx; by = fy; bv = v; }
      }
    }
    // наевшаяся бабочка рядом — погоняться; поймать трудно, поэтому ценим её дешевле еды
    let fly = null, fs = keep > best ? keep : best;
    for (const f of this.flies) {
      if (f.n < 15) continue;
      const dx = f.x - hx, dy = f.y - hy, d2 = dx * dx + dy * dy;
      if (d2 > view2 || big.some((o) => (o.x - f.x) ** 2 + (o.y - f.y) ** 2 < (220 + o.r) ** 2)) continue;
      const d = Math.sqrt(d2) + 1, sc = Math.pow(FLY_BASE + f.n, 0.8) / (d + 60) * (1.25 + (dx * ca + dy * sa) / d) * 0.5 * b.pers;
      if (sc > fs) { fs = sc; fly = f; }
    }
    if (fly) { b.goalC = -1; b.goalV = 0; return Math.atan2(fly.y + fly.vy * 0.3 - hy, fly.x + fly.vx * 0.3 - hx); }
    if (keep > 0 && keep >= best && this.time < b.goalT) { bx = kx; by = ky; bv = kv; }
    else if (bc >= 0) { b.goalC = bc; b.goalT = this.time + rand(1.5, 2.5); }
    else { b.goalC = -1; b.goalV = 0; return null; }
    b.goalV = bv;
    // за богатой едой — рывком, если рядом соперник и съеденное окупит рывок
    if (bv >= 6 && b.mass > 50) {
      const d = Math.hypot(bx - hx, by - hy), t = d / BOOST_SPEED;
      const rival = heads.some((o) => Math.hypot(o.x - bx, o.y - by) < d * 1.3);
      if (rival && d < 450 && bv * 0.6 > boostCostOf(b.mass) * t && Math.random() < D.boost * b.pers) b.boost = true;
    }
    return Math.atan2(by - hy, bx - hx);
  }

  think(b, bi) {
    const D = this.D;
    const hx = b.x, hy = b.y;
    let desired = null;
    b.boost = false;
    const look0 = D.look * (1 + b.r / 50);
    const heads = this.nearHeads(b, Math.max(look0 * 1.4, 600));
    const vb = speedOf(b.mass, false) * D.speed;

    let P = null;
    if (b.hunt > 0) {
      P = this.byId.get(b.huntTarget) || null;
      // цель пропала, ушла далеко или стала намного короче бота — бросаем
      if (P && (!P.alive || P.inv > 0 || !preyFor(b, P) || Math.hypot(P.x - hx, P.y - hy) > D.huntRange * 1.8)) P = null;
      // погоня без толку: за 3 с так и не поравнялись — бросаем
      if (P && this.time - b.huntT0 > 3) {
        const along = (hx - P.x) * Math.cos(P.a) + (hy - P.y) * Math.sin(P.a);
        if (along < -300) P = null;
      }
      if (!P) this.stopHunt(b);
    }

    // 1) угроза — важнее всего, кроме своей цели: к ней бот идёт наперерез намеренно
    const th = this.threatOf(b, heads, vb);
    if (th && (!P || th.id !== P.id)) {
      const side = Math.cos(th.s.a) * (hy - th.y) - Math.sin(th.s.a) * (hx - th.x) >= 0 ? 1 : -1;
      const along = th.s.a + side * 0.6, back = th.s.a + Math.PI - side * 0.6; // вдоль чужого пути или прочь от него
      desired = Math.abs(angDiff(along, b.a)) < Math.abs(angDiff(back, b.a)) ? along : back;
      b.goalC = -1;
    }

    if (desired === null && !P && b.huntCd <= 0 && b.mass > 60 && Math.random() < D.aggr * b.pers * 0.5) {
      P = this.pickTarget(b);
      if (P) this.startHunt(b, P);
      else b.huntCd = rand(0.5, 1.5);
    }

    if (desired === null && P) {
      // 2) охота
      const dx = P.x - hx, dy = P.y - hy, dist = Math.hypot(dx, dy);
      const pc = Math.cos(P.a), ps = Math.sin(P.a);
      const along = -(dx * pc + dy * ps);     // > 0 — бот впереди головы цели
      const lat = dx * ps - dy * pc;          // с какой стороны от цели бот
      const side = b.hside || (lat >= 0 ? 1 : -1);
      const canBoost = b.mass > 60 && Math.random() < D.boost;
      if (along < 40) {
        // догоняем сбоку с упреждением и обгоняем
        const gap = b.r + P.r + 50, lead = clamp(dist * 0.6, 90, 320);
        desired = Math.atan2(P.y + ps * lead + pc * side * gap - hy, P.x + pc * lead - ps * side * gap - hx);
        if (canBoost && along > -380 && Math.abs(lat) < 450) b.boost = true; // рывок — только когда уже рядом
      } else {
        // обогнали — заворачиваем поперёк пути цели
        const lead = 50 + along * 0.4;
        desired = Math.atan2(P.y + ps * lead - hy, P.x + pc * lead - hx);
        if (canBoost && Math.abs(lat) < 380) b.boost = true;
      }
    }

    if (desired === null) {
      // 3) засада
      const am = this.ambushOf(b, heads, vb);
      if (am) {
        desired = b.a;
        if (am.t2 - am.t1 < 0.35 && b.mass > 60 && Math.random() < D.boost) b.boost = true;
      }
    }

    if (desired === null) {
      // 4) еда: свежие останки, пир, богатое место рядом
      const F = this.feast;
      let sv = null;
      for (const e of this.deaths) {
        if (this.time - e.t > 3 || e.v < 40) continue;
        const d = Math.hypot(e.x - hx, e.y - hy);
        if (d > 1300 || d < 150) continue;
        if (this.decide(b, 's' + e.id, 0.35 + 0.35 * b.pers)) { sv = e; break; }
      }
      if (sv) {
        desired = Math.atan2(sv.y - hy, sv.x - hx);
        const d = Math.hypot(sv.x - hx, sv.y - hy);
        if (d < 700 && b.mass > 60 && sv.v * 0.5 > boostCostOf(b.mass) * d / BOOST_SPEED && Math.random() < D.boost * 0.5 * b.pers) b.boost = true;
      } else {
        desired = this.forage(b, heads);
        // к пиру — если под носом нет богатой еды
        if (F && b.goFeast && Math.hypot(F.x - hx, F.y - hy) > 300 && (desired === null || b.goalV < 3)) {
          desired = Math.atan2(F.y - hy, F.x - hx); b.boost = false;
        } else if (desired === null) {
          b.wander += rand(-0.25, 0.25) + angDiff(Math.atan2(-hy, -hx), b.wander) * 0.02; // неспешно, к центру
          desired = b.wander;
        }
      }
      if (hx * hx + hy * hy > (R * 0.88) ** 2) desired = Math.atan2(-hy, -hx) + rand(-0.5, 0.5);
    }

    // 5) обход препятствий
    const look = look0 * (b.boost ? 1.4 : 1);
    const vbb = speedOf(b.mass, b.boost) * D.speed;
    const tFar = 0.46 + D.foresee * clamp((b.r - 30) / 20, 0, 1); // гигант смотрит дальше: ему дольше отворачивать
    const prey = P ? P.id : 0;                                     // …но не от своей цели: к ней он и идёт наперерез
    const near = heads.filter((o) => (o.x - hx) ** 2 + (o.y - hy) ** 2 < look * look); // дальние головы за tFar не доползут
    let bestA = b.a, bestScore = -1e9, bestDg = 0;
    const dOff = clamp(angDiff(desired, b.a), -2.1, 2.1);
    for (let i = -1; i < OFFS.length; i++) {
      const off = i < 0 ? dOff : OFFS[i];
      const a = b.a + off;
      const dg = this.rayDanger(b, bi, a, look);
      // чужие головы: где окажемся мы и они через 0,15–0,45 с (крупный бот на среднем и сложном — до 1,35 с)
      let hd = 0;
      for (const o of near) {
        const tMax = o.id === prey ? 0.46 : tFar;
        for (let t = 0.15; t <= tMax; t += 0.15) {
          const dx = b.x + Math.cos(a) * vbb * t - (o.x + o.vx * t), dy = b.y + Math.sin(a) * vbb * t - (o.y + o.vy * t);
          const rr = b.r + o.r + 45, d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) { hd = Math.max(hd, 1.2 - Math.min(t, 0.8) - Math.sqrt(d2) / rr * 0.4); }
        }
      }
      const sc = Math.cos(angDiff(desired, a)) - Math.max(dg, hd) * 4 - Math.abs(off) * 0.05;
      if (sc > bestScore) { bestScore = sc; bestA = a; bestDg = dg; }
    }
    if (bestDg > 0.3) b.boost = false;                        // впереди тесно — не разгоняемся: на скорости не отвернуть
    b.ta = bestA;
  }

  // ---------- движение ----------
  moveSnake(s, dt) {
    const D = this.D;
    s.r = radiusOf(s.mass);
    const turn = turnOf(s.r) * (s.human ? 1 : D.turn);
    const d = angDiff(s.ta, s.a), mt = turn * dt;
    s.a += d > mt ? mt : d < -mt ? -mt : d;

    const boosting = s.boost && s.mass > MIN_BOOST_MASS;
    s.isBoosting = boosting;
    const v = speedOf(s.mass, boosting) * (s.human ? 1 : D.speed);
    const segs = s.segs, h = segs[0];
    h.x += Math.cos(s.a) * v * dt; h.y += Math.sin(s.a) * v * dt;
    if (boosting) {
      const loss = boostCostOf(s.mass) * dt;
      s.mass -= loss; s.dropAcc += loss;
      if (s.dropAcc > 2) {
        const k = segs.length - 1, t = segs[k];
        // пока хвост у самой головы (змейка ещё выползает из точки), сброс пропадает — иначе она тут же съест его сама
        if ((t.x - h.x) ** 2 + (t.y - h.y) ** 2 > (s.r * 2 + 80) ** 2) {
          this.addFood(t.x + rand(-4, 4), t.y + rand(-4, 4), s.dropAcc * BOOST_DROP, segColor(s.skin, k), 30);
        }
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

    // место игроков в таблице: от него зависит злость ботов (heatOf)
    for (const h of snakes) {
      if (!h.human || !h.alive) continue;
      let rk = 1;
      for (const s of snakes) if (s.alive && s.mass > h.mass) rk++;
      h.rank = rk;
    }
    this.hunted.clear(); this.huntSide.clear();
    for (const s of snakes) {
      if (s.human || !s.alive) continue;
      if (s.ambUntil > this.time) this.hunted.set(s.ambTarget, (this.hunted.get(s.ambTarget) || 0) + 1);
      if (s.hunt <= 0) continue;
      this.hunted.set(s.huntTarget, (this.hunted.get(s.huntTarget) || 0) + 1);
      if (!this.huntSide.has(s.huntTarget)) this.huntSide.set(s.huntTarget, s.hside);
    }
    while (this.deaths.length && this.time - this.deaths[0].t > 3) this.deaths.shift();
    for (let i = 0; i < snakes.length; i++) {
      const b = snakes[i];
      if (b.human || !b.alive) continue;
      if (b.hunt > 0) { b.hunt -= dt; if (b.hunt <= 0) this.stopHunt(b); }
      b.thinkT -= dt;
      if (b.thinkT <= 0) { this.think(b, i); b.thinkT = this.D.react * rand(0.7, 1.3); }
    }

    // голова в чужое тело
    let maxR = 0;
    for (const s of snakes) if (s.alive && s.r > maxR) maxR = s.r;
    for (let si = 0; si < snakes.length; si++) {
      const s = snakes[si];
      if (!s.alive || s.inv > 0) continue;
      const h = s.segs[0];
      const c0 = this.cellOf(h.x, h.y), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
      const cr = Math.ceil((s.r * 0.55 + maxR * 0.85) / CELL);
      let hit = null;
      for (let cy = cy0 - cr; cy <= cy0 + cr && !hit; cy++) {
        if (cy < 0 || cy >= GRID_N) continue;
        for (let cx = cx0 - cr; cx <= cx0 + cr && !hit; cx++) {
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

    this.stepFlies(dt);

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
    for (let i = this.flyQueue.length - 1; i >= 0; i--) {
      this.flyQueue[i] -= dt;
      if (this.flyQueue[i] <= 0) { this.flyQueue.splice(i, 1); this.spawnFly(false); }
    }

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
        if (bots < this.targetBots && this.spawnBot(false)) bots++;
      }
    }

    const ev = this.events;
    this.events = [];
    return ev;
  }
}
