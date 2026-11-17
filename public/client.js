// Client: rendering, controls, menus; the solo game computes its world itself. In a shared game the world is computed by
// the host's browser (room.js), while each player computes their own snake locally; players connect directly (rtc.js).
import {
  World, SKINS, TYPES, SKINS_OF, PAL, foodLookOf, GOLD, DIFF, R, TAU, START_MASS, SNAKES_N, FOOD_N, VERSION, segColor, STAGE_R, growR, setStage, MOLT_WAIT,
  radiusOf, spacingOf, countOf, bodyLenOf, foodRadiusOf, followChain, fitLength, clamp, angDiff, keepMass,
  FLY_MAX, flyK, flyScale, flyRadius, flyEase, MIN_BOOST_MASS, Snake, safeCourse,
} from './core.js';
import { Room, runRoom, encodeSelf, FR, FLR, readFood } from './room.js';
import { host, join, loopback } from './rtc.js';
import { BACKDROPS, makeBackdrop, drawBackdrop } from './backdrop.js';
import { EAT, EAT_SLICES, BOOST, CRASH, MOLT, semi } from './sounds.js';
import { t, has } from './i18n.js';

const BOT_NAMES = t('bots');
const skinName = (sk) => t('skin.' + sk.id);
const typeName = (ti) => t('type.' + TYPES[ti].id);

const TICK_MS = 25;        // room: 40 steps and snapshots per second
const INTERP_MS = 70;      // other snakes are drawn a couple of snapshots behind — this keeps motion smooth and hides a lost snapshot
const SELF_MS = 25;        // how often we tell the host where our snake is
const JOY_R = 44;          // joystick radius: the smaller it is, the shorter the finger movement for a U-turn

// ---------- icons (Material Icons, Apache 2.0) ----------
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
  vibration: '<path d="M0 15h2V9H0v6zm3 2h2V7H3v10zm19-8v6h2V9h-2zm-3 8h2V7h-2v10zM16.5 3h-9C6.67 3 6 3.67 6 4.5v15c0 .83.67 1.5 1.5 1.5h9c.83 0 1.5-.67 1.5-1.5v-15c0-.83-.67-1.5-1.5-1.5zM16 19H8V5h8v14z"/>',
  help: '<path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>',
  home: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
  ruler: '<path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h2v4h2V8h2v4h2V8h2v4h2V8h2v4h2V8h2v8z"/>',
  music: '<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>',
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

// ---------- save data ----------
// xp — accumulated stars (the key name is left over from levels)
// first-launch volume: half the slider (gain is squared, so about -12 dB) — full volume through the compressor is harshly loud
const VOL_DEF = 0.5;
const save = { best: { easy: 0, medium: 0, hard: 0 }, name: '', skin: 0, sound: true, vol: VOL_DEF, haptic: true, xp: 0, diff: 'easy', hinted: false,
  stats: { games: 0, kills: 0, eaten: 0, best: 0 } };
try { Object.assign(save, JSON.parse(localStorage.getItem('zmeigrad') || '{}')); } catch { /* private mode */ }
delete save.daily; // daily tasks were removed
if (!SKINS[save.skin]) save.skin = 0;
if (!DIFF[save.diff]) save.diff = 'easy';
if (!(save.vol >= 0 && save.vol <= 1)) save.vol = VOL_DEF;
// up to 0.23 the default was 100% and it was saved as is: lower an untouched full volume once (volV marks it as done)
if (save.volV !== 1) { if (save.vol === 1) save.vol = VOL_DEF; save.volV = 1; }
// chosen food, crash and molt sounds — indices into the sets in sounds.js (picked in the pause menu, "Sounds")
if (!save.snd || typeof save.snd !== 'object') save.snd = {};
// in 0.21.0 food sounds were synthesized (0 — "Yum", the rest sounded "pixelated" and were dropped): keep "Yum", move the others to the first recording
if (save.snd.v !== 2) { if ('eat' in save.snd) save.snd.eat = Number(save.snd.eat) === 0 ? EAT.findIndex((e) => e.play) : 0; save.snd.v = 2; }
for (const [k, set] of [['eat', EAT], ['boost', BOOST], ['crash', CRASH], ['molt', MOLT]]) { const i = Number(save.snd[k]); save.snd[k] = Number.isInteger(i) && set[i] ? i : 0; }
// boost button: size and position (fractions of the screen, separately for portrait and landscape) — the player sets them in the pause menu
if (!save.fab || typeof save.fab !== 'object') save.fab = {};
const persist = () => { try { localStorage.setItem('zmeigrad', JSON.stringify(save)); } catch { /* nothing to do */ } };
const myName = () => save.name || t('player');
const soloName = () => t('you'); // playing alone needs no name
// session token: on reconnect the room hands back the same snake instead of creating a second one
const TOKEN = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).slice(0, 40);
const hello = (o) => ({ ...o, name: myName(), skin: save.skin, token: TOKEN, v: VERSION });
// a separate host token for the site: TOKEN goes to other rooms' hosts, and they must not be able to take over our room's code
const HOST_TOKEN = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).slice(0, 40);

// ---------- sound (synthesized; recordings only for eating) ----------
// iPhone: sound turns on only from a "real" gesture (touch released, click, key), not from pointerdown;
// after minimizing or a phone call the context becomes 'interrupted' and doesn't wake up by itself. Web Audio obeys
// the silent mode switch on the side — by design.
let actx = null, bus = null, lastEatSound = 0, eatStep = 0; // bus — the common input for all sounds: volume and compressor
let audioStuck = 0, resumeBusy = false; // since when gestures fail to wake the context; whether we're waiting for resume() to answer
// the context has been in the background or dropped out of 'running': on iPhone such a context may report 'running' and stay silent —
// swap in a new one on the very first gesture
let audioStale = false;
function newAudio() {
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; return; }
  const ctx = actx; let ran = ctx.state === 'running'; // in a gesture it can be 'running' right away, without an event
  ctx.onstatechange = () => {
    if (ctx.state === 'running') ran = true;
    else if (ran && ctx === actx && ctx.state !== 'closed') audioStale = true;
  };
  try { // compressor: sounds get louder (the phone speaker is quiet) and overlapping ones don't distort
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
    bus = actx.createGain(); bus.gain.value = 1;
    bus.connect(comp); comp.connect(actx.destination);
  } catch { bus = null; }
  try { // an empty clip in a gesture — otherwise old iOS doesn't open the output
    const src = actx.createBufferSource();
    src.buffer = actx.createBuffer(1, 1, 22050);
    src.connect(actx.destination); src.start(0);
  } catch { /* */ }
}
// Chrome, Firefox, Edge and in-app browsers on iPhone are WKWebView: Web Audio stays silent there until the page has
// played a regular <audio>. We play a silent clip in a gesture (not needed in Safari or the installed game — sound works there,
// and the silent mode switch is obeyed). In these browsers sound plays even in silent mode.
const UA = navigator.userAgent || '';
const IOS_WEBVIEW = /iPhone|iPad|iPod/.test(UA) && (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA\//.test(UA) || !/Safari\//.test(UA));
let htmlAudio = null;
function silentWav() { // 0.25 s of silence, 8 kHz, 8 bit
  const n = 2000, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
function unlockHtmlAudio() {
  if (!IOS_WEBVIEW || document.hidden) return;
  if (!soundOn()) { if (htmlAudio) htmlAudio.pause(); return; } // sound is off — don't mute other apps' music
  if (!htmlAudio) {
    try {
      htmlAudio = document.createElement('audio');
      htmlAudio.setAttribute('x-webkit-airplay', 'deny');
      htmlAudio.setAttribute('playsinline', '');
      htmlAudio.loop = true; htmlAudio.preload = 'auto'; htmlAudio.src = silentWav();
    } catch { htmlAudio = null; return; }
  }
  if (htmlAudio.paused) { const p = htmlAudio.play(); if (p && p.catch) p.catch(() => {}); }
}
let resumeTry = 0;
function wakeAudio() {
  if (!actx || actx.state === 'running' || resumeBusy) return;
  // an interrupted iOS context may never answer resume() — wait no longer than a second, or gestures won't help anymore
  const n = ++resumeTry, done = () => { if (n === resumeTry) resumeBusy = false; };
  resumeBusy = true;
  setTimeout(done, 1000);
  try { Promise.resolve(actx.resume()).catch(() => {}).finally(done); } catch { done(); }
}
function replaceAudio() { // only from a gesture: close the old context (iOS keeps no more than ~4) and make a new one
  const old = actx; actx = null;
  if (old) {
    try { if (old.close) Promise.resolve(old.close()).catch(() => {}); else old.suspend(); } catch { try { old.suspend(); } catch { /* */ } }
  }
  newAudio(); audioStuck = 0; audioStale = false; resumeTry++; resumeBusy = false;
}
function ensureAudio() { // only from gestures: pointerup / touchend / click / keydown
  unlockHtmlAudio();
  if (!actx || (audioStale && !document.hidden)) replaceAudio(); // after the background or an interruption the old context isn't trusted
  if (!actx || actx.state === 'running') { audioStuck = 0; return; }
  // iOS 17 sometimes doesn't wake an interrupted context: resume() has answered, but gestures don't help for over 1.5 s — make a new one
  const now = performance.now();
  if (!audioStuck) audioStuck = now;
  else if (!resumeBusy && now - audioStuck > 1500) replaceAudio();
  wakeAudio();
}
['pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { ensureAudio(); loadEat(); }, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (htmlAudio) htmlAudio.pause();
    if (actx && IOS) audioStale = true; // after minimizing or switching apps an iPhone context can be "running" yet silent
  } else wakeAudio(); // before the first touch — at least with the old context: after a call iOS often wakes it even without a gesture
});
const soundOn = () => save.sound && save.vol > 0;
const canSound = () => soundOn() && actx && (actx.state === 'running' || resumeBusy);
const EAT_STEPS = [0, 2, 4, 7, 9, 12, 14, 16]; // semitones from D4
const eatPitch = (step) => semi(294, EAT_STEPS[step]); // a crumb's note: the same in the game and in the pause-menu preview
// pan — where it sounds: −1 left … 1 right (arena events come from the side of the screen where they happened)
function tone(f0, f1, dur, vol, type = 'sine', delay = 0, pan = 0) {
  if (!canSound()) return; // a sleeping context shouldn't pile up sounds
  vol *= save.vol * save.vol; // volume from the setting, squared — so the slider feels more even
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  let out = g;
  if (pan && actx.createStereoPanner) { const p = actx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); out = p; }
  out.connect(bus || actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
// a shared short "room" echo (one per context): part of the sound goes there and quietly repeats
function roomOf(c) {
  if ('room' in c) return c.room; // null — it failed, don't retry on every note
  try {
    const d = c.createDelay(1), fb = c.createGain(), wet = c.createGain(), lp = c.createBiquadFilter();
    d.delayTime.value = 0.09; fb.gain.value = 0.32; wet.gain.value = 0.35; lp.type = 'lowpass'; lp.frequency.value = 3000;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(bus || c.destination);
    c.room = d;
  } catch { c.room = null; }
  return c.room;
}
function sendOut(g, wet) {
  g.connect(bus || actx.destination);
  const r = wet && roomOf(actx);
  if (r) { const w = actx.createGain(); w.gain.value = wet; g.connect(w); w.connect(r); }
}
// a note with attack a and decay until dur; to — where the pitch glides; wet — share sent to the echo
// lp — a low-pass filter (softer sawtooth and square), vib — [rate, depth in cents] of vibrato
function note(f, { type = 'sine', vol = 0.2, a = 0.004, dur = 0.2, delay = 0, to = 0, wet = 0, detune = 0, lp = 0, vib = null } = {}) {
  if (!canSound()) return;
  vol *= save.vol * save.vol;
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.detune.value = detune; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(a, dur * 0.9)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let src = o;
  if (lp) { const fl = actx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); src = fl; }
  if (vib) { const lfo = actx.createOscillator(), lg = actx.createGain(); lfo.frequency.value = vib[0]; lg.gain.value = vib[1]; lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.05); }
  src.connect(g); sendOut(g, wet);
  o.start(t); o.stop(t + dur + 0.05);
}
const SND = { n: note, h: (o) => hiss(o) }; // building blocks for the sets in sounds.js
// crunch recordings (sounds.js → EAT_SLICES): the file loads once on the first gesture, the buffer works with any context
let eatBuf = null, eatLoading = false, eatFail = -1e9, eatVoice = null, lastSlice = '';
function loadEat() {
  if (eatBuf || eatLoading || !actx || !soundOn() || performance.now() - eatFail < 30000) return; // it failed — retry no more than once every 30 s
  eatLoading = true;
  const c = actx;
  fetch('sfx/eat.wav').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then((ab) => new Promise((ok, no) => { const p = c.decodeAudioData(ab, ok, no); if (p && p.catch) p.catch(no); })) // old Safari — callbacks only
    .then((b) => { eatBuf = b; }).catch(() => { eatFail = performance.now(); /* until the file is loaded, "Yum" plays */ }).finally(() => { eatLoading = false; });
}
// a bite from the set: a random slice (not the same as last time), pitch with some spread, a bit higher in a row;
// the previous bite fades out fast — with frequent eating the crunches don't blur into mush
function playBite(v, step, delay = 0) {
  if (!canSound()) return;
  const set = Array.isArray(v.sample) ? v.sample[(Math.random() * v.sample.length) | 0] : v.sample, list = EAT_SLICES[set];
  let k = (Math.random() * list.length) | 0;
  if (list.length > 1 && `${set}:${k}` === lastSlice) k = (k + 1) % list.length;
  lastSlice = `${set}:${k}`;
  const [off, len] = list[k], t = actx.currentTime + delay;
  if (eatVoice && !delay) { const { g, src } = eatVoice; try { g.gain.setTargetAtTime(0, t, 0.012); src.stop(t + 0.06); } catch { /* */ } }
  const src = actx.createBufferSource(), g = actx.createGain();
  src.buffer = eatBuf;
  src.playbackRate.value = (v.rate[0] + Math.random() * (v.rate[1] - v.rate[0])) * (1 + step * 0.012);
  g.gain.value = 0.55 * save.vol * save.vol;
  src.connect(g); g.connect(bus || actx.destination);
  src.start(t, off, len);
  eatVoice = { g, src };
}
function playEat(i, step) {
  const v = EAT[i];
  if (v.play || !eatBuf) { (v.play ? v : EAT.find((e) => e.play)).play(SND, eatPitch(step)); return; } // the recordings haven't loaded yet
  playBite(v, step);
  if (v.twice) playBite(v, step, v.twice);
}
function noiseBuffer() {
  if (!noiseBuf || noiseBuf.sampleRate !== actx.sampleRate) {
    const n = actx.sampleRate; noiseBuf = actx.createBuffer(1, n, n);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
// rustle: noise through a filter (f → f1 over dur)
function hiss({ vol = 0.2, dur = 0.05, delay = 0, type = 'bandpass', f = 2000, f1 = 0, q = 1, a = 0.002 } = {}) {
  if (!canSound()) return;
  vol *= save.vol * save.vol;
  const t = actx.currentTime + delay, src = actx.createBufferSource(), fl = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = noiseBuffer(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(a, dur * 0.9)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); sendOut(g, 0);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
const sfx = {
  // food in a row — each crumb a step higher (pentatonic), after a half-second pause from the bottom again
  eat() {
    const now = performance.now();
    if (now - lastEatSound < 70) return;
    eatStep = now - lastEatSound < 500 ? Math.min(eatStep + 1, EAT_STEPS.length - 1) : 0;
    lastEatSound = now;
    playEat(save.snd.eat, eatStep); // the player picks the sound in the pause menu
    haptic('eat');
  },
  boost() { BOOST[save.snd.boost].start(SND); }, // lightning bolt click — the player picks the sound in the pause menu
  // slipped past another body by a hair — a short whistle from that side
  near(pan) { tone(750, 1350, 0.11, 0.08, 'sine', 0, pan); tone(950, 1600, 0.08, 0.04, 'sine', 0.05, pan); haptic('near'); },
  // another snake died on screen — a dull pop from its side, quieter from afar
  pop(pan, k) { tone(420, 160, 0.16, 0.12 * k, 'triangle', 0, pan); tone(900, 300, 0.07, 0.05 * k, 'sine', 0.02, pan); },
  // someone caught a butterfly on screen — a soft chime from that side
  chime(pan, k) { [587, 784].forEach((f, i) => tone(f, f * 1.2, 0.08, 0.06 * k, 'sine', i * 0.05, pan)); },
  // volumes are before the compressor; frequencies no lower than ~150 Hz: the phone speaker barely plays anything lower
  // your own snake crashed — the player picks the sound in the pause menu (sounds.js)
  die() { CRASH[save.snd.crash].play(SND); haptic('die'); },
  win() { tone(330, 660, 0.14, 0.25, 'triangle'); tone(494, 988, 0.18, 0.22, 'triangle', 0.12); haptic('kill'); },
  combo(n) { for (let i = 0; i < n + 1; i++) tone(330 + i * 80, 660 + i * 110, 0.12, 0.22, 'triangle', i * 0.08); haptic('combo'); },
  title() { [262, 330, 392, 523].forEach((f, i) => tone(f, f * 1.01, 0.18, 0.22, 'triangle', i * 0.09)); haptic('title'); },
  // your own molt — the player picks the sound in the pause menu (sounds.js); each next stage a tone higher
  molt(st = 1) { MOLT[save.snd.molt].play(SND, Math.max(1, st), MOLT_CHARGE); haptic('molt'); },
  // someone else's molt on screen — the same, quietly and from its side
  moltFar(pan, k) { tone(200, 600, 0.3, 0.05 * k, 'triangle', 0, pan); tone(523, 530, 0.18, 0.06 * k, 'sine', MOLT_CHARGE, pan); },
  level() { [196, 262, 330, 392, 523, 659].forEach((f, i) => tone(f, f, 0.22, 0.12, 'square', i * 0.08)); haptic('title'); },
  fly() { [440, 587, 784].forEach((f, i) => tone(f, f * 1.25, 0.09, 0.18, 'sine', i * 0.05)); haptic('fly'); },
};
// boost noise: while you hold the bolt — a rustle, higher and brighter with every second
let whoosh = null, noiseBuf = null; // { srcs, g, ctx, vol }
// the set's sound while the bolt is held (BOOST[i].loop): common input g — volume and a smooth fade in/out
function startLoop(v, vol) {
  const t = actx.currentTime, g = actx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.06);
  const srcs = v.loop({ ctx: actx, out: g, noise: noiseBuffer() });
  g.connect(bus || actx.destination);
  return { srcs, g, ctx: actx, vol };
}
let boostPreview = null; // boost preview in "Sounds": { w, timer }
function stopBoostPreview() { if (boostPreview) { clearTimeout(boostPreview.timer); stopLoop(boostPreview.w); boostPreview = null; } }
function stopLoop(w) {
  const t = w.ctx.currentTime;
  w.g.gain.cancelScheduledValues(t); w.g.gain.setValueAtTime(w.g.gain.value, t); w.g.gain.linearRampToValueAtTime(0, t + 0.12);
  for (const s of w.srcs) { try { s.stop(t + 0.15); } catch { /* */ } }
}
// while you hold the bolt — the chosen set's sound (wind by default: a rustle that gets higher and brighter over a second and a half)
function setWhoosh(on) {
  if (on && (!soundOn() || !actx || actx.state !== 'running')) on = false;
  if (!on) { if (whoosh) { stopLoop(whoosh); whoosh = null; } return; }
  const vol = 0.05 * save.vol * save.vol;
  if (whoosh && whoosh.ctx !== actx) whoosh = null; // the context was recreated (iOS) — the old nodes are silent
  if (whoosh) {
    if (whoosh.vol !== vol) { whoosh.g.gain.setTargetAtTime(vol, actx.currentTime, 0.05); whoosh.vol = vol; } // the volume was changed in the pause menu
    return;
  }
  const v = BOOST[save.snd.boost];
  if (!v.loop) return; // "Click" — no sound during the boost
  try { whoosh = startLoop(v, vol); } catch { whoosh = null; }
}

// ---------- vibration ----------
// Android only (navigator.vibrate). On iPhone the web can't vibrate: there's no vibrate, and Apple closed the loophole of toggling
// an <input switch> in iOS 26.5 — it worked neither in Chrome nor on tap when tested.
const IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const CAN_VIBRATE = !IOS && typeof navigator.vibrate === 'function';
const hasHaptic = () => isTouch && CAN_VIBRATE; // isTouch is declared below — ask at call time
// pattern: ms of vibration, pause, vibration…
const HAPTIC = {
  eat: 8, boost: 14, near: 10,
  fly: [8, 35, 8, 35, 8],
  kill: [20, 60, 30],
  combo: [16, 45, 16, 45, 40],
  title: [12, 50, 12, 50, 12, 50, 50],
  molt: [8, 30, 8, 30, 8, 120, 60],
  die: [70, 50, 140],
};
const lastHap = {};
function haptic(kind) {
  if (!hasHaptic() || !save.haptic || document.hidden) return;
  const now = performance.now();
  if (now - (lastHap[kind] || 0) < 110) return; // the same thing in a row — don't buzz
  lastHap[kind] = now;
  try { navigator.vibrate(HAPTIC[kind]); } catch { /* */ }
}

// sound check: what's going on with sound on this device — shown after turning sound on in the pause menu
function audioStatus() {
  if (!actx) return t('audio.blocked');
  if (actx.state === 'running') return t('audio.ok');
  return t('audio.off', actx.state);
}

// ---------- progression: stars unlock skins ----------
// Stars accumulate over all time: food, wins, molts, leaderboard places. They're never spent — a skin unlocks
// once its number of stars has been reached.
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
    if (run) run.unlocked.push(...fresh);
    if (mode && ui === 'play') flashMe(2, sfx.level); // which one — the after-game dialog will show
    persist();
  }
}

// ---------- canvas ----------
const canvas = $('c'), ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, tall = false, redraw = false; // tall — the page is as tall as the screen (see resize), redraw — the canvas was cleared
// Installed game on iPhone (status bar over the page): the window is shorter than the screen by about the status bar height,
// leaving an empty strip at the bottom. There the canvas is stretched to the full screen height (iOS reports screen in portrait).
const IS_PWA = navigator.standalone === true ||
  (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);
const IOS_PWA = IS_PWA && /iPhone|iPod/.test(navigator.userAgent || '');
if (IS_PWA) document.documentElement.classList.add('pwa');
// screen height in the current orientation (iOS reports screen in portrait)
function screenHeight() {
  return window.innerHeight >= window.innerWidth ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
}
function fullHeight() {
  const iw = window.innerWidth, ih = window.innerHeight;
  if (!IOS_PWA || !screen.width || !screen.height) return ih;
  const portrait = ih >= iw, sh = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const sw = portrait ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
  return Math.abs(sw - iw) < 2 && sh > ih && sh - ih < 120 ? sh : ih; // only if the width matches and the difference is a strip, not the keyboard
}
// sizes for debugging, in case the field isn't full-screen again (shown in "How to play" in the installed game on iPhone)
function screenInfo() {
  const m = (css) => { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;top:0;width:1px;visibility:hidden;${css}`;
    document.body.appendChild(d); const h = Math.round(d.getBoundingClientRect().height); d.remove(); return h; };
  const vv = window.visualViewport;
  return `screen ${screen.width}×${screen.height} · window ${innerWidth}×${innerHeight} · vv ${vv ? Math.round(vv.height) : '-'} · ` +
    `doc ${document.documentElement.clientHeight} · field ${H} · 100vh ${m('height:100vh')} · lvh ${m('height:100lvh')} · ` +
    `safe ${m('height:env(safe-area-inset-top)')}/${m('height:env(safe-area-inset-bottom)')} · scroll ${Math.round(scrollY)} · ${document.documentElement.className}`;
}
// the page is taller than the window (class tall) — don't let it scroll away; but while the keyboard is open over an input (name, room code),
// don't stop iOS from keeping that input in view
function unscroll() {
  if (!window.scrollY) return;
  const typing = document.activeElement?.matches('textarea, input:not([type=range], [type=checkbox], [type=radio], [type=button])');
  const vv = window.visualViewport;
  if (typing && (!vv || vv.height < window.innerHeight - 80)) return;
  window.scrollTo(0, 0);
}
// screen cutouts (notch, home indicator): the leader arrow sits right at the edge, but not under them
let safe = { t: 0, r: 0, b: 0, l: 0 };
function readSafe() {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(d); const cs = getComputedStyle(d);
  safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  d.remove();
}
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  readSafe();
  W = window.innerWidth; H = fullHeight();
  // canvas, UI, dialog scrim and menu screens share one height (CSS: var(--app-h)). In the installed game on iPhone
  // the layout follows the screen height even if the window is currently screen-sized: iOS keeps shortening the window by the status bar
  // and stretching it after the page, and the layout must not change because of that (in 0.12.1 relayout in a loop flickered). With the keyboard — by the window.
  tall = H !== window.innerHeight || (IOS_PWA && H === screenHeight());
  document.documentElement.style.setProperty('--app-h', tall ? `${H}px` : '');
  document.documentElement.classList.toggle('tall', tall);
  unscroll();
  // recreate the canvas only if the size really changed: assigning it clears the picture (in the pause menu it isn't redrawn)
  const cw = Math.round(W * DPR), ch = Math.round(H * DPR);
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; redraw = true; }
}
window.addEventListener('resize', resize);
resize();
// in the installed game iOS doesn't always send resize: at startup the window can still be screen-tall, then silently
// shrinks by the status bar — and the field and menus stay laid out for the short window (an empty strip at the bottom).
// So we also check the sizes ourselves (from the main loop and when returning to the game): if the width or the needed height
// differ from the laid-out ones — lay out again. The window height itself isn't compared: in a stretched page iOS
// keeps switching it between the screen and the screen minus the status bar, and relayout in a loop flickered (0.12.1).
let sizeCheckT = -Infinity;
function checkSize(now, force = false) {
  if (!force && now - sizeCheckT < 500) return;
  sizeCheckT = now;
  if (window.innerWidth !== W || fullHeight() !== H) { resize(); applyFab(); }
  else if (tall) unscroll();
}
const relayout = () => checkSize(performance.now(), true);
if (window.visualViewport) visualViewport.addEventListener('resize', relayout);
window.addEventListener('pageshow', relayout);
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(relayout, 300); });

const OUTSIDE = '#2B1715', EDGE = '#FFB4AB';
// outline of your own snake: white 60% over the field; bead silhouettes overlap, so the color is already blended with the field and solid
const MINE_RGB = 162;
const ON = '#E3E8F5', PRIMARY = '#8EB8FF', TERTIARY = '#DDBCE0', GOLD_C = '#FFD447', REVENGE = '#FF6B5E';
// crowns of the top three: gold, silver, bronze — [fill, stroke, size relative to gold]
const CROWNS = [[GOLD_C, '#8a5a00', 1], ['#DCE3EC', '#5E6B7A', 0.9], ['#E0975A', '#6E3A12', 0.82]];
// arena backdrop: random on every game start, not the same as last time (?bg=<kind> pins it, for testing)
const BG_Q = new URLSearchParams(location.search).get('bg'), BG_FORCED = BACKDROPS.includes(BG_Q) ? BG_Q : null;
let backdrop = null;
function pickBackdrop() {
  const prev = backdrop && backdrop.kind, pool = BACKDROPS.filter((k) => k !== prev);
  const kind = BG_FORCED || pool[Math.floor(Math.random() * pool.length)];
  backdrop = makeBackdrop(ctx, kind, Math.floor(Math.random() * 1e9), R);
  return backdrop;
}
// sprites: snake beads, head, glowing food — one per palette color
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
const SPR = 64;
// sprites are drawn the first time a color is used: the palette has about a hundred colors, only a few are visible in the arena
const lazy = (size, draw) => { const cache = []; return (k) => cache[k] || (cache[k] = (() => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size / 2, PAL[k] || PAL[0]); return c;
})()); };
// ---------- snake types: each type's bead and head ----------
// A bead is drawn into a sprite once per type, color and pattern; it faces +x (toward the head), radius BR. The next bead
// covers the front part of the previous one — the back arc is what shows, so the patterns (spots, lights) are shifted back.
const BR = 47, BEAD_U = 48, HU = 24, HE = 72; // bead: radius in the sprite; head: body radius and half the sprite
// half the bead sprite by type: beads need only the bead itself, the crest, legs and fins need room, the neon glow even more
const BEAD_E = { beads: 48, neon: 92 };
const circ = (g, x, y, r, fill) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = fill; g.fill(); };
// BEAD_U — sprite dots per unit of radius when drawing (the bead is a bit smaller, as before)
// a scale bead (the Beads type), a dark arc along the back edge
function ball(g, R, col, rear = true) {
  const w = R * 0.09;
  circ(g, 0, 0, R, shade(col, -0.5));
  const gr = g.createRadialGradient(R * 0.3, 0, R * 0.1, 0, 0, R);
  gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(0.7, col); gr.addColorStop(1, shade(col, -0.3));
  circ(g, 0, 0, R - w, gr);
  if (rear) { g.beginPath(); g.arc(0, 0, R * 0.62, Math.PI - 1, Math.PI + 1); g.lineWidth = w; g.lineCap = 'round'; g.strokeStyle = shade(col, -0.35); g.stroke(); }
}
// v — pattern variant by bead index (the type's VARIANTS), acc — pattern color
// full — a bead with the type's pattern (from stage 3); without it — the same type, simpler: no pattern and no glint
const BEADS = {
  beads: (g, R, col, v, acc, full) => ball(g, R, col, full),
  fish: (g, R, col, v, acc, full) => { // a droplet scale with the sharp end back
    const drop = (sc) => { g.beginPath(); g.arc(0, 0, R * sc, -2.25, 2.25); g.lineTo(-R * 1.4 * sc, 0); g.closePath(); };
    drop(1); g.fillStyle = shade(col, -0.5); g.fill();
    const gr = g.createRadialGradient(R * 0.35, 0, R * 0.1, 0, 0, R * 1.1);
    gr.addColorStop(0, shade(col, 0.4)); gr.addColorStop(0.65, col); gr.addColorStop(1, shade(col, -0.25));
    drop(0.88); g.fillStyle = gr; g.fill();
    if (!full) return;
    g.beginPath(); g.arc(0, 0, R * 0.74, -1.1, 1.1); g.lineWidth = R * 0.1; g.lineCap = 'round'; g.strokeStyle = shade(col, 0.55); g.stroke();
  },
  caterpillar: (g, R, col, v, acc, full) => { // legs on the sides and a glint
    for (const sd of [-1, 1]) circ(g, -R * 0.12, sd * R * 0.96, R * 0.27, shade(acc || col, -0.5));
    ball(g, R * 0.97, col, false);
    if (full) circ(g, -R * 0.5, -R * 0.35, R * 0.16, 'rgba(255,255,255,0.5)');
  },
  dots: (g, R, col, v, acc, full) => { // spots: one and two on alternating beads
    ball(g, R, col, false);
    if (!full) return;
    if (v) circ(g, -R * 0.52, 0, R * 0.26, acc);
    else { circ(g, -R * 0.4, -R * 0.55, R * 0.2, acc); circ(g, -R * 0.4, R * 0.55, R * 0.2, acc); }
  },
  dragon: (g, R, col, v, acc, full) => { // a crest along the back
    ball(g, R, col);
    if (!full) return;
    g.beginPath(); g.moveTo(R * 0.35, -R * 0.3); g.lineTo(-R * 1.12, 0); g.lineTo(R * 0.35, R * 0.3); g.closePath();
    const gr = g.createLinearGradient(R * 0.35, 0, -R, 0); gr.addColorStop(0, shade(acc, 0.35)); gr.addColorStop(1, acc);
    g.fillStyle = gr; g.fill(); g.lineWidth = R * 0.08; g.lineJoin = 'round'; g.strokeStyle = shade(acc, -0.55); g.stroke();
  },
  tiger: (g, R, col, v, acc, full) => { // a chevron stripe
    ball(g, R, col, false);
    if (!full) return;
    g.save(); g.beginPath(); g.arc(0, 0, R * 0.91, 0, TAU); g.clip();
    g.beginPath(); g.moveTo(-R * 0.05, -R); g.lineTo(-R * 0.42, 0); g.lineTo(-R * 0.05, R);
    g.lineTo(-R * 0.4, R); g.lineTo(-R * 0.78, 0); g.lineTo(-R * 0.4, -R); g.closePath();
    g.fillStyle = acc; g.fill(); g.restore();
  },
  robot: (g, R, col, v, acc, full) => { // a cube with rivets and a light
    const h = R * 0.88;
    g.beginPath(); g.roundRect(-h, -h, h * 2, h * 2, R * 0.28); g.fillStyle = shade(col, -0.55); g.fill();
    const gr = g.createLinearGradient(h, 0, -h, 0); gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(1, shade(col, -0.15));
    g.beginPath(); g.roundRect(-h * 0.84, -h * 0.84, h * 1.68, h * 1.68, R * 0.2); g.fillStyle = gr; g.fill();
    for (const y of [-1, 1]) circ(g, -h * 0.6, y * h * 0.62, R * 0.09, shade(col, -0.45));
    if (!full) return;
    g.save(); g.shadowBlur = R * 0.8; g.shadowColor = acc; circ(g, -h * 0.55, 0, R * (v ? 0.14 : 0.2), acc); g.restore();
  },
  neon: (g, R, col, v, acc, full) => { // a glowing ring on dark
    circ(g, 0, 0, R, '#0C100E');
    g.save(); g.shadowBlur = R * (full ? 0.9 : 0.4); g.shadowColor = col;
    g.beginPath(); g.arc(0, 0, R * 0.74, 0, TAU); g.lineWidth = R * 0.2; g.strokeStyle = col; g.stroke();
    if (full) circ(g, -R * 0.5, 0, R * 0.14, col);
    g.restore();
  },
};
// Stages (molts): 1st — a simple flat bead, 2nd — the type's bead with volume, 3rd — with the type's pattern (BEADS),
// then an outfit on top (dressBead): 4th — a light trim and a droplet glint, 5th — spikes along the spine as well,
// 6th — golden trim and spikes. When drawing, the 5th stage also gets shimmer along the body, the 6th — a glow and sparks from the tail.
function plainBead(g, t, R, col) {
  if (t === 'robot') {
    const h = R * 0.88;
    g.beginPath(); g.roundRect(-h, -h, h * 2, h * 2, R * 0.28); g.fillStyle = shade(col, -0.3); g.fill();
    g.beginPath(); g.roundRect(-h * 0.86, -h * 0.86, h * 1.72, h * 1.72, R * 0.2); g.fillStyle = col; g.fill();
    return;
  }
  if (t === 'neon') {
    circ(g, 0, 0, R, '#0C100E');
    g.beginPath(); g.arc(0, 0, R * 0.74, 0, TAU); g.lineWidth = R * 0.14; g.strokeStyle = col; g.stroke();
    return;
  }
  circ(g, 0, 0, R, shade(col, -0.3)); circ(g, 0, 0, R * 0.88, col);
}
function dressBead(g, R, col, st) {
  const gold = st >= 5, edge = gold ? GOLD_C : shade(col, 0.7);
  g.save(); g.globalCompositeOperation = 'source-atop'; // only over the bead itself
  g.beginPath(); g.arc(0, 0, R * 0.8, Math.PI * 0.42, Math.PI * 1.58);
  g.lineWidth = R * (gold ? 0.14 : 0.1); g.lineCap = 'round'; g.strokeStyle = edge; g.stroke();
  circ(g, -R * 0.28, -R * 0.42, R * 0.13, 'rgba(255,255,255,0.65)');
  g.restore();
  if (st < 4) return;
  const sc = gold ? GOLD_C : shade(col, 0.75);
  g.beginPath(); g.moveTo(-R * 0.5, -R * 0.3); g.lineTo(-R * 0.98, 0); g.lineTo(-R * 0.5, R * 0.3); g.closePath();
  g.fillStyle = sc; g.fill(); g.lineWidth = R * 0.06; g.lineJoin = 'round'; g.strokeStyle = shade(gold ? GOLD_C : col, -0.55); g.stroke();
}
const VARIANTS = { dots: 2, robot: 2 };
const skinOf = (skin) => SKINS[skin] || SKINS[0];
const typeId = (skin) => TYPES[skinOf(skin).type].id;
// pattern variant of bead i (even segments are drawn): alternates from bead to bead
const beadVar = (skin, i) => { const n = VARIANTS[typeId(skin)]; return n ? (i >> 1) % n : 0; };
// a bead sprite; the sprite's .e is half its size: draw at (-e, -e). mode: 0 — bead, 1 — flashed, 2 — silhouette for the outline
const beadCache = new Map(), BEAD_CACHE_MAX = 600; // with stages there are six times more sprites — keep no more than 600
// st — stage (molt): it sets the bead's outfit; by default — the full type without an outfit (previews on the home screen and in pause)
function beadSprite(skin, col, v, mode = 0, st = 2) {
  const sk = skinOf(skin), key = ((((sk.type * 512 + sk.acc + 1) * 512 + col) * 4 + v) * 4 + mode) * 8 + st;
  let c = beadCache.get(key);
  if (c) return c;
  const t = TYPES[sk.type].id, E = BEAD_E[t] || 80;
  c = document.createElement('canvas'); c.width = c.height = E * 2; c.e = E;
  const g = c.getContext('2d');
  g.translate(E, E);
  const cl = PAL[col] || PAL[0];
  if (st === 0) plainBead(g, t, BR, cl);
  else BEADS[t](g, BR, cl, v, PAL[sk.acc], st >= 2);
  if (st >= 3) dressBead(g, BR, cl, st);
  if (mode === 1) { // the same bead, flashed: for the glow wave while boosting
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createRadialGradient(BR * 0.2, 0, 0, 0, 0, BR * 1.2);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0.2)');
    g.fillStyle = gr; g.fillRect(-E, -E, E * 2, E * 2);
  } else if (mode === 2) silhouette(g, E);
  if (beadCache.size >= BEAD_CACHE_MAX) beadCache.delete(beadCache.keys().next().value); // the oldest one — it'll be redrawn if needed
  beadCache.set(key, c);
  return c;
}
// a silhouette for your own snake's outline: the whole shape of the bead or head (with crest, legs, ears), filled with the outline color.
// The neon glow isn't part of the silhouette — only the solid part
function silhouette(g, E) {
  const d = g.getImageData(0, 0, E * 2, E * 2), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const on = a[i + 3] > 160; a[i] = a[i + 1] = a[i + 2] = MINE_RGB; a[i + 3] = on ? 255 : 0; }
  g.putImageData(d, 0, 0);
}

// head: at the origin, facing +x, r — body radius. The eyes are drawn separately — they follow the course
function roundHead(g, r, col, sc = 1.1) {
  const R = r * sc; circ(g, 0, 0, R, shade(col, -0.55));
  const gr = g.createRadialGradient(R * 0.25, -R * 0.2, R * 0.1, 0, 0, R);
  gr.addColorStop(0, shade(col, 0.45)); gr.addColorStop(0.55, col); gr.addColorStop(1, shade(col, -0.25));
  circ(g, 0, 0, R - r * 0.1, gr);
}
function antennae(g, r, line, tip) {
  for (const sd of [-1, 1]) {
    g.beginPath(); g.moveTo(r * 0.3, sd * r * 0.35); g.quadraticCurveTo(r * 1.1, sd * r * 0.55, r * 1.35, sd * r * 1.15);
    g.lineWidth = r * 0.14; g.lineCap = 'round'; g.strokeStyle = line; g.stroke();
    circ(g, r * 1.35, sd * r * 1.15, r * 0.22, tip);
  }
}
const HEADS = {
  beads: (g, r, hd) => roundHead(g, r, hd),
  fish: (g, r, hd, acc) => { // fins at the head
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(-r * 0.1, sd * r * 0.7); g.lineTo(-r * 0.85, sd * r * 1.55); g.lineTo(-r * 0.25, sd * r * 1.55); g.lineTo(r * 0.3, sd * r * 0.8); g.closePath();
      g.fillStyle = hexA(acc, 0.9); g.fill(); g.lineWidth = r * 0.07; g.strokeStyle = shade(acc, -0.45); g.stroke();
    }
    g.save(); g.scale(1.15, 1); roundHead(g, r, hd); g.restore();
  },
  caterpillar: (g, r, hd, acc) => { antennae(g, r, shade(hd, -0.5), acc); roundHead(g, r, hd, 1.18); },
  dots: (g, r, hd) => { antennae(g, r * 0.8, hd, hd); roundHead(g, r, hd); },
  dragon: (g, r, hd, acc) => { // horns and nostrils
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(-r * 0.1, sd * r * 0.5); g.quadraticCurveTo(-r * 1.0, sd * r * 1.25, -r * 1.75, sd * r * 1.2); g.lineTo(-r * 0.7, sd * r * 0.85); g.closePath();
      g.fillStyle = acc; g.fill(); g.lineWidth = r * 0.09; g.strokeStyle = shade(acc, -0.55); g.stroke();
    }
    g.save(); g.scale(1.22, 1); roundHead(g, r, hd, 1.05); g.restore();
    circ(g, r * 1.05, -r * 0.22, r * 0.08, shade(hd, -0.6)); circ(g, r * 1.05, r * 0.22, r * 0.08, shade(hd, -0.6));
  },
  tiger: (g, r, hd, acc) => { // ears, forehead stripes, a little nose
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(-r * 0.55, sd * r * 0.45); g.lineTo(-r * 0.75, sd * r * 1.35); g.lineTo(r * 0.05, sd * r * 0.95); g.closePath();
      g.fillStyle = hd; g.fill(); g.lineWidth = r * 0.1; g.lineJoin = 'round'; g.strokeStyle = shade(hd, -0.55); g.stroke();
      g.beginPath(); g.moveTo(-r * 0.45, sd * r * 0.7); g.lineTo(-r * 0.55, sd * r * 1.1); g.lineTo(-r * 0.15, sd * r * 0.9); g.closePath(); g.fillStyle = '#FFB3C7'; g.fill();
    }
    roundHead(g, r, hd);
    g.lineWidth = r * 0.13; g.lineCap = 'round'; g.strokeStyle = acc;
    for (const y of [-0.35, 0, 0.35]) { g.beginPath(); g.moveTo(-r * 0.85, y * r); g.lineTo(-r * 0.35, y * r * 0.6); g.stroke(); }
    circ(g, r * 0.95, 0, r * 0.15, '#FF8FA3');
  },
  robot: (g, r, hd, acc) => { // a screen head with an antenna; the eyes are lights on the screen
    g.beginPath(); g.moveTo(-r * 0.3, 0); g.lineTo(-r * 1.4, -r * 0.9); g.lineWidth = r * 0.12; g.strokeStyle = shade(hd, -0.5); g.stroke();
    g.save(); g.shadowBlur = r; g.shadowColor = acc; circ(g, -r * 1.4, -r * 0.9, r * 0.2, acc); g.restore();
    const h = r * 1.08;
    g.beginPath(); g.roundRect(-h, -h, h * 2, h * 2, r * 0.35); g.fillStyle = shade(hd, -0.55); g.fill();
    const gr = g.createLinearGradient(h, 0, -h, 0); gr.addColorStop(0, shade(hd, 0.4)); gr.addColorStop(1, shade(hd, -0.1));
    g.beginPath(); g.roundRect(-h * 0.86, -h * 0.86, h * 1.72, h * 1.72, r * 0.27); g.fillStyle = gr; g.fill();
    g.beginPath(); g.roundRect(r * 0.2, -r * 0.78, r * 0.62, r * 1.56, r * 0.25); g.fillStyle = '#14181B'; g.fill();
    g.save(); g.shadowBlur = r * 0.7; g.shadowColor = acc;
    circ(g, r * 0.52, -r * 0.38, r * 0.16, acc); circ(g, r * 0.52, r * 0.38, r * 0.16, acc); g.restore();
  },
  neon: (g, r, hd) => {
    circ(g, 0, 0, r * 1.1, '#0C100E');
    g.save(); g.shadowBlur = r; g.shadowColor = hd;
    g.beginPath(); g.arc(0, 0, r * 0.92, 0, TAU); g.lineWidth = r * 0.2; g.strokeStyle = hd; g.stroke(); g.restore();
  },
};
// eyes by type: d — how far from the center, big — size, slit — slit pupil, glow — they glow, none — drawn into the head
const EYES = { dragon: { d: 0.45, slit: true }, fish: { big: 1.2 }, caterpillar: { big: 1.15 }, neon: { glow: true }, robot: { none: true } };
// a skin's head: sprite, silhouette for the outline (lazily), the type's eyes and the head color — once per skin
const headCache = [];
function headOf(skin) {
  if (headCache[skin]) return headCache[skin];
  const sk = skinOf(skin), t = TYPES[sk.type].id, c = document.createElement('canvas'); c.width = c.height = HE * 2;
  const g = c.getContext('2d'); g.translate(HE, HE);
  HEADS[t](g, HU, PAL[sk.head], PAL[sk.acc] || PAL[sk.head]);
  return (headCache[skin] = { c, sil: null, eyes: EYES[t] || {}, col: PAL[sk.head] });
}
function headSil(skin) {
  const h = headOf(skin);
  if (!h.sil) {
    const c = document.createElement('canvas'); c.width = c.height = HE * 2;
    const g = c.getContext('2d'); g.drawImage(h.c, 0, 0); silhouette(g, HE); h.sil = c;
  }
  return h.sil;
}
// a head with a gaze: (x, y) — center, a — where it faces, look — where it wants to turn, r — body radius, sc — swelling from the wave;
// edge > 0 — the head's silhouette instead, wider by edge (your own snake's outline)
function drawHead(g, skin, x, y, a, look, r, sc = 1, edge = 0) {
  const h = headOf(skin), c = Math.cos(a), s = Math.sin(a), k = (r * sc + edge) / HU;
  const m = g.getTransform();
  g.transform(c * k, s * k, -s * k, c * k, x, y);
  g.drawImage(edge ? headSil(skin) : h.c, -HE, -HE);
  g.setTransform(m);
  const e = h.eyes;
  if (edge || e.none) return;
  const d = (e.d || 0.55) * r, er = (e.big || 1) * r * 0.36;
  for (const side of [-1, 1]) {
    const ex = x + Math.cos(a + side * 0.6) * d, ey = y + Math.sin(a + side * 0.6) * d;
    if (e.glow) {
      g.beginPath(); g.arc(ex, ey, er * 0.75, 0, TAU); g.fillStyle = h.col; g.fill();
      g.beginPath(); g.arc(ex + Math.cos(look) * r * 0.1, ey + Math.sin(look) * r * 0.1, er * 0.32, 0, TAU); g.fillStyle = '#FFFFFF'; g.fill();
      continue;
    }
    g.beginPath(); g.arc(ex, ey, er, 0, TAU); g.fillStyle = '#FFFFFF'; g.fill();
    const px = ex + Math.cos(look) * r * 0.14, py = ey + Math.sin(look) * r * 0.14;
    g.beginPath();
    if (e.slit) g.ellipse(px, py, er * 0.3, er * 0.75, look, 0, TAU);
    else g.arc(px, py, r * 0.2, 0, TAU);
    g.fillStyle = '#1A1C19'; g.fill();
  }
}
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

// ---------- shared state ----------
let mode = null;         // null — demo behind the menu, 'solo', 'net'
let ui = 'home';         // home | play | paused | dead | conn
let world = null;        // the world of the solo game and the demo
let me = null;           // your own snake (in solo — from world, in net — your own, computed right here: selfStep)
let diffKey = 'easy';
let time = 0, playTime = 0, sessionBest = 0;
let demoFocus = null;
let run = null;          // the current game: stars, wins, place records — for the summary
let feast = null;        // { x, y, until } — a golden feast in the arena
let effects = [];        // flash rings where wins happened
let gulps = [];          // crumbs your snake is sucking into its mouth
let gulpT = -9;          // when your snake last swallowed — the head swells for a moment
let lumps = [];          // when it swallowed: a lump rolls along the body from head to tail
let sparks = [];         // sparks: beads of dead snakes, butterfly pollen
const kick = { t: -9, z: 0, shake: 0 }; // camera kick: z — zoom, shake — shake in screen points
let slowUntil = 0;       // solo game: a moment of slow motion after your own win
let wasBoost = false;
const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
let leaderId = 0;        // who wears the golden crown
let podium = [];         // ids of the top three: gold, silver, bronze crown
const cam = { x: 0, y: 0, z: 1 };

function newRun(diff) {
  return { diff, xp: 0, kills: 0, eatenBase: 0, eatXp: 0, eatStat: 0, maxStage: 0, bestRank: 999, flags: new Set(),
    lifeStart: 0, killTimes: [], revenge: null, feastSeen: new Set(), unlocked: [], maxMass: START_MASS, startT: performance.now() };
}
// ---------- input ----------
const isTouch = ('ontouchstart' in window) || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
const joy = { active: false, pid: null, bx: 0, by: 0, x: 0, y: 0, angle: null };
const mouse = { x: 0, y: 0, has: false, down: false };
let inputKind = isTouch ? 'touch' : 'mouse';
let fabDown = false;
const keys = new Set();

canvas.addEventListener('pointerdown', (e) => {
  if (fabEdit) { fabDragStart(e, true); return; } // button setup: touching the field moves the button here
  if (e.pointerType === 'mouse') {
    inputKind = 'mouse'; mouse.down = e.button === 0; mouse.x = e.clientX; mouse.y = e.clientY; mouse.has = true;
    return;
  }
  if (joy.active) return; // a second finger on the field is ignored
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
  if (len > JOY_R) { // the base follows the finger
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
  e.preventDefault();
  if (fabEdit) { fabDragStart(e, false); return; }
  fabDown = true; fab.classList.add('on');
  if (me && me.mass > MIN_BOOST_MASS) haptic('boost'); // right on touch, without waiting for the network
  try { fab.setPointerCapture(e.pointerId); } catch { /* */ }
});
const fabUp = () => { fabDown = false; fab.classList.remove('on'); };
fab.addEventListener('pointerup', fabUp);
fab.addEventListener('pointercancel', fabUp);
fab.addEventListener('lostpointercapture', fabUp);
if (isTouch) fab.hidden = false;

// --- boost button size and position (on a tablet the corner is a long reach) ---
const FAB_DEF = 76, FAB_MIN = 56, FAB_MAX = 180, FAB_PAD = 8;
let fabEdit = false, fabDrag = null; // fabDrag: { pid, dx, dy } — the finger and its offset from the button center
const fabSize = () => Math.min(FAB_MAX, Math.max(FAB_MIN, Number(save.fab.size) || FAB_DEF));
const fabKey = () => (W > H ? 'land' : 'port');
const fabOk = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => x >= 0 && x <= 1);
// the position for this orientation; if there's none, take the other one's (rotate the tablet — the button stays roughly in place)
function fabSpot() {
  const k = fabKey(), o = k === 'land' ? 'port' : 'land';
  return fabOk(save.fab[k]) ? save.fab[k] : fabOk(save.fab[o]) ? save.fab[o] : null;
}
function clampFab(x, y) {
  const r = fabSize() / 2 + FAB_PAD;
  return [Math.min(Math.max(x, r), Math.max(r, W - r)), Math.min(Math.max(y, r), Math.max(r, H - r))];
}
function applyFab() {
  const s = fabSize(), spot = fabSpot();
  fab.style.width = fab.style.height = `${s}px`;
  fab.style.setProperty('--fab-i', `${Math.round(s * 0.45)}px`);
  if (spot) {
    const [x, y] = clampFab(spot[0] * W, spot[1] * H);
    fab.style.left = `${x - s / 2}px`; fab.style.top = `${y - s / 2}px`; fab.style.right = fab.style.bottom = 'auto';
  } else fab.style.left = fab.style.top = fab.style.right = fab.style.bottom = ''; // by default — the bottom-right corner (CSS)
  if (fabEdit) placeFabPanel();
}
function fabCenter() { const r = fab.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
function setFabAt(x, y) { const [cx, cy] = clampFab(x, y); save.fab[fabKey()] = [cx / W, cy / H]; applyFab(); }
// the setup panel goes on the other half of the screen from the button, so it doesn't cover it
function placeFabPanel() {
  const p = $('fabPanel'), [x, y] = fabCenter();
  p.classList.toggle('side', W > H);
  p.classList.toggle('at-top', W <= H && y > H / 2);
  p.classList.toggle('at-left', W > H && x > W / 2);
}
function fabDragStart(e, jump) {
  if (fabDrag) return;
  const [cx, cy] = fabCenter();
  fabDrag = { pid: e.pointerId, dx: jump ? 0 : cx - e.clientX, dy: jump ? 0 : cy - e.clientY };
  if (jump) setFabAt(e.clientX, e.clientY);
  fab.classList.add('drag');
  try { (jump ? canvas : fab).setPointerCapture(e.pointerId); } catch { /* */ }
}
window.addEventListener('pointermove', (e) => {
  if (fabDrag && e.pointerId === fabDrag.pid) setFabAt(e.clientX + fabDrag.dx, e.clientY + fabDrag.dy);
});
const fabDragEnd = (e) => { if (fabDrag && e.pointerId === fabDrag.pid) { fabDrag = null; fab.classList.remove('drag'); persist(); } };
window.addEventListener('pointerup', fabDragEnd);
window.addEventListener('pointercancel', fabDragEnd);
function startFabEdit() {
  closeDialog();
  fabEdit = true; fabUp(); hideHint(); joy.active = false; joy.pid = null;
  fab.classList.add('edit'); $('fabPanel').hidden = false;
  const rng = $('fabSize');
  rng.min = FAB_MIN; rng.max = FAB_MAX; rng.value = fabSize();
  showFabRange();
  applyFab();
}
function showFabRange() {
  const rng = $('fabSize');
  rng.style.setProperty('--p', `${(rng.value - FAB_MIN) / (FAB_MAX - FAB_MIN) * 100}%`);
}
function endFabEdit() {
  if (!fabEdit) return;
  fabEdit = false; fabDrag = null;
  fab.classList.remove('edit', 'drag'); $('fabPanel').hidden = true;
  persist();
}
$('fabSize').addEventListener('input', () => {
  const c = fabCenter();
  save.fab.size = Number($('fabSize').value); showFabRange();
  if (fabSpot()) setFabAt(c[0], c[1]); else applyFab(); // grows around its own center
});
$('fabSize').addEventListener('change', persist);
$('fabReset').addEventListener('click', () => {
  save.fab = {}; $('fabSize').value = FAB_DEF; showFabRange(); applyFab(); persist();
});
$('fabDone').addEventListener('click', () => { endFabEdit(); menuDialog(); });
window.addEventListener('resize', applyFab);
applyFab();

const TURN_KEYS = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (fabEdit && (e.code === 'Escape' || e.code === 'Enter')) { endFabEdit(); menuDialog(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { openMenu(); return; }
  if ([...TURN_KEYS, 'ArrowUp', 'KeyW', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
    keys.add(e.code); e.preventDefault();
    if (TURN_KEYS.includes(e.code)) inputKind = 'keys';
  }
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); });
window.addEventListener('blur', () => { keys.clear(); fabUp(); mouse.down = false; joy.active = false; });

// where the player wants to crawl: an angle, or null (leave as is)
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

// ---------- network game ----------
// There's no game server. The world — bots, food, butterflies — is computed by the host's browser (room.js, clock runRoom),
// while each player computes their own snake locally (selfStep): a turn shows instantly, the player decides about their own crash
// and reports to the host where they are, what they ate and what they caught. Other snakes are drawn from the host's snapshots INTERP_MS behind.
// The host plays the same way as guests — through a loopback inside the page.
const net = {
  link: null, room: null, stopRoom: null, sig: null, isHost: false,
  code: '', roomMode: 'team', diff: 'easy', youId: 0, myTeam: 0,
  snakes: new Map(), foods: new Map(), buf: [], foodQ: [], offset: null, lastTick: -1, lastSnap: 0, waitSnack: false,
  lastSent: 0, seq: 0, lastB: false, leaving: false, retry: 0, retryTimer: 0, sim: null,
  kills: 0, deadInfo: null, lb: null, eaten: 0, flies: [], eatQ: [], dropQ: [], ate: new Map(), claimed: new Map(),
};
function netSend(o) { if (net.link && !net.link.closed) net.link.send(o); }

function netReset() {
  net.snakes.clear(); net.foods.clear(); net.buf = []; net.foodQ = []; net.offset = null; net.lastTick = -1; net.flies = [];
  net.youId = 0; net.lastB = false; net.lb = null; net.eatQ = []; net.dropQ = []; net.ate.clear(); net.claimed.clear();
  net.lastSnap = 0; me = null;
}
// the channel to the room is ready (direct, or the host's loopback): say hello, then the room sends the world
function useLink(link) {
  net.link = link;
  link.onjson = onNetMsg;
  link.onbin = onBinary;
  link.onclose = () => {
    if (net.link !== link) return;
    net.link = null;
    if (!net.leaving && mode === 'net') netReconnect();
  };
  link.send(hello({ t: 'hello' }));
}
function onNetMsg(m) {
  if (m.t === 'welcome') onWelcome(m);
  else if (m.t === 'ev') onEvents(m);
  else if (m.t === 'lb') net.lb = m;
  else if (m.t === 'st') onStats(m);
  else if (m.t === 'you') { setMe(m); ui = 'play'; closeDialog(); onRespawn(); }
  else if (m.t === 'sync') onSync(m);
  else if (m.t === 'slept') onSlept();
  else if (m.t === 'err') onNetError(m.code);
}
// the game was minimized — the room removed our snake so it wouldn't hang frozen for everyone
function onSlept() {
  const dead = me;
  if (!dead) return;
  me = null;
  onNetDeath({ by: null, byId: 0, mass: Math.floor(dead.mass), max: Math.floor(dead.maxMass), eaten: dead.eaten,
    who: t('oops.asleep') }, dead);
}
// host: the room code lives on the site, the room itself right here, guests connect directly
function hostRoom(opts) {
  net.isHost = true;
  const attach = (room, link) => {
    const c = room.attach(link);
    link.onjson = (m) => room.message(c, m);
    link.onbin = (buf) => room.self(c, new DataView(buf));
    link.onclose = () => room.detach(c);
  };
  net.sig = host({
    v: VERSION, token: HOST_TOKEN,
    onCode: (code) => {
      if (mode !== 'net' || net.leaving) return;
      if (net.room) { // the connection to the site is back; if the code was given away meanwhile, the room has a new one
        if (code !== net.code) { net.code = code; net.room.code = code; showRoomCode(); }
        return;
      }
      const room = new Room({ code, mode: opts.mode, diff: opts.diff, botNames: BOT_NAMES, playerName: t('player') });
      net.room = room;
      net.stopRoom = runRoom(room);
      const [mine, theirs] = loopback();
      attach(room, theirs);
      useLink(mine);
    },
    onPeer: (link) => { if (net.room && !net.leaving) attach(net.room, link); else link.close(); },
    onError: (code) => { if (!net.room) onNetError(code); }, // the room is already running — without the site simply nobody new can join
  });
}
function stopHosting() {
  if (net.sig) { net.sig.close(); net.sig = null; }
  if (net.stopRoom) { net.stopRoom(); net.stopRoom = null; }
  if (net.room) { net.room.closeAll(); net.room = null; }
  net.isHost = false;
}
// guest: introduction through the site and a direct channel to the host
function joinRoom(code, isRetry) {
  net.code = code;
  join({ code, v: VERSION }).then((link) => {
    if (mode !== 'net' || net.leaving) { link.close(); return; }
    useLink(link);
  }).catch((why) => {
    if (mode !== 'net' || net.leaving) return;
    if (isRetry && why === 'no_room') { hostGone(); return; }
    if (isRetry && (why === 'p2p' || why === 'net')) { netReconnect(); return; }
    onNetError(why);
  });
}
function hostGone() {
  net.leaving = true;
  mode = null; me = null;
  dialog(t('room.closed'), `<p>${t('room.closedText')}</p>`,
    [{ label: t('btn.menu'), kind: 'filled', onClick: toHome }]);
}
function netFailed() {
  mode = null; net.link = null;
  dialog(t('net.noSite'), `<p>${t('net.noSiteText')}</p>`,
    [{ label: t('btn.ok'), kind: 'filled', onClick: toHome }]);
}
function netReconnect() {
  ui = 'conn';
  if (net.retry === 0) dialog(t('net.lost'), `<p>${t('net.lostText')}</p>`, [{ label: t('btn.leave'), kind: 'text', onClick: leaveNet }]);
  if (net.retry >= 10) {
    dialog(t('net.retryFail'), `<p>${t('net.retryFailText')}</p>`, [{ label: t('btn.menu'), kind: 'filled', onClick: leaveNet }]);
    return;
  }
  net.retry++;
  clearTimeout(net.retryTimer);
  net.retryTimer = setTimeout(() => {
    if (mode !== 'net' || net.link) return;
    netReset();
    joinRoom(net.code, true);
  }, net.retry === 1 ? 300 : 2000);
}
// Updating only happens via the button: the new version is already downloaded and waiting (see sw.js), we tell it to take over and reload.
// If it isn't there yet (joined a room before the browser checked for updates) — download it first.
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
          setTimeout(res, 60000); // on a slow network wait long for the download, but not forever
        });
      }
    }
  } catch { /* reload as is */ }
  location.reload();
}
// A new version is out: show a banner with a button on the home screen. The game itself doesn't reload — a match isn't cut short.
function watchUpdates(reg) {
  // reg.active tells an update from the first install (then there's nothing to offer)
  const offer = () => { if (reg.waiting && reg.active) $('update').hidden = false; };
  const track = (w) => { if (w) w.addEventListener('statechange', offer); };
  offer();
  track(reg.installing);
  reg.addEventListener('updatefound', () => track(reg.installing));
  // an open tab doesn't learn about a release by itself: ask the server when returning to the game and once an hour —
  // but no more than once every 10 minutes and not during a match, so the download doesn't disturb network play
  let lastCheck = performance.now();
  const check = () => {
    if (mode !== null || performance.now() - lastCheck < 10 * 60 * 1000) return;
    lastCheck = performance.now();
    reg.update().catch(() => { /* offline */ });
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  setInterval(check, 60 * 60 * 1000);
  // the version was updated in another tab: this one is still on old code — reload right away on the home screen, don't cut a match short
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled && !updating) { if (mode === null) location.reload(); else $('update').hidden = false; }
    controlled = true;
  });
}
$('btnUpdate').addEventListener('click', () => { $('btnUpdate').disabled = true; updateApp(); });
function onNetError(code) {
  if (code === 'net') { netFailed(); return; }
  net.leaving = true;
  if (net.link) net.link.close();
  stopHosting();
  mode = null; me = null;
  if (code === 'version') {
    dialog(t('update.title'), `<p>${t('update.host')}</p>`,
      [{ label: t('btn.later'), kind: 'text', onClick: toHome }, { label: t('btn.update'), kind: 'filled', onClick: updateApp }]);
    return;
  }
  const text = t(has('err.' + code) ? 'err.' + code : 'err.other');
  dialog(t('err.title'), `<p>${text}</p>`, [{ label: t('btn.ok'), kind: 'filled', onClick: toHome }]);
}
// a body over the network — a flat array [x0, y0, x1, y1, …]
function unflat(flat) {
  const segs = [];
  for (let i = 0; i < flat.length; i += 2) segs.push({ x: flat[i], y: flat[i + 1] });
  if (!segs.length) segs.push({ x: 0, y: 0 });
  return segs;
}
function makeNetSnake(m) {
  const segs = unflat(m.segs);
  return { id: m.id, name: m.name, skin: m.skin, team: m.team, human: m.human, segs, a: 0, ta: 0, mass: START_MASS,
    r: STAGE_R[0], stage: undefined, isBoosting: false, inv: 0, visible: false, seen: false }; // the stage comes with the first snapshot
}
function setFeast(f) { feast = f ? { x: f.x, y: f.y, until: time + f.life } : null; }
function showRoomCode() {
  try { history.replaceState(null, '', `?room=${net.code}`); } catch { /* */ }
  $('roomChip').innerHTML = `${icon('group')}${t('room.title', net.code)}${icon('share')}`;
  $('roomBox').hidden = false;
}
// your own snake comes from the room (where to appear and how long), after that we compute it ourselves
function setMe(y) {
  const segs = unflat(y.segs);
  const s = new Snake(y.id, segs[0].x, segs[0].y, y.mass, save.skin, myName(), true, y.team, undefined, segs);
  s.inv = y.inv || 0;
  me = s;
  net.youId = y.id; net.myTeam = y.team; net.eaten = 0; net.seq = 0; net.lastSent = 0;
  // moveSnake from core.js with this "world": the level's rules, the arena edge, the food dropped while boosting goes to the host
  net.sim = { D: DIFF[net.diff], pending: [], addFood: (x, yy, v, c) => { net.dropQ.push([Math.round(x), Math.round(yy), Math.round(v * 100) / 100, c]); } };
  cam.x = segs[0].x; cam.y = segs[0].y;
}
function onWelcome(m) {
  net.code = m.code; net.roomMode = m.mode; net.diff = m.diff; net.retry = 0;
  net.snakes.clear(); net.foods.clear(); net.buf = []; net.foodQ = []; net.lastTick = m.tick;
  for (const s of m.snakes) net.snakes.set(s.id, makeNetSnake(s));
  net.offset = performance.now() - m.tick * TICK_MS;
  setMe(m.me);
  setFeast(m.feast);
  showRoomCode();
  closeDialog();
  showHome(false);
  if (!run) { run = newRun(m.diff); playTime = 0; showHint(); }
  ui = 'play';
  hudT = 0;
}
function addNetFood(id, x, y, v, c, life, cell) {
  if (net.ate.has(id)) return; // already eaten by us, the host hasn't removed it yet
  net.foods.set(id, { id, x, y, v, c, r: foodRadiusOf(v), ph: Math.random() * TAU, life, age: 0, cell });
}
// food and butterfly records (FR, FLR, readFood) live in room.js, next to whoever writes them
function onSync(m) { // caught up after missed snapshots: nearby snakes anew, the food follows in full
  for (const s of m.snakes) if (s.id !== net.youId) net.snakes.set(s.id, makeNetSnake(s));
  setFeast(m.feast);
  if (m.kill && m.kill.length) onEvents({ kill: m.kill });
}
function onEvents(m) {
  for (const s of m.spawn || []) if (s.id !== net.youId) net.snakes.set(s.id, makeNetSnake(s)); // entered the field of view — the whole body
  if (m.feast) onFeast(m.feast.x, m.feast.y, m.feast.life);
  // the world is drawn INTERP_MS behind — so are the flash and sound of a catch, otherwise they'd get ahead of the head
  for (const [x, y, c, by, v] of m.fly || []) setTimeout(() => onFlyCaught(x, y, c, by === net.youId, v), INTERP_MS);
  for (const k of m.kill || []) {
    const vs = k.v !== net.youId && net.snakes.get(k.v);
    if (vs) setTimeout(() => burst(vs, k.k !== net.youId), INTERP_MS);
    if (k.k === net.youId) {
      const v = net.snakes.get(k.v);
      onMyKill(k.v, k.vm, k.km, v ? v.segs[0] : null, v ? segColor(v.skin, 0) : GOLD);
    }
  }
}
function onStats(m) {
  if ('rv' in m) net.rv = m.rv;
}
function readFoods(dv, o, n, out) { for (let i = 0; i < n; i++, o += FR) out.push(readFood(dv, o)); return o; }
function onBinary(buf) {
  const dv = new DataView(buf);
  const type = dv.getUint8(0);
  if (type === 2) { // all food around at once — changes before it are no longer needed
    net.foods.clear();
    net.foodQ = [];
    const all = [];
    readFoods(dv, 5, dv.getUint32(1, true), all);
    for (const f of all) addNetFood(...f);
    return;
  }
  if (type === 3) { // the cells around changed: remove food from the ones that left, the ones that entered come in full
    let o = 1;
    const drop = new Set();
    const nl = dv.getUint8(o++);
    for (let i = 0; i < nl; i++) drop.add(dv.getUint8(o++));
    const ne = dv.getUint8(o++);
    for (let i = 0; i < ne; i++) drop.add(dv.getUint8(o++));
    for (const [id, f] of net.foods) if (drop.has(f.cell)) net.foods.delete(id);
    // changes in the queue aren't applied yet — don't bring back their food from these cells
    for (const q of net.foodQ) q.added = q.added.filter((f) => !drop.has(f[6]));
    const all = [];
    readFoods(dv, o + 4, dv.getUint32(o, true), all);
    for (const f of all) addNetFood(...f);
    return;
  }
  if (type === 4) { // what happened to food during a step — applied when the picture reaches that step
    const tick = dv.getUint32(1, true), added = [], removed = [];
    let o = readFoods(dv, 7, dv.getUint16(5, true), added);
    const nr = dv.getUint16(o, true); o += 2;
    for (let i = 0; i < nr; i++, o += 4) removed.push(dv.getUint32(o, true));
    net.foodQ.push({ tick, added, removed });
    while (net.foodQ.length > 120) applyFood(net.foodQ.shift()); // the tab is minimized — don't pile up
    return;
  }
  if (type !== 1) return;
  let o = 1;
  const tick = dv.getUint32(o, true); o += 4;
  if (tick <= net.lastTick) return; // snapshots come without retransmits and may arrive out of order: an old one is ignored
  net.lastTick = tick;
  net.lastSnap = performance.now();
  const n = dv.getUint16(o, true); o += 2;
  const snakes = new Map();
  for (let i = 0; i < n; i++) {
    const id = dv.getUint32(o, true);
    const x = dv.getInt16(o + 4, true) / 4, y = dv.getInt16(o + 6, true) / 4;
    const a = dv.getUint16(o + 8, true) / 65535 * TAU, ta = dv.getUint16(o + 10, true) / 65535 * TAU;
    const mass = dv.getFloat32(o + 12, true), fl = dv.getUint8(o + 16);
    o += 17;
    if (id === net.youId) continue;
    snakes.set(id, { x, y, a, ta, mass, boost: !!(fl & 1), inv: !!(fl & 2), stage: Math.min((fl >> 2) & 7, STAGE_R.length - 1) });
    const sn = net.snakes.get(id);
    if (sn) sn.seen = true;
  }
  const flies = new Map();
  const nf = o < dv.byteLength ? dv.getUint8(o++) : 0;
  for (let i = 0; i < nf; i++, o += FLR) {
    const top = [];
    for (let k = 0; k < 5; k++) { const c = dv.getUint8(o + 11 + k); if (c !== 255) top.push(c); }
    flies.set(dv.getUint16(o, true), { x: dv.getInt16(o + 2, true) / 4, y: dv.getInt16(o + 4, true) / 4,
      dir: dv.getUint16(o + 6, true) / 65535 * TAU, n: dv.getUint16(o + 8, true) / 100, dart: dv.getUint8(o + 10) & 1, top });
  }
  const sample = performance.now() - tick * TICK_MS;
  net.offset = net.offset === null ? sample : Math.min(sample, net.offset + 2);
  net.buf.push({ tick, snakes, flies });
  while (net.buf.length > 40) net.buf.shift(); // the tab is minimized — frames aren't drawn and the buffer isn't consumed; don't pile up old ones
}
function applyFood(q) {
  for (const f of q.added) addNetFood(...f);
  for (const id of q.removed) net.foods.delete(id);
}
function netUpdate(now, dt) {
  const rt = now - net.offset - INTERP_MS;
  while (net.foodQ.length && net.foodQ[0].tick * TICK_MS <= rt) applyFood(net.foodQ.shift());
  const buf = net.buf;
  if (!buf.length) { net.flies = []; return; }
  while (buf.length >= 2 && buf[1].tick * TICK_MS <= rt) buf.shift();
  const s0 = buf[0];
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
    if (sn.stage === undefined) { sn.stage = b.stage; sn.r = STAGE_R[b.stage]; } // seen for the first time — no molt
    else { setStage(sn, b.stage); growR(sn, dt); }
    sn.isBoosting = b.boost;
    sn.inv = b.inv ? 1 : 0;
    const h = sn.segs[0];
    h.x = a0.x + (b.x - a0.x) * t; h.y = a0.y + (b.y - a0.y) * t;
    followChain(sn.segs, spacingOf(sn.mass));
    fitLength(sn.segs, countOf(sn.mass));
  }
  net.flies = [];
  for (const [id, b] of s1.flies) {
    if (net.claimed.has(id)) continue; // our own catch isn't awaited — the butterfly disappears at once
    const a0 = s0.flies.get(id) || b;
    net.flies.push({ id, x: a0.x + (b.x - a0.x) * t, y: a0.y + (b.y - a0.y) * t, dir: a0.dir + angDiff(b.dir, a0.dir) * t,
      n: b.n, dart: b.dart, top: b.top, ph: (id * 2.39996) % TAU });
  }
  const last = buf[buf.length - 1];
  for (const [id, sn] of net.snakes) if (sn.seen && !sn.visible && !last.snakes.has(id)) net.snakes.delete(id);
  // food is pulled toward heads, as in the host's world — otherwise it disappears before anyone crawls up to it.
  // Only in the visible area: nobody would see it off screen.
  const hw = W / 2 / cam.z + 80, hh = H / 2 / cam.z + 80, k = Math.min(1, dt * 7);
  const heads = [];
  for (const sn of net.snakes.values()) {
    if (!sn.visible) continue;
    const h = sn.segs[0];
    if (Math.abs(h.x - cam.x) < hw && Math.abs(h.y - cam.y) < hh) heads.push(sn);
  }
  if (me) heads.push(me);
  for (const f of net.foods.values()) {
    if (f.life > 0) f.age += dt;
    if (!heads.length || Math.abs(f.x - cam.x) > hw || Math.abs(f.y - cam.y) > hh) continue;
    for (const sn of heads) {
      const h = sn.segs[0], reach = sn.r + 40, dx = h.x - f.x, dy = h.y - f.y;
      if (dx > reach || dx < -reach || dy > reach || dy < -reach) continue;
      if (dx * dx + dy * dy < reach * reach) { f.x += dx * k; f.y += dy * k; }
    }
  }
}
function netInput(now) {
  if (!me || ui === 'dead') return;
  // the room menu (or the button setup from it) is open — the game doesn't stop, a careful autopilot steers the snake
  if (ui === 'play' && (roomMenuOpen() || fabEdit)) {
    if (now - auto.t >= AUTO_MS) { auto.t = now; auto.ta = safeCourse(me, sceneSnakes(), net.foods.values(), auto.ta, DIFF[net.diff]); me.ta = auto.ta; }
    me.boost = false; net.lastB = false;
    return;
  }
  if (auto.ta !== null) { // hand back the controls: the stale joystick course and a cursor over the menu button aren't a command to turn
    auto.ta = null; auto.t = -1e9;
    joy.angle = me.a; mouse.has = false;
  }
  const { a, b } = steer();
  if (a !== null) me.ta = a;
  me.boost = b; net.lastB = b;
}
const AUTO_MS = 80;                     // the pause autopilot in a room (safeCourse in core.js) decides every 80 ms
const auto = { t: -1e9, ta: null };
const roomMenuOpen = () => !$('dlg').hidden && /\bpzs?\b/.test($('dlgBox').className); // the pause dialog (or its "Sounds") is the room menu
// your own snake: movement by the rules of core.js, collisions with what's visible on screen, food and butterflies too
function selfStep(dt, now) {
  if (!me || !net.link || ui === 'conn') return;
  const sim = net.sim, m0 = me.mass;
  World.prototype.moveSnake.call(sim, me, dt);
  if (sim.pending.length) { sim.pending = []; selfDie(null); return; } // the arena edge (on medium and hard)
  const h = me.segs[0];
  if (me.inv <= 0) {
    for (const o of net.snakes.values()) {
      if (!o.visible || o.inv || (me.team && o.team === me.team)) continue;
      const rr = me.r * 0.55 + o.r * 0.85, rr2 = rr * rr, reach = bodyLenOf(o.mass) + o.r + me.r + 40;
      if (Math.abs(o.segs[0].x - h.x) > reach || Math.abs(o.segs[0].y - h.y) > reach) continue;
      for (const q of o.segs) {
        const dx = q.x - h.x, dy = q.y - h.y;
        if (dx * dx + dy * dy < rr2) { selfDie(o); return; }
      }
    }
  }
  for (const [id, f] of net.foods) {
    const dx = h.x - f.x, dy = h.y - f.y, er = me.r * 0.8 + f.r;
    if (dx * dx + dy * dy >= er * er) continue;
    me.mass += f.v; me.eaten += f.v; net.eaten += f.v;
    onGulp(f);
    net.foods.delete(id);
    net.ate.set(id, now);
    net.eatQ.push(id);
  }
  if (me.mass > m0 + 0.5 && !me.isBoosting) sfx.eat();
  for (const f of net.flies) {
    const rr = me.r * 0.8 + flyRadius(f.n) * (0.5 + 0.4 * flyEase(me));
    if ((h.x - f.x) ** 2 + (h.y - f.y) ** 2 < rr * rr) { net.claimed.set(f.id, now); netSend({ t: 'fly', id: f.id }); }
  }
  if (now - net.lastSent >= SELF_MS) selfSend(now);
}
function selfSend(now) {
  net.lastSent = now;
  if (!net.link) return;
  if (me) net.link.fast(encodeSelf(me, net.seq++));
  if (net.eatQ.length) { netSend({ t: 'eat', ids: net.eatQ }); net.eatQ = []; }
  if (net.dropQ.length) { netSend({ t: 'drop', f: net.dropQ }); net.dropQ = []; }
  // what we ate and caught ourselves — remember it for a couple of seconds until the host removes it on its side
  for (const [id, t] of net.ate) if (now - t > 2000) net.ate.delete(id);
  for (const [id, t] of net.claimed) if (now - t > 2000) net.claimed.delete(id);
}
function selfDie(killer) {
  const dead = me;
  selfSend(performance.now());
  // where we crashed goes right in the message (reliably): the remains land where it's visible on screen
  netSend({ t: 'die', by: killer ? killer.id : 0, at: [Math.round(dead.x), Math.round(dead.y), dead.mass] });
  me = null;
  onNetDeath({ by: killer ? killer.name : null, byId: killer ? killer.id : 0, mass: Math.floor(dead.mass), max: Math.floor(dead.maxMass), eaten: dead.eaten }, dead);
}
function onNetDeath(m, dead) {
  sfx.die();
  auto.ta = null; auto.t = -1e9; // crashed on autopilot — after "Continue" the controls are the player's as they are
  burst(dead, false); camKick(0, 9);
  net.deadInfo = m;
  ui = 'dead';
  onLifeEnd(Math.max(m.eaten || 0, net.eaten), m.max);
  net.eaten = 0;
  run.revenge = m.byId ? { id: m.byId, name: m.by } : null; // hit the edge — nobody to take revenge on
  net.rv = null;
  const who = m.who || (m.by ? t('oops.by', esc(m.by)) : t('oops.edge'));
  setTimeout(() => {
    if (ui !== 'dead' || mode !== 'net') return;
    dialog(t('oops.title'), oopsHtml(who, m.mass, net.diff),
      goOutActions(() => netSend({ t: 'respawn' }), leaveNet), { cls: 'oops', wait: 600 });
  }, 700);
}
function startNet(firstMsg) {
  mode = 'net'; ui = 'conn'; me = null; world = null; net.kills = 0; net.retry = 0; net.eaten = 0;
  run = null; feast = null; clearFx();
  pickBackdrop();
  netReset();
  net.leaving = false;
  stopHosting();
  if (firstMsg.t === 'create') {
    dialog(t('net.creating'), `<p>${t('net.creatingText')}</p>`, [{ label: t('btn.cancel'), kind: 'text', onClick: leaveNet }]);
    hostRoom(firstMsg);
  } else {
    dialog(t('net.joining'), `<p>${t('net.joiningText')}</p>`, [{ label: t('btn.cancel'), kind: 'text', onClick: leaveNet }]);
    joinRoom(firstMsg.code, false);
  }
}
function leaveNet() {
  net.leaving = true;
  clearTimeout(net.retryTimer);
  netSend({ t: 'leave' });
  const link = net.link;
  net.link = null;
  // a guest — let "leave" go out, the host — close the room for everyone
  if (link) setTimeout(() => link.close(), 100);
  stopHosting();
  try { history.replaceState(null, '', location.pathname); } catch { /* */ }
  toHome();
}
async function shareRoom() {
  const url = `${location.origin}${location.pathname}?room=${net.code}`;
  const text = t('share.text', net.code);
  try {
    if (navigator.share) { await navigator.share({ title: t('app.name'), text, url }); return; }
  } catch { return; }
  try { await navigator.clipboard.writeText(url); snack(t('share.copied')); } catch { snack(t('share.code', net.code)); }
}
$('roomChip').addEventListener('click', shareRoom);

// ---------- solo game ----------
function startSolo(diff) {
  mode = 'solo'; diffKey = diff;
  world = new World({ diff, botNames: BOT_NAMES });
  me = world.addHuman({ name: soloName(), skin: save.skin, inv: 2 });
  cam.x = me.x; cam.y = me.y;
  cam.z = baseZoom() * 1.3;
  playTime = 0; sessionBest = START_MASS; hudT = 0; lastSoloMass = me.mass;
  run = newRun(diff); feast = null; clearFx(); clearGlow();
  pickBackdrop();
  world.track = true; // eaten food — for the crumbs flying into the mouth
  $('roomBox').hidden = true;
  showHome(false);
  closeDialog();
  ui = 'play';
  showHint();
}
function soloEvents(events) {
  for (const e of events) {
    if (e.type === 'feast') { if (mode === 'solo') onFeast(e.x, e.y, e.life); continue; }
    if (e.type === 'fly') { onFlyCaught(e.x, e.y, e.c, mode === 'solo' && e.by === me, e.v); continue; }
    if (e.type === 'kill' && e.victim !== me) burst(e.victim, !(e.killer && e.killer === me && mode === 'solo'));
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
  burst(me, false); camKick(0, 9);
  const who = killer ? t('oops.by', esc(killer.name)) : t('oops.edge');
  const dead = me;
  onLifeEnd(dead.eaten, dead.maxMass);
  // you can continue on any level: how much length is kept depends on the level (keepMass)
  const isNew = recordBest();
  ui = 'dead';
  run.revenge = killer && killer.alive ? { id: killer.id, name: killer.name } : null;
  dialog(t('oops.title'), oopsHtml(who, dead.mass, diffKey) + (isNew ? `<p class="record">${icon('trophy')}${t('oops.record')}</p>` : ''),
  goOutActions(() => {
    me = world.addHuman({ name: soloName(), skin: save.skin, mass: keepMass(diffKey, dead.mass), inv: 3 });
    ui = 'play'; closeDialog(); onRespawn();
  }, toHome), { cls: 'oops', wait: 600 });
}

// ---------- game flow: molts, places, streaks, feast, revenge ----------
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
  setFeast({ x, y, life }); // neither an arrow nor a sound — players find the feast themselves (design decision)
}
// a butterfly was caught: a flash in the crumbs' color; if we caught it — a sound and stars (a full butterfly is more generous)
function onFlyCaught(x, y, c, mine, v) {
  effects.push({ x, y, t: time, c: shade(PAL[c] || GOLD_C, 0.3), r: 12 });
  pollen(x, y, PAL[c] ? c : GOLD);
  if (!mine && inView(x, y)) placed(x, y, sfx.chime);
  if (!mine || !run) return;
  sfx.fly();
  addXp(3 + Math.floor(v / 10));
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
  camKick(n >= 2 || vm > km ? 0.06 : 0.035, 0);
  if (mode === 'solo') slowUntil = time + 0.07; // a moment of slow motion — a win feels weightier
  // wins aren't written out: a flash where the snake was and a sound, a streak sounds brighter
  if (run.revenge && run.revenge.id === id) { run.revenge = null; xp += 40; sfx.combo(3); }
  else if (n >= 2) sfx.combo(n);
  else if (vm > km * 1.5 && vm > 300) sfx.combo(2);
  else sfx.win();
  addXp(xp);
}
const RANK_STEPS = [[SNAKES_N >> 1, 10, false], [10, 40, true], [3, 80, true], [2, 120, true], [1, 200, true]]; // [place, stars, wave]
// place and the number of snakes in the arena
function myRank() {
  if (!me) return null;
  if (mode === 'net') {
    const lb = net.lb;
    if (!lb) return null;
    let r = 1;
    for (let i = 2; i < lb.mm.length; i += 3) if (lb.mm[i] > me.mass) r++;
    // mm includes us too — with the old mass; don't count ourselves
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
    const st = me.stage || 0; // a molt is seen and heard on the snake itself (moltCheck), here — stars for a new stage within the game
    if (st > run.maxStage) { run.maxStage = st; addXp(st * 30); }
    const rk = myRank();
    if (rk && playTime > 3) {
      if (rk.rank < run.bestRank) run.bestRank = rk.rank;
      for (const [lim, xp, flash] of RANK_STEPS) {
        if (rk.rank <= lim && !run.flags.has(lim)) {
          run.flags.add(lim);
          addXp(xp);
          if (flash) flashMe(1, sfx.title);
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
// where the offender is: {x, y} — known, null — far away and not visible, false — it's gone
function revengeTarget() {
  const rv = run && run.revenge;
  if (!rv) return null;
  if (mode === 'solo') {
    const s = world.byId.get(rv.id);
    return s && s.alive ? s.segs[0] : false;
  }
  const s = net.snakes.get(rv.id);
  if (s && s.visible) return s.segs[0];
  if (net.rv === 0) return false;      // the host said the offender is gone
  return net.rv ? { x: net.rv[0], y: net.rv[1] } : null;
}
// stars for the game and how many are left until the next skin
function unlockHtml(xp, fresh) {
  const nx = nextSkin();
  const prev = nx ? Math.max(0, ...SKINS.filter(unlocked).map((x) => x.stars)) : 0;
  const bar = nx ? `<div class="bar"><i style="width:${(100 * clamp((save.xp - prev) / (nx.stars - prev), 0, 1)).toFixed(1)}%"></i></div>` +
    `<small>${t('unlock.next', esc(skinName(nx)), nx.stars - stars())}</small>` : `<small>${t('unlock.all')}</small>`;
  const got = fresh.length ? `<p class="record">${icon('star')}${t('unlock.got', fresh.map((sk) => esc(skinName(sk))))}</p>` : '';
  return `<div class="unlock"><span class="xp">${icon('star')}+${xp}</span>${bar}</div>${got}`;
}
const oopsHtml = (who, mass, diff) => {
  const keep = (DIFF[diff] || DIFF.easy).keep, left = Math.floor(keepMass(diff, mass));
  return `<p>${who}.</p><div class="big-num">${Math.floor(mass)}</div>` +
    `<p class="muted">${keep > 0 && left > START_MASS ? t('oops.keep', left, Math.round(keep * 100)) : t('oops.restart')}</p>`;
};
function finishRun() {
  if (!run) return '';
  runTick();
  const r = run;
  save.stats.games++;
  persist();
  const html = `<div class="big-num">${Math.floor(r.maxMass)}</div>${unlockHtml(r.xp, r.unlocked)}`;
  run = null;
  return html;
}

// ---------- menu, pause ----------
let pzSnake = null; // canvas of your own snake in the open pause dialog — drawn every frame
// volume in pause: the button turns sound off/on, the slider sets the volume (0 is the same as off)
const volHtml = () => `<div class="vol"><button class="btn text sound" id="volMute" aria-label="${t('a11y.sound')}"></button>` +
  `<input type="range" id="volRange" min="0" max="100" step="5" aria-label="${t('a11y.volume')}"></div>`;
function bindVol() {
  const btn = $('volMute'), rng = $('volRange');
  const show = () => {
    const v = soundOn() ? Math.round(save.vol * 100) : 0;
    rng.value = v; rng.style.setProperty('--p', `${v}%`);
    btn.innerHTML = icon(soundOn() ? 'vol' : 'volOff');
  };
  const quiet = (f) => { const h = save.haptic; save.haptic = false; f(); save.haptic = h; }; // sound preview — without vibration
  const check = () => { unlockHtmlAudio(); quiet(sfx.title); setTimeout(() => snack(audioStatus()), 500); }; // you hear right away whether sound works
  btn.addEventListener('click', () => {
    if (soundOn()) save.sound = false;
    else { save.sound = true; if (save.vol < 0.05) save.vol = VOL_DEF; }
    persist(); show();
    if (soundOn()) check(); else unlockHtmlAudio(); // the global gesture listener has already fired before the toggle
  });
  rng.addEventListener('input', () => {
    save.vol = rng.value / 100; save.sound = save.vol > 0;
    show();
  });
  rng.addEventListener('change', () => { persist(); unlockHtmlAudio(); if (soundOn()) quiet(sfx.win); }); // released — a test sound
  show();
}
// vibration — only where it exists (phone, tablet); turn it on and you feel what it's like right away
const hapHtml = () => (hasHaptic() ? `<label class="sw-row">${icon('vibration')}<span>${t('set.haptic')}</span>` +
  `<input type="checkbox" class="m3-switch" id="hapSw"${save.haptic ? ' checked' : ''}></label>` : '');
function bindHap() {
  const sw = $('hapSw');
  if (!sw) return;
  sw.addEventListener('change', () => { save.haptic = sw.checked; persist(); if (save.haptic) haptic('kill'); });
}
// on a touch screen — the boost button setup as well
const fabBtnHtml = () => (isTouch ? `<button class="fab-set" id="btnFabSet">${icon('bolt')}<span>${t('set.fab')}</span>${icon('right')}</button>` : '');
function bindFabBtn() { const b = $('btnFabSet'); if (b) b.addEventListener('click', startFabEdit); }
// food, boost, crash and molt sounds to choose from (sounds.js); in tabs, pick one and you hear it right away
const SND_GROUPS = [['eat', EAT], ['boost', BOOST], ['crash', CRASH], ['molt', MOLT]];
let sndTab = 'eat';
const sndBtnHtml = () => `<button class="fab-set" id="btnSnd">${icon('music')}<span>${t('set.sounds')}</span>${icon('right')}</button>`;
function bindSndBtn() { $('btnSnd').addEventListener('click', soundsDialog); }
function previewSound(k, i) {
  unlockHtmlAudio(); loadEat();
  if (!soundOn()) { snack(t('snd.off')); return; }
  stopBoostPreview();
  if (k === 'eat') [0, 2, 4].forEach((st, j) => setTimeout(() => playEat(i, st), j * 180)); // three crumbs in a row
  else if (k === 'boost') { // a click and a second and a half of boost
    BOOST[i].start(SND);
    if (BOOST[i].loop && canSound()) {
      try { const w = startLoop(BOOST[i], 0.05 * save.vol * save.vol); boostPreview = { w, timer: setTimeout(stopBoostPreview, 1500) }; } catch { /* old WebKit */ }
    }
  } else if (k === 'crash') CRASH[i].play(SND);
  else MOLT[i].play(SND, 1, MOLT_CHARGE);
}
function soundsDialog() {
  const tabs = SND_GROUPS.map(([k]) => `<button data-tab="${k}"${k === sndTab ? ' class="on"' : ''}>${t('snd.' + k)}</button>`).join('');
  // class pzs: in a room, while it's open the autopilot steers, as in the room menu (roomMenuOpen)
  dialog(t('set.sounds'), `<div class="tabs snd-tabs">${tabs}</div><div class="snd-opts" id="sndOpts"></div>`,
    [{ label: t('btn.done'), kind: 'filled', onClick: menuDialog }], { cls: 'pzs' });
  const opts = $('sndOpts');
  const show = () => {
    const [k, set] = SND_GROUPS.find((g) => g[0] === sndTab);
    opts.innerHTML = set.map((o, i) => `<button class="snd-opt${save.snd[k] === i ? ' on' : ''}" data-i="${i}">${esc(t(`snd.${k}.${o.id}`))}</button>`).join('');
    $('dlgBody').querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === sndTab));
  };
  $('dlgBody').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { sndTab = b.dataset.tab; stopBoostPreview(); show(); }));
  opts.addEventListener('click', (e) => {
    const b = e.target.closest('.snd-opt'); if (!b) return;
    const i = Number(b.dataset.i);
    save.snd[sndTab] = i; persist();
    opts.querySelectorAll('.snd-opt').forEach((x) => x.classList.toggle('on', x === b));
    previewSound(sndTab, i);
  });
  show();
}
function openMenu() {
  if (ui !== 'play' || fabEdit) return;
  if (mode === 'solo') ui = 'paused';
  menuDialog();
}
// pause (and the room menu): your snake wiggles at the top (drawWave every frame), length and place; "Continue" is big and yellow,
// settings sit in a card, "Back to menu" is a full button. A design decision based on mockups (the "with the snake" variant).
function pauseHtml(note, goLabel) {
  const rk = myRank();
  return `<div class="pz-chips"><span class="pz-chip">${icon('ruler')}<b id="pzLen">${curLen()}</b></span>` +
    `<span class="pz-chip gold"${rk ? '' : ' hidden'}>${icon('trophy')}${t('pause.place', `<b id="pzRank">${rk ? rk.rank : ''}</b>`)}</span></div>` + note +
    `<button class="btn filled pz-go" id="pzGo">${icon('play')}${goLabel}</button>` +
    `<div class="pz-list">${volHtml()}${sndBtnHtml()}${hapHtml()}${fabBtnHtml()}</div>` +
    `<button class="btn pz-out" id="pzOut">${icon('home')}${t('pause.out')}</button>`;
}
function pauseDialog(title, note, goLabel, go, out) {
  dialog(title, pauseHtml(note, goLabel), [], { cls: 'pz', top: '<canvas id="pzSnake"></canvas>' });
  pzSnake = $('pzSnake');
  $('pzGo').addEventListener('click', go); $('pzOut').addEventListener('click', out);
  bindVol(); bindSndBtn(); bindHap(); bindFabBtn();
}
function menuDialog() {
  if (mode === 'solo' && ui === 'paused') pauseDialog(t('pause.title'), '', t('btn.continue'), resume, toHome);
  else if (mode === 'net' && ui === 'play') {
    pauseDialog(t('room.title', net.code), `<p class="pz-note">${t('room.note', net.roomMode === 'team', t('diff.' + net.diff))}` +
      (net.isHost ? ' ' + t('room.hostNote') : '') + '</p>', t('btn.play'), closeDialog, leaveNet);
  }
}
function resume() { if (ui === 'paused') { ui = 'play'; closeDialog(); last = performance.now(); } }
$('btnMenu').addEventListener('click', openMenu);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
  if (document.hidden && mode === 'solo') openMenu();
  if (!document.hidden && mode === 'net' && !net.link && !net.leaving && ui !== 'conn') netReconnect();
});
window.addEventListener('pagehide', persist);

function toHome() {
  if (mode === 'solo' && me) recordBest();
  if (run) finishRun();
  mode = null; me = null; ui = 'home'; feast = null; clearFx(); clearGlow();
  closeDialog();
  endFabEdit();
  hideHint();
  world = new World({ diff: 'easy', bots: SNAKES_N >> 1, foodN: FOOD_N >> 1, botNames: BOT_NAMES }); // the demo behind the menu — half as heavy as the game, for phones
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

// ---------- dialogs and snackbar ----------
let dialogWait = 0;
// "Oops!": in a row — "Menu" on the left (design decision: it stays on the left, as before), the big yellow "Continue" on the right
const goOutActions = (go, out) => [{ label: t('btn.menu'), kind: 'pz-out', icon: 'home', onClick: out }, { label: t('btn.continue'), kind: 'filled pz-go', icon: 'play', onClick: go }];
// wait — for how many ms after appearing the buttons can't be pressed (inert: neither by touch nor by keyboard)
function dialog(title, body, actions, { cls = '', top = '', wait = 0 } = {}) {
  endFabEdit(); // the game ended or was left while the button was being set up
  stopBoostPreview(); // the boost preview from "Sounds" doesn't keep playing over the new dialog
  pzSnake = null; // a new dialog over the pause — its snake and chips are gone
  $('dlgBox').className = `dialog ${cls}`;
  $('dlgTop').innerHTML = top;
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
  // "Oops!" appears while the finger is still steering: the buttons are disabled for `wait` (the host would close the room for everyone)
  clearTimeout(dialogWait);
  box.inert = wait > 0;
  if (wait) dialogWait = setTimeout(() => { box.inert = false; }, wait);
  $('dlg').dataset.kind = cls;
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
// success (place, skin) is shown not as text but as a wave of golden glow along your snake from head to tail:
// the beads on the crest flash and swell a little. Text got in the way of playing — design decision.
const GLOW_DUR = 1.1;
let glow = null; // { t0, waves }
function flashMe(waves, sound) {
  if (glow && glow.who === me && time - glow.t0 < GLOW_DUR * glow.waves * 0.5) { // already running — don't restart
    if (waves <= glow.waves) return;           // and don't repeat the sound: several successes at once — one signal
    glow.waves = waves;
  } else glow = { t0: time, waves, who: me }; // a new snake after "Continue" doesn't pick up the old one's wave
  if (sound) sound();
}
function clearGlow() { glow = null; }
// glow strength of bead i out of n (0…1), or null if there's no wave
function glowOf(n) {
  if (!glow) return null;
  const t = (time - glow.t0) / GLOW_DUR;
  if (t >= glow.waves) { glow = null; return null; }
  const p = (t % 1) * (n + 24) - 12, w = 5 + n * 0.08;
  return (i) => { const d = (i - p) / w; return d * d > 9 ? 0 : Math.exp(-d * d); };
}

// ---------- effects: gulp, sparks, camera kick ----------
function clearFx() { effects = []; gulps = []; lumps = []; sparks = []; sheds = []; kick.t = -9; slowUntil = 0; gulpT = -9; }
const inView = (x, y, m = 0) => Math.abs(x - cam.x) < W / 2 / cam.z + m && Math.abs(y - cam.y) < H / 2 / cam.z + m;
function onGulp(f) { // crumb f ({ x, y, r, c }) was eaten by your snake
  if (gulps.length < 40) gulps.push({ x: f.x, y: f.y, r: f.lr ?? foodLookOf(f.v), c: f.c, t: time });
  gulpT = time;
  if (!lumps.length || time - lumps[lumps.length - 1] > 0.12) { lumps.push(time); if (lumps.length > 5) lumps.shift(); }
}
function addSpark(x, y, vx, vy, c, r, life) {
  if (sparks.length >= 260) sparks.shift();
  sparks.push({ x, y, vx, vy, c, r, t: time, life });
}
// a snake died — its beads scatter as sparks of its colors
function burst(sn, sound = true) {
  const segs = sn && sn.segs, n = segs ? segs.length : 0;
  if (!n || !inView(segs[0].x, segs[0].y, bodyLenOf(sn.mass))) return;
  if (sound) placed(segs[0].x, segs[0].y, sfx.pop);
  const cnt = Math.min(30, 8 + (n >> 3)), sp = 70 + sn.r * 5;
  for (let j = 0; j < cnt; j++) {
    const i = Math.floor(j / cnt * n), q = segs[i];
    if (!inView(q.x, q.y, 60)) continue;
    const a = Math.random() * TAU, v = sp * (0.35 + Math.random());
    addSpark(q.x, q.y, Math.cos(a) * v, Math.sin(a) * v, segColor(sn.skin, i), sn.r * (0.45 + Math.random() * 0.4), 0.45 + Math.random() * 0.4);
  }
}
// sound of an arena event: from the side of the screen where it is, quieter toward the edge; silent in the demo behind the menu
const lastPlaced = new Map();
function placed(x, y, play) {
  if (!mode) return;
  const now = performance.now();
  if (now - (lastPlaced.get(play) || 0) < 100) return; // several identical ones at once — one sound
  lastPlaced.set(play, now);
  const px = (x - cam.x) * cam.z / (W / 2), py = (y - cam.y) * cam.z / (H / 2);
  play(clamp(px, -1, 1) * 0.8, clamp(1 - 0.45 * Math.hypot(px, py), 0.35, 1));
}
// a near miss: the head passed right by another body — a whistle from that side (and a tick on Android).
// Fires when entering the gap; again — after moving away and half a second passing
let nearArmed = true, nearT = 0, nearOdd = false;
function checkNear() {
  if (!mode || ui !== 'play' || !me || me.alive === false || me.inv > 0) { nearArmed = true; return; }
  if ((nearOdd = !nearOdd)) return; // every other frame: the sound doesn't need frame accuracy
  const h = me.segs[0], close = Math.max(6, me.r * 0.6);
  let gap = Infinity, gx = 0, gy = 0;
  for (const o of sceneSnakes()) {
    if (o === me || (o.alive === false) || (o.team && o.team === me.team)) continue;
    const reach = bodyLenOf(o.mass) + o.r + me.r + close + 40;
    if (Math.abs(o.segs[0].x - h.x) > reach || Math.abs(o.segs[0].y - h.y) > reach) continue;
    const segs = o.segs, lim = o.r + me.r + close * 2.5;
    for (let i = 0; i < segs.length; i += 2) {
      const dx = segs[i].x - h.x, dy = segs[i].y - h.y;
      if (dx > lim || dx < -lim || dy > lim || dy < -lim) continue;
      const g = Math.hypot(dx, dy) - o.r - me.r;
      if (g < gap) { gap = g; gx = dx; gy = dy; }
    }
  }
  if (gap > close * 2.5) { nearArmed = true; return; }
  if (gap < close && nearArmed && time - nearT > 0.5) {
    nearArmed = false; nearT = time;
    sfx.near(Math.abs(gx) > 2 ? Math.sign(gx) * 0.6 : 0); // the body is left of the head on screen — whistle on the left
  }
}
// pollen of a caught butterfly
function pollen(x, y, c) {
  if (!inView(x, y, 60)) return;
  for (let j = 0; j < 12; j++) {
    const a = Math.random() * TAU, v = 40 + Math.random() * 110;
    addSpark(x, y, Math.cos(a) * v, Math.sin(a) * v - 30, j % 3 ? c : GOLD, 3 + Math.random() * 4, 0.5 + Math.random() * 0.5);
  }
}
// camera kick: z — how much to zoom in, shake — shaking (screen points). With "Reduce motion" — no kicks
function camKick(z, shake) {
  if (REDUCED) return;
  const left = Math.exp(-(time - kick.t) * 9);
  kick.z = Math.max(z, kick.z * left); kick.shake = Math.max(shake, kick.shake * left); kick.t = time;
}
// your own snake: the head swells after a gulp, a lump rolls along the body
const LUMP_V = 45; // beads per second
function lumpAt(i) {
  let a = 0;
  for (const t of lumps) {
    const age = time - t, d = (i - age * LUMP_V) / 3;
    if (d * d < 9) a += Math.exp(-d * d - age * 1.2);
  }
  return a > 1 ? 1 : a;
}
const headBump = () => { const k = (time - gulpT) / 0.18; return k < 1 ? 1 - k : 0; };

// controls hint — only in the first game on a device
let hintTimer = 0;
function showHint() {
  if (save.hinted) return;
  const h = $('hint');
  h.textContent = inputKind === 'touch' ? t('hint.touch') : t('hint.mouse');
  h.hidden = false; h.classList.remove('fade');
  save.hinted = true; persist();
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { h.classList.add('fade'); hintTimer = setTimeout(hideHint, 700); }, 6000);
}
function hideHint() { clearTimeout(hintTimer); $('hint').hidden = true; }

// ---------- home screen ----------

// snake picker (design decision, variant "B"): arrows and swiping the snake change the type (beads, fish, …),
// colored swatches under the name are that type's skins; locked ones are dim with a lock. Only unlocked ones can be played.
let viewSkin = save.skin;
const viewAt = (k) => { viewSkin = k; if (unlocked(SKINS[k])) { save.skin = k; persist(); } renderHome(); };
// to type ti: your own skin if it's of that type; otherwise the last unlocked one; if all are locked — the first (shows its price)
const toType = (ti) => {
  if (SKINS[save.skin].type === ti && unlocked(SKINS[save.skin])) return save.skin;
  const open = SKINS_OF[ti].filter((i) => unlocked(SKINS[i]));
  return open.length ? open[open.length - 1] : SKINS_OF[ti][0];
};
const stepSkin = (d) => viewAt(toType((SKINS[viewSkin].type + d + TYPES.length) % TYPES.length));
// a skin swatch: its colors as sectors
const swatchBg = (k) => {
  const cols = [...new Set(SKINS[k].p.map((p) => PAL[p]))].slice(0, 8);
  return cols.length > 1 ? `conic-gradient(${cols.map((c, i) => `${c} ${(i / cols.length * 100).toFixed(1)}% ${((i + 1) / cols.length * 100).toFixed(1)}%`).join(',')})` : cols[0];
};
$('swatches').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) viewAt(+b.dataset.k); });
$('skinPrev').addEventListener('click', () => stepSkin(-1));
$('skinNext').addEventListener('click', () => stepSkin(1));
// swiping the snake flips through too
let swipeX = null;
const pv = $('preview');
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
  $('typeName').textContent = typeName(sk.type);
  $('skinName').textContent = skinName(sk);
  const focusK = document.activeElement?.closest?.('#swatches button')?.dataset.k; // keyboard: focus stays on the selected swatch
  $('swatches').innerHTML = SKINS_OF[sk.type].map((k) => {
    const op = unlocked(SKINS[k]);
    return `<button data-k="${k}" class="${k === viewSkin ? 'on' : ''}${op ? '' : ' locked'}" aria-pressed="${k === viewSkin}" style="background:${swatchBg(k)}" aria-label="${esc(op ? skinName(SKINS[k]) : t('skin.locked', skinName(SKINS[k])))}">${op ? '' : icon('lock')}</button>`;
  }).join('');
  if (focusK !== undefined) $('swatches').querySelector(`[data-k="${focusK}"]`)?.focus();
  $('skinLock').innerHTML = open ? '' : `${icon('lock')}${t('skin.left', sk.stars - stars())}`;
  document.querySelectorAll('#diff button').forEach((b) => b.classList.toggle('on', b.dataset.d === save.diff));
  const v = save.best[save.diff] || 0;
  $('best').innerHTML = v ? `${icon('trophy')}${t('home.best', v)}` : '';
}

// preview: skin k's snake crawls in a wave in place (home — the selected one, pause — your own)
const drawPreview = () => drawWave(pv, viewSkin);
function drawWave(cv, k) {
  const cw = cv.clientWidth, ch = cv.clientHeight;
  if (!cw || !ch) return;
  if (cv.width !== Math.round(cw * DPR) || cv.height !== Math.round(ch * DPR)) { cv.width = Math.round(cw * DPR); cv.height = Math.round(ch * DPR); }
  const g = cv.getContext('2d'), sk = SKINS[k], open = unlocked(sk);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  const r = Math.min(ch * 0.14, cw / 26), n = 34, sp = r * 0.62, len = n * sp;
  const x0 = cw / 2 + len / 2, cy = ch / 2;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 - i * sp;
    pts.push({ x, y: cy + Math.sin(x / (r * 3.2) + time * 3) * ch * 0.2 }); // the bends run from head to tail — it crawls head first
  }
  g.globalAlpha = open ? 1 : 0.35;
  for (let i = n - (n & 1); i >= 2; i -= 2) {
    const q = pts[i], p = pts[i - 1], o = pts[i + 1] || q;
    const rr = i > n - 6 ? r * (0.55 + 0.45 * (n - i) / 6) : r;
    let dx = p.x - o.x, dy = p.y - o.y;
    const sc = DPR * rr / BEAD_U / (Math.hypot(dx, dy) || 1);
    dx *= sc; dy *= sc;
    g.setTransform(dx, dy, -dy, dx, DPR * q.x, DPR * q.y);
    const sp = beadSprite(k, segColor(k, i), beadVar(k, i));
    g.drawImage(sp, -sp.e, -sp.e);
  }
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const h = pts[0], a = Math.atan2(h.y - pts[1].y, h.x - pts[1].x);
  drawHead(g, k, h.x, h.y, a, a, r);
  g.globalAlpha = 1;
}

// the name is only needed when playing together: the others in the room see it
const nameFieldHtml = () => '<div class="field name-field"><input id="nick" maxlength="12" autocomplete="off" placeholder=" ">' +
  `<label for="nick">${t('name.label')}</label></div>`;
function bindName() {
  const el = $('nick');
  el.value = save.name;
  el.addEventListener('input', () => { save.name = el.value.trim().slice(0, 12); persist(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
}
// play together: create a room or join with a code
let createOpts = { mode: 'team', diff: 'easy' };
function segHtml(name, opts) {
  return `<div class="seg" data-seg="${name}">${opts.map(([v, l]) =>
    `<button data-v="${v}" class="${createOpts[name] === v ? 'on' : ''}">${icon('check')}${l}</button>`).join('')}</div>`;
}
function openTogether() {
  if (navigator.onLine === false) {
    dialog(t('net.need'), `<p>${t('net.needText')}</p>`, [{ label: t('btn.ok'), kind: 'filled', onClick: closeDialog }]);
    return;
  }
  dialog(t('btn.together'), nameFieldHtml() +
    `<button class="btn filled big wide" id="dCreate">${icon('group')}${t('together.create')}</button>` +
    `<div class="or">${t('together.or')}</div>` +
    '<div class="join"><div class="field"><input id="code" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder=" ">' +
    `<label for="code">${t('together.code')}</label></div><button class="btn tonal big" id="dJoin">${t('btn.join')}</button></div>`,
    [{ label: t('btn.close'), kind: 'text', onClick: closeDialog }]);
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
  dialog(t('newroom.title'),
    `<div class="sub">${t('newroom.mode')}</div>${segHtml('mode', [['team', t('newroom.team')], ['ffa', t('newroom.ffa')]])}` +
    '<p class="hint" id="modeHint"></p>' +
    `<div class="sub">${t('newroom.bots')}</div>${segHtml('diff', [['easy', t('newroom.easy')], ['medium', t('newroom.medium')], ['hard', t('newroom.hard')]])}`,
    [{ label: t('btn.cancel'), kind: 'text', onClick: closeDialog },
      { label: t('btn.create'), kind: 'filled', onClick: () => startNet(hello({ t: 'create', ...createOpts })) }]);
  const hint = () => {
    $('modeHint').textContent = createOpts.mode === 'team'
      ? t('newroom.teamHint')
      : t('newroom.ffaHint');
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

// ---------- how to play and offline ----------
const isStandalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ||
  (window.matchMedia && matchMedia('(display-mode: fullscreen)').matches) || navigator.standalone === true;
function installHint() {
  if (isStandalone) return '';
  if (IOS) return t('install.ios');
  if (/Android/.test(navigator.userAgent)) return t('install.android');
  return '';
}
let offline = { cls: '', ic: 'cloudOff', text: t('offline.checking') };
$('btnInfo').addEventListener('click', () => {
  const ctl = isTouch ? t('help.touch') : t('help.mouse');
  const ih = installHint();
  dialog(t('a11y.help'), `<p>${ctl}</p><p>${t('help.cut')}</p>` +
    `<p>${t('help.stars')}</p>` +
    `<div class="note ${offline.cls}">${icon(offline.ic)}<span>${offline.text}${ih ? ` ${ih}` : ''}</span></div>` + `<p class="muted">${t('help.version', VERSION)}</p>` + (IOS_PWA ? `<p class="muted">${screenInfo()}</p>` : ''),
  [{ label: t('btn.ok'), kind: 'filled', onClick: closeDialog }]);
});
let updatesWatched = false;
async function checkOffline() {
  const set = (cls, ic, text) => { offline = { cls, ic, text }; }; // shown in "How to play"
  if (!('serviceWorker' in navigator) || !window.caches) { set('warn', 'cloudOff', t('offline.unsupported')); return; }
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
    if (ok) set('ok', 'cloudDone', t('offline.ok'));
    else { set('', 'cloudOff', t('offline.saving')); setTimeout(checkOffline, 1500); }
  } catch (e) {
    set('warn', 'cloudOff', t('offline.fail', esc(e.message)));
  }
}
checkOffline();

// ---------- camera ----------
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
    // molt: the camera first keeps the old zoom — you see the snake getting thicker — and only then smoothly pulls back
    if (target.moltT !== undefined && time - target.moltT < MOLT_FX + 0.2) tr = STAGE_R[target.moltFrom];
  }
  // the thicker the snake, the farther the camera — a giant needs to see whom it's surrounding
  let zt = baseZoom() * clamp(1.3 * Math.pow(11 / tr, 0.5), 0.5, 1.3);
  if (mode === null) zt *= 0.8;
  cam.z += (zt - cam.z) * Math.min(1, dt * 2);
}

// ---------- drawing ----------
const GULP_DUR = 0.12;
let lastDt = 0; // frame step — for sparks (no frames are drawn in pause)
const camT = { k: 1, e: 0, f: 0 }; // the current frame's camera matrix: set by draw(), beads are rotated by it
// boost: a wave runs along the segments from head to tail, each glowing in its own color
const boostWave = (i) => { const w = 0.5 + 0.5 * Math.sin(time * 16 - i * 0.22); return w * w; };
const isMate = (s) => mode === 'net' && net.roomMode === 'team' && s.human && s.team && s.team === net.myTeam;
// ---------- molt ----------
// First a glow runs from tail to head (MOLT_CHARGE s), then a wave rolls from head to tail: behind it the beads
// already have the new thickness and outfit, on the crest they swell and overshoot. The old skin stays behind as a pale
// shadow and crumbles into sparks (sheds). The world thickness (s.r) grows after the same MOLT_WAIT pause over MOLT_T — together with the wave.
const MOLT_CHARGE = MOLT_WAIT, MOLT_FX = 1.35, SHED_T = 1.3; // the world thickness starts growing together with the wave
let sheds = []; // { t, pts, r, skin, st, burst }
// noticed the snake has molted (the stage grew since the last frame); seen for the first time — no molt
function moltCheck(s) {
  const st = s.stage || 0;
  if (s.seenSt === undefined) { s.seenSt = st; return; }
  if (st <= s.seenSt) return;
  s.moltFrom = s.seenSt; s.seenSt = st; s.moltT = time;
  const segs = s.segs, h = segs[0];
  if (s === me) { sfx.molt(st); s.moltKick = true; }
  else if (inView(h.x, h.y)) placed(h.x, h.y, sfx.moltFar);
  if (!inView(h.x, h.y, bodyLenOf(s.mass)) || REDUCED) return;
  const stride = Math.max(2, Math.ceil(segs.length / 160) * 2), pts = [];
  for (let i = 0; i < segs.length; i += stride) pts.push({ x: segs[i].x, y: segs[i].y, c: segColor(s.skin, i) });
  if (sheds.length >= 6) sheds.shift();
  sheds.push({ t: time + MOLT_CHARGE, pts, r: STAGE_R[s.moltFrom], skin: s.skin, st: s.moltFrom, burst: false });
}
// old skin: pale silhouettes of the beads at the previous thickness over the snake, fading and crumbling into sparks
function drawSheds(vx0, vy0, vx1, vy1) {
  sheds = sheds.filter((d) => time - d.t < SHED_T);
  const k = camT.k;
  for (const d of sheds) {
    const p = (time - d.t) / SHED_T;
    if (p < 0) continue;
    const pts = d.pts, n = pts.length;
    if (!d.burst && p > 0.45) { // crumbles
      d.burst = true;
      for (let j = 0; j < Math.min(28, n); j++) {
        const q = pts[Math.floor(j / Math.min(28, n) * n)], a = Math.random() * TAU, v = 40 + Math.random() * 120;
        addSpark(q.x, q.y, Math.cos(a) * v, Math.sin(a) * v, j % 2 ? 11 : q.c, d.r * (0.25 + Math.random() * 0.25), 0.5 + Math.random() * 0.4);
      }
    }
    ctx.globalAlpha = 0.65 * (1 - p) * (1 - p);
    const rr = d.r * (1 + 0.25 * p);
    for (let i = n - 1; i >= 1; i--) {
      const q = pts[i];
      if (q.x < vx0 - rr || q.x > vx1 + rr || q.y < vy0 - rr || q.y > vy1 + rr) continue;
      const o = pts[i - 1];
      let dx = o.x - q.x, dy = o.y - q.y;
      const dd = Math.hypot(dx, dy) || 1, sc = k * rr / BEAD_U / dd;
      dx *= sc; dy *= sc;
      ctx.setTransform(dx, dy, -dy, dx, k * q.x + camT.e, k * q.y + camT.f);
      const sp = beadSprite(d.skin, q.c, 0, 2, d.st);
      ctx.drawImage(sp, -sp.e, -sp.e);
    }
    ctx.setTransform(k, 0, 0, k, camT.e, camT.f);
  }
  ctx.globalAlpha = 1;
}
// shimmer from the 5th stage up: narrow light bands run along the body from head to tail
const shimmerAt = (i) => { const w = Math.sin(i * 0.11 - time * 2.6); return w > 0.6 ? 0.6 * Math.pow(w, 16) : 0; };
function drawSnake(s, vx0, vy0, vx1, vy1) {
  moltCheck(s);
  const segs = s.segs, st = s.stage || 0;
  const h = segs[0], n = segs.length;
  // a molt is in progress: mp — seconds since it started; rOld/rNew — thickness before and after
  const mp = s.moltT === undefined ? 9 : time - s.moltT, molting = mp < MOLT_FX;
  const rNew = STAGE_R[st], rOld = molting ? STAGE_R[s.moltFrom] : s.r, r = molting ? rNew : s.r;
  const charging = molting && mp < MOLT_CHARGE;
  const front = !molting ? 0 : charging ? (1 - mp / MOLT_CHARGE) * (n + 10) : (mp - MOLT_CHARGE) / (MOLT_FX - MOLT_CHARGE) * (n + 30) - 10;
  const fw = 4 + n * 0.04;
  // the molt wave at bead i: pass — whether it has passed (0…1), bump — the crest (0…1)
  const passAt = (i) => (!molting ? 1 : charging ? 0 : clamp(0.5 + (front - i) / 3, 0, 1));
  const bumpAt = (i) => { if (!molting) return 0; const d = (i - front) / (charging ? 6 : fw); return d * d > 9 ? 0 : Math.exp(-d * d); };
  const baseR = (i) => (molting ? rOld + (rNew - rOld) * passAt(i) : r);
  if (s === me && s.moltKick && molting && !charging) { s.moltKick = false; camKick(0.09, 0); }
  const margin = bodyLenOf(s.mass) + r;
  if (h.x < vx0 - margin || h.x > vx1 + margin || h.y < vy0 - margin || h.y > vy1 + margin) return;
  const x0 = vx0 - r * 2, x1 = vx1 + r * 2, y0 = vy0 - r * 2, y1 = vy1 + r * 2;
  ctx.globalAlpha = s.inv > 0 ? 0.45 + 0.25 * Math.sin(time * 18) : 1;
  // beads are drawn every other segment: less overdraw, and the body still looks solid; a small one on screen — even sparser
  const step = r * cam.z < 3 ? 4 : 2;
  const a0 = ctx.globalAlpha, boost = s.isBoosting, gw = glow && s === glow.who ? glowOf(n) : null;
  if (st >= 5 && !molting) { // 6th stage: a golden glow around the body and sparkles from the tail
    const g = r * 1.9;
    ctx.globalAlpha = a0 * 0.16;
    for (let i = (n - 1) & ~1; i >= 0; i -= 6) {
      const q = segs[i];
      if (q.x < x0 - g || q.x > x1 + g || q.y < y0 - g || q.y > y1 + g) continue;
      ctx.drawImage(glowSprite(GOLD), q.x - g, q.y - g, g * 2, g * 2);
    }
    ctx.globalAlpha = a0;
    const t = segs[n - 1];
    if (time - (s.sparkT || 0) > 0.14 && t.x > x0 && t.x < x1 && t.y > y0 && t.y < y1) {
      s.sparkT = time;
      const a = Math.random() * TAU;
      addSpark(t.x, t.y, Math.cos(a) * 40, Math.sin(a) * 40, GOLD, r * 0.22, 0.6);
    }
  }
  if (gw) { // a golden halo under the crest of the success wave
    const g = r * 2.6;
    for (let i = (n - 1) & ~1; i >= 0; i -= step) {
      const w = gw(i), q = segs[i];
      if (w < 0.05 || q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue;
      ctx.globalAlpha = a0 * w;
      ctx.drawImage(glowSprite(GOLD), q.x - g, q.y - g, g * 2, g * 2);
    }
    ctx.globalAlpha = a0;
  }
  if (molting) { // molt: the glow runs to the head (white), then the wave crest glows in the beads' colors
    for (let i = (n - 1) & ~1; i >= 0; i -= 2) {
      const w = bumpAt(i), q = segs[i];
      if (w < 0.05 || q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue;
      const g = baseR(i) * (charging ? 2.2 : 2.8);
      ctx.globalAlpha = a0 * w * (charging ? 0.9 : 0.75);
      ctx.drawImage(glowSprite(charging ? 11 : segColor(s.skin, i)), q.x - g, q.y - g, g * 2, g * 2);
    }
    ctx.globalAlpha = a0;
  }
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
  // a bead is rotated along the body: matrix — world camera × rotation × scale
  const k = camT.k;
  const tail = Math.min(10, n >> 2);
  // bead radius: the tail tapers; on the crest of the success wave — wider
  const mine = s === me && lumps.length > 0;
  const radAt = (i, gwi) => { const b = baseR(i); return (i > n - tail ? b * (0.55 + 0.45 * (n - i) / tail) : b) * (1 + 0.22 * gwi + 0.3 * (charging ? 0 : bumpAt(i)) + (mine ? 0.16 * lumpAt(i) : 0)); };
  // edge > 0 — the outline pass: bead silhouettes wider by edge; otherwise the beads themselves
  const beads = (edge) => {
    for (let i = (n - 1) & ~1; i >= 2; i -= step) {
      const q = segs[i];
      if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue;
      const gwi = gw ? gw(i) : 0;
      const rr = radAt(i, gwi);
      const p = segs[i - 1], o = segs[i + 1] || q;
      let dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
      if (d < 1e-6) { dx = Math.cos(s.a); dy = Math.sin(s.a); d = 1; } // neighbors coincide (the tail while growing) — use the head's course
      const sc = k * (rr + edge) / BEAD_U / d;
      dx *= sc; dy *= sc;
      ctx.setTransform(dx, dy, -dy, dx, k * q.x + camT.e, k * q.y + camT.f);
      // a small snake is drawn every other bead — then pattern and colors alternate over the drawn ones, otherwise they'd freeze on one
      const ci = step === 4 ? i >> 1 : i, c = segColor(s.skin, ci), v = beadVar(s.skin, ci);
      const bst = passAt(i) > 0.5 ? st : s.moltFrom; // behind the molt wave — already the new outfit
      if (edge) { const sp = beadSprite(s.skin, c, v, 2, bst); ctx.drawImage(sp, -sp.e, -sp.e); continue; }
      const sp = beadSprite(s.skin, c, v, 0, bst);
      ctx.drawImage(sp, -sp.e, -sp.e);
      const lit = Math.max(boost ? boostWave(i) : 0, gwi, molting ? bumpAt(i) : 0, bst >= 4 ? shimmerAt(i) : 0);
      if (lit > 0.25) { const sl = beadSprite(s.skin, c, v, 1, bst); ctx.globalAlpha = a0 * lit; ctx.drawImage(sl, -sl.e, -sl.e); ctx.globalAlpha = a0; }
    }
    ctx.setTransform(k, 0, 0, k, camT.e, camT.f);
    drawHead(ctx, s.skin, h.x, h.y, s.a, s.ta, baseR(0), (1 + 0.22 * (gw ? gw(0) : 0) + (charging ? 0 : 0.3 * bumpAt(0))) * (s === me ? 1 + 0.13 * headBump() : 1), edge);
  };
  // your own snake gets a light outline: under the beads their silhouettes slightly wider (shaped like the type — with crest, legs, ears)
  if (s === me) beads(1 / cam.z);
  beads(0);
  ctx.globalAlpha = 1;

  const rv = run && run.revenge && run.revenge.id === s.id;
  if (rv) { // offender: a red ring around the head
    ctx.beginPath(); ctx.arc(h.x, h.y, r * 1.7 + 4 * Math.sin(time * 6), 0, TAU);
    ctx.lineWidth = 3 / cam.z; ctx.strokeStyle = REVENGE; ctx.stroke();
  }
  const place = podium.indexOf(s.id);
  if (place >= 0) drawCrown(h.x, h.y - r - 30 / cam.z, Math.max(r * 0.6, 10 / cam.z) * CROWNS[place][2], undefined, place);
  if (mode !== null) {
    ctx.font = `500 ${Math.round(13 / cam.z)}px Roboto, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = s === me ? PRIMARY : rv ? REVENGE : isMate(s) ? TERTIARY : hexA(ON, 0.75);
    ctx.fillText(s.name, h.x, h.y - r - 10 / cam.z);
  }
}
function drawCrown(x, y, w, lw = 2 / cam.z, place = 0) {
  ctx.beginPath();
  ctx.moveTo(x - w, y); ctx.lineTo(x - w, y - w * 0.9); ctx.lineTo(x - w * 0.5, y - w * 0.45); ctx.lineTo(x, y - w * 1.1);
  ctx.lineTo(x + w * 0.5, y - w * 0.45); ctx.lineTo(x + w, y - w * 0.9); ctx.lineTo(x + w, y); ctx.closePath();
  ctx.fillStyle = CROWNS[place][0]; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = CROWNS[place][1]; ctx.stroke();
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
// an arrow at the screen edge toward a target beyond it
const meLive = () => me && (mode === 'net' || me.alive) && ui !== 'dead';
// where the leaderboard leader is, if it's not me: in a room — their head if visible, otherwise the position from the leaderboard (once a second)
function leaderTarget() {
  if (!leaderId || !meLive() || leaderId === (mode === 'net' ? net.youId : me.id)) return null;
  if (mode === 'solo') { const s = world.byId.get(leaderId); return s && s.alive ? s.segs[0] : null; }
  const s = net.snakes.get(leaderId);
  if (s && s.visible) return s.segs[0];
  const mm = net.lb && net.lb.mm;
  return mm && mm.length >= 2 && net.lb.top[0] && net.lb.top[0][0] === leaderId ? { x: mm[0] * 25, y: mm[1] * 25 } : null;
}
function drawPointer(tx, ty, color, crown = false) {
  const sx = W / 2 + (tx - cam.x) * cam.z, sy = H / 2 + (ty - cam.y) * cam.z;
  // the arrow tip is about 9 px from the screen edge (the arrow center is pad from the edge; stays out of screen cutouts)
  const pad = 30, pl = pad + safe.l, pr = pad + safe.r, pb = pad + safe.b;
  const underHud = hudBoxes.some((b) => sx > b.left && sx < b.right && sy < b.bottom); // the head is under the score or the leaderboard — not visible
  if (sx > pl && sx < W - pr && sy > pad + safe.t && sy < H - pb && !underHud) return;
  const dx = sx - W / 2, dy = sy - H / 2;
  const at = (pt) => { const k = Math.min((W / 2 - (dx < 0 ? pl : pr)) / Math.abs(dx || 1e-6), (H / 2 - (dy < 0 ? pt : pb)) / Math.abs(dy || 1e-6)); return [W / 2 + dx * k, H / 2 + dy * k]; };
  let [px, py] = at(pad + safe.t);
  // ran into the score or the leaderboard — drop below them (with room for the arrow and crown)
  if (hudBoxes.some((b) => px > b.left - 48 && px < b.right + 48 && py < b.bottom + 24)) { // 48 — arrow with crown
    const pt = Math.max(pad + safe.t, hudBottom + 24);
    [px, py] = at(pt);
  }
  const a = Math.atan2(dy, dx);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.save();
  ctx.translate(px, py); ctx.rotate(a);
  const bob = 3 * Math.sin(time * 6);
  ctx.beginPath(); ctx.moveTo(18 + bob, 0); ctx.lineTo(-8 + bob, -12); ctx.lineTo(-3 + bob, 0); ctx.lineTo(-8 + bob, 12); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
  ctx.restore();
  if (crown) { // the crown next to the arrow, closer to the screen center
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawCrown(px - Math.cos(a) * 26, py - Math.sin(a) * 26 + 6, 8, 1.5);
  }
}
function sceneSnakes() {
  if (mode === 'net') { const out = []; for (const s of net.snakes.values()) if (s.visible) out.push(s); return out; }
  return world ? world.snakes : [];
}
function sceneFoods() { return mode === 'net' ? net.foods.values() : (world ? world.foods : []); }
function sceneFlies() { return mode === 'net' ? net.flies : (world ? world.flies : []); }

// butterfly: two brackets with crumbs of what it ate inside (up to five, growing with fullness); the brackets shimmer in the crumbs' colors
const FLY_C = '#A8EBFF';
const canConic = typeof CanvasRenderingContext2D !== 'undefined' && 'createConicGradient' in CanvasRenderingContext2D.prototype;
function drawFly(f) {
  const sc = flyScale(f.n), k = flyK(f.n);
  const flap = 0.2 + 0.8 * Math.abs(Math.sin(time * (f.dart ? 24 : 11) + f.ph));
  const cnt = f.n > 0.5 ? Math.min(5, Math.ceil(f.n / (FLY_MAX / 5))) : 0;
  const cols = [];
  for (let i = 0; i < cnt; i++) cols.push(f.top[i % Math.max(1, Math.min(f.top.length, cnt))] ?? GOLD);
  ctx.save();
  ctx.translate(f.x, f.y); ctx.scale(sc, sc);
  if (!cnt) { ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, TAU); ctx.fillStyle = hexA(FLY_C, 0.6); ctx.fill(); }
  const r = 1.5 + 1.1 * k, rho = cnt <= 1 ? 0 : Math.min(7.2 - r, Math.max(r / Math.sin(Math.PI / cnt) * 1.08, 2.5));
  for (let i = 0; i < cnt; i++) {
    const a = i * TAU / cnt + time * 0.8 + f.ph, x = Math.cos(a) * rho, y = Math.sin(a) * rho, hex = PAL[cols[i]] || GOLD_C;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = hex; ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill(); // glint
  }
  ctx.rotate(f.dir);
  let st = FLY_C;
  if (cnt) {
    const uniq = [...new Set(cols)].map((c) => shade(PAL[c] || GOLD_C, 0.3));
    if (uniq.length > 1 && canConic) {
      st = ctx.createConicGradient(time * 0.8 + f.ph, 0, 0);
      uniq.concat([uniq[0]]).forEach((c, i, arr) => st.addColorStop(i / (arr.length - 1), c));
    } else st = uniq[0];
  }
  ctx.strokeStyle = st; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  const span = 1.2 + 1.2 * flap;
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(0, 0, 9.5, sd * Math.PI / 2 - span / 2, sd * Math.PI / 2 + span / 2); ctx.stroke(); }
  ctx.restore();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = OUTSIDE;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // camera kick: zoom and shake fade quickly
  const kt = time - kick.t, kf = kt < 0.5 ? Math.exp(-kt * 9) : 0;
  const z = cam.z * (1 + kick.z * kf), sh = kick.shake * kf;
  const ox = sh ? sh * Math.sin(kt * 71) : 0, oy = sh ? sh * Math.cos(kt * 53) : 0;
  camT.k = DPR * z; camT.e = DPR * (W / 2 + ox - cam.x * z); camT.f = DPR * (H / 2 + oy - cam.y * z);
  ctx.setTransform(camT.k, 0, 0, camT.k, camT.e, camT.f);
  drawBackdrop(ctx, backdrop || pickBackdrop(), R, cam, z, W, H, time);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU);
  ctx.lineWidth = 10; ctx.strokeStyle = EDGE; ctx.stroke();

  const hw = W / 2 / z, hh = H / 2 / z;
  const vx0 = cam.x - hw - 30, vx1 = cam.x + hw + 30, vy0 = cam.y - hh - 30, vy1 = cam.y + hh + 30;
  if (feast && time < feast.until) { // a golden glow under the feast
    const g = ctx.createRadialGradient(feast.x, feast.y, 0, feast.x, feast.y, 420);
    g.addColorStop(0, 'rgba(255,212,71,0.22)'); g.addColorStop(1, 'rgba(255,212,71,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(feast.x, feast.y, 420, 0, TAU); ctx.fill();
  }
  for (const f of sceneFoods()) {
    if (f.x < vx0 || f.x > vx1 || f.y < vy0 || f.y > vy1) continue;
    ctx.globalAlpha = f.life > 0 && f.life - f.age < 3 ? Math.max(0, (f.life - f.age) / 3) : 1;
    const rr = (f.lr ??= foodLookOf(f.v)) * 1.9 * (1 + 0.12 * Math.sin(time * 3 + f.ph)); // size by value (f.r is for eating)
    ctx.drawImage(foodSprite(f.c), f.x - rr, f.y - rr, rr * 2, rr * 2);
  }
  ctx.globalAlpha = 1;

  const snakes = sceneSnakes();
  // small ones on top of big ones: this way you see who cuts off whom
  const order = snakes.filter((s) => s !== me).sort((a, b) => b.mass - a.mass);
  for (const s of order) drawSnake(s, vx0, vy0, vx1, vy1);
  if (me && (mode === 'net' || me.alive)) drawSnake(me, vx0, vy0, vx1, vy1);
  if (sheds.length) drawSheds(vx0, vy0, vx1, vy1);
  for (const f of sceneFlies()) if (f.x > vx0 - 40 && f.x < vx1 + 40 && f.y > vy0 - 40 && f.y < vy1 + 40) drawFly(f);

  if (lumps.length && time - lumps[0] > 3) lumps.shift();
  // crumbs fly into your snake's mouth
  if (gulps.length) {
    const h = me && me.segs.length ? me.segs[0] : null;
    gulps = gulps.filter((g) => time - g.t < GULP_DUR);
    if (h) {
      for (const g of gulps) {
        const k = (time - g.t) / GULP_DUR, e = k * k, rr = g.r * 1.9 * (1 - 0.75 * k);
        const x = g.x + (h.x - g.x) * e, y = g.y + (h.y - g.y) * e;
        ctx.globalAlpha = 1 - k * 0.5;
        ctx.drawImage(foodSprite(g.c), x - rr, y - rr, rr * 2, rr * 2);
      }
    }
    ctx.globalAlpha = 1;
  }
  // sparks: fly, slow down, fade
  if (sparks.length) {
    sparks = sparks.filter((p) => time - p.t < p.life);
    const drag = Math.exp(-3.2 * lastDt);
    for (const p of sparks) {
      p.vx *= drag; p.vy *= drag; p.x += p.vx * lastDt; p.y += p.vy * lastDt;
      const k = (time - p.t) / p.life, rr = p.r * (1 - 0.5 * k) * 2.2;
      if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
      ctx.globalAlpha = (1 - k) * (1 - k);
      ctx.drawImage(foodSprite(p.c), p.x - rr, p.y - rr, rr * 2, rr * 2);
    }
    ctx.globalAlpha = 1;
  }

  // win flashes
  effects = effects.filter((e) => time - e.t < 0.8);
  for (const e of effects) {
    const k = (time - e.t) / 0.8;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.5 + k * 5), 0, TAU);
    ctx.lineWidth = (6 * (1 - k) + 1) / z; ctx.strokeStyle = e.c; ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (mode) { // at the screen edge — only where the leader is (course, offender and feast aren't shown — design decision)
    const lt = leaderTarget();
    if (lt) drawPointer(lt.x, lt.y, GOLD_C, true);
  }
  drawJoystick();
}

let hudT = 0, hudBottom = 100, hudBoxes = [];
function curLen() {
  if (mode === 'solo' && me) return Math.floor(me.alive ? me.mass : me.maxMass);
  if (mode === 'net') return Math.floor(me ? me.mass : (net.deadInfo ? net.deadInfo.mass : 0));
  return 0;
}
function updateHud(dt) {
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.25;
  runTick();
  const rk = myRank();
  $('score').innerHTML = `<b>${curLen()}</b>${rk ? `<small>#${rk.rank}</small>` : ''}`;
  if (pzSnake) { $('pzLen').textContent = curLen(); $('pzRank').textContent = rk ? rk.rank : ''; $('pzRank').parentNode.hidden = !rk; } // room menu: the game goes on

  // top 3 and your own row: in solo — the whole world, in a room — from the host
  let rows;
  if (mode === 'net') rows = net.lb ? net.lb.top.map((t) => ({ id: t[0], name: t[1], mass: t[2], human: t[3], team: t[4] })) : [];
  else rows = sceneSnakes().filter((s) => s.alive).sort((a, b) => b.mass - a.mass).slice(0, 3);
  leaderId = rows.length ? rows[0].id : 0;
  podium = rows.slice(0, 3).map((s) => s.id);
  const myId = mode === 'net' ? net.youId : me && me.id;
  const row = (s, i) => {
    const cls = s.id === myId ? ' me' : (mode === 'net' && net.roomMode === 'team' && s.human && s.team === net.myTeam) ? ' mate' : '';
    const place = i < 3 ? `<span class="c c${i}">${icon('trophy').replace('class="i"', 'class="i" style="width:12px;height:12px;vertical-align:-1px"')}</span> ` : `${i + 1}. `;
    return `<div class="row${cls}"><span>${place}${esc(s.name)}</span><span>${Math.floor(s.mass)}</span></div>`;
  };
  let html = rows.slice(0, 3).map(row).join('');
  if (rk && rk.rank > 3 && me) html += `${rk.rank > 4 ? '<div class="gap">···</div>' : ''}${row({ id: myId, name: me.name, mass: me.mass }, rk.rank - 1)}`;
  $('board').innerHTML = html;
  // what's taken at the top (score, leaderboard, room) — the leader arrow avoids only those spots and sits at the edge between them
  hudBoxes = [$('board'), document.querySelector('.hud-tl'), $('roomBox')].map((e) => e.getBoundingClientRect()).filter((b) => b.width && b.top < H / 2);
  hudBottom = Math.max(...hudBoxes.map((b) => b.bottom), 0);
}

// solo game: what your snake ate (the world collects removed food while track is on)
function soloGulps(grew) {
  const rem = world.foodRemoved, h = grew ? me.segs[0] : null; // didn't grow — a neighbor was eating nearby
  if (h) {
    for (const f of rem) {
      if (f.life > 0 && f.age > f.life) continue; // melted away by itself
      const d = (me.r + f.r) * 1.6 + 10;
      if ((f.x - h.x) ** 2 + (f.y - h.y) ** 2 < d * d) onGulp(f);
    }
  }
  world.foodRemoved = []; world.foodAdded = [];
}

// ---------- main loop ----------
let last = performance.now();
let lastSoloMass = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  time += dt; lastDt = dt;
  if (feast && time > feast.until) feast = null;
  if (mode === 'net') {
    netInput(now);
    selfStep(dt, now);
    netUpdate(now, dt);
    if (ui === 'play') playTime += dt;
    // the host minimized the game — their room is frozen; tell the guest we're waiting
    if (!net.isHost && ui === 'play' && net.lastSnap && now - net.lastSnap > 2500) {
      if (!net.waitSnack) { net.waitSnack = true; snack(t('room.hostWait')); }
    } else net.waitSnack = false;
  } else if (ui !== 'paused') {
    if (mode === 'solo' && me && me.alive) {
      const { a, b } = steer();
      if (a !== null) me.ta = a;
      me.boost = b;
    }
    const m0 = me && me.alive ? me.mass : 0;
    if (world) soloEvents(world.step(mode === 'solo' && time < slowUntil ? dt * 0.25 : dt));
    if (mode === 'solo' && world.track) soloGulps(me && me.alive && me.mass > m0);
    if (mode === 'solo' && me && me.alive) {
      if (ui === 'play') playTime += dt;
      if (me.mass > lastSoloMass + 0.5 && !me.isBoosting) sfx.eat();
      lastSoloMass = me.mass;
      if (me.maxMass > sessionBest) sessionBest = me.maxMass;
    }
  }
  // boost: a click at the start and a rustle while held
  const boosting = !!(me && ui === 'play' && (mode === 'net' ? net.lastB && me.mass > MIN_BOOST_MASS : me.alive && me.isBoosting));
  if (boosting && !wasBoost) sfx.boost();
  wasBoost = boosting;
  setWhoosh(boosting);
  checkNear();
  if (ui !== 'paused') {
    updateCamera(dt);
    draw();
    if (mode) updateHud(dt);
    else if (!$('home').hidden && $('dlg').hidden) drawPreview();
  } else if (redraw && mode) draw(); // in pause the picture is still — redraw after the canvas was resized
  if (pzSnake && pzSnake.isConnected && !$('dlg').hidden) drawWave(pzSnake, save.skin); else pzSnake = null; // your own snake in pause
  redraw = false;
  checkSize(now);
  requestAnimationFrame(frame);
}

toHome();
requestAnimationFrame(frame);

// invitation via the ?room=1234 link
const inviteCode = new URLSearchParams(location.search).get('room');
if (inviteCode && /^\d{4}$/.test(inviteCode)) {
  dialog(t('room.title', inviteCode), `<p>${t('room.invite')}</p>${nameFieldHtml()}`,
    [{ label: t('btn.later'), kind: 'text', onClick: closeDialog }, { label: t('btn.join'), kind: 'filled', onClick: () => startNet(hello({ t: 'join', code: inviteCode })) }]);
  bindName();
}

// for automated tests
window.__snake = {
  get mode() { return mode; }, get ui() { return ui; }, get me() { return me; }, get world() { return world; },
  get net() { return net; }, auto, safeCourse, get joy() { return joy; }, get run() { return run; }, get save() { return save; }, get cam() { return cam; }, startSolo, sfx, get bg() { return backdrop && backdrop.kind; },
  get fx() { return { gulps: gulps.length, sparks: sparks.length, lumps: lumps.length, kick: kick.t, whoosh: !!whoosh, time }; },
};
