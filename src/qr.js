// QR codes for the guide PDF (the injection video link). Byte mode, error
// correction level M, versions 1–10 (up to 213 bytes), the mask with the
// lowest penalty. Returns a square grid of booleans, true = dark.
"use strict";

// Level M: [ec codewords per block, [blocks, data codewords per block]...]
const BLOCKS_M = [null,
  [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
  [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

function dataCapacity(v) { return BLOCKS_M[v].slice(1).reduce((s, [n, k]) => s + n * k, 0); }

// GF(256) with the QR polynomial 0x11D.
function gfMul(a, b) {
  let r = 0;
  for (let i = 7; i >= 0; i--) { r = (r << 1) ^ ((r >>> 7) * 0x11d); r ^= ((b >>> i) & 1) * a; }
  return r & 0xff;
}
function rsDivisor(degree) {
  const out = new Array(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return out;
}
function rsRemainder(data, divisor) {
  const out = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ out.shift();
    out.push(0);
    divisor.forEach((coef, i) => { out[i] ^= gfMul(coef, factor); });
  }
  return out;
}

function encodeData(bytes, v) {
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  const cap = dataCapacity(v) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < cap / 8; pad ^= 0xec ^ 0x11) data.push(pad);
  // Split into blocks, add error correction, interleave.
  const [ecLen, ...groups] = BLOCKS_M[v];
  const blocks = [];
  let at = 0;
  for (const [n, k] of groups) for (let i = 0; i < n; i++) { const d = data.slice(at, at + k); at += k; blocks.push({ d, ec: rsRemainder(d, rsDivisor(ecLen)) }); }
  const out = [];
  const maxD = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxD; i++) blocks.forEach((b) => { if (i < b.d.length) out.push(b.d[i]); });
  for (let i = 0; i < ecLen; i++) blocks.forEach((b) => out.push(b.ec[i]));
  return out;
}

function build(v, codewords, mask) {
  const size = v * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  // timing
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // finders + separators
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  }
  // alignment
  const al = ALIGN[v];
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  // format bits (level M = 0b00), dark module
  const fmt = (() => {
    const data = (0 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  })();
  const bit = (val, i) => ((val >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, bit(fmt, i));
  set(8, 7, bit(fmt, 6)); set(8, 8, bit(fmt, 7)); set(7, 8, bit(fmt, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fmt, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(fmt, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(fmt, i));
  set(8, size - 8, true);
  // version bits
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vb = (v << 12) | rem;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(vb, i)); set(b, a, bit(vb, i)); }
  }
  // data, zig-zag from the bottom right
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && i < codewords.length * 8) { m[y][x] = bit(codewords[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
  }
  // mask
  const cond = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0][mask];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && cond(x, y)) m[y][x] = !m[y][x];
  return m;
}

function penalty(m) {
  const n = m.length;
  let p = 0, dark = 0;
  const lines = [];
  for (let y = 0; y < n; y++) { lines.push(m[y]); lines.push(m.map((row) => row[y])); }
  for (const ln of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && ln[i] === ln[i - 1]) run++;
      else { if (run >= 5) p += 3 + run - 5; run = 1; }
    }
    const s = ln.map((b) => (b ? 1 : 0)).join("");
    p += 40 * ((s.match(/(?=10111010000)/g) || []).length + (s.match(/(?=00001011101)/g) || []).length);
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  m.forEach((row) => row.forEach((b) => { if (b) dark++; }));
  p += 10 * Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5);
  return p;
}

function qrMatrix(text) {
  const bytes = [...Buffer.from(String(text), "utf8")];
  let v = 1;
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + bytes.length * 8 > dataCapacity(v) * 8) v++;
  if (v > 10) return null;
  const cw = encodeData(bytes, v);
  let best = null, bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = build(v, cw, mask);
    const p = penalty(m);
    if (p < bestP) { bestP = p; best = m; }
  }
  return best;
}

module.exports = { qrMatrix };
