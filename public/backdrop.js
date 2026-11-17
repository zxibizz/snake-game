// Фоны арены. При каждом старте игры фон выбирается случайно (решение владельца — нравятся все).
// Устройство, чтобы не было видно «квадратов» повторяющейся плитки:
//   1) крупные пятна (трава светлее/темнее, туманности, отмели) — один слой на всю арену без повтора:
//      маленький холст, растянутый на арену (размытие при растяжении делает пятна мягкими);
//   2) мелкие детали (травинки, звёзды, камешки) — плитки, у слоёв разный размер (взаимно простые),
//      поэтому общий узор повторяется очень редко; плитки прозрачные, кладутся поверх пятен.
// Плитки рисуются с запасом через край (wrapped), чтобы на стыке не было шва.

export const BACKDROPS = ['grid', 'hex', 'meadow', 'space', 'sea', 'sand', 'dots'];
const TAU = Math.PI * 2;
const MACRO = 768; // сторона холста крупных пятен: на арену 14000 — около 18 пикс мира на точку

function rand(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; }
// плитка t×t (или w×h) в мировых пикселях, s — чёткость (2 точки на пиксель мира)
// без setTransform у узора (старый Safari) плитка шла бы вдвое крупнее — тогда рисуем один к одному
const SHARP = typeof CanvasPattern !== 'undefined' && !!CanvasPattern.prototype.setTransform && typeof DOMMatrix === 'function' ? 2 : 1;
function tile(ctx, w, h, paint, s = SHARP, base = '') {
  const c = canvas(w * s, h * s), g = c.getContext('2d');
  g.scale(c.width / w, c.height / h); // холст округлён до целых точек — масштаб точный, иначе соты рвутся на стыке
  if (base) { g.fillStyle = base; g.fillRect(0, 0, w, h); } // непрозрачная плитка — сама и есть земля
  paint(g, w, h);
  const p = ctx.createPattern(c, 'repeat');
  if (SHARP > 1) p.setTransform(new DOMMatrix().scale(w / c.width, h / c.height));
  return p;
}
// нарисовать фигуру в плитке и её копии через край — шов не виден
function wrapped(t, x, y, r, fn) {
  for (const dx of [-t, 0, t]) for (const dy of [-t, 0, t]) {
    const X = x + dx, Y = y + dy;
    if (X + r > 0 && X - r < t && Y + r > 0 && Y - r < t) fn(X, Y);
  }
}
function blob(g, x, y, r, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.55, rgba(col, a * 0.55)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
// крупные пятна на всю арену: n пятен радиусом r0…r1 (мир), цвета по кругу
function macro(R, rnd, base, n, r0, r1, cols, a) {
  const c = canvas(MACRO, MACRO), g = c.getContext('2d'), k = MACRO / (2 * R);
  g.fillStyle = base; g.fillRect(0, 0, MACRO, MACRO); // земля целиком: отдельной заливки под пятна не нужно
  for (let i = 0; i < n; i++) {
    const ang = rnd() * TAU, d = Math.sqrt(rnd()) * (R + r1 * 0.5), r = r0 + rnd() * (r1 - r0), col = cols[i % cols.length];
    blob(g, MACRO / 2 + Math.cos(ang) * d * k, MACRO / 2 + Math.sin(ang) * d * k, r * k, col, a * (0.6 + rnd() * 0.4));
  }
  return c;
}

const grass = (rnd, n) => (g, t) => {
  g.lineCap = 'round'; g.lineWidth = 2.2;
  for (let i = 0; i < n; i++) {
    const x = rnd() * t, y = rnd() * t, m = 3 + (rnd() * 3 | 0), sz = 1 + rnd() * 0.8, c = rnd() < 0.5 ? '#3F7039' : '#2F5A2C', tilt = (rnd() - 0.5) * 0.5;
    g.strokeStyle = rgba(c, 0.8);
    wrapped(t, x, y, 30, (X, Y) => { // травинка тянется до 29 пикс
      for (let k = 0; k < m; k++) {
        const a = -Math.PI / 2 + tilt + (k - (m - 1) / 2) * 0.38;
        g.beginPath(); g.moveTo(X, Y);
        g.quadraticCurveTo(X + Math.cos(a) * 6 * sz, Y + Math.sin(a) * 9 * sz, X + Math.cos(a) * 11 * sz, Y + Math.sin(a) * 16 * sz); g.stroke();
      }
    });
  }
};
const FLOWERS = ['#E8C35A', '#E59AB8', '#B9A6F0', '#F2F2F2'];
const flowers = (rnd) => (g, t) => {

  for (let i = 0; i < 22; i++) { // клевер
    const x = rnd() * t, y = rnd() * t, a0 = rnd() * TAU;
    g.fillStyle = rgba('#2E5A2A', 0.85);
    wrapped(t, x, y, 14, (X, Y) => { for (let k = 0; k < 3; k++) { const a = a0 + k * TAU / 3; g.beginPath(); g.arc(X + Math.cos(a) * 5, Y + Math.sin(a) * 5, 5, 0, TAU); g.fill(); } });
  }
  for (let i = 0; i < 20; i++) { // редкие цветочки — тусклые, чтобы не путались с едой
    const x = rnd() * t, y = rnd() * t, col = FLOWERS[i % FLOWERS.length];
    wrapped(t, x, y, 12, (X, Y) => {
      g.fillStyle = rgba(col, 0.32);
      for (let k = 0; k < 5; k++) { const a = k * TAU / 5; g.beginPath(); g.arc(X + Math.cos(a) * 4.5, Y + Math.sin(a) * 4.5, 3.4, 0, TAU); g.fill(); }
      g.fillStyle = rgba('#E8C35A', 0.4); g.beginPath(); g.arc(X, Y, 2.2, 0, TAU); g.fill();
    });
  }
};
const stars = (rnd, n, glow) => (g, t) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * t, y = rnd() * t;
    if (glow) {
      const r = 0.8 + rnd() * 1.2;
      wrapped(t, x, y, r * 4, (X, Y) => { blob(g, X, Y, r * 4, '#9FB4FF', 0.25); g.fillStyle = 'rgba(235,240,255,0.8)'; g.beginPath(); g.arc(X, Y, r * 0.7, 0, TAU); g.fill(); });
    } else {
      const r = rnd() < 0.9 ? 0.6 + rnd() * 0.6 : 1.4, a = 0.25 + rnd() * 0.45;
      wrapped(t, x, y, r, (X, Y) => { g.fillStyle = `rgba(220,228,255,${a})`; g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill(); });
    }
  }
};
const pebbles = (rnd, n, col, a, rmax) => (g, t) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * t, y = rnd() * t, r = 2 + rnd() * rmax, an = rnd() * TAU;
    g.fillStyle = rgba(col, a * (0.7 + rnd() * 0.3));
    wrapped(t, x, y, r * 1.4, (X, Y) => { g.beginPath(); g.ellipse(X, Y, r * 1.4, r, an, 0, TAU); g.fill(); });
  }
};
// блики от волн на дне: гладкие петли
const caustics = (rnd, n) => (g, t) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * t, y = rnd() * t, m = 6, v = [];
    for (let k = 0; k < m; k++) { const a = k * TAU / m + rnd() * 0.5, rr = 28 + rnd() * 18; v.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    wrapped(t, x, y, 60, (X, Y) => {
      g.beginPath();
      for (let k = 0; k <= m; k++) {
        const [ax, ay] = v[k % m], [bx, by] = v[(k + 1) % m], mx = X + (ax + bx) / 2, my = Y + (ay + by) / 2;
        if (k) g.quadraticCurveTo(X + ax, Y + ay, mx, my); else g.moveTo(mx, my);
      }
      g.strokeStyle = 'rgba(140,220,230,0.03)'; g.lineWidth = 10; g.stroke();
      g.strokeStyle = 'rgba(170,235,240,0.075)'; g.lineWidth = 2.4; g.stroke();
    });
  }
};
// рябь песка: волнистые линии, у каждой своя фаза; плитка квадратная, по высоте целое число линий
const RIPPLE = 26;
const ripples = (rnd) => (g, w) => {
  const h = w, step = RIPPLE, n = 80;
  g.strokeStyle = 'rgba(70,58,42,0.5)'; g.lineWidth = 2; g.lineCap = 'round';
  for (let y = 0; y < h; y += step) {
    const p1 = rnd() * TAU, p2 = rnd() * TAU, a1 = 4 + rnd() * 5;
    for (const oy of [-h, 0, h]) { // линия у края качается за него — копия с другой стороны
      if (y + oy + 13 < 0 || y + oy - 13 > h) continue;
      g.beginPath();
      for (let i = 0; i <= n; i++) { const x = i * w / n, yy = y + oy + a1 * Math.sin(x / w * TAU * 3 + p1) + 3 * Math.sin(x / w * TAU * 7 + p2); if (i) g.lineTo(x, yy); else g.moveTo(x, yy); }
      g.stroke();
    }
  }
};
const both = (...fs) => (g, t) => { for (const f of fs) f(g, t); };

// kind — из BACKDROPS; seed — разные пятна в каждой игре; R — радиус арены
// Проходов по экрану за кадр: земля (пятна или непрозрачная плитка) + одна плитка деталей + подвижный слой
// (дальние звёзды, блики) — не больше трёх.
export function makeBackdrop(ctx, kind, seed, R) {
  const rnd = rand(Math.imul(seed | 0, 0x9E3779B1) ^ 0x5BD1E995);
  const b = { kind, ground: null, macro: null, detail: null, far: null, caustic: null };
  if (kind === 'grid') {
    b.ground = tile(ctx, 80, 80, (g, t) => { g.fillStyle = '#202620'; g.fillRect(0, 0, t, 1.5); g.fillRect(0, 0, 1.5, t); }, 2, '#161A16');
  } else if (kind === 'hex') {
    const a = 40, w = Math.sqrt(3) * a, h = 3 * a; // соты вершиной вверх: плитка — два ряда, шов совпадает
    b.ground = tile(ctx, w, h, (g) => {
      g.strokeStyle = '#222C25'; g.lineWidth = 1.6;
      for (const [cx, cy] of [[0, 0], [w, 0], [w / 2, 1.5 * a], [0, 3 * a], [w, 3 * a], [-w / 2, 1.5 * a], [1.5 * w, 1.5 * a]]) {
        g.beginPath();
        for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(an) * a, cy + Math.sin(an) * a); }
        g.closePath(); g.stroke();
      }
    }, 2, '#141A17');
  } else if (kind === 'meadow') {
    b.macro = macro(R, rnd, '#142016', 520, 220, 620, ['#21391F', '#0E180F', '#1B2F1A'], 0.75);
    b.detail = tile(ctx, 769, 769, both(grass(rnd, 125), flowers(rnd)));
  } else if (kind === 'space') {
    b.macro = macro(R, rnd, '#0C1020', 260, 350, 1100, ['#2A2160', '#173A5C', '#3A1E4E'], 0.55);
    b.detail = tile(ctx, 863, 863, stars(rnd, 240, false));
    b.far = tile(ctx, 607, 607, stars(rnd, 60, true)); // дальние звёзды едут медленнее поля и мерцают
  } else if (kind === 'sea') {
    b.macro = macro(R, rnd, '#0C1E24', 480, 200, 600, ['#123038', '#08161A', '#0F2A31'], 0.8);
    b.detail = tile(ctx, 613, 613, pebbles(rnd, 34, '#2A4A50', 0.55, 5));
    b.caustic = { p: tile(ctx, 457, 457, caustics(rnd, 16)), t: 457 };
  } else if (kind === 'sand') {
    b.macro = macro(R, rnd, '#211B14', 480, 220, 620, ['#2B241A', '#18130E', '#262016'], 0.8);
    b.detail = tile(ctx, RIPPLE * 25, RIPPLE * 25, both(ripples(rnd), pebbles(rnd, 30, '#4A3E2C', 0.7, 4)));
  } else { // dots
    b.macro = macro(R, rnd, '#15181C', 60, 1300, 2400, ['#3B4A7A', '#5A3B6E', '#2E5A55', '#6E4A2E', '#2E4A6E'], 0.5);
    b.detail = tile(ctx, 60, 60, (g, t) => { g.fillStyle = '#272D34'; g.beginPath(); g.arc(t / 2, t / 2, 2.2, 0, TAU); g.fill(); });
  }
  return b;
}

// рисует фон арены; матрица ctx уже камерная (мир), cam — центр, z — масштаб, W/H — экран в css-пикселях
export function drawBackdrop(ctx, b, R, cam, z, W, H, time) {
  const hw = W / 2 / z + 40, hh = H / 2 / z + 40, x0 = cam.x - hw, y0 = cam.y - hh, w = hw * 2, h = hh * 2;
  ctx.save();
  // обрезать по кругу арены, только когда край в кадре (обычно весь экран внутри — обрезка зря тратит время)
  if (Math.hypot(cam.x, cam.y) + Math.hypot(hw, hh) > R) { ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip(); }
  if (b.macro) { // из холста пятен берём только видимый кусок
    const k = MACRO / (2 * R), sx = Math.max(0, Math.floor((x0 + R) * k)), sy = Math.max(0, Math.floor((y0 + R) * k));
    const ex = Math.min(MACRO, Math.ceil((x0 + w + R) * k)), ey = Math.min(MACRO, Math.ceil((y0 + h + R) * k));
    if (ex > sx && ey > sy) ctx.drawImage(b.macro, sx, sy, ex - sx, ey - sy, sx / k - R, sy / k - R, (ex - sx) / k, (ey - sy) / k);
  }
  else { ctx.fillStyle = b.ground; ctx.fillRect(x0, y0, w, h); }
  if (b.detail) { ctx.fillStyle = b.detail; ctx.fillRect(x0, y0, w, h); }
  if (b.far) { // параллакс: слой сдвинут на половину хода камеры
    const k = 0.5;
    ctx.translate(cam.x * k, cam.y * k);
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(time * 1.3);
    ctx.fillStyle = b.far; ctx.fillRect(cam.x * (1 - k) - hw, cam.y * (1 - k) - hh, w, h);
  }
  if (b.caustic) { // блики плывут по дну; сдвиг на целую плитку незаметен
    const { p, t } = b.caustic, dx = (time * 16) % t, dy = (time * 10) % t;
    ctx.translate(dx, dy);
    ctx.fillStyle = p; ctx.fillRect(x0 - dx, y0 - dy, w, h);
  }
  ctx.restore();
}
