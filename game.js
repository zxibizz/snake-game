'use strict';
(() => {
const VERSION = '1';

// ---------- константы мира ----------
const TAU = Math.PI * 2;
const R = 2400;                 // радиус арены
const BASE_SPEED = 165;         // пикс/с
const BOOST_SPEED = 320;
const MIN_BOOST_MASS = 12;
const FOOD_N = 1300;            // обычной еды на арене
const START_MASS = 15;
const HUNT_GRACE = 5;          // секунд после появления игрока без охоты
const CELL = 100;
const GRID_OFF = R + 200;
const GRID_N = Math.ceil((2 * GRID_OFF) / CELL);

const DIFF = {
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

// [основной, полоски, обводка]
const SKINS = [
  ['#4ade80', '#166534', '#14532d'],
  ['#60a5fa', '#1e3a8a', '#172554'],
  ['#f472b6', '#9d174d', '#500724'],
  ['#facc15', '#a16207', '#422006'],
  ['#fb923c', '#9a3412', '#431407'],
  ['#a78bfa', '#5b21b6', '#2e1065'],
  ['#22d3ee', '#155e75', '#083344'],
  ['#f87171', '#991b1b', '#450a0a'],
  ['#e5e7eb', '#6b7280', '#1f2937'],
  ['#a3e635', '#3f6212', '#1a2e05'],
];

const BOT_NAMES = ['Шустрик', 'Пончик', 'Зигзаг', 'Кексик', 'Ракета', 'Бублик', 'Молния', 'Ириска',
  'Тортик', 'Шнурок', 'Пиксель', 'Фантик', 'Желейка', 'Комета', 'Бантик', 'Карамелька', 'Вжух',
  'Лапша', 'Носок', 'Колбаска', 'Мармелад', 'Спиралька', 'Кнопка', 'Зефирка', 'Хвостик', 'Чупик',
  'Вафелька', 'Сосиска', 'Тянучка', 'Мятка'];

// ---------- утилиты ----------
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { // a - b в диапазоне [-π, π]
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
};
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (t) => { t = Math.floor(t); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

// ---------- сохранение ----------
const save = { best: { easy: 0, medium: 0, hard: 0 }, name: '', skin: 0, sound: true };
try { Object.assign(save, JSON.parse(localStorage.getItem('zmeigrad') || '{}')); } catch (e) { /* приватный режим */ }
const persist = () => { try { localStorage.setItem('zmeigrad', JSON.stringify(save)); } catch (e) { /* ничего */ } };

// ---------- звук (синтез, без файлов) ----------
let actx = null;
let lastEatSound = 0;
function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
  }
  if (actx && actx.state === 'suspended') actx.resume();
}
function tone(f0, f1, dur, vol, type = 'sine', delay = 0) {
  if (!save.sound || !actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  eat() {
    const now = performance.now();
    if (now - lastEatSound < 70) return;
    lastEatSound = now;
    tone(520 + Math.random() * 220, 950, 0.06, 0.04, 'triangle');
  },
  die() { tone(420, 60, 0.6, 0.14, 'sawtooth'); },
  win() { tone(520, 1040, 0.14, 0.09, 'triangle'); tone(780, 1560, 0.18, 0.08, 'triangle', 0.12); },
};

// ---------- холст ----------
const canvas = $('c');
const ctx = canvas.getContext('2d');
const mini = $('mini');
const mctx = mini.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
}
window.addEventListener('resize', resize);
resize();

// фон — шестиугольники паттерном
function makeBgPattern() {
  const s = 2; // запас по чёткости
  const tw = 104, th = 180; // плитка со сдвинутыми шестиугольниками
  const c = document.createElement('canvas');
  c.width = tw * s; c.height = th * s;
  const g = c.getContext('2d');
  g.scale(s, s);
  g.fillStyle = '#121833'; g.fillRect(0, 0, tw, th);
  const hex = (cx, cy, r) => {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath(); g.fill();
  };
  g.fillStyle = '#19214a';
  const r = 56;
  for (const [x, y] of [[0, 0], [tw, 0], [tw / 2, th / 2], [0, th], [tw, th]]) hex(x, y, r);
  const p = ctx.createPattern(c, 'repeat');
  if (p.setTransform && window.DOMMatrix) p.setTransform(new DOMMatrix().scale(1 / s));
  return p;
}
const bgPattern = makeBgPattern();

// спрайты еды
const foodSprites = SKINS.map(([col]) => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.16, col);
  grd.addColorStop(0.33, col);
  grd.addColorStop(0.36, hexA(col, 0.35));
  grd.addColorStop(1, hexA(col, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
});

// ---------- состояние ----------
let state = 'menu';        // menu | play | paused | dead | over
let diffKey = 'easy';
let D = DIFF.easy;
let snakes = [];
let foods = [];
let naturalCount = 0;
let player = null;
let respawnQueue = [];
let time = 0, playTime = 0;
let demoFocus = null;
let deaths = 0;
let sessionBest = 0;
const cam = { x: 0, y: 0, z: 1 };

// ---------- змея ----------
let nextId = 1;
class Snake {
  constructor(x, y, mass, skin, name, isPlayer) {
    this.id = nextId++;
    this.name = name; this.skin = skin; this.isPlayer = isPlayer;
    this.mass = mass; this.maxMass = mass;
    this.a = Math.atan2(-y, -x) + rand(-1, 1);
    this.ta = this.a;
    this.boost = false; this.isBoosting = false;
    this.alive = true; this.inv = 0; this.age = 0;
    this.dropAcc = 0; this.thinkT = rand(0, 0.3); this.hunt = 0;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.wander = this.a; this.kills = 0;
    this.r = this.radius(); this.sp = this.r * 0.42;
    this.segs = [];
    const n = this.targetCount();
    for (let i = 0; i < n; i++) this.segs.push({ x: x - Math.cos(this.a) * i * this.sp, y: y - Math.sin(this.a) * i * this.sp });
  }
  get x() { return this.segs[0].x; }
  get y() { return this.segs[0].y; }
  radius() { return Math.min(40, 9 + Math.sqrt(this.mass) * 0.95); }
  bodyLen() { return 38 * Math.pow(this.mass, 0.55); }
  targetCount() { return Math.max(6, Math.round(this.bodyLen() / (this.radius() * 0.42))); }
}

// ---------- еда ----------
function addFood(x, y, v, skin, life) {
  const d2 = x * x + y * y, lim = R - 15;
  if (d2 > lim * lim) { const k = lim / Math.sqrt(d2); x *= k; y *= k; }
  foods.push({ x, y, v, r: Math.min(13, 3.2 + Math.sqrt(v) * 2), c: skin, ph: Math.random() * TAU, life: life || 0, age: 0, dead: false });
}
function spawnNatural() {
  const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * (R - 40);
  const roll = Math.random();
  addFood(Math.cos(a) * d, Math.sin(a) * d, roll < 0.7 ? 1 : roll < 0.93 ? 2 : 4, randi(0, SKINS.length - 1), 0);
  naturalCount++;
}

// ---------- сетки для столкновений ----------
const G2 = GRID_N * GRID_N;
const segHead = new Int32Array(G2);
const foodHead = new Int32Array(G2);
let segNext = new Int32Array(8192), segS = new Int32Array(8192), segK = new Int32Array(8192);
let foodNext = new Int32Array(4096);
let segCount = 0;
function cellOf(x, y) {
  const cx = clamp(((x + GRID_OFF) / CELL) | 0, 0, GRID_N - 1);
  const cy = clamp(((y + GRID_OFF) / CELL) | 0, 0, GRID_N - 1);
  return cy * GRID_N + cx;
}
function growSeg(n) {
  const sz = Math.max(n, segS.length * 2);
  const a = new Int32Array(sz), b = new Int32Array(sz), c = new Int32Array(sz);
  a.set(segNext); b.set(segS); c.set(segK);
  segNext = a; segS = b; segK = c;
}
function buildGrids() {
  segHead.fill(-1);
  let m = 0;
  for (let si = 0; si < snakes.length; si++) {
    const s = snakes[si];
    if (!s.alive || s.inv > 0) continue; // неуязвимый — «призрак»
    const segs = s.segs;
    if (m + segs.length > segS.length) growSeg(m + segs.length);
    for (let k = 0; k < segs.length; k++) {
      const c = cellOf(segs[k].x, segs[k].y);
      segS[m] = si; segK[m] = k; segNext[m] = segHead[c]; segHead[c] = m; m++;
    }
  }
  segCount = m;
  foodHead.fill(-1);
  if (foods.length > foodNext.length) foodNext = new Int32Array(foods.length * 2);
  for (let i = 0; i < foods.length; i++) {
    const c = cellOf(foods[i].x, foods[i].y);
    foodNext[i] = foodHead[c]; foodHead[c] = i;
  }
}

// ---------- появление ----------
function isSafe(x, y, minDist) {
  const md2 = minDist * minDist;
  for (const s of snakes) {
    if (!s.alive) continue;
    for (let k = 0; k < s.segs.length; k += 2) {
      const dx = s.segs[k].x - x, dy = s.segs[k].y - y;
      if (dx * dx + dy * dy < md2) return false;
    }
  }
  return true;
}
function randomSpot(maxR, minDist, awayFrom, awayDist) {
  let best = null;
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * maxR;
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    best = { x, y };
    if (awayFrom && Math.hypot(awayFrom.x - x, awayFrom.y - y) < awayDist) continue;
    if (isSafe(x, y, minDist)) return best;
  }
  return best;
}
function pickName() {
  const used = new Set(snakes.filter((s) => s.alive).map((s) => s.name));
  const free = BOT_NAMES.filter((n) => !used.has(n));
  return free.length ? free[randi(0, free.length - 1)] : BOT_NAMES[randi(0, BOT_NAMES.length - 1)];
}
function spawnBot() {
  const away = player && player.alive ? player : null;
  const p = randomSpot(R * 0.85, 250, away, 700);
  const [lo, hi] = D.mass;
  const mass = lo + (hi - lo) * Math.pow(Math.random(), 2);
  snakes.push(new Snake(p.x, p.y, mass, randi(0, SKINS.length - 1), pickName(), false));
}
function spawnPlayer(mass, inv) {
  const p = randomSpot(R * 0.7, 550, null, 0);
  const s = new Snake(p.x, p.y, mass, save.skin, save.name || 'Ты', true);
  s.inv = inv;
  player = s;
  snakes.push(s);
  cam.x = s.x; cam.y = s.y;
}

// ---------- смерть ----------
let pendingDeaths = [];
function kill(s, killer) {
  if (!s.alive) return;
  s.alive = false;
  const total = Math.max(4, s.mass * 0.75);
  const n = Math.min(s.segs.length, Math.max(3, Math.round(total / 3)));
  const step = s.segs.length / n, v = total / n;
  for (let i = 0; i < n; i++) {
    const p = s.segs[Math.floor(i * step)];
    addFood(p.x + rand(-0.6, 0.6) * s.r, p.y + rand(-0.6, 0.6) * s.r, v, s.skin, 60);
  }
  if (killer && killer.alive) {
    killer.kills++;
    if (killer === player) { sfx.win(); toast(`🎉 Победа над змейкой «${s.name}»!`); }
  }
  if (s === player) onPlayerDeath(s, killer);
  else respawnQueue.push(rand(1.5, 4));
}

// ---------- ИИ ботов ----------
const OFFS = [0, 0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1];
function rayDanger(b, bi, a, look, P, kindZone) {
  const step = Math.max(16, b.r * 0.9);
  const ca = Math.cos(a), sa = Math.sin(a);
  const edge = R - b.r - 20, edge2 = edge * edge;
  for (let d = step; d <= look; d += step) {
    const px = b.x + ca * d, py = b.y + sa * d;
    if (px * px + py * py > edge2) return 1.1 - d / look;
    for (let it = segHead[cellOf(px, py)]; it >= 0; it = segNext[it]) {
      if (segS[it] === bi) continue;
      const o = snakes[segS[it]], q = o.segs[segK[it]];
      const dx = q.x - px, dy = q.y - py, rr = o.r + b.r + 8;
      if (dx * dx + dy * dy < rr * rr) return 1.1 - d / look;
    }
    if (kindZone) {
      const dx = px - kindZone.x, dy = py - kindZone.y;
      if (dx * dx + dy * dy < kindZone.r2) return 1.1 - d / look;
    }
  }
  return 0;
}
function think(b, bi, hunters) {
  const P = player && player.alive && player.inv <= 0 ? player : null;
  const hx = b.x, hy = b.y;
  let desired;
  b.boost = false;

  if (P && D.aggr > 0 && P.age > HUNT_GRACE) {
    const dist = Math.hypot(P.x - hx, P.y - hy);
    if (b.hunt <= 0 && dist < D.huntRange && hunters.n < D.maxHunters && b.mass > 20 && Math.random() < D.aggr * 0.5) {
      b.hunt = rand(2, 5); hunters.n++;
    }
    if (b.hunt > 0 && dist > D.huntRange * 1.6) b.hunt = 0;
  } else b.hunt = 0;

  if (b.hunt > 0 && P && P.age > HUNT_GRACE) {
    const dx = P.x - hx, dy = P.y - hy, dist = Math.hypot(dx, dy);
    if (D.encircle && dist < 280 && b.bodyLen() > TAU * Math.max(dist, 80) * 1.15) {
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
    const c0 = cellOf(hx, hy), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    let best = -1, bx = 0, by = 0;
    for (let cy = Math.max(0, cy0 - cr); cy <= Math.min(GRID_N - 1, cy0 + cr); cy++) {
      for (let cx = Math.max(0, cx0 - cr); cx <= Math.min(GRID_N - 1, cx0 + cr); cx++) {
        for (let i = foodHead[cy * GRID_N + cx]; i >= 0; i = foodNext[i]) {
          const f = foods[i];
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
    if (D.kind && P && Math.hypot(P.x - hx, P.y - hy) < 260) desired = Math.atan2(hy - P.y, hx - P.x);
  }

  // добрые боты не лезут под нос игроку
  let kindZone = null;
  if (D.kind && P) {
    const zr = 130 + P.r;
    kindZone = { x: P.x + Math.cos(P.a) * 120, y: P.y + Math.sin(P.a) * 120, r2: zr * zr };
  }

  const look = D.look * (1 + b.r / 50);
  let bestA = b.a, bestScore = -1e9;
  const dOff = clamp(angDiff(desired, b.a), -2.1, 2.1);
  for (let i = -1; i < OFFS.length; i++) {
    const off = i < 0 ? dOff : OFFS[i];
    const a = b.a + off;
    const dg = rayDanger(b, bi, a, look, P, kindZone);
    const sc = Math.cos(angDiff(desired, a)) - dg * 4 - Math.abs(off) * 0.05;
    if (sc > bestScore) { bestScore = sc; bestA = a; }
  }
  b.ta = bestA;
}

// ---------- движение ----------
function moveSnake(s, dt) {
  s.r = s.radius(); s.sp = s.r * 0.42;
  const speedMul = s.isPlayer ? 1 : D.speed;
  const turnMul = s.isPlayer ? 1 : D.turn;
  const turn = 4.6 / (1 + (s.r - 11) / 28) * turnMul;
  const d = angDiff(s.ta, s.a), mt = turn * dt;
  s.a += d > mt ? mt : d < -mt ? -mt : d;

  const boosting = s.boost && s.mass > MIN_BOOST_MASS;
  s.isBoosting = boosting;
  const v = (boosting ? BOOST_SPEED : BASE_SPEED) * speedMul;
  const segs = s.segs, h = segs[0];
  h.x += Math.cos(s.a) * v * dt; h.y += Math.sin(s.a) * v * dt;
  if (boosting) {
    const loss = (5 + s.mass * 0.004) * dt;
    s.mass -= loss; s.dropAcc += loss;
    if (s.dropAcc > 2) {
      const t = segs[segs.length - 1];
      addFood(t.x + rand(-4, 4), t.y + rand(-4, 4), s.dropAcc * 0.75, s.skin, 30);
      s.dropAcc = 0;
    }
  }

  // край арены
  const hd = Math.hypot(h.x, h.y);
  if (hd > R - s.r) {
    if ((s.isPlayer && !D.edgeKills) || s.inv > 0) {
      const k = (R - s.r) / hd;
      h.x *= k; h.y *= k;
      const inward = Math.atan2(-h.y, -h.x);
      s.a += angDiff(inward, s.a) * Math.min(1, dt * 6);
    } else {
      pendingDeaths.push([s, null]);
    }
  }

  const sp = s.sp, sp2 = sp * sp;
  for (let i = 1; i < segs.length; i++) {
    const p = segs[i - 1], q = segs[i];
    const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
    if (d2 > sp2) { const dd = Math.sqrt(d2); q.x = p.x + dx / dd * sp; q.y = p.y + dy / dd * sp; }
  }
  const n = s.targetCount();
  if (segs.length < n) { const t = segs[segs.length - 1]; segs.push({ x: t.x, y: t.y }); }
  else if (segs.length > n + 1) segs.pop();
  if (s.mass > s.maxMass) s.maxMass = s.mass;
  if (s.inv > 0) s.inv -= dt;
  s.age += dt;
}

// ---------- ввод ----------
const input = { px: 0, py: 0, has: false, pid: null, mouseDown: false, boostBtn: false };
const keys = new Set();
canvas.addEventListener('pointerdown', (e) => {
  ensureAudio();
  if (e.pointerType === 'mouse') input.mouseDown = e.button === 0;
  else { input.pid = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* */ } }
  input.px = e.clientX; input.py = e.clientY; input.has = true;
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || e.pointerId === input.pid) { input.px = e.clientX; input.py = e.clientY; input.has = true; }
});
const endPointer = (e) => {
  if (e.pointerType === 'mouse') input.mouseDown = false;
  else if (e.pointerId === input.pid) input.pid = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

const boostBtn = $('btnBoost');
const boostOn = (e) => { e.preventDefault(); ensureAudio(); input.boostBtn = true; boostBtn.classList.add('on'); try { boostBtn.setPointerCapture(e.pointerId); } catch (err) { /* */ } };
const boostOff = () => { input.boostBtn = false; boostBtn.classList.remove('on'); };
boostBtn.addEventListener('pointerdown', boostOn);
boostBtn.addEventListener('pointerup', boostOff);
boostBtn.addEventListener('pointercancel', boostOff);
boostBtn.addEventListener('lostpointercapture', boostOff);
const isTouch = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
if (isTouch) boostBtn.classList.remove('hidden');

window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.code;
  if (k === 'Escape' || k === 'KeyP') { if (state === 'play') pauseGame(); else if (state === 'paused') resumeGame(); return; }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'KeyW', 'Space', 'ShiftLeft', 'ShiftRight'].includes(k)) {
    keys.add(k); e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (player && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD')) player.ta = player.a;
});
window.addEventListener('blur', () => { keys.clear(); boostOff(); input.mouseDown = false; });

function applyInput() {
  if (!player || !player.alive) return;
  const left = keys.has('ArrowLeft') || keys.has('KeyA');
  const right = keys.has('ArrowRight') || keys.has('KeyD');
  if (left !== right) { player.ta = player.a + (right ? 0.9 : -0.9); input.has = false; }
  else if (input.has) {
    const sx = W / 2 + (player.x - cam.x) * cam.z, sy = H / 2 + (player.y - cam.y) * cam.z;
    const dx = input.px - sx, dy = input.py - sy;
    if (dx * dx + dy * dy > 144) player.ta = Math.atan2(dy, dx);
  }
  player.boost = keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW') || keys.has('ShiftLeft') ||
    keys.has('ShiftRight') || input.mouseDown || input.boostBtn;
}

// ---------- шаг симуляции ----------
function update(dt) {
  time += dt;
  if (state === 'play') playTime += dt;
  applyInput();

  for (const s of snakes) if (s.alive) moveSnake(s, dt);
  buildGrids();

  // ИИ
  const hunters = { n: 0 };
  for (const s of snakes) if (!s.isPlayer && s.alive && s.hunt > 0) hunters.n++;
  for (let i = 0; i < snakes.length; i++) {
    const b = snakes[i];
    if (b.isPlayer || !b.alive) continue;
    if (b.hunt > 0) b.hunt -= dt;
    b.thinkT -= dt;
    if (b.thinkT <= 0) { think(b, i, hunters); b.thinkT = D.react * rand(0.7, 1.3); }
  }

  // столкновения голов с телами
  for (let si = 0; si < snakes.length; si++) {
    const s = snakes[si];
    if (!s.alive || s.inv > 0) continue;
    const h = s.segs[0];
    const c0 = cellOf(h.x, h.y), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
    let hit = null;
    for (let cy = cy0 - 1; cy <= cy0 + 1 && !hit; cy++) {
      if (cy < 0 || cy >= GRID_N) continue;
      for (let cx = cx0 - 1; cx <= cx0 + 1 && !hit; cx++) {
        if (cx < 0 || cx >= GRID_N) continue;
        for (let it = segHead[cy * GRID_N + cx]; it >= 0; it = segNext[it]) {
          if (segS[it] === si) continue;
          const o = snakes[segS[it]], q = o.segs[segK[it]];
          const dx = q.x - h.x, dy = q.y - h.y, rr = s.r * 0.55 + o.r * 0.85;
          if (dx * dx + dy * dy < rr * rr) { hit = o; break; }
        }
      }
    }
    if (hit) pendingDeaths.push([s, hit]);
  }

  // еда
  for (const s of snakes) {
    if (!s.alive) continue;
    const h = s.segs[0];
    const c0 = cellOf(h.x, h.y), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
    const reach = s.r + 40, reach2 = reach * reach;
    for (let cy = Math.max(0, cy0 - 1); cy <= Math.min(GRID_N - 1, cy0 + 1); cy++) {
      for (let cx = Math.max(0, cx0 - 1); cx <= Math.min(GRID_N - 1, cx0 + 1); cx++) {
        for (let i = foodHead[cy * GRID_N + cx]; i >= 0; i = foodNext[i]) {
          const f = foods[i];
          if (f.dead) continue;
          const dx = h.x - f.x, dy = h.y - f.y, d2 = dx * dx + dy * dy;
          if (d2 > reach2) continue;
          const er = s.r * 0.8 + f.r;
          if (d2 < er * er) {
            f.dead = true; s.mass += f.v;
            if (f.life === 0) naturalCount--;
            if (s === player) sfx.eat();
          } else {
            const k = Math.min(1, dt * 7); // притягиваем к голове
            f.x += dx * k; f.y += dy * k;
          }
        }
      }
    }
  }

  for (const [s, k] of pendingDeaths) kill(s, k);
  pendingDeaths = [];

  // старение и уборка еды
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    if (!f.dead && f.life > 0) { f.age += dt; if (f.age > f.life) f.dead = true; }
    if (f.dead) { foods[i] = foods[foods.length - 1]; foods.pop(); }
  }
  for (let i = 0; i < 8 && naturalCount < FOOD_N; i++) spawnNatural();

  snakes = snakes.filter((s) => s.alive);
  for (let i = respawnQueue.length - 1; i >= 0; i--) {
    respawnQueue[i] -= dt;
    if (respawnQueue[i] <= 0) { respawnQueue.splice(i, 1); spawnBot(); }
  }

  if (player && player.alive && player.maxMass > sessionBest) sessionBest = player.maxMass;
}

// ---------- камера ----------
function updateCamera(dt) {
  let target = null;
  if (player && player.alive) target = player;
  else if (state === 'menu') {
    if (!demoFocus || !demoFocus.alive) {
      demoFocus = snakes.reduce((a, s) => (!a || s.mass > a.mass ? s : a), null);
    }
    target = demoFocus;
  }
  let tr = 14;
  if (target) {
    const k = Math.min(1, dt * (target === player ? 12 : 3));
    cam.x += (target.x - cam.x) * k; cam.y += (target.y - cam.y) * k;
    tr = target.r;
  }
  const base = Math.min(W, H) / 760;
  let zt = base * clamp(1.3 - (tr - 11) / 60, 0.75, 1.3);
  if (state === 'menu') zt *= 0.85;
  cam.z += (zt - cam.z) * Math.min(1, dt * 2);
}

// ---------- рисование ----------
function drawSnake(s, vx0, vy0, vx1, vy1) {
  const segs = s.segs, r = s.r, sk = SKINS[s.skin];
  const h = segs[0];
  const margin = s.bodyLen() + r;
  if (h.x < vx0 - margin || h.x > vx1 + margin || h.y < vy0 - margin || h.y > vy1 + margin) return;

  ctx.globalAlpha = s.inv > 0 ? 0.45 + 0.25 * Math.sin(time * 18) : 1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(h.x, h.y);
  for (let i = 1; i < segs.length; i++) ctx.lineTo(segs[i].x, segs[i].y);
  if (s.isBoosting) {
    ctx.lineWidth = r * 2 + 14; ctx.strokeStyle = hexA(sk[0], 0.3); ctx.stroke();
  }
  ctx.lineWidth = r * 2 + 4; ctx.strokeStyle = sk[2]; ctx.stroke();
  ctx.lineWidth = r * 2; ctx.strokeStyle = sk[0]; ctx.stroke();
  ctx.setLineDash([r * 0.9, r * 1.3]);
  ctx.lineCap = 'butt';
  ctx.lineWidth = r * 1.7; ctx.strokeStyle = hexA(sk[1], 0.55); ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.45; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.stroke();

  // голова
  ctx.beginPath(); ctx.arc(h.x, h.y, r * 1.08, 0, TAU);
  ctx.fillStyle = sk[0]; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = sk[2]; ctx.stroke();
  const a = s.a, look = s.ta;
  for (const side of [-1, 1]) {
    const ex = h.x + Math.cos(a + side * 0.6) * r * 0.55, ey = h.y + Math.sin(a + side * 0.6) * r * 0.55;
    ctx.beginPath(); ctx.arc(ex, ey, r * 0.36, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    const px = ex + Math.cos(look) * r * 0.14, py = ey + Math.sin(look) * r * 0.14;
    ctx.beginPath(); ctx.arc(px, py, r * 0.19, 0, TAU); ctx.fillStyle = '#111'; ctx.fill();
    ctx.beginPath(); ctx.arc(px - r * 0.06, py - r * 0.06, r * 0.07, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (state !== 'menu' || s === demoFocus) {
    ctx.font = `700 ${Math.round(14 / cam.z)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = s.isPlayer ? 'rgba(253,224,71,0.95)' : 'rgba(255,255,255,0.8)';
    ctx.fillText(s.name, h.x, h.y - r - 10 / cam.z);
  }
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#3a0d1c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const z = cam.z;
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (W / 2 - cam.x * z), DPR * (H / 2 - cam.y * z));

  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU);
  ctx.fillStyle = bgPattern; ctx.fill();
  ctx.lineWidth = 16; ctx.strokeStyle = '#ff4d6d'; ctx.stroke();

  const hw = W / 2 / z, hh = H / 2 / z;
  const vx0 = cam.x - hw - 30, vx1 = cam.x + hw + 30, vy0 = cam.y - hh - 30, vy1 = cam.y + hh + 30;

  for (const f of foods) {
    if (f.x < vx0 || f.x > vx1 || f.y < vy0 || f.y > vy1) continue;
    const sz = f.r * 5.7 * (1 + 0.12 * Math.sin(time * 3 + f.ph));
    ctx.globalAlpha = f.life > 0 && f.life - f.age < 3 ? Math.max(0, (f.life - f.age) / 3) : 1;
    ctx.drawImage(foodSprites[f.c], f.x - sz / 2, f.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;

  for (const s of snakes) if (s !== player) drawSnake(s, vx0, vy0, vx1, vy1);
  if (player && player.alive) drawSnake(player, vx0, vy0, vx1, vy1);
}

function drawMini() {
  const S = mini.width, c = S / 2, k = (S / 2 - 6) / R;
  mctx.clearRect(0, 0, S, S);
  mctx.beginPath(); mctx.arc(c, c, S / 2 - 4, 0, TAU);
  mctx.fillStyle = 'rgba(0,0,0,0.4)'; mctx.fill();
  mctx.lineWidth = 4; mctx.strokeStyle = 'rgba(255,77,109,0.8)'; mctx.stroke();
  mctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (const s of snakes) {
    if (s === player) continue;
    const sz = 3 + s.r / 10;
    mctx.fillRect(c + s.x * k - sz / 2, c + s.y * k - sz / 2, sz, sz);
  }
  if (player && player.alive) {
    mctx.beginPath(); mctx.arc(c + player.x * k, c + player.y * k, 8, 0, TAU);
    mctx.fillStyle = '#fde047'; mctx.fill();
  }
}

// ---------- HUD ----------
let hudT = 0;
function updateHud(dt) {
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.25;
  if (player) {
    const len = Math.floor(player.alive ? player.mass : player.maxMass);
    const extra = D.respawn ? '💚 Жизни бесконечные' : `⏱ ${fmtTime(playTime)} · 🏆 ${player.kills}`;
    $('score').innerHTML = `Длина: ${len}<small>${extra}</small>`;
  }
  const list = snakes.slice().sort((a, b) => b.mass - a.mass);
  let html = '';
  list.slice(0, 5).forEach((s, i) => {
    html += `<div class="row${s === player ? ' me' : ''}"><span>${i + 1}. ${esc(s.name)}</span><span>${Math.floor(s.mass)}</span></div>`;
  });
  const rank = list.indexOf(player);
  if (rank >= 5) {
    html += `<div class="sep"></div><div class="row me"><span>${rank + 1}. ${esc(player.name)}</span><span>${Math.floor(player.mass)}</span></div>`;
  }
  $('board').innerHTML = html;
}
let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- экраны и ход игры ----------
const screens = ['menu', 'pause', 'dead', 'over'];
function show(id) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', id === 'menu');
}
function resetWorld(diff) {
  D = DIFF[diff];
  snakes = []; foods = []; naturalCount = 0; respawnQueue = []; pendingDeaths = [];
  player = null; demoFocus = null;
  for (let i = 0; i < FOOD_N; i++) spawnNatural();
  for (let i = 0; i < D.bots; i++) spawnBot();
}
function startGame(diff) {
  ensureAudio();
  diffKey = diff;
  resetWorld(diff);
  playTime = 0; deaths = 0; sessionBest = START_MASS;
  spawnPlayer(START_MASS, 2);
  cam.z = Math.min(W, H) / 760 * 1.3;
  hudT = 0;
  state = 'play';
  show(null);
}
function startDemo() {
  resetWorld('easy');
  state = 'menu';
  cam.x = 0; cam.y = 0;
  show('menu');
  renderMenu();
}
function recordBest() {
  const score = Math.floor(sessionBest);
  const prev = save.best[diffKey] || 0;
  if (score > prev) { save.best[diffKey] = score; persist(); return true; }
  return false;
}
function onPlayerDeath(s, killer) {
  sfx.die();
  deaths++;
  const who = killer ? `На пути была змейка «${esc(killer.name)}»` : 'Это край арены';
  if (D.respawn) {
    recordBest();
    $('deadText').innerHTML = `${who}.<br>Длина была: <b>${Math.floor(s.mass)}</b><br>Продолжишь с половиной длины.`;
    state = 'dead';
    show('dead');
  } else {
    const isNew = recordBest();
    $('overText').innerHTML = `${who}.<br>Лучшая длина: <b>${Math.floor(s.maxMass)}</b><br>` +
      `Побед над змеями: <b>${s.kills}</b> · Время: <b>${fmtTime(playTime)}</b>`;
    $('overRecord').textContent = isNew ? '🏆 Новый рекорд!' : `Рекорд: ${save.best[diffKey]}`;
    state = 'over';
    setTimeout(() => { if (state === 'over') show('over'); }, 900);
  }
}
function continueGame() {
  const prev = player;
  spawnPlayer(Math.max(START_MASS, prev.mass * 0.5), 3);
  player.kills = prev.kills;
  state = 'play';
  show(null);
}
function pauseGame() { if (state !== 'play') return; state = 'paused'; show('pause'); }
function resumeGame() { if (state !== 'paused') return; state = 'play'; show(null); last = performance.now(); }
function toMenu() { if (player) recordBest(); startDemo(); }

$('btnPause').addEventListener('click', pauseGame);
$('btnResume').addEventListener('click', resumeGame);
$('btnPauseMenu').addEventListener('click', toMenu);
$('btnContinue').addEventListener('click', continueGame);
$('btnDeadMenu').addEventListener('click', toMenu);
$('btnAgain').addEventListener('click', () => startGame(diffKey));
$('btnOverMenu').addEventListener('click', toMenu);
const soundBtn = $('btnSound');
const renderSound = () => { soundBtn.textContent = save.sound ? '🔊' : '🔇'; };
soundBtn.addEventListener('click', () => { save.sound = !save.sound; persist(); renderSound(); ensureAudio(); });
renderSound();
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

// меню
const nameInput = $('name');
nameInput.value = save.name;
nameInput.addEventListener('input', () => { save.name = nameInput.value.trim().slice(0, 12); persist(); });
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });
const skinsEl = $('skins');
SKINS.forEach((sk, i) => {
  const b = document.createElement('button');
  b.className = 'skin';
  b.style.background = `radial-gradient(circle at 35% 35%, ${sk[0]}, ${sk[1]})`;
  b.setAttribute('aria-label', `Цвет ${i + 1}`);
  b.addEventListener('click', () => { save.skin = i; persist(); renderMenu(); });
  skinsEl.appendChild(b);
});
document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.d)));
$('help').innerHTML = isTouch
  ? 'Веди пальцем по экрану — змейка ползёт к нему. Держи ⚡, чтобы ускориться (тратит немного длины).'
  : 'Змейка ползёт к курсору мыши. Зажми левую кнопку или пробел, чтобы ускориться (тратит немного длины). Можно и стрелками ← →. Пауза — Esc.';
$('ver').textContent = `версия ${VERSION}`;
function renderMenu() {
  [...skinsEl.children].forEach((b, i) => b.classList.toggle('sel', i === save.skin));
  for (const k of Object.keys(DIFF)) {
    const v = save.best[k] || 0;
    $(`best-${k}`).textContent = v ? `🏆 Рекорд: ${v}` : '';
  }
}

// офлайн: service worker + подсказка про установку
const isStandalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installHint() {
  if (isStandalone) return '';
  if (isIOS) return '<br>Чтобы играть в самолёте: Safari → «Поделиться» → «На экран „Домой“», потом один раз открой игру с иконки, пока есть интернет.';
  if (/Android/.test(navigator.userAgent)) return '<br>Чтобы играть в самолёте: Chrome → ⋮ → «Добавить на главный экран» и один раз открой игру с иконки при интернете.';
  return '';
}
async function checkOffline() {
  const el = $('offline');
  if (!('serviceWorker' in navigator) || !window.caches) {
    el.innerHTML = location.protocol === 'file:'
      ? 'Игра открыта из файла — работает без интернета, пока файл на устройстве.'
      : '⚠️ Этот браузер не умеет сохранять игру для офлайна.';
    return;
  }
  try {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    let ok = false;
    for (const k of await caches.keys()) {
      if (!k.startsWith('zmeigrad-')) continue;
      const c = await caches.open(k);
      if ((await c.match('index.html')) && (await c.match('game.js'))) ok = true;
    }
    if (ok) {
      el.classList.add('ok');
      el.innerHTML = '✅ Игра сохранена на устройстве и работает без интернета.' + installHint();
    } else {
      el.innerHTML = '⏳ Сохраняю игру для офлайна…' + installHint();
      setTimeout(checkOffline, 1500);
    }
  } catch (e) {
    el.innerHTML = '⚠️ Не получилось включить офлайн-режим: ' + esc(e.message);
  }
}
checkOffline();

// ---------- главный цикл ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (state !== 'paused') {
    update(dt);
    updateCamera(dt);
    draw();
    if (state !== 'menu') { drawMini(); updateHud(dt); }
  }
  requestAnimationFrame(frame);
}
startDemo();
requestAnimationFrame(frame);

// для автотестов
window.__zmeigrad = { get state() { return state; }, get player() { return player; }, get snakes() { return snakes; },
  get foods() { return foods; }, get segCount() { return segCount; }, startGame, kill: (s) => kill(s, null) };
})();
