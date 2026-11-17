// Наборы звуков еды, столкновения и линьки — по 7 на выбор в паузе («Звуки»), выбор хранится в save.snd.
// Просьба владельца: ниже и мягче прежних. Основной тон 150–800 Гц (ниже динамик телефона почти не играет),
// обертоны выше ~1,5 кГц — только тихо; пилу и квадрат глушим фильтром (lp).
// a — кирпичики из client.js: a.n(частота, {...}) — нота, a.h({...}) — шорох; W — сколько бежит свечение линьки.

export const semi = (f, n) => f * Math.pow(2, n / 12);
const PENTA = [0, 2, 4, 7, 9, 12];

// еда: f — нота лада (ре первой октавы и выше, подряд поднимается по ступеням)
export const EAT = [
  { name: 'Ням', play: (a, f) => { a.n(f, { to: f * 1.3, dur: 0.09, vol: 0.22, a: 0.006 }); a.n(f * 0.75, { type: 'triangle', dur: 0.06, vol: 0.08 }); } },
  { name: 'Буль', play: (a, f) => a.n(f * 0.6, { to: f * 1.5, dur: 0.07, vol: 0.2, a: 0.004 }) },
  { name: 'Хрум', play: (a, f) => {
    a.h({ type: 'lowpass', f: 1400, q: 0.8, vol: 0.25, dur: 0.03 }); a.h({ type: 'lowpass', f: 1000, q: 0.9, vol: 0.18, dur: 0.035, delay: 0.035 });
    a.n(f * 0.75, { type: 'triangle', dur: 0.08, vol: 0.08 });
  } },
  { name: 'Чмок', play: (a, f) => { a.h({ f: 700, q: 2, vol: 0.3, dur: 0.025 }); a.n(f * 0.8, { to: f * 0.55, dur: 0.06, vol: 0.16 }); } },
  { name: 'Тук', play: (a, f) => { a.n(f, { vol: 0.2, a: 0.002, dur: 0.16 }); a.n(f * 3.9, { vol: 0.02, a: 0.001, dur: 0.04 }); } },
  { name: 'Кап', play: (a, f) => a.n(f * 1.2, { to: f * 0.6, dur: 0.08, vol: 0.2, a: 0.003 }) },
  { name: 'Пик', play: (a, f) => a.n(f * 0.75, { type: 'square', lp: 1600, dur: 0.06, vol: 0.08 }) },
];

// своя змейка разбилась
export const CRASH = [
  { name: 'Бум', play: (a) => {
    a.n(240, { type: 'triangle', to: 150, dur: 0.35, vol: 0.4, a: 0.003 });
    a.h({ type: 'lowpass', f: 900, f1: 150, q: 0.7, vol: 0.4, dur: 0.4 });
  } },
  { name: 'Ой-ой', play: (a) => {
    [[392, 0], [370, 0.17], [349, 0.34]].forEach(([f, d]) => a.n(f, { type: 'triangle', vol: 0.22, dur: 0.16, delay: d, a: 0.01 }));
    a.n(330, { type: 'triangle', to: 247, vol: 0.22, dur: 0.6, delay: 0.51, a: 0.02, vib: [9, 10] });
  } },
  { name: 'Шлёп', play: (a) => {
    a.h({ type: 'lowpass', f: 1200, f1: 200, q: 1, vol: 0.5, dur: 0.2, a: 0.001 });
    a.n(300, { to: 150, dur: 0.25, vol: 0.25 });
  } },
  { name: 'Бусы', play: (a) => {
    a.n(260, { type: 'triangle', to: 150, vol: 0.32, dur: 0.28, a: 0.003 });
    a.h({ type: 'lowpass', f: 1000, f1: 200, q: 0.7, vol: 0.3, dur: 0.3 });
    [784, 698, 880, 622, 740, 587, 659, 523].forEach((f, i) => a.n(f, { vol: 0.11 * (1 - i / 10), dur: 0.06, delay: 0.12 + i * 0.055 + Math.random() * 0.02, wet: 0.3 }));
  } },
  { name: 'Боинг', play: (a) => a.n(330, { to: 160, dur: 0.6, vol: 0.25, vib: [14, 40] }) },
  { name: 'Гонг', play: (a) => {
    a.n(247, { dur: 1.4, vol: 0.25, a: 0.005, wet: 0.4 }); a.n(247 * 1.5, { dur: 1.1, vol: 0.09 }); a.n(247 * 2.76, { dur: 0.9, vol: 0.07 });
    a.h({ type: 'lowpass', f: 600, q: 0.7, vol: 0.2, dur: 0.08 });
  } },
  { name: 'Сдулся', play: (a) => a.n(520, { type: 'sawtooth', lp: 1200, to: 170, dur: 0.8, vol: 0.13, vib: [22, 25] }) },
];

// своя линька: st — новая ступень (1…5), каждая следующая на тон выше; W с — свечение бежит к голове, потом раздувание
export const MOLT = [
  { name: 'Чудо', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2);
    a.h({ f: 300, f1: 1800, q: 2, vol: 0.12, dur: W + 0.05, a: W * 0.8 });
    a.n(150 * k, { to: 600 * k, dur: W, vol: 0.1, a: W * 0.7, detune: 8 }); a.n(150 * k, { to: 600 * k, dur: W, vol: 0.1, a: W * 0.7, detune: -8 });
    [262, 330, 392, 494].forEach((f) => a.n(f * k, { vol: 0.13, dur: 1.1, delay: W, a: 0.003, wet: 0.5 }));
    for (let i = 0; i < 8; i++) a.n(semi(784 * k, PENTA[(Math.random() * PENTA.length) | 0]), { vol: 0.04, dur: 0.12, delay: W + 0.1 + i * 0.08 + Math.random() * 0.04, wet: 0.6 });
  } },
  { name: 'Трубы', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2), t = { type: 'sawtooth', lp: 1800, a: 0.01 };
    a.n(196 * k, { ...t, vol: 0.15, dur: 0.14, delay: Math.max(0, W - 0.2) }); a.n(196 * k, { ...t, vol: 0.15, dur: 0.14, delay: Math.max(0, W - 0.08) });
    [262, 330, 392, 523].forEach((f, i) => a.n(f * k, { ...t, a: 0.02, vol: 0.12, dur: 0.85, delay: W + 0.04, detune: i * 3 - 4, wet: 0.35 }));
  } },
  { name: 'Каскад', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2);
    let d = 0;
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => { a.n(semi(196 * k, n), { type: 'triangle', vol: 0.17, dur: 0.14, delay: d, a: 0.003 }); d += 0.065 - i * 0.006; });
    [392, 494, 587, 784].forEach((f, i) => a.n(f * k, { vol: 0.13, dur: 0.7, delay: W + 0.02 + i * 0.015, wet: 0.5 }));
  } },
  { name: 'Орган', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2);
    [262, 330, 392, 523].forEach((f) => a.n(f * k, { type: 'triangle', vol: 0.1, a: W + 0.05, dur: W + 1.1, wet: 0.4 }));
    a.n(196 * k, { type: 'sawtooth', lp: 700, vol: 0.08, a: W, dur: W + 1.1 });
  } },
  { name: 'Арфа', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2), steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    steps.forEach((n, i) => a.n(semi(262 * k, n), { type: 'triangle', vol: 0.13, a: 0.002, dur: 0.35, delay: i * (W / steps.length), wet: 0.3 }));
    [262, 392, 523].forEach((f) => a.n(f * k, { type: 'triangle', vol: 0.11, a: 0.002, dur: 0.9, delay: W + 0.03, wet: 0.5 }));
  } },
  { name: 'Хор', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2);
    [262, 330, 392].forEach((f) => [-10, 10].forEach((dt) => a.n(f * k, { type: 'sawtooth', lp: 900, vol: 0.06, a: W, dur: W + 1.2, detune: dt, wet: 0.5, vib: [5, 3] })));
  } },
  { name: 'Взлёт', play: (a, st, W) => {
    const k = semi(1, (st - 1) * 2);
    a.h({ type: 'lowpass', f: 300, f1: 2500, q: 1.5, vol: 0.18, dur: W, a: W * 0.9 });
    a.n(160 * k, { to: 520 * k, dur: W, vol: 0.12, a: W * 0.8 });
    a.h({ f: 600, q: 1, vol: 0.3, dur: 0.06, delay: W });
    [392, 494, 587].forEach((f, i) => a.n(f * k, { type: 'triangle', vol: 0.14, dur: 0.6, delay: W + 0.04 + i * 0.05, wet: 0.4 }));
  } },
];
