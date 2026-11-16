// Клиент: отрисовка, управление, меню; одиночная игра считает мир сама, совместная — получает его с сервера.
import {
  World, SKINS, PAL, GOLD, DIFF, R, TAU, START_MASS, SNAKES_N, FOOD_N, VERSION, TITLES, titleOf, segColor,
  radiusOf, spacingOf, countOf, bodyLenOf, foodRadiusOf, followChain, fitLength, clamp, angDiff,
} from './core.js';

const TICK_MS = 25;        // сервер: 40 шагов в секунду
const INTERP_MS = 110;     // рисуем мир с задержкой на два снимка — так движение плавное
const JOY_R = 44;          // радиус джойстика: чем он меньше, тем короче движение пальца для разворота

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
  trophy: '<path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>',
  cloudOff: '<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4c-1.48 0-2.85.43-4.01 1.17l1.46 1.46C10.21 6.23 11.08 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19c1.66 0 3 1.34 3 3 0 1.13-.64 2.11-1.56 2.62l1.45 1.45C23.16 18.16 24 16.68 24 15c0-2.64-2.05-4.78-4.65-4.96zM3 5.27l2.75 2.74C2.56 8.15 0 10.77 0 14c0 3.31 2.69 6 6 6h11.73l2 2L21 20.73 4.27 4 3 5.27zM7.73 10l8 8H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73z"/>',
  lock: '<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>',
  left: '<path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>',
  right: '<path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>',
  star: '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>',
  cloudDone: '<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 17l-3.5-3.5 1.41-1.41L10 14.17 15.18 9l1.41 1.41L10 17z"/>',
};
const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const $ = (id) => document.getElementById(id);
document.querySelectorAll('[data-icon]').forEach((el) => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

// ---------- сохранение ----------
// xp — накопленные звёзды (имя ключа осталось от уровней)
const save = { best: { easy: 0, medium: 0, hard: 0 }, name: '', skin: 0, sound: true, xp: 0, diff: 'easy', hinted: false,
  stats: { games: 0, kills: 0, eaten: 0, best: 0 } };
try { Object.assign(save, JSON.parse(localStorage.getItem('zmeigrad') || '{}')); } catch { /* приватный режим */ }
delete save.daily; // задания дня убраны
if (!SKINS[save.skin]) save.skin = 0;
if (!DIFF[save.diff]) save.diff = 'easy';
const persist = () => { try { localStorage.setItem('zmeigrad', JSON.stringify(save)); } catch { /* ничего */ } };
const myName = () => save.name || 'Игрок';
const soloName = () => 'Ты'; // одному имя не нужно
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
  feast() { tone(700, 900, 0.15, 0.06, 'triangle'); tone(900, 1200, 0.2, 0.06, 'triangle', 0.15); },
};

// ---------- прогрессия: звёзды открывают раскраски ----------
// Звёзды копятся за всё время: еда, победы, звания, места в таблице. Тратить их не нужно — раскраска открывается,
// когда накоплено её число звёзд.
const stars = () => Math.floor(save.xp);
const unlocked = (sk) => sk.stars <= save.xp;
const nextSkin = () => SKINS.filter((x) => !unlocked(x)).sort((a, b) => a.stars - b.stars)[0] || null;
function addXp(n) {
  if (n <= 0) return;
  const before = save.xp;
  save.xp += n;
  if (run) run.xp += n;
  const fresh = SKINS.filter((x) => x.stars > before && x.stars <= save.xp);
  if (fresh.length) {
    if (run) run.unlocked.push(...fresh.map((x) => x.name));
    if (mode && ui === 'play') banner('Новая раскраска!', `«${fresh.map((x) => x.name).join('», «')}»`, sfx.level, true);
    persist();
  }
}

// ---------- холст ----------
const canvas = $('c'), ctx = canvas.getContext('2d');
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

// спрайты: бусины змейки, голова, светящаяся еда — по одному на цвет палитры
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
const SPR = 64, BSPR = 96;
// спрайты рисуются при первом обращении к цвету: цветов в палитре около сотни, на арене видна малая часть
const lazy = (size, draw) => { const cache = []; return (k) => cache[k] || (cache[k] = (() => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size / 2, PAL[k] || PAL[0]); return c;
})()); };
const headSprite = lazy(SPR, (g, m, col) => {
  g.beginPath(); g.arc(m, m, m - 1, 0, TAU); g.fillStyle = shade(col, -0.55); g.fill();
  const gr = g.createRadialGradient(m * 0.72, m * 0.62, m * 0.1, m, m, m - 3);
  gr.addColorStop(0, shade(col, 0.45)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, -0.25));
  g.beginPath(); g.arc(m, m, m - 3.5, 0, TAU); g.fillStyle = gr; g.fill();
});
// бусина-чешуйка: смотрит вдоль +x (к голове), тёмная дужка — по заднему краю
function drawBead(g, m, col) {
  const R = m - 1, w = R * 0.09;
  g.beginPath(); g.arc(m, m, R, 0, TAU); g.fillStyle = shade(col, -0.5); g.fill();
  const gr = g.createRadialGradient(m + R * 0.3, m, R * 0.1, m, m, R);
  gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(0.7, col); gr.addColorStop(1, shade(col, -0.3));
  g.beginPath(); g.arc(m, m, R - w, 0, TAU); g.fillStyle = gr; g.fill();
  g.beginPath(); g.arc(m, m, R * 0.62, Math.PI - 1, Math.PI + 1);
  g.lineWidth = w; g.lineCap = 'round'; g.strokeStyle = shade(col, -0.35); g.stroke();
}
const beadSprite = lazy(BSPR, drawBead);
// та же бусина, вспыхнувшая: для волны свечения при ускорении
const beadLitSprite = lazy(BSPR, (g, m, col) => {
  drawBead(g, m, col);
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createRadialGradient(m + m * 0.2, m, 0, m, m, m);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0.2)');
  g.fillStyle = gr; g.fillRect(0, 0, m * 2, m * 2);
});
const foodSprite = lazy(SPR, (g, m, col) => {
  const gr = g.createRadialGradient(m, m, 0, m, m, m);
  gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.18, shade(col, 0.4)); gr.addColorStop(0.36, col);
  gr.addColorStop(0.5, hexA(col, 0.35)); gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, SPR, SPR);
});
const glowSprite = lazy(SPR, (g, m, col) => {
  const gr = g.createRadialGradient(m, m, m * 0.3, m, m, m);
  gr.addColorStop(0, hexA(col, 0.6)); gr.addColorStop(1, hexA(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, SPR, SPR);
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
  return { diff, xp: 0, kills: 0, eatenBase: 0, eatXp: 0, eatStat: 0, maxTitle: 0, bestRank: 999, flags: new Set(),
    lifeStart: 0, killTimes: [], revenge: null, feastSeen: new Set(), unlocked: [], maxMass: START_MASS, startT: performance.now() };
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
  if (len > 8) joy.angle = Math.atan2(dy, dx);
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
// Обновление — только по кнопке: новая версия уже скачана и ждёт (см. sw.js), говорим ей взять управление и перезагружаемся.
// Если её ещё нет (зашли в комнату раньше, чем браузер проверил обновление) — сначала скачиваем.
let updating = false;
async function updateApp() {
  updating = true;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      if (!reg.waiting) await reg.update();
      const w = reg.waiting || reg.installing;
      if (w) {
        await new Promise((res) => {
          navigator.serviceWorker.addEventListener('controllerchange', res, { once: true });
          let asked = false;
          const go = () => {
            if (w.state === 'redundant' || w.state === 'activated') res();
            else if (w.state === 'installed' && !asked) { asked = true; w.postMessage('skip'); setTimeout(res, 5000); }
          };
          w.addEventListener('statechange', go);
          go();
          setTimeout(res, 60000); // скачивание по медленной сети ждём долго, но не вечно
        });
      }
    }
  } catch { /* перезагрузим как есть */ }
  location.reload();
}
// Вышла новая версия: показываем на главной плашку с кнопкой. Сама игра не перезагружается — партию не обрываем.
function watchUpdates(reg) {
  // reg.active отличает обновление от первой установки (тогда предлагать нечего)
  const offer = () => { if (reg.waiting && reg.active) $('update').hidden = false; };
  const track = (w) => { if (w) w.addEventListener('statechange', offer); };
  offer();
  track(reg.installing);
  reg.addEventListener('updatefound', () => track(reg.installing));
  // открытая вкладка сама не узнает о выпуске: спрашиваем сервер при возврате в игру и раз в час —
  // но не чаще раза в 10 минут и не во время партии, чтобы скачивание не мешало игре по сети
  let lastCheck = performance.now();
  const check = () => {
    if (mode !== null || performance.now() - lastCheck < 10 * 60 * 1000) return;
    lastCheck = performance.now();
    reg.update().catch(() => { /* нет сети */ });
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 60 * 60 * 1000);
  // версию обновили в другой вкладке: эта осталась на старом коде — на главной перезагружаемся сразу, партию не обрываем
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled && !updating) { if (mode === null) location.reload(); else $('update').hidden = false; }
    controlled = true;
  });
}
$('btnUpdate').addEventListener('click', () => { $('btnUpdate').disabled = true; updateApp(); });
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
  if (!run) { run = newRun(m.diff); playTime = 0; showHint(); }
  ui = 'play';
  hudT = 0;
}
function addNetFood(id, x, y, v, c, life, cell) {
  net.foods.set(id, { id, x, y, v, c, r: foodRadiusOf(v), ph: Math.random() * TAU, life, age: 0, cell });
}
const FR = 13; // запись еды: u8 клетка, u32 id, i16 x·4, i16 y·4, u16 ценность·100, u8 цвет, u8 жизнь
const readFood = (dv, o) => [dv.getUint32(o + 1, true), dv.getInt16(o + 5, true) / 4, dv.getInt16(o + 7, true) / 4,
  dv.getUint16(o + 9, true) / 100, dv.getUint8(o + 11), dv.getUint8(o + 12), dv.getUint8(o)];
function onSync(m) { // догнали после пропущенных снимков: змеи рядом — заново, еда придёт следом целиком
  for (const s of m.snakes) net.snakes.set(s.id, makeNetSnake(s));
  setFeast(m.feast);
  if (m.kill && m.kill.length) onEvents({ kill: m.kill });
}
function onEvents(m) {
  for (const s of m.spawn || []) net.snakes.set(s.id, makeNetSnake(s)); // вошла в поле зрения — тело целиком
  if (m.feast) onFeast(m.feast.x, m.feast.y, m.feast.life);
  for (const k of m.kill || []) {
    if (k.k === net.youId) {
      const v = net.snakes.get(k.v);
      onMyKill(k.v, k.vm, k.km, v ? v.segs[0] : null, v ? segColor(v.skin, 0) : GOLD);
    }
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
    for (let i = 0, o = 5; i < n; i++, o += FR) addNetFood(...readFood(dv, o));
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
    for (const [id, f] of net.foods) if (drop.has(f.cell)) net.foods.delete(id);
    // снимки в буфере ещё не применены — их еду из этих клеток не возвращаем
    for (const sn of net.buf) if (!sn.applied) sn.added = sn.added.filter((f) => !drop.has(f[6]));
    const n = dv.getUint32(o, true); o += 4;
    for (let i = 0; i < n; i++, o += FR) addNetFood(...readFood(dv, o));
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
  for (let i = 0; i < na; i++, o += FR) added.push(readFood(dv, o));
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
  if ((changed && now - net.lastSent > 40) || now - net.lastSent > 1000) {
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
  run.revenge = m.byId ? { id: m.byId, name: m.by } : null; // о край — мстить некому
  net.rv = null;
  const who = m.by ? `На пути была змейка «${esc(m.by)}»` : 'Это край арены';
  setTimeout(() => {
    if (ui !== 'dead' || mode !== 'net') return;
    dialog('Ой!', oopsHtml(who, m.mass),
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
  me = world.addHuman({ name: soloName(), skin: save.skin, inv: 2 });
  cam.x = me.x; cam.y = me.y;
  cam.z = baseZoom() * 1.3;
  playTime = 0; sessionBest = START_MASS; hudT = 0; lastSoloMass = me.mass;
  run = newRun(diff); feast = null; effects = []; clearBanners();
  $('roomBox').hidden = true;
  showHome(false);
  closeDialog();
  ui = 'play';
  showHint();
}
function soloEvents(events) {
  for (const e of events) {
    if (e.type === 'feast') { if (mode === 'solo') onFeast(e.x, e.y, e.life); continue; }
    if (mode !== 'solo') continue;
    if (e.killer && e.killer === me) onMyKill(e.victim.id, e.vm, e.km, e.victim.segs[0], segColor(e.victim.skin, 0));
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
    dialog('Ой!', oopsHtml(who, dead.mass),
    [{ label: 'В меню', kind: 'text', onClick: toHome }, { label: 'Продолжить', kind: 'filled', icon: 'play', onClick: () => {
      me = world.addHuman({ name: soloName(), skin: save.skin, mass: Math.max(START_MASS, dead.mass * 0.5), inv: 3 });
      ui = 'play'; closeDialog(); onRespawn();
    } }]);
  } else {
    const isNew = recordBest();
    ui = 'over';
    const summary = finishRun();
    setTimeout(() => {
      if (ui !== 'over') return;
      dialog('Игра окончена', `${summary}` +
        `<p class="record">${icon('trophy')}${isNew ? 'Новый рекорд!' : `Рекорд: ${save.best[diffKey]}`}</p><p class="muted">${who}.</p>`,
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
}
function onMyKill(id, vm, km, pos, color) {
  if (!run) return;
  run.kills++; save.stats.kills++;
  const now = playTime;
  run.killTimes = run.killTimes.filter((t) => now - t < 5);
  run.killTimes.push(now);
  const n = run.killTimes.length;
  let xp = 10 + (vm > km ? 20 : 0) + (n >= 2 ? 10 * n : 0);
  if (pos) effects.push({ x: pos.x, y: pos.y, t: time, c: PAL[color] || GOLD_C, r: radiusOf(vm) });
  // о победах не пишем: вспышка на месте змейки и звук, серия — звонче
  if (run.revenge && run.revenge.id === id) { run.revenge = null; xp += 40; sfx.combo(3); }
  else if (n >= 2) sfx.combo(n);
  else if (vm > km * 1.5 && vm > 300) sfx.combo(2);
  else sfx.win();
  addXp(xp);
}
const RANK_STEPS = [[SNAKES_N >> 1, 10, ''], [10, 40, 'Ты в первой десятке!'], [3, 80, 'Ты в тройке лидеров!'], [1, 200, 'Ты — самая длинная змея арены!']];
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
  if (total > run.eatStat + 1) { const d = Math.floor(total - run.eatStat); save.stats.eaten += d; run.eatStat += d; }
  const alive = me && (mode === 'net' || me.alive) && ui === 'play';
  if (alive) {
    if (me.mass > run.maxMass) run.maxMass = me.mass;
    if (me.mass > save.stats.best) save.stats.best = Math.floor(me.mass);
    const ti = titleOf(me.mass);
    if (ti > run.maxTitle) {
      run.maxTitle = ti;
      if (ti >= 2) banner(TITLES[ti][1], 'новое звание', sfx.title);
      addXp(ti * 10);
    }
    const rk = myRank();
    if (rk && playTime > 3) {
      if (rk.rank < run.bestRank) run.bestRank = rk.rank;
      for (const [lim, xp, text] of RANK_STEPS) {
        if (rk.rank <= lim && !run.flags.has(lim)) {
          run.flags.add(lim);
          addXp(xp);
          if (text) banner(`Место ${rk.rank}`, text, sfx.title);
        }
      }
    }
    if (feast && time < feast.until) {
      const key = `${Math.round(feast.x)},${Math.round(feast.y)}`;
      if (!run.feastSeen.has(key) && Math.hypot(me.segs[0].x - feast.x, me.segs[0].y - feast.y) < 420) {
        run.feastSeen.add(key);
        addXp(15);
      }
    }
  }
  if (run.revenge) {
    const t = revengeTarget();
    if (t === false) run.revenge = null;
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
// звёзды за игру и сколько осталось до следующей раскраски
function unlockHtml(xp, fresh) {
  const nx = nextSkin();
  const prev = nx ? Math.max(0, ...SKINS.filter(unlocked).map((x) => x.stars)) : 0;
  const bar = nx ? `<div class="bar"><i style="width:${(100 * clamp((save.xp - prev) / (nx.stars - prev), 0, 1)).toFixed(1)}%"></i></div>` +
    `<small>до раскраски «${esc(nx.name)}» ещё ${nx.stars - stars()} ★</small>` : '<small>открыты все раскраски!</small>';
  const got = fresh.length ? `<p class="record">${icon('star')}Открыта раскраска «${fresh.map(esc).join('», «')}»</p>` : '';
  return `<div class="unlock"><span class="xp">${icon('star')}+${xp}</span>${bar}</div>${got}`;
}
const oopsHtml = (who, mass) => `<p>${who}.</p><div class="big-num">${Math.floor(mass)}</div>` +
  `<p class="muted">Продолжишь с половиной длины.</p>`;
function finishRun() {
  if (!run) return '';
  runTick();
  const r = run;
  save.stats.games++;
  persist();
  const html = `<div class="big-num">${Math.floor(r.maxMass)}</div><p class="title-line">${TITLES[r.maxTitle][1]}</p>${unlockHtml(r.xp, r.unlocked)}`;
  run = null;
  return html;
}

// ---------- меню, пауза ----------
const soundAction = () => ({
  label: '', kind: 'text sound', icon: save.sound ? 'vol' : 'volOff', aria: 'Звук',
  onClick: (e) => {
    save.sound = !save.sound; persist(); ensureAudio();
    e.currentTarget.innerHTML = icon(save.sound ? 'vol' : 'volOff');
  },
});
function openMenu() {
  if (ui !== 'play') return;
  if (mode === 'solo') {
    ui = 'paused';
    dialog('Пауза', '', [soundAction(), { label: 'В меню', kind: 'text', onClick: toHome }, { label: 'Продолжить', kind: 'filled', onClick: resume }]);
  } else if (mode === 'net') {
    dialog(`Комната ${net.code}`, `<p>${net.roomMode === 'team' ? 'Команда против ботов' : 'Все против всех'} · боты: ${DIFF[net.diff].label.toLowerCase()}</p>` +
      '<p>Игра продолжается, пока открыто меню.</p>',
    [soundAction(), { label: 'Выйти', kind: 'text', onClick: leaveNet }, { label: 'Играть', kind: 'filled', onClick: closeDialog }]);
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

function toHome() {
  if (mode === 'solo' && me) recordBest();
  if (run) finishRun();
  mode = null; me = null; ui = 'home'; feast = null; effects = []; clearBanners();
  closeDialog();
  hideHint();
  world = new World({ diff: 'easy', bots: SNAKES_N >> 1, foodN: FOOD_N >> 1 }); // демо за меню — вдвое легче игры для телефона
  demoFocus = null;
  viewSkin = save.skin;
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
    if (a.aria) b.setAttribute('aria-label', a.aria);
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
// крупная надпись по центру: звания, места, новые раскраски. Одна за раз, следующие ждут в очереди (не больше трёх:
// лишние места и звания отбрасываются, новая раскраска — никогда). Звук играет вместе с надписью.
let bannerUntil = 0, bannerQ = [], bannerTimer = 0;
function banner(title, sub = '', sound = null, keep = false) {
  const now = performance.now();
  if (now < bannerUntil) {
    bannerQ.push({ title, sub, sound, keep });
    while (bannerQ.length > 3) { const k = bannerQ.findIndex((q) => !q.keep); bannerQ.splice(k < 0 ? 0 : k, 1); }
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(nextBanner, bannerUntil - now + 200);
    return;
  }
  bannerUntil = now + 2600;
  if (sound) sound();
  const b = $('banner');
  b.querySelector('b').textContent = title;
  b.querySelector('small').textContent = sub;
  b.classList.remove('show');
  void b.offsetWidth; // перезапуск анимации
  b.classList.add('show');
  if (bannerQ.length) { clearTimeout(bannerTimer); bannerTimer = setTimeout(nextBanner, 2800); }
}
function nextBanner() {
  const q = bannerQ.shift();
  if (q && mode) banner(q.title, q.sub, q.sound, q.keep);
}
function clearBanners() { bannerQ = []; clearTimeout(bannerTimer); bannerUntil = 0; $('banner').classList.remove('show'); }

// подсказка управления — только в первой игре на устройстве
let hintTimer = 0;
function showHint() {
  if (save.hinted) return;
  const h = $('hint');
  h.textContent = inputKind === 'touch' ? 'Коснись экрана и веди пальцем — змейка ползёт следом. Молния — ускорение'
    : 'Змейка ползёт к курсору. Кнопка мыши или пробел — ускорение';
  h.hidden = false; h.classList.remove('fade');
  save.hinted = true; persist();
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { h.classList.add('fade'); hintTimer = setTimeout(hideHint, 700); }, 6000);
}
function hideHint() { clearTimeout(hintTimer); $('hint').hidden = true; }

// ---------- главный экран ----------

// раскраска: стрелками листаются все, играть можно только открытыми
let viewSkin = save.skin;
const stepSkin = (d) => { viewSkin = (viewSkin + d + SKINS.length) % SKINS.length; if (unlocked(SKINS[viewSkin])) { save.skin = viewSkin; persist(); } renderHome(); };
$('skinPrev').addEventListener('click', () => stepSkin(-1));
$('skinNext').addEventListener('click', () => stepSkin(1));
// свайп по змейке тоже листает
let swipeX = null;
const pv = $('preview'), pctx = pv.getContext('2d');
pv.addEventListener('pointerdown', (e) => { swipeX = e.clientX; });
pv.addEventListener('pointerup', (e) => { if (swipeX !== null && Math.abs(e.clientX - swipeX) > 40) stepSkin(e.clientX < swipeX ? 1 : -1); swipeX = null; });

$('diff').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  save.diff = b.dataset.d; persist(); renderHome();
});
$('btnPlay').addEventListener('click', () => startSolo(save.diff));

function renderHome() {
  if (!unlocked(SKINS[save.skin])) save.skin = 0;
  if (viewSkin !== save.skin && unlocked(SKINS[viewSkin])) { save.skin = viewSkin; persist(); }
  $('stars').innerHTML = `${icon('star')}${stars()}`;
  const sk = SKINS[viewSkin], open = unlocked(sk);
  $('skinName').textContent = sk.name;
  $('skinLock').innerHTML = open ? '' : `${icon('lock')}откроется за ${sk.stars - stars()} ★`;
  document.querySelectorAll('#diff button').forEach((b) => b.classList.toggle('on', b.dataset.d === save.diff));
  const v = save.best[save.diff] || 0;
  $('best').innerHTML = v ? `${icon('trophy')}рекорд ${v}` : '';
}

// превью: змейка выбранной раскраски ползёт волной на месте
function drawPreview() {
  const cw = pv.clientWidth, ch = pv.clientHeight;
  if (!cw || !ch) return;
  if (pv.width !== Math.round(cw * DPR) || pv.height !== Math.round(ch * DPR)) { pv.width = Math.round(cw * DPR); pv.height = Math.round(ch * DPR); }
  const g = pctx, sk = SKINS[viewSkin], open = unlocked(sk);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, pv.width, pv.height);
  const r = Math.min(ch * 0.14, cw / 26), n = 34, sp = r * 0.62, len = n * sp;
  const x0 = cw / 2 + len / 2, cy = ch / 2;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 - i * sp;
    pts.push({ x, y: cy + Math.sin(x / (r * 3.2) - time * 3) * ch * 0.2 });
  }
  g.globalAlpha = open ? 1 : 0.35;
  const hb = BSPR / 2;
  for (let i = n - (n & 1); i >= 2; i -= 2) {
    const q = pts[i], p = pts[i - 1], o = pts[i + 1] || q;
    const rr = i > n - 6 ? r * (0.55 + 0.45 * (n - i) / 6) : r;
    let dx = p.x - o.x, dy = p.y - o.y;
    const sc = DPR * rr / hb / (Math.hypot(dx, dy) || 1);
    dx *= sc; dy *= sc;
    g.setTransform(dx, dy, -dy, dx, DPR * q.x, DPR * q.y);
    g.drawImage(beadSprite(segColor(viewSkin, i)), -hb, -hb);
  }
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const h = pts[0], a = Math.atan2(h.y - pts[1].y, h.x - pts[1].x), hr = r * 1.1;
  g.drawImage(headSprite(sk.head), h.x - hr, h.y - hr, hr * 2, hr * 2);
  for (const side of [-1, 1]) {
    const ex = h.x + Math.cos(a + side * 0.6) * r * 0.55, ey = h.y + Math.sin(a + side * 0.6) * r * 0.55;
    g.beginPath(); g.arc(ex, ey, r * 0.36, 0, TAU); g.fillStyle = '#FFFFFF'; g.fill();
    g.beginPath(); g.arc(ex + Math.cos(a) * r * 0.14, ey + Math.sin(a) * r * 0.14, r * 0.2, 0, TAU); g.fillStyle = '#1A1C19'; g.fill();
  }
  g.globalAlpha = 1;
}

// имя нужно только в совместной игре: его видят остальные в комнате
const nameFieldHtml = () => '<div class="field name-field"><input id="nick" maxlength="12" autocomplete="off" placeholder=" ">' +
  '<label for="nick">Твоё имя</label></div>';
function bindName() {
  const el = $('nick');
  el.value = save.name;
  el.addEventListener('input', () => { save.name = el.value.trim().slice(0, 12); persist(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
}
// играть вместе: создать комнату или войти по коду
let createOpts = { mode: 'team', diff: 'easy' };
function segHtml(name, opts) {
  return `<div class="seg" data-seg="${name}">${opts.map(([v, l]) =>
    `<button data-v="${v}" class="${createOpts[name] === v ? 'on' : ''}">${icon('check')}${l}</button>`).join('')}</div>`;
}
function openTogether() {
  if (navigator.onLine === false) {
    dialog('Нужен интернет', '<p>Играть вместе можно только через интернет. Одному — и без сети.</p>', [{ label: 'Понятно', kind: 'filled', onClick: closeDialog }]);
    return;
  }
  dialog('Играть вместе', nameFieldHtml() +
    `<button class="btn filled big wide" id="dCreate">${icon('group')}Создать комнату</button>` +
    '<div class="or">или войди по коду</div>' +
    '<div class="join"><div class="field"><input id="code" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder=" ">' +
    '<label for="code">Код комнаты</label></div><button class="btn tonal big" id="dJoin">Войти</button></div>',
    [{ label: 'Закрыть', kind: 'text', onClick: closeDialog }]);
  bindName();
  const code = $('code');
  code.value = inviteCode && /^\d{4}$/.test(inviteCode) ? inviteCode : '';
  code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 4); });
  const join = () => {
    if (!/^\d{4}$/.test(code.value)) { code.focus(); return; }
    code.blur();
    startNet(hello({ t: 'join', code: code.value }));
  };
  $('dJoin').addEventListener('click', join);
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  $('dCreate').addEventListener('click', openCreate);
}
$('btnTogether').addEventListener('click', openTogether);
function openCreate() {
  dialog('Новая комната',
    `<div class="sub">Режим</div>${segHtml('mode', [['team', 'Команда'], ['ffa', 'Все против всех']])}` +
    '<p class="hint" id="modeHint"></p>' +
    `<div class="sub">Боты</div>${segHtml('diff', [['easy', 'Лёгкие'], ['medium', 'Средние'], ['hard', 'Сложные']])}`,
    [{ label: 'Отмена', kind: 'text', onClick: closeDialog },
      { label: 'Создать', kind: 'filled', onClick: () => startNet(hello({ t: 'create', ...createOpts })) }]);
  const hint = () => {
    $('modeHint').textContent = createOpts.mode === 'team'
      ? 'Свои змейки проходят друг сквозь друга — играете вместе против ботов.'
      : 'Подрезать можно и друг друга.';
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

// ---------- как играть и офлайн ----------
const isStandalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
  (window.matchMedia && matchMedia('(display-mode: fullscreen)').matches) || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installHint() {
  if (isStandalone) return '';
  if (isIOS) return 'Чтобы играть в самолёте: Safari → «Поделиться» → «На экран „Домой“», затем один раз открой игру с иконки, пока есть интернет.';
  if (/Android/.test(navigator.userAgent)) return 'Чтобы играть в самолёте: Chrome → ⋮ → «Добавить на главный экран», затем один раз открой игру с иконки при интернете.';
  return '';
}
let offline = { cls: '', ic: 'cloudOff', text: 'Проверяю, сохранена ли игра для офлайна…' };
function renderFoot() {
  const f = $('btnInfo');
  f.className = `foot ${offline.cls}`;
  f.innerHTML = `${icon(offline.ic)}Как играть · версия ${VERSION}`;
}
$('btnInfo').addEventListener('click', () => {
  const ctl = isTouch
    ? 'Коснись экрана в любом месте и веди пальцем — это джойстик. Держи молнию, чтобы ускориться: это тратит немного длины.'
    : 'Змейка ползёт к курсору мыши. Левая кнопка или пробел — ускорение, тратит немного длины. Можно стрелками ← →. Пауза — Esc.';
  const ih = installHint();
  dialog('Как играть', `<p>${ctl}</p><p>Подрежь соперника — пусть врежется в тебя головой. Золотой пир и обидчик отмечены стрелками у края экрана.</p>` +
    `<p>Звёзды за еду, победы и места открывают новые раскраски.</p>` +
    `<div class="note ${offline.cls}">${icon(offline.ic)}<span>${offline.text}${ih ? ` ${ih}` : ''}</span></div>`,
  [{ label: 'Понятно', kind: 'filled', onClick: closeDialog }]);
});
let updatesWatched = false;
async function checkOffline() {
  const set = (cls, ic, text) => { offline = { cls, ic, text }; renderFoot(); };
  if (!('serviceWorker' in navigator) || !window.caches) { set('warn', 'cloudOff', 'Этот браузер не умеет сохранять игру для офлайна.'); return; }
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    if (!updatesWatched) { updatesWatched = true; watchUpdates(reg); }
    await navigator.serviceWorker.ready;
    let ok = false;
    for (const k of await caches.keys()) {
      if (!k.startsWith('zmeigrad-')) continue;
      const c = await caches.open(k);
      if ((await c.match('index.html')) && (await c.match('client.js')) && (await c.match('core.js'))) ok = true;
    }
    if (ok) set('ok', 'cloudDone', 'Игра сохранена на устройстве: одному можно играть без интернета.');
    else { set('', 'cloudOff', 'Сохраняю игру для офлайна…'); setTimeout(checkOffline, 1500); }
  } catch (e) {
    set('warn', 'cloudOff', 'Не получилось включить офлайн-режим: ' + esc(e.message));
  }
}
renderFoot();
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
const camT = { k: 1, e: 0, f: 0 }; // матрица камеры текущего кадра: её задаёт draw(), по ней повёрнуты бусины
// ускорение: по сегментам от головы к хвосту бежит волна, каждый светится своим цветом
const boostWave = (i) => { const w = 0.5 + 0.5 * Math.sin(time * 16 - i * 0.22); return w * w; };
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
  const a0 = ctx.globalAlpha, boost = s.isBoosting;
  if (boost) {
    const g = r * 2;
    for (let i = (n - 1) & ~1; i >= 0; i -= 4) {
      const q = segs[i];
      if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue;
      ctx.globalAlpha = a0 * (0.2 + 0.8 * boostWave(i));
      ctx.drawImage(glowSprite(segColor(s.skin, i)), q.x - g, q.y - g, g * 2, g * 2);
    }
    ctx.globalAlpha = a0;
  }
  // бусина повёрнута по ходу тела: матрица — мировая камера × поворот × масштаб
  const k = camT.k, hb = BSPR / 2;
  const tail = Math.min(10, n >> 2);
  for (let i = (n - 1) & ~1; i >= 2; i -= step) {
    const q = segs[i];
    if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue;
    const rr = i > n - tail ? r * (0.55 + 0.45 * (n - i) / tail) : r; // хвост сужается
    const p = segs[i - 1], o = segs[i + 1] || q;
    let dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = Math.cos(s.a); dy = Math.sin(s.a); d = 1; } // соседи совпали (хвост при росте) — смотрим по ходу головы
    const sc = k * rr / hb / d;
    dx *= sc; dy *= sc;
    ctx.setTransform(dx, dy, -dy, dx, k * q.x + camT.e, k * q.y + camT.f);
    const c = segColor(s.skin, i);
    ctx.drawImage(beadSprite(c), -hb, -hb);
    if (boost) {
      const w = boostWave(i);
      if (w > 0.25) { ctx.globalAlpha = a0 * w; ctx.drawImage(beadLitSprite(c), -hb, -hb); ctx.globalAlpha = a0; }
    }
  }
  ctx.setTransform(k, 0, 0, k, camT.e, camT.f);
  const hr = r * 1.1;
  ctx.drawImage(headSprite(sk.head), h.x - hr, h.y - hr, hr * 2, hr * 2);
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
  if (mode !== null) {
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
function drawPointer(tx, ty, color) {
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
  camT.k = DPR * z; camT.e = DPR * (W / 2 - cam.x * z); camT.f = DPR * (H / 2 - cam.y * z);
  ctx.setTransform(camT.k, 0, 0, camT.k, camT.e, camT.f);
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
    ctx.drawImage(foodSprite(f.c), f.x - rr, f.y - rr, rr * 2, rr * 2);
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
    if (feast && time < feast.until) drawPointer(feast.x, feast.y, GOLD_C);
    const rt = revengeTarget();
    if (rt) drawPointer(rt.x, rt.y, REVENGE);
  }
  drawJoystick();
}

let hudT = 0;
function updateHud(dt) {
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.25;
  runTick();
  let len = 0;
  if (mode === 'solo' && me) len = Math.floor(me.alive ? me.mass : me.maxMass);
  else if (mode === 'net') len = Math.floor(me ? me.mass : (net.deadInfo ? net.deadInfo.mass : 0));
  const rk = myRank();
  $('score').innerHTML = `<b>${len}</b>${rk ? `<small>#${rk.rank}</small>` : ''}`;

  // топ-3 и своя строка: в одиночной — весь мир, в комнате — с сервера
  let rows;
  if (mode === 'net') rows = net.lb ? net.lb.top.map((t) => ({ id: t[0], name: t[1], mass: t[2], human: t[3], team: t[4] })) : [];
  else rows = sceneSnakes().filter((s) => s.alive).sort((a, b) => b.mass - a.mass).slice(0, 3);
  leaderId = rows.length ? rows[0].id : 0;
  const myId = mode === 'net' ? net.youId : me && me.id;
  const row = (s, i) => {
    const cls = s.id === myId ? ' me' : (mode === 'net' && net.roomMode === 'team' && s.human && s.team === net.myTeam) ? ' mate' : '';
    const place = i === 0 ? `<span class="c">${icon('trophy').replace('class="i"', 'class="i" style="width:12px;height:12px;vertical-align:-1px"')}</span> ` : `${i + 1}. `;
    return `<div class="row${cls}"><span>${place}${esc(s.name)}</span><span>${Math.floor(s.mass)}</span></div>`;
  };
  let html = rows.slice(0, 3).map(row).join('');
  if (rk && rk.rank > 3 && me) html += `${rk.rank > 4 ? '<div class="gap">···</div>' : ''}${row({ id: myId, name: me.name, mass: me.mass }, rk.rank - 1)}`;
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
    if (mode) updateHud(dt);
    else if (!$('home').hidden && $('dlg').hidden) drawPreview();
  }
  requestAnimationFrame(frame);
}

toHome();
requestAnimationFrame(frame);

// приглашение по ссылке ?room=1234
const inviteCode = new URLSearchParams(location.search).get('room');
if (inviteCode && /^\d{4}$/.test(inviteCode)) {
  dialog(`Комната ${inviteCode}`, `<p>Тебя зовут играть вместе.</p>${nameFieldHtml()}`,
    [{ label: 'Позже', kind: 'text', onClick: closeDialog }, { label: 'Войти', kind: 'filled', onClick: () => startNet(hello({ t: 'join', code: inviteCode })) }]);
  bindName();
}

// для автотестов
window.__snake = {
  get mode() { return mode; }, get ui() { return ui; }, get me() { return me; }, get world() { return world; },
  get net() { return net; }, get joy() { return joy; }, get run() { return run; }, get save() { return save; }, startSolo,
};
