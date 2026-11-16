// Клиент: отрисовка, управление, меню; одиночная игра считает мир сама, совместная — получает его с сервера.
import {
  World, SKINS, PAL, GOLD, DIFF, R, TAU, START_MASS, VERSION, TITLES, titleOf, segColor,
  radiusOf, spacingOf, countOf, bodyLenOf, foodRadiusOf, followChain, fitLength, clamp, angDiff, foodCellOf,
} from './core.js';

const TICK_MS = 25;        // сервер: 40 шагов в секунду
const INTERP_MS = 110;     // рисуем мир с задержкой на два снимка — так движение плавное
const JOY_R = 64;          // радиус джойстика

// ---------- иконки (Material Icons, Apache 2.0) ----------
const ICONS = {
  pause: '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>',
  menu: '<path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  vol: '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>',
  volOff: '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>',
  bolt: '<path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z"/>',
  group: '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',
  share: '<path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>',
  check: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
  mood: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 1 1 0 16z"/><circle cx="8.5" cy="9.5" r="1.5"/><circle cx="15.5" cy="9.5" r="1.5"/><path d="M12 17.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>',
  neutral: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 1 1 0 16z"/><circle cx="8.5" cy="9.5" r="1.5"/><circle cx="15.5" cy="9.5" r="1.5"/><rect x="8" y="14.5" width="8" height="1.8" rx=".9"/>',
  fire: '<path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/>',
  trophy: '<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>',
  heart: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
  timer: '<path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>',
  cloudOff: '<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 6.23 11.08 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96zM3 5.27l2.75 2.74C2.56 8.15 0 10.77 0 14c0 3.31 2.69 6 6 6h11.73l2 2L21 20.73 4.27 4 3 5.27zM7.73 10l8 8H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73z"/>',
  lock: '<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>',
  star: '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>',
  flag: '<path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>',
  cloudDone: '<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 17l-3.5-3.5 1.41-1.41L10 14.17 15.18 9l1.41 1.41L10 17z"/>',
};
const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const $ = (id) => document.getElementById(id);
document.querySelectorAll('[data-icon]').forEach((el) => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (t) => { t = Math.floor(t); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

// ---------- сохранение ----------
const save = { best: { easy: 0, medium: 0, hard: 0 }, name: '', skin: 0, sound: true, xp: 0, daily: null,
  stats: { games: 0, kills: 0, eaten: 0, best: 0 } };
try { Object.assign(save, JSON.parse(localStorage.getItem('zmeigrad') || '{}')); } catch { /* приватный режим */ }
if (!SKINS[save.skin]) save.skin = 0;
const persist = () => { try { localStorage.setItem('zmeigrad', JSON.stringify(save)); } catch { /* ничего */ } };
const myName = () => save.name || 'Игрок';
// токен сессии: при переподключении сервер отдаёт ту же змейку, а не создаёт вторую
const TOKEN = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).slice(0, 40);
const hello = (o) => ({ ...o, name: myName(), skin: save.skin, token: TOKEN, v: VERSION });

// ---------- звук (синтез, без файлов) ----------
let actx = null, lastEatSound = 0;
function ensureAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; } }
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
  combo(n) { for (let i = 0; i < n + 1; i++) tone(600 + i * 150, 1200 + i * 200, 0.12, 0.08, 'triangle', i * 0.08); },
  title() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.18, 0.08, 'triangle', i * 0.09)); },
  level() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.22, 0.08, 'square', i * 0.08)); },
  task() { tone(880, 1760, 0.2, 0.07, 'sine'); tone(1320, 2640, 0.25, 0.06, 'sine', 0.1); },
  feast() { tone(700, 900, 0.15, 0.06, 'triangle'); tone(900, 1200, 0.2, 0.06, 'triangle', 0.15); },
};

// ---------- прогрессия: звёзды, уровни, задания ----------
// Звёзды копятся за всё время: еда, победы, звания, места в таблице, задания дня. Уровень открывает раскраски.
const lvlNeed = (l) => 150 + l * 100;
function levelOf(xp) {
  let l = 1;
  while (xp >= lvlNeed(l)) { xp -= lvlNeed(l); l++; }
  return { lvl: l, cur: Math.floor(xp), need: lvlNeed(l) };
}
const myLevel = () => levelOf(save.xp).lvl;

const TASKS = {
  eat: { tiers: [400, 900, 1800], text: (n) => `Съешь ${n} еды`, kind: 'sum' },
  kills: { tiers: [2, 4, 8], text: (n) => `Победи ${n} змей`, kind: 'sum' },
  top: { tiers: [20, 10, 3], text: (n) => `Попади в топ-${n}`, kind: 'rank' },
  grow: { tiers: [300, 800, 2000], text: (n) => `Вырасти до длины ${n}`, kind: 'max' },
  feast: { tiers: [1, 2, 3], text: (n) => (n === 1 ? 'Найди золотой пир' : `Найди золотой пир ${n} раза`), kind: 'sum' },
  giant: { tiers: [1, 2, 3], text: (n) => `Победи змею длиннее себя${n > 1 ? ` ${n} раза` : ''}`, kind: 'sum' },
  survive: { tiers: [3, 5, 8], text: (n) => `Продержись ${n} мин без проигрыша`, kind: 'max' },
  revenge: { tiers: [1, 2, 3], text: (n) => `Отомсти обидчику${n > 1 ? ` ${n} раза` : ''}`, kind: 'sum' },
};
const TASK_REWARD = [100, 170, 250], ALL_TASKS_BONUS = 150;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
function ensureDaily() {
  const day = today();
  if (save.daily && save.daily.day === day) return save.daily;
  // одни и те же задания на устройстве в течение дня; сложность — по уровню игрока
  let h = 0;
  for (const ch of day + save.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return h / 4294967296; };
  const ids = Object.keys(TASKS);
  const lvl = myLevel(), tier = lvl < 4 ? 0 : lvl < 10 ? 1 : 2;
  const tasks = [];
  while (tasks.length < 3) {
    const id = ids[Math.floor(rnd() * ids.length)];
    if (tasks.some((t) => t.id === id)) continue;
    const T = TASKS[id];
    tasks.push({ id, n: T.tiers[tier], prog: T.kind === 'rank' ? 999 : 0, done: false, reward: TASK_REWARD[tier] });
  }
  save.daily = { day, tasks, bonus: false };
  persist();
  return save.daily;
}
const taskDone = (t) => (TASKS[t.id].kind === 'rank' ? t.prog <= t.n : t.prog >= t.n);
function taskText(t) {
  const T = TASKS[t.id];
  const prog = T.kind === 'rank' ? (t.prog < 999 ? `лучшее место: ${t.prog}` : 'ещё не было') : `${Math.min(t.n, Math.floor(t.prog))} из ${t.n}`;
  const frac = T.kind === 'rank' ? (t.prog < 999 ? clamp((100 - t.prog) / (100 - t.n), 0, 1) : 0) : clamp(t.prog / t.n, 0, 1);
  return { title: T.text(t.n), prog, frac };
}
// событие для заданий: sum — прибавить, max — взять наибольшее, rank — наименьшее место
function taskEvent(id, v) {
  const d = ensureDaily();
  for (const t of d.tasks) {
    if (t.id !== id || t.done) continue;
    const k = TASKS[id].kind;
    t.prog = k === 'sum' ? t.prog + v : k === 'max' ? Math.max(t.prog, v) : Math.min(t.prog, v);
    if (taskDone(t)) {
      t.done = true;
      sfx.task();
      snack(`Задание выполнено: ${TASKS[id].text(t.n)} · +${t.reward} ★`);
      addXp(t.reward);
      if (!d.bonus && d.tasks.every((x) => x.done)) {
        d.bonus = true;
        setTimeout(() => { banner('Все задания дня!', `+${ALL_TASKS_BONUS} ★`); sfx.level(); addXp(ALL_TASKS_BONUS); }, 1500);
      }
    }
  }
}
function addXp(n) {
  if (n <= 0) return;
  const before = myLevel();
  save.xp += n;
  if (run) run.xp += n;
  const after = myLevel();
  if (after > before) {
    const sk = SKINS.filter((x) => x.lvl > before && x.lvl <= after);
    setTimeout(() => {
      sfx.level();
      banner(`Уровень ${after}!`, sk.length ? `Открыта раскраска «${sk.map((x) => x.name).join('», «')}»` : 'Так держать!');
    }, 400);
    persist();
  }
}

// ---------- холст ----------
const canvas = $('c'), ctx = canvas.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
}
window.addEventListener('resize', resize);
resize();

const FIELD = '#161A16', GRID = '#202620', OUTSIDE = '#2B1715', EDGE = '#FFB4AB';
const ON = '#E1E3DE', PRIMARY = '#88D982', TERTIARY = '#A0CFD4', GOLD_C = '#FFD447', REVENGE = '#FF6B5E';
function makeGrid() {
  const s = 2, t = 80;
  const c = document.createElement('canvas');
  c.width = c.height = t * s;
  const g = c.getContext('2d');
  g.scale(s, s);
  g.fillStyle = FIELD; g.fillRect(0, 0, t, t);
  g.fillStyle = GRID; g.fillRect(0, 0, t, 1.5); g.fillRect(0, 0, 1.5, t);
  const p = ctx.createPattern(c, 'repeat');
  if (p.setTransform && window.DOMMatrix) p.setTransform(new DOMMatrix().scale(1 / s));
  return p;
}
const gridPattern = makeGrid();

// спрайты: сегмент змейки (объёмный шарик с обводкой) и светящаяся еда — по одному на цвет палитры
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
const SPR = 64;
const segSprites = PAL.map((col) => {
  const c = document.createElement('canvas');
  c.width = c.height = SPR;
  const g = c.getContext('2d'), m = SPR / 2;
  g.beginPath(); g.arc(m, m, m - 1, 0, TAU); g.fillStyle = shade(col, -0.55); g.fill();
  const gr = g.createRadialGradient(m * 0.72, m * 0.62, m * 0.1, m, m, m - 3);
  gr.addColorStop(0, shade(col, 0.45)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, -0.25));
  g.beginPath(); g.arc(m, m, m - 3.5, 0, TAU); g.fillStyle = gr; g.fill();
  return c;
});
const foodSprites = PAL.map((col) => {
  const c = document.createElement('canvas');
  c.width = c.height = SPR;
  const g = c.getContext('2d'), m = SPR / 2;
  const gr = g.createRadialGradient(m, m, 0, m, m, m);
  gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.18, shade(col, 0.4)); gr.addColorStop(0.36, col);
  gr.addColorStop(0.5, hexA(col, 0.35)); gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, SPR, SPR);
  return c;
});
const glowSprites = PAL.map((col) => {
  const c = document.createElement('canvas');
  c.width = c.height = SPR;
  const g = c.getContext('2d'), m = SPR / 2;
  const gr = g.createRadialGradient(m, m, m * 0.3, m, m, m);
  gr.addColorStop(0, hexA(col, 0.55)); gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, SPR, SPR);
  return c;
});

// ---------- общее состояние ----------
let mode = null;         // null — демо за меню, 'solo', 'net'
let ui = 'home';         // home | play | paused | dead | over | conn
let world = null;        // мир одиночной игры и демо
let me = null;           // своя змейка (в solo — из world, в net — из net.snakes)
let diffKey = 'easy';
let time = 0, playTime = 0, sessionBest = 0;
let demoFocus = null;
let run = null;          // текущая игра: звёзды, победы, рекорды мест — для итогов и заданий
let feast = null;        // { x, y, until } — золотой пир на арене
let effects = [];        // кольца-вспышки на месте побед
let leaderId = 0;        // у кого корона
const cam = { x: 0, y: 0, z: 1 };

function newRun(diff) {
  return { diff, xp: 0, kills: 0, eatenBase: 0, eatXp: 0, eatTask: 0, maxTitle: 0, bestRank: 999, flags: new Set(),
    lifeStart: 0, killTimes: [], revenge: null, feastSeen: new Set(), maxMass: START_MASS, startT: performance.now() };
}
// ---------- ввод ----------
const isTouch = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
const joy = { active: false, pid: null, bx: 0, by: 0, x: 0, y: 0, angle: null };
const mouse = { x: 0, y: 0, has: false, down: false };
let inputKind = isTouch ? 'touch' : 'mouse';
let fabDown = false;
const keys = new Set();

canvas.addEventListener('pointerdown', (e) => {
  ensureAudio();
  if (e.pointerType === 'mouse') {
    inputKind = 'mouse'; mouse.down = e.button === 0; mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true;
    return;
  }
  if (joy.active) return; // второй палец на поле игнорируем
  inputKind = 'touch';
  joy.active = true; joy.pid = e.pointerId;
  joy.bx = joy.x = e.clientX; joy.by = joy.y = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true; inputKind = 'mouse'; return; }
  if (!joy.active || e.pointerId !== joy.pid) return;
  joy.x = e.clientX; joy.y = e.clientY;
  let dx = joy.x - joy.bx, dy = joy.y - joy.by;
  const len = Math.hypot(dx, dy);
  if (len > JOY_R) { // основание едет за пальцем
    joy.bx = joy.x - dx / len * JOY_R; joy.by = joy.y - dy / len * JOY_R;
    dx = joy.x - joy.bx; dy = joy.y - joy.by;
  }
  if (len > 10) joy.angle = Math.atan2(dy, dx);
});
const endPointer = (e) => {
  if (e.pointerType === 'mouse') { mouse.down = false; return; }
  if (e.pointerId === joy.pid) { joy.active = false; joy.pid = null; }
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

const fab = $('fab');
fab.addEventListener('pointerdown', (e) => {
  e.preventDefault(); ensureAudio(); fabDown = true; fab.classList.add('on');
  try { fab.setPointerCapture(e.pointerId); } catch { /* */ }
});
const fabUp = () => { fabDown = false; fab.classList.remove('on'); };
fab.addEventListener('pointerup', fabUp);
fab.addEventListener('pointercancel', fabUp);
fab.addEventListener('lostpointercapture', fabUp);
if (isTouch) fab.hidden = false;

const TURN_KEYS = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { openMenu(); return; }
  if ([...TURN_KEYS, 'ArrowUp', 'KeyW', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
    keys.add(e.code); e.preventDefault();
    if (TURN_KEYS.includes(e.code)) inputKind = 'keys';
  }
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); });
window.addEventListener('blur', () => { keys.clear(); fabUp(); mouse.down = false; joy.active = false; });

// куда хочет ползти игрок: угол или null (не трогать)
function steer() {
  if (!me) return { a: null, b: false };
  const b = keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW') || keys.has('ShiftLeft') ||
    keys.has('ShiftRight') || mouse.down || fabDown;
  let a = null;
  const left = keys.has('ArrowLeft') || keys.has('KeyA'), right = keys.has('ArrowRight') || keys.has('KeyD');
  if (inputKind === 'keys') a = left !== right ? me.a + (right ? 0.9 : -0.9) : me.a;
  else if (inputKind === 'mouse' && mouse.has) {
    const sx = W / 2 + (me.segs[0].x - cam.x) * cam.z, sy = H / 2 + (me.segs[0].y - cam.y) * cam.z;
    const dx = mouse.x - sx, dy = mouse.y - sy;
    if (dx * dx + dy * dy > 144) a = Math.atan2(dy, dx);
  } else if (inputKind === 'touch') a = joy.angle;
  return { a, b };
}

// ---------- сетевая игра ----------
const net = {
  ws: null, code: '', roomMode: 'team', diff: 'easy', youId: 0, myTeam: 0,
  snakes: new Map(), foods: new Map(), buf: [], offset: null, lastTick: -1,
  lastSent: 0, lastA: null, lastB: false, leaving: false, retry: 0, retryTimer: 0, pendingMsg: null,
  kills: 0, myMass: 0, deadInfo: null, lb: null, eaten: 0,
};
const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
function netSend(o) { if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(o)); }

function netReset() {
  net.snakes.clear(); net.foods.clear(); net.buf = []; net.offset = null; net.lastTick = -1;
  net.youId = 0; net.lastA = null; net.lastB = false; net.myMass = 0; net.lb = null;
}
function netOpen(firstMsg, isRetry) {
  net.pendingMsg = firstMsg;
  net.leaving = false;
  let ws;
  try { ws = new WebSocket(wsUrl()); } catch { netFailed(); return; }
  ws.binaryType = 'arraybuffer';
  net.ws = ws;
  let welcomed = false;
  ws.onopen = () => { ws.send(JSON.stringify(firstMsg)); };
  ws.onmessage = (e) => {
    if (typeof e.data !== 'string') { onBinary(e.data); return; }
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'welcome') { welcomed = true; onWelcome(m); }
    else if (m.t === 'ev') onEvents(m);
    else if (m.t === 'lb') net.lb = m;
    else if (m.t === 'st') onStats(m);
    else if (m.t === 'dead') onNetDeath(m);
    else if (m.t === 'you') { net.youId = m.id; net.eaten = 0; me = null; ui = 'play'; closeDialog(); onRespawn(); }
    else if (m.t === 'sync') onSync(m);
    else if (m.t === 'err') onNetError(m.code);
  };
  ws.onclose = () => {
    if (net.ws !== ws) return;
    net.ws = null;
    if (net.leaving || mode !== 'net') return;
    if (!welcomed && !isRetry) { netFailed(); return; }
    netReconnect();
  };
}
function netFailed() {
  mode = null; net.ws = null;
  dialog('Нет связи с сервером', '<p>Совместная игра работает только через интернет на сайте игры. Одиночная игра доступна и без сети.</p>',
    [{ label: 'Понятно', kind: 'filled', onClick: toHome }]);
}
function netReconnect() {
  ui = 'conn';
  if (net.retry === 0) dialog('Связь потеряна', '<p>Переподключаюсь к комнате…</p>', [{ label: 'Выйти', kind: 'text', onClick: leaveNet }]);
  if (net.retry >= 10) {
    dialog('Не получилось переподключиться', '<p>Проверь интернет и зайди в комнату снова.</p>', [{ label: 'В меню', kind: 'filled', onClick: leaveNet }]);
    return;
  }
  net.retry++;
  clearTimeout(net.retryTimer);
  net.retryTimer = setTimeout(() => {
    if (mode !== 'net') return;
    netReset();
    netOpen(hello({ t: 'join', code: net.code }), true);
  }, net.retry === 1 ? 300 : 2000);
}
async function updateApp() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.update();
      await new Promise((res) => { navigator.serviceWorker.addEventListener('controllerchange', res); setTimeout(res, 2500); });
    }
  } catch { /* перезагрузим как есть */ }
  location.reload();
}
function onNetError(code) {
  if (code === 'version') {
    net.leaving = true;
    if (net.ws) net.ws.close();
    mode = null;
    dialog('Вышло обновление', '<p>На сервере новая версия игры. Обнови её на устройстве, чтобы играть вместе.</p>',
      [{ label: 'Позже', kind: 'text', onClick: toHome }, { label: 'Обновить', kind: 'filled', onClick: updateApp }]);
    return;
  }
  const text = {
    no_room: 'Комнаты с таким кодом нет. Проверь код или создай новую комнату.',
    full: 'В комнате уже 8 игроков.',
    limit: 'Сервер сейчас занят: слишком много комнат. Попробуй позже.',
  }[code] || 'Что-то пошло не так.';
  net.leaving = true;
  if (net.ws) net.ws.close();
  mode = null;
  dialog('Не получилось войти', `<p>${text}</p>`, [{ label: 'Понятно', kind: 'filled', onClick: toHome }]);
}
function makeNetSnake(m) {
  const segs = [];
  for (let i = 0; i < m.segs.length; i += 2) segs.push({ x: m.segs[i], y: m.segs[i + 1] });
  if (!segs.length) segs.push({ x: 0, y: 0 });
  return { id: m.id, name: m.name, skin: m.skin, team: m.team, human: m.human, segs, a: 0, ta: 0, mass: START_MASS,
    r: radiusOf(START_MASS), isBoosting: false, inv: 0, visible: false, seen: false };
}
function setFeast(f) { feast = f ? { x: f.x, y: f.y, until: time + f.life } : null; }
function onWelcome(m) {
  net.code = m.code; net.roomMode = m.mode; net.diff = m.diff; net.youId = m.you; net.retry = 0;
  net.snakes.clear(); net.foods.clear(); net.buf = []; net.lastTick = m.tick;
  for (const s of m.snakes) net.snakes.set(s.id, makeNetSnake(s));
  net.offset = performance.now() - m.tick * TICK_MS;
  const mine = net.snakes.get(m.you);
  if (mine) { cam.x = mine.segs[0].x; cam.y = mine.segs[0].y; net.myTeam = mine.team; }
  setFeast(m.feast);
  me = null;
  try { history.replaceState(null, '', `?room=${m.code}`); } catch { /* */ }
  $('roomChip').innerHTML = `${icon('group')}Комната ${m.code}${icon('share')}`;
  $('roomBox').hidden = false;
  closeDialog();
  showHome(false);
  if (!run) { run = newRun(m.diff); playTime = 0; }
  ui = 'play';
  hudT = 0;
}
function addNetFood(id, x, y, v, c, life) {
  net.foods.set(id, { id, x, y, v, c, r: foodRadiusOf(v), ph: Math.random() * TAU, life, age: 0 });
}
const readFood = (dv, o) => [dv.getUint32(o, true), dv.getInt16(o + 4, true) / 4, dv.getInt16(o + 6, true) / 4,
  dv.getUint16(o + 8, true) / 100, dv.getUint8(o + 10), dv.getUint8(o + 11)];
function onSync(m) { // догнали после пропущенных снимков: змеи рядом — заново, еда придёт следом целиком
  for (const s of m.snakes) net.snakes.set(s.id, makeNetSnake(s));
  setFeast(m.feast);
}
function onEvents(m) {
  for (const s of m.spawn || []) net.snakes.set(s.id, makeNetSnake(s)); // вошла в поле зрения — тело целиком
  if (m.feast) onFeast(m.feast.x, m.feast.y, m.feast.life);
  for (const k of m.kill || []) {
    if (k.k === net.youId) {
      const v = net.snakes.get(k.v);
      onMyKill(k.vn, k.v, k.vm, k.km, v ? v.segs[0] : null, v ? segColor(v.skin, 0) : GOLD);
    } else if (k.kh && net.roomMode === 'team' && k.v !== net.youId) snack(`Команда: «${k.vn}» выбывает`);
    else if (k.vh && k.v !== net.youId && k.kh) snack(`«${k.kn}» обгоняет «${k.vn}»`);
  }
}
function onStats(m) {
  if (m.eaten > net.eaten) net.eaten = m.eaten;
  if ('rv' in m) net.rv = m.rv;
}
function onBinary(buf) {
  const dv = new DataView(buf);
  const type = dv.getUint8(0);
  if (type === 2) { // вся еда вокруг разом
    net.foods.clear();
    const n = dv.getUint32(1, true);
    for (let i = 0, o = 5; i < n; i++, o += 12) addNetFood(...readFood(dv, o));
    for (const s of net.buf) s.applied = true;
    return;
  }
  if (type === 3) { // сменились клетки вокруг: из ушедших еду убираем, пришедшие — заново целиком
    let o = 1;
    const drop = new Set();
    const nl = dv.getUint8(o++);
    for (let i = 0; i < nl; i++) drop.add(dv.getUint8(o++));
    const ne = dv.getUint8(o++);
    for (let i = 0; i < ne; i++) drop.add(dv.getUint8(o++));
    for (const [id, f] of net.foods) if (drop.has(foodCellOf(f.x, f.y))) net.foods.delete(id);
    const n = dv.getUint32(o, true); o += 4;
    for (let i = 0; i < n; i++, o += 12) addNetFood(...readFood(dv, o));
    return;
  }
  if (type !== 1) return;
  let o = 1;
  const tick = dv.getUint32(o, true); o += 4;
  if (tick <= net.lastTick) return;
  net.lastTick = tick;
  const n = dv.getUint16(o, true); o += 2;
  const snakes = new Map();
  for (let i = 0; i < n; i++) {
    const id = dv.getUint32(o, true);
    const x = dv.getInt16(o + 4, true) / 4, y = dv.getInt16(o + 6, true) / 4;
    const a = dv.getUint16(o + 8, true) / 65535 * TAU, ta = dv.getUint16(o + 10, true) / 65535 * TAU;
    const mass = dv.getFloat32(o + 12, true), fl = dv.getUint8(o + 16);
    o += 17;
    snakes.set(id, { x, y, a, ta, mass, boost: !!(fl & 1), inv: !!(fl & 2) });
    const sn = net.snakes.get(id);
    if (sn) sn.seen = true;
  }
  const added = [];
  const na = dv.getUint16(o, true); o += 2;
  for (let i = 0; i < na; i++, o += 12) added.push(readFood(dv, o));
  const removed = [];
  const nr = dv.getUint16(o, true); o += 2;
  for (let i = 0; i < nr; i++) { removed.push(dv.getUint32(o, true)); o += 4; }

  const sample = performance.now() - tick * TICK_MS;
  net.offset = net.offset === null ? sample : Math.min(sample, net.offset + 2);
  net.buf.push({ tick, snakes, added, removed, applied: false });
  // вкладка свёрнута — кадры не рисуются и буфер не разбирается; старое не копим
  while (net.buf.length > 40) { applyFood(net.buf[0]); net.buf.shift(); }

  const mine = snakes.get(net.youId);
  if (mine) { if (mine.mass > net.myMass + 0.5 && !mine.boost && net.myMass > 0) sfx.eat(); net.myMass = mine.mass; }
}
function applyFood(s) {
  if (s.applied) return;
  s.applied = true;
  for (const f of s.added) addNetFood(...f);
  for (const id of s.removed) net.foods.delete(id);
}
function netUpdate(now, dt) {
  const buf = net.buf;
  if (!buf.length) return;
  const rt = now - net.offset - INTERP_MS;
  while (buf.length >= 2 && buf[1].tick * TICK_MS <= rt) { applyFood(buf[0]); buf.shift(); }
  const s0 = buf[0];
  if (s0.tick * TICK_MS <= rt) applyFood(s0);
  const s1 = buf[1] || s0;
  const t = s1 === s0 ? 1 : clamp((rt - s0.tick * TICK_MS) / ((s1.tick - s0.tick) * TICK_MS), 0, 1);
  for (const sn of net.snakes.values()) sn.visible = false;
  for (const [id, b] of s1.snakes) {
    const sn = net.snakes.get(id);
    if (!sn) continue;
    const a0 = s0.snakes.get(id) || b;
    sn.visible = true;
    sn.a = a0.a + angDiff(b.a, a0.a) * t;
    sn.ta = b.ta;
    sn.mass = a0.mass + (b.mass - a0.mass) * t;
    sn.r = radiusOf(sn.mass);
    sn.isBoosting = b.boost;
    sn.inv = b.inv ? 1 : 0;
    const h = sn.segs[0];
    h.x = a0.x + (b.x - a0.x) * t; h.y = a0.y + (b.y - a0.y) * t;
    followChain(sn.segs, spacingOf(sn.mass));
    fitLength(sn.segs, countOf(sn.mass));
  }
  const last = buf[buf.length - 1];
  for (const [id, sn] of net.snakes) if (sn.seen && !sn.visible && !last.snakes.has(id)) net.snakes.delete(id);
  // еда притягивается к головам, как на сервере, — иначе исчезает раньше, чем до неё доползли.
  // Только в видимой области: за экраном это никто не увидит.
  const hw = W / 2 / cam.z + 80, hh = H / 2 / cam.z + 80, k = Math.min(1, dt * 7);
  const heads = [];
  for (const sn of net.snakes.values()) {
    if (!sn.visible) continue;
    const h = sn.segs[0];
    if (Math.abs(h.x - cam.x) < hw && Math.abs(h.y - cam.y) < hh) heads.push(sn);
  }
  for (const f of net.foods.values()) {
    if (f.life > 0) f.age += dt;
    if (!heads.length || Math.abs(f.x - cam.x) > hw || Math.abs(f.y - cam.y) > hh) continue;
    for (const sn of heads) {
      const h = sn.segs[0], reach = sn.r + 40, dx = h.x - f.x, dy = h.y - f.y;
      if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
      if (dx * dx + dy * dy < reach * reach) { f.x += dx * k; f.y += dy * k; }
    }
  }
  const mine = net.snakes.get(net.youId);
  me = mine && mine.visible ? mine : null;
}
function netInput() {
  if (!me || ui === 'dead') return;
  const { a, b } = steer();
  const now = performance.now();
  const changed = (a !== null && (net.lastA === null || Math.abs(angDiff(a, net.lastA)) > 0.02)) || b !== net.lastB;
  if ((changed && now - net.lastSent > 50) || now - net.lastSent > 1000) {
    const m = { t: 'in', b: b ? 1 : 0 };
    if (a !== null) { m.a = Math.round(a * 1000) / 1000; net.lastA = a; }
    net.lastB = b; net.lastSent = now;
    netSend(m);
  }
}
function onNetDeath(m) {
  sfx.die();
  net.deadInfo = m;
  ui = 'dead';
  onLifeEnd(Math.max(m.eaten || 0, net.eaten), m.max);
  net.eaten = 0;
  if (m.byId) { run.revenge = { id: m.byId, name: m.by }; net.rv = null; }
  const who = m.by ? `На пути была змейка «${esc(m.by)}»` : 'Это край арены';
  setTimeout(() => {
    if (ui !== 'dead' || mode !== 'net') return;
    dialog('Ой!', `<p>${who}.</p><p>Длина была: <b>${m.mass}</b> · побед: <b>${run.kills}</b></p>${runXpLine()}` +
      `<p>Продолжишь с половиной длины.${m.by ? ` Стрелка покажет, где «${esc(m.by)}», — отомсти!` : ''}</p>`,
    [{ label: 'Выйти', kind: 'text', onClick: leaveNet }, { label: 'Продолжить', kind: 'filled', icon: 'play', onClick: () => netSend({ t: 'respawn' }) }]);
  }, 700);
}
function startNet(firstMsg) {
  ensureAudio();
  mode = 'net'; ui = 'conn'; me = null; world = null; net.kills = 0; net.retry = 0; net.eaten = 0;
  run = null; feast = null; effects = [];
  netReset();
  dialog('Подключаюсь…', '<p>Соединяюсь с сервером игры.</p>', [{ label: 'Отмена', kind: 'text', onClick: leaveNet }]);
  netOpen(firstMsg, false);
}
function leaveNet() {
  net.leaving = true;
  clearTimeout(net.retryTimer);
  netSend({ t: 'leave' });
  if (net.ws) net.ws.close();
  net.ws = null;
  try { history.replaceState(null, '', location.pathname); } catch { /* */ }
  toHome();
}
async function shareRoom() {
  const url = `${location.origin}${location.pathname}?room=${net.code}`;
  const text = `Заходи в Змейград! Комната ${net.code}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Змейград', text, url }); return; }
  } catch { return; }
  try { await navigator.clipboard.writeText(url); snack('Ссылка на комнату скопирована'); } catch { snack(`Код комнаты: ${net.code}`); }
}
$('roomChip').addEventListener('click', shareRoom);

// ---------- одиночная игра ----------
function startSolo(diff) {
  ensureAudio();
  mode = 'solo'; diffKey = diff;
  world = new World({ diff });
  me = world.addHuman({ name: myName(), skin: save.skin, inv: 2 });
  cam.x = me.x; cam.y = me.y;
  cam.z = baseZoom() * 1.3;
  playTime = 0; sessionBest = START_MASS; hudT = 0; lastSoloMass = me.mass;
  run = newRun(diff); feast = null; effects = [];
  ensureDaily();
  $('roomBox').hidden = true;
  showHome(false);
  closeDialog();
  ui = 'play';
  setTimeout(() => { if (run && ui === 'play') banner('На арене 100 змей', 'Расти и стань самой длинной!'); }, 600);
}
function soloEvents(events) {
  for (const e of events) {
    if (e.type === 'feast') { if (mode === 'solo') onFeast(e.x, e.y, e.life); continue; }
    if (mode !== 'solo') continue;
    if (e.killer && e.killer === me) onMyKill(e.victim.name, e.victim.id, e.vm, e.km, e.victim.segs[0], segColor(e.victim.skin, 0));
    if (e.victim === me) onSoloDeath(e.killer);
  }
}
function recordBest() {
  const score = Math.floor(sessionBest);
  if (score > (save.best[diffKey] || 0)) { save.best[diffKey] = score; persist(); return true; }
  return false;
}
function onSoloDeath(killer) {
  sfx.die();
  const who = killer ? `На пути была змейка «${esc(killer.name)}»` : 'Это край арены';
  const dead = me;
  onLifeEnd(dead.eaten, dead.maxMass);
  if (DIFF[diffKey].respawn) {
    recordBest();
    ui = 'dead';
    run.revenge = killer && killer.alive ? { id: killer.id, name: killer.name } : null;
    dialog('Ой!', `<p>${who}.</p><p>Длина была: <b>${Math.floor(dead.mass)}</b> · побед: <b>${run.kills}</b></p>${runXpLine()}` +
      `<p>Продолжишь с половиной длины.${run.revenge ? ` Стрелка покажет, где «${esc(killer.name)}», — отомсти!` : ''}</p>`,
    [{ label: 'В меню', kind: 'text', onClick: toHome }, { label: 'Продолжить', kind: 'filled', icon: 'play', onClick: () => {
      me = world.addHuman({ name: myName(), skin: save.skin, mass: Math.max(START_MASS, dead.mass * 0.5), inv: 3 });
      ui = 'play'; closeDialog(); onRespawn();
    } }]);
  } else {
    const isNew = recordBest();
    ui = 'over';
    const summary = finishRun();
    setTimeout(() => {
      if (ui !== 'over') return;
      dialog('Игра окончена', `<p>${who}.</p>${summary}` +
        `<p class="record">${icon('trophy')}${isNew ? 'Новый рекорд!' : `Рекорд: ${save.best[diffKey]}`}</p>`,
      [{ label: 'В меню', kind: 'text', onClick: toHome }, { label: 'Ещё раз', kind: 'filled', onClick: () => startSolo(diffKey) }]);
    }, 900);
  }
}

// ---------- ход игры: звания, места, серии, пир, месть ----------
const lifeEaten = () => (mode === 'net' ? net.eaten : me && me.alive ? me.eaten : 0);
function onLifeEnd(eaten, maxMass) {
  if (!run) return;
  run.eatenBase += eaten;
  if (maxMass > run.maxMass) run.maxMass = maxMass;
  runTick();
  persist();
}
function onRespawn() { if (run) run.lifeStart = playTime; }
function onFeast(x, y, life) {
  setFeast({ x, y, life });
  if (!run) return;
  sfx.feast();
  snack('На арене появился золотой пир — беги к нему по стрелке!');
}
function onMyKill(name, id, vm, km, pos, color) {
  if (!run) return;
  run.kills++; save.stats.kills++;
  const now = playTime;
  run.killTimes = run.killTimes.filter((t) => now - t < 5);
  run.killTimes.push(now);
  const n = run.killTimes.length;
  let xp = 10 + (vm > km ? 20 : 0) + (n >= 2 ? 10 * n : 0);
  if (pos) effects.push({ x: pos.x, y: pos.y, t: time, c: PAL[color] || GOLD_C, r: radiusOf(vm) });
  if (run.revenge && run.revenge.id === id) {
    run.revenge = null; xp += 40;
    banner('Месть удалась!', `«${name}» побеждён`); sfx.combo(3);
    taskEvent('revenge', 1);
  } else if (n >= 2) {
    banner(['', '', 'Двойная победа!', 'Тройная победа!', 'Мега-серия!'][Math.min(n, 4)], `«${name}» и ещё ${n - 1}`);
    sfx.combo(n);
  } else if (vm > km * 1.5 && vm > 300) {
    banner('Победа над гигантом!', `«${name}» — длина ${Math.floor(vm)}`); sfx.combo(2);
  } else { snack(`Победа над змейкой «${name}»! +${xp} ★`); sfx.win(); }
  taskEvent('kills', 1);
  if (vm > km) taskEvent('giant', 1);
  addXp(xp);
}
const RANK_STEPS = [[50, 10, ''], [10, 40, 'Ты в первой десятке!'], [3, 80, 'Ты в тройке лидеров!'], [1, 200, 'Ты — самая длинная змея арены!']];
// место и число змей на арене
function myRank() {
  if (!me) return null;
  if (mode === 'net') {
    const lb = net.lb;
    if (!lb) return null;
    let r = 1;
    for (let i = 2; i < lb.mm.length; i += 3) if (lb.mm[i] > me.mass) r++;
    // в mm есть и мы сами — со старой массой; не считаем себя
    const self = lb.hum.find((h) => h[0] === net.youId);
    if (self && self[4] > me.mass) r--;
    return { rank: Math.max(1, r), n: lb.n };
  }
  let r = 1;
  for (const s of world.snakes) if (s !== me && s.alive && s.mass > me.mass) r++;
  return { rank: r, n: world.snakes.length };
}
let persistT = 0;
function runTick() {
  if (!run) return;
  const total = run.eatenBase + lifeEaten();
  const ex = Math.floor(total / 4);
  if (ex > run.eatXp) { addXp(ex - run.eatXp); run.eatXp = ex; }
  if (total > run.eatTask + 1) { const d = Math.floor(total - run.eatTask); taskEvent('eat', d); save.stats.eaten += d; run.eatTask += d; }
  const alive = me && (mode === 'net' || me.alive) && ui === 'play';
  if (alive) {
    if (me.mass > run.maxMass) run.maxMass = me.mass;
    if (me.mass > save.stats.best) save.stats.best = Math.floor(me.mass);
    const ti = titleOf(me.mass);
    if (ti > run.maxTitle) {
      run.maxTitle = ti;
      if (ti >= 2) { banner(TITLES[ti][1], 'новое звание'); sfx.title(); }
      addXp(ti * 10);
    }
    taskEvent('grow', me.mass);
    taskEvent('survive', Math.floor((playTime - run.lifeStart) / 60));
    const rk = myRank();
    if (rk && playTime > 3) {
      if (rk.rank < run.bestRank) run.bestRank = rk.rank;
      taskEvent('top', rk.rank);
      for (const [lim, xp, text] of RANK_STEPS) {
        if (rk.rank <= lim && !run.flags.has(lim)) {
          run.flags.add(lim);
          addXp(xp);
          if (text) { banner(`Место ${rk.rank}`, text); sfx.title(); } else snack(`Ты в первой полусотне! +${xp} ★`);
        }
      }
    }
    if (feast && time < feast.until) {
      const key = `${Math.round(feast.x)},${Math.round(feast.y)}`;
      if (!run.feastSeen.has(key) && Math.hypot(me.segs[0].x - feast.x, me.segs[0].y - feast.y) < 420) {
        run.feastSeen.add(key);
        taskEvent('feast', 1); addXp(15);
        snack('Золотой пир! Ешь скорее, пока не растащили');
      }
    }
  }
  if (run.revenge) {
    const t = revengeTarget();
    if (t === false) { snack(`«${run.revenge.name}» уже выбыл без тебя`); run.revenge = null; }
  }
  persistT -= 0.25;
  if (persistT <= 0) { persistT = 5; persist(); }
}
// где обидчик: {x, y} — знаем, null — далеко и не видно, false — его больше нет
function revengeTarget() {
  const rv = run && run.revenge;
  if (!rv) return null;
  if (mode === 'solo') {
    const s = world.byId.get(rv.id);
    return s && s.alive ? s.segs[0] : false;
  }
  const s = net.snakes.get(rv.id);
  if (s && s.visible) return s.segs[0];
  if (net.rv === 0) return false;      // сервер сказал, что обидчика больше нет
  return net.rv ? { x: net.rv[0], y: net.rv[1] } : null;
}
function runXpLine() {
  return run ? `<p class="xp-line">${icon('star')}+${run.xp} звёзд за эту игру</p>` : '';
}
function levelHtml() {
  const L = levelOf(save.xp);
  return `<div class="lvl"><div class="badge"><small>УР.</small>${L.lvl}</div><div class="info"><b>Уровень ${L.lvl}</b>` +
    `<div class="bar gold"><i style="width:${(100 * L.cur / L.need).toFixed(1)}%"></i></div>` +
    `<span>${icon('star').replace('class="i"', 'class="i star" style="width:14px;height:14px;vertical-align:-2px"')} ${L.cur} из ${L.need} до следующего</span></div></div>`;
}
// итоги игры: звёзды уже начислены по ходу, здесь — статистика и сохранение
function finishRun() {
  if (!run) return '';
  runTick();
  const r = run;
  save.stats.games++;
  persist();
  const html = `<div class="big-num">${Math.floor(r.maxMass)}</div><p>лучшая длина · звание «${TITLES[r.maxTitle][1]}»</p>` +
    `<div class="sum"><div><b>${r.bestRank < 999 ? `#${r.bestRank}` : '—'}</b><small>лучшее место</small></div>` +
    `<div><b>${r.kills}</b><small>побед над змеями</small></div><div><b>${fmtTime(playTime)}</b><small>время</small></div>` +
    `<div><b class="star">+${r.xp} ★</b><small>звёзд</small></div></div>${levelHtml()}`;
  run = null;
  return html;
}

// ---------- меню, пауза ----------
function tasksHtml() {
  const d = ensureDaily();
  return `<div class="tasks">${d.tasks.map((t) => {
    const x = taskText(t);
    return `<div class="task${t.done ? ' done' : ''}"><span class="ti">${icon(t.done ? 'check' : 'flag')}</span>` +
      `<span class="tt">${esc(x.title)}<div class="bar"><i style="width:${(x.frac * 100).toFixed(0)}%"></i></div><small>${x.prog}</small></span>` +
      `<span class="rw">${t.done ? 'готово' : `+${t.reward} ★`}</span></div>`;
  }).join('')}</div>`;
}
function openMenu() {
  if (ui !== 'play') return;
  if (mode === 'solo') {
    ui = 'paused';
    dialog('Пауза', `${runXpLine()}<div class="sub">Задания на сегодня</div>${tasksHtml()}`,
      [{ label: 'В меню', kind: 'text', onClick: toHome }, { label: 'Продолжить', kind: 'filled', icon: 'play', onClick: resume }]);
  } else if (mode === 'net') {
    dialog(`Комната ${net.code}`, `<p>Игра продолжается, пока открыто меню.</p><p>${net.roomMode === 'team' ? 'Команда против ботов' : 'Все против всех'} · боты: ${DIFF[net.diff].label.toLowerCase()}</p>` +
      `${runXpLine()}<div class="sub">Задания на сегодня</div>${tasksHtml()}`,
    [{ label: 'Выйти', kind: 'text', onClick: leaveNet }, { label: 'Пригласить', kind: 'tonal', icon: 'share', onClick: shareRoom },
      { label: 'Играть', kind: 'filled', onClick: closeDialog }]);
  }
}
function resume() { if (ui === 'paused') { ui = 'play'; closeDialog(); last = performance.now(); } }
$('btnMenu').addEventListener('click', openMenu);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
  if (document.hidden && mode === 'solo') openMenu();
  if (!document.hidden && mode === 'net' && !net.ws && !net.leaving) netReconnect();
});
window.addEventListener('pagehide', persist);
const soundBtn = $('btnSound');
const renderSound = () => { soundBtn.innerHTML = icon(save.sound ? 'vol' : 'volOff'); };
soundBtn.addEventListener('click', () => { save.sound = !save.sound; persist(); renderSound(); ensureAudio(); });
renderSound();

function toHome() {
  if (mode === 'solo' && me) recordBest();
  if (run) finishRun();
  mode = null; me = null; ui = 'home'; feast = null; effects = [];
  closeDialog();
  world = new World({ diff: 'easy' });
  demoFocus = null;
  cam.x = 0; cam.y = 0;
  showHome(true);
  renderHome();
}
function showHome(v) {
  $('home').hidden = !v;
  $('hud').hidden = v;
  $('btnMenu').innerHTML = icon(mode === 'net' ? 'menu' : 'pause');
}

// ---------- диалоги и снекбар ----------
function dialog(title, body, actions) {
  $('dlgTitle').textContent = title;
  $('dlgBody').innerHTML = body;
  const box = $('dlgActions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn ${a.kind || 'text'}`;
    b.innerHTML = (a.icon ? icon(a.icon) : '') + esc(a.label);
    b.addEventListener('click', a.onClick);
    box.appendChild(b);
  }
  $('dlg').hidden = false;
}
function closeDialog() { $('dlg').hidden = true; }
let snackTimer = 0;
function snack(text) {
  const s = $('snack');
  s.textContent = text; s.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => s.classList.remove('show'), 2400);
}
// крупная надпись по центру: звания, места, серии побед, уровни
function banner(title, sub = '') {
  const b = $('banner');
  b.querySelector('b').textContent = title;
  b.querySelector('small').textContent = sub;
  b.classList.remove('show');
  void b.offsetWidth; // перезапуск анимации
  b.classList.add('show');
}

// ---------- главный экран ----------
const nameInput = $('name');
nameInput.value = save.name;
nameInput.addEventListener('input', () => { save.name = nameInput.value.trim().slice(0, 12); persist(); });
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });
const skinsEl = $('skins');
// превью раскраски — полоски её цветов
const skinBg = (sk) => {
  const cols = [];
  for (let i = 0; i < 8; i++) cols.push(PAL[sk.p[Math.floor(i * Math.max(1, sk.p.length / 8)) % sk.p.length]]);
  return `linear-gradient(135deg,${cols.map((c, i) => `${c} ${(i * 12.5).toFixed(1)}% ${((i + 1) * 12.5).toFixed(1)}%`).join(',')})`;
};
SKINS.forEach((sk, i) => {
  const b = document.createElement('button');
  b.className = 'skin';
  b.style.background = skinBg(sk);
  b.setAttribute('aria-label', sk.name);
  b.addEventListener('click', () => {
    if (sk.lvl > myLevel()) { $('skinName').textContent = `«${sk.name}» откроется на ${sk.lvl} уровне`; return; }
    save.skin = i; persist(); renderHome();
  });
  skinsEl.appendChild(b);
});
document.querySelectorAll('.item[data-d]').forEach((b) => b.addEventListener('click', () => startSolo(b.dataset.d)));
function renderHome() {
  const lvl = myLevel();
  if (!SKINS[save.skin] || SKINS[save.skin].lvl > lvl) save.skin = 0;
  $('lvl').outerHTML = levelHtml().replace('class="lvl"', 'class="lvl" id="lvl"');
  [...skinsEl.children].forEach((b, i) => {
    const sk = SKINS[i], locked = sk.lvl > lvl;
    b.classList.toggle('sel', i === save.skin);
    b.classList.toggle('locked', locked);
    b.innerHTML = locked ? `${icon('lock')}<span class="lv">ур. ${sk.lvl}</span>` : icon('check');
  });
  const next = SKINS.filter((x) => x.lvl > lvl).sort((a, b) => a.lvl - b.lvl)[0];
  $('skinName').textContent = `«${SKINS[save.skin].name}»` + (next ? ` · следующая раскраска на ${next.lvl} уровне` : ' · открыты все раскраски!');
  const d = ensureDaily();
  $('tasks').innerHTML = tasksHtml().replace(/^<div class="tasks">|<\/div>$/g, '');
  $('tasksNote').textContent = d.tasks.every((t) => t.done) ? 'все выполнены — завтра будут новые' : `за все три — ещё +${ALL_TASKS_BONUS} ★`;
  for (const k of Object.keys(DIFF)) {
    const v = save.best[k] || 0;
    $(`best-${k}`).innerHTML = v ? `<span class="chip">${icon('trophy')}${v}</span>` : '';
  }
  const online = navigator.onLine !== false;
  const note = $('netNote');
  note.hidden = online;
  note.className = 'note warn';
  note.innerHTML = `${icon('cloudOff')}<span>Сейчас нет интернета — совместная игра недоступна.</span>`;
  $('btnCreate').disabled = !online;
  $('btnJoin').disabled = !online;
}
window.addEventListener('online', renderHome);
window.addEventListener('offline', renderHome);

// создать комнату
let createOpts = { mode: 'team', diff: 'easy' };
function segHtml(name, opts) {
  return `<div class="seg" data-seg="${name}">${opts.map(([v, l]) =>
    `<button data-v="${v}" class="${createOpts[name] === v ? 'on' : ''}">${icon('check')}${l}</button>`).join('')}</div>`;
}
function openCreate() {
  dialog('Новая комната',
    `<div class="sub">Режим</div>${segHtml('mode', [['team', 'Команда'], ['ffa', 'Все против всех']])}` +
    '<p class="hint" id="modeHint"></p>' +
    `<div class="sub">Боты</div>${segHtml('diff', [['easy', 'Лёгкие'], ['medium', 'Средние'], ['hard', 'Сложные']])}` +
    '<p class="hint">После проигрыша в комнате всегда можно продолжить.</p>',
    [{ label: 'Отмена', kind: 'text', onClick: closeDialog },
      { label: 'Создать', kind: 'filled', onClick: () => startNet(hello({ t: 'create', ...createOpts })) }]);
  const hint = () => {
    $('modeHint').textContent = createOpts.mode === 'team'
      ? 'Свои змейки проходят друг сквозь друга — играете вместе против ботов.'
      : 'Как в одиночной игре: подрезать можно и друг друга.';
  };
  hint();
  document.querySelectorAll('#dlg .seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      createOpts[seg.dataset.seg] = b.dataset.v;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      hint();
    });
  });
}
$('btnCreate').addEventListener('click', openCreate);
const codeInput = $('code');
codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4); });
const joinByCode = () => {
  const code = codeInput.value.trim();
  if (!/^\d{4}$/.test(code)) { snackHome('Код комнаты — 4 цифры'); codeInput.focus(); return; }
  codeInput.blur();
  startNet(hello({ t: 'join', code }));
};
$('btnJoin').addEventListener('click', joinByCode);
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinByCode(); });
function snackHome(text) {
  dialog('Код комнаты', `<p>${esc(text)}</p>`, [{ label: 'Понятно', kind: 'filled', onClick: closeDialog }]);
}

$('help').innerHTML = (isTouch
  ? 'Управление: коснись экрана в любом месте и веди пальцем — это джойстик. Держи молнию, чтобы ускориться: это тратит немного длины.'
  : 'Управление: змейка ползёт к курсору мыши. Левая кнопка или пробел — ускорение, тратит немного длины. Можно стрелками ← →. Пауза — Esc.') +
  ' Подрежь соперника — пусть врежется в тебя головой. Золотой пир и обидчик отмечены стрелками у края экрана.';
$('ver').textContent = `версия ${VERSION}`;

// ---------- офлайн ----------
const isStandalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
  (window.matchMedia && matchMedia('(display-mode: fullscreen)').matches) || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installHint() {
  if (isStandalone) return '';
  if (isIOS) return ' Чтобы играть в самолёте: Safari → «Поделиться» → «На экран „Домой“», затем один раз открой игру с иконки, пока есть интернет.';
  if (/Android/.test(navigator.userAgent)) return ' Чтобы играть в самолёте: Chrome → ⋮ → «Добавить на главный экран», затем один раз открой игру с иконки при интернете.';
  return '';
}
async function checkOffline() {
  const el = $('offline');
  const set = (cls, ic, text) => { el.className = `note ${cls}`; el.innerHTML = `${icon(ic)}<span>${text}</span>`; };
  if (!('serviceWorker' in navigator) || !window.caches) { set('warn', 'cloudOff', 'Этот браузер не умеет сохранять игру для офлайна.'); return; }
  try {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    let ok = false;
    for (const k of await caches.keys()) {
      if (!k.startsWith('zmeigrad-')) continue;
      const c = await caches.open(k);
      if ((await c.match('index.html')) && (await c.match('client.js')) && (await c.match('core.js'))) ok = true;
    }
    if (ok) set('ok', 'cloudDone', 'Игра сохранена на устройстве: одиночная игра работает без интернета.' + installHint());
    else { set('', 'cloudOff', 'Сохраняю игру для офлайна…' + installHint()); setTimeout(checkOffline, 1500); }
  } catch (e) {
    set('warn', 'cloudOff', 'Не получилось включить офлайн-режим: ' + esc(e.message));
  }
}
checkOffline();

// ---------- камера ----------
const baseZoom = () => Math.min(W, H) / 760;
function updateCamera(dt) {
  let target = me && (mode === 'net' || me.alive) ? me : null;
  if (!target && mode === null && world) {
    if (!demoFocus || !demoFocus.alive) demoFocus = world.snakes.reduce((a, s) => (!a || s.mass > a.mass ? s : a), null);
    target = demoFocus;
  }
  let tr = 11;
  if (target) {
    const h = target.segs[0];
    const k = Math.min(1, dt * (target === me ? 12 : 3));
    cam.x += (h.x - cam.x) * k; cam.y += (h.y - cam.y) * k;
    tr = target.r;
  }
  // чем толще змейка, тем дальше камера — гиганту нужно видеть, кого он окружает
  let zt = baseZoom() * clamp(1.3 * Math.pow(11 / tr, 0.5), 0.5, 1.3);
  if (mode === null) zt *= 0.8;
  cam.z += (zt - cam.z) * Math.min(1, dt * 2);
}

// ---------- рисование ----------
const isMate = (s) => mode === 'net' && net.roomMode === 'team' && s.human && s.team && s.team === net.myTeam;
function drawSnake(s, vx0, vy0, vx1, vy1) {
  const segs = s.segs, r = s.r, sk = SKINS[s.skin] || SKINS[0];
  const h = segs[0], n = segs.length;
  const margin = bodyLenOf(s.mass) + r;
  if (h.x < vx0 - margin || h.x > vx1 + margin || h.y < vy0 - margin || h.y > vy1 + margin) return;
  const x0 = vx0 - r * 2, x1 = vx1 + r * 2, y0 = vy0 - r * 2, y1 = vy1 + r * 2;
  ctx.globalAlpha = s.inv > 0 ? 0.45 + 0.25 * Math.sin(time * 18) : 1;
  // рисуем бусины через сегмент: меньше перерисовки, а тело всё равно сплошное; мелкую на экране — реже
  const step = r * cam.z < 3 ? 4 : 2;
  if (s.isBoosting) {
    const g = r * 1.9, pulse = 0.55 + 0.25 * Math.sin(time * 20);
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * pulse;
    for (let i = (n - 1) & ~1; i >= 0; i -= 4) {
      const q = segs[i];
      if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue;
      ctx.drawImage(glowSprites[segColor(s.skin, i)], q.x - g, q.y - g, g * 2, g * 2);
    }
    ctx.globalAlpha = a0;
  }
  const tail = Math.min(10, n >> 2);
  for (let i = (n - 1) & ~1; i >= 2; i -= step) {
    const q = segs[i];
    if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue;
    const rr = i > n - tail ? r * (0.55 + 0.45 * (n - i) / tail) : r; // хвост сужается
    ctx.drawImage(segSprites[segColor(s.skin, i)], q.x - rr, q.y - rr, rr * 2, rr * 2);
  }
  const hr = r * 1.1;
  ctx.drawImage(segSprites[sk.head], h.x - hr, h.y - hr, hr * 2, hr * 2);
  const a = s.a, look = s.ta;
  for (const side of [-1, 1]) {
    const ex = h.x + Math.cos(a + side * 0.6) * r * 0.55, ey = h.y + Math.sin(a + side * 0.6) * r * 0.55;
    ctx.beginPath(); ctx.arc(ex, ey, r * 0.36, 0, TAU); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.beginPath(); ctx.arc(ex + Math.cos(look) * r * 0.14, ey + Math.sin(look) * r * 0.14, r * 0.2, 0, TAU);
    ctx.fillStyle = '#1A1C19'; ctx.fill();
  }
  ctx.globalAlpha = 1;

  const rv = run && run.revenge && run.revenge.id === s.id;
  if (rv) { // обидчик: красное кольцо вокруг головы
    ctx.beginPath(); ctx.arc(h.x, h.y, r * 1.7 + 4 * Math.sin(time * 6), 0, TAU);
    ctx.lineWidth = 3 / cam.z; ctx.strokeStyle = REVENGE; ctx.stroke();
  }
  if (s.id === leaderId) drawCrown(h.x, h.y - r - 30 / cam.z, Math.max(r * 0.6, 10 / cam.z));
  if (mode !== null || s === demoFocus) {
    ctx.font = `500 ${Math.round(13 / cam.z)}px Roboto, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = s === me ? PRIMARY : rv ? REVENGE : isMate(s) ? TERTIARY : hexA(ON, 0.75);
    ctx.fillText(s.name, h.x, h.y - r - 10 / cam.z);
  }
}
function drawCrown(x, y, w) {
  ctx.beginPath();
  ctx.moveTo(x - w, y); ctx.lineTo(x - w, y - w * 0.9); ctx.lineTo(x - w * 0.5, y - w * 0.45); ctx.lineTo(x, y - w * 1.1);
  ctx.lineTo(x + w * 0.5, y - w * 0.45); ctx.lineTo(x + w, y - w * 0.9); ctx.lineTo(x + w, y); ctx.closePath();
  ctx.fillStyle = GOLD_C; ctx.fill();
  ctx.lineWidth = 2 / cam.z; ctx.strokeStyle = '#8a5a00'; ctx.stroke();
}
function drawJoystick() {
  if (!joy.active || mode === null) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.beginPath(); ctx.arc(joy.bx, joy.by, JOY_R, 0, TAU);
  ctx.fillStyle = 'rgba(225,227,222,0.08)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(225,227,222,0.28)'; ctx.stroke();
  let dx = joy.x - joy.bx, dy = joy.y - joy.by;
  const len = Math.hypot(dx, dy);
  if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
  ctx.beginPath(); ctx.arc(joy.bx + dx, joy.by + dy, 26, 0, TAU);
  ctx.fillStyle = hexA(PRIMARY, 0.85); ctx.fill();
}
// стрелка у края экрана к цели за его пределами
function drawPointer(tx, ty, color, label) {
  const sx = W / 2 + (tx - cam.x) * cam.z, sy = H / 2 + (ty - cam.y) * cam.z;
  const pad = 54;
  if (sx > pad && sx < W - pad && sy > pad && sy < H - pad) return;
  const dx = sx - W / 2, dy = sy - H / 2;
  const k = Math.min((W / 2 - pad) / Math.abs(dx || 1e-6), (H / 2 - pad) / Math.abs(dy || 1e-6));
  const px = W / 2 + dx * k, py = H / 2 + dy * k, a = Math.atan2(dy, dx);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.save();
  ctx.translate(px, py); ctx.rotate(a);
  const bob = 3 * Math.sin(time * 6);
  ctx.beginPath(); ctx.moveTo(18 + bob, 0); ctx.lineTo(-8 + bob, -12); ctx.lineTo(-3 + bob, 0); ctx.lineTo(-8 + bob, 12); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
  ctx.restore();
  ctx.font = '600 12px Roboto, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  const lx = px - Math.cos(a) * 26, ly = py - Math.sin(a) * 26 + 4;
  ctx.fillText(`${label} · ${Math.round(Math.hypot(tx - (me ? me.segs[0].x : cam.x), ty - (me ? me.segs[0].y : cam.y)) / 100)} м`, lx, ly);
}
function sceneSnakes() {
  if (mode === 'net') { const out = []; for (const s of net.snakes.values()) if (s.visible) out.push(s); return out; }
  return world ? world.snakes : [];
}
function sceneFoods() { return mode === 'net' ? net.foods.values() : (world ? world.foods : []); }

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = OUTSIDE;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const z = cam.z;
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (W / 2 - cam.x * z), DPR * (H / 2 - cam.y * z));
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU);
  ctx.fillStyle = gridPattern; ctx.fill();
  ctx.lineWidth = 10; ctx.strokeStyle = EDGE; ctx.stroke();

  const hw = W / 2 / z, hh = H / 2 / z;
  const vx0 = cam.x - hw - 30, vx1 = cam.x + hw + 30, vy0 = cam.y - hh - 30, vy1 = cam.y + hh + 30;
  if (feast && time < feast.until) { // золотое сияние под пиром
    const g = ctx.createRadialGradient(feast.x, feast.y, 0, feast.x, feast.y, 420);
    g.addColorStop(0, 'rgba(255,212,71,0.22)'); g.addColorStop(1, 'rgba(255,212,71,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(feast.x, feast.y, 420, 0, TAU); ctx.fill();
  }
  for (const f of sceneFoods()) {
    if (f.x < vx0 || f.x > vx1 || f.y < vy0 || f.y > vy1) continue;
    ctx.globalAlpha = f.life > 0 && f.life - f.age < 3 ? Math.max(0, (f.life - f.age) / 3) : 1;
    const rr = f.r * 1.9 * (1 + 0.12 * Math.sin(time * 3 + f.ph));
    ctx.drawImage(foodSprites[f.c] || foodSprites[0], f.x - rr, f.y - rr, rr * 2, rr * 2);
  }
  ctx.globalAlpha = 1;

  const snakes = sceneSnakes();
  // мелкие сверху крупных: так видно, кто кого подрезает
  const order = snakes.filter((s) => s !== me).sort((a, b) => b.mass - a.mass);
  for (const s of order) drawSnake(s, vx0, vy0, vx1, vy1);
  if (me && (mode === 'net' || me.alive)) drawSnake(me, vx0, vy0, vx1, vy1);

  // вспышки побед
  effects = effects.filter((e) => time - e.t < 0.8);
  for (const e of effects) {
    const k = (time - e.t) / 0.8;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.5 + k * 5), 0, TAU);
    ctx.lineWidth = (6 * (1 - k) + 1) / z; ctx.strokeStyle = e.c; ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (mode) {
    if (feast && time < feast.until) drawPointer(feast.x, feast.y, GOLD_C, 'Пир');
    const rt = revengeTarget();
    if (rt) drawPointer(rt.x, rt.y, REVENGE, run.revenge.name);
  }
  drawJoystick();
}

function drawMini() {
  const S = mini.width, c = S / 2, k = (S / 2 - 8) / R;
  mctx.clearRect(0, 0, S, S);
  mctx.beginPath(); mctx.arc(c, c, S / 2 - 4, 0, TAU);
  mctx.fillStyle = 'rgba(39,43,39,0.9)'; mctx.fill();
  mctx.lineWidth = 3; mctx.strokeStyle = hexA(EDGE, 0.7); mctx.stroke();
  const dot = (x, y, m, color) => {
    const sz = 2 + Math.min(7, radiusOf(m) / 8);
    mctx.fillStyle = color;
    mctx.fillRect(c + x * k - sz / 2, c + y * k - sz / 2, sz, sz);
  };
  if (mode === 'net') {
    const lb = net.lb;
    if (lb) {
      for (let i = 0; i < lb.mm.length; i += 3) dot(lb.mm[i] * 25, lb.mm[i + 1] * 25, lb.mm[i + 2], 'rgba(194,201,189,0.45)');
      for (const h of lb.hum) if (h[0] !== net.youId && net.roomMode === 'team' && h[5] === net.myTeam) dot(h[2], h[3], 400, TERTIARY);
    }
  } else {
    for (const s of sceneSnakes()) if (s !== me) dot(s.segs[0].x, s.segs[0].y, s.mass, s.id === leaderId ? GOLD_C : 'rgba(194,201,189,0.45)');
  }
  if (feast && time < feast.until) {
    mctx.beginPath(); mctx.arc(c + feast.x * k, c + feast.y * k, 7 + 2 * Math.sin(time * 6), 0, TAU);
    mctx.fillStyle = GOLD_C; mctx.fill();
  }
  const rt = mode ? revengeTarget() : null;
  if (rt) { mctx.beginPath(); mctx.arc(c + rt.x * k, c + rt.y * k, 6, 0, TAU); mctx.fillStyle = REVENGE; mctx.fill(); }
  if (me && (mode === 'net' || me.alive)) {
    mctx.beginPath(); mctx.arc(c + me.segs[0].x * k, c + me.segs[0].y * k, 8, 0, TAU);
    mctx.fillStyle = PRIMARY; mctx.fill();
  }
}

let hudT = 0;
function updateHud(dt) {
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.25;
  runTick();
  const snakes = sceneSnakes();
  let len = 0;
  if (mode === 'solo' && me) len = Math.floor(me.alive ? me.mass : me.maxMass);
  else if (mode === 'net') len = Math.floor(me ? me.mass : (net.deadInfo ? net.deadInfo.mass : 0));
  const ti = titleOf(len), nextT = TITLES[ti + 1];
  const frac = nextT ? clamp((len - TITLES[ti][0]) / (nextT[0] - TITLES[ti][0]), 0, 1) : 1;
  const rk = myRank();
  let sub = `${TITLES[ti][1]}${nextT ? ` → ${nextT[1]}` : ''}`;
  if (mode === 'net' && net.roomMode === 'team' && net.lb) {
    const team = net.lb.hum.filter((h) => h[5] === net.myTeam).reduce((a, h) => a + h[4], 0);
    sub += ` · команда ${team}`;
  }
  $('score').innerHTML = `<b>Длина ${len}</b>` +
    `<small class="rk">${rk ? `#${rk.rank} из ${rk.n} · ` : ''}<span class="star">${icon('star')}+${run ? run.xp : 0}</span></small>` +
    `<div class="bar"><i style="width:${(frac * 100).toFixed(0)}%"></i></div><small>${esc(sub)}</small>`;

  // таблица лидеров: в одиночной — весь мир, в комнате — с сервера
  let rows;
  if (mode === 'net') rows = net.lb ? net.lb.top.map((t) => ({ id: t[0], name: t[1], mass: t[2], human: t[3], team: t[4] })) : [];
  else rows = snakes.slice().sort((a, b) => b.mass - a.mass).slice(0, 5);
  leaderId = rows.length ? rows[0].id : 0;
  const myId = mode === 'net' ? net.youId : me && me.id;
  let html = `<div class="head"><span>Самые длинные</span><span>${rk ? rk.n : snakes.length} змей</span></div>`;
  const row = (s, i) => {
    const cls = s.id === myId ? ' me' : (mode === 'net' && net.roomMode === 'team' && s.human && s.team === net.myTeam) ? ' mate' : '';
    return `<div class="row${cls}"><span>${i === 0 ? `<span class="c">${icon('trophy').replace('class="i"', 'class="i" style="width:12px;height:12px;vertical-align:-1px"')}</span>` : `${i + 1}. `}${esc(s.name)}</span><span>${Math.floor(s.mass)}</span></div>`;
  };
  rows.slice(0, 5).forEach((s, i) => { html += row(s, i); });
  if (rk && rk.rank > 5 && me) html += `<div class="sep"></div>${row({ id: myId, name: me.name, mass: me.mass }, rk.rank - 1)}`;
  $('board').innerHTML = html;
}

// ---------- главный цикл ----------
let last = performance.now();
let lastSoloMass = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  time += dt;
  if (feast && time > feast.until) feast = null;
  if (mode === 'net') {
    netInput();
    netUpdate(now, dt);
    if (ui === 'play') playTime += dt;
  } else if (ui !== 'paused') {
    if (mode === 'solo' && me && me.alive) {
      const { a, b } = steer();
      if (a !== null) me.ta = a;
      me.boost = b;
    }
    if (world) soloEvents(world.step(dt));
    if (mode === 'solo' && me && me.alive) {
      if (ui === 'play') playTime += dt;
      if (me.mass > lastSoloMass + 0.5 && !me.isBoosting) sfx.eat();
      lastSoloMass = me.mass;
      if (me.maxMass > sessionBest) sessionBest = me.maxMass;
    }
  }
  if (ui !== 'paused') {
    updateCamera(dt);
    draw();
    if (mode) { drawMini(); updateHud(dt); }
  }
  requestAnimationFrame(frame);
}

toHome();
requestAnimationFrame(frame);

// приглашение по ссылке ?room=1234
const inviteCode = new URLSearchParams(location.search).get('room');
if (inviteCode && /^\d{4}$/.test(inviteCode)) {
  codeInput.value = inviteCode;
  dialog(`Комната ${inviteCode}`, '<p>Тебя зовут играть вместе. Проверь имя и цвет змейки на главном экране или заходи сразу.</p>',
    [{ label: 'Позже', kind: 'text', onClick: closeDialog }, { label: 'Войти', kind: 'filled', onClick: () => startNet(hello({ t: 'join', code: inviteCode })) }]);
}

// для автотестов
window.__snake = {
  get mode() { return mode; }, get ui() { return ui; }, get me() { return me; }, get world() { return world; },
  get net() { return net; }, get joy() { return joy; }, get run() { return run; }, get save() { return save; }, startSolo,
};
