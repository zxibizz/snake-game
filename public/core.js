// Общая логика игры: одиночная игра в браузере и комнаты на сервере используют один и тот же код.
// Здесь нет DOM и сети — только мир, змейки, еда, боты и столкновения.

export const TAU = Math.PI * 2;
export const R = 2400;                  // радиус арены
export const BASE_SPEED = 165;          // пикс/с
export const BOOST_SPEED = 320;
export const MIN_BOOST_MASS = 12;
export const START_MASS = 15;
export const HUNT_GRACE = 5;            // секунд после появления игрока без охоты
export const FOOD_N = 1300;
const CELL = 100;
const GRID_OFF = R + 200;
const GRID_N = Math.ceil((2 * GRID_OFF) / CELL);
const G2 = GRID_N * GRID_N;

export const DIFF = {
  easy: {
    label: 'Лёгкий', bots: 12, mass: [10, 70], speed: 0.8, turn: 0.85, react: 0.3, look: 150,
    aggr: 0, maxHunters: 0, huntRange: 0, boost: 0, encircle: false, kind: true,
    edgeKills: false, respawn: true,
  },
  medium: {
    label: 'Средний', bots: 16, mass: [10, 160], speed: 0.93, turn: 0.95, react: 0.17, look: 230,
    aggr: 0.35, maxHunters: 2, huntRange: 320, boost: 0.25, encircle: false, kind: false,
    edgeKills: true, respawn: false,
  },
  hard: {
    label: 'Сложный', bots: 22, mass: [20, 300], speed: 1, turn: 1.05, react: 0.08, look: 320,
    aggr: 0.9, maxHunters: 4, huntRange: 650, boost: 0.9, encircle: true, kind: false,
    edgeKills: true, respawn: false,
  },
};

// Палитра в тонах Material 3: [тело (тон 80), полоски (тон 60), обводка (тон 30)]
export const SKINS = [
  ['#8BD88D', '#4FA45A', '#00531A'],
  ['#A8C7FA', '#6A9CE8', '#0B3D91'],
  ['#FFB0CC', '#D97AA0', '#7A2950'],
  ['#F2D06B', '#C9A53D', '#5C4300'],
  ['#FFB68A', '#E08A55', '#6E2E00'],
  ['#CFBCFF', '#9D84E0', '#3F2A8A'],
  ['#7ED5E8', '#3FAFC4', '#004F5C'],
  ['#FFB4AB', '#E5807A', '#8C1D18'],
  ['#C4C7C5', '#8E918F', '#3A3D3B'],
  ['#B8DA6F', '#8AB043', '#2E4A00'],
];

export const BOT_NAMES = ['Шустрик', 'Пончик', 'Зигзаг', 'Кексик', 'Ракета', 'Бублик', 'Молния', 'Ириска',
  'Тортик', 'Шнурок', 'Пиксель', 'Фантик', 'Желейка', 'Комета', 'Бантик', 'Карамелька', 'Вжух',
  'Лапша', 'Носок', 'Колбаска', 'Мармелад', 'Спиралька', 'Кнопка', 'Зефирка', 'Хвостик', 'Чупик',
  'Вафелька', 'Сосиска', 'Тянучка', 'Мятка'];

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const angDiff = (a, b) => { // a - b в диапазоне [-π, π]
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
};

// размеры змейки от массы — одни и те же у сервера и у клиента, который достраивает тела
export const radiusOf = (m) => Math.min(40, 9 + Math.sqrt(m) * 0.95);
export const spacingOf = (m) => radiusOf(m) * 0.42;
export const bodyLenOf = (m) => 38 * Math.pow(m, 0.55);
export const countOf = (m) => Math.max(6, Math.round(bodyLenOf(m) / spacingOf(m)));

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

export class Snake {
  constructor(id, x, y, mass, skin, name, human, team) {
    this.id = id;
    this.name = name; this.skin = skin; this.human = human; this.team = team || 0;
    this.mass = mass; this.maxMass = mass;
    this.a = Math.atan2(-y, -x) + rand(-1, 1);
    this.ta = this.a;
    this.boost = false; this.isBoosting = false;
    this.alive = true; this.inv = 0; this.age = 0;
    this.dropAcc = 0; this.thinkT = rand(0, 0.3); this.hunt = 0; this.huntTarget = 0;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.wander = this.a; this.kills = 0;
    this.r = radiusOf(mass);
    this.segs = [];
    const sp = spacingOf(mass), n = countOf(mass);
    for (let i = 0; i < n; i++) this.segs.push({ x: x - Math.cos(this.a) * i * sp, y: y - Math.sin(this.a) * i * sp });
  }
  get x() { return this.segs[0].x; }
  get y() { return this.segs[0].y; }
}

const OFFS = [0, 0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1];

export class World {
  // teams: змейки с одинаковым ненулевым team проходят друг сквозь друга (режим «семья против ботов»)
  constructor({ diff = 'easy', foodN = FOOD_N } = {}) {
    this.diffKey = diff;
    this.D = DIFF[diff];
    this.targetBots = this.D.bots;
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
    // для сервера: что изменилось с прошлой отправки
    this.track = false;
    this.foodAdded = [];
    this.foodRemoved = [];
    this.spawned = [];

    this.segHead = new Int32Array(G2);
    this.foodHead = new Int32Array(G2);
    this.segNext = new Int32Array(8192);
    this.segS = new Int32Array(8192);
    this.segK = new Int32Array(8192);
    this.foodNext = new Int32Array(4096);

    for (let i = 0; i < foodN; i++) this.spawnNatural();
    for (let i = 0; i < this.targetBots; i++) this.spawnBot();
  }

  humans() { return this.snakes.filter((s) => s.human && s.alive); }

  // ---------- еда ----------
  addFood(x, y, v, skin, life) {
    const d2 = x * x + y * y, lim = R - 15;
    if (d2 > lim * lim) { const k = lim / Math.sqrt(d2); x *= k; y *= k; }
    const f = { id: this.nextFoodId++, x, y, v, r: Math.min(13, 3.2 + Math.sqrt(v) * 2), c: skin,
      ph: Math.random() * TAU, life: life || 0, age: 0, dead: false };
    this.foods.push(f);
    if (this.track) this.foodAdded.push(f);
    return f;
  }
  spawnNatural() {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * (R - 40);
    const roll = Math.random();
    this.addFood(Math.cos(a) * d, Math.sin(a) * d, roll < 0.7 ? 1 : roll < 0.93 ? 2 : 4, randi(0, SKINS.length - 1), 0);
    this.naturalCount++;
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
    if (this.track) this.spawned.push(s);
    return s;
  }
  spawnBot() {
    const p = this.randomSpot(R * 0.85, 250, this.humans(), 700);
    const [lo, hi] = this.D.mass;
    const mass = lo + (hi - lo) * Math.pow(Math.random(), 2);
    return this.addSnake(new Snake(this.nextSnakeId++, p.x, p.y, mass, randi(0, SKINS.length - 1), this.pickName(), false, 0));
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
    const n = Math.min(s.segs.length, Math.max(3, Math.round(total / 3)));
    const step = s.segs.length / n, v = total / n;
    for (let i = 0; i < n; i++) {
      const p = s.segs[Math.floor(i * step)];
      this.addFood(p.x + rand(-0.6, 0.6) * s.r, p.y + rand(-0.6, 0.6) * s.r, v, s.skin, 60);
    }
    if (killer && killer.alive) killer.kills++;
    this.events.push({ type: 'kill', victim: s, killer: killer && killer.alive ? killer : null });
  }

  // ---------- ИИ ботов ----------
  rayDanger(b, bi, a, look, kindZones) {
    const step = Math.max(16, b.r * 0.9);
    const ca = Math.cos(a), sa = Math.sin(a);
    const edge = R - b.r - 20, edge2 = edge * edge;
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
      for (const z of kindZones) {
        const dx = px - z.x, dy = py - z.y;
        if (dx * dx + dy * dy < z.r2) return 1.1 - d / look;
      }
    }
    return 0;
  }
  think(b, bi, humans, hunters) {
    const D = this.D;
    const hx = b.x, hy = b.y;
    let desired;
    b.boost = false;

    // охота: только на игроков, которые уже освоились после появления
    let P = null;
    if (b.hunt > 0) P = humans.find((h) => h.id === b.huntTarget && h.inv <= 0 && h.age > HUNT_GRACE) || null;
    if (!P) b.hunt = 0;
    if (D.aggr > 0 && b.hunt <= 0 && hunters.n < D.maxHunters && b.mass > 20 && Math.random() < D.aggr * 0.5) {
      let best = null, bd = D.huntRange;
      for (const h of humans) {
        if (h.inv > 0 || h.age <= HUNT_GRACE) continue;
        const d = Math.hypot(h.x - hx, h.y - hy);
        if (d < bd) { bd = d; best = h; }
      }
      if (best) { P = best; b.hunt = rand(2, 5); b.huntTarget = best.id; hunters.n++; }
    }
    if (P && Math.hypot(P.x - hx, P.y - hy) > D.huntRange * 1.6) { b.hunt = 0; P = null; }

    if (P) {
      const dx = P.x - hx, dy = P.y - hy, dist = Math.hypot(dx, dy);
      if (D.encircle && dist < 280 && bodyLenOf(b.mass) > TAU * Math.max(dist, 80) * 1.15) {
        desired = Math.atan2(dy, dx) + b.side * (Math.PI / 2 - 0.35); // кружим и сжимаем кольцо
      } else {
        const lead = clamp(dist * 0.7, 60, 260); // целимся перед головой игрока
        desired = Math.atan2(P.y + Math.sin(P.a) * lead - hy, P.x + Math.cos(P.a) * lead - hx);
        if (dist < 450 && b.mass > 30 && Math.random() < D.boost) b.boost = true;
      }
    } else {
      // ищем еду
      const view = D.look * 1.4 + b.r * 4;
      const cr = Math.ceil(view / CELL);
      const c0 = this.cellOf(hx, hy), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
      const ca = Math.cos(b.a), sa = Math.sin(b.a);
      let best = -1, bx = 0, by = 0;
      for (let cy = Math.max(0, cy0 - cr); cy <= Math.min(GRID_N - 1, cy0 + cr); cy++) {
        for (let cx = Math.max(0, cx0 - cr); cx <= Math.min(GRID_N - 1, cx0 + cr); cx++) {
          for (let i = this.foodHead[cy * GRID_N + cx]; i >= 0; i = this.foodNext[i]) {
            const f = this.foods[i];
            if (f.dead) continue;
            const dx = f.x - hx, dy = f.y - hy, d = Math.sqrt(dx * dx + dy * dy) + 1;
            if (d > view) continue;
            const sc = f.v / (d + 40) * (1.3 + (dx * ca + dy * sa) / d);
            if (sc > best) { best = sc; bx = f.x; by = f.y; }
          }
        }
      }
      if (best > 0) desired = Math.atan2(by - hy, bx - hx);
      else { b.wander += rand(-0.6, 0.6); desired = b.wander; }
      if (hx * hx + hy * hy > (R * 0.85) ** 2) desired = Math.atan2(-hy, -hx) + rand(-0.5, 0.5);
      if (D.kind) {
        for (const h of humans) {
          if (h.inv <= 0 && Math.hypot(h.x - hx, h.y - hy) < 260) { desired = Math.atan2(hy - h.y, hx - h.x); break; }
        }
      }
    }

    // добрые боты не лезут под нос игрокам
    const kindZones = [];
    if (D.kind) {
      for (const h of humans) {
        if (h.inv > 0 || Math.hypot(h.x - hx, h.y - hy) > D.look + 400) continue;
        const zr = 130 + h.r;
        kindZones.push({ x: h.x + Math.cos(h.a) * 120, y: h.y + Math.sin(h.a) * 120, r2: zr * zr });
      }
    }

    const look = D.look * (1 + b.r / 50);
    let bestA = b.a, bestScore = -1e9;
    const dOff = clamp(angDiff(desired, b.a), -2.1, 2.1);
    for (let i = -1; i < OFFS.length; i++) {
      const off = i < 0 ? dOff : OFFS[i];
      const a = b.a + off;
      const dg = this.rayDanger(b, bi, a, look, kindZones);
      const sc = Math.cos(angDiff(desired, a)) - dg * 4 - Math.abs(off) * 0.05;
      if (sc > bestScore) { bestScore = sc; bestA = a; }
    }
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
        const t = segs[segs.length - 1];
        this.addFood(t.x + rand(-4, 4), t.y + rand(-4, 4), s.dropAcc * 0.75, s.skin, 30);
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
    s.age += dt;
  }

  // ---------- шаг ----------
  step(dt) {
    this.time += dt;
    const snakes = this.snakes;
    for (const s of snakes) if (s.alive) this.moveSnake(s, dt);
    this.buildGrids();
    const { segHead, segNext, segS, segK } = this;

    const humans = this.humans();
    const hunters = { n: 0 };
    for (const s of snakes) if (!s.human && s.alive && s.hunt > 0) hunters.n++;
    for (let i = 0; i < snakes.length; i++) {
      const b = snakes[i];
      if (b.human || !b.alive) continue;
      if (b.hunt > 0) b.hunt -= dt;
      b.thinkT -= dt;
      if (b.thinkT <= 0) { this.think(b, i, humans, hunters); b.thinkT = this.D.react * rand(0.7, 1.3); }
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
      const reach = s.r + 40, reach2 = reach * reach;
      for (let cy = Math.max(0, cy0 - 1); cy <= Math.min(GRID_N - 1, cy0 + 1); cy++) {
        for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(GRID_N - 1, cx0 + 1); cx++) {
          for (let i = this.foodHead[cy * GRID_N + cx]; i >= 0; i = this.foodNext[i]) {
            const f = this.foods[i];
            if (f.dead) continue;
            const dx = h.x - f.x, dy = h.y - f.y, d2 = dx * dx + dy * dy;
            if (d2 > reach2) continue;
            const er = s.r * 0.8 + f.r;
            if (d2 < er * er) {
              f.dead = true; s.mass += f.v;
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
        if (this.track) this.foodRemoved.push(f.id);
        foods[i] = foods[foods.length - 1]; foods.pop();
      }
    }
    for (let i = 0; i < 8 && this.naturalCount < this.foodN; i++) this.spawnNatural();

    this.snakes = snakes.filter((s) => s.alive);
    // держим нужное число ботов
    const bots = this.snakes.filter((s) => !s.human).length;
    for (let i = bots + this.respawnQueue.length; i < this.targetBots; i++) this.respawnQueue.push(rand(1.5, 4));
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      this.respawnQueue[i] -= dt;
      if (this.respawnQueue[i] <= 0) {
        this.respawnQueue.splice(i, 1);
        if (this.snakes.filter((s) => !s.human).length < this.targetBots) this.spawnBot();
      }
    }

    const ev = this.events;
    this.events = [];
    return ev;
  }
}
