// A small PDF writer, enough for the patient guide: A4 pages, an embedded
// TrueType family (Google Sans Flex from src/fonts, falling back to the
// standard Helvetica when the files are missing), filled and rounded shapes,
// strokes, arcs, line icons from SVG markup, and PNG images with
// transparency. Text is WinAnsi-encoded; characters outside it are swapped
// for a near equivalent or left out. Links are clickable web addresses.
// Coordinates are in points from the top-left.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const PAGE_W = 595.28;
const PAGE_H = 841.89;

// Advance widths for WinAnsi codes 32–255, in thousandths of an em.
const WIDTHS = {
  F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,634,744,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,549,333,333,333,576,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,549,611,556,556,556,556,500,556,500],
  F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,722,744,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,549,333,333,333,576,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,549,611,611,611,611,611,556,611,556],
};

// ── embedded TrueType fonts ──────────────────────────────────────────
// Only what a simple WinAnsi TrueType font needs: metrics for the
// descriptor, the Unicode cmap to find each glyph, and advance widths.
function parseTtf(buf) {
  const tables = {};
  for (let i = 0, n = buf.readUInt16BE(4); i < n; i++) {
    const at = 12 + 16 * i;
    tables[buf.toString("latin1", at, at + 4)] = buf.readUInt32BE(at + 8);
  }
  const head = tables.head, hhea = tables.hhea, hmtx = tables.hmtx, os2 = tables["OS/2"], cmap = tables.cmap;
  if (head == null || hhea == null || hmtx == null || cmap == null) return null;
  const upm = buf.readUInt16BE(head + 18);
  const sc = (v) => Math.round((v * 1000) / upm);
  const bbox = [36, 38, 40, 42].map((o) => sc(buf.readInt16BE(head + o)));
  const nhm = buf.readUInt16BE(hhea + 34);
  const advance = (g) => buf.readUInt16BE(hmtx + 4 * Math.min(g, nhm - 1));
  // cmap: Windows Unicode BMP, format 4.
  let sub = -1;
  for (let i = 0, n = buf.readUInt16BE(cmap + 2); i < n; i++) {
    const rec = cmap + 4 + 8 * i;
    if (buf.readUInt16BE(rec) === 3 && buf.readUInt16BE(rec + 2) === 1) sub = cmap + buf.readUInt32BE(rec + 4);
  }
  if (sub < 0 || buf.readUInt16BE(sub) !== 4) return null;
  const segs = buf.readUInt16BE(sub + 6) / 2;
  const ends = sub + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, ranges = deltas + segs * 2;
  const glyph = (cp) => {
    for (let i = 0; i < segs; i++) {
      if (cp > buf.readUInt16BE(ends + 2 * i)) continue;
      const start = buf.readUInt16BE(starts + 2 * i);
      if (cp < start) return 0;
      const ro = buf.readUInt16BE(ranges + 2 * i), delta = buf.readInt16BE(deltas + 2 * i);
      if (!ro) return (cp + delta) & 0xffff;
      const g = buf.readUInt16BE(ranges + 2 * i + ro + 2 * (cp - start));
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
  const unicodeOf = (code) => (code >= 128 && code < 160 ? WIN_UNICODE.get(code) || 0 : code);
  const widths = [], has = [];
  for (let code = 32; code <= 255; code++) {
    const g = glyph(unicodeOf(code));
    has.push(!!g);
    widths.push(g ? sc(advance(g)) : 0);
  }
  return {
    widths, has, bbox,
    ascent: sc(buf.readInt16BE(hhea + 4)), descent: sc(buf.readInt16BE(hhea + 6)),
    capHeight: os2 != null && buf.readUInt16BE(os2) >= 2 ? sc(buf.readInt16BE(os2 + 88)) : sc(buf.readInt16BE(hhea + 4)) * 0.7,
  };
}

const FONT_DIR = path.join(__dirname, "fonts");
const FONT_FILES = { F1: ["GoogleSansFlex-Regular", "GoogleSansFlex-Regular.ttf"], F2: ["GoogleSansFlex-SemiBold", "GoogleSansFlex-SemiBold.ttf"] };
const EMBED = {};
function loadFonts() {
  for (const [key, [name, file]] of Object.entries(FONT_FILES)) {
    try {
      const data = fs.readFileSync(path.join(FONT_DIR, file));
      const info = parseTtf(data);
      if (info) EMBED[key] = { name, data, ...info };
    } catch { /* the standard Helvetica is used instead */ }
  }
  if (!EMBED.F1 || !EMBED.F2) { delete EMBED.F1; delete EMBED.F2; }
  else { WIDTHS.F1 = EMBED.F1.widths; WIDTHS.F2 = EMBED.F2.widths; }
}

const WIN_EXTRA = new Map([[0x20AC, 128], [0x201A, 130], [0x0192, 131], [0x201E, 132], [0x2026, 133], [0x2020, 134], [0x2021, 135], [0x02C6, 136], [0x2030, 137], [0x0160, 138], [0x2039, 139], [0x0152, 140], [0x017D, 142], [0x2018, 145], [0x2019, 146], [0x201C, 147], [0x201D, 148], [0x2022, 149], [0x2013, 150], [0x2014, 151], [0x02DC, 152], [0x2122, 153], [0x0161, 154], [0x203A, 155], [0x0153, 156], [0x017E, 158], [0x0178, 159]]);
const WIN_UNICODE = new Map([...WIN_EXTRA].map(([u, c]) => [c, u]));
loadFonts();
const SWAPS = { "≥": ">=", "≤": "<=", "→": "->", "←": "<-", "≈": "~", "−": "-", "‑": "-", "‒": "–", "μ": "µ", " ": " ", " ": " ", "​": "" };

// Text as WinAnsi codes: known stand-ins first, then anything outside the
// set (emoji included) dropped.
function encode(str) {
  const out = [];
  for (const ch of String(str == null ? "" : str)) {
    const s = SWAPS[ch];
    if (s !== undefined) { for (const c of s) out.push(c.charCodeAt(0)); continue; }
    const cp = ch.codePointAt(0);
    if (cp === 9 || cp === 10) out.push(32);
    else if (cp >= 32 && cp < 127) out.push(cp);
    else if (cp >= 160 && cp <= 255) out.push(cp);
    else if (WIN_EXTRA.has(cp)) out.push(WIN_EXTRA.get(cp));
  }
  // A character the embedded font has no glyph for is left out rather than
  // printed as an empty box.
  return EMBED.F1 ? out.filter((c) => EMBED.F1.has[c - 32] || c === 32) : out;
}

function textWidth(str, bold, size) {
  const w = bold ? WIDTHS.F2 : WIDTHS.F1;
  let sum = 0;
  for (const c of encode(str)) sum += w[c - 32] || 0;
  return (sum * size) / 1000;
}

const num = (n) => (Math.round(n * 100) / 100).toString();
function rgb(hex) {
  const h = String(hex).replace("#", "");
  const v = (i) => num(parseInt(h.slice(i, i + 2), 16) / 255);
  return `${v(0)} ${v(2)} ${v(4)}`;
}
function pdfString(codes) {
  let s = "(";
  for (const c of codes) {
    if (c === 40 || c === 41 || c === 92) s += "\\" + String.fromCharCode(c);
    else if (c < 32 || c > 126) s += "\\" + c.toString(8).padStart(3, "0");
    else s += String.fromCharCode(c);
  }
  return s + ")";
}

// ── PNG → image XObject (8-bit, not interlaced) ─────────────────────
function decodePng(buf, tint) {
  if (!buf || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let p = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString("latin1", p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === "PLTE") palette = data;
    else if (kind === "tRNS") trns = data;
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    p += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (depth !== 8 || interlace || !channels || !w || !h) return null;
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch { return null; }
  const stride = w * channels;
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[dst + x - channels] : 0;
      const b = y ? px[dst - stride + x] : 0;
      const c = x >= channels && y ? px[dst - stride + x - channels] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = v & 255;
    }
  }
  const color = Buffer.alloc(w * h * 3), alpha = Buffer.alloc(w * h);
  let hasAlpha = false;
  for (let i = 0; i < w * h; i++) {
    let r, g, bl, al = 255;
    if (type === 6) { r = px[i * 4]; g = px[i * 4 + 1]; bl = px[i * 4 + 2]; al = px[i * 4 + 3]; }
    else if (type === 2) { r = px[i * 3]; g = px[i * 3 + 1]; bl = px[i * 3 + 2]; }
    else if (type === 4) { r = g = bl = px[i * 2]; al = px[i * 2 + 1]; }
    else if (type === 0) { r = g = bl = px[i]; }
    else { const k = px[i]; if (!palette || k * 3 + 2 >= palette.length) return null; r = palette[k * 3]; g = palette[k * 3 + 1]; bl = palette[k * 3 + 2]; if (trns && k < trns.length) al = trns[k]; }
    color[i * 3] = r; color[i * 3 + 1] = g; color[i * 3 + 2] = bl; alpha[i] = al;
    if (al < 255) hasAlpha = true;
  }
  // A tinted image keeps only the shape: every pixel takes one colour and
  // the alpha decides how much of it shows (a logo turned white for a dark
  // cover). Without transparency there is no shape to keep.
  if (tint) {
    if (!hasAlpha) return null;
    const t = String(tint).replace("#", "");
    const rgbT = [0, 2, 4].map((i) => parseInt(t.slice(i, i + 2), 16));
    for (let i = 0; i < w * h; i++) {
      // Near-white parts of the artwork (a letter inside a badge) become
      // holes, so the shape still reads in one colour.
      const light = Math.min(color[i * 3], color[i * 3 + 1], color[i * 3 + 2]);
      alpha[i] = Math.round(alpha[i] * Math.max(0, Math.min(1, (245 - light) / 45)));
      color[i * 3] = rgbT[0]; color[i * 3 + 1] = rgbT[1]; color[i * 3 + 2] = rgbT[2];
    }
    return { w, h, color: zlib.deflateSync(color), alpha: zlib.deflateSync(alpha) };
  }
  return { w, h, color: zlib.deflateSync(color), alpha: hasAlpha ? zlib.deflateSync(alpha) : null };
}

// ── SVG geometry → PDF path operators (icon space, y down) ──────────
function roundRectOps(x, y, w, h, r) {
  r = Math.min(r || 0, w / 2, h / 2);
  if (!r) return `${num(x)} ${num(y)} ${num(w)} ${num(h)} re`;
  const k = 0.5523 * r;
  return [`${num(x + r)} ${num(y)} m`, `${num(x + w - r)} ${num(y)} l`, `${num(x + w - r + k)} ${num(y)} ${num(x + w)} ${num(y + r - k)} ${num(x + w)} ${num(y + r)} c`,
    `${num(x + w)} ${num(y + h - r)} l`, `${num(x + w)} ${num(y + h - r + k)} ${num(x + w - r + k)} ${num(y + h)} ${num(x + w - r)} ${num(y + h)} c`,
    `${num(x + r)} ${num(y + h)} l`, `${num(x + r - k)} ${num(y + h)} ${num(x)} ${num(y + h - r + k)} ${num(x)} ${num(y + h - r)} c`,
    `${num(x)} ${num(y + r)} l`, `${num(x)} ${num(y + r - k)} ${num(x + r - k)} ${num(y)} ${num(x + r)} ${num(y)} c h`].join(" ");
}
function ellipseOps(cx, cy, rx, ry) {
  const kx = 0.5523 * rx, ky = 0.5523 * ry;
  return `${num(cx + rx)} ${num(cy)} m ${num(cx + rx)} ${num(cy + ky)} ${num(cx + kx)} ${num(cy + ry)} ${num(cx)} ${num(cy + ry)} c `
    + `${num(cx - kx)} ${num(cy + ry)} ${num(cx - rx)} ${num(cy + ky)} ${num(cx - rx)} ${num(cy)} c ${num(cx - rx)} ${num(cy - ky)} ${num(cx - kx)} ${num(cy - ry)} ${num(cx)} ${num(cy - ry)} c `
    + `${num(cx + kx)} ${num(cy - ry)} ${num(cx + rx)} ${num(cy - ky)} ${num(cx + rx)} ${num(cy)} c h`;
}
// An elliptical arc (SVG endpoint form) as cubic Béziers.
function arcOps(x1, y1, rx, ry, phi, large, sweep, x2, y2) {
  if (!rx || !ry) return `${num(x2)} ${num(y2)} l`;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const p = (phi * Math.PI) / 180, cp = Math.cos(p), sp = Math.sin(p);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cp * dx + sp * dy, yp = -sp * dx + cp * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num1 = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  let co = Math.sqrt(Math.max(0, num1 / (rx * rx * yp * yp + ry * ry * xp * xp)));
  if (large === sweep) co = -co;
  const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const step = dt / segs, k = (4 / 3) * Math.tan(step / 4);
  const pt = (t) => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp];
  const dv = (t) => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
  let out = "";
  for (let i = 0; i < segs; i++) {
    const a0 = t1 + i * step, a1 = a0 + step;
    const [p0x, p0y] = pt(a0), [p1x, p1y] = pt(a1), [d0x, d0y] = dv(a0), [d1x, d1y] = dv(a1);
    out += `${num(p0x + k * d0x)} ${num(p0y + k * d0y)} ${num(p1x - k * d1x)} ${num(p1y - k * d1y)} ${num(p1x)} ${num(p1y)} c `;
  }
  return out;
}
function svgPathOps(d) {
  let i = 0;
  const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const number = () => { ws(); const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i.exec(d.slice(i)); if (!m) return NaN; i += m[0].length; return parseFloat(m[0]); };
  const flag = () => { ws(); const c = d[i++]; return c === "1" ? 1 : 0; };
  let out = "", cmd = "", x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lq = null;
  const add = (s) => { out += s + " "; };
  while (i < d.length) {
    ws();
    if (i >= d.length) break;
    if (/[a-z]/i.test(d[i])) cmd = d[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const bx = rel ? x : 0, by = rel ? y : 0;
    if (C === "Z") { add("h"); x = sx; y = sy; lcx = x; lcy = y; continue; }
    if (C === "M") { x = bx + number(); y = by + number(); sx = x; sy = y; add(`${num(x)} ${num(y)} m`); cmd = rel ? "l" : "L"; lcx = x; lcy = y; continue; }
    if (C === "L") { x = bx + number(); y = by + number(); add(`${num(x)} ${num(y)} l`); lcx = x; lcy = y; continue; }
    if (C === "H") { x = bx + number(); add(`${num(x)} ${num(y)} l`); lcx = x; lcy = y; continue; }
    if (C === "V") { y = (rel ? y : 0) + number(); add(`${num(x)} ${num(y)} l`); lcx = x; lcy = y; continue; }
    if (C === "C" || C === "S") {
      let x1, y1;
      if (C === "C") { x1 = bx + number(); y1 = by + number(); } else { x1 = 2 * x - lcx; y1 = 2 * y - lcy; }
      const x2 = bx + number(), y2 = by + number(), ex = bx + number(), ey = by + number();
      add(`${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)} ${num(ex)} ${num(ey)} c`);
      lcx = x2; lcy = y2; x = ex; y = ey; continue;
    }
    if (C === "Q" || C === "T") {
      let qx, qy;
      if (C === "Q") { qx = bx + number(); qy = by + number(); } else { qx = lq ? 2 * x - lq[0] : x; qy = lq ? 2 * y - lq[1] : y; }
      const ex = bx + number(), ey = by + number();
      add(`${num(x + (2 / 3) * (qx - x))} ${num(y + (2 / 3) * (qy - y))} ${num(ex + (2 / 3) * (qx - ex))} ${num(ey + (2 / 3) * (qy - ey))} ${num(ex)} ${num(ey)} c`);
      lq = [qx, qy]; x = ex; y = ey; lcx = x; lcy = y; continue;
    }
    if (C === "A") {
      const rx = number(), ry = number(), rot = number(), la = flag(), sw = flag(), ex = bx + number(), ey = by + number();
      add(arcOps(x, y, rx, ry, rot, la, sw, ex, ey));
      x = ex; y = ey; lcx = x; lcy = y; continue;
    }
    i++; // unknown command
  }
  return out.trim();
}

// ── pages ────────────────────────────────────────────────────────────
class Page {
  constructor() { this.ops = []; this.images = new Set(); this.links = []; }
  // A clickable area opening `url`; the box is (x, y) top-left, w × h.
  link(x, y, w, h, url) { this.links.push({ rect: [x, PAGE_H - y - h, x + w, PAGE_H - y], url }); }
  fillColor(hex) { this.ops.push(`${rgb(hex)} rg`); }
  // Rectangle with optional rounded corners: radius, or [tl, tr, br, bl].
  rect(x, y, w, h, { fill, stroke, lineWidth = 0.75, radius = 0 } = {}) {
    const [tl, tr, br, bl] = Array.isArray(radius) ? radius : [radius, radius, radius, radius];
    const k = 0.5523;
    const Y = (v) => num(PAGE_H - v), X = num;
    const path = [
      `${X(x + tl)} ${Y(y)} m`,
      `${X(x + w - tr)} ${Y(y)} l`,
      tr ? `${X(x + w - tr + tr * k)} ${Y(y)} ${X(x + w)} ${Y(y + tr - tr * k)} ${X(x + w)} ${Y(y + tr)} c` : "",
      `${X(x + w)} ${Y(y + h - br)} l`,
      br ? `${X(x + w)} ${Y(y + h - br + br * k)} ${X(x + w - br + br * k)} ${Y(y + h)} ${X(x + w - br)} ${Y(y + h)} c` : "",
      `${X(x + bl)} ${Y(y + h)} l`,
      bl ? `${X(x + bl - bl * k)} ${Y(y + h)} ${X(x)} ${Y(y + h - bl + bl * k)} ${X(x)} ${Y(y + h - bl)} c` : "",
      `${X(x)} ${Y(y + tl)} l`,
      tl ? `${X(x)} ${Y(y + tl - tl * k)} ${X(x + tl - tl * k)} ${Y(y)} ${X(x + tl)} ${Y(y)} c` : "",
      "h",
    ].filter(Boolean).join(" ");
    if (fill) this.ops.push(`${rgb(fill)} rg`);
    if (stroke) this.ops.push(`${rgb(stroke)} RG ${num(lineWidth)} w`);
    this.ops.push(`${path} ${fill && stroke ? "B" : fill ? "f" : "S"}`);
  }
  line(x1, y1, x2, y2, { color = "#000000", width = 0.75 } = {}) {
    this.ops.push(`${rgb(color)} RG ${num(width)} w 0 J ${num(x1)} ${num(PAGE_H - y1)} m ${num(x2)} ${num(PAGE_H - y2)} l S`);
  }
  circle(cx, cy, r, { fill }) {
    const k = 0.5523 * r, Y = (v) => num(PAGE_H - v);
    this.ops.push(`${rgb(fill)} rg ${num(cx + r)} ${Y(cy)} m ${num(cx + r)} ${Y(cy - k)} ${num(cx + k)} ${Y(cy - r)} ${num(cx)} ${Y(cy - r)} c `
      + `${num(cx - k)} ${Y(cy - r)} ${num(cx - r)} ${Y(cy - k)} ${num(cx - r)} ${Y(cy)} c ${num(cx - r)} ${Y(cy + k)} ${num(cx - k)} ${Y(cy + r)} ${num(cx)} ${Y(cy + r)} c `
      + `${num(cx + k)} ${Y(cy + r)} ${num(cx + r)} ${Y(cy + k)} ${num(cx + r)} ${Y(cy)} c f`);
  }
  // A stroked arc, angles in degrees clockwise from 12 o'clock.
  arc(cx, cy, r, from, to, { color, width }) {
    const segs = Math.max(1, Math.ceil((to - from) / 90));
    const step = (to - from) / segs;
    const pt = (deg) => { const a = ((deg - 90) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const Y = (v) => num(PAGE_H - v);
    let [sx, sy] = pt(from);
    let d = `${num(sx)} ${Y(sy)} m`;
    for (let i = 0; i < segs; i++) {
      const a0 = from + i * step, a1 = a0 + step;
      const t = (4 / 3) * Math.tan(((a1 - a0) * Math.PI) / 720);
      const [x0, y0] = pt(a0), [x3, y3] = pt(a1);
      const r0 = ((a0 - 90) * Math.PI) / 180, r1 = ((a1 - 90) * Math.PI) / 180;
      const x1 = x0 - t * r * Math.sin(r0), y1 = y0 + t * r * Math.cos(r0);
      const x2 = x3 + t * r * Math.sin(r1), y2 = y3 - t * r * Math.cos(r1);
      d += ` ${num(x1)} ${Y(y1)} ${num(x2)} ${Y(y2)} ${num(x3)} ${Y(y3)} c`;
    }
    this.ops.push(`${rgb(color)} RG ${num(width)} w 0 J ${d} S`);
  }
  // `y` is the text baseline.
  // `spacing` adds that many points between letters (small capitals labels).
  text(str, x, y, { size = 10, bold = false, color = "#000000", spacing = 0 } = {}) {
    const codes = encode(str);
    if (!codes.length) return;
    this.ops.push(`BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${num(spacing)} Tc ${rgb(color)} rg 1 0 0 1 ${num(x)} ${num(PAGE_H - y)} Tm ${pdfString(codes)} Tj ET`);
  }
  // Line icon from SVG markup drawn on a 24-unit grid (the app's icon set):
  // path, rect, circle, ellipse, line, polyline and polygon, stroked with
  // round ends. `size` is the drawn width and height in points.
  icon(markup, x, y, size, { color = "#000000", width = 1.8, fill } = {}) {
    const s = size / 24;
    const ops = [];
    for (const [, tag, attrs] of String(markup).matchAll(/<(path|rect|circle|ellipse|line|polyline|polygon)\b([^>]*?)\/?>/g)) {
      const a = {};
      for (const [, k, v] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) a[k] = v;
      const n = (k, d = 0) => (a[k] == null ? d : parseFloat(a[k]));
      let d = "";
      if (tag === "path") d = svgPathOps(a.d || "");
      else if (tag === "rect") d = roundRectOps(n("x"), n("y"), n("width"), n("height"), n("rx", n("ry")));
      else if (tag === "circle") d = ellipseOps(n("cx"), n("cy"), n("r"), n("r"));
      else if (tag === "ellipse") d = ellipseOps(n("cx"), n("cy"), n("rx"), n("ry"));
      else if (tag === "line") d = `${num(n("x1"))} ${num(n("y1"))} m ${num(n("x2"))} ${num(n("y2"))} l`;
      else {
        const pts = (a.points || "").trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i + 1 < pts.length; i += 2) d += `${num(pts[i])} ${num(pts[i + 1])} ${i ? "l" : "m"} `;
        if (tag === "polygon") d += "h";
      }
      if (d) ops.push(`${d} ${a.fill && a.fill !== "none" ? "f" : "S"}`);
    }
    this.ops.push(`q ${num(s)} 0 0 ${num(-s)} ${num(x)} ${num(PAGE_H - y)} cm ${rgb(color)} RG ${rgb(fill || color)} rg ${num(width)} w 1 J 1 j ${ops.join(" ")} Q`);
  }
  image(img, x, y, w, h) {
    this.images.add(img);
    this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(PAGE_H - y - h)} cm /Im${img.id} Do Q`);
  }
}

class PdfDocument {
  constructor({ title = "", author = "", subject = "" } = {}) {
    this.pages = [];
    this.imgs = [];
    this.info = { title, author, subject };
  }
  addPage() { const p = new Page(); this.pages.push(p); return p; }
  // A PNG for page.image(), or null when it can't be read.
  loadPng(buf, { tint } = {}) {
    const d = decodePng(buf, tint);
    if (!d) return null;
    const img = { ...d, id: this.imgs.length + 1 };
    this.imgs.push(img);
    return img;
  }
  toBuffer() {
    const objs = []; // index → Buffer body
    const add = (body) => { objs.push(body); return objs.length; };
    const ref = (n) => `${n} 0 R`;
    const catalogId = add(null), pagesId = add(null);
    const stream = (dict, data) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, Buffer.from("\nendstream")]);
    const font = (key, fallback) => {
      const f = EMBED[key];
      if (!f) return add(Buffer.from(`<< /Type /Font /Subtype /Type1 /BaseFont /${fallback} /Encoding /WinAnsiEncoding >>`));
      const file = add(stream(`/Length1 ${f.data.length} /Filter /FlateDecode`, zlib.deflateSync(f.data)));
      const desc = add(Buffer.from(`<< /Type /FontDescriptor /FontName /${f.name} /Flags 32 /FontBBox [${f.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${f.ascent} /Descent ${f.descent} /CapHeight ${Math.round(f.capHeight)} /StemV ${key === "F2" ? 120 : 80} /FontFile2 ${ref(file)} >>`));
      return add(Buffer.from(`<< /Type /Font /Subtype /TrueType /BaseFont /${f.name} /FirstChar 32 /LastChar 255 /Widths [${f.widths.join(" ")}] /Encoding /WinAnsiEncoding /FontDescriptor ${ref(desc)} >>`));
    };
    const f1 = font("F1", "Helvetica"), f2 = font("F2", "Helvetica-Bold");
    for (const img of this.imgs) {
      const smask = img.alpha ? add(stream(`/Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, img.alpha)) : 0;
      img.obj = add(stream(`/Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${smask ? ` /SMask ${ref(smask)}` : ""}`, img.color));
    }
    const pageIds = [];
    for (const pg of this.pages) {
      const content = add(stream("/Filter /FlateDecode", zlib.deflateSync(Buffer.from(pg.ops.join("\n"), "latin1"))));
      const xobj = [...pg.images].map((img) => `/Im${img.id} ${ref(img.obj)}`).join(" ");
      const annots = pg.links.map((l) => add(Buffer.from(`<< /Type /Annot /Subtype /Link /Rect [${l.rect.map(num).join(" ")}] /Border [0 0 0] /A << /Type /Action /S /URI /URI ${pdfString([...Buffer.from(l.url, "latin1")])} >> >>`)));
      pageIds.push(add(Buffer.from(`<< /Type /Page /Parent ${ref(pagesId)} /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${ref(content)} /Resources << /Font << /F1 ${ref(f1)} /F2 ${ref(f2)} >>${xobj ? ` /XObject << ${xobj} >>` : ""} >>${annots.length ? ` /Annots [${annots.map(ref).join(" ")}]` : ""} >>`)));
    }
    objs[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${ref(pagesId)} >>`);
    objs[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map(ref).join(" ")}] /Count ${pageIds.length} >>`);
    const infoStr = (s) => pdfString(encode(s));
    const now = new Date();
    const stamp = `D:${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}00Z`;
    const infoId = add(Buffer.from(`<< /Title ${infoStr(this.info.title)} /Author ${infoStr(this.info.author)} /Subject ${infoStr(this.info.subject)} /Creator ${infoStr(this.info.author)} /CreationDate (${stamp}) >>`));

    const parts = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
    let offset = parts[0].length;
    const xref = [];
    objs.forEach((body, i) => {
      const head = Buffer.from(`${i + 1} 0 obj\n`);
      const tail = Buffer.from("\nendobj\n");
      xref.push(offset);
      parts.push(head, body, tail);
      offset += head.length + body.length + tail.length;
    });
    const table = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${xref.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
    parts.push(Buffer.from(`${table}trailer\n<< /Size ${objs.length + 1} /Root ${ref(catalogId)} /Info ${ref(infoId)} >>\nstartxref\n${offset}\n%%EOF\n`));
    return Buffer.concat(parts);
  }
}

module.exports = { PdfDocument, textWidth, encode, PAGE_W, PAGE_H, fontsEmbedded: () => !!EMBED.F1 };
