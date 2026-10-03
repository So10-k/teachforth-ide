import { connect } from "node:tls";
import { randomBytes } from "node:crypto";

const MAX_FRAME = 1_000_000;

export function socketFor(url) {
  if (typeof WebSocket === "function") return new WebSocket(url);
  return new MiniWebSocket(url);
}

export class MiniWebSocket {
  constructor(url) {
    const target = new URL(url);
    this.readyState = 0;
    this.listeners = { open: [], message: [], close: [], error: [] };
    this.queue = [];
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.upgraded = false;
    this.closed = false;
    const key = randomBytes(16).toString("base64");
    const path = `${target.pathname || "/"}${target.search}`;
    this.socket = connect({ host: target.hostname, port: Number(target.port || 443), servername: target.hostname }, () => {
      this.socket.write(
        `GET ${path} HTTP/1.1\r\nHost: ${target.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", () => this.emit("error", {}));
    this.socket.on("close", () => this.finish(1006));
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  send(text) {
    const payload = Buffer.from(String(text));
    if (this.readyState !== 1) {
      this.queue.push(payload);
      return;
    }
    this.writeFrame(1, payload);
  }

  close() {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    if (this.upgraded) this.writeFrame(8, Buffer.alloc(0));
    this.socket.end();
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    if (!this.upgraded) {
      const end = this.buf.indexOf("\r\n\r\n");
      if (end < 0) {
        if (this.buf.length > 8192) this.finish(1002);
        return;
      }
      const head = this.buf.subarray(0, end).toString("utf8");
      this.buf = this.buf.subarray(end + 4);
      if (!/^HTTP\/1\.[01] 101\b/.test(head)) {
        this.finish(1002);
        return;
      }
      this.upgraded = true;
      this.readyState = 1;
      this.emit("open", {});
      for (const payload of this.queue) this.writeFrame(1, payload);
      this.queue = [];
    }
    this.drain();
  }

  drain() {
    while (this.buf.length >= 2) {
      const frame = takeFrame(this.buf);
      if (!frame) return;
      if (frame.error) {
        this.finish(1009);
        return;
      }
      this.buf = this.buf.subarray(frame.bytes);
      if (frame.opcode === 8) {
        const code = frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1000;
        this.finish(code);
        return;
      }
      if (frame.opcode === 9) {
        this.writeFrame(10, frame.payload);
        continue;
      }
      if (frame.opcode === 10) continue;
      if (frame.opcode !== 1 && frame.opcode !== 0) continue;
      if (frame.opcode === 1 && frame.fin) {
        this.emit("message", { data: frame.payload.toString("utf8") });
        continue;
      }
      this.fragments.push(frame.payload);
      if (frame.fin) {
        const text = Buffer.concat(this.fragments).toString("utf8");
        this.fragments = [];
        this.emit("message", { data: text });
      }
    }
  }

  writeFrame(opcode, payload) {
    const mask = randomBytes(4);
    const len = payload.length;
    const head = [0x80 | opcode];
    if (len < 126) head.push(0x80 | len);
    else if (len < 65536) head.push(0x80 | 126, len >> 8, len & 0xff);
    else {
      const big = Buffer.alloc(8);
      big.writeBigUInt64BE(BigInt(len));
      head.push(0x80 | 127, ...big);
    }
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
    this.socket.write(Buffer.concat([Buffer.from(head), mask, masked]));
  }

  emit(type, event) {
    for (const fn of this.listeners[type] || []) fn(event);
  }

  finish(code) {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.emit("close", { code });
    this.socket.destroy();
  }
}

export function takeFrame(buf) {
  if ((buf[0] & 0x70) !== 0) return { error: "reserved", bytes: 2 };
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    const big = buf.readBigUInt64BE(2);
    if (big > BigInt(MAX_FRAME)) return { error: "too big", bytes: 10 };
    len = Number(big);
    offset = 10;
  }
  if (len > MAX_FRAME) return { error: "too big", bytes: offset };
  const masked = (buf[1] & 0x80) !== 0;
  const maskLen = masked ? 4 : 0;
  if (buf.length < offset + maskLen + len) return null;
  let payload = buf.subarray(offset + maskLen, offset + maskLen + len);
  if (masked) {
    const mask = buf.subarray(offset, offset + 4);
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
  }
  return { fin: (buf[0] & 0x80) !== 0, opcode: buf[0] & 0x0f, payload, bytes: offset + maskLen + len };
}
