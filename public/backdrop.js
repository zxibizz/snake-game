// Arena backdrops. The player picks one in the pause menu ("Backdrop"), or a random one every game; space by default.
// Any backdrop can have its hues turned (the same slider for all), or slightly different random hues every game.
// How it avoids visible "squares" of a repeating tile:
//   1) large patches (nebulae, shallows, dunes) are one layer over the whole arena with no repeat:
//      a small canvas stretched over the arena (the blur from stretching makes the patches soft);
//   2) small details (stars, pebbles, ripples) are tiles, each layer a different (coprime) size,
//      so the combined pattern repeats very rarely; the tiles are transparent and lie on top of the patches.
// Tiles are drawn with overlap across the edge (wrapped), so there is no seam where they meet.
// Nothing in a backdrop may look like food (a small round glowing dot): no bright round specks, no halos. Stars are faint dust
// and four-ray sparkles, stones are darker than the ground, plants are strokes, lights are much larger than any crumb.
// Depth: every backdrop is three layers that move against each other as the camera travels (parallax) —
// the deep ones lag behind the arena, the one above it (wind over the sand) runs ahead.

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
// a t×t (or w×h) tile in world pixels, s — sharpness (2 dots per world pixel); rot — the tiling is turned by so many degrees:
// copies of a noticeable thing (a coral, a bush) then don't line up with the screen's edges and the repeat is hard to spot
// without setTransform on the pattern (old Safari) the tile would come out twice as large — then draw one to one
const SHARP = typeof CanvasPattern !== 'undefined' && !!CanvasPattern.prototype.setTransform && typeof DOMMatrix === 'function' ? 2 : 1;
const SOFT = SHARP > 1 ? 1.5 : 1; // for large tiles: a little less sharp, much less memory
function tile(ctx, w, h, paint, s = SHARP, base = '', rot = 0) {
  const c = canvas(w * s, h * s), g = c.getContext('2d');
  g.scale(c.width / w, c.height / h); // the canvas is rounded to whole dots — the scale is exact, otherwise the honeycomb tears at the seam
  if (base) { g.fillStyle = base; g.fillRect(0, 0, w, h); } // an opaque tile is the ground itself
  paint(g, w, h);
  const p = ctx.createPattern(c, 'repeat');
  if (SHARP > 1) p.setTransform(new DOMMatrix().rotate(rot).scale(w / c.width, h / c.height));
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

// stars: faint dust (too dim and small for a crumb) and four-ray sparkles of length r0…r1 — never a round glowing dot
const stars = (rnd, n, dust, r0, r1, col) => (g, t) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * t, y = rnd() * t;
    if (rnd() < dust) {
      const r = 0.5 + rnd() * 0.3, a = 0.14 + rnd() * 0.2;
      wrapped(t, x, y, r, (X, Y) => { g.fillStyle = rgba(col, a); g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fill(); });
    } else {
      const r = r0 + rnd() * rnd() * (r1 - r0), w = 0.5 + r * 0.07, a = 0.4 + rnd() * 0.45;
      wrapped(t, x, y, r, (X, Y) => {
        g.fillStyle = rgba(col, a); g.beginPath();
        g.moveTo(X - r, Y); g.lineTo(X - w, Y - w); g.lineTo(X, Y - r); g.lineTo(X + w, Y - w);
        g.lineTo(X + r, Y); g.lineTo(X + w, Y + w); g.lineTo(X, Y + r); g.lineTo(X - w, Y + w); g.closePath(); g.fill();
      });
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
// wind over the sand: soft shadows and pale streaks of dust, all stretched along the wind
const wind = (rnd, n, dark, pale) => (g, t) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * t, y = rnd() * t, r = 90 + rnd() * 130, col = i % 3 ? dark : pale, a = i % 3 ? 0.26 : 0.1;
    wrapped(t, x, y, r * 2.2, (X, Y) => { g.save(); g.translate(X, Y); g.rotate(0.35); g.scale(2.2, 0.8); blob(g, 0, 0, r, col, a); g.restore(); });
  }
};
// honeycomb with a vertex up, side a; the tile is nx × 2ny cells, the seam lines up; lit — how many cells glow, in colors cols
function hexTile(ctx, a, col, lw, nx = 1, ny = 1, rnd = null, lit = 0, cols = []) {
  const cw = Math.sqrt(3) * a, w = cw * nx, h = 3 * a * ny;
  const path = (g, cx, cy, r) => {
    g.beginPath();
    for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); }
    g.closePath();
  };
  const at = (i, j) => [(i + (j & 1) / 2) * cw, j * 1.5 * a];
  return tile(ctx, w, h, (g) => {
    for (let n = 0; n < lit; n++) {
      const [cx, cy] = at(Math.floor(rnd() * nx), Math.floor(rnd() * 2 * ny)), c = cols[n % cols.length], al = 0.1 + rnd() * 0.12;
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { path(g, cx + dx, cy + dy, a - lw); g.fillStyle = rgba(c, al); g.fill(); }
    }
    g.strokeStyle = col; g.lineWidth = lw;
    for (let j = -1; j <= 2 * ny; j++) for (let i = -1; i <= nx; i++) { const [cx, cy] = at(i, j); path(g, cx, cy, a); g.stroke(); }
  }, 2);
}
// square grid, cell c, the tile is n × n cells; lit — how many cells glow, in colors cols
function gridTile(ctx, c, col, lw, n = 1, rnd = null, lit = 0, cols = []) {
  const t = c * n;
  return tile(ctx, t, t, (g) => {
    for (let i = 0; i < lit; i++) {
      g.fillStyle = rgba(cols[i % cols.length], 0.08 + rnd() * 0.1);
      g.fillRect(Math.floor(rnd() * n) * c + lw, Math.floor(rnd() * n) * c + lw, c - lw, c - lw);
    }
    g.fillStyle = col;
    for (let i = 0; i < n; i++) { g.fillRect(0, i * c, t, lw); g.fillRect(i * c, 0, lw, t); }
  }, 2);
}
// the "dots" of the dots backdrop are small plus marks: a round dot would pass for a crumb
const dotTile = (ctx, t, col, r) => tile(ctx, t, t, (g) => { g.fillStyle = col; g.fillRect(t / 2 - r, t / 2 - 0.6, r * 2, 1.2); g.fillRect(t / 2 - 0.6, t / 2 - r, 1.2, r * 2); });
// out-of-focus lights: soft discs with a brighter rim, several times larger than the largest crumb
const bokeh = (rnd, n, cols) => (g, t) => {
  for (let i = 0; i < n; i++) {
    const x = rnd() * t, y = rnd() * t, r = 50 + rnd() * 70, c = cols[i % cols.length], a = 0.045 + rnd() * 0.055;
    wrapped(t, x, y, r + 2, (X, Y) => {
      g.beginPath(); g.arc(X, Y, r, 0, TAU); g.fillStyle = rgba(c, a); g.fill();
      g.strokeStyle = rgba(c, a * 1.3); g.lineWidth = 1.2; g.stroke();
    });
  }
};
// plants: a few bent strokes from one root (seaweed, dry grass) — lines, not round spots
const weeds = (rnd, n, cols, a) => (g, t) => {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rnd() * t, y = rnd() * t, c = cols[i % cols.length], m = 3 + Math.floor(rnd() * 3), a0 = rnd() * TAU, bl = [];
    for (let k = 0; k < m; k++) { const an = a0 + (k - m / 2) * 0.5 + rnd() * 0.3, l = 16 + rnd() * 20, bend = (rnd() - 0.5) * 16; bl.push([an, l, bend]); }
    wrapped(t, x, y, 40, (X, Y) => {
      g.strokeStyle = rgba(c, a); g.lineWidth = 2.6;
      for (const [an, l, bend] of bl) {
        const ex = X + Math.cos(an) * l, ey = Y + Math.sin(an) * l;
        g.beginPath(); g.moveTo(X, Y); g.quadraticCurveTo((X + ex) / 2 - Math.sin(an) * bend, (Y + ey) / 2 + Math.cos(an) * bend, ex, ey); g.stroke();
      }
    });
  }
};
const both = (...fs) => (g, t) => { for (const f of fs) f(g, t); };

// kind — one of BACKDROPS; seed — different patches every game; R — arena radius; hue — turn of all colors, degrees
// A backdrop is a list of layers, drawn bottom to top; the first one is opaque (the ground). No more than three: each is a pass
// over the whole screen every frame. A layer: img (patch canvas over the arena) or p (tile pattern);
//   k — depth: the share of the camera's movement the layer follows. 0 lies on the arena, 0.5 is far below it
//       (moves half as fast on screen), below zero is above the arena (moves faster);
//   vx, vy, t — drift in world px per second, t is the tile size (a shift by a whole tile is invisible; such a tile is not turned);
//   tw — the layer twinkles.
export function makeBackdrop(ctx, kind, seed, R, hue = 0) {
  const rnd = rand(Math.imul(seed | 0, 0x9E3779B1) ^ 0x5BD1E995);
  const T = (hex) => tint(hex, hue), TS = (cols) => cols.map(T);
  const img = (k, ...a) => ({ img: macro(R, rnd, ...a), k }), pat = (k, p, more) => ({ p, k, ...more });
  let layers;
  if (kind === 'grid') { // glowing patches far below, a wide lattice with lit cells, the arena's own lattice
    layers = [
      img(0.6, T('#0A100F'), 200, 450, 1200, TS(['#0F5A46', '#12466E', '#4A5A14', '#4A1E66']), 0.55),
      pat(0.3, gridTile(ctx, 136, T('#1F3A36'), 3, 6, rnd, 5, TS(['#3CE0A8', '#46B4FF', '#D8E64A']))),
      pat(0, gridTile(ctx, 80, T('#3A5E56'), 1.5)),
    ];
  } else if (kind === 'hex') { // a hive: honey glow below, a comb of large cells with some filled, the arena's own comb
    layers = [
      img(0.6, T('#120E08'), 200, 450, 1200, TS(['#6E4A0C', '#5A2A0E', '#4A5212', '#6E3A1A']), 0.55),
      pat(0.3, hexTile(ctx, 66, T('#3A2C14'), 3, 5, 3, rnd, 5, TS(['#FFC23C', '#FF8A3C', '#FFE07A']))),
      pat(0, hexTile(ctx, 40, T('#5A4620'), 1.6)),
    ];
  } else if (kind === 'space') {
    layers = [
      img(0, T('#0C1020'), 260, 350, 1100, TS(['#2A2160', '#173A5C', '#3A1E4E']), 0.55),
      pat(0, tile(ctx, 863, 863, stars(rnd, 260, 0.72, 2.5, 6, T('#DCE4FF')))),
      pat(0.5, tile(ctx, 607, 607, stars(rnd, 46, 0, 5, 11, T('#C4D2FF'))), { tw: true }), // distant stars
    ];
  } else if (kind === 'sea') { // the deep floor, a shelf of dark stones and seaweed above it, glints drifting over the arena
    layers = [
      img(0.55, T('#06181E'), 300, 220, 650, TS(['#0E5560', '#04101A', '#124A6E', '#0C4A42']), 0.85),
      pat(0.28, tile(ctx, 911, 911, both(pebbles(rnd, 48, T('#04121A'), 0.5, 10), pebbles(rnd, 40, T('#051820'), 0.45, 5),
        weeds(rnd, 16, TS(['#1E6A5A', '#2A6E7A', '#3A7A4A']), 0.55)), SOFT, '', 27)),
      pat(0, tile(ctx, 457, 457, caustics(rnd, 16, T('#8CDCE6'), T('#AAEBF0'))), { vx: 16, vy: 10, t: 457 }),
    ];
  } else if (kind === 'sand') { // dunes and ripples lie on the arena, the wind carries shadows and dust above it
    const wt = 947;
    layers = [
      img(0, T('#2A2014'), 480, 220, 620, TS(['#4A3820', '#17110A', '#3E2E18', '#5A4426']), 0.85),
      pat(0, tile(ctx, RIPPLE * 35, RIPPLE * 35, both(ripples(rnd, T('#6A5636')), pebbles(rnd, 58, T('#120C06'), 0.45, 4),
        weeds(rnd, 12, TS(['#6A7438', '#806436', '#566A40']), 0.5)), SOFT, '', 23)),
      pat(-0.35, tile(ctx, wt, wt, wind(rnd, 18, T('#0E0A06'), T('#E6CC9A')), SHARP > 1 ? 0.5 : 1), { vx: 34, vy: 12, t: wt }),
    ];
  } else { // dots: colored patches far below, out-of-focus lights between, the arena's own dots
    const cols = TS(['#6E8CFF', '#D07AFF', '#5CE0C8', '#FFB05C', '#5CB4FF', '#FF7AA0']);
    layers = [
      img(0.6, T('#12141A'), 70, 1100, 2200, TS(['#3B4A8A', '#6A3B80', '#2E6A62', '#80522E', '#2E528A']), 0.55),
      pat(0.3, tile(ctx, 1217, 1217, bokeh(rnd, 14, cols), 1, '', 31)),
      pat(0, dotTile(ctx, 60, T('#3A434E'), 3.4)),
    ];
  }
  return { kind, hue, layers };
}

// draws the arena backdrop; the ctx matrix is already the camera's (world), cam — center, z — zoom, W/H — screen in CSS pixels
export function drawBackdrop(ctx, b, R, cam, z, W, H, time) {
  const hw = W / 2 / z + 40, hh = H / 2 / z + 40, w = hw * 2, h = hh * 2;
  ctx.save();
  // clip to the arena circle only when the edge is in view (usually the whole screen is inside — clipping would waste time)
  if (Math.hypot(cam.x, cam.y) + Math.hypot(hw, hh) > R) { ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip(); }
  for (const L of b.layers) {
    // the layer's own origin in the world, and the screen's corner in the layer
    const ox = cam.x * L.k + (L.vx ? (time * L.vx) % L.t : 0), oy = cam.y * L.k + (L.vy ? (time * L.vy) % L.t : 0);
    const x0 = cam.x - hw - ox, y0 = cam.y - hh - oy;
    ctx.globalAlpha = L.tw ? 0.75 + 0.25 * Math.sin(time * 1.3) : 1;
    if (L.img) { // take only the visible part of the patch canvas
      const k = MACRO / (2 * R), sx = Math.max(0, Math.floor((x0 + R) * k)), sy = Math.max(0, Math.floor((y0 + R) * k));
      const ex = Math.min(MACRO, Math.ceil((x0 + w + R) * k)), ey = Math.min(MACRO, Math.ceil((y0 + h + R) * k));
      if (ex > sx && ey > sy) ctx.drawImage(L.img, sx, sy, ex - sx, ey - sy, sx / k - R + ox, sy / k - R + oy, (ex - sx) / k, (ey - sy) / k);
    } else {
      ctx.translate(ox, oy);
      ctx.fillStyle = L.p; ctx.fillRect(x0, y0, w, h);
      ctx.translate(-ox, -oy);
    }
  }
  ctx.restore();
}
