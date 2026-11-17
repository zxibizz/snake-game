// Arena backdrops. The player picks one in the pause menu ("Backdrop"), or a random one every game; space by default.
// Any backdrop can have its hues turned (the same slider for all), or slightly different random hues every game.
// How it avoids visible "squares" of a repeating tile:
//   1) large patches (nebulae, shallows, dunes) are one layer over the whole arena with no repeat:
//      a small canvas stretched over the arena (the blur from stretching makes the patches soft);
//   2) small details (stars, pebbles, ripples) are tiles, each layer a different (coprime) size,
//      so the combined pattern repeats very rarely; the tiles are transparent and lie on top of the patches.
// Tiles are drawn with overlap across the edge (wrapped), so there is no seam where they meet.

export const BACKDROPS = ['space', 'grid', 'hex', 'sea', 'sand', 'dots']; // the first is the default
// a random hue strays this far from the backdrop's own colors, degrees either way: slightly different, still the same backdrop
export const HUE_SPREAD = 40;
const TAU = Math.PI * 2;
const MACRO = 768; // side of the large-patch canvas: for a 14000 arena that's about 18 world px per dot

function rand(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
// hex color with its hue turned by dh degrees (HSL); near-grey colors get a little color, otherwise turning them shows nothing
function tint(hex, dh) {
  if (!dh) return hex;
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let h = !d ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + dh) % 360) + 360) % 360;
  if (s < 0.3) s += 0.25 * Math.min(1, Math.abs(dh) / 60);
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [R, G, B].map((v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0')).join('');
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; }
// a t×t (or w×h) tile in world pixels, s — sharpness (2 dots per world pixel)
// without setTransform on the pattern (old Safari) the tile would come out twice as large — then draw one to one
const SHARP = typeof CanvasPattern !== 'undefined' && !!CanvasPattern.prototype.setTransform && typeof DOMMatrix === 'function' ? 2 : 1;
function tile(ctx, w, h, paint, s = SHARP, base = '') {
  const c = canvas(w * s, h * s), g = c.getContext('2d');
  g.scale(c.width / w, c.height / h); // the canvas is rounded to whole dots — the scale is exact, otherwise the honeycomb tears at the seam
  if (base) { g.fillStyle = base; g.fillRect(0, 0, w, h); } // an opaque tile is the ground itself
  paint(g, w, h);
  const p = ctx.createPattern(c, 'repeat');
  if (SHARP > 1) p.setTransform(new DOMMatrix().scale(w / c.width, h / c.height));
  return p;
}
// draw a shape in the tile plus its copies across the edge — the seam stays invisible
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
// large patches over the whole arena: n patches of radius r0…r1 (world), colors in rotation
function macro(R, rnd, base, n, r0, r1, cols, a) {
  const c = canvas(MACRO, MACRO), g = c.getContext('2d'), k = MACRO / (2 * R);
  g.fillStyle = base; g.fillRect(0, 0, MACRO, MACRO); // the whole ground: no separate fill under the patches needed
  for (let i = 0; i < n; i++) {
    const ang = rnd() * TAU, d = Math.sqrt(rnd()) * (R + r1 * 0.5), r = r0 + rnd() * (r1 - r0), col = cols[i % cols.length];
    blob(g, MACRO / 2 + Math.cos(ang) * d * k, MACRO / 2 + Math.sin(ang) * d * k, r * k, col, a * (0.6 + rnd() * 0.4));
  }
  return c;
}

const stars = (rnd, n, glow, halo, dot, core) => (g, t) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * t, y = rnd() * t;
    if (glow) {
      const r = 0.8 + rnd() * 1.2;
      wrapped(t, x, y, r * 4, (X, Y) => { blob(g, X, Y, r * 4, halo, 0.25); g.fillStyle = rgba(core, 0.8); g.beginPath(); g.arc(X, Y, r * 0.7, 0, TAU); g.fill(); });
    } else {
      const r = rnd() < 0.9 ? 0.6 + rnd() * 0.6 : 1.4, a = 0.25 + rnd() * 0.45;
      wrapped(t, x, y, r, (X, Y) => { g.fillStyle = rgba(dot, a); g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill(); });
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
// wave glints on the sea floor: smooth loops
const caustics = (rnd, n, glow, line) => (g, t) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * t, y = rnd() * t, m = 6, v = [];
    for (let k = 0; k < m; k++) { const a = k * TAU / m + rnd() * 0.5, rr = 28 + rnd() * 18; v.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    wrapped(t, x, y, 60, (X, Y) => {
      g.beginPath();
      for (let k = 0; k <= m; k++) {
        const [ax, ay] = v[k % m], [bx, by] = v[(k + 1) % m], mx = X + (ax + bx) / 2, my = Y + (ay + by) / 2;
        if (k) g.quadraticCurveTo(X + ax, Y + ay, mx, my); else g.moveTo(mx, my);
      }
      g.strokeStyle = rgba(glow, 0.03); g.lineWidth = 10; g.stroke();
      g.strokeStyle = rgba(line, 0.075); g.lineWidth = 2.4; g.stroke();
    });
  }
};
// sand ripples: wavy lines, each with its own phase; the tile is square with a whole number of lines in its height
const RIPPLE = 26;
const ripples = (rnd, col) => (g, w) => {
  const h = w, step = RIPPLE, n = 80;
  g.strokeStyle = rgba(col, 0.5); g.lineWidth = 2; g.lineCap = 'round';
  for (let y = 0; y < h; y += step) {
    const p1 = rnd() * TAU, p2 = rnd() * TAU, a1 = 4 + rnd() * 5;
    for (const oy of [-h, 0, h]) { // a line near the edge sways past it — copy it on the other side
      if (y + oy + 13 < 0 || y + oy - 13 > h) continue;
      g.beginPath();
      for (let i = 0; i <= n; i++) { const x = i * w / n, yy = y + oy + a1 * Math.sin(x / w * TAU * 3 + p1) + 3 * Math.sin(x / w * TAU * 7 + p2); if (i) g.lineTo(x, yy); else g.moveTo(x, yy); }
      g.stroke();
    }
  }
};
const both = (...fs) => (g, t) => { for (const f of fs) f(g, t); };

// kind — one of BACKDROPS; seed — different patches every game; R — arena radius; hue — turn of all colors, degrees
// Passes over the screen per frame: ground (patches or an opaque tile) + one detail tile + a moving layer
// (distant stars, glints) — no more than three.
export function makeBackdrop(ctx, kind, seed, R, hue = 0) {
  const rnd = rand(Math.imul(seed | 0, 0x9E3779B1) ^ 0x5BD1E995);
  const T = (hex) => tint(hex, hue), TS = (cols) => cols.map(T);
  const b = { kind, hue, ground: null, macro: null, detail: null, far: null, caustic: null };
  if (kind === 'grid') {
    b.ground = tile(ctx, 80, 80, (g, t) => { g.fillStyle = T('#202620'); g.fillRect(0, 0, t, 1.5); g.fillRect(0, 0, 1.5, t); }, 2, T('#161A16'));
  } else if (kind === 'hex') {
    const a = 40, w = Math.sqrt(3) * a, h = 3 * a; // honeycomb with a vertex up: the tile is two rows, the seam lines up
    b.ground = tile(ctx, w, h, (g) => {
      g.strokeStyle = T('#222C25'); g.lineWidth = 1.6;
      for (const [cx, cy] of [[0, 0], [w, 0], [w / 2, 1.5 * a], [0, 3 * a], [w, 3 * a], [-w / 2, 1.5 * a], [1.5 * w, 1.5 * a]]) {
        g.beginPath();
        for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(an) * a, cy + Math.sin(an) * a); }
        g.closePath(); g.stroke();
      }
    }, 2, T('#141A17'));
  } else if (kind === 'space') {
    b.macro = macro(R, rnd, T('#0C1020'), 260, 350, 1100, TS(['#2A2160', '#173A5C', '#3A1E4E']), 0.55);
    b.detail = tile(ctx, 863, 863, stars(rnd, 240, false, T('#9FB4FF'), T('#DCE4FF'), T('#EBF0FF')));
    b.far = tile(ctx, 607, 607, stars(rnd, 60, true, T('#9FB4FF'), T('#DCE4FF'), T('#EBF0FF'))); // distant stars move slower than the field and twinkle
  } else if (kind === 'sea') {
    b.macro = macro(R, rnd, T('#0C1E24'), 480, 200, 600, TS(['#123038', '#08161A', '#0F2A31']), 0.8);
    b.detail = tile(ctx, 613, 613, pebbles(rnd, 34, T('#2A4A50'), 0.55, 5));
    b.caustic = { p: tile(ctx, 457, 457, caustics(rnd, 16, T('#8CDCE6'), T('#AAEBF0'))), t: 457 };
  } else if (kind === 'sand') {
    b.macro = macro(R, rnd, T('#211B14'), 480, 220, 620, TS(['#2B241A', '#18130E', '#262016']), 0.8);
    b.detail = tile(ctx, RIPPLE * 25, RIPPLE * 25, both(ripples(rnd, T('#463A2A')), pebbles(rnd, 30, T('#4A3E2C'), 0.7, 4)));
  } else { // dots
    b.macro = macro(R, rnd, T('#15181C'), 60, 1300, 2400, TS(['#3B4A7A', '#5A3B6E', '#2E5A55', '#6E4A2E', '#2E4A6E']), 0.5);
    b.detail = tile(ctx, 60, 60, (g, t) => { g.fillStyle = T('#272D34'); g.beginPath(); g.arc(t / 2, t / 2, 2.2, 0, TAU); g.fill(); });
  }
  return b;
}

// draws the arena backdrop; the ctx matrix is already the camera's (world), cam — center, z — zoom, W/H — screen in CSS pixels
export function drawBackdrop(ctx, b, R, cam, z, W, H, time) {
  const hw = W / 2 / z + 40, hh = H / 2 / z + 40, x0 = cam.x - hw, y0 = cam.y - hh, w = hw * 2, h = hh * 2;
  ctx.save();
  // clip to the arena circle only when the edge is in view (usually the whole screen is inside — clipping would waste time)
  if (Math.hypot(cam.x, cam.y) + Math.hypot(hw, hh) > R) { ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip(); }
  if (b.macro) { // take only the visible part of the patch canvas
    const k = MACRO / (2 * R), sx = Math.max(0, Math.floor((x0 + R) * k)), sy = Math.max(0, Math.floor((y0 + R) * k));
    const ex = Math.min(MACRO, Math.ceil((x0 + w + R) * k)), ey = Math.min(MACRO, Math.ceil((y0 + h + R) * k));
    if (ex > sx && ey > sy) ctx.drawImage(b.macro, sx, sy, ex - sx, ey - sy, sx / k - R, sy / k - R, (ex - sx) / k, (ey - sy) / k);
  }
  else { ctx.fillStyle = b.ground; ctx.fillRect(x0, y0, w, h); }
  if (b.detail) { ctx.fillStyle = b.detail; ctx.fillRect(x0, y0, w, h); }
  if (b.far) { // parallax: the layer is shifted by half the camera's movement
    const k = 0.5;
    ctx.translate(cam.x * k, cam.y * k);
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(time * 1.3);
    ctx.fillStyle = b.far; ctx.fillRect(cam.x * (1 - k) - hw, cam.y * (1 - k) - hh, w, h);
  }
  if (b.caustic) { // glints drift along the floor; a shift by a whole tile is invisible
    const { p, t } = b.caustic, dx = (time * 16) % t, dy = (time * 10) % t;
    ctx.translate(dx, dy);
    ctx.fillStyle = p; ctx.fillRect(x0 - dx, y0 - dy, w, h);
  }
  ctx.restore();
}
