// A small PDF writer, enough for the patient guide: A4 pages, the standard
// Helvetica fonts (every PDF reader has them, so nothing is embedded), filled
// and rounded shapes, strokes, arcs, and PNG images with transparency. Text
// is WinAnsi-encoded; characters outside it are swapped for a near
// equivalent or left out. Coordinates are in points from the top-left.
"use strict";
const zlib = require("node:zlib");

const PAGE_W = 595.28;
const PAGE_H = 841.89;

// Advance widths for WinAnsi codes 32–255, in thousandths of an em.
const WIDTHS = {
  F1: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,634,744,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,549,333,333,333,576,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,549,611,556,556,556,556,500,556,500],
  F2: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,722,744,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,549,333,333,333,576,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,549,611,611,611,611,611,556,611,556],
};

const WIN_EXTRA = new Map([[0x20AC, 128], [0x201A, 130], [0x0192, 131], [0x201E, 132], [0x2026, 133], [0x2020, 134], [0x2021, 135], [0x02C6, 136], [0x2030, 137], [0x0160, 138], [0x2039, 139], [0x0152, 140], [0x017D, 142], [0x2018, 145], [0x2019, 146], [0x201C, 147], [0x201D, 148], [0x2022, 149], [0x2013, 150], [0x2014, 151], [0x02DC, 152], [0x2122, 153], [0x0161, 154], [0x203A, 155], [0x0153, 156], [0x017E, 158], [0x0178, 159]]);
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
  return out;
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
function decodePng(buf) {
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
  return { w, h, color: zlib.deflateSync(color), alpha: hasAlpha ? zlib.deflateSync(alpha) : null };
}

// ── pages ────────────────────────────────────────────────────────────
class Page {
  constructor() { this.ops = []; this.images = new Set(); }
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
  text(str, x, y, { size = 10, bold = false, color = "#000000" } = {}) {
    const codes = encode(str);
    if (!codes.length) return;
    this.ops.push(`BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${rgb(color)} rg 1 0 0 1 ${num(x)} ${num(PAGE_H - y)} Tm ${pdfString(codes)} Tj ET`);
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
  loadPng(buf) {
    const d = decodePng(buf);
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
    const f1 = add(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
    const f2 = add(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
    const stream = (dict, data) => Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, Buffer.from("\nendstream")]);
    for (const img of this.imgs) {
      const smask = img.alpha ? add(stream(`/Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, img.alpha)) : 0;
      img.obj = add(stream(`/Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${smask ? ` /SMask ${ref(smask)}` : ""}`, img.color));
    }
    const pageIds = [];
    for (const pg of this.pages) {
      const content = add(stream("/Filter /FlateDecode", zlib.deflateSync(Buffer.from(pg.ops.join("\n"), "latin1"))));
      const xobj = [...pg.images].map((img) => `/Im${img.id} ${ref(img.obj)}`).join(" ");
      pageIds.push(add(Buffer.from(`<< /Type /Page /Parent ${ref(pagesId)} /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${ref(content)} /Resources << /Font << /F1 ${ref(f1)} /F2 ${ref(f2)} >>${xobj ? ` /XObject << ${xobj} >>` : ""} >> >>`)));
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

module.exports = { PdfDocument, textWidth, encode, PAGE_W, PAGE_H };
