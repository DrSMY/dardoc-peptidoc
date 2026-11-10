// The patient guide as a PDF, for patients who'd rather keep a file than open
// a link. Same content as the guide link page: the program, the master-guide
// windows and the wording all come from the browser scripts (patient-guides,
// guide, g/guide-model), run here so the two can't drift apart. Set out for
// A4, it names the facility and prints no web address except a video's,
// which is a clickable link.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { PdfDocument, textWidth, PAGE_W, PAGE_H } = require("./pdf");

const ctx = vm.createContext({ console });
for (const f of ["patient-guides.js", "guide.js", "g/guide-model.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "public", f), "utf8"), ctx, { filename: f });
}
const G = vm.runInContext(`({ planModel, visitModel, parseProse, splitLabel, prettyHead, bulletsOf, splitDose, splitWater, toNumber, cap,
  weeksText, heroLede, followWindow, nextFollowupOf, arrangeText, proteinRange, rangeText, untilItems, welcomeLines, closingMessage,
  stepsFrom, doctorInstructions, doseLadder, plateParts, urgentFor, guideFreqPhrase, commaList, lcFirst, dietProteinRangeText,
  dietProteinBasisText, dietExampleDayTotal, ROUTE_LABEL, ROUTE_NOUN, DAY_TONES, CUSTOMER_CARE, DIET_FOOD_GROUPS, DIET_PROTEIN_SWAPS,
  DIET_WHY_TEXT, GLP1_MESSAGE_REASONS, PEPTIDE_MESSAGE_REASONS })`, ctx);

const C = {
  ink: "#16352F", text: "#2A423C", muted: "#55665E", line: "#DCE2D5", tint: "#EEF2E8", beige: "#F6F0E0",
  rose: "#FBEEE8", roseInk: "#9A2F2A", roseDot: "#D2827B", pine: "#19362E", deep: "#123436", emerald: "#1C6B55",
  white: "#FFFFFF", onDark: "#D5E3DC", bullet: "#8EAA86",
};
const M = 48;
const CW = PAGE_W - 2 * M;
const TOP = 64;
const BOTTOM = PAGE_H - 60;
const BODY = 9.8;
const LEAD = 14.4;
const PAD = 16;

// ── text ─────────────────────────────────────────────────────────────
// No web addresses on paper apart from videos: a video address becomes a
// link showing its short form; other markdown links keep their words, bare
// links go, and a line only there to carry a link ("Book here: …") goes too.
const isVideoUrl = (url) => /(?:^|\/\/|\.)(?:youtu\.be|youtube\.com|vimeo\.com)\//i.test(url);
// What's printed for a link: no "https://www.", and no tracking parameters,
// but anything that identifies the video (youtube.com/watch?v=…) stays, so a
// printed copy can still be typed in.
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

function runsOf(s, bold = false) {
  const out = [];
  String(s || "").split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/).forEach((part) => {
    if (!part) return;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) out.push({ t: link[1], b: bold, link: link[2] });
    else if (/^\*\*[^*]+\*\*$/.test(part)) out.push({ t: part.slice(2, -2), b: true });
    else out.push({ t: part, b: bold });
  });
  return out;
}

function labelledRuns(s) {
  const l = G.splitLabel(s);
  return l ? [{ t: `${l[0]}:`, b: true }, ...runsOf(" " + l[1])] : runsOf(s);
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
      // A single word wider than the line: break it.
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
      pg.text(s.t, cx, baseline, { size, bold: s.b, color: C.emerald });
      pg.line(cx, baseline + 1.6, cx + w, baseline + 1.6, { color: C.emerald, width: 0.6 });
      pg.link(cx, baseline - size * 0.85, w, size * 1.2, s.link);
    } else pg.text(s.t, cx, baseline, { size, bold: s.b, color });
    cx += w;
  }
}

// ── rows: the unit of layout. Each has a height and draws itself at
// (x, y), its top-left corner; boxes and pages break between rows. ──
const gap = (h) => ({ h, draw() {} });

function textRows(input, width, { size = BODY, lead, color = C.text, bold = false, indent = 0, align = "left", keepNext = false } = {}) {
  const runs = typeof input === "string" ? runsOf(input, bold) : input;
  const lh = lead || size * 1.45;
  const lines = wrap(runs, width - indent, size);
  return lines.map((ln, i) => ({
    h: lh,
    keepNext: keepNext && i === lines.length - 1,
    draw(pg, x, y) {
      const dx = align === "right" ? width - ln.w : 0;
      drawLine(pg, ln, x + indent + dx, y + (lh - size) / 2 + size * 0.8, size, color);
    },
  }));
}

function headingRows(text, width, { size = 12, color = C.ink, before = 0, after = 6 } = {}) {
  const rows = [];
  if (before) rows.push(gap(before));
  rows.push(...textRows(text, width, { size, bold: true, color, lead: size * 1.3 }));
  rows[rows.length - 1].keepNext = true;
  if (after) rows.push({ ...gap(after), keepNext: true });
  return rows;
}

function listRows(items, width, { ordered = false, check = false, size = BODY, color = C.text, dot = C.bullet, labelled = true, itemGap = 4 } = {}) {
  const rows = [];
  const ind = ordered ? 18 : 14;
  items.forEach((item, n) => {
    if (n) rows.push(gap(itemGap));
    const runs = labelled ? labelledRuns(item) : runsOf(item);
    const lines = textRows(runs, width, { size, color, indent: ind });
    const firstDraw = lines[0].draw;
    lines[0] = {
      ...lines[0],
      draw(pg, x, y) {
        const base = y + (lines[0].h - size) / 2 + size * 0.8;
        if (ordered) pg.text(`${n + 1}.`, x, base, { size, bold: true, color: C.ink });
        else if (check) { pg.line(x + 1, base - 3.4, x + 3.6, base - 0.9, { color: C.emerald, width: 1.3 }); pg.line(x + 3.6, base - 0.9, x + 8.4, base - 6.6, { color: C.emerald, width: 1.3 }); }
        else pg.circle(x + 3.4, base - size * 0.32, 1.9, { fill: dot });
        firstDraw(pg, x, y);
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
    else rows.push(...listRows(b.items, width, { ...opt, ordered: b.type === "ol", check: b.ck, labelled: b.type !== "ol" }));
  });
  return rows;
}

const ruleRow = (before = 10, after = 10, color = C.line) => ({
  h: before + after,
  draw(pg, x, y, w) { pg.line(x, y + before, x + w, y + before, { color, width: 0.6 }); },
});

// ── flow: places rows down the page, inside boxes or not ────────────
class Flow {
  constructor(doc) { this.doc = doc; this.newPage(); }
  newPage() { this.pg = this.doc.addPage(); this.y = TOP; }
  gap(h) { this.y = Math.min(this.y + h, BOTTOM); }
  // Starts a new page when less than `h` is left.
  need(h) { if (this.y + h > BOTTOM) this.newPage(); }
  place(rows, { fill, stroke, pad = 0, radius = 9 } = {}) {
    if (!rows.length) return;
    const total = rows.reduce((s, r) => s + r.h, 0) + pad * 2;
    // A section heading waiting to be placed goes on the same page as what
    // follows it: a whole box when the box fits a page, else its first lines.
    const head = this.pendingHead;
    this.pendingHead = null;
    const headH = head ? head.reduce((s, r) => s + r.h, 0) + 8 : 0;
    if ((fill || stroke) && total + headH <= BOTTOM - TOP && this.y + headH + total > BOTTOM) this.newPage();
    else if (head && this.y + headH + Math.min(total, 96) > BOTTOM) this.newPage();
    if (head) {
      if (this.y > TOP) this.y += 8;
      for (const r of head) { r.draw(this.pg, M, this.y, CW); this.y += r.h; }
    }
    let i = 0;
    while (i < rows.length) {
      const top = this.y;
      let y = top + pad, j = i;
      while (j < rows.length) {
        // A heading stays with the line after it, through any spacing rows.
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
  box(rows, fill, stroke) { this.place(rows, { fill, stroke, pad: PAD }); this.gap(12); }
  // The page being written, counting from 1.
  get pageNo() { return this.doc.pages.length; }
  // Ends the page, unless nothing has been put on it yet.
  pageBreak() { if (this.y > TOP) this.newPage(); }
  // A chapter opens on a fresh page unless most of this one is still free;
  // `fresh` makes it always start one. Returns the page it starts on.
  chapter(title, lede, fresh) {
    if (fresh) this.pageBreak();
    else if (this.y > TOP + (BOTTOM - TOP) * 0.38) this.newPage();
    else if (this.y > TOP) this.gap(18);
    const page = this.pageNo;
    this.place([...textRows(title, CW, { size: 21, bold: true, color: C.ink, lead: 26 }), gap(4), ...(lede ? textRows(lede, CW, { size: 11, color: C.muted, lead: 15.5 }) : []), gap(14)]);
    return page;
  }
  // A heading inside a chapter. It is drawn with the next thing placed, so
  // it never sits alone at the foot of a page.
  section(title) { this.pendingHead = headingRows(title, CW, { size: 15, after: 8 }); }
}

const IN = CW - 2 * PAD; // width inside a box

// ── sections ─────────────────────────────────────────────────────────
function treatmentRows(m) {
  const p = m.plan, d = G.splitDose(p.dose);
  const meta = [G.cap(G.guideFreqPhrase(p.frequency)), G.ROUTE_LABEL[p.route] || G.cap(p.route)].filter(Boolean).join(" · ");
  const doseW = d.num ? textWidth(d.num, false, 26) + (d.unit ? 4 + textWidth(d.unit, false, 11) : 0) : 0;
  const name = textRows(p.medication, IN - doseW - 16, { size: 16, bold: true, color: C.ink, lead: 20 });
  const rows = [...textRows("Your current treatment", IN, { size: 8.6, color: C.muted, lead: 13 }), gap(6)];
  rows.push({
    h: Math.max(name.length * 20, 30),
    draw(pg, x, y, w) {
      let yy = y;
      for (const r of name) { r.draw(pg, x, yy); yy += r.h; }
      if (d.num) {
        const uw = d.unit ? textWidth(d.unit, false, 11) : 0;
        pg.text(d.num, x + w - doseW, y + 24, { size: 26, color: C.ink });
        if (d.unit) pg.text(d.unit, x + w - uw, y + 24, { size: 11, color: C.muted });
      }
    },
  });
  rows.push(...textRows(meta, IN, { size: 9.5, color: C.muted }));
  if (!d.num && p.dose) rows.push(...textRows(`Dose: ${p.dose}`, IN, { size: BODY }));
  if (d.num && d.rest) rows.push(...textRows(`Dose: ${p.dose}`, IN, { size: BODY }));
  if (m.phase && m.phase.weeks) rows.push(...textRows(`Current duration: ${G.weeksText(m.phase.weeks)}`, IN));
  if (p.quantity > 1) rows.push(...textRows(`Quantity dispensed: ${p.quantity}`, IN));
  rows.push(ruleRow(8, 8), ...textRows("Continue this dose unless your doctor advises otherwise.", IN, { color: C.ink }));
  return rows;
}

function statsRow(cards) {
  const n = cards.length, gapX = 10, cw = (CW - gapX * (n - 1)) / n, h = 74;
  return {
    h,
    draw(pg, x, y) {
      cards.forEach((c, i) => {
        const cx = x + i * (cw + gapX);
        pg.rect(cx, y, cw, h, { stroke: C.line, lineWidth: 0.7, radius: 8 });
        pg.text(c.label, cx + 12, y + 17, { size: 8.6, color: C.muted });
        pg.text(c.value, cx + 12, y + 44, { size: 21, color: C.ink });
        if (c.unit) pg.text(c.unit, cx + 12 + textWidth(c.value, false, 21) + 3, y + 44, { size: 9.5, color: C.muted });
        pg.text(c.note, cx + 12, y + 62, { size: 8, color: C.muted });
      });
    },
  };
}

function essentials(flow, m) {
  const d = m.diet;
  if (!d) return;
  const cards = [];
  const kcal = G.toNumber(d.calories);
  if (kcal) cards.push({ label: "Daily calories", value: kcal.toLocaleString("en-US"), unit: "kcal", note: "Approximately, per day" });
  const pr = G.proteinRange(d);
  if (pr) cards.push({ label: "Protein", value: G.rangeText(pr), unit: "g", note: "Include with every meal" });
  const w = G.splitWater(d.water);
  cards.push({ label: "Water", value: w.value, unit: w.unit, note: `${w.rest ? G.cap(w.rest) + ", unless" : "Unless"} advised otherwise` });
  if (cards.length < 3) cards.push({ label: "Fibre", value: "25–35", unit: "g", note: "A day" });
  flow.place([...headingRows("Your daily essentials", CW, { size: 13, before: 4, after: 8 }), statsRow(cards)]);
  flow.gap(14);
}

function glanceBox(flow, m) {
  const glance = m.std.glance ? G.bulletsOf(m.std.glance.body) : [];
  if (!glance.length) return;
  const rows = headingRows("Your protocol at a glance", IN, { size: 12 });
  glance.forEach((g, i) => {
    const l = G.splitLabel(g);
    if (i) rows.push(gap(5));
    rows.push(...textRows(l ? [{ t: `${l[0]}: `, b: true }, ...runsOf(l[1])] : runsOf(g), IN));
  });
  flow.box(rows, C.tint);
}

function nextBox(flow, models) {
  const m = models[0];
  const w = G.followWindow(G.nextFollowupOf(m));
  const rows = [
    ...textRows(m.kind === "visit" ? "Next follow-up" : "Next follow-up & refill", IN, { size: 9, color: C.onDark }),
    gap(4),
    ...textRows(w ? (w.past ? "Due now" : `${w.range} ${w.year}`) : "To be arranged", IN, { size: 19, color: C.white, lead: 24 }),
    gap(4),
    ...textRows(w && w.past ? "Your follow-up is due. Please get in touch so we can arrange it." : (m.kind === "visit" || !m.appName ? G.arrangeText(m) : `Arrange your review through the ${m.appName}.`), IN, { color: C.onDark }),
  ];
  flow.box(rows, C.deep);
}

function signatureRows(m, width) {
  const s = m.signer;
  const rows = [gap(8), ...textRows(m.doctor, width, { bold: true, color: C.ink })];
  [s.credentials, ...(s.signature ? String(s.signature).split("\n") : []), s.clinic].filter(Boolean).forEach((l) => rows.push(...textRows(l, width, { size: 9, color: C.muted, lead: 12.5 })));
  if (m.plan && m.plan.revisedBy) {
    const r = m.plan.revisedBy;
    rows.push(gap(4), ...textRows(`Revised by ${r.name}${r.credentials ? `, ${r.credentials}` : ""}`, width, { size: 8.6, color: C.muted }));
  }
  return rows;
}

function letterhead(flow, m, facility, logo) {
  const pg = flow.pg;
  if (logo) {
    const aspect = logo.w / logo.h, w = Math.min(160, aspect * 32);
    pg.image(logo, M, 40, w, w / aspect);
  } else {
    pg.text(facility, M, 60, { size: 16, bold: true, color: C.ink });
  }
  pg.text(`Facility: ${facility}`, M, 86, { size: 8.6, color: C.muted });
  const right = (t, y, opt) => pg.text(t, PAGE_W - M - textWidth(t, !!opt.bold, opt.size), y, opt);
  const who = `${m.patient.title ? m.patient.title + " " : ""}${m.patient.name || ""}`.trim();
  right(m.kind === "visit" ? "Personal health plan" : "Personal treatment guide", 50, { size: 8.6, color: C.muted });
  right(who, 64, { size: 11, bold: true, color: C.ink });
  right(`Care from ${m.doctor}`, 77, { size: 8.6, color: C.muted });
  right(`Issued ${fmtDate(m.created)}`, 89, { size: 8.6, color: C.muted });
  pg.line(M, 100, PAGE_W - M, 100, { color: C.line, width: 0.6 });
  flow.y = 124;
  flow.place([
    ...textRows(m.kind === "visit" ? "Your health. In balance." : "Your care. In balance.", CW, { size: 30, bold: true, color: C.ink, lead: 36 }),
    gap(6),
    ...textRows(G.heroLede(m), CW * 0.86, { size: 11.5, color: C.muted, lead: 16.5 }),
  ]);
  flow.gap(18);
}

// Every medication on one table: what it is, the dose, how often, how it is
// taken and for how long.
function prescribedRows(models) {
  const cols = [{ head: "Medication", w: 136 }, { head: "Dose", w: 112 }, { head: "How often", w: 80 }, { head: "How it's taken", w: 86 }, { head: "Duration", w: IN - 136 - 112 - 80 - 86 }];
  const xs = cols.map((_, i) => cols.slice(0, i).reduce((a, c) => a + c.w, 0));
  const rows = [{
    h: 18,
    draw(pg, x, y, w) {
      cols.forEach((c, i) => pg.text(c.head, x + xs[i], y + 9, { size: 8.4, color: C.muted }));
      pg.line(x, y + 15, x + w, y + 15, { color: "#CDD6C6", width: 0.6 });
    },
  }];
  models.forEach((m, n) => {
    const p = m.plan;
    const cells = [
      wrap([{ t: p.medication, b: true }], cols[0].w - 10, 10.4),
      wrap(runsOf(p.dose || "As advised"), cols[1].w - 10, 9.4),
      wrap(runsOf(G.cap(G.guideFreqPhrase(p.frequency)) || "As advised"), cols[2].w - 10, 9.4),
      wrap(runsOf(G.ROUTE_LABEL[p.route] || G.cap(p.route) || ""), cols[3].w - 10, 9.4),
      wrap(runsOf([m.phase && m.phase.weeks ? G.weeksText(m.phase.weeks) : "", p.quantity > 1 ? `Quantity ${p.quantity}` : ""].filter(Boolean).join(", ") || "Until review"), cols[4].w, 9.4),
    ];
    const lines = Math.max(...cells.map((c) => c.length));
    rows.push({
      h: lines * 13.2 + 14,
      draw(pg, x, y, w) {
        if (n) pg.line(x, y, x + w, y, { color: "#D9E0D2", width: 0.5 });
        cells.forEach((c, i) => c.forEach((ln, k) => drawLine(pg, ln, x + xs[i], y + 17 + k * 13.2, i ? 9.4 : 10.4, i ? C.text : C.ink)));
      },
    });
  });
  return rows;
}

// Page 1: everything that has been prescribed, the daily figures, the next
// follow-up and where to find each part. Returns the slot the contents list
// is drawn into once the page numbers are known.
function summaryPage(flow, models, facility, logo, entryCount) {
  const m = models[0];
  letterhead(flow, m, facility, logo);
  flow.box([
    ...headingRows("What has been prescribed", IN, { size: 13, after: 4 }),
    ...prescribedRows(models),
    ruleRow(6, 8, "#CDD6C6"),
    ...textRows(`Continue ${models.length > 1 ? "each dose" : "this dose"} unless your doctor advises otherwise.`, IN, { color: C.ink }),
  ], C.tint);
  essentials(flow, models.find((x) => x.diet) || m);
  nextBox(flow, models);
  const slot = {};
  flow.place([
    ...headingRows("In this guide", CW, { size: 13, before: 4, after: 4 }),
    { h: entryCount * 17 + 2, draw(pg, x, y, w) { Object.assign(slot, { pg, x, y, w }); } },
  ]);
  flow.pageBreak();
  return slot;
}

function fillContents(slot, entries) {
  if (!slot.pg) return;
  entries.forEach((e, i) => {
    const y = slot.y + i * 17;
    if (i) slot.pg.line(slot.x, y, slot.x + slot.w, y, { color: C.line, width: 0.5 });
    const lx = slot.x + (e.sub ? 14 : 0);
    slot.pg.text(e.label, lx, y + 12, { size: 9.8, bold: !e.sub, color: e.sub ? C.text : C.ink });
    if (e.note) slot.pg.text(e.note, lx + textWidth(e.label, true, 9.8) + 8, y + 12, { size: 9, color: C.muted });
    const t = `Page ${e.page}`;
    slot.pg.text(t, slot.x + slot.w - textWidth(t, false, 9.4), y + 12, { size: 9.4, color: C.muted });
  });
}

// A plan with nothing prescribed: goals, daily figures, follow-up and the
// doctor's advice, as before.
function visitOverview(flow, m, facility, logo) {
  letterhead(flow, m, facility, logo);
  const rows = headingRows("Your goals", IN, { size: 14 });
  rows.push(...textRows(m.goals.length ? m.goals.join("  ·  ") : "Your doctor will go through your goals with you at your next visit.", IN));
  rows.push(ruleRow(8, 8), ...textRows("Your plan is built around these goals and your own nutrition needs.", IN, { color: C.ink }));
  flow.box(rows, C.tint);
  essentials(flow, m);
  nextBox(flow, [m]);
  const v = m.visit;
  const advice = [...textRows(`From ${m.doctor}`, IN, { size: 8.6, color: C.muted }), gap(2), ...headingRows(v.advice ? "Advice from your doctor" : "Your health plan", IN, { size: 14 })];
  advice.push(...proseRows(v.advice || "Here is the plan we talked about. It's built around your goals and your own nutrition needs.", IN));
  flow.box(advice, C.beige);
  if (v.medicationWhy) flow.box([...headingRows("How medication could help", IN), ...proseRows(v.medicationWhy, IN)], null, C.line);
}

function welcomeBox(flow, m) {
  const rows = [...textRows(`From ${m.doctor}`, IN, { size: 8.6, color: C.muted }), gap(2), ...headingRows("Your journey, not a race.", IN, { size: 14 })];
  G.welcomeLines(m).forEach((l, i) => { if (i) rows.push(gap(5)); rows.push(...textRows(l, IN)); });
  rows.push(gap(6), ...textRows(m.doctor, IN, { bold: true, color: C.ink }));
  flow.box(rows, C.beige);
}

function chipsRow(labels, current, width) {
  const size = 9.2, padX = 10, h = 22, gx = 16;
  const lines = [[]];
  let w = 0;
  labels.forEach((t, i) => {
    const cw = textWidth(t, i === current, size) + padX * 2;
    if (lines[lines.length - 1].length && w + gx + cw > width) { lines.push([]); w = 0; }
    lines[lines.length - 1].push({ t, i, cw });
    w += (lines[lines.length - 1].length > 1 ? gx : 0) + cw;
  });
  return lines.map((ln) => ({
    h: h + 6,
    draw(pg, x, y) {
      let cx = x;
      ln.forEach((c, k) => {
        if (k) { pg.text("›", cx - gx / 2 - 2, y + 14.5, { size: 10, color: C.muted }); }
        const on = c.i === current;
        pg.rect(cx, y, c.cw, h, on ? { fill: C.pine, radius: 6 } : { stroke: "#C8D1C0", lineWidth: 0.7, radius: 6 });
        pg.text(c.t, cx + padX, y + 14.6, { size, bold: on, color: on ? C.white : C.ink });
        cx += c.cw + gx;
      });
    },
  }));
}

// One medication, start to finish: how to take it, the dosage, what it is,
// and its own side effects. Returns the page the chapter starts on.
function medicationChapter(flow, m) {
  const p = m.plan;
  const page = flow.chapter(p.medication, `How to take your ${G.ROUTE_NOUN[p.route] || "medication"}, your dosage, and the side effects to know about.`, true);
  glanceBox(flow, m);

  flow.section("How to take it");
  const st = G.stepsFrom(m);
  const docText = st.fromDoctor ? "" : G.doctorInstructions(m);
  const rows = [
    ...textRows([`Current prescription`, m.phase && m.phase.weeks ? G.weeksText(m.phase.weeks) : ""].filter(Boolean).join(" · "), IN, { size: 8.6, color: C.muted }),
    gap(3),
    ...headingRows(`${p.medication}${p.dose ? ` ${p.dose}` : ""}${p.frequency ? ` · ${G.guideFreqPhrase(p.frequency)}` : ""}`, IN, { size: 13, after: 8 }),
  ];
  if (st.before) rows.push(...proseRows(st.before, IN), gap(8));
  st.steps.forEach((s, i) => {
    if (i) rows.push(gap(6));
    const lines = textRows(runsOf(s), IN, { indent: 26 });
    const draw0 = lines[0].draw;
    lines[0] = { ...lines[0], draw(pg, x, y) { pg.text(String(i + 1).padStart(2, "0"), x, y + (lines[0].h - BODY) / 2 + BODY * 0.8, { size: 10, bold: true, color: C.emerald }); draw0(pg, x, y); } };
    rows.push(...lines);
  });
  rows.push(ruleRow(10, 8), ...textRows("Continue this dose unless advised otherwise.", IN, { color: C.ink }));
  if (st.after) rows.push(gap(5), ...proseRows(st.after, IN));
  if (docText) rows.push(gap(10), ...headingRows("Instructions from your doctor", IN, { size: 10, after: 3 }), ...proseRows(docText, IN));
  flow.box(rows, C.tint);

  flow.section("Your dosage");
  const { ladder, cur, future } = G.doseLadder(m);
  const d = [
    ...textRows([{ t: "Current dose: ", b: false }, { t: p.dose || "as advised by your doctor", b: true }, { t: p.frequency ? `, ${G.guideFreqPhrase(p.frequency)}` : "", b: false }], IN, { size: 11, color: C.ink, lead: 16 }),
  ];
  const facts = [m.phase && m.phase.weeks ? `Current duration: ${G.weeksText(m.phase.weeks)}` : "", p.quantity > 1 ? `Quantity dispensed: ${p.quantity}` : ""].filter(Boolean);
  if (facts.length) d.push(...textRows(facts.join("  ·  "), IN, { size: 9.2, color: C.muted }));
  if (ladder.length) {
    d.push(gap(10), ...textRows("Approved dose strengths", IN, { size: 8.8, color: C.muted }), gap(4));
    d.push(...chipsRow(ladder.map((x, i) => (i === cur ? `${x} · current` : x)), cur, IN));
  }
  d.push(...textRows("Your doctor may adjust this at your next review.", IN, { size: 8.6, color: C.muted }));
  future.forEach((fd) => {
    d.push(ruleRow(8, 8));
    d.push(...textRows([{ t: fd.dose, b: true }, { t: " · future dose, only if prescribed", b: false }], IN, { color: C.ink }));
    if (fd.line) d.push(...textRows(labelledRuns(cleanBody(fd.line)), IN, { size: 9.2, color: C.muted }));
    d.push(...textRows(fd.note, IN, { size: 9.2, color: C.muted }));
  });
  flow.box(d, null, C.line);
  if (m.std.titration) {
    flow.place([...headingRows(G.prettyHead(m.std.titration.head, p.medication), CW, { size: 11, before: 2, after: 4 }), ...proseRows(m.std.titration.body, CW)]);
    flow.gap(10);
  }

  const about = m.std.about ? m.std.about.body : m.info.howItWorks || "";
  // The program's own video, unless the steps above already link it.
  const vid = m.info.videoLink;
  const showVid = vid && /^https?:\/\//i.test(vid) && !cleanBody(m.std.how ? m.std.how.body : "").includes(`(${vid})`);
  if (about || showVid || m.std.more.length) {
    flow.section(`About ${p.medication}`);
    if (about || showVid) {
      const a = [];
      if (about) a.push(...proseRows(about, IN));
      if (showVid) a.push(...(about ? [gap(8)] : []), ...textRows([{ t: `Watch how ${p.medication} works and how to take it: `, b: false }, { t: shortUrl(vid), b: false, link: vid }], IN));
      flow.box(a, null, C.line);
    }
    m.std.more.forEach((s) => { flow.place([...headingRows(G.prettyHead(s.head, p.medication), CW, { size: 11, before: 4, after: 4 }), ...proseRows(s.body, CW)]); flow.gap(6); });
  }

  flow.section(`Side effects of ${p.medication}`);
  sideEffects(flow, m);
  return page;
}

function plateRow(d) {
  const parts = G.plateParts(d);
  const legendW = CW - 2 * PAD - 150;
  const blocks = parts.map((p) => ({ p, head: wrap([{ t: `${p.value} ${p.name.toLowerCase()}`, b: true }], legendW - 18, 9.8), body: wrap(runsOf(p.detail), legendW - 18, 8.8) }));
  const legendH = blocks.reduce((s, b) => s + b.head.length * 13.5 + b.body.length * 12 + 8, 0);
  const h = Math.max(legendH, 112);
  return {
    h,
    draw(pg, x, y, w) {
      let yy = y;
      blocks.forEach((b) => {
        pg.rect(x, yy + 3, 8, 8, { fill: b.p.color, radius: 2 });
        b.head.forEach((ln) => { drawLine(pg, ln, x + 16, yy + 11, 9.8, C.ink); yy += 13.5; });
        b.body.forEach((ln) => { drawLine(pg, ln, x + 16, yy + 9.5, 8.8, C.muted); yy += 12; });
        yy += 8;
      });
      const cx = x + w - 62, cy = y + h / 2, r = 40;
      pg.arc(cx, cy, r, 0, 359.9, { color: "#EEF2E9", width: 18 });
      let a = 0;
      parts.forEach((p) => { const span = p.fraction * 360; pg.arc(cx, cy, r, a, a + span - 2, { color: p.color, width: 18 }); a += span; });
      pg.circle(cx, cy, r - 9, { fill: "#F3F6EF" });
      const t = "Your plate";
      pg.text(t, cx - textWidth(t, true, 8.6) / 2, cy + 3, { size: 8.6, bold: true, color: C.ink });
    },
  };
}

function dayRows(d) {
  const rows = [];
  const total = G.dietExampleDayTotal(d);
  const meals = d.meals;
  const sum = meals.reduce((s, x) => s + (Number(x.proteinG) || 0), 0);
  if (sum) {
    rows.push({
      h: 18,
      draw(pg, x, y, w) {
        let cx = x;
        const n = meals.filter((mm) => Number(mm.proteinG) > 0).length;
        const usable = w - (n - 1) * 2;
        meals.forEach((mm, i) => {
          const g = Number(mm.proteinG) || 0;
          if (!g) return;
          const sw = (g / sum) * usable;
          pg.rect(cx, y + 4, sw, 7, { fill: G.DAY_TONES[i % G.DAY_TONES.length], radius: 2 });
          cx += sw + 2;
        });
      },
    });
  }
  meals.forEach((mm, i) => {
    const itemsW = IN - 118 - 66;
    const lines = wrap(runsOf(mm.items), itemsW, 9.2);
    const h = Math.max(lines.length * 13, 16) + 12;
    rows.push({
      h,
      draw(pg, x, y, w) {
        if (i) pg.line(x, y, x + w, y, { color: C.line, width: 0.5 });
        pg.circle(x + 4, y + 13.2, 3, { fill: G.DAY_TONES[i % G.DAY_TONES.length] });
        pg.text(mm.name, x + 14, y + 16, { size: 9.6, bold: true, color: C.ink });
        lines.forEach((ln, k) => drawLine(pg, ln, x + 118, y + 16 + k * 13, 9.2, C.text));
        if (mm.proteinG) { const t = `${mm.proteinG} g protein`; pg.text(t, x + w - textWidth(t, true, 8.6), y + 16, { size: 8.6, bold: true, color: C.emerald }); }
      },
    });
  });
  if (total) rows.push(gap(4), ...textRows(`The example day gives about ${total} g of protein.`, IN, { size: 8.8, color: C.muted }));
  return rows;
}

function food(flow, models) {
  const m = models.find((x) => x.diet) || models[0];
  const d = m.diet;
  const med = m.kind === "plan" ? m.plan.medication : "";
  const stdFood = [];
  models.forEach((x) => x.std.food.forEach((s) => { if (!stdFood.some((y) => y.head === s.head && y.body === s.body)) stdFood.push(s); }));
  const supps = models.flatMap((x) => x.supps);
  const suppText = models.map((x) => x.plan && x.plan.supplements).filter(Boolean);
  if (!d && !stdFood.length && !supps.length && !suppText.length) return 0;
  const page = flow.chapter("Food & everyday habits", d ? "Eat enough to nourish your body, even as your appetite changes." : "Small, steady habits that support your treatment.");
  if (d) {
    const pr = G.proteinRange(d);
    const w = G.splitWater(d.water);
    const kcal = G.toNumber(d.calories);
    const cells = [
      kcal ? [`~${kcal.toLocaleString("en-US")}`, "calories"] : null,
      pr ? [`${G.rangeText(pr)} g`, "protein"] : null,
      [`${w.value}${w.unit ? ` ${w.unit}` : ""}`, `water${w.rest ? ` ${w.rest}` : ""}`],
      ["25–35 g", "fibre a day"],
    ].filter(Boolean);
    const t = headingRows("Your daily targets", IN, { size: 12, after: 8 });
    t.push({
      h: 40,
      draw(pg, x, y, wd) {
        const cw = wd / cells.length;
        cells.forEach((c, i) => {
          const cx = x + i * cw;
          if (i) pg.line(cx - 8, y, cx - 8, y + 34, { color: "#CDD6C6", width: 0.6 });
          pg.text(c[0], cx, y + 18, { size: 17, color: C.ink });
          pg.text(c[1], cx, y + 32, { size: 8.4, color: C.muted });
        });
      },
    });
    t.push(gap(6), ...textRows(`${med ? `${med} reduces appetite, but your body` : "Your body"} still needs adequate protein, vitamins, minerals, fibre, and fluids.`, IN));
    if (d.note) t.push(gap(8), ...headingRows("A note from your doctor", IN, { size: 10, after: 3 }), ...proseRows(d.note, IN));
    flow.box(t, C.tint);

    const prot = headingRows("Prioritise protein", CW, { size: 12.5, before: 2 });
    prot.push(...textRows("Protein helps preserve muscle and keeps you fuller for longer. Include it with every meal.", CW), gap(5));
    prot.push(...textRows(pr ? [{ t: `Aim for ${G.dietProteinRangeText(d, "grams") || G.rangeText(pr) + " grams"} of protein a day. `, b: true }, ...runsOf(G.dietProteinBasisText(d))] : runsOf("Your doctor will confirm your daily protein with you."), CW));
    prot.push(gap(5), ...textRows(`Choose ${G.lcFirst(G.DIET_FOOD_GROUPS[0].foods.replace(/\.$/, ""))}.`, CW));
    flow.place(prot);
    flow.gap(14);

    flow.box([...headingRows("Build a simple plate", IN, { size: 12.5 }), ...textRows("Use this as your guide for every main meal. These are portions of your plate, not calorie percentages.", IN, { size: 9.2, color: C.muted }), gap(10), plateRow(d)], null, C.line);

    flow.box([...headingRows("An example day", IN, { size: 12.5 }), ...textRows("This is one way your day could look. Swap in foods you enjoy, keeping the portions similar.", IN, { size: 9.2, color: C.muted }), gap(6), ...dayRows(d), gap(8),
      ...textRows([{ t: "Protein swaps. ", b: true }, { t: `Each of these gives about 25 g of protein: ${G.DIET_PROTEIN_SWAPS}.`, b: false }], IN, { size: 9.2 })], null, C.line);

    flow.place([...headingRows("If your appetite is low", CW, { size: 12.5, before: 2 }), ...listRows([
      "**Protein first.** Start each meal with your protein, in case you fill up quickly.",
      "**Don't skip meals.** If your appetite is low, have a smaller portion and keep the protein.",
      "**Small portions, eaten slowly.** Stop when you're comfortably full.",
    ], CW, { labelled: false })]);
    flow.gap(12);
    flow.place([...headingRows("What to limit", CW, { size: 12.5 }), ...textRows(G.DIET_FOOD_GROUPS[4].foods, CW), gap(5),
      ...textRows([{ t: "Go easy on greasy and fried food. ", b: true }, { t: med ? "It can make nausea worse." : "It adds calories without much nutrition.", b: false }], CW)]);
    flow.gap(12);
    const hv = [...headingRows("High-value foods", CW, { size: 12.5 }), ...textRows(`High-value foods give your body the most nutrition for the fewest calories.${med ? ` Because ${med} lowers your appetite, you'll eat less, so every meal needs to count.` : " When you are eating less, every meal needs to count."}`, CW), gap(4)];
    G.DIET_FOOD_GROUPS.slice(0, 4).forEach((g) => hv.push(gap(4), ...textRows([{ t: `${g.name}: `, b: true }, { t: g.foods, b: false }], CW)));
    hv.push(gap(6), ...textRows(G.DIET_WHY_TEXT, CW, { size: 8.8, color: C.muted }));
    flow.place(hv);
    flow.gap(14);

    const hab = headingRows("Hydration, fibre & movement", IN, { size: 12.5 });
    [["Water", `Sip water through the day: ${d.water}, unless advised otherwise. Avoid sugary drinks.`],
      ["Fibre", "25–35 g a day from vegetables, fruit, lentils and whole grains keeps digestion moving and keeps you full for longer."],
      ["Movement", "Walk regularly and do strength exercises 2–3 times a week to protect your muscle."]].forEach(([h, t], i) => {
      if (i) hab.push(gap(6));
      hab.push(...textRows([{ t: `${h}. `, b: true }, { t, b: false }], IN));
    });
    flow.box(hab, C.beige);
  }
  if (supps.length || suppText.length) {
    const s = headingRows(supps.length ? "Recommended supplements" : "Supplements", CW, { size: 12.5, before: 2 });
    supps.forEach((x, i) => {
      if (i) s.push(gap(5));
      s.push(...textRows([{ t: x.name, b: true }, { t: x.dose ? ` · ${x.dose}` : "", b: false }], CW, { color: C.ink }));
      if (x.benefit) s.push(...textRows(x.benefit, CW, { size: 9.2, color: C.muted }));
    });
    suppText.forEach((t) => s.push(...proseRows(t, CW)));
    flow.place(s);
    flow.gap(12);
  }
  if (stdFood.length) {
    flow.place(headingRows("More guidance", CW, { size: 14, before: 4, after: 2 }));
    stdFood.forEach((s) => flow.place([...headingRows(G.prettyHead(s.head, med), CW, { size: 11, before: 8, after: 4 }), ...proseRows(s.body, CW)]));
    flow.gap(8);
  }
  return page;
}

function sideEffects(flow, m) {
  const p = m.plan, info = m.info;
  const c = headingRows("Common side effects", CW, { size: 12.5 });
  if (info.commonSideEffects) c.push(...textRows(`Common effects include ${G.lcFirst(info.commonSideEffects.replace(/\.$/, ""))}.`, CW), gap(5));
  if (m.std.effects) c.push(...proseRows(m.std.effects.body, CW), gap(5));
  else if (m.isGlp1) c.push(...textRows("If nauseated, eat smaller meals, avoid greasy or heavy foods, eat slowly, and maintain hydration.", CW), gap(5));
  c.push(...textRows(`Message your doctor if symptoms persist or interfere with normal ${m.isGlp1 ? "eating or drinking" : "daily activity"}.`, CW));
  flow.place(c);
  flow.gap(14);
  flow.box([...headingRows("Message your doctor", IN, { size: 12.5 }),
    ...textRows(`Contact ${m.doctor} for ${G.commaList(m.isGlp1 ? G.GLP1_MESSAGE_REASONS : G.PEPTIDE_MESSAGE_REASONS, "or")}.`, IN), gap(5),
    ...textRows(m.appName ? `If you have the ${m.appName}, you can message us there.` : "You're welcome to message your doctor directly with any questions.", IN)], C.beige);
  const { items, extra } = G.urgentFor(m);
  if (items.length) {
    const u = [...headingRows("Seek urgent medical attention", IN, { size: 12.5, color: C.roseInk }), ...textRows("Get urgent medical help for any of the following:", IN), gap(6),
      ...listRows(items, IN, { dot: C.roseDot, labelled: false })];
    if (extra) u.push(gap(6), ...proseRows(extra, IN));
    u.push(ruleRow(10, 8, "#EBCFC5"), ...textRows("If you need urgent medical help, contact your nearest emergency service.", IN, { bold: true, color: C.roseInk }));
    flow.box(u, C.rose);
  }
  if (m.std.notes) { flow.place([...headingRows("Important safety notes", CW, { size: 12.5, before: 2 }), ...proseRows(m.std.notes.body, CW)]); flow.gap(12); }
  const warnings = String(p.warnings || "").trim();
  if (warnings) { flow.place([...headingRows("From your doctor", CW, { size: 12.5 }), ...proseRows(warnings, CW)]); flow.gap(12); }
}

function timelineRows(text, width) {
  const rows = [];
  for (const raw of cleanBody(text).split("\n")) {
    const l = raw.trim();
    if (!l || /\[insert [^\]]*\]/i.test(l)) continue;
    const b = l.match(/^(?:•\s*|[-–]\s+)(.+)$/u);
    if (!b) { rows.push(gap(4), ...textRows(runsOf(l.replace(/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})[️‍\p{Extended_Pictographic}]*\s*/u, "")), width), gap(4)); continue; }
    const mm = b[1].match(/^([^:]{2,40}):\s+(.+)$/);
    const lines = textRows(mm ? [{ t: `${mm[1]}  `, b: true }, ...runsOf(mm[2])] : runsOf(b[1]), width, { indent: 18 });
    const h = lines.reduce((s, r) => s + r.h, 0) + 6;
    rows.push({
      h,
      draw(pg, x, y) {
        pg.circle(x + 5, y + 7.5, 3, { fill: C.emerald });
        pg.line(x + 5, y + 13, x + 5, y + h + 2, { color: "#C8D1C0", width: 0.6 });
        let yy = y;
        lines.forEach((r) => { r.draw(pg, x, yy); yy += r.h; });
      },
    });
  }
  return rows;
}

function followup(flow, models, facility) {
  const m = models[0];
  const visit = m.kind === "visit";
  const page = flow.chapter("Follow-up & support", visit ? "Stay connected through your next check-in." : "Stay connected through your next check-in and refill.");
  const w = G.followWindow(G.nextFollowupOf(m));
  const until = G.untilItems(m);
  if (models.length > 1) until.splice(0, 1, `continue ${G.commaList(models.map((x) => `${x.plan.medication}${x.plan.dose ? " " + x.plan.dose : ""}${x.plan.frequency ? " " + G.guideFreqPhrase(x.plan.frequency) : ""}`), "and")}`);
  const fu = [
    ...textRows(visit ? "Next follow-up" : "Next follow-up & medication refill", IN, { size: 8.8, color: C.muted }), gap(3),
    ...textRows(w ? (w.past ? "Due now" : `${w.range} ${w.year}`) : "To be arranged", IN, { size: 17, bold: true, color: C.ink, lead: 22 }), gap(4),
    ...textRows(`${w && w.past ? "Your follow-up is due. Please get in touch so we can arrange it." : G.arrangeText(m)} Until then, ${until.length === 2 ? until.join(" and ") : G.commaList(until, "and")}.`, IN),
  ];
  models.slice(1).forEach((x) => {
    const xw = G.followWindow(G.nextFollowupOf(x));
    if (xw && (!w || xw.range !== w.range)) fu.push(gap(5), ...textRows(`${x.plan.medication}: ${xw.past ? "follow-up due now" : `${xw.range} ${xw.year}`}`, IN, { size: 9.2, color: C.muted }));
  });
  flow.box(fu, C.tint);

  const labs = [];
  models.forEach((x) => x.labs.forEach((l) => { if (!labs.some((y) => y.name === l.name)) labs.push(l); }));
  if (labs.length) {
    const r = headingRows("Lab tests to complete", CW, { size: 12.5 });
    labs.forEach((l, i) => {
      if (i) r.push(gap(6));
      r.push(...textRows([{ t: l.name, b: true }, { t: `  ${[l.required ? "Required" : "Recommended", l.fasting ? "fasting" : ""].filter(Boolean).join(", ")}`, b: false }], CW, { color: C.ink }));
      if (l.detail) r.push(...textRows(l.detail, CW, { size: 9.2, color: C.muted }));
    });
    flow.place(r);
    flow.gap(12);
  } else if (m.plan && m.plan.blood_test && m.plan.blood_test !== "none") {
    flow.place([...headingRows(`Blood test ${m.plan.blood_test === "required" ? "required" : "recommended"}`, CW, { size: 12.5 }), ...textRows("Please complete your blood test as advised by your doctor.", CW)]);
    flow.gap(12);
  }

  const conn = m.appName
    ? [...headingRows("If you have the app", CW, { size: 12.5 }), ...textRows(`With the ${m.appName} installed and subscribed, you can access everything — messaging, follow-ups, refills, and progress tracking — right there in the app.`, CW), gap(8),
      ...headingRows("If you don't have the app", CW, { size: 12.5 }), ...textRows("Don't worry — we'll send you a link whenever you need to book or purchase something, and you can rebook at any time.", CW), gap(5), ...textRows(G.CUSTOMER_CARE, CW)]
    : [...headingRows("Staying connected with us", CW, { size: 12.5 }), ...textRows("You're welcome to message your doctor directly with any questions, request a follow-up or refill, and share how you're progressing. Whenever you need to book or purchase something, we'll send you a link — you can arrange this whenever suits you.", CW), gap(5), ...textRows(G.CUSTOMER_CARE, CW)];
  flow.place(conn);
  flow.gap(12);

  const plansText = [];
  models.forEach((x) => { if (x.std.followup && !plansText.includes(x.std.followup.body)) plansText.push(x.std.followup.body); });
  plansText.forEach((t) => { flow.box([...headingRows("Your follow-up plan", IN, { size: 12.5 }), ...timelineRows(t, IN)], null, C.line); });

  const letter = visit
    ? [...headingRows("Prepared and signed by", IN, { size: 12.5 }), ...signatureRows(m, IN)]
    : [...headingRows("A message from your doctor", IN, { size: 12.5 }), ...textRows(G.closingMessage(m), IN), ...signatureRows(m, IN)];
  flow.box(letter, C.beige);
  flow.place(textRows(`If you have any questions about your ${visit ? "plan" : "treatment"}, please contact ${facility} directly. If you need urgent medical help, contact your nearest emergency service.`, CW, { size: 8.8, color: C.muted }));
  return page;
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
  const who = `${patient.title ? patient.title + " " : ""}${patient.name || ""}`.trim();
  const doc = new PdfDocument({ title: `${visit ? "Personal health plan" : "Personal treatment guide"} — ${who}`, author: facility, subject: visit ? "Personal health plan" : "Personal treatment guide" });
  const img = logo ? doc.loadPng(logo) : null;
  const flow = new Flow(doc);
  if (visit) {
    visitOverview(flow, first, facility, img);
    food(flow, models);
    followup(flow, models, facility);
  } else {
    // Page 1 says what has been prescribed; then each medication in full
    // (how to take it, dosage, side effects); then what applies to all of it.
    const slot = summaryPage(flow, models, facility, img, models.length + 3);
    const entries = models.map((m) => ({ label: m.plan.medication, note: "How to take it, your dosage, side effects", page: medicationChapter(flow, m) }));
    entries.push({ label: "General guide", note: "For your whole program", page: flow.chapter("General guide", "For your whole program: food and everyday habits, follow-up and support.", true) });
    welcomeBox(flow, first);
    const foodPage = food(flow, models);
    if (foodPage) entries.push({ label: "Food & everyday habits", page: foodPage, sub: true });
    entries.push({ label: "Follow-up & support", page: followup(flow, models, facility), sub: true });
    fillContents(slot, entries);
  }

  // Running head and foot on every page; the address bar never appears.
  const n = doc.pages.length;
  doc.pages.forEach((pg, i) => {
    if (i) {
      pg.text(`${visit ? "Personal health plan" : "Personal treatment guide"} · ${who}`, M, 38, { size: 8, color: C.muted });
      const r = `Facility: ${facility}`;
      pg.text(r, PAGE_W - M - textWidth(r, false, 8), 38, { size: 8, color: C.muted });
      pg.line(M, 46, PAGE_W - M, 46, { color: C.line, width: 0.5 });
    }
    pg.line(M, PAGE_H - 44, PAGE_W - M, PAGE_H - 44, { color: C.line, width: 0.5 });
    pg.text(`Facility: ${facility}`, M, PAGE_H - 30, { size: 8, color: C.muted });
    const pn = `Page ${i + 1} of ${n}`;
    pg.text(pn, PAGE_W - M - textWidth(pn, false, 8), PAGE_H - 30, { size: 8, color: C.muted });
  });
  return doc.toBuffer();
}

module.exports = { guidePdf };
