// Sound sets to pick from in the pause menu ("Sounds"): food (10, recorded crunches), boost (9), crash (7), molt (7); the choice is save.snd.
// The synthesis is deliberately lower and softer: fundamentals at 150–800 Hz (the phone speaker barely plays anything lower),
// overtones above ~1.5 kHz only quietly; sawtooth and square waves are tamed with a filter (lp).
// a — building blocks from client.js: a.n(frequency, {...}) — a note, a.h({...}) — a rustle; W — how long the molt glow runs.

export const semi = (f, n) => f * Math.pow(2, n / 12);
const PENTA = [0, 2, 4, 7, 9, 12];

// food — real recorded crunches (CC0, OpenGameArt; sources in the README): bite slices in public/sfx/eat.wav.
// Each crumb is a random bite from the set with pitch spread `rate` (a bit higher in a row — see playBite). sample — one set or several.
export const EAT_SLICES = {"cucumber":[[0.0,0.1995],[0.2095,0.1995],[0.419,0.1995],[0.6286,0.1995],[0.8381,0.1995],[1.0476,0.1995]],"toast":[[1.2571,0.0748],[1.342,0.1247],[1.4766,0.0848],[1.5714,0.1447],[1.7261,0.1696],[1.9057,0.1796],[2.0952,0.0848],[2.19,0.1546],[2.3546,0.0848]],"apple":[[2.4494,0.0599],[2.5193,0.2195],[2.7488,0.2195]],"crisp":[[2.9782,0.1995],[3.1878,0.1995],[3.3973,0.1995],[3.6068,0.1995],[3.8163,0.1995],[4.0259,0.1447],[4.1805,0.1995],[4.39,0.1497]],"bite":[[4.5497,0.2395]],"rabbit":[[4.7991,0.0848],[4.8939,0.0948],[4.9986,0.1297],[5.1383,0.1197],[5.268,0.1098],[5.3878,0.0748],[5.4726,0.1297],[5.6122,0.1048]]};
export const EAT = [
  { id: 'cucumber', sample: 'cucumber', rate: [0.92, 1.08] },
  { id: 'toast', sample: 'toast', rate: [0.9, 1.1] },
  { id: 'apple', sample: 'apple', rate: [0.9, 1.08] },
  { id: 'crisp', sample: 'crisp', rate: [0.92, 1.08] },
  { id: 'chomp', sample: 'bite', rate: [0.85, 1.15] },
  { id: 'bunny', sample: 'rabbit', rate: [0.9, 1.1] },
  { id: 'crouton', sample: 'toast', rate: [0.76, 0.86] },
  { id: 'carrot', sample: ['cucumber', 'apple'], rate: [0.82, 0.92] },
  { id: 'munch', sample: 'crisp', rate: [0.95, 1.1], twice: 0.085 },
  // a single tonal one for melody lovers: f is a note of the scale, rising in a row
  { id: 'yum', play: (a, f) => { a.n(f, { to: f * 1.3, dur: 0.09, vol: 0.22, a: 0.006 }); a.n(f * 0.75, { type: 'triangle', dur: 0.06, vol: 0.08 }); } },
];

// boost: start — the click when the lightning bolt is pressed; loop — the sound while it's held: nodes in a.ctx into a.out
// (volume and the release fade live in client.js); return the sources that need stopping.
// a.noise — a 1 s white-noise buffer.
// looping noise, already started at a random offset (each layer and each boost gets its own)
function noiseSrc(a) { const s = a.ctx.createBufferSource(); s.buffer = a.noise; s.loop = true; s.start(0, Math.random() * 0.9); return s; }
function filt(a, type, f, q = 1) { const x = a.ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
function gain(a, v) { const g = a.ctx.createGain(); g.gain.value = v; return g; }
function osc(a, type, f) { const o = a.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
// volume tremor: an LFO of frequency hz, depth (0…1) — on node g
function tremolo(a, g, hz, depth) { const l = osc(a, 'sine', hz), d = gain(a, depth); l.connect(d); d.connect(g.gain); return l; }
let bubbles = null;
function bubbleBuf(a) { // 2 s of bubbles: short upward "bloops" at random intervals
  if (bubbles && bubbles.sampleRate === a.ctx.sampleRate) return bubbles;
  const sr = a.ctx.sampleRate, n = sr * 2; bubbles = a.ctx.createBuffer(1, n, sr);
  const d = bubbles.getChannelData(0);
  for (let t = 0.01; t < 1.95;) {
    const f0 = 220 + Math.random() * 260, len = 0.025 + Math.random() * 0.02, s0 = Math.floor(t * sr), m = Math.floor(len * sr), amp = 0.4 + Math.random() * 0.5;
    let ph = 0;
    for (let i = 0; i < m && s0 + i < n; i++) { const k = i / m; ph += 2 * Math.PI * f0 * (1 + 1.6 * k) / sr; d[s0 + i] += Math.sin(ph) * amp * Math.sin(Math.PI * k) * (1 - k); }
    t += 0.05 + Math.random() * 0.07;
  }
  return bubbles;
}
const swoosh = (a, f0 = 400, f1 = 1400, vol = 0.25) => a.h({ type: 'bandpass', f: f0, f1, q: 1.2, vol, dur: 0.16, a: 0.04 });
export const BOOST = [
  { id: 'wind', start: (a) => swoosh(a), loop: (a) => {
    const s = noiseSrc(a), f = filt(a, 'bandpass', 400, 1.4), t = a.ctx.currentTime;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(1600, t + 1.5);
    s.connect(f); f.connect(a.out); return [s];
  } },
  { id: 'rocket', start: (a) => a.h({ type: 'lowpass', f: 1200, f1: 300, q: 0.7, vol: 0.4, dur: 0.25, a: 0.01 }), loop: (a) => {
    const s = noiseSrc(a), f = filt(a, 'lowpass', 500, 0.8), g = gain(a, 2.2), t = a.ctx.currentTime;
    f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(900, t + 1.5);
    const r = noiseSrc(a), rf = filt(a, 'bandpass', 160, 2), rg = gain(a, 1.6); // rumble
    const l = tremolo(a, g, 11, 0.6); // crackle
    s.connect(f); f.connect(g); g.connect(a.out); r.connect(rf); rf.connect(rg); rg.connect(a.out);
    l.start(); return [s, r, l];
  } },
  { id: 'turbine', start: (a) => a.n(300, { to: 700, dur: 0.18, vol: 0.12, a: 0.03 }), loop: (a) => {
    const s = noiseSrc(a), f = filt(a, 'bandpass', 900, 0.8), o = osc(a, 'sine', 380), og = gain(a, 0.5), t = a.ctx.currentTime;
    f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(1500, t + 1.5);
    o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(820, t + 1.8);
    s.connect(f); f.connect(a.out); o.connect(og); og.connect(a.out); o.start(); return [s, o];
  } },
  { id: 'motor', start: (a) => a.n(80, { type: 'sawtooth', to: 150, lp: 900, dur: 0.2, vol: 0.18, a: 0.01 }), loop: (a) => {
    const o1 = osc(a, 'sawtooth', 95), o2 = osc(a, 'sawtooth', 96.5), f = filt(a, 'lowpass', 750, 1.5), g = gain(a, 0.9), t = a.ctx.currentTime;
    for (const o of [o1, o2]) { o.frequency.setValueAtTime(o.frequency.value, t); o.frequency.exponentialRampToValueAtTime(o.frequency.value * 1.6, t + 1.6); o.connect(f); }
    const l = tremolo(a, g, 28, 0.35);
    f.connect(g); g.connect(a.out); o1.start(); o2.start(); l.start(); return [o1, o2, l];
  } },
  { id: 'bubbles', start: (a) => a.n(250, { to: 650, dur: 0.06, vol: 0.18 }), loop: (a) => {
    const s = a.ctx.createBufferSource(); s.buffer = bubbleBuf(a); s.loop = true;
    const g = gain(a, 3.5); s.connect(g); g.connect(a.out); s.start(); return [s];
  } },
  { id: 'hiss', start: (a) => a.h({ type: 'bandpass', f: 1800, q: 1, vol: 0.2, dur: 0.12, a: 0.02 }), loop: (a) => {
    const s = noiseSrc(a), f = filt(a, 'bandpass', 1900, 1.1), g = gain(a, 1);
    const l = tremolo(a, g, 3.5, 0.25);
    s.connect(f); f.connect(g); g.connect(a.out); l.start(); return [s, l];
  } },
  { id: 'electro', start: (a) => a.n(600, { type: 'sawtooth', lp: 1500, to: 160, dur: 0.12, vol: 0.12 }), loop: (a) => {
    const o = osc(a, 'square', 110), f = filt(a, 'bandpass', 800, 2), g = gain(a, 0.8), t = a.ctx.currentTime;
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(165, t + 1.5);
    const l = tremolo(a, g, 18, 0.5);
    o.connect(f); f.connect(g); g.connect(a.out); o.start(); l.start(); return [o, l];
  } },
  { id: 'space', start: (a) => a.n(260, { to: 780, dur: 0.22, vol: 0.12, a: 0.05, wet: 0.4 }), loop: (a) => {
    const o1 = osc(a, 'sine', 220), o2 = osc(a, 'sine', 277), g = gain(a, 0.45), t = a.ctx.currentTime;
    const v = osc(a, 'sine', 5), vg = gain(a, 6); v.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune);
    for (const o of [o1, o2]) { o.frequency.setValueAtTime(o.frequency.value, t); o.frequency.exponentialRampToValueAtTime(o.frequency.value * 1.5, t + 1.5); o.connect(g); }
    const s = noiseSrc(a), f = filt(a, 'bandpass', 700, 1.5), ng = gain(a, 0.5); s.connect(f); f.connect(ng); ng.connect(a.out);
    g.connect(a.out); o1.start(); o2.start(); v.start(); return [o1, o2, v, s];
  } },
  { id: 'click', start: (a) => swoosh(a, 300, 1000, 0.3), loop: null },
];

// your own snake crashed
export const CRASH = [
  { id: 'boom', play: (a) => {
    a.n(240, { type: 'triangle', to: 150, dur: 0.35, vol: 0.4, a: 0.003 });
    a.h({ type: 'lowpass', f: 900, f1: 150, q: 0.7, vol: 0.4, dur: 0.4 });
  } },
  { id: 'uhoh', play: (a) => {
    [[392, 0], [370, 0.17], [349, 0.34]].forEach(([f, d]) => a.n(f, { type: 'triangle', vol: 0.22, dur: 0.16, delay: d, a: 0.01 }));
    a.n(330, { type: 'triangle', to: 247, vol: 0.22, dur: 0.6, delay: 0.51, a: 0.02, vib: [9, 10] });
  } },
  { id: 'splat', play: (a) => {
    a.h({ type: 'lowpass', f: 1200, f1: 200, q: 1, vol: 0.5, dur: 0.2, a: 0.001 });
    a.n(300, { to: 150, dur: 0.25, vol: 0.25 });
  } },
  { id: 'beads', play: (a) => {
    a.n(260, { type: 'triangle', to: 150, vol: 0.32, dur: 0.28, a: 0.003 });
    a.h({ type: 'lowpass', f: 1000, f1: 200, q: 0.7, vol: 0.3, dur: 0.3 });
    [784, 698, 880, 622, 740, 587, 659, 523].forEach((f, i) => a.n(f, { vol: 0.11 * (1 - i / 10), dur: 0.06, delay: 0.12 + i * 0.055 + Math.random() * 0.02, wet: 0.3 }));
  } },
  { id: 'boing', play: (a) => a.n(330, { to: 160, dur: 0.6, vol: 0.25, vib: [14, 40] }) },
  { id: 'gong', play: (a) => {
    a.n(247, { dur: 1.4, vol: 0.25, a: 0.005, wet: 0.4 }); a.n(247 * 1.5, { dur: 1.1, vol: 0.09 }); a.n(247 * 2.76, { dur: 0.9, vol: 0.07 });
    a.h({ type: 'lowpass', f: 600, q: 0.7, vol: 0.2, dur: 0.08 });
  } },
  { id: 'deflate', play: (a) => a.n(520, { type: 'sawtooth', lp: 1200, to: 170, dur: 0.8, vol: 0.13, vib: [22, 25] }) },
];

// your own molt: st — the new stage (1…5), each one a tone higher; for W s the glow runs to the head, then the swell
export const MOLT = [
  { id: 'magic', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2);
    a.h({ f: 300, f1: 1800, q: 2, vol: 0.12, dur: W + 0.05, a: W * 0.8 });
    a.n(150 * k, { to: 600 * k, dur: W, vol: 0.1, a: W * 0.7, detune: 8 }); a.n(150 * k, { to: 600 * k, dur: W, vol: 0.1, a: W * 0.7, detune: -8 });
    [262, 330, 392, 494].forEach((f) => a.n(f * k, { vol: 0.13, dur: 1.1, delay: W, a: 0.003, wet: 0.5 }));
    for (let i = 0; i < 8; i++) a.n(semi(784 * k, PENTA[(Math.random() * PENTA.length) | 0]), { vol: 0.04, dur: 0.12, delay: W + 0.1 + i * 0.08 + Math.random() * 0.04, wet: 0.6 });
  } },
  { id: 'fanfare', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2), t = { type: 'sawtooth', lp: 1800, a: 0.01 };
    a.n(196 * k, { ...t, vol: 0.15, dur: 0.14, delay: Math.max(0, W - 0.2) }); a.n(196 * k, { ...t, vol: 0.15, dur: 0.14, delay: Math.max(0, W - 0.08) });
    [262, 330, 392, 523].forEach((f, i) => a.n(f * k, { ...t, a: 0.02, vol: 0.12, dur: 0.85, delay: W + 0.04, detune: i * 3 - 4, wet: 0.35 }));
  } },
  { id: 'cascade', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2);
    let d = 0;
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => { a.n(semi(196 * k, n), { type: 'triangle', vol: 0.17, dur: 0.14, delay: d, a: 0.003 }); d += 0.065 - i * 0.006; });
    [392, 494, 587, 784].forEach((f, i) => a.n(f * k, { vol: 0.13, dur: 0.7, delay: W + 0.02 + i * 0.015, wet: 0.5 }));
  } },
  { id: 'organ', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2);
    [262, 330, 392, 523].forEach((f) => a.n(f * k, { type: 'triangle', vol: 0.1, a: W + 0.05, dur: W + 1.1, wet: 0.4 }));
    a.n(196 * k, { type: 'sawtooth', lp: 700, vol: 0.08, a: W, dur: W + 1.1 });
  } },
  { id: 'harp', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2), steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    steps.forEach((n, i) => a.n(semi(262 * k, n), { type: 'triangle', vol: 0.13, a: 0.002, dur: 0.35, delay: i * (W / steps.length), wet: 0.3 }));
    [262, 392, 523].forEach((f) => a.n(f * k, { type: 'triangle', vol: 0.11, a: 0.002, dur: 0.9, delay: W + 0.03, wet: 0.5 }));
  } },
  { id: 'choir', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2);
    [262, 330, 392].forEach((f) => [-10, 10].forEach((dt) => a.n(f * k, { type: 'sawtooth', lp: 900, vol: 0.06, a: W, dur: W + 1.2, detune: dt, wet: 0.5, vib: [5, 3] })));
  } },
  { id: 'liftoff', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2);
    a.h({ type: 'lowpass', f: 300, f1: 2500, q: 1.5, vol: 0.18, dur: W, a: W * 0.9 });
    a.n(160 * k, { to: 520 * k, dur: W, vol: 0.12, a: W * 0.8 });
    a.h({ f: 600, q: 1, vol: 0.3, dur: 0.06, delay: W });
    [392, 494, 587].forEach((f, i) => a.n(f * k, { type: 'triangle', vol: 0.14, dur: 0.6, delay: W + 0.04 + i * 0.05, wet: 0.4 }));
  } },
];
