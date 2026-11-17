// The patient guide as a PDF, for patients who'd rather keep a file than open
// a link. Same content as the guide link page: the program, the master-guide
// windows and the wording all come from the browser scripts (patient-guides,
// guide, g/guide-model), run here so the two can't drift apart.
//
// Laid out as the refined edition: a forest cover, then one topic per A4
// page on warm paper (your plan; for each medication how to take it, the
// dosage, what it is, side effects and urgent signs; food and everyday
// habits; follow-up and support), a running header with the clinic's logo,
// and a footer showing where you are in the guide. The only web addresses
// printed are the practice's own website on the cover and the injection
// video, which is a QR code and a link.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { PdfDocument, textWidth, PAGE_W, PAGE_H } = require("./pdf");
const { qrMatrix } = require("./qr");

const ctx = vm.createContext({ console });
for (const f of ["patient-guides.js", "guide.js", "g/guide-model.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", f), "utf8"), ctx, { filename: f });
}
const G = vm.runInContext(`({ planModel, visitModel, parseProse, splitLabel, prettyHead, bulletsOf, splitDose, splitWater, toNumber, cap,
  weeksText, heroLede, followWindow, nextFollowupOf, arrangeText, proteinRange, rangeText, untilItems, welcomeLines, closingMessage,
  stepsFrom, doctorInstructions, doseLadder, plateParts, urgentFor, guideFreqPhrase, commaList, lcFirst, dietProteinRangeText,
  dietProteinBasisText, dietExampleDayTotal, ROUTE_LABEL, ROUTE_NOUN, DAY_TONES, CUSTOMER_CARE, DIET_FOOD_GROUPS, DIET_PROTEIN_SWAPS,
  DIET_WHY_TEXT, GLP1_MESSAGE_REASONS, PEPTIDE_MESSAGE_REASONS })`, ctx);

// The app's own line icons, so the PDF and the screens share one set.
const ICONS = (() => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "shared.js"), "utf8");
  const m = src.match(/const paths = (\{[\s\S]*?\n {2}\});/);
  const icons = m ? vm.runInNewContext(`(${m[1]})`) : {};
  return Object.assign(icons, {
    thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    snowflake: '<path d="M2 12h20M12 2v20m-8-8 4-4-4-4m16 8-4-4 4-4M10 4l2 2 2-2m-4 16 2-2 2 2"/>',
  });
})();

// Pictures from the refined edition, read once.
const ASSETS = {};
for (const k of ["cover", "calories", "protein", "water", "fibre", "carbs", "fats", "movement"]) {
  try { ASSETS[k] = fs.readFileSync(path.join(__dirname, "guide-assets", `${k}.png`)); } catch { /* drawn without it */ }
}

const C = {
  paper: "#FDF8EE", card: "#F6EDDF", ink: "#00382F", text: "#26372F", muted: "#5D6E67", line: "#E6DBC9", lineStrong: "#D5C6AE",
  leaf: "#1E6557", soft: "#E1EBE2", alert: "#F6DFD8", roseInk: "#962F27", roseDot: "#C2493B",
  ivory: "#F5EBDD", ivoryMuted: "#BFD3CA", dash: "#DCCFBA",
};
const M = 46;
const CW = PAGE_W - 2 * M;
const TOP = 82;
const BOTTOM = PAGE_H - 58;
const BODY = 9;
const PAD = 16;
const IN = CW - 2 * PAD;

// ── text ─────────────────────────────────────────────────────────────
// No web addresses in the text apart from videos: a video address becomes a
// link showing its short form; other markdown links keep their words, bare
// links go, and a line only there to carry a link ("Book here: …") goes too.
const isVideoUrl = (url) => /(?:^|\/\/|\.)(?:youtu\.be|youtube\.com|vimeo\.com)\//i.test(url);
function shortUrl(url) {
  try {
    const u = new URL(url);
    [...u.searchParams.keys()].forEach((k) => { if (/^(si|feature|pp|utm_.*|fbclid|gclid)$/i.test(k)) u.searchParams.delete(k); });
    return (u.host.replace(/^www\./i, "") + u.pathname + (u.search || "")).replace(/\/$/, "");
  } catch { return url.replace(/^https?:\/\/(www\.)?/i, ""); }
}
const videoLink = (url) => `[${shortUrl(url)}](${url})`;
function cleanBody(text) {
  return String(text || "").split("\n").map((line) => {
    if (!/https?:\/\/|www\./i.test(line)) return line;
    if (isVideoUrl(line)) return line.replace(/(^|[\s(:])(https?:\/\/[^\s)]+)/g, (_, pre, url) => (isVideoUrl(url) ? `${pre}${videoLink(url)}` : pre));
    const out = line
      .replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^\s)]+\)/g, "$1")
      .replace(/\s*\(?(?:https?:\/\/|www\.)[^\s)]+\)?/g, "")
      .replace(/\s+([.,;])/g, "$1").trim();
    return /:$/.test(out) || out.replace(/\P{L}/gu, "").length < 3 ? null : out;
  }).filter((l) => l !== null).join("\n");
}
// The first video address in a text, if any.
const videoIn = (text) => { const m = String(text || "").match(/https?:\/\/[^\s)]+/g); return m ? m.find(isVideoUrl) || "" : ""; };
// Leading emoji go (the PDF font has none); a spaced dash reads as a pause.
const tidy = (s) => String(s || "").replace(/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})[️‍\p{Extended_Pictographic}]*\s*/u, "").replace(/\s+—\s+/g, ", ");

function runsOf(s, bold = false) {
  const out = [];
  tidy(s).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/).forEach((part) => {
    if (!part) return;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) out.push({ t: link[1], b: bold, link: link[2] });
    else if (/^\*\*[^*]+\*\*$/.test(part)) out.push({ t: part.slice(2, -2), b: true });
    else out.push({ t: part, b: bold });
  });
  return out;
}

// Greedy wrap of styled runs into lines of segments.
function wrap(runs, width, size) {
  const toks = [];
  let space = false;
  for (const r of runs) {
    for (const piece of String(r.t).split(/(\s+)/)) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) { space = true; continue; }
      toks.push({ t: piece, b: r.b, link: r.link, space });
      space = false;
    }
  }
  const lines = [];
  let cur = [], w = 0;
  const push = () => { if (cur.length) lines.push({ segs: merge(cur), w }); cur = []; w = 0; };
  for (const tk of toks) {
    const tw = textWidth(tk.t, tk.b, size);
    const sw = cur.length && tk.space ? textWidth(" ", tk.b, size) : 0;
    if (cur.length && w + sw + tw > width) push();
    if (!cur.length && tw > width) {
      let chunk = "";
      for (const ch of tk.t) {
        if (textWidth(chunk + ch, tk.b, size) > width && chunk) { cur.push({ t: chunk, b: tk.b, space: false }); w = textWidth(chunk, tk.b, size); push(); chunk = ""; }
        chunk += ch;
      }
      cur.push({ t: chunk, b: tk.b, space: false });
      w = textWidth(chunk, tk.b, size);
      continue;
    }
    cur.push({ ...tk, space: cur.length ? tk.space : false });
    w += (cur.length > 1 ? sw : 0) + tw;
  }
  push();
  return lines;
}
function merge(toks) {
  const segs = [];
  for (const tk of toks) {
    const t = (tk.space ? " " : "") + tk.t;
    const last = segs[segs.length - 1];
    if (last && last.b === tk.b && last.link === tk.link) last.t += t;
    else if (tk.link && tk.space) { segs.push({ t: " ", b: tk.b }); segs.push({ t: tk.t, b: tk.b, link: tk.link }); }
    else segs.push({ t, b: tk.b, link: tk.link });
  }
  return segs;
}
function drawLine(pg, line, x, baseline, size, color) {
  let cx = x;
  for (const s of line.segs) {
    const w = textWidth(s.t, s.b, size);
    if (s.link) {
      pg.text(s.t, cx, baseline, { size, bold: s.b, color: C.leaf });
      pg.line(cx, baseline + 1.6, cx + w, baseline + 1.6, { color: C.leaf, width: 0.6 });
      pg.link(cx, baseline - size * 0.85, w, size * 1.2, s.link);
    } else pg.text(s.t, cx, baseline, { size, bold: s.b, color });
    cx += w;
  }
}
// Small capitals label with letter spacing.
const KICK = 6.8, KICK_SP = 0.9;
const kickerWidth = (t) => textWidth(t.toUpperCase(), false, KICK) + KICK_SP * t.length;
function kicker(pg, t, x, y, color = C.muted) { pg.text(String(t).toUpperCase(), x, y, { size: KICK, color, spacing: KICK_SP }); }

// ── rows: the unit of layout. Each has a height and draws itself at
// (x, y), its top-left corner; boxes and pages break between rows. ──
const gap = (h) => ({ h, draw() {} });

function textRows(input, width, { size = BODY, lead, color = C.text, bold = false, indent = 0, align = "left", keepNext = false } = {}) {
  const runs = typeof input === "string" ? runsOf(input, bold) : input;
  const lh = lead || size * 1.5;
  const lines = wrap(runs, width - indent, size);
  return lines.map((ln, i) => ({
    h: lh,
    keepNext: keepNext && i === lines.length - 1,
    draw(pg, x, y) {
      const dx = align === "right" ? width - ln.w : align === "center" ? (width - ln.w) / 2 : 0;
      drawLine(pg, ln, x + indent + dx, y + (lh - size) / 2 + size * 0.8, size, color);
    },
  }));
}
function headingRows(text, width, { size = 13, color = C.ink, before = 0, after = 6, bold = false } = {}) {
  const rows = [];
  if (before) rows.push(gap(before));
  rows.push(...textRows(text, width, { size, bold, color, lead: size * 1.3 }));
  rows[rows.length - 1].keepNext = true;
  if (after) rows.push({ ...gap(after), keepNext: true });
  return rows;
}
const kickerRow = (t, after = 8) => ({ h: 10 + after, keepNext: true, draw(pg, x, y) { kicker(pg, t, x, y + 8); } });

function listRows(items, width, { size = BODY, color = C.text, dot = C.leaf, check = false, itemGap = 4, divider = false } = {}) {
  const rows = [];
  items.forEach((item, n) => {
    if (n) rows.push(divider ? { h: itemGap * 2 + 1, draw(pg, x, y, w) { pg.line(x, y + itemGap, x + (w || width), y + itemGap, { color: C.line, width: 0.5 }); } } : gap(itemGap));
    const lines = textRows(runsOf(item), width, { size, color, indent: 15 });
    const firstDraw = lines[0].draw;
    lines[0] = {
      ...lines[0],
      draw(pg, x, y, w) {
        const base = y + (lines[0].h - size) / 2 + size * 0.8;
        if (check) pg.icon(ICONS.check, x - 1, base - size * 0.82, size + 1, { color: dot, width: 2.4 });
        else pg.circle(x + 3, base - size * 0.32, 1.9, { fill: dot });
        firstDraw(pg, x, y, w);
      },
    };
    rows.push(...lines);
  });
  return rows;
}
function proseRows(text, width, opt = {}) {
  const rows = [];
  G.parseProse(cleanBody(text)).forEach((b, i) => {
    if (i) rows.push(gap(6));
    if (b.type === "p") rows.push(...textRows(runsOf(b.text), width, opt));
    else if (b.type === "ol") b.items.forEach((it, k) => { if (k) rows.push(gap(3)); rows.push(...textRows(`${k + 1}. ${it}`, width, opt)); });
    else rows.push(...listRows(b.items, width, { ...opt, check: b.ck }));
  });
  return rows;
}
const ruleRow = (before = 10, after = 10, color = C.line) => ({ h: before + after, draw(pg, x, y, w) { pg.line(x, y + before, x + w, y + before, { color, width: 0.6 }); } });

// A row made of two columns laid out side by side.
function columnsRow(left, right, leftW, gapX = 18) {
  const lh = left.reduce((s, r) => s + r.h, 0), rh = right.reduce((s, r) => s + r.h, 0);
  return {
    h: Math.max(lh, rh),
    draw(pg, x, y, w) {
      let yy = y;
      for (const r of left) { r.draw(pg, x, yy, leftW); yy += r.h; }
      yy = y;
      for (const r of right) { r.draw(pg, x + leftW + gapX, yy, w - leftW - gapX); yy += r.h; }
    },
  };
}

// An icon beside a block of rows (title and text).
function iconRows(iconName, rows, { size = 16, color = C.ink, indent = 26 } = {}) {
  const h = rows.reduce((s, r) => s + r.h, 0);
  return [{
    h: Math.max(h, size + 2),
    draw(pg, x, y, w) {
      pg.icon(ICONS[iconName] || ICONS.info, x, y + 1, size, { color, width: 1.7 });
      let yy = y;
      for (const r of rows) { r.draw(pg, x + indent, yy, w - indent); yy += r.h; }
    },
  }];
}

function initialsOf(name) {
  const parts = String(name || "").replace(/^(dr|mr|mrs|ms|miss|prof)\.?\s+/i, "").split(/\s+/).filter((p) => /^\p{L}/u.test(p));
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
function avatar(pg, name, cx, cy, r) {
  pg.circle(cx, cy, r, { fill: C.soft });
  const t = initialsOf(name), size = r * 0.78;
  pg.text(t, cx - textWidth(t, true, size) / 2, cy + size * 0.36, { size, bold: true, color: C.ink });
}

// ── flow: places rows down the page, inside cards or not ─────────────
class Flow {
  constructor(doc, decorate) { this.doc = doc; this.decorate = decorate; this.chapterNo = 0; this.newPage(); }
  newPage() {
    this.pg = this.doc.addPage();
    this.pg.rect(0, 0, PAGE_W, PAGE_H, { fill: C.paper });
    this.pg.chapterNo = this.chapterNo;
    if (this.decorate) this.decorate(this.pg);
    this.y = TOP;
  }
  gap(h) { this.y = Math.min(this.y + h, BOTTOM); }
  place(rows, { fill, stroke, pad = 0, radius = 11 } = {}) {
    if (!rows.length) return;
    const total = rows.reduce((s, r) => s + r.h, 0) + pad * 2;
    if ((fill || stroke) && total <= BOTTOM - TOP && this.y + total > BOTTOM) this.newPage();
    let i = 0;
    while (i < rows.length) {
      const top = this.y;
      let y = top + pad, j = i;
      while (j < rows.length) {
        let keep = 0;
        for (let k = j; rows[k].keepNext && k + 1 < rows.length; k++) keep += rows[k + 1].h;
        if (y + rows[j].h + keep + pad > BOTTOM && !(j === i && top === TOP)) break;
        y += rows[j].h; j++;
      }
      if (j === i) { this.newPage(); continue; }
      const h = y - top + pad;
      const first = i === 0, last = j === rows.length;
      if (fill || stroke) this.pg.rect(M, top, CW, h, { fill, stroke, lineWidth: 0.7, radius: [first ? radius : 0, first ? radius : 0, last ? radius : 0, last ? radius : 0] });
      let yy = top + pad;
      for (let k = i; k < j; k++) { rows[k].draw(this.pg, M + pad, yy, CW - 2 * pad); yy += rows[k].h; }
      this.y = top + h;
      i = j;
      if (i < rows.length) this.newPage();
    }
  }
  card(rows, fill = C.card, after = 14) { this.place(rows, { fill, pad: PAD }); this.gap(after); }
  get pageNo() { return this.doc.pages.length; }
  // A topic opens a fresh page: "02 / MOUNJARO", the title, a short lede.
  // `chapter` moves the progress marker in the footer on.
  topic(label, title, lede, { chapter = false } = {}) {
    if (chapter) this.chapterNo++;
    if (this.y > TOP || this.doc.pages.length === 1) this.newPage();
    this.pg.chapterNo = this.chapterNo;
    const page = this.pageNo;
    this.place([
      kickerRow(`${String(this.chapterNo).padStart(2, "0")} / ${label}`, 12),
      ...textRows(title, CW, { size: 22, color: C.ink, lead: 27 }),
      gap(5),
      ...(lede ? textRows(lede, CW, { size: 9.2, color: C.muted, lead: 13.5 }) : []),
      gap(16),
    ]);
    return page;
  }
  section(title, before = 6) { this.place(headingRows(title, CW, { size: 13.5, before, after: 8 })); }
}

// ── cover ────────────────────────────────────────────────────────────
function coverPage(doc, models, facility, website, logos, who) {
  const pg = doc.addPage();
  pg.chapterNo = 0;
  const bg = ASSETS.cover ? doc.loadPng(ASSETS.cover) : null;
  if (bg) pg.image(bg, 0, 0, PAGE_W, PAGE_H); else pg.rect(0, 0, PAGE_W, PAGE_H, { fill: C.ink });
  const m = models[0];
  if (logos.ivory) {
    const a = logos.ivory.w / logos.ivory.h, h = Math.min(30, 150 / a);
    pg.image(logos.ivory, M, 44, h * a, h);
  } else pg.text(facility, M, 64, { size: 14, bold: true, color: C.ivory });
  const f = facility.toUpperCase();
  pg.text(f, PAGE_W - M - kickerWidth(f), 62, { size: KICK, color: C.ivoryMuted, spacing: KICK_SP });
  const title = m.kind === "visit" ? ["Personal", "health plan"] : ["Personal", "treatment guide"];
  title.forEach((t, i) => pg.text(t, M, 262 + i * 40, { size: 34, color: C.ivory }));
  pg.line(M, 336, PAGE_W - M, 336, { color: "#3E6A5F", width: 0.6 });
  pg.text(who, M, 376, { size: 17, color: C.ivory });
  const col = M + CW / 2;
  kicker(pg, "Care from", M, 418, C.ivoryMuted);
  pg.text(m.doctor, M, 434, { size: 10, color: C.ivory });
  kicker(pg, "Issued", col, 418, C.ivoryMuted);
  pg.text(fmtDate(m.created), col, 434, { size: 10, color: C.ivory });
  pg.line(M, 474, PAGE_W - M, 474, { color: "#3E6A5F", width: 0.6 });
  if (m.kind === "plan") {
    models.slice(0, 6).forEach((x, i) => {
      const y = 504 + i * 22, p = x.plan;
      pg.text(p.medication, M, y, { size: 10.5, color: C.ivory });
      const r = [p.dose, G.guideFreqPhrase(p.frequency)].filter(Boolean).join(" · ");
      if (r) pg.text(r, PAGE_W - M - textWidth(r, false, 9.5), y, { size: 9.5, color: C.ivoryMuted });
    });
  }
  pg.text(who, M, PAGE_H - 40, { size: 8, color: C.ivoryMuted });
  const right = website || facility;
  pg.text(right, PAGE_W - M - textWidth(right, false, 8.5), PAGE_H - 40, { size: 8.5, color: C.ivory });
}

// ── 01 / your plan ───────────────────────────────────────────────────
function prescriptionCard(m) {
  const p = m.plan, d = G.splitDose(p.dose);
  const leftW = IN * 0.44;
  const left = [kickerRow("Your current prescription", 8), ...textRows(p.medication, leftW, { size: 15, color: C.ink, lead: 19 })];
  if (d.num) {
    left.push({
      h: 38,
      draw(pg, x, y) {
        pg.text(d.num, x, y + 30, { size: 30, color: C.ink });
        if (d.unit) pg.text(d.unit, x + textWidth(d.num, false, 30) + 6, y + 30, { size: 11, color: C.muted });
      },
    });
    if (d.rest) left.push(...textRows(p.dose, leftW, { size: 8.4, color: C.muted }));
  } else left.push(gap(4), ...textRows(p.dose || "As advised by your doctor", leftW, { size: 11, color: C.ink }));
  const facts = [
    ["clock", G.cap(G.guideFreqPhrase(p.frequency)) || "As advised"],
    ["syringe", G.ROUTE_LABEL[p.route] || G.cap(p.route) || ""],
    ["calendar", m.phase && m.phase.weeks ? G.weeksText(m.phase.weeks) : p.quantity > 1 ? `Quantity ${p.quantity}` : "Until your review"],
  ].filter((f) => f[1]);
  const right = [];
  facts.forEach(([ic, t], i) => {
    if (i) right.push(gap(7));
    right.push(...iconRows(ic === "syringe" && p.route && p.route !== "injection" ? "pill" : ic, textRows(t, IN - leftW - 60, { size: 9.2, color: C.text, lead: 14 }), { size: 13, color: C.muted, indent: 22 }));
  });
  return [{
    ...columnsRow(left, [gap(12), ...right], leftW, 40),
    draw(pg, x, y, w) {
      const r = columnsRow(left, [gap(12), ...right], leftW, 40);
      r.draw(pg, x, y, w);
      pg.line(x + leftW + 20, y + 6, x + leftW + 20, y + r.h - 4, { color: C.lineStrong, width: 0.6 });
    },
  }];
}

function essentialsRow(d, imgs) {
  const kcal = G.toNumber(d.calories), pr = G.proteinRange(d), w = G.splitWater(d.water);
  const cells = [
    kcal ? { img: imgs.calories, label: "Daily calories", value: kcal.toLocaleString("en-US"), unit: "kcal", note: "Approximately, per day" } : null,
    pr ? { img: imgs.protein, label: "Protein", value: G.rangeText(pr), unit: "g", note: "Include with every meal" } : null,
    { img: imgs.water, label: "Water", value: w.value, unit: w.unit, note: `${w.rest ? G.cap(w.rest) + ", unless" : "Daily, unless"} advised otherwise` },
  ].filter(Boolean);
  return {
    h: 66,
    draw(pg, x, y, wd) {
      const cw = wd / cells.length;
      cells.forEach((c, i) => {
        const cx = x + i * cw;
        if (i) pg.line(cx - 10, y + 2, cx - 10, y + 60, { color: C.line, width: 0.6 });
        pg.text(c.label, cx, y + 10, { size: 8.4, color: C.muted });
        if (c.img) { const ih = 26, iw = ih * (c.img.w / c.img.h); pg.image(c.img, cx + cw - 22 - iw, y, iw, ih); }
        pg.text(c.value, cx, y + 40, { size: 20, color: C.ink });
        if (c.unit) pg.text(c.unit, cx + textWidth(c.value, false, 20) + 3, y + 40, { size: 8.4, color: C.muted });
        pg.text(c.note, cx, y + 56, { size: 7.4, color: C.muted });
      });
    },
  };
}

function nextCardRows(m, { big = false, multi = [] } = {}) {
  const w = G.followWindow(G.nextFollowupOf(m));
  const label = m.kind === "visit" ? "Next follow-up" : big ? "Next follow-up & medication refill" : "Next follow-up & refill";
  const when = w ? (w.past ? "Due now" : big ? w.range : `${w.range} ${w.year}`) : "To be arranged";
  const rows = iconRows("calendar", textRows(label, IN - 26, { size: 8.8, color: C.text, lead: 13 }), { size: 13, color: C.muted, indent: 20 });
  rows.push(gap(6), {
    h: big ? 34 : 26,
    draw(pg, x, y, wd) {
      const size = big ? 27 : 20;
      pg.text(when, x, y + size * 0.95, { size, color: C.ink });
      if (big && w && !w.past) { const yr = String(w.year); pg.text(yr, x + wd - textWidth(yr, false, 15), y + size * 0.95, { size: 15, color: C.muted }); }
    },
  });
  multi.forEach((x) => rows.push(gap(3), ...textRows(x, IN, { size: 8.6, color: C.muted })));
  return rows;
}

function contentsRows(entries) {
  return entries.map((e, i) => ({
    h: 19,
    draw(pg, x, y, w) {
      pg.line(x, y, x + w, y, { color: C.line, width: 0.5 });
      pg.text(e.label, x, y + 13, { size: 8.8, color: C.text });
      const t = e.range;
      pg.text(t, x + w - textWidth(t, false, 8.6), y + 13, { size: 8.6, color: C.muted });
      if (i === entries.length - 1) pg.line(x, y + 19, x + w, y + 19, { color: C.line, width: 0.5 });
    },
  }));
}

function planPage(flow, models, imgs, entryCount = 0) {
  const m = models[0];
  flow.topic(m.kind === "visit" ? "Your health plan" : "Your plan", m.kind === "visit" ? "Your health. In balance." : "Your care. In balance.", G.heroLede(m), { chapter: true });
  if (m.kind === "plan") {
    models.forEach((x) => flow.card(prescriptionCard(x), C.card, 10));
    flow.place(textRows(`Continue ${models.length > 1 ? "each dose" : "this dose"} unless your doctor advises otherwise.`, CW, { size: 8.8, color: C.muted }));
    flow.gap(18);
  } else {
    const rows = [kickerRow("Your goals", 8), ...textRows(m.goals.length ? m.goals.join("  ·  ") : "Your doctor will go through your goals with you at your next visit.", IN, { size: 10.5, color: C.ink, lead: 15 })];
    rows.push(ruleRow(8, 8), ...textRows("Your plan is built around these goals and your own nutrition needs.", IN, { size: 8.8, color: C.muted }));
    flow.card(rows);
  }
  const dm = models.find((x) => x.diet);
  if (dm) { flow.place([kickerRow("Your daily essentials", 10), essentialsRow(dm.diet, imgs)]); flow.gap(18); }
  const others = [];
  const w0 = G.followWindow(G.nextFollowupOf(m));
  models.slice(1).forEach((x) => { const xw = G.followWindow(G.nextFollowupOf(x)); if (xw && (!w0 || xw.range !== w0.range)) others.push(`${x.plan.medication}: ${xw.past ? "follow-up due now" : `${xw.range} ${xw.year}`}`); });
  flow.card(nextCardRows(m, { multi: others }), C.card, 8);
  const arrange = w0 && w0.past ? "Your follow-up is due. Please get in touch so we can arrange it." : m.kind === "visit" || !m.appName ? G.arrangeText(m) : `Arrange your review through the ${m.appName}.`;
  flow.place(textRows(arrange, CW, { size: 8.8, color: C.muted }));
  flow.gap(20);
  if (m.kind === "visit") {
    const v = m.visit;
    const advice = [kickerRow(`From ${m.doctor}`, 6), ...headingRows(v.advice ? "Advice from your doctor" : "Your health plan", IN, { size: 13 })];
    advice.push(...proseRows(v.advice || "Here is the plan we talked about. It's built around your goals and your own nutrition needs.", IN));
    flow.card(advice);
    if (v.medicationWhy) flow.card([...headingRows("How medication could help", IN, { size: 13 }), ...proseRows(v.medicationWhy, IN)]);
    return null;
  }
  const slot = {};
  flow.place([kickerRow("In this guide", 6), { h: entryCount * 19 + 1, draw(pg, x, y, w) { Object.assign(slot, { pg, x, y, w }); } }]);
  return slot;
}

// ── a medication, page by page ───────────────────────────────────────
function howTitle(p) {
  const f = String(p.frequency || "").toLowerCase();
  const every = /week/.test(f) ? "weekly " : /^daily|once daily|every day/.test(f) ? "daily " : "";
  if (p.route === "injection" || !p.route) return `Your ${every}injection`;
  if (p.route === "oral") return `Your ${every}tablets`.replace("Your tablets", "Your tablets");
  if (p.route === "nasal") return "Your nasal spray";
  if (p.route === "topical") return "Applying your treatment";
  return "How to take it";
}

function qrCardRows(url, w) {
  const m = qrMatrix(url);
  if (!m) return [];
  return [{
    h: 150,
    draw(pg, x, y) {
      pg.rect(x, y, w, 150, { fill: C.card, radius: 11 });
      pg.icon(ICONS.clipboard, x + 12, y + 12, 13, { color: C.muted, width: 1.7 });
      pg.text("Injection video", x + 12, y + 40, { size: 8.6, color: C.ink });
      pg.text("guide", x + 12, y + 51, { size: 8.6, color: C.ink });
      const box = w - 24, n = m.length + 4, cell = box / n;
      pg.rect(x + 12, y + 60, box, box, { fill: "#FFFFFF", radius: 6 });
      for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) if (m[r][c]) pg.rect(x + 12 + (c + 2) * cell, y + 60 + (r + 2) * cell, cell + 0.15, cell + 0.15, { fill: "#0C2620" });
      pg.text("Scan to watch", x + 12, y + 60 + box + 13, { size: 7.4, color: C.muted });
      pg.link(x, y, w, 150, url);
    },
  }];
}

function howPage(flow, m) {
  const p = m.plan;
  const label = p.medication.toUpperCase();
  const lede = p.route === "injection" || !p.route ? "How to take your injection, with the steps from your treatment guide." : `How to take ${p.medication}, with the steps from your treatment guide.`;
  flow.topic(label, howTitle(p), lede, { chapter: true });
  const st = G.stepsFrom(m);
  const howBody = m.std.how ? m.std.how.body : "";
  const vid = videoIn(howBody) || (/^https?:\/\//i.test(m.info.videoLink || "") ? m.info.videoLink : "");
  const freq = p.frequency ? ` · ${G.guideFreqPhrase(p.frequency)}` : "";
  const pres = [m.phase && m.phase.weeks ? `Current prescription · ${G.weeksText(m.phase.weeks)}` : "Current prescription"];
  flow.card([{
    h: 16,
    draw(pg, x, y, w) {
      pg.icon(p.route === "oral" ? ICONS.pill : ICONS.syringe, x, y + 1, 13, { color: C.muted, width: 1.7 });
      pg.text(`${p.medication}${p.dose ? ` ${p.dose}` : ""}${freq}`, x + 22, y + 11, { size: 10, color: C.ink });
      pg.text(pres[0], x + w - textWidth(pres[0], false, 7.8), y + 11, { size: 7.8, color: C.muted });
    },
  }], C.card, 18);

  const qrW = vid ? 112 : 0;
  const leftW = CW - (qrW ? qrW + 22 : 0);
  const left = [];
  if (st.before) left.push(...proseRows(st.before, leftW), gap(8));
  st.steps.forEach((s, i) => {
    if (i) left.push(gap(5));
    const lines = textRows(runsOf(s), leftW, { indent: 30, lead: 13.5 });
    const h = Math.max(lines.reduce((a, r) => a + r.h, 0), 20);
    left.push({
      h,
      draw(pg, x, y, w) {
        pg.circle(x + 9, y + 9, 9, { fill: C.card });
        const n = String(i + 1).padStart(2, "0");
        pg.text(n, x + 9 - textWidth(n, false, 7) / 2, y + 11.5, { size: 7, color: C.muted });
        let yy = y + (h > 20 ? 0 : 3);
        lines.forEach((r) => { r.draw(pg, x, yy, w); yy += r.h; });
      },
    });
  });
  const after = vid ? st.after.split("\n").filter((l) => !l.includes(vid)).join("\n") : st.after;
  flow.place([vid ? columnsRow(left, qrCardRows(vid, qrW), leftW, 22) : { h: left.reduce((a, r) => a + r.h, 0), draw(pg, x, y, w) { let yy = y; left.forEach((r) => { r.draw(pg, x, yy, w); yy += r.h; }); } }]);
  flow.gap(14);
  const tail = [...textRows("Continue this dose unless advised otherwise.", CW, { size: 9, color: C.ink })];
  if (after.trim()) tail.push(gap(5), ...proseRows(after, CW));
  flow.place(tail);
  flow.gap(16);
  const docText = st.fromDoctor ? "" : G.doctorInstructions(m);
  if (docText) flow.card(iconRows("clipboard", [...textRows("Instructions from your doctor", IN - 26, { size: 10, color: C.ink, lead: 15 }), gap(3), ...proseRows(docText, IN - 26, { size: 8.8, color: C.text })], { size: 14, color: C.muted, indent: 26 }));
}

// The titration line for a dose: "Weeks 5–8: 5 mg" → "05–08".
function weeksLabel(line) {
  const m = String(line || "").match(/^weeks?\s+([\d]+)\s*(?:[–-]\s*([\d]+)|(onwards|\+))?/i);
  if (!m) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return m[2] ? `${pad(m[1])}–${pad(m[2])}` : m[3] ? `${m[1]} onwards` : pad(m[1]);
}

function dosagePage(flow, m) {
  const p = m.plan;
  flow.topic(p.medication.toUpperCase(), "Your dosage", "Your doctor may adjust this at your next review.");
  const d = G.splitDose(p.dose);
  const facts = [G.cap(G.guideFreqPhrase(p.frequency)), m.phase && m.phase.weeks ? `Current duration: ${G.weeksText(m.phase.weeks)}` : "", p.quantity > 1 ? `Quantity dispensed: ${p.quantity}` : ""].filter(Boolean);
  flow.card([kickerRow("Current dose", 6), {
    h: 36,
    draw(pg, x, y, w) {
      const big = d.num ? d.num + (d.unit || "") : p.dose || "As advised";
      pg.text(big, x, y + 28, { size: 26, color: C.ink });
      facts.forEach((f, i) => pg.text(f, x + w * 0.42, y + 12 + i * 14, { size: i ? 8.4 : 9.6, color: i ? C.muted : C.ink }));
    },
  }], C.card, 18);

  const { ladder, cur, future } = G.doseLadder(m);
  const tBody = m.std.titration ? cleanBody(m.std.titration.body) : "";
  const tLines = tBody.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = G.bulletsOf(tBody);
  const firstBullet = tLines.findIndex((l) => /^(?:•|[-–]\s)/u.test(l));
  const intro = (firstBullet > 0 ? tLines.slice(0, firstBullet) : firstBullet < 0 ? [] : []).join("\n");
  const outro = firstBullet >= 0 ? tLines.slice(firstBullet).filter((l) => !/^(?:•|[-–]\s)/u.test(l)).join("\n") : tBody;
  if (ladder.length > 1) {
    flow.section(m.std.titration ? G.prettyHead(m.std.titration.head, p.medication) : "Your dosing schedule", 0);
    if (intro) { flow.place(proseRows(intro, CW, { size: 8.8, color: C.text })); flow.gap(10); }
    const loose = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
    const lineFor = (dose) => bullets.find((l) => { const n = G.splitDose(dose).num; return n && new RegExp(`(^|[^\\d.])${n.replace(/\./g, "\\.")}\\s*(mg|mcg|ml)?(?![\\d.])`, "i").test(l.split(":").slice(1).join(":")); }) || "";
    const rows = [{
      h: 22,
      draw(pg, x, y, w) {
        kicker(pg, "Weeks", x, y + 12); kicker(pg, "Dose", x + 92, y + 12); kicker(pg, "Doctor-led progression", x + 196, y + 12);
        pg.line(x, y + 19, x + w, y + 19, { color: C.lineStrong, width: 0.6 });
      },
    }];
    ladder.forEach((dose, i) => {
      const wk = weeksLabel(lineFor(dose)) || (i === ladder.length - 1 ? `${i * 4 + 1} onwards` : `${String(i * 4 + 1).padStart(2, "0")}–${String(i * 4 + 4).padStart(2, "0")}`);
      const state = i === cur ? (i === 0 ? "Starting dose · current" : "Current dose") : i < cur ? (i === 0 ? "Starting dose" : "Earlier dose") : i === ladder.length - 1 ? "Maximum dose · only if prescribed" : "Future dose, only if prescribed";
      rows.push({
        h: 25,
        draw(pg, x, y, w) {
          if (i === cur) pg.rect(x - 8, y + 2, w + 16, 22, { fill: C.card, radius: 6 });
          else pg.line(x, y + 24, x + w, y + 24, { color: C.line, width: 0.5 });
          pg.text(wk, x, y + 17, { size: 8.8, color: C.text });
          pg.text(dose, x + 92, y + 17.5, { size: 12, color: C.ink });
          pg.text(state, x + 196, y + 17, { size: 8.4, color: i === cur ? C.ink : C.muted });
        },
      });
    });
    flow.place(rows);
    flow.gap(16);
    if (future.length) {
      flow.card(iconRows("info", [...textRows("Only change dose with your doctor", IN - 24, { size: 9.6, color: C.ink, lead: 14 }), gap(2),
        ...textRows(`Your doctor moves you to a future dose at a review, and only if your current dose is well tolerated. Keep taking ${p.dose || "your current dose"} until then.`, IN - 24, { size: 8.6, color: C.text })], { size: 13, color: C.muted, indent: 24 }));
    }
    if (outro.trim()) flow.place(proseRows(outro, CW, { size: 8.4, color: C.muted }));
  } else if (tBody) {
    flow.section(G.prettyHead(m.std.titration.head, p.medication), 0);
    flow.place(proseRows(tBody, CW));
  } else if (ladder.length === 1) {
    flow.place(textRows(`Approved strength: ${ladder[0]}.`, CW, { color: C.muted }));
  }
}

// Storage lines get a short title and a matching icon.
function storageRow(line) {
  const l = tidy(line);
  const temp = l.match(/(\d+\s*°C\s*[–-]\s*\d+\s*°C)/);
  const days = l.match(/up to (\d+\s*(?:days|weeks|months))/i);
  let t = "", ic = "check";
  if (/refrigerat|fridge/i.test(l) && temp) { t = temp[1].replace(/\s/g, ""); ic = "thermometer"; }
  else if (days) { t = `Up to ${days[1]}`; ic = "clock"; }
  else if (/do not freeze|don't freeze/i.test(l)) { t = "Do not freeze"; ic = "alert"; }
  else if (/light/i.test(l)) { t = "Protect from light"; ic = "sun"; }
  else if (/^check|inspect|cloudy|discolou?r/i.test(l)) { t = "Check before use"; ic = "check"; }
  else if (temp) { t = temp[1].replace(/\s/g, ""); ic = "thermometer"; }
  return { t, ic, body: l };
}

function aboutPage(flow, m) {
  const p = m.plan;
  const about = m.std.about ? m.std.about.body : m.info.howItWorks || "";
  const more = m.std.more;
  if (!about && !more.length) return;
  flow.topic(p.medication.toUpperCase(), "About your medication", "");
  const generic = (String(about).match(new RegExp(`${p.medication.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(([^)]+)\\)`, "i")) || [])[1] || "";
  const cls = /GIP\b.*GLP-1|GIP and GLP-1|GIP\/GLP-1/i.test(about) ? "GIP + GLP-1" : /GLP-1/i.test(about) ? "GLP-1" : "";
  flow.card([{
    h: generic ? 30 : 20,
    draw(pg, x, y, w) {
      pg.icon(p.route === "oral" ? ICONS.pill : ICONS.syringe, x, y + 4, 15, { color: C.muted, width: 1.7 });
      pg.text(p.medication, x + 26, y + 14, { size: 14, color: C.ink });
      if (generic) pg.text(G.cap(generic), x + 26, y + 27, { size: 8.4, color: C.muted });
      if (cls) pg.text(cls, x + w - textWidth(cls, false, 8), y + 14, { size: 8, color: C.muted });
    },
  }], C.card, 16);
  if (about) { flow.place(proseRows(about, CW, { size: 9, lead: 14 })); flow.gap(18); }
  more.forEach((s) => {
    const head = G.prettyHead(s.head, p.medication);
    if (/storage/i.test(s.head)) {
      flow.section(head, 0);
      const items = G.bulletsOf(cleanBody(s.body));
      const rows = [];
      items.forEach((it, i) => {
        const r = storageRow(it);
        rows.push({
          h: r.t ? 40 : 28,
          draw(pg, x, y, w) {
            pg.icon(ICONS[r.ic], x, y + 4, 15, { color: C.muted, width: 1.6 });
            if (r.t) pg.text(r.t, x + 30, y + 13, { size: 9.4, color: C.ink });
            const ln = wrap(runsOf(r.body), w - 30, 8.2);
            ln.slice(0, 2).forEach((l, k) => drawLine(pg, l, x + 30, y + (r.t ? 27 : 13) + k * 11, 8.2, C.muted));
            if (i < items.length - 1) pg.line(x, y + (r.t ? 36 : 24), x + w, y + (r.t ? 36 : 24), { color: C.line, width: 0.5 });
          },
        });
      });
      flow.place(rows);
      flow.gap(14);
    } else {
      flow.place([...headingRows(head, CW, { size: 12, after: 6 }), ...proseRows(s.body, CW)]);
      flow.gap(14);
    }
  });
}

function sideEffectsPage(flow, m) {
  const p = m.plan, info = m.info;
  const settle = /settle|2[–-]4 weeks/i.test(info.commonSideEffects || "") || m.isGlp1;
  flow.topic(p.medication.toUpperCase(), "Side effects & support", settle ? "Common effects usually settle within 2–4 weeks of a dose change." : "What to expect, and what can help.");
  const body = m.std.effects ? cleanBody(m.std.effects.body) : "";
  const items = G.bulletsOf(body).map((b) => { const l = G.splitLabel(b); return l ? [l[0], l[1]] : [b, ""]; });
  const rest = body.split("\n").map((l) => l.trim()).filter((l) => l && !/^(?:•|[-–]\s|✔)/u.test(l));
  if (!items.length && info.commonSideEffects) String(info.commonSideEffects).split(/\s+[—–-]\s+/)[0].split(/,\s*/).forEach((x) => items.push([G.cap(x.trim()), ""]));
  if (items.length) {
    const effW = 140;
    const rows = [{ h: 20, draw(pg, x, y, w) { kicker(pg, "Common effect", x, y + 10); kicker(pg, "What can help", x + effW, y + 10); } }];
    items.forEach(([eff, help], i) => {
      const ln = wrap(runsOf(help || ""), CW - effW, 8.6);
      const h = Math.max(ln.length * 12.5, 13) + 16;
      rows.push({
        h,
        draw(pg, x, y, w) {
          pg.line(x, y, x + w, y, { color: C.line, width: 0.5 });
          wrap(runsOf(eff), effW - 12, 9.2).forEach((l, k) => drawLine(pg, l, x, y + 15 + k * 12.5, 9.2, C.ink));
          ln.forEach((l, k) => drawLine(pg, l, x + effW, y + 15 + k * 12.5, 8.6, C.text));
          if (i === items.length - 1) pg.line(x, y + h, x + w, y + h, { color: C.line, width: 0.5 });
        },
      });
    });
    flow.place(rows);
    flow.gap(16);
  }
  const note = [...rest, `Message your doctor if symptoms persist or interfere with normal ${m.isGlp1 ? "eating or drinking" : "daily activity"}.`].join(" ");
  flow.card(iconRows("info", textRows(note, IN - 24, { size: 8.6, color: C.text, lead: 13 }), { size: 13, color: C.muted, indent: 24 }), C.card, 12);
  const msg = [...textRows("Message your doctor", IN - 40, { size: 12, color: C.ink, lead: 16 }), gap(4),
    ...textRows(`Contact ${m.doctor} for ${G.commaList(m.isGlp1 ? G.GLP1_MESSAGE_REASONS : G.PEPTIDE_MESSAGE_REASONS, "or")}. ${m.appName ? `If you have the ${m.appName}, you can message us there.` : "You're welcome to message your doctor directly with any questions."}`, IN - 40, { size: 8.6, color: C.text, lead: 13 })];
  flow.card([{
    h: msg.reduce((s, r) => s + r.h, 0),
    draw(pg, x, y, w) { avatar(pg, m.doctor, x + 14, y + 13, 14); let yy = y; msg.forEach((r) => { r.draw(pg, x + 40, yy, w - 40); yy += r.h; }); },
  }], C.card, 12);
  if (m.isGlp1) flow.place(textRows("Mild nausea, softer stools and reduced appetite are common in the first weeks and usually settle.", CW, { size: 8.4, color: C.muted }));
}

function urgentPage(flow, m) {
  const p = m.plan;
  const { items, extra } = G.urgentFor(m);
  const warnings = String(p.warnings || "").trim();
  if (!items.length && !m.std.notes && !warnings) return;
  flow.topic(p.medication.toUpperCase(), "When to seek urgent help", items.length ? "Get urgent medical help for any of the following:" : "");
  flow.card([{
    h: 16,
    draw(pg, x, y) {
      pg.icon(ICONS.alert, x, y, 15, { color: C.roseInk, width: 1.8 });
      pg.text("If you need urgent medical help, contact your nearest emergency service.", x + 26, y + 11.5, { size: 9.2, color: C.roseInk });
    },
  }], C.alert, 14);
  if (items.length) { flow.place(listRows(items, CW, { size: 8.8, dot: C.roseDot, divider: true, itemGap: 7 })); flow.gap(10); }
  if (extra) { flow.place(proseRows(extra, CW, { size: 8.8 })); flow.gap(10); }
  if (m.std.notes) { flow.place([...headingRows("Important safety notes", CW, { size: 13, before: 8, after: 6 }), ...proseRows(m.std.notes.body, CW, { size: 8.8 })]); flow.gap(10); }
  if (warnings) flow.place([...headingRows("From your doctor", CW, { size: 11, before: 8, after: 4 }), ...proseRows(warnings.replace(/\s+-\s+(?=[A-Z])/g, "\n- "), CW, { size: 8.6, color: C.text })]);
}

// ── food & everyday habits ───────────────────────────────────────────
function welcomePage(flow, models, imgs) {
  const m = models.find((x) => x.diet) || models[0];
  const d = m.diet;
  const med = m.kind === "plan" ? m.plan.medication : "";
  flow.topic("Food & everyday habits", "Your journey, not a race.", d ? "Eat enough to nourish your body, even as your appetite changes." : "Small, steady habits that support your treatment.", { chapter: true });
  const lines = G.welcomeLines(m).map((l) => tidy(l));
  const letter = [{ h: 26, draw(pg, x, y) { avatar(pg, m.doctor, x + 11, y + 10, 11); kicker(pg, `From ${m.doctor}`, x + 30, y + 13); } }, gap(4)];
  letter.push(...textRows(lines[0], CW, { size: 9.4, color: C.ink }), gap(4), ...textRows(lines.slice(1).join(" "), CW, { size: 9, lead: 14 }), gap(6), ...textRows(m.doctor, CW, { size: 9, color: C.muted }));
  flow.place(letter);
  flow.gap(18);
  if (!d) return;
  const pr = G.proteinRange(d), w = G.splitWater(d.water), kcal = G.toNumber(d.calories);
  const tiles = [
    kcal ? { img: imgs.calories, label: "calories", value: `~${kcal.toLocaleString("en-US")}` } : null,
    pr ? { img: imgs.protein, label: "protein", value: `${G.rangeText(pr)} g` } : null,
    { img: imgs.water, label: `water${w.rest ? ` ${w.rest}` : " daily"}`, value: `${w.value}${w.unit ? ` ${w.unit}` : ""}` },
    { img: imgs.fibre, label: "fibre a day", value: "25–35 g" },
  ].filter(Boolean);
  flow.place([kickerRow("Your daily targets", 10), {
    h: 80,
    draw(pg, x, y, wd) {
      const g = 8, tw = (wd - g * (tiles.length - 1)) / tiles.length;
      tiles.forEach((t, i) => {
        const tx = x + i * (tw + g);
        pg.rect(tx, y, tw, 80, { fill: C.card, radius: 10 });
        if (t.img) { const ih = 22, iw = ih * (t.img.w / t.img.h); pg.image(t.img, tx + 10, y + 9, iw, ih); }
        pg.text(t.label, tx + 10, y + 48, { size: 7.6, color: C.muted });
        pg.text(t.value, tx + 10, y + 68, { size: 15, color: C.ink });
      });
    },
  }]);
  flow.gap(12);
  flow.place(textRows(`${med ? `${med} reduces appetite, but your body` : "Your body"} still needs adequate protein, vitamins, minerals, fibre, and fluids.`, CW, { size: 8.8, color: C.muted }));
  flow.gap(16);
  if (d.note) flow.card([...headingRows("A note from your doctor", IN, { size: 10.5, after: 3 }), ...proseRows(d.note, IN)]);
  flow.section("Prioritise protein", 2);
  flow.place(textRows("Protein helps preserve muscle and keeps you fuller for longer. Include it with every meal.", CW, { size: 9 }));
  flow.gap(10);
  if (pr) {
    const basis = tidy(G.dietProteinBasisText(d));
    flow.card([{
      h: 26,
      draw(pg, x, y, w) {
        const t = `${G.rangeText(pr)} g`;
        pg.text(t, x, y + 21, { size: 20, color: C.ink });
        const lx = x + textWidth(t, false, 20) + 22;
        wrap(runsOf(basis), w - (lx - x), 8.4).slice(0, 2).forEach((l, k) => drawLine(pg, l, lx, y + 13 + k * 11.5, 8.4, C.text));
      },
    }], C.card, 12);
  }
  flow.place(textRows(`Choose ${G.lcFirst(G.DIET_FOOD_GROUPS[0].foods.replace(/\.$/, ""))}.`, CW, { size: 8.8, color: C.text }));
}

function plateRow(d) {
  const parts = G.plateParts(d);
  const legendW = CW - 190;
  const blocks = parts.map((p) => ({ p, head: wrap([{ t: `${p.value} ${p.name.toLowerCase()}`, b: false }], legendW - 18, 9.6), body: wrap(runsOf(p.detail), legendW - 18, 8.4) }));
  const legendH = blocks.reduce((s, b) => s + b.head.length * 13 + b.body.length * 11.5 + 9, 0);
  const h = Math.max(legendH, 126);
  return {
    h,
    draw(pg, x, y) {
      const cx = x + 64, cy = y + h / 2, r = 50;
      pg.arc(cx, cy, r, 0, 359.9, { color: "#EEE1CF", width: 20 });
      let a = 0;
      parts.forEach((p) => { const span = p.fraction * 360; pg.arc(cx, cy, r, a, a + span - 2, { color: p.color, width: 20 }); a += span; });
      pg.circle(cx, cy, r - 12, { fill: C.paper });
      pg.arc(cx, cy, 22, 0, 359.9, { color: C.lineStrong, width: 1 });
      pg.arc(cx, cy, 13, 0, 359.9, { color: C.lineStrong, width: 1 });
      let yy = y + (h - legendH) / 2;
      const lx = x + 150;
      blocks.forEach((b) => {
        pg.circle(lx + 3, yy + 7, 3, { fill: b.p.color });
        b.head.forEach((ln) => { drawLine(pg, ln, lx + 14, yy + 10, 9.6, C.ink); yy += 13; });
        b.body.forEach((ln) => { drawLine(pg, ln, lx + 14, yy + 9, 8.4, C.muted); yy += 11.5; });
        yy += 9;
      });
    },
  };
}

function platePage(flow, d) {
  flow.topic("Food & everyday habits", "Build a simple plate", "Use this as your guide for every main meal. These are portions of your plate, not calorie percentages.");
  flow.place([plateRow(d)]);
  flow.gap(18);
  flow.section("An example day", 0);
  flow.place(textRows("This is one way your day could look. Swap in foods you enjoy, keeping the portions similar.", CW, { size: 8.6, color: C.muted }));
  flow.gap(10);
  const rows = [{ h: 18, draw(pg, x, y, w) { kicker(pg, "Meal", x, y + 9); kicker(pg, "What to eat", x + 100, y + 9); const t = "PROTEIN"; kicker(pg, "Protein", x + w - kickerWidth(t), y + 9); } }];
  d.meals.forEach((mm) => {
    const lines = wrap(runsOf(mm.items), CW - 100 - 60, 8.6);
    const h = Math.max(lines.length * 12.5, 13) + 14;
    rows.push({
      h,
      draw(pg, x, y, w) {
        pg.line(x, y, x + w, y, { color: C.line, width: 0.5 });
        pg.text(mm.name, x, y + 15, { size: 9, color: C.ink });
        lines.forEach((ln, k) => drawLine(pg, ln, x + 100, y + 15 + k * 12.5, 8.6, C.text));
        if (mm.proteinG) { const t = `${mm.proteinG} g`; pg.text(t, x + w - textWidth(t, false, 9), y + 15, { size: 9, color: C.ink }); }
      },
    });
  });
  flow.place(rows);
  flow.gap(8);
  const total = G.dietExampleDayTotal(d);
  const tail = [];
  if (total) tail.push(...textRows(`The example day gives about ${total} g of protein.`, CW, { size: 8.6, color: C.text }), gap(6));
  tail.push(...textRows([{ t: "Protein swaps. ", b: true }, { t: `Each of these gives about 25 g of protein: ${G.DIET_PROTEIN_SWAPS}.`, b: false }], CW, { size: 8.4, color: C.muted }));
  flow.place(tail);
}

function mealsPage(flow, m, imgs) {
  const med = m.kind === "plan" ? m.plan.medication : "";
  flow.topic("Food & everyday habits", "Make every meal count", `High-value foods give your body the most nutrition for the fewest calories.${med ? ` Because ${med} lowers your appetite, you'll eat less, so every meal needs to count.` : " When you are eating less, every meal needs to count."}`);
  const pics = [imgs.protein, imgs.fibre, imgs.carbs, imgs.fats];
  const rows = [];
  G.DIET_FOOD_GROUPS.slice(0, 4).forEach((g, i) => {
    if (i) rows.push(gap(10));
    const lines = wrap(runsOf(g.foods), CW - 40, 8.4);
    rows.push({
      h: 16 + lines.length * 11.5,
      draw(pg, x, y) {
        const img = pics[i];
        if (img) { const ih = 22, iw = Math.min(30, ih * (img.w / img.h)); pg.image(img, x, y, iw, iw / (img.w / img.h)); }
        pg.text(g.name, x + 40, y + 10, { size: 9.6, color: C.ink });
        lines.forEach((ln, k) => drawLine(pg, ln, x + 40, y + 23 + k * 11.5, 8.4, C.muted));
      },
    });
  });
  flow.place(rows);
  flow.gap(16);
  const why = wrap(runsOf(G.DIET_WHY_TEXT), CW - 14, 8.4);
  flow.place([{ h: why.length * 12 + 4, draw(pg, x, y) { pg.rect(x, y, 2, why.length * 12 + 2, { fill: C.lineStrong }); why.forEach((ln, k) => drawLine(pg, ln, x + 12, y + 9 + k * 12, 8.4, C.text)); } }]);
  flow.gap(16);
  flow.section("If your appetite is low", 0);
  flow.place(listRows([
    "**Protein first.** Start each meal with your protein, in case you fill up quickly.",
    "**Don't skip meals.** If your appetite is low, have a smaller portion and keep the protein.",
    "**Small portions, eaten slowly.** Stop when you're comfortably full.",
  ], CW, { size: 8.8 }));
  flow.gap(16);
  flow.card(iconRows("info", [...textRows("What to limit", IN - 24, { size: 9.6, color: C.ink, lead: 14 }), gap(2),
    ...textRows(`${G.DIET_FOOD_GROUPS[4].foods} ${med ? "Go easy on greasy and fried food. It can make nausea worse." : "Greasy and fried food adds calories without much nutrition."}`, IN - 24, { size: 8.6, color: C.text })], { size: 13, color: C.muted, indent: 24 }));
}

// One master-guide food section ("GLP-1 success tips"): short bullet lists
// become a two-column checklist, others a bulleted list under a small label.
function tipsRows(s, med) {
  const rows = headingRows(G.prettyHead(s.head, med), CW, { size: 13, after: 6 });
  const lines = cleanBody(s.body).split("\n").map((l) => l.trim());
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l) { i++; continue; }
    if (/^(?:•|[-–]\s)/u.test(l)) {
      const items = [];
      while (i < lines.length && /^(?:•|[-–]\s)/u.test(lines[i])) { items.push(lines[i].replace(/^(?:•\s*|[-–]\s+)/u, "")); i++; }
      if (items.length >= 4 && items.every((x) => x.length < 42)) {
        const half = Math.ceil(items.length / 2);
        rows.push(columnsRow(listRows(items.slice(0, half), CW / 2 - 10, { size: 8.6, check: true, itemGap: 5 }), listRows(items.slice(half), CW / 2 - 10, { size: 8.6, check: true, itemGap: 5 }), CW / 2 - 10, 20), gap(8));
      } else rows.push(...listRows(items, CW, { size: 8.6 }), gap(8));
      continue;
    }
    const next = lines.slice(i + 1).find(Boolean) || "";
    if (/:$/.test(l) && /^(?:•|[-–]\s)/u.test(next) && G.bulletsOf(lines.slice(i + 1).join("\n")).length < 4) rows.push(kickerRow(tidy(l).replace(/:$/, ""), 6));
    else rows.push(...textRows(runsOf(l), CW, { size: 8.8, lead: 13.5 }), gap(6));
    i++;
  }
  return rows;
}

function rhythmPage(flow, models, imgs) {
  const m = models.find((x) => x.diet) || models[0];
  const d = m.diet;
  const med = m.kind === "plan" ? m.plan.medication : "";
  const stdFood = [];
  models.forEach((x) => x.std.food.forEach((s) => { if (!stdFood.some((y) => y.head === s.head && y.body === s.body)) stdFood.push(s); }));
  const supps = models.flatMap((x) => x.supps);
  const suppText = models.map((x) => x.plan && x.plan.supplements).filter(Boolean);
  if (!d && !stdFood.length && !supps.length && !suppText.length) return;
  flow.topic("Food & everyday habits", "Your everyday rhythm", "");
  if (d) {
    const items = [
      [imgs.water, `${d.water || "2–3 L"}`.replace(/\s*daily\s*$/i, ""), "Water", `Sip water through the day: ${d.water}, unless advised otherwise. Avoid sugary drinks.`],
      [imgs.fibre, "25–35 g", "Fibre", "25–35 g a day from vegetables, fruit, lentils and whole grains keeps digestion moving and keeps you full for longer."],
      [imgs.movement, "2–3×", "Movement", "Walk regularly and do strength exercises 2–3 times a week to protect your muscle."],
    ];
    const rows = [];
    items.forEach(([img, big, label, text], i) => {
      const lines = wrap(runsOf(text), CW - 180, 8.6);
      const h = Math.max(lines.length * 12.5, 34) + 12;
      rows.push({
        h,
        draw(pg, x, y, w) {
          if (img) { const ih = 26, iw = Math.min(30, ih * (img.w / img.h)); pg.image(img, x, y + 2, iw, iw / (img.w / img.h)); }
          pg.text(big, x + 40, y + 16, { size: 15, color: C.ink });
          pg.text(label, x + 40, y + 29, { size: 7.6, color: C.muted });
          lines.forEach((ln, k) => drawLine(pg, ln, x + 180, y + 12 + k * 12.5, 8.6, C.text));
          if (i < items.length - 1) pg.line(x, y + h - 5, x + w, y + h - 5, { color: C.line, width: 0.5 });
        },
      });
    });
    flow.place(rows);
    flow.gap(18);
  }
  stdFood.forEach((s) => { flow.place(tipsRows(s, med)); flow.gap(10); });
  if (supps.length || suppText.length) {
    const s = headingRows(supps.length ? "Recommended supplements" : "Supplements", CW, { size: 13, before: 4, after: 6 });
    supps.forEach((x, i) => {
      if (i) s.push(gap(6));
      s.push(...textRows([{ t: x.name, b: true }, { t: x.dose ? ` · ${x.dose}` : "", b: false }], CW, { color: C.ink }));
      if (x.benefit) s.push(...textRows(x.benefit, CW, { size: 8.6, color: C.muted }));
    });
    suppText.forEach((t) => s.push(...proseRows(t, CW)));
    flow.place(s);
  }
}

// ── follow-up & support ──────────────────────────────────────────────
function checkinPage(flow, models) {
  const m = models[0];
  const visit = m.kind === "visit";
  flow.topic("Follow-up & support", "Your next check-in", visit ? "Stay connected through your next check-in." : "Stay connected through your next check-in and refill.", { chapter: true });
  const w = G.followWindow(G.nextFollowupOf(m));
  const others = [];
  models.slice(1).forEach((x) => { const xw = G.followWindow(G.nextFollowupOf(x)); if (xw && (!w || xw.range !== w.range)) others.push(`${x.plan.medication}: ${xw.past ? "follow-up due now" : `${xw.range} ${xw.year}`}`); });
  flow.card(nextCardRows(m, { big: true, multi: others }), C.card, 14);
  const until = G.untilItems(m);
  if (models.length > 1) until.splice(0, 1, `continue ${G.commaList(models.map((x) => `${x.plan.medication}${x.plan.dose ? " " + x.plan.dose : ""}${x.plan.frequency ? " " + G.guideFreqPhrase(x.plan.frequency) : ""}`), "and")}`);
  flow.place(textRows(`${w && w.past ? "Your follow-up is due. Please get in touch so we can arrange it." : G.arrangeText(m)} Until then, ${until.length === 2 ? until.join(" and ") : G.commaList(until, "and")}.`, CW, { size: 9, lead: 14 }));
  flow.gap(18);

  const labs = [];
  models.forEach((x) => x.labs.forEach((l) => { if (!labs.some((y) => y.name === l.name)) labs.push(l); }));
  if (labs.length) {
    const r = headingRows("Lab tests to complete", CW, { size: 12.5, after: 6 });
    labs.forEach((l, i) => {
      if (i) r.push(gap(6));
      r.push(...textRows([{ t: l.name, b: false }, { t: `  ${[l.required ? "Required" : "Recommended", l.fasting ? "fasting" : ""].filter(Boolean).join(", ")}`, b: false }], CW, { color: C.ink }));
      if (l.detail) r.push(...textRows(l.detail, CW, { size: 8.6, color: C.muted }));
    });
    flow.place(r);
    flow.gap(16);
  } else if (m.plan && m.plan.blood_test && m.plan.blood_test !== "none") {
    flow.place([...headingRows(`Blood test ${m.plan.blood_test === "required" ? "required" : "recommended"}`, CW, { size: 12.5, after: 4 }), ...textRows("Please complete your blood test as advised by your doctor.", CW)]);
    flow.gap(16);
  }

  const block = (ic, title, text) => iconRows(ic, [...textRows(title, CW - 30, { size: 11.5, color: C.ink, lead: 16 }), gap(3), ...textRows(text, CW - 30, { size: 8.8, color: C.text, lead: 13.5 })], { size: 15, color: C.muted, indent: 30 });
  if (m.appName) {
    flow.place(block("message", "If you have the app", `With the ${m.appName} installed and subscribed, you can access everything, messaging, follow-ups, refills, and progress tracking, right there in the app.`));
    flow.place([ruleRow(12, 12)]);
    flow.place(block("arrowRight", "If you don't have the app", "Don't worry, we'll send you a link whenever you need to book or purchase something, and you can rebook at any time."));
  } else {
    flow.place(block("message", "Staying connected with us", "You're welcome to message your doctor directly with any questions, request a follow-up or refill, and share how you're progressing. Whenever you need to book or purchase something, we'll send you a link."));
  }
  flow.gap(18);
  flow.card(iconRows("message", [...textRows("Customer Care Team", IN - 28, { size: 10, color: C.ink, lead: 15 }), gap(2), ...textRows(G.CUSTOMER_CARE, IN - 28, { size: 8.6, color: C.text })], { size: 14, color: C.muted, indent: 28 }));
}

function signatureLine(m) {
  const s = m.signer;
  return [m.doctor, s.credentials, ...(s.signature ? String(s.signature).split("\n") : []), s.clinic].map((x) => String(x || "").trim()).filter(Boolean).join(" · ");
}

function timelineRows(text, m) {
  const rows = [];
  let lede = "";
  // The master guide ends with a sign-off; the doctor's message below has it.
  const loose = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const signoff = new Set([m.doctor, m.signer.clinic, m.signer.credentials, ...(m.signer.signature ? String(m.signer.signature).split("\n") : []), m.clinic && m.clinic.name].map(loose).filter(Boolean));
  for (const raw of cleanBody(text).split("\n")) {
    const l = tidy(raw.trim());
    if (!l || /\[insert [^\]]*\]/i.test(l)) continue;
    if (signoff.has(loose(l)) || /certified physician|^dr\.?\s+\S+(\s+\S+){0,3}$/i.test(l)) continue;
    const b = l.match(/^(?:•\s*|[-–]\s+)(.+)$/u);
    if (!b) {
      if (!rows.length && !lede && /:$/.test(l)) { lede = l; continue; }
      rows.push(gap(6), ...textRows(runsOf(l), CW, { size: 8.6, color: C.text, lead: 13 }), gap(2));
      continue;
    }
    let label = "", body = b[1];
    const then = body.match(/^then\s+(every .+?)\s+for\s+(.+)$/i);
    const mm = body.match(/^([^:]{2,30}):\s+(.+)$/);
    if (then) { label = G.cap(then[1]); body = G.cap(then[2].replace(/\.$/, "")) + "."; }
    else if (mm) { label = mm[1].replace(/^week\s+(\d+\s*[–-])/i, "Weeks $1"); body = mm[2].replace(/^([a-z][\w /-]{0,30}),\s+/i, (x, w) => `${G.cap(w)}: `); }
    const lines = wrap(runsOf(G.cap(body)), CW - 150, 8.6);
    const h = Math.max(lines.length * 12.5, 13) + 12;
    rows.push({
      h,
      draw(pg, x, y) {
        pg.circle(x + 3, y + 8, 3, { fill: C.ink });
        if (label) pg.text(label, x + 16, y + 11, { size: 9, color: C.ink });
        lines.forEach((ln, k) => drawLine(pg, ln, x + (label ? 150 : 16), y + 11 + k * 12.5, 8.6, C.text));
      },
    });
  }
  return { lede, rows };
}

function planPageFollowup(flow, models, facility) {
  const m = models[0];
  const visit = m.kind === "visit";
  const plansText = [];
  models.forEach((x) => { if (x.std.followup && !plansText.includes(x.std.followup.body)) plansText.push(x.std.followup.body); });
  const parts = plansText.map((t) => timelineRows(t, m));
  flow.topic("Follow-up & support", "Your follow-up plan", (parts[0] && parts[0].lede) || (visit ? "How we'll keep in touch." : ""));
  parts.forEach((p) => { flow.place(p.rows); flow.gap(14); });
  const msg = visit
    ? [...textRows("Prepared and signed by", IN - 110, { size: 11.5, color: C.ink, lead: 16 }), gap(4), ...textRows(signatureLine(m), IN - 110, { size: 8.8 })]
    : [...textRows("A message from your doctor", IN - 110, { size: 11.5, color: C.ink, lead: 16 }), gap(4), ...textRows(tidy(G.closingMessage(m)), IN - 110, { size: 8.8, lead: 13.5 })];
  flow.card([{
    h: Math.max(msg.reduce((s, r) => s + r.h, 0), 96),
    draw(pg, x, y, w) {
      pg.rect(x, y, 94, 96, { fill: C.soft, radius: 9 });
      const t = initialsOf(m.doctor);
      pg.text(t, x + 47 - textWidth(t, false, 30) / 2, y + 59, { size: 30, color: C.ink });
      let yy = y;
      msg.forEach((r) => { r.draw(pg, x + 110, yy, w - 110); yy += r.h; });
    },
  }], C.card, 10);
  if (!visit) { flow.place(textRows(signatureLine(m), CW, { size: 8, color: C.muted })); flow.gap(10); }
  flow.place(textRows(`If you have any questions about your ${visit ? "plan" : "treatment"}, please contact ${facility} directly. If you need urgent medical help, contact your nearest emergency service.`, CW, { size: 8, color: C.muted }));
}

function fmtDate(iso) {
  if (!iso) return "";
  const s = String(iso);
  const d = new Date(s.includes("T") || s.includes(" ") ? s.replace(" ", "T") + (s.endsWith("Z") ? "" : "Z") : s + "T12:00:00");
  return isNaN(d) ? s : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// { patient, clinic, plans, visit } as the guide link API returns it; `logo`
// is the clinic's PNG logo, if it has one.
function guidePdf({ patient, clinic, plans, visit }, { logo } = {}) {
  const models = visit ? [G.visitModel(visit, patient, clinic || {})] : plans.map((p) => G.planModel(p, patient, clinic || {}));
  const first = models[0];
  const facility = first.signer.clinic || (clinic && clinic.name) || "DarDoc Healthcare";
  const website = String((clinic && clinic.website) || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const who = `${patient.title ? patient.title + " " : ""}${patient.name || ""}`.trim();
  const docTitle = visit ? "Personal health plan" : "Personal treatment guide";
  const doc = new PdfDocument({ title: `${docTitle} — ${who}`, author: facility, subject: docTitle });
  const logos = { color: logo ? doc.loadPng(logo) : null, ivory: logo ? doc.loadPng(logo, { tint: C.ivory }) : null };
  const imgs = {};
  for (const k of ["calories", "protein", "water", "fibre", "carbs", "fats", "movement"]) imgs[k] = ASSETS[k] ? doc.loadPng(ASSETS[k]) : null;

  coverPage(doc, models, facility, website, logos, who);
  // Running header: the clinic's logo, the patient and the document.
  const flow = new Flow(doc, (pg) => {
    if (logos.color) { const a = logos.color.w / logos.color.h, h = Math.min(22, 110 / a); pg.image(logos.color, M, 30, h * a, h); }
    else pg.text(facility, M, 44, { size: 10, bold: true, color: C.ink });
    pg.text(who, PAGE_W - M - textWidth(who, false, 8.6), 38, { size: 8.6, color: C.ink });
    pg.text(docTitle, PAGE_W - M - textWidth(docTitle, false, 7.4), 49, { size: 7.4, color: C.muted });
    pg.line(M, 62, PAGE_W - M, 62, { color: C.line, width: 0.6 });
  });

  const chapters = [];
  const slot = planPage(flow, models, imgs, visit ? 0 : models.length + 2);
  if (!visit) {
    models.forEach((m) => {
      const start = flow.pageNo + 1;
      howPage(flow, m);
      dosagePage(flow, m);
      aboutPage(flow, m);
      sideEffectsPage(flow, m);
      urgentPage(flow, m);
      chapters.push({ label: `${m.plan.medication}: ${m.plan.route === "injection" || !m.plan.route ? "injection" : "how to take it"}, dosage & safety`, start, end: flow.pageNo });
    });
  }
  const dm = models.find((x) => x.diet) || first;
  const foodStart = flow.pageNo + 1;
  welcomePage(flow, models, imgs);
  if (dm.diet) { platePage(flow, dm.diet); mealsPage(flow, dm, imgs); }
  rhythmPage(flow, models, imgs);
  chapters.push({ label: "General guide: food & everyday habits", start: foodStart, end: flow.pageNo });
  const fuStart = flow.pageNo + 1;
  checkinPage(flow, models);
  planPageFollowup(flow, models, facility);
  chapters.push({ label: "Follow-up & support", start: fuStart, end: flow.pageNo });

  const total = doc.pages.length;
  const pad = (n) => String(n).padStart(2, "0");
  if (slot && slot.pg) {
    contentsRows(chapters.map((c) => ({ label: c.label, range: c.end > c.start ? `${pad(c.start)}–${pad(c.end)}` : pad(c.start) })))
      .forEach((r, i) => r.draw(slot.pg, slot.x, slot.y + i * 19, slot.w));
  }
  // Footer: the patient, where you are in the guide, the page.
  const nChapters = Math.max(...doc.pages.map((p) => p.chapterNo || 0));
  doc.pages.forEach((pg, i) => {
    if (!i) return;
    pg.text(who, M, PAGE_H - 30, { size: 7.4, color: C.muted });
    const pn = `${pad(i + 1)} / ${pad(total)}`;
    pg.text(pn, PAGE_W - M - textWidth(pn, false, 7.4), PAGE_H - 30, { size: 7.4, color: C.muted });
    const dw = 18, dg = 5, wAll = nChapters * dw + (nChapters - 1) * dg;
    for (let k = 1; k <= nChapters; k++) {
      const x = PAGE_W / 2 - wAll / 2 + (k - 1) * (dw + dg);
      pg.rect(x, PAGE_H - 33, dw, 2, { fill: k === pg.chapterNo ? C.ink : C.dash, radius: 1 });
    }
  });
  return doc.toBuffer();
}

module.exports = { guidePdf };
