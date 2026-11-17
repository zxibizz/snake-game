// Shared game logic: the solo game and multiplayer rooms (run in the host's browser) use the very same code.
// No DOM and no network here — only the world, snakes, food, bots and collisions.

// Protocol and file version: whenever any file in public/ changes, bump it both here and in sw.js (a test checks they match).
export const VERSION = '53';
export const TAU = Math.PI * 2;
export const R = 7000;                  // arena radius (network coordinates are Int16 / 4, limit 8191)
export const BASE_SPEED = 210;          // px/s at the first stage; each stage (molt) makes the snake faster, see speedOf
export const BOOST_SPEED = 400;
export const SPEED_PER_STAGE = 0.06;    // speed bonus per stage
// Boosting is expensive: every second it burns BOOST_SHARE of the whole length, at least BOOST_COST — food along the way
// can't pay for it, and a long snake spends dozens of length per second. Half of what's spent is left behind as food.
export const BOOST_COST = 10;
export const BOOST_SHARE = 0.05;
export const BOOST_DROP = 0.5;
export const MIN_BOOST_MASS = 20;
export const START_MASS = 15;
export const SNAKES_N = 60;             // snakes in the arena, players included
export const FOOD_N = 4200;
export const FEAST_LIFE = 45;           // how many seconds a feast lies on the ground
// Butterflies fly around the arena on their own and collect food, growing from what they eat. Any snake can eat a butterfly
// with its head, but butterflies are nimble: they dodge sideways from a head that faces them. They can't fly through snakes —
// you pin them with your body or against the edge. A fat one is slower and dodges worse. A caught one spills everything it collected as food.
export const FLY_N = 40;                // butterflies in the arena
export const FLY_MAX = 100;             // how much food a butterfly holds
export const FLY_BASE = 3;              // what an empty butterfly is worth
export const FLY_SPEED = 150;           // px/s while fluttering (30% slower when full)
export const FLY_DART = 600;            // px/s when an empty one dodges (35% slower when full)
export const FLY_SEE = 300;             // distance to a head at which a butterfly starts dodging
// by the chaser's stage: little ones catch more easily (the butterfly notices later, dodges slower and less often,
// and the edge of the head is enough), big ones get more food from a catch — 1.5× from 700, 2× from 1300
// The break for little ones is for players only: little bots crawl by often enough as it is and would empty the butterflies.
export const flyEase = (s) => (s.human ? clamp((3 - stageOf(s.mass)) / 3, 0, 1) : 0);   // 1 at the first stage, 0 from the fourth (900)
export const flyGain = (m) => (m >= 1300 ? 2 : m >= 700 ? 1.5 : 1);
export const flyK = (n) => Math.sqrt(clamp(n, 0, FLY_MAX) / FLY_MAX);
export const flyScale = (n) => 1.9 + 1.5 * flyK(n);   // drawing: brackets of radius 9.5 × scale
export const flyRadius = (n) => 8 * flyScale(n);      // for collisions and eating
const CELL = 100;
// over the network food is sent in large cells: each player gets only the cells around them
export const FOOD_CELL = 1000;
export const FOOD_CELLS = Math.ceil((2 * R) / FOOD_CELL);
export const foodCellOf = (x, y) => clamp(Math.floor((y + R) / FOOD_CELL), 0, FOOD_CELLS - 1) * FOOD_CELLS +
  clamp(Math.floor((x + R) / FOOD_CELL), 0, FOOD_CELLS - 1);
const GRID_OFF = R + 200;
const GRID_N = Math.ceil((2 * GRID_OFF) / CELL);
const G2 = GRID_N * GRID_N;

// A big snake doesn't hunt small ones: a target at least 30% shorter than the bot is neither cut off nor ambushed
export const PREY_GAP = 1.3;
export const preyFor = (b, s) => b.mass <= s.mass * PREY_GAP;
// from which leaderboard place the bots hunt a player seriously (see heatOf)
export const RANK_HOT = 20;
// Places on the leaderboard (and the crowns, and the stars for places) don't flicker between snakes of almost the same
// length: a snake takes the place above only once it is longer than that one's length plus RANK_HOLD of it plus RANK_HOLD_MIN
export const RANK_HOLD = 0.03;
// The bot with the golden crown (the longest snake in the arena) is careful: its eyes, reactions, lapses and fights with
// other bots move CAREFUL of the way from its level toward the hard level's best — so the crown lives longer and you can
// crawl up to it. Speed, turning and its anger at players stay those of the level. Measured over 6 worlds × 5 min:
// the crown holds about a minute on easy and medium instead of ~15 s; at 1 it held for minutes, and the leader grew too long to catch
export const CAREFUL = 0.5;
// a bot appearing mid-game is at most this share of the length of the shortest player wearing a crown (spawnCap)
export const SPAWN_BELOW = 0.9;
const mix = (a, b) => a + (b - a) * CAREFUL;
export const carefulOf = (D) => {
  const H = DIFF.hard;
  return { ...D, react: Math.min(D.react, mix(D.react, H.react)), look: Math.max(D.look, mix(D.look, H.look)),
    wary: Math.max(D.wary, mix(D.wary, H.wary)), fresh: Math.min(D.fresh, mix(D.fresh, H.fresh)),
    cutNear: Math.min(D.cutNear, mix(D.cutNear, H.cutNear)), foresee: Math.max(D.foresee, mix(D.foresee, H.foresee)),
    slip: mix(D.slip, 0), slipAny: false, feud: Math.min(D.feud, mix(D.feud, H.feud)) };
};
export const RANK_HOLD_MIN = 10;
const overtakes = (lo, hi) => lo.mass > hi.mass * (1 + RANK_HOLD) + RANK_HOLD_MIN;
// list — [{id, mass}] in any order, prev — ids in the order shown last time; returns the list in the new order.
// Known snakes keep their old order, newcomers are put in by length, then a snake moves up past each one it overtakes
export function stickyRank(list, prev = []) {
  const at = new Map(prev.map((id, i) => [id, i]));
  const out = list.filter((s) => at.has(s.id)).sort((a, b) => at.get(a.id) - at.get(b.id));
  for (const s of list.filter((s) => !at.has(s.id)).sort((a, b) => b.mass - a.mass)) {
    let i = out.findIndex((o) => o.mass < s.mass);
    if (i < 0) i = out.length;
    out.splice(i, 0, s);
  }
  // each snake goes up above the highest one it overtakes. Afterwards no snake overtakes anyone above it:
  // whoever stays in between doesn't overtake that one either, so it's shorter than the one moving up
  for (let i = 1; i < out.length; i++) {
    const k = out.findIndex((o, j) => j < i && overtakes(out[i], o));
    if (k >= 0 && k < i) out.splice(k, 0, out.splice(i, 1)[0]);
  }
  return out;
}
// Cutting off: the player's tail laid during the last CUT_NEW s has "only just been laid". If it lies across a bot's path
// closer than D.cutNear pixels to its nose (edge to edge), the bot notices it with a delay of D.fresh. Farther away it sees it at once
export const CUT_NEW = 1;
// a bot's "lapse" (D.slip): how many seconds it lasts, how much shorter the bot sees, and how many times less often it thinks
export const SLIP_T = [0.6, 1.4];
export const SLIP_LOOK = 0.3;
export const SLIP_REACT = 3;
const HEAD_K = Math.ceil(2 / 0.42); // head and neck: this many segments from the head (two radii at a step of 0.42 radius); the bot always sees them

// mass — the bots' mass range when the world is created; giants — how many bots of at least giantMin to keep in the arena.
// aggr — how often a bot looks for someone to cut off; grace — seconds after a player spawns without being hunted.
// Aggression toward a player grows with their leaderboard place: [below RANK_HOT, at RANK_HOT, in first place]
//   humanAggr — how eagerly a bot picks a player as its target (above 1 — always, if the player is near and the right size),
//   maxHunters — how many bots hunt one player at once (an ambush counts too).
// rest — a bot's average pause between hunts, s; foresee — how many seconds ahead a big bot predicts other heads
// (0 — only the basic 0.45 s): the more, the harder it is to cut off a giant;
// wary — how often a bot notices its path being cut and moves away along the other snake's path;
// keep — the share of length kept after "Continue" (0 — start over);
// fresh — after how many seconds a bot notices that a player has just cut across its path with their tail: more — easier to cut off;
// cutNear — how close to its nose (px, edge to edge) such a tail catches the bot off guard.
// Chaos: feud — the share of hunting attempts in which a bot is willing to cut off another bot (less — a calmer arena);
// slip — how many times a minute a bot "lapses" in a crowd (near food, remains, in a chase): for SLIP_T s it only sees
// right under its nose (SLIP_LOOK of the usual), misses cut-offs and other heads, and thinks SLIP_REACT times less often —
// it comes to only at its next think, so on slow levels a lapse lasts up to SLIP_REACT·react·1.3 s;
// slipAny — lapses anywhere, not just in a crowd: it crashes into lying bodies too. Nobody lapses near the arena edge.
export const DIFF = {
  easy: {
    mass: [15, 2500], giants: 4, giantMin: 800,
    speed: 0.95, turn: 0.75, react: 0.7, look: 220,
    aggr: 0.3, humanAggr: [0, 0.7, 1], maxHunters: [1, 1, 2], grace: 10, huntRange: 480, boost: 0.55, rest: 6, foresee: 0, wary: 0.1, fresh: 0.8, cutNear: 200,
    feud: 0.5, slip: 12, slipAny: true,
    edgeKills: false, keep: 0.8,
  },
  medium: {
    mass: [15, 3500], giants: 5, giantMin: 1100,
    speed: 0.97, turn: 0.85, react: 0.5, look: 275,
    aggr: 0.55, humanAggr: [0.4, 0.85, 1.2], maxHunters: [1, 2, 3], grace: 6, huntRange: 640, boost: 0.8, rest: 4, foresee: 0, wary: 0.2, fresh: 0.5, cutNear: 200,
    feud: 0.3, slip: 6,
    edgeKills: true, keep: 0.4,
  },
  hard: {
    mass: [20, 6000], giants: 6, giantMin: 1800,
    speed: 1.03, turn: 1.08, react: 0.08, look: 410,
    aggr: 0.9, humanAggr: [0.9, 1.3, 1.7], maxHunters: [2, 4, 5], grace: 3, huntRange: 820, boost: 0.95, rest: 2, foresee: 0.9, wary: 0.85, fresh: 0.18, cutNear: 110,
    feud: 0.06, slip: 0.5,
    edgeKills: true, keep: 0,
  },
};
// length after "Continue"
export const keepMass = (diff, mass) => Math.max(START_MASS, mass * (DIFF[diff] || DIFF.easy).keep);

// Palette: food and snake segments refer to a color by index (cheap to send over the network).
export const PAL = [
  '#FF5A5F', '#FF8A3D', '#FFC93C', '#B6E35A', '#4CD07D', '#2EC4B6', '#3DB8F5', '#4F7CFF', // 0–7
  '#8B5CF6', '#D65DB1', '#FF7EB6', '#FFFFFF', '#2B2D42', '#FFD447', '#C9CED6', '#8A5A3B', // 8–15
  '#1E7A44', '#A8EBFF', '#FFE6B0', '#5E2CA5', '#22F0B4', '#FF3D7F', '#1B2A55', '#E8430C', // 16–23
  '#9EE7C9', '#FFB3C7', '#C7B6FF', '#7DF9FF', '#FFF27A', '#3A3F4B', '#B0F06A', '#FF9F1C', // 24–31
];
export const GOLD = 13;
export const FOOD_COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21, 27, 28];

// Skins are per-segment palettes. Their colors are appended to PAL (a color index travels over the network as one byte).
// p — color indices in rotation, run — beads in a row of one color, head — head color, stars — how many stars unlock it.
// bounce — the palette runs there and back so the colors flow into each other.
const palIdx = (hex) => { let k = PAL.indexOf(hex); if (k < 0) { k = PAL.length; PAL.push(hex); } return k; };
// type — the snake type (beads and head are drawn in its own way), acc — the pattern color: spots, crest, stripes, lights,
// hd — the head color if it differs from the body (Spotty has a dark head).
export const TYPES = [
  { id: 'beads' }, { id: 'fish' }, { id: 'caterpillar' }, { id: 'dots' },
  { id: 'dragon' }, { id: 'tiger' }, { id: 'robot' }, { id: 'neon' },
];
const typeIdx = (id) => TYPES.findIndex((t) => t.id === id);
function skin(id, hexes, { bounce = false, head = hexes[0], stars = 0, type = 'beads', acc = null, run = 2 } = {}) {
  const seq = bounce ? hexes.concat(hexes.slice(1, -1).reverse()) : hexes;
  return { id, p: seq.map(palIdx), run, head: palIdx(head), stars, type: typeIdx(type), acc: acc ? palIdx(acc) : -1 };
}
// new skins go only at the end of the list: the skin index is stored in saves and sent over the network
export const SKINS = [
  skin('rainbow', ['#FF5A5F', '#FF8A3D', '#FFC93C', '#7ED957', '#2EC4B6', '#3D8BF5', '#8B5CF6']),
  skin('pastel', ['#FFA8B5', '#FFC9A3', '#FFEFA3', '#C6F0A8', '#A8E6E0', '#B3CCFF', '#D4B8FF']),
  skin('icecream', ['#FFB3C7', '#FFF1C9', '#B5F2DA', '#B9D3FF', '#E3C8FF']),
  skin('ocean', ['#CFF5FA', '#90E0EF', '#48CAE4', '#00A6D6', '#0077B6', '#03508C'], { bounce: true, head: '#48CAE4' }),
  skin('tutti', ['#FF595E', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93'], { stars: 250 }),
  skin('candy', ['#FF5D8F', '#FFE3EC', '#FF5D8F', '#B5F2DA'], { stars: 600 }),
  skin('sunset', ['#FFD166', '#FFA45B', '#FF6B6B', '#E05780', '#9D4EDD', '#6A2CB8'], { bounce: true, stars: 1600 }),
  skin('forest', ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#95D5B2', '#C7EFCF'], { bounce: true, head: '#52B788', stars: 3000 }),
  skin('autumn', ['#8C1C13', '#BF4342', '#E05A1E', '#F48C06', '#FAA307', '#FFC93C'], { bounce: true, head: '#E05A1E', stars: 5850 }),
  skin('berries', ['#3A0CA3', '#6A0DAD', '#9D1BB2', '#D61F8C', '#FF5D8F', '#FF9EBB'], { bounce: true, head: '#D61F8C', stars: 9600 }),
  skin('aurora', ['#0E6B5C', '#1FAB89', '#62D2A2', '#A8F0C6', '#9A8CFF', '#6C4CD6'], { bounce: true, head: '#1FAB89', stars: 14250 }),
  skin('peacock', ['#005F73', '#0A9396', '#94D2BD', '#E9D8A6', '#EE9B00', '#CA6702', '#9B2226'], { bounce: true, head: '#0A9396', stars: 21850 }),
  // types: the first skin of a type unlocks early, the rest are mixed in with the beads — something new unlocks often
  skin('goldfish', ['#FFB020', '#FF8A00'], { type: 'fish', acc: '#FF5A5F', stars: 100 }),
  skin('seafish', ['#48CAE4', '#0096C7', '#0077B6'], { type: 'fish', bounce: true, acc: '#CFF5FA', stars: 1200 }),
  skin('koi', ['#FFF4E6', '#FFF4E6', '#FF5A1F', '#FFF4E6', '#FF5A1F', '#FF5A1F'], { type: 'fish', acc: '#FF5A1F', stars: 4500 }),
  skin('tropical', ['#2EC4B6', '#FFC93C', '#FF5D8F'], { type: 'fish', acc: '#FFC93C', stars: 12000 }),
  skin('leaf', ['#7ED957', '#A8E063'], { type: 'caterpillar', acc: '#FF5A5F', run: 1, stars: 400 }),
  skin('lemon', ['#FFD447', '#FFB020'], { type: 'caterpillar', acc: '#8A5A3B', run: 1, stars: 1900 }),
  skin('lavender', ['#C7B6FF', '#9A84F5'], { type: 'caterpillar', acc: '#FF7EB6', run: 1, stars: 6500 }),
  skin('orange', ['#FF9F1C', '#FFBF69'], { type: 'caterpillar', acc: '#2EC4B6', run: 1, stars: 15000 }),
  skin('ladybug', ['#E5383B'], { type: 'dots', acc: '#1A1A1A', head: '#1A1A1A', stars: 900 }),
  skin('sunny', ['#FFC93C', '#FFB020'], { type: 'dots', acc: '#1A1A1A', head: '#1A1A1A', stars: 2600 }),
  skin('toadstool', ['#D62828'], { type: 'dots', acc: '#FFF4E0', head: '#F1E3C8', stars: 8000 }),
  skin('dalmatian', ['#F4F4F0'], { type: 'dots', acc: '#1A1A1A', head: '#2B2D42', stars: 18000 }),
  skin('emerald', ['#2D6A4F', '#40916C', '#52B788'], { type: 'dragon', bounce: true, acc: '#FFB020', head: '#40916C', stars: 1300 }),
  skin('firedragon', ['#9D0208', '#D00000', '#E85D04', '#F48C06'], { type: 'dragon', bounce: true, acc: '#FFE066', head: '#D00000', stars: 3300 }),
  skin('icedragon', ['#A8EBFF', '#7DD3F5', '#3DB8F5'], { type: 'dragon', bounce: true, acc: '#F2FCFF', head: '#7DD3F5', stars: 10500 }),
  skin('nightdragon', ['#2B2D42', '#3A3F6B', '#5E2CA5'], { type: 'dragon', bounce: true, acc: '#22F0B4', head: '#3A3F6B', stars: 24000 }),
  skin('tiger', ['#FF8A1F'], { type: 'tiger', acc: '#1A1A1A', stars: 2000 }),
  skin('zebra', ['#F4F4F0'], { type: 'tiger', acc: '#1A1A1A', stars: 4200 }),
  skin('bee', ['#FFC93C'], { type: 'tiger', acc: '#2B2D42', stars: 12500 }),
  skin('leopard', ['#E8E6DC', '#D8D4C4'], { type: 'tiger', acc: '#6B6B6B', stars: 27000 }),
  skin('steelbot', ['#9AA5B1', '#B8C2CC'], { type: 'robot', acc: '#3DB8F5', stars: 3000 }),
  skin('goldbot', ['#E0B84C', '#C99A2E'], { type: 'robot', acc: '#FF5A5F', stars: 5200 }),
  skin('toybot', ['#FF5A5F', '#FFC93C', '#3D8BF5'], { type: 'robot', acc: '#FFFFFF', head: '#3D8BF5', run: 1, stars: 16500 }),
  skin('spacebot', ['#E8EEF5', '#C9D3DE'], { type: 'robot', acc: '#22F0B4', stars: 30000 }),
  skin('pinkneon', ['#FF3D7F'], { type: 'neon', stars: 4000 }),
  skin('tealneon', ['#22F0B4'], { type: 'neon', stars: 7000 }),
  skin('rainbowneon', ['#FF5A5F', '#FFC93C', '#7ED957', '#2EC4B6', '#3D8BF5', '#8B5CF6'], { type: 'neon', stars: 20000 }),
  skin('electric', ['#4F7CFF', '#7DF9FF'], { type: 'neon', stars: 34000 }),
];
// skins by type: SKINS_OF[type] — indices of that type's skins in unlock order
export const SKINS_OF = TYPES.map((_, t) => SKINS.map((_, i) => i).filter((i) => SKINS[i].type === t).sort((a, b) => SKINS[a].stars - SKINS[b].stars));
// similar skins: the mean distance to the nearest color of the other palette in OKLab (both ways).
// Below SKIN_NEAR_D the eye can't tell them apart in the arena (pastel ~ icecream ≈ 0.04, rainbow ~ sunset ≈ 0.09).
// A bot doesn't take a human's skin or similar ones — otherwise it's easy to mistake your own snake for someone else's.
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
// SKIN_NEAR[i] — skins that get confused with i (including i itself): same type and close colors; different types aren't confused
export const SKIN_NEAR = SKINS.map((_, i) => SKINS.map((_, j) => j).filter((j) => SKINS[j].type === SKINS[i].type && skinDist(i, j) < SKIN_NEAR_D));

// color of segment i: every second segment is drawn (a "bead"), colors are counted per bead
export const segColor = (skin, i) => { const s = SKINS[skin] || SKINS[0]; return s.p[Math.floor((i >> 1) / s.run) % s.p.length]; };

// Molts: mass gives only length, while thickness and scale style come from the stage. At each length threshold in STAGES
// the snake molts: it gets thicker (STAGE_R) and fancier. A stage is never lost during a life (slimmed down by boosting —
// shorter, but not thinner); after "Continue" it starts again by length. Thickness grows to the new stage over MOLT_T s, not in a jump.
export const STAGES = [0, 100, 350, 900, 2200, 5000];
export const STAGE_R = [13, 20, 28, 38, 47, 56];
export const MOLT_T = 0.8;
export const MOLT_WAIT = 0.35;          // thickness doesn't start growing at once, but when the glow on screen reaches the head
export function stageOf(mass) {
  let i = 0;
  while (i + 1 < STAGES.length && mass >= STAGES[i + 1]) i++;
  return i;
}
// stage by current length (never below the previous one) and the thickness that grows toward it
export function growStage(s, dt) {
  const st = stageOf(s.mass);
  if (st > s.stage) setStage(s, st);
  growR(s, dt);
}
export function setStage(s, st) {
  if (st <= s.stage) return;
  s.stage = st; s.moltWait = MOLT_WAIT; s.rFrom = s.r;
}
// thickness grows to the stage over MOLT_T (after a MOLT_WAIT pause); skipping a stage is faster but takes the same time
export function growR(s, dt) {
  const t = STAGE_R[s.stage];
  if (s.r >= t || s.stage === 0) { s.r = t; return; }
  if (s.moltWait > 0) { s.moltWait -= dt; return; }
  s.r = Math.min(t, s.r + (t - Math.min(s.rFrom ?? t, STAGE_R[s.stage - 1])) / MOLT_T * dt);
}

// speed grows in steps with the current length; boosting adds a bit less, so a giant can still be outrun
export function speedOf(mass, boosting) {
  const k = SPEED_PER_STAGE * stageOf(mass);
  return boosting ? BOOST_SPEED * (1 + k * 0.5) : BASE_SPEED * (1 + k);
}
// turn rate, rad/s: a thick snake turns slower
export const turnOf = (r) => 7 / (1 + Math.max(0, r - 11) / 40);
// how much length per second a boost costs
export const boostCostOf = (m) => Math.max(BOOST_COST, m * BOOST_SHARE);
// how much length is left as food after a crash: three quarters for little ones, a noticeably smaller share for giants
export const remainsOf = (m) => (m <= 100 ? Math.max(4, m * 0.75) : 75 * Math.pow(m / 100, 0.62));


// bot names when the world is created without a localized list (tests); the client passes its language's list
export const BOT_NAMES = ['Bot'];

export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const angDiff = (a, b) => { // a - b within [-π, π]
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
  return d;
};

// the snake's "volume" by mass — it sets the step between beads (body length in segments); the same for everyone who rebuilds bodies.
// The thickness itself comes from the stage (STAGE_R), not from here.
export const radiusOf = (m) => (m <= 900 ? 9 + Math.sqrt(Math.max(0, m)) * 0.95 : 37.5 + 9 * Math.log(m / 900));
export const spacingOf = (m) => radiusOf(m) * 0.42;
// body length by mass
export const bodyLenOf = (m) => 57 * Math.pow(Math.max(1, m), 0.55);
export const countOf = (m) => Math.max(6, Math.round(bodyLenOf(m) / spacingOf(m)));
export const foodRadiusOf = (v) => Math.min(13, 3.2 + Math.sqrt(v) * 2); // for eating (balance), not for drawing
// on screen a crumb is sized by value: area proportional to value — 1, 2 and 4 of normal food are visibly different, boost drops are smaller
export const foodLookOf = (v) => Math.min(16, 4.6 * Math.sqrt(v));

// each segment trails the previous one at distance sp
export function followChain(segs, sp) {
  const sp2 = sp * sp;
  for (let i = 1; i < segs.length; i++) {
    const p = segs[i - 1], q = segs[i];
    const dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
    if (d2 > sp2) { const d = Math.sqrt(d2); q.x = p.x + dx / d * sp; q.y = p.y + dy / d * sp; }
  }
}
// growing and shrinking: one segment per step, so it's smooth
export function fitLength(segs, n) {
  if (segs.length < n) { const t = segs[segs.length - 1]; segs.push({ x: t.x, y: t.y }); }
  else if (segs.length > n + 1) segs.pop();
}

// a body laid in a smooth arc back from the head: long snakes appear whole, not as a tangle
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

// a body coiled into a point: the snake "crawls out" of it as it moves instead of appearing in the arena all at once
export const coilBody = (x, y, mass) => Array.from({ length: countOf(mass) }, () => ({ x, y }));

// ---------- careful autopilot (pause in a room) ----------
// Tries AUTO.N headings from the current one (nearest first) and plays out an arc path for each — with the snake's real
// turn rate and speed — for AUTO.T seconds. Clearance is measured the same way as death in the world
// (own head r·0.55 + other body R·0.85): to bodies, to other heads projected along their heading, and to the arena edge;
// teammates don't count. The best heading has the largest clearance along the way (if there's no escape — the one where we crash
// later and shallower); sharp turns only when needed, food along the way counts a little and only when there's room.
// The previous heading prev is kept until another one is clearly better. others — snakes with segs, r, mass, a, team (invulnerable
// ones are obstacles too: invulnerability ends in a couple of seconds, possibly mid-path). D — the level (bot speed).
// Head speeds are adjusted by level, as in moveSnake.
export const AUTO = { T: 1.6, DT: 0.06, N: 24, CELL: 160, SAFE: 160 };
export function safeCourse(s, others, foods, prev = null, D = null) {
  const h = s.segs[0], v = speedOf(s.mass, false), turn = turnOf(s.r), cap = AUTO.SAFE * 1.5;
  const far = v * AUTO.T + 400, C = AUTO.CELL;
  const grid = new Map(), heads = [];
  let maxRR = 0;
  for (const o of others) {
    if (o === s || o.id === s.id || (s.team && o.team === s.team)) continue;
    const reach = bodyLenOf(o.mass) + far + speedOf(o.mass, true) * AUTO.T; // a boosting head gets far
    if (Math.abs(o.segs[0].x - h.x) > reach || Math.abs(o.segs[0].y - h.y) > reach) continue;
    const rr = o.r * 0.85 + s.r * 0.55;
    if (rr > maxRR) maxRR = rr;
    for (const q of o.segs) {
      if (Math.abs(q.x - h.x) > far || Math.abs(q.y - h.y) > far) continue;
      const k = Math.floor(q.x / C) * 100003 + Math.floor(q.y / C);
      let c = grid.get(k);
      if (!c) grid.set(k, (c = []));
      c.push(q.x, q.y, rr);
    }
    const sp = speedOf(o.mass, !!o.isBoosting) * (o.human || !D ? 1 : D.speed);
    heads.push(o.segs[0].x, o.segs[0].y, Math.cos(o.a) * sp, Math.sin(o.a) * sp, rr * 1.6 + 20);
  }
  const span = Math.ceil((maxRR + cap) / C);
  const clearAt = (x, y, t) => {
    let best = Math.min(cap, R - Math.hypot(x, y) - s.r); // beyond cap the clearance no longer matters
    const cx = Math.floor(x / C), cy = Math.floor(y / C);
    for (let gx = cx - span; gx <= cx + span; gx++) {
      for (let gy = cy - span; gy <= cy + span; gy++) {
        const c = grid.get(gx * 100003 + gy);
        if (!c) continue;
        for (let i = 0; i < c.length; i += 3) {
          const dx = c[i] - x, dy = c[i + 1] - y, lim = best + c[i + 2];
          if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
          const d = Math.sqrt(dx * dx + dy * dy) - c[i + 2];
          if (d < best) best = d;
        }
      }
    }
    for (let i = 0; i < heads.length; i += 5) {
      const d = Math.hypot(heads[i] + heads[i + 2] * t - x, heads[i + 1] + heads[i + 3] * t - y) - heads[i + 4];
      if (d < best) best = d;
    }
    return best;
  };
  const near = [];
  for (const f of foods) if (Math.abs(f.x - h.x) < far && Math.abs(f.y - h.y) < far) near.push(f);
  const step = TAU / AUTO.N;
  let bestA = s.a, bestS = -Infinity, keepA = null, keepS = -Infinity, keepD = Infinity;
  for (let i = 0; i < AUTO.N; i++) {
    const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * step; // 0, +15°, −15°, … up to ±180°
    const ta = s.a + off, bend = Math.abs(off) * 15;
    const dp = prev === null ? Infinity : Math.abs(angDiff(ta, prev)), isKeep = dp < step / 2 + 1e-6;
    let x = h.x, y = h.y, a = s.a, minC = Infinity, crash = -1, food = 0, n = 0, cut = false;
    const eaten = new Set();
    for (let t = AUTO.DT; t <= AUTO.T + 1e-9; t += AUTO.DT) {
      const d = angDiff(ta, a), mt = turn * AUTO.DT;
      a += d > mt ? mt : d < -mt ? -mt : d;
      x += Math.cos(a) * v * AUTO.DT; y += Math.sin(a) * v * AUTO.DT;
      const c = clearAt(x, y, t);
      if (c < minC) minC = c;
      if (c < 0) { crash = t; break; }
      // this heading is no longer the best (the previous one is computed fully: keeping it compares the real score)
      if (!isKeep && minC + 60 - bend < bestS) { cut = true; break; }
      if (++n % 2 === 0) {
        for (const f of near) {
          const er = s.r * 0.8 + f.r + 15;
          if (!eaten.has(f) && (f.x - x) ** 2 + (f.y - y) ** 2 < er * er) { eaten.add(f); food += f.v; }
        }
      }
    }
    let score;
    if (cut) score = -Infinity; // not fully computed — can be neither chosen nor kept
    else if (crash >= 0) score = -1000 + crash * 300 + Math.max(minC, -100); // no escape — at least later and shallower
    else score = minC - bend + (minC > AUTO.SAFE ? Math.min(food, 40) * 1.5 : 0);
    if (isKeep && dp < keepD) { keepD = dp; keepA = ta; keepS = score; }
    if (score > bestS) { bestS = score; bestA = ta; }
  }
  return keepA !== null && bestS - keepS < 25 ? keepA : bestA;
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
    this.pers = rand(0.4, 1.6);      // the bot's character: how much of a bully it is
    this.goFeast = false;
    this.wander = this.a; this.kills = 0;
    // the bot's memory: which side it approaches its target from, where it crawls for food, whom it noticed and whose remains it's heading for
    this.cau = rand(0.6, 1.3);       // caution: how often it notices being cut off
    this.hside = 0; this.huntT0 = 0;
    this.goalC = -1; this.goalT = 0; this.goalV = 0; this.ambTarget = 0; this.ambUntil = 0;
    this.surpId = 0; this.surpT = 0; this.surpLast = -9; // whose tail cut across its path and when the bot will notice
    this.slipT = 0;                 // until when the bot "lapses" (D.slip)
    this.mem = new Map();           // what the bot decided about an encounter (noticed a threat, sets an ambush, goes for the remains) — for a few seconds
    this.stage = stageOf(mass); this.r = STAGE_R[this.stage];
    this.segs = segs || layBody(x, y, this.a, mass, 0, 0, 0);
  }
  get x() { return this.segs[0].x; }
  get y() { return this.segs[0].y; }
}

const OFFS = [0, 0.3, -0.3, 0.6, -0.6, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1]; // heading candidates; the path to each is an arc (rayDanger)

// where the paths of two heads going straight cross: the first gets there in t1 s, the second in t2.
// null — the paths are parallel or cross behind
function crossing(bx, by, bvx, bvy, ox, oy, ovx, ovy) {
  const den = bvx * ovy - bvy * ovx;
  if (Math.abs(den) < 1e-6) return null;
  const dx = ox - bx, dy = oy - by;
  const t1 = (dx * ovy - dy * ovx) / den, t2 = (dx * bvy - dy * bvx) / den;
  return t1 > 0 && t2 > 0 ? [t1, t2] : null;
}

export class World {
  // teams: snakes with the same non-zero team pass through each other (the "family vs bots" mode)
  constructor({ diff = 'easy', foodN = FOOD_N, bots = SNAKES_N - 1, flies = FLY_N, botNames = BOT_NAMES } = {}) {
    this.diffKey = diff;
    this.botNames = botNames.length ? botNames : BOT_NAMES;
    this.D = DIFF[diff];
    this.carefulD = carefulOf(this.D); // the crowned bot's brain
    this.crowned = null;               // who wears the golden crown: the longest, with the same hold as the leaderboard
    this.targetBots = bots;
    this.foodN = foodN;
    this.snakes = [];
    this.foods = [];
    this.naturalCount = 0;
    this.respawnQueue = [];
    this.pending = [];
    this.events = [];
    this.nextSnakeId = 1;
    this.humanSkins = new Set(); // humans' skins: bots don't take their type (or similar skins)
    this.nextFoodId = 1;
    this.time = 0;
    this.byId = new Map();
    this.hunted = new Map();     // snake id → how many bots are hunting it
    this.huntSide = new Map();   // snake id → which side the first hunter approaches from
    this.deaths = [];            // recent crashes: snakes gather there for the remains
    this.feast = null;           // { x, y, until }
    this.feastT = rand(20, 30);
    this.flies = [];             // butterflies
    this.flyQueue = [];          // in how many seconds new butterflies arrive to replace caught ones
    this.nextFlyId = 1;
    // for the network: what changed since the last send
    this.track = false;
    this.foodAdded = [];
    this.foodRemoved = [];

    this.segHead = new Int32Array(G2); this.maxR = 0;
    this.foodHead = new Int32Array(G2);
    this.segNext = new Int32Array(16384);
    this.segS = new Int32Array(16384);
    this.segK = new Int32Array(16384);
    this.foodNext = new Int32Array(16384);
    this.segHead.fill(-1); this.foodHead.fill(-1); // empty grid until the first step

    for (let i = 0; i < foodN; i++) this.spawnNatural();
    for (let i = 0; i < this.targetBots; i++) this.spawnBot(true);
    for (let i = 0; i < flies; i++) this.spawnFly(true);
  }

  humans() { return this.snakes.filter((s) => s.human && s.alive); }

  // ---------- food ----------
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

  // ---------- butterflies ----------
  spawnFly(initial) {
    const p = this.randomSpot(R * 0.92, 150, this.humans(), initial ? 0 : 900);
    const f = { id: this.nextFlyId++, x: p.x, y: p.y, vx: 0, vy: 0, dir: rand(0, TAU), n: 0, cnt: new Map(), top: [],
      dart: 0, cool: 0, gx: p.x, gy: p.y, gT: 0, ph: rand(0, TAU) };
    if (initial) { // at the start of a game the butterflies have already eaten — some more, some less
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
    f.top = [...f.cnt.keys()].sort((a, b) => f.cnt.get(b) - f.cnt.get(a)).slice(0, 5); // crumb colors — what it ate most of
  }
  // how much room there is from a point to the nearest body (no farther than lim)
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
  // dodge: a dash across the snake's course — toward the side with more room
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
    const e = flyEase(s), v = FLY_DART * (1 - 0.35 * k) * (1 - 0.3 * e);
    f.vx = Math.cos(best) * v; f.vy = Math.sin(best) * v;
    f.dart = 0.35; f.cool = rand(0.35, 0.5) * (1 + 0.5 * k) * (1 + 0.8 * e);
  }
  // where to fly: to rich food nearby; when full, just flutter about
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
      // in the best cell go to the nearest crumb: not to the middle of the pile, where the butterfly hovers between crumbs
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
      // a head is close and facing the butterfly (or right next to it) — dodge the closest such head
      if (f.cool <= 0) {
        let hs = null, hd = Infinity;
        for (const s of snakes) {
          if (!s.alive) continue;
          const d = Math.hypot(s.x - f.x, s.y - f.y) - s.r;
          if (d >= hd || d >= FLY_SEE * (1 - 0.4 * flyEase(s)) + fr) continue;
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
      // can't fly through snakes: bounces off bodies (the head doesn't count — that's what catches it)
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
      // arena edge (after bodies: a body doesn't push a butterfly pinned against the edge out of the arena)
      const d = Math.hypot(f.x, f.y), lim = R - fr - 10;
      if (d > lim) {
        const nx = f.x / d, ny = f.y / d, vn = f.vx * nx + f.vy * ny;
        f.x = nx * lim; f.y = ny * lim;
        if (vn > 0) { f.vx -= 1.6 * vn * nx; f.vy -= 1.6 * vn * ny; }
      }
      if (Math.abs(f.vx) + Math.abs(f.vy) > 10) f.dir = Math.atan2(f.vy, f.vx);
      // caught by a head (whoever crashed in this step can't catch anymore)
      let by = null;
      for (const s of snakes) {
        if (!s.alive || s.inv > 0 || s.remote || dying.has(s)) continue;
        const rr = s.r * 0.8 + fr * (0.5 + 0.4 * flyEase(s));
        if ((s.x - f.x) ** 2 + (s.y - f.y) ** 2 < rr * rr) { by = s; break; }
      }
      if (by) { this.catchFly(f, by); this.flies.splice(fi, 1); continue; }
      // eats food
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
  // caught: everything collected spills out as food in the crumbs' colors
  catchFly(f, s) {
    const total = (FLY_BASE + f.n) * flyGain(s.mass), m = clamp(Math.ceil(total / 6), 1, 24), v = total / m;
    const cols = f.top.length ? f.top : [GOLD], spread = 20 + total * 0.4;
    for (let i = 0; i < m; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * spread;
      this.addFood(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, v, cols[i % cols.length], 40);
    }
    this.flyQueue.push(rand(4, 10));
    this.events.push({ type: 'fly', x: f.x, y: f.y, by: s, v: total, c: cols[0] });
  }

  // ---------- grid ----------
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
    let m = 0, maxR = 0;
    for (let si = 0; si < this.snakes.length; si++) {
      const s = this.snakes[si];
      if (!s.alive || s.inv > 0) continue; // invulnerable — a "ghost"
      const segs = s.segs;
      if (s.r > maxR) maxR = s.r;
      // "just laid": this many segments from the head the player laid during the last CUT_NEW s (see think — cutting off)
      s.newK = s.human ? Math.min(segs.length >> 1, Math.ceil(CUT_NEW * speedOf(s.mass, false) / spacingOf(s.mass))) : 0;
      if (m + segs.length > this.segS.length) this.growSeg(m + segs.length);
      for (let k = 0; k < segs.length; k++) {
        const c = this.cellOf(segs[k].x, segs[k].y);
        this.segS[m] = si; this.segK[m] = k; this.segNext[m] = this.segHead[c]; this.segHead[c] = m; m++;
      }
    }
    this.maxR = maxR;
    this.foodHead.fill(-1);
    if (this.foods.length > this.foodNext.length) this.foodNext = new Int32Array(this.foods.length * 2);
    for (let i = 0; i < this.foods.length; i++) {
      const c = this.cellOf(this.foods[i].x, this.foods[i].y);
      this.foodNext[i] = this.foodHead[c]; this.foodHead[c] = i;
    }
  }

  // ---------- spawning ----------
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
    const names = this.botNames, used = new Set(this.snakes.filter((s) => s.alive).map((s) => s.name));
    const free = names.filter((n) => !used.has(n));
    return free.length ? free[randi(0, free.length - 1)] : names[randi(0, names.length - 1)];
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
    const small = () => lo * Math.pow(hi / lo, Math.pow(Math.random(), 3));
    const cap = this.spawnCap();
    if (cap === Infinity) return giants < D.giants && Math.random() < 0.5 ? rand(D.giantMin, hi * 0.8) : small();
    // a player wears a crown: no giants, the usual small ones, each no longer than the cap
    if (cap <= lo) return lo;
    for (let t = 0; t < 8; t++) { const m = small(); if (m <= cap) return m; }
    return rand(lo, cap);
  }
  // how long a bot appearing mid-game may be: SPAWN_BELOW of the shortest player wearing a crown — a crown is lost only
  // to a snake that grew in the game, not to one that just appeared. A crown is held with a gap (stickyRank), so a player
  // counts as crowned while not clearly overtaken by the third. No crowned players — no limit
  spawnCap() {
    const t = [0, 0, 0]; // the three longest masses
    for (const s of this.snakes) {
      if (!s.alive || s.mass <= t[2]) continue;
      if (s.mass > t[0]) { t[2] = t[1]; t[1] = t[0]; t[0] = s.mass; } else if (s.mass > t[1]) { t[2] = t[1]; t[1] = s.mass; } else t[2] = s.mass;
    }
    let cap = Infinity;
    for (const s of this.snakes) if (s.human && s.alive && !overtakes({ mass: t[2] }, s)) cap = Math.min(cap, s.mass * SPAWN_BELOW);
    return cap;
  }
  // a spot for a bot: the whole body inside the arena, far from players and not across another head.
  // None found — null (the bot spawns later); when the world is created we take the last attempt.
  placeBot(mass, force) {
    const humans = this.humans(), L = bodyLenOf(mass), r = STAGE_R[stageOf(mass)];
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
    const a = rand(0, TAU), d = rand(0, R * 0.3); // last resort: an arc not far from the center
    return { segs: layBody(Math.cos(a) * d, Math.sin(a) * d, a, mass, curl, 0, 0), a };
  }
  spawnBot(initial) {
    const mass = this.botMass(initial);
    // mid-game a bot crawls out of a point — look for a spot as for a little one, there's no need to lay out a long body
    const place = this.placeBot(initial ? mass : START_MASS, initial);
    if (!place) return null;
    const { segs, a } = place;
    // when the world is created bodies lie whole; newcomers mid-game crawl out of a point —
    // so a long body never appears across someone's path
    return this.addSnake(new Snake(this.nextSnakeId++, segs[0].x, segs[0].y, mass,
      this.botSkin(), this.pickName(), false, 0, a, initial ? segs : coilBody(segs[0].x, segs[0].y, mass)));
  }
  // a bot's skin: a different type than the humans'; if there are so many humans that the types run out — at least not a similar one,
  // and if similar ones cover everything — at least not the same one
  botSkin() {
    const near = new Set(), own = this.humanSkins, types = new Set([...own].map((k) => SKINS[k].type));
    for (const k of own) for (const j of SKIN_NEAR[k] || [k]) near.add(j);
    const all = SKINS.map((_, i) => i);
    let pool = all.filter((i) => !types.has(SKINS[i].type));
    if (!pool.length) pool = all.filter((i) => !near.has(i));
    if (!pool.length) pool = all.filter((i) => !own.has(i));
    if (!pool.length) pool = all;
    return pool[randi(0, pool.length - 1)];
  }
  // keep — ids of snakes someone already sees: don't recolor them, so a color doesn't change before someone's eyes
  addHuman({ name, skin, team = 0, mass = START_MASS, inv = 2, keep = null }) {
    if (!this.humanSkins.has(skin)) {
      this.humanSkins.add(skin);
      // bots of a player's type get recolored; if the types ran out (more humans than types) — only similar skins
      const type = (SKINS[skin] || SKINS[0]).type, types = new Set([...this.humanSkins].map((k) => SKINS[k].type));
      const near = new Set(SKIN_NEAR[skin] || [skin]), twin = types.size < TYPES.length ? (k) => SKINS[k].type === type : (k) => near.has(k);
      for (const b of this.snakes) if (!b.human && twin(b.skin) && !(keep && keep.has(b.id))) b.skin = this.botSkin();
    }
    let p = null;
    const mate = team ? this.humans().find((h) => h.team === team) : null;
    if (mate) { // in a team we spawn next to our teammates
      for (let i = 0; i < 25 && !p; i++) {
        const a = Math.random() * TAU, d = rand(250, 500);
        const x = mate.x + Math.cos(a) * d, y = mate.y + Math.sin(a) * d;
        if (x * x + y * y < (R * 0.8) ** 2 && this.isSafe(x, y, 300)) p = { x, y };
      }
    }
    if (!p) p = this.randomSpot(R * 0.7, 550, [], 0);
    // a player (both at the start and after a crash) crawls out of a point instead of appearing all at once
    const s = new Snake(this.nextSnakeId++, p.x, p.y, mass, skin, name, true, team, undefined, coilBody(p.x, p.y, mass));
    s.inv = inv;
    return this.addSnake(s);
  }

  // ---------- remote players (multiplayer without a game server) ----------
  // A player's snake in a room is computed by their own device: the host's world doesn't move, feed
  // or kill it, only places it where it crawled to by itself — bots see its body and crash into it.
  setRemote(s, x, y, a, ta, mass, boost, inv, stage = 0) {
    s.remote = true;
    s.segs[0].x = x; s.segs[0].y = y;
    s.a = a; s.ta = ta; s.mass = mass;
    if (mass > s.maxMass) s.maxMass = mass;
    // the stage comes from the player (never lost during a life), but no higher than the one their length has reached
    setStage(s, Math.max(stageOf(mass), Math.min(stage, stageOf(s.maxMass))));
    growR(s, Math.max(0, this.time - (s.setT ?? this.time))); s.setT = this.time;
    s.isBoosting = boost; s.inv = inv ? 1 : 0;
    followChain(s.segs, spacingOf(mass));
    fitLength(s.segs, countOf(mass));
  }
  // a remote player ate crumbs: remove them from the world (their mass is already their own business)
  eatIds(ids, s) {
    if (!ids.length) return;
    const want = new Set(ids);
    for (const f of this.foods) {
      if (f.dead || !want.has(f.id)) continue;
      f.dead = true;
      if (f.life === 0) this.naturalCount--;
      if (s) s.eaten += f.v;
    }
  }
  // a remote player caught a butterfly: spill its food, event 'fly' — as for a catch in the world
  claimFly(id, s) {
    const i = this.flies.findIndex((f) => (f.id & 0xffff) === id); // over the network a butterfly id is 16 bits
    if (i < 0 || !s || !s.alive) return false;
    this.catchFly(this.flies[i], s);
    this.flies.splice(i, 1);
    return true;
  }

  // ---------- death ----------
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
    let cx = 0, cy = 0;                                      // where to gather: the middle of the remains, not the head
    for (const q of s.segs) { cx += q.x; cy += q.y; }
    this.deaths.push({ id: s.id, x: cx / s.segs.length, y: cy / s.segs.length, v: total, t: this.time });
    this.events.push({ type: 'kill', victim: s, killer: by, vm: s.mass, km: by ? by.mass : 0 });
  }

  // ---------- bot AI ----------
  // On every think a bot decides, in order:
  // 1) threat — another head is about to cross its path: it moves away along that path instead of crashing;
  // 2) hunt — cuts off a target: comes in from the side with a lead, two hunters from different sides, pins it against the wall near the edge,
  //    gives up the chase if it can't catch up;
  // 3) ambush — another head is heading across its body by itself: the bot doesn't turn and stretches its body out, boosting if needed;
  // 4) food — picks a rich spot and sticks to it, gathers to fresh remains from afar, boosts only when it pays off;
  // then it steers around bodies, the edge and other heads with rays.
  // The path toward heading a is checked as an arc — the way the snake will actually crawl, turning at its own turn rate,
  // not as a straight ray: otherwise a sharp turn toward a "free" ray led right into a body in front of its nose.
  // Bodies are looked up in every cell the thickest body can reach, not just one: thick bodies lie
  // with their middle in a neighboring cell, and a single cell missed them. Whose body is in the way — in this.hitO / this.hitK
  // (read right after the call; deep — the most deeply hit segment of the step, otherwise the first one found).
  // blind — a player whose "just laid" tail the bot hasn't noticed yet (see think).
  rayDanger(b, bi, a, look, blind = null, deep = false) {
    this.hitO = null; this.hitK = -1;
    const D = this.D, step = Math.max(16, b.r * 0.9);
    const turn = turnOf(b.r) * D.turn * step / (speedOf(b.mass, b.boost) * D.speed); // how far it manages to turn during one ray step
    const edge = R - b.r - 30, edge2 = edge * edge;
    const { segHead, segNext, segS, segK, snakes } = this;
    const lim = this.maxR + b.r + 8;
    let h = b.a, px = b.x, py = b.y;
    for (let d = step; d <= look; d += step) {
      const dd = angDiff(a, h);
      h += dd > turn ? turn : dd < -turn ? -turn : dd;
      px += Math.cos(h) * step; py += Math.sin(h) * step;
      if (px * px + py * py > edge2) return 1.1 - d / look;
      const cx0 = clamp(((px - lim + GRID_OFF) / CELL) | 0, 0, GRID_N - 1), cx1 = clamp(((px + lim + GRID_OFF) / CELL) | 0, 0, GRID_N - 1);
      const cy0 = clamp(((py - lim + GRID_OFF) / CELL) | 0, 0, GRID_N - 1), cy1 = clamp(((py + lim + GRID_OFF) / CELL) | 0, 0, GRID_N - 1);
      let best = 2; // at the step where the ray hits, remember the most deeply hit segment — the order of the cells doesn't matter
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          for (let it = segHead[cy * GRID_N + cx]; it >= 0; it = segNext[it]) {
            if (segS[it] === bi) continue;
            const o = snakes[segS[it]], k = segK[it];
            if (o === blind && k < o.newK && k >= HEAD_K) continue;
            const q = o.segs[k], dx = q.x - px, dy = q.y - py, rr = o.r + b.r + 8, f = (dx * dx + dy * dy) / (rr * rr);
            if (f < best) { best = f; this.hitO = o; this.hitK = k; if (!deep && f < 1) return 1.1 - d / look; }
          }
        }
      }
      if (best < 1) return 1.1 - d / look;
      this.hitO = null; this.hitK = -1;
    }
    return 0;
  }
  // neighbors' heads within radius rad, with their velocity — to avoid head-on collisions
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
  // how angry the bots are at a player: the higher they are on the leaderboard, the more eagerly they're hunted and the more hunters at once
  heatOf(s) {
    const D = this.D, [p0, p1, p2] = D.humanAggr, [n0, n1, n2] = D.maxHunters, rk = s.rank || 99;
    if (rk > RANK_HOT) return { p: p0, n: n0 };
    const t = (RANK_HOT - rk) / (RANK_HOT - 1); // 0 — at RANK_HOT, 1 — in first place
    return { p: p1 + (p2 - p1) * t, n: Math.round(n1 + (n2 - n1) * t) };
  }
  // whom to cut off: the nearest snake within hunting range, not much shorter than itself; a player gets no more hunters than heatOf allows
  pickTarget(b) {
    const D = this.D;
    let best = null, bs = Infinity;
    const feud = Math.random() < D.feud;
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
        w = s.mass > b.mass * 4 ? 1.6 : 1; // bots go after a giant reluctantly, but they do
      }
      if (d * w < bs) { bs = d * w; best = s; }
    }
    return best;
  }
  // the most urgent threat: whose head will cross the bot's path before the bot does, while the body is still lying there
  // when the bot arrives. Not every bot notices it in time: the chance is the level's wary times the bot's caution
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
  // ambush: whose head is heading across the bot's body by itself — the bot passes the point first, and its body still lies there when the head arrives
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
      // on a bot — rarely (like hunting each other), on a player — by the level's aggressiveness, the player's place and the bot's character
      if (!this.decide(b, 'm' + o.id, h ? D.aggr * b.pers * Math.min(1.5, h.p / Math.max(0.1, D.humanAggr[1])) : D.feud * 3)) continue;
      // an ambush counts as a hunt: a player gets no more hunters than heatOf allows
      if (!mine) this.hunted.set(s.id, (this.hunted.get(s.id) || 0) + 1);
      b.ambTarget = s.id; b.ambUntil = this.time + 0.6;
      return { o, t1, t2 };
    }
    return null;
  }
  // a bot's decision about an encounter is made once and kept for 4 s — otherwise it would change its mind on every think
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
    if (mate) { b.hside = -mate; return; } // the second hunter comes from the other side
    const pc = Math.cos(P.a), ps = Math.sin(P.a);
    if (this.D.edgeKills && P.x * P.x + P.y * P.y > (R * 0.72) ** 2) {
      b.hside = ps * P.x - pc * P.y >= 0 ? 1 : -1;     // near the edge — from the center side: the target has nowhere to turn but the wall
    } else {
      b.hside = (P.x - b.x) * ps - (P.y - b.y) * pc >= 0 ? 1 : -1; // from the side where the bot already is
    }
    this.huntSide.set(P.id, b.hside);
  }
  stopHunt(b) {
    if (this.huntSide.get(b.huntTarget) === b.hside) this.huntSide.delete(b.huntTarget);
    b.hunt = 0; b.huntCd = rand(0.5, 1.5) * this.D.rest / b.pers;
  }

  // food: grid cells with food, not single crumbs. The goal is kept until a new one is clearly better
  forage(b, heads) {
    const D = this.D, hx = b.x, hy = b.y;
    const view = D.look * 1.4 + radiusOf(b.mass) * 4, view2 = view * view; // by mass, not by stage
    const cr = Math.ceil(view / CELL);
    const c0 = this.cellOf(hx, hy), cx0 = c0 % GRID_N, cy0 = (c0 / GRID_N) | 0;
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    // don't graze near a big foreign head
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
    // a well-fed butterfly nearby — give chase; it's hard to catch, so it's valued below food
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
    // boost toward rich food if a rival is near and the food pays for the boost
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
    const look0 = D.look * (1 + b.r / 50);
    let desired = null;
    b.boost = false;
    const heads = this.nearHeads(b, Math.max(look0 * 1.4, 600));
    const vb = speedOf(b.mass, false) * D.speed;
    // lapse: in a crowd (other heads nearby or a chase; with slipAny — anywhere) a bot sometimes gets distracted — D.slip times a minute
    if (this.time >= b.slipT && (heads.length || b.hunt > 0 || D.slipAny) && Math.random() < D.slip / 60 * D.react) { // once per D.react s — the chance per think
      b.slipT = this.time + rand(SLIP_T[0], SLIP_T[1]);
    }
    if (hx * hx + hy * hy > (R * 0.85) ** 2) b.slipT = 0; // nobody lapses at the arena edge: crashing into the wall isn't a collision, it's just silly
    const slip = this.time < b.slipT;

    let P = null;
    if (b.hunt > 0) {
      P = this.byId.get(b.huntTarget) || null;
      // the target is gone, went far away or became much shorter than the bot — give up
      if (P && (!P.alive || P.inv > 0 || !preyFor(b, P) || Math.hypot(P.x - hx, P.y - hy) > D.huntRange * 1.8)) P = null;
      // pointless chase: no catching up within 3 s — give up
      if (P && this.time - b.huntT0 > 3) {
        const along = (hx - P.x) * Math.cos(P.a) + (hy - P.y) * Math.sin(P.a);
        if (along < -300) P = null;
      }
      if (!P) this.stopHunt(b);
    }

    // 0) cutting off: if a player's tail has just been laid across the planned path right under its nose, the bot notices
    //    with a delay — for D.fresh s (and until the next think) the fresh tail is like empty space to it. The head and neck,
    //    the old body and other snakes it always sees. Doesn't happen if the bot is hunting this player or the player is coming head-on
    let blind = null;
    // Decided at first sight: this player's fresh tail, noticed earlier (from afar), isn't "missed" anymore
    const dg0 = D.fresh > 0 && heads.some((o) => o.s.human) ? this.rayDanger(b, bi, b.ta, look0, null, true) : 0;
    const o0 = dg0 > 0 ? this.hitO : null;
    const busy = b.surpT > this.time && b.surpId !== (o0 && o0.id); // hasn't noticed another player's cut-off yet
    if (o0 && o0.human && this.hitK < o0.newK && this.hitK >= HEAD_K && !busy) { // the head doesn't count — look at the tail
      const q = o0.segs[this.hitK], gap = Math.hypot(q.x - hx, q.y - hy) - o0.r - b.r;
      // "already seen": a window longer than the longest blindness plus a margin for the think — otherwise blindness would extend itself
      const seen = b.surpId === o0.id && this.time - b.surpLast < 1.3 * (D.fresh + D.react) + 0.2;
      if (!seen) {
        const sudden = gap < D.cutNear && o0 !== P &&
          Math.cos(angDiff(o0.a, Math.atan2(hy - o0.y, hx - o0.x))) < 0.7;
        b.surpId = o0.id; b.surpT = sudden ? this.time + D.fresh * rand(0.7, 1.3) : 0;
      }
      b.surpLast = this.time;
    }
    if (b.surpId && this.time < b.surpT) blind = this.byId.get(b.surpId) || null;

    // 1) threat — the most important, except for its own target: it heads to cut that one off on purpose
    const th = slip ? null : this.threatOf(b, heads, vb);
    if (th && (!P || th.id !== P.id)) {
      const side = Math.cos(th.s.a) * (hy - th.y) - Math.sin(th.s.a) * (hx - th.x) >= 0 ? 1 : -1;
      const along = th.s.a + side * 0.6, back = th.s.a + Math.PI - side * 0.6; // along the other snake's path or away from it
      desired = Math.abs(angDiff(along, b.a)) < Math.abs(angDiff(back, b.a)) ? along : back;
      b.goalC = -1;
    }

    if (desired === null && !P && b.huntCd <= 0 && b.mass > 60 && Math.random() < D.aggr * b.pers * 0.5) {
      P = this.pickTarget(b);
      if (P) this.startHunt(b, P);
      else b.huntCd = rand(0.5, 1.5);
    }

    if (blind && P === blind) blind = null; // a hunter watches its own target with both eyes
    if (desired === null && P) {
      // 2) hunt
      const dx = P.x - hx, dy = P.y - hy, dist = Math.hypot(dx, dy);
      const pc = Math.cos(P.a), ps = Math.sin(P.a);
      const along = -(dx * pc + dy * ps);     // > 0 — the bot is ahead of the target's head
      const lat = dx * ps - dy * pc;          // which side of the target the bot is on
      const side = b.hside || (lat >= 0 ? 1 : -1);
      const canBoost = b.mass > 60 && Math.random() < D.boost;
      if (along < 40) {
        // catch up from the side with a lead and overtake
        const gap = b.r + P.r + 50, lead = clamp(dist * 0.6, 90, 320);
        desired = Math.atan2(P.y + ps * lead + pc * side * gap - hy, P.x + pc * lead - ps * side * gap - hx);
        if (canBoost && along > -380 && Math.abs(lat) < 450) b.boost = true; // boost only when already close
      } else {
        // overtook — turn across the target's path
        const lead = 50 + along * 0.4;
        desired = Math.atan2(P.y + ps * lead - hy, P.x + pc * lead - hx);
        if (canBoost && Math.abs(lat) < 380) b.boost = true;
      }
    }

    if (desired === null) {
      // 3) ambush
      const am = this.ambushOf(b, heads, vb);
      if (am) {
        desired = b.a;
        if (am.t2 - am.t1 < 0.35 && b.mass > 60 && Math.random() < D.boost) b.boost = true;
      }
    }

    if (desired === null) {
      // 4) food: fresh remains, a feast, a rich spot nearby.
      // A well-fed bot (longer than the level's giantMin) doesn't chase food — it crawls about leisurely and eats whatever comes
      // its way. Otherwise giants, who no longer crash by themselves, would grow forever
      const F = this.feast, full = b.mass > D.giantMin;
      let sv = null;
      if (!full) for (const e of this.deaths) {
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
        desired = full ? ((b.goalC = -1), (b.goalV = 0), null) : this.forage(b, heads);
        // to the feast — if there's no rich food under its nose
        if (F && b.goFeast && !full && Math.hypot(F.x - hx, F.y - hy) > 300 && (desired === null || b.goalV < 3)) {
          desired = Math.atan2(F.y - hy, F.x - hx); b.boost = false;
        } else if (desired === null) {
          // leisurely, toward the center; a well-fed one wanders wherever, away from the edge into the arena, otherwise giants would crowd the center
          const pull = full ? (hx * hx + hy * hy > (R * 0.8) ** 2 ? 0.06 : 0) : 0.02;
          b.wander += rand(-0.25, 0.25) + angDiff(Math.atan2(-hy, -hx), b.wander) * pull;
          desired = b.wander;
        }
      }
      if (hx * hx + hy * hy > (R * 0.88) ** 2) desired = Math.atan2(-hy, -hx) + rand(-0.5, 0.5);
    }

    // 5) avoiding obstacles
    const look = look0 * (b.boost ? 1.4 : 1) * (slip ? SLIP_LOOK : 1);
    const vbb = speedOf(b.mass, b.boost) * D.speed;
    const tFar = 0.46 + D.foresee * clamp((b.r - 30) / 20, 0, 1); // a giant looks farther ahead: it takes longer to turn away
    const prey = P ? P.id : 0;                                     // …but not from its own target: it heads to cut that one off
    const near = slip ? [] : heads.filter((o) => (o.x - hx) ** 2 + (o.y - hy) ** 2 < look * look); // distant heads won't arrive within tFar
    let bestA = b.a, bestScore = -1e9, bestDg = 0;
    const dOff = clamp(angDiff(desired, b.a), -2.1, 2.1);
    for (let i = -1; i < OFFS.length; i++) {
      const off = i < 0 ? dOff : OFFS[i];
      const a = b.a + off;
      const ub = Math.cos(angDiff(desired, a)) - Math.abs(off) * 0.05; // the heading can't get better than this even without dangers
      if (ub <= bestScore) continue;                                   // — so the rays can be skipped
      const dg = this.rayDanger(b, bi, a, look, blind);
      // other heads: where we and they will be in 0.15–0.45 s (a big bot on medium and hard — up to 1.35 s)
      let hd = 0;
      for (const o of near) {
        const tMax = o.id === prey ? 0.46 : tFar;
        for (let t = 0.15; t <= tMax; t += 0.15) {
          const dx = b.x + Math.cos(a) * vbb * t - (o.x + o.vx * t), dy = b.y + Math.sin(a) * vbb * t - (o.y + o.vy * t);
          const rr = b.r + o.r + 45, d2 = dx * dx + dy * dy;
          if (d2 < rr * rr) { hd = Math.max(hd, 1.2 - Math.min(t, 0.8) - Math.sqrt(d2) / rr * 0.4); }
        }
      }
      const sc = ub - Math.max(dg, hd) * 4;
      if (sc > bestScore) { bestScore = sc; bestA = a; bestDg = dg; }
    }
    if (bestDg > 0.3) b.boost = false;                        // it's crowded ahead — don't speed up: you can't turn away at speed
    b.ta = bestA;
  }

  // ---------- movement ----------
  moveSnake(s, dt) {
    const D = this.D;
    growStage(s, dt);
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
        // while the tail is right at the head (the snake is still crawling out of a point), the drop is skipped — otherwise it would eat it at once
        if ((t.x - h.x) ** 2 + (t.y - h.y) ** 2 > (s.r * 2 + 80) ** 2) {
          this.addFood(t.x + rand(-4, 4), t.y + rand(-4, 4), s.dropAcc * BOOST_DROP, segColor(s.skin, k), 30);
        }
        s.dropAcc = 0;
      }
    }

    const hd = Math.hypot(h.x, h.y);
    if (hd > R - s.r) {
      if ((s.human && !D.edgeKills) || s.inv > 0) { // soft edge: pushes back toward the center
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

  // ---------- step ----------
  step(dt) {
    this.time += dt;
    const snakes = this.snakes;
    for (const s of snakes) if (s.alive && !s.remote) this.moveSnake(s, dt);
    this.buildGrids();
    const { segHead, segNext, segS, segK } = this;

    // players' leaderboard places: the bots' anger depends on them (heatOf)
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
    // the crown passes like on the leaderboard (stickyRank): to the longest, once it clearly overtakes the holder.
    // A bot that just got it comes out of a lapse and thinks at once
    let top = null;
    for (const s of snakes) if (s.alive && (!top || s.mass > top.mass)) top = s;
    const was = this.crowned;
    if (!was || !was.alive || !snakes.includes(was) || (top && top !== was && overtakes(top, was))) this.crowned = top;
    const crowned = this.crowned;
    if (crowned && crowned !== was && !crowned.human) { crowned.slipT = 0; crowned.thinkT = 0; }
    for (let i = 0; i < snakes.length; i++) {
      const b = snakes[i];
      if (b.human || !b.alive) continue;
      if (b.hunt > 0) { b.hunt -= dt; if (b.hunt <= 0) this.stopHunt(b); }
      b.thinkT -= dt;
      // a bot that lapsed at the arena edge comes to at once: crashing into the wall isn't a collision, it's just silly
      if (b.slipT > this.time && b.x * b.x + b.y * b.y > (R * 0.85) ** 2) { b.slipT = 0; b.thinkT = 0; }
      if (b.thinkT <= 0) {
        const D = this.D;
        if (b === crowned) { this.D = this.carefulD; b.slipT = 0; }
        try { this.think(b, i); b.thinkT = this.D.react * rand(0.7, 1.3) * (this.time < b.slipT ? SLIP_REACT : 1); }
        finally { this.D = D; }
      }
    }

    // head into another body (the grid holds only snakes without invulnerability — maxR from buildGrids)
    const maxR = this.maxR;
    for (let si = 0; si < snakes.length; si++) {
      const s = snakes[si];
      if (!s.alive || s.inv > 0 || s.remote) continue; // a remote player decides about their own crash
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
            if (s.team && o.team === s.team) continue; // teammates don't get in the way
            const q = o.segs[segK[it]];
            const dx = q.x - h.x, dy = q.y - h.y, rr = s.r * 0.55 + o.r * 0.85;
            if (dx * dx + dy * dy < rr * rr) { hit = o; break; }
          }
        }
      }
      if (hit) this.pending.push([s, hit]);
    }

    // food (a remote player eats locally and reports what they ate — eatIds)
    for (const s of snakes) {
      if (!s.alive || s.remote) continue;
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
              const k = Math.min(1, dt * 7); // pull toward the head
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

    // feast: from time to time a heap of golden food appears somewhere in the arena
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
    // keep the required number of bots
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
