// Minimal CDP screenshot driver: connects to an already-running headless
// Chrome (--remote-debugging-port), waits, and captures a PNG. Implements just
// enough of the WebSocket client protocol (no deps) to talk to DevTools.
import net from 'node:net';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.argv[2] || 9222);
const OUT = process.argv[3] || 'shot.png';
const WAIT = Number(process.argv[4] || 9000);

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function wsConnect(wsUrl) {
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
        `Host: ${u.hostname}:${u.port}\r\n` +
        `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    let buf = Buffer.alloc(0);
    let upgraded = false;
    const handlers = new Map();
    const api = {
      send(id, method, params) {
        const payload = Buffer.from(JSON.stringify({ id, method, params: params || {} }));
        const mask = crypto.randomBytes(4);
        const len = payload.length;
        let header;
        if (len < 126) header = Buffer.from([0x81, 0x80 | len]);
        else if (len < 65536) header = Buffer.from([0x81, 0x80 | 126, len >> 8, len & 255]);
        else header = Buffer.concat([Buffer.from([0x81, 0x80 | 127]), bigLen(len)]);
        const masked = Buffer.alloc(len);
        for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
        sock.write(Buffer.concat([header, mask, masked]));
        return new Promise((res) => handlers.set(id, res));
      },
      close() { sock.end(); },
    };
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const idx = buf.indexOf('\r\n\r\n');
        if (idx === -1) return;
        buf = buf.slice(idx + 4);
        upgraded = true;
        resolve(api);
      }
      // parse frames
      while (buf.length >= 2) {
        const len0 = buf[1] & 127;
        let off = 2, plen = len0;
        if (len0 === 126) { if (buf.length < 4) break; plen = buf.readUInt16BE(2); off = 4; }
        else if (len0 === 127) { if (buf.length < 10) break; plen = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + plen) break;
        const payload = buf.slice(off, off + plen);
        buf = buf.slice(off + plen);
        try {
          const msg = JSON.parse(payload.toString());
          if (msg.id && handlers.has(msg.id)) { handlers.get(msg.id)(msg); handlers.delete(msg.id); }
        } catch {}
      }
    });
    sock.on('error', reject);
  });
}

function bigLen(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n));
  return b;
}

const targets = await getJSON('/json');
const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) { console.error('no page target'); process.exit(1); }
const ws = await wsConnect(page.webSocketDebuggerUrl);
await ws.send(1, 'Page.enable');
await new Promise((r) => setTimeout(r, WAIT));
const shot = await ws.send(2, 'Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
ws.close();
process.exit(0);
