// Minimal dependency-free WebSocket server (RFC 6455): only what the game needs.
// The client sends short text frames; the server sends text and binary world snapshots.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function acceptUpgrade(req, socket, head, { maxPayload = 4096 } = {}) {
  const key = req.headers['sec-websocket-key'];
  if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const ws = new WebSocketConn(socket, maxPayload);
  if (head && head.length) setImmediate(() => ws.onData(head));
  return ws;
}

export class WebSocketConn extends EventEmitter {
  constructor(socket, maxPayload) {
    super();
    this.socket = socket;
    this.max = maxPayload;
    this.buf = Buffer.alloc(0);
    this.open = true;
    this.closed = false;
    this.lastSeen = Date.now();
    socket.on('data', (d) => this.onData(d));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
  }

  onData(d) {
    if (!this.open) return;
    this.lastSeen = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2); off = 4;
      } else if (len === 127) { this.close(1009); return; }
      if (len > this.max) { this.close(1009); return; }
      if (!masked) { this.close(1002); return; }
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      off += 4;
      const payload = Buffer.from(b.subarray(off, off + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + len);
      if (!fin) { this.close(1003); return; } // the game doesn't need fragmented frames
      if (op === 0x1) this.emit('message', payload.toString('utf8'));
      else if (op === 0x8) { this.close(1000); return; }
      else if (op === 0x9) this.sendFrame(0xA, payload);
      else if (op === 0xA) { /* pong: lastSeen is already updated */ }
      else { this.close(1003); return; }
    }
  }

  sendFrame(op, data) {
    if (!this.open) return;
    const len = data.length;
    let hdr;
    if (len < 126) hdr = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x80 | op; hdr[1] = 126; hdr.writeUInt16BE(len, 2); }
    else { hdr = Buffer.alloc(10); hdr[0] = 0x80 | op; hdr[1] = 127; hdr.writeBigUInt64BE(BigInt(len), 2); }
    this.socket.cork();
    this.socket.write(hdr);
    this.socket.write(data);
    this.socket.uncork();
  }

  sendText(s) { this.sendFrame(0x1, Buffer.from(s, 'utf8')); }
  sendBinary(b) { this.sendFrame(0x2, b); }
  ping() { this.sendFrame(0x9, Buffer.alloc(0)); }
  get buffered() { return this.socket.writableLength; }

  close(code = 1000) {
    if (!this.open) return;
    const b = Buffer.alloc(2);
    b.writeUInt16BE(code);
    this.sendFrame(0x8, b);
    this.open = false;
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 1000).unref();
    this.finish();
  }

  finish() {
    this.open = false;
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
}
