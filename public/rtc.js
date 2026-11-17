// Direct connection between players (WebRTC). The site is only needed for the introduction: over /ws the browsers pass
// each other a few messages (offer, answer, addresses), then play directly, and the guest disconnects from the site.
// The host stays on /ws so that new players can join.
//
// The channel (link) is the same on both sides:
//   send(obj) — JSON, reliable and ordered; bin(u8) — binary, reliable and ordered; fast(u8) — binary without retransmits;
//   buffered() — how much is waiting to be sent on the reliable channel; close();
//   onjson(obj), onbin(ArrayBuffer), onclose() — set by the receiver.

// The other side's address behind a home router comes from a public STUN server; on the same home Wi-Fi it works without one.
export const ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const CONNECT_MS = 15000;    // how long we wait for a direct connection
const CHUNK = 8000;          // big messages are split: not every browser accepts more than 64 KB at once
const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
const asBuf = (u8) => (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.slice().buffer);

function makeLink(pc, r, u) {
  const link = { onjson: null, onbin: null, onclose: null, closed: false, pc };
  const safe = (fn) => { try { fn(); } catch { /* the channel has closed */ } };
  link.send = (o) => {
    if (r.readyState !== 'open') return;
    const s = JSON.stringify(o);
    if (s.length <= CHUNK) { safe(() => r.send(s)); return; }
    for (let i = 0; i < s.length; i += CHUNK) safe(() => r.send((i + CHUNK < s.length ? '\x01' : '\x02') + s.slice(i, i + CHUNK)));
  };
  link.bin = (u8) => {
    if (r.readyState !== 'open') return;
    if (u8.byteLength <= CHUNK) { safe(() => r.send(asBuf(u8))); return; }
    for (let i = 0; i < u8.byteLength; i += CHUNK) {
      const part = u8.subarray(i, Math.min(u8.byteLength, i + CHUNK)), m = new Uint8Array(part.byteLength + 1);
      m[0] = i + CHUNK < u8.byteLength ? 0xfe : 0xff; m.set(part, 1);
      safe(() => r.send(m.buffer));
    }
  };
  link.fast = (u8) => { if (u.readyState === 'open') safe(() => u.send(asBuf(u8))); };
  link.buffered = () => r.bufferedAmount;
  link.close = () => { if (!link.closed) { link.closed = true; safe(() => pc.close()); } };
  let text = '', parts = [];
  r.binaryType = 'arraybuffer'; u.binaryType = 'arraybuffer';
  r.onmessage = (e) => {
    if (typeof e.data === 'string') {
      const c = e.data.charCodeAt(0);
      if (c === 1) { text += e.data.slice(1); return; }
      let s = e.data;
      if (c === 2) { s = text + e.data.slice(1); text = ''; }
      let m;
      try { m = JSON.parse(s); } catch { return; }
      if (link.onjson) link.onjson(m);
      return;
    }
    const b = new Uint8Array(e.data);
    if (b[0] === 0xfe) { parts.push(b.subarray(1)); return; }
    if (b[0] === 0xff) {
      parts.push(b.subarray(1));
      const all = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
      let o = 0;
      for (const p of parts) { all.set(p, o); o += p.byteLength; }
      parts = [];
      if (link.onbin) link.onbin(all.buffer);
      return;
    }
    if (link.onbin) link.onbin(e.data);
  };
  u.onmessage = (e) => { if (link.onbin && typeof e.data !== 'string') link.onbin(e.data); };
  let lost = 0;
  const gone = () => {
    if (link.gone) return;
    link.gone = true; link.closed = true;
    clearTimeout(lost);
    safe(() => pc.close());
    if (link.onclose) link.onclose();
  };
  r.onclose = gone; u.onclose = gone;
  pc.addEventListener('connectionstatechange', () => {
    const st = pc.connectionState;
    if (st === 'failed' || st === 'closed') gone();
    else if (st === 'disconnected') { clearTimeout(lost); lost = setTimeout(gone, 5000); } // sometimes the connection comes back by itself
    else if (st === 'connected') clearTimeout(lost);
  });
  return link;
}

// the other side's addresses can arrive before its description — collect them
function signaler(pc, send) {
  const early = [];
  pc.onicecandidate = (e) => { if (e.candidate) send({ c: e.candidate.toJSON() }); };
  return {
    async remote(sdp) {
      await pc.setRemoteDescription(sdp);
      for (const c of early.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    },
    cand(c) { if (pc.remoteDescription) pc.addIceCandidate(c).catch(() => {}); else early.push(c); },
  };
}

// introduction channel: JSON over WebSocket to the site
function openSignal(onMsg, onClose) {
  const ws = new WebSocket(wsUrl());
  const sig = { ws, send: (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); }, close: () => { sig.closing = true; ws.close(); } };
  sig.opened = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = () => { if (!sig.closing) onClose(); };
  return sig;
}

// Host: keeps the introduction open and accepts guests. onPeer(link) — a new guest on a direct connection.
// When the connection to the site drops (phone went to sleep, network changed), reconnect with the same code; the game goes on without it.
export function host({ v, token, onCode, onPeer, onError }) {
  const h = { code: '', sig: null, pcs: new Map(), closed: false, tries: 0 };
  const MAX_PENDING = 8; // guests being introduced at the same time: no more than this (someone guessed the code and keeps sending joins)
  const connect = () => {
    if (h.closed) return;
    const sig = openSignal((m) => {
      if (m.t === 'code') { h.code = m.code; h.tries = 0; onCode(m.code); }
      else if (m.t === 'peer') offer(m.id);
      else if (m.t === 'sig') { const p = h.pcs.get(m.from); if (p) p.recv(m.data); }
      else if (m.t === 'err') { h.closed = true; sig.close(); onError(m.code); }
    }, () => {
      if (h.closed) return;
      if (!h.code) { h.closed = true; onError('net'); return; }
      setTimeout(connect, Math.min(10000, 1000 * ++h.tries));
    });
    h.sig = sig;
    sig.opened.then(() => sig.send({ t: 'host', v, token, code: h.code || undefined })).catch(() => {});
  };
  const offer = async (id) => {
    if (h.closed || h.pcs.size >= MAX_PENDING) return;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const r = pc.createDataChannel('r', { ordered: true });
    const u = pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 });
    const s = signaler(pc, (data) => h.sig.send({ t: 'sig', to: id, data }));
    const entry = {
      pc,
      async recv(d) {
        try { if (d.sdp) await s.remote(d.sdp); else if (d.c) s.cand(d.c); } catch { pc.close(); }
      },
    };
    h.pcs.set(id, entry);
    let open = 0;
    const timer = setTimeout(() => { if (open < 2) { pc.close(); h.pcs.delete(id); } }, CONNECT_MS);
    const ready = () => {
      if (++open < 2) return;
      clearTimeout(timer);
      h.pcs.delete(id);
      if (h.closed) { pc.close(); return; } // the host has already left this room
      onPeer(makeLink(pc, r, u));
    };
    r.onopen = ready; u.onopen = ready;
    try {
      await pc.setLocalDescription(await pc.createOffer());
      h.sig.send({ t: 'sig', to: id, data: { sdp: pc.localDescription.toJSON() } });
    } catch { pc.close(); h.pcs.delete(id); }
  };
  h.close = () => {
    h.closed = true;
    if (h.sig) h.sig.close();
    for (const p of h.pcs.values()) p.pc.close();
    h.pcs.clear();
  };
  connect();
  return h;
}

// Guest: gets introduced to the host of room `code` and receives a direct channel. Errors come as a string:
// 'no_room', 'version', 'old_host', 'net' (site unreachable), 'p2p' (couldn't connect directly).
export function join({ code, v }) {
  return new Promise((resolve, reject) => {
    let pc = null, done = false;
    const fail = (why) => { if (done) return; done = true; clearTimeout(timer); sig.close(); if (pc) pc.close(); reject(why); };
    const timer = setTimeout(() => fail('p2p'), CONNECT_MS);
    let s = null;
    const sig = openSignal(async (m) => {
      if (m.t === 'err') { fail(m.code); return; }
      if (m.t === 'joined') {
        pc = new RTCPeerConnection({ iceServers: ICE });
        s = signaler(pc, (data) => sig.send({ t: 'sig', to: 0, data }));
        const ch = {};
        pc.ondatachannel = (e) => {
          const d = e.channel;
          ch[d.label] = d;
          d.onopen = () => {
            if (!ch.r || !ch.u || ch.r.readyState !== 'open' || ch.u.readyState !== 'open' || done) return;
            done = true; clearTimeout(timer);
            sig.close(); // from here on — direct only
            resolve(makeLink(pc, ch.r, ch.u));
          };
        };
        return;
      }
      if (m.t === 'sig' && pc) {
        const d = m.data;
        try {
          if (d.sdp) {
            await s.remote(d.sdp);
            await pc.setLocalDescription(await pc.createAnswer());
            sig.send({ t: 'sig', to: 0, data: { sdp: pc.localDescription.toJSON() } });
          } else if (d.c) s.cand(d.c);
        } catch { fail('p2p'); }
      }
    }, () => fail(pc ? 'p2p' : 'net'));
    sig.opened.then(() => sig.send({ t: 'join', code, v })).catch(() => fail('net'));
  });
}

// Loopback inside the host's page: the host's own game talks to its room the same way guests do, just without the network.
export function loopback() {
  const mk = () => ({ onjson: null, onbin: null, onclose: null, closed: false, buffered: () => 0 });
  const a = mk(), b = mk();
  const wire = (from, to) => {
    from.send = (o) => { if (!from.closed) queueMicrotask(() => { if (!to.closed && to.onjson) to.onjson(o); }); };
    from.bin = (u8) => { if (!from.closed) { const buf = u8.slice().buffer; queueMicrotask(() => { if (!to.closed && to.onbin) to.onbin(buf); }); } };
    from.fast = from.bin;
    from.close = () => {
      if (from.closed) return;
      from.closed = true; to.closed = true;
      queueMicrotask(() => { if (to.onclose) to.onclose(); }); // like WebRTC: the other side learns about the close
    };
  };
  wire(a, b); wire(b, a);
  return [a, b];
}
