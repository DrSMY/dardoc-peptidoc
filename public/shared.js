// Shared client helpers: API fetch, icons, toast, formatting, charts.
"use strict";

// ── API ──────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── icons (lucide-style, stroke 2) ──────────────────────────────
function icon(name, size = 20) {
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    stethoscope: '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    syringe: '<path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/><path d="m14 4 6 6"/>',
    pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>',
    copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    scale: '<path d="M12 3v18"/><path d="M5 7l7-4 7 4"/><path d="m5 7-3 7a4.2 4.2 0 0 0 6 0L5 7"/><path d="m19 7-3 7a4.2 4.2 0 0 0 6 0l-3-7"/><path d="M8 21h8"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8M8 17h5"/>',
    sparkle: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    whatsapp: '<path d="M3 21l1.65-4.8A8.5 8.5 0 1 1 8 19.35L3 21z"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
    trend: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    // route-specific medication icons — spray (nasal) and cream/tube (topical),
    // so a program's icon always matches how it's actually taken.
    spray: '<path d="m19 5-7 7"/><path d="M14 6.5 17.5 3"/><path d="m17 10 3.5-3.5"/><path d="M10 20a2 2 0 0 0 2-2v-3.5a2 2 0 0 0-.6-1.4l-4-4a2 2 0 0 0-1.4-.6H4a2 2 0 0 0-2 2v7.5A2 2 0 0 0 4 20Z"/>',
    cream: '<path d="M9 3h6l1 4H8Z"/><path d="M8 7h8l1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z"/><path d="M9 12h6"/>',
    capsule: '<rect x="2" y="9" width="20" height="6" rx="3"/><path d="M12 9v6"/>',
    // brand mark — an olive leaf, used in every sidebar/login/document header
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}

// Maps a medication's administration route to the icon that best represents
// it (a doctor scanning a list should see "pill" for something they swallow,
// not "syringe" — route strings are free text like "Subcutaneous injection"
// or "Oral capsules", so this matches on keywords rather than exact values).
function routeIcon(route) {
  const r = String(route || "").toLowerCase();
  if (r.includes("inject") || r.includes("subcut") || r.includes("needle")) return "syringe";
  if (r.includes("nasal") || r.includes("spray")) return "spray";
  if (r.includes("topical") || r.includes("cream") || r.includes("serum") || r.includes("foam") || r.includes("skin")) return "cream";
  if (r.includes("capsule")) return "capsule";
  return "pill"; // oral / tablet / unknown — pill is the safest generic default
}

// ── toast ────────────────────────────────────────────────────────
function toast(msg, type = "ok") {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    wrap.setAttribute("aria-live", "polite");
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === "ok" ? "checkCircle" : "alert", 18)}<span></span>`;
  el.querySelector("span").textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 320); }, 3800);
}

// ── formatting ───────────────────────────────────────────────────
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function initials(name) {
  return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function fmtDate(iso, withTime = false) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") || iso.includes(" ") ? iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z") : iso + "T12:00:00");
  if (isNaN(d)) return iso;
  const opts = { day: "numeric", month: "short", year: "numeric" };
  if (withTime) { opts.hour = "2-digit"; opts.minute = "2-digit"; }
  return d.toLocaleDateString("en-GB", opts);
}

function timeAgo(iso) {
  if (!iso) return "never";
  const d = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z"));
  if (isNaN(d)) return iso;
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso);
}

// ── tiny SVG line chart (no dependencies) ────────────────────────
// points: [{x: Date|number, y: number, label}], opts: {height, color, unit}
function lineChart(points, opts = {}) {
  const H = opts.height || 180, W = 600, PAD = { t: 16, r: 14, b: 26, l: 40 };
  const color = opts.color || "#454A1D";
  if (!points || points.length === 0) return "";
  const xs = points.map((p) => +new Date(p.x));
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs) || xMin + 1;
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  const spread = (yMax - yMin) || 1;
  yMin -= spread * 0.15; yMax += spread * 0.15;
  const px = (x) => PAD.l + ((x - xMin) / (xMax - xMin || 1)) * (W - PAD.l - PAD.r);
  const py = (y) => PAD.t + (1 - (y - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const pts = points.map((p) => `${px(+new Date(p.x)).toFixed(1)},${py(p.y).toFixed(1)}`);
  const area = `M${pts[0]} L${pts.join(" L")} L${px(xMax).toFixed(1)},${H - PAD.b} L${px(xMin).toFixed(1)},${H - PAD.b} Z`;
  // y gridlines
  let grid = "", labels = "";
  for (let i = 0; i <= 3; i++) {
    const yv = yMin + ((yMax - yMin) * i) / 3;
    const yy = py(yv);
    grid += `<line x1="${PAD.l}" y1="${yy}" x2="${W - PAD.r}" y2="${yy}" stroke="#E7E3CD" stroke-width="1"/>`;
    labels += `<text x="${PAD.l - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#96927A">${yv.toFixed(yMax - yMin < 8 ? 1 : 0)}</text>`;
  }
  // x labels: first, middle, last
  const xIdx = points.length > 2 ? [0, Math.floor(points.length / 2), points.length - 1] : points.map((_, i) => i);
  let xLabels = "";
  for (const i of [...new Set(xIdx)]) {
    xLabels += `<text x="${px(xs[i])}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#96927A">${new Date(xs[i]).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</text>`;
  }
  const dots = points.length <= 40
    ? points.map((p, i) => `<circle cx="${px(xs[i])}" cy="${py(p.y)}" r="3.5" fill="#fff" stroke="${color}" stroke-width="2"><title>${esc(fmtDate(String(p.x)))} — ${p.y}${esc(opts.unit || "")}</title></circle>`).join("")
    : "";
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="${esc(opts.aria || "Trend chart")}">
    ${grid}${labels}${xLabels}
    <path d="${area}" fill="${color}" opacity="0.08"/>
    <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

// ── animated stacked bar chart: buckets = [{label, [seriesKey]: n, ...}] ──
// series = [{key, color, label}]. Bars grow from 0 on mount via CSS
// (`.bar-rise`, defined in theme.css) staggered by nth-of-type delay.
function stackedBarChart(buckets, series, opts = {}) {
  const H = opts.height || 190, W = 700, PAD = { t: 10, r: 10, b: 24, l: 8 };
  const innerH = H - PAD.t - PAD.b;
  const maxTotal = Math.max(1, ...buckets.map((b) => series.reduce((s, sr) => s + (b[sr.key] || 0), 0)));
  const bw = (W - PAD.l - PAD.r) / buckets.length;
  const barW = Math.min(22, bw * 0.6);
  let bars = "", xLabels = "";
  const xIdx = buckets.length > 2 ? [0, Math.floor(buckets.length / 2), buckets.length - 1] : buckets.map((_, i) => i);
  buckets.forEach((b, i) => {
    const cx = PAD.l + bw * i + bw / 2;
    let yCursor = H - PAD.b;
    series.forEach((sr) => {
      const v = b[sr.key] || 0;
      if (!v) return;
      const h = (v / maxTotal) * innerH;
      yCursor -= h;
      bars += `<rect class="bar-rise" style="animation-delay:${(i * 22)}ms" x="${(cx - barW / 2).toFixed(1)}" y="${yCursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2.5" fill="${sr.color}"><title>${esc(b.label)} — ${esc(sr.label)}: ${v}</title></rect>`;
    });
    if (xIdx.includes(i)) xLabels += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#96927A">${esc(b.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="${esc(opts.aria || "Trend chart")}">
    <line x1="${PAD.l}" y1="${H - PAD.b}" x2="${W - PAD.r}" y2="${H - PAD.b}" stroke="#E7E3CD" stroke-width="1"/>
    ${bars}${xLabels}
  </svg>`;
}

// ── animated donut chart: distribution = [{name, value, color}] ──────────
// Ring segments draw in via CSS stroke-dashoffset transition (`.donut-seg`).
function donutChart(distribution, opts = {}) {
  const size = opts.size || 180, stroke = opts.stroke || 22;
  const r = (size - stroke) / 2, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  const total = distribution.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0, segs = "";
  distribution.forEach((d, i) => {
    if (!d.value) return;
    const frac = d.value / total;
    const len = frac * circ;
    segs += `<circle class="donut-seg" style="animation-delay:${i * 120}ms" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="${stroke}"
      stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})">
      <title>${esc(d.name)}: ${d.value} (${Math.round(frac * 100)}%)</title>
    </circle>`;
    offset += len;
  });
  return `<svg viewBox="0 0 ${size} ${size}" style="width:100%;max-width:${size}px;height:auto;display:block;margin:0 auto" role="img" aria-label="${esc(opts.aria || "Distribution chart")}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#EEEADA" stroke-width="${stroke}"/>
    ${segs}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="22" font-weight="800" fill="var(--ink,#2B2A1C)">${total}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10.5" fill="#96927A">total</text>
  </svg>`;
}

// ── animated count-up for KPI numbers: call after the element is in the DOM ─
function animateCountUp(el, target, duration = 900, suffix = "") {
  if (!el) return;
  const start = 0;
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * eased).toLocaleString() + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── domain helpers ───────────────────────────────────────────────
function calcBMIClient(hCm, wKg) {
  if (!hCm || !wKg) return null;
  const m = hCm / 100;
  return Math.round((wKg / (m * m)) * 10) / 10;
}
function bmiCategoryClient(bmi) {
  if (bmi == null) return "";
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal weight";
  if (bmi < 30) return "Overweight";
  if (bmi < 35) return "Obesity Class I";
  if (bmi < 40) return "Obesity Class II";
  return "Obesity Class III";
}

function frequencyToHours(freq) {
  const f = String(freq || "").toLowerCase();
  if (f.includes("week") && !f.includes("twice") && !f.includes("3")) return 168;
  if (f.includes("twice a week") || f.includes("2x")) return 84;
  if (f.includes("3 times") || f.includes("3x")) return 56;
  if (f.includes("every 3 days")) return 72;
  if (f.includes("every other")) return 48;
  if (f.includes("daily") || f.includes("5 days")) return 24;
  return 168;
}

function waLink(mobile, text) {
  const m = String(mobile || "").replace(/[^\d]/g, "");
  return `https://wa.me/${m}?text=${encodeURIComponent(text)}`;
}

// Mirrors the server's normMobile() in src/api.js, so a mobile number typed
// into the intake form can be matched against already-stored patient records.
function normMobileClient(m) {
  return String(m || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "");
}

// ── clinical metrics (matches Consult-Buddy's WeightLossIntake maths) ─────
// p: { heightCm, weightKg, age, gender, activityLevel }
function computeMetrics(p, activityLevels) {
  const h = +p.heightCm, w = +p.weightKg, a = +p.age;
  const bmi = calcBMIClient(h, w);
  const bmiCat = bmiCategoryClient(bmi);
  let bmr = null;
  if (w && h && a) {
    const base = 10 * w + 6.25 * h - 5 * a;
    bmr = Math.round(p.gender === "Female" ? base - 161 : base + 5);
  }
  const mult = (activityLevels && activityLevels[p.activityLevel]) ? activityLevels[p.activityLevel].multiplier : 1.2;
  const tdee = bmr ? Math.round(bmr * mult) : null;
  const target = tdee ? Math.max(1200, tdee - 500) : null;   // 500 kcal deficit, floored at 1200
  const proteinMin = w ? Math.round(w * 1.2) : null;
  const proteinMax = w ? Math.round(w * 1.5) : null;
  return { bmi, bmiCat, bmr, tdee, target, proteinMin, proteinMax };
}

// ── auto-generated clinical record / EMR text (ported from Consult-Buddy
//    generateClinicalSuggestion). p: patient {name,title,gender,mobile,
//    chronicIllnesses,intake}, plan {medication,dose,route,frequency,
//    blood_test,clinicalNote}, m: computeMetrics() result.
function buildClinicalSuggestion(p, plan, m) {
  if (!plan || !plan.medication || !p.name) return "";
  const med = plan.medication + (plan.dose ? ` ${plan.dose}` : "");
  const salutation = p.title || (p.gender === "Male" ? "Mr" : p.gender === "Female" ? "Ms" : "");
  const pronoun = p.gender === "Male" ? "He" : p.gender === "Female" ? "She" : "The patient";
  const lc = pronoun.toLowerCase();
  const intake = p.intake || {};
  const cond = p.chronicIllnesses || (Array.isArray(intake.health_conditions) ? intake.health_conditions.join(", ") : "");
  const conditions = cond ? `, with ${cond}` : ", with no known chronic illnesses";
  const goals = Array.isArray(intake.health_goals) ? intake.health_goals.join(", ") : "";
  const who = `${salutation ? salutation + " " : ""}${p.name} (${p.mobile || "No phone"})`;
  const notes = plan.clinicalNote || plan.clinical_note || "";

  if (plan.category === "glp1") {
    const prev = intake.previous_glp1 === "Yes";
    const history = prev ? "with previous history of use of GLP1 meds" : "with no previous history of use of GLP1 meds";
    const proteinTxt = m && m.proteinMin ? `${lc} is advised to take ${m.proteinMin} g to ${m.proteinMax} g of protein daily, ` : "";
    const targetTxt = m && m.target ? `with a Weight Loss Target of ${m.target} kcal/day. ` : "";
    const blood = plan.blood_test === "required"
      ? "\n- Weight Loss Blood Test REQUIRED: https://www.dardoc.com/dubai/lab-test/weight-loss-blood-test"
      : plan.blood_test === "recommended"
      ? "\n- Weight Loss Blood Test RECOMMENDED: https://www.dardoc.com/dubai/lab-test/weight-loss-blood-test" : "";
    return `${who}\nprescribed ${med}\n${pronoun} is ${m && m.bmi ? m.bmiCat : ""} ${history}${conditions}, ${lc} has no contraindications to GLP-1, ${proteinTxt}${targetTxt}${notes}${blood}`.replace(/ +/g, " ").trim();
  }
  // peptide / custom
  const goalTxt = goals ? ` for ${goals}` : "";
  const routeFreq = [plan.route, plan.frequency].filter(Boolean).join(", ");
  const blood = plan.blood_test && plan.blood_test !== "none" ? `\n- Blood work ${plan.blood_test}.` : "";
  return `${who}\nprescribed ${med}${routeFreq ? " (" + routeFreq + ")" : ""}\n${pronoun} presents${goalTxt}${conditions}.${notes ? "\n" + notes : ""}${blood}`.replace(/ +/g, " ").trim();
}
