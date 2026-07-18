// Doctor dashboard SPA
"use strict";

const S = {
  user: null,
  templates: [],
  presets: null,
  patients: [],
  wizard: null,
  detailTab: "overview",
};

const app = document.getElementById("app");

// ── boot ─────────────────────────────────────────────────────────
async function boot() {
  try {
    S.user = await api("GET", "/api/me");
    await loadStatics();
    renderShell();
    route();
  } catch {
    renderLogin();
  }
}

async function loadStatics() {
  const [templates, presets] = await Promise.all([
    api("GET", "/api/templates"),
    api("GET", "/api/presets"),
  ]);
  S.templates = templates;
  S.presets = presets;
}

window.addEventListener("hashchange", () => { if (S.user) route(); });

// ── login ────────────────────────────────────────────────────────
function renderLogin() {
  document.title = "Sign in — DoCare";
  app.innerHTML = `
  <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px">
    <div class="card card-pad" style="width:min(420px,100%)">
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:22px">
        <img src="/brand/docare-olive-sm.png" alt="DoCare" style="height:72px;width:auto">
        <div style="font-size:12.5px;color:var(--muted)">Doctor dashboard</div>
      </div>
      <h1 style="font-size:22px;margin-bottom:4px">Welcome back</h1>
      <p style="color:var(--muted);font-size:14px;margin-bottom:20px">Sign in to manage consultations and patients.</p>
      <form id="login-form" novalidate>
        <div class="field">
          <label for="lg-email">Email</label>
          <input class="input" id="lg-email" type="email" autocomplete="email" required>
        </div>
        <div class="field">
          <label for="lg-pass">Password</label>
          <input class="input" id="lg-pass" type="password" autocomplete="current-password" required>
        </div>
        <p class="err-text" id="lg-err" hidden role="alert"></p>
        <button class="btn btn-primary btn-block" type="submit"><span class="spin"></span><span class="btn-label">Sign in</span></button>
      </form>
      <p style="margin-top:16px;text-align:center;font-size:13px"><a href="/">← Back to home</a></p>
    </div>
  </div>`;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    const err = document.getElementById("lg-err");
    err.hidden = true;
    btn.classList.add("loading");
    try {
      S.user = await api("POST", "/api/auth/login", {
        email: document.getElementById("lg-email").value,
        password: document.getElementById("lg-pass").value,
      });
      await loadStatics();
      renderShell();
      location.hash = "#/dashboard";
      route();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.classList.remove("loading");
    }
  });
}

// ── shell ────────────────────────────────────────────────────────
const NAV = [
  { hash: "#/dashboard", label: "Dashboard", ico: "grid" },
  { hash: "#/consult", label: "New consultation", ico: "plus" },
  { hash: "#/patients", label: "Patients", ico: "users" },
  { hash: "#/activity", label: "Recent activity", ico: "activity" },
  { hash: "#/messages", label: "Messages", ico: "message" },
  { hash: "#/templates", label: "Program library", ico: "layers" },
  { hash: "#/kb", label: "Knowledge Base", ico: "book" },
  { hash: "#/settings", label: "Settings", ico: "settings" },
];

function renderShell() {
  document.title = "Doctor Dashboard — DoCare";
  app.innerHTML = `
  <div class="mobile-bar">
    <div class="brand-line"><img src="/brand/docare-gold-sm.png" alt="DoCare" style="height:30px;width:auto"></div>
    <button class="icon-btn" style="color:#fff" id="m-logout" aria-label="Sign out">${icon("logout", 20)}</button>
  </div>
  <nav class="m-nav" id="m-nav">
    ${NAV.map((n) => `<a href="${n.hash}">${esc(n.label)}</a>`).join("")}
  </nav>
  <div class="shell">
    <aside class="sidebar">
      <div class="sb-brand" style="flex-direction:column;align-items:flex-start;gap:7px">
        <img src="/brand/docare-gold-sm.png" alt="DoCare" style="height:56px;width:auto">
        <div class="sb-sub">Doctor dashboard</div>
      </div>
      <nav class="sb-nav" id="sb-nav">
        ${NAV.map((n) => `<a class="sb-link" href="${n.hash}">${icon(n.ico, 19)} ${esc(n.label)}</a>`).join("")}
      </nav>
      <div class="sb-user">
        <div class="avatar">${esc(initials(S.user.name))}</div>
        <div><div class="sb-user-name">${esc(S.user.name)}</div><div class="sb-user-role">${esc(S.user.role)}</div></div>
        <button class="icon-btn" id="sb-logout" aria-label="Sign out">${icon("logout", 19)}</button>
      </div>
    </aside>
    <main class="main" id="view"></main>
  </div>`;
  const logout = async () => { await api("POST", "/api/auth/logout"); location.hash = ""; S.user = null; renderLogin(); };
  document.getElementById("sb-logout").addEventListener("click", logout);
  document.getElementById("m-logout").addEventListener("click", logout);
}

function setActiveNav() {
  const h = location.hash || "#/dashboard";
  document.querySelectorAll(".sb-link, .m-nav a").forEach((a) => {
    const on = h.startsWith(a.getAttribute("href")) ||
      (a.getAttribute("href") === "#/patients" && h.startsWith("#/patient/"));
    a.classList.toggle("on", on);
  });
}

function view() { return document.getElementById("view"); }

function route() {
  const h = location.hash || "#/dashboard";
  setActiveNav();
  const m = h.match(/^#\/patient\/(\d+)/);
  if (m) return viewPatient(Number(m[1]));
  if (h.startsWith("#/patients")) return viewPatients();
  if (h.startsWith("#/consult")) return viewConsult();
  if (h.startsWith("#/templates")) return viewTemplates();
  if (h.startsWith("#/activity")) return viewActivity();
  if (h.startsWith("#/messages")) return viewInbox();
  if (h.startsWith("#/kb")) return viewKb();
  if (h.startsWith("#/settings")) return viewSettings();
  return viewDashboard();
}

// ── dashboard ────────────────────────────────────────────────────
async function viewDashboard() {
  view().innerHTML = `<div class="skel" style="height:110px;margin-bottom:16px"></div><div class="skel" style="height:300px"></div>`;
  const d = await api("GET", "/api/dashboard");
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  view().innerHTML = `
  <div class="page-head">
    <div>
      <h1>${greet}, ${esc(S.user.name)}</h1>
      <div class="sub">${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
    </div>
    <a class="btn btn-primary" href="#/consult">${icon("plus", 18)} New consultation</a>
  </div>

  <div id="practice-stats"></div>

  <div class="stat-grid" style="margin-bottom:20px">
    ${stat("users", "var(--brand-soft)", "var(--brand)", d.activePatients, "Active patients")}
    ${stat("syringe", "var(--primary-soft)", "var(--primary)", d.doses7, "Doses logged · 7d")}
    ${stat("clipboard", "var(--accent-soft)", "var(--accent)", d.checkins7, "Check-ins · 7d")}
    ${stat("alert", "var(--danger-soft)", "var(--danger)", d.alerts.length, "Open alerts")}
    ${stat("message", "var(--violet-soft)", "var(--violet)", d.unread, "Unread messages")}
  </div>

  <div class="two-col">
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card">
        <div class="card-title" style="padding:18px 18px 0">${icon("alert", 19)} Side-effect alerts
          ${d.alerts.length ? `<span class="badge badge-red">${d.alerts.length} need review</span>` : `<span class="badge badge-green">All clear</span>`}
        </div>
        <div id="alerts-box">
        ${d.alerts.length ? d.alerts.map((a) => `
          <div class="alert-item" data-cid="${a.id}">
            <div class="alert-ico">${icon("alert", 18)}</div>
            <div class="alert-body">
              <div class="alert-name">${esc(a.patient_name)}</div>
              <div class="alert-sym">${esc(alertSummary(a.symptoms))}</div>
              <div class="alert-meta">${esc(fmtDate(a.date))} · ${a.weight_kg ? esc(a.weight_kg) + " kg · " : ""}${timeAgo(a.created_at)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
              <a class="btn btn-secondary btn-sm" href="#/patient/${a.patient_id}">Open</a>
              <button class="btn btn-ghost btn-sm" data-review="${a.id}">Mark reviewed</button>
            </div>
          </div>`).join("") : `
          <div class="empty">${icon("checkCircle", 34)}<div class="empty-title">No open alerts</div><p>Flagged side effects from patient check-ins will appear here.</p></div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="padding:18px 18px 0">${icon("syringe", 19)} Refill requests
          ${d.refillRequests.length ? `<span class="badge badge-amber">${d.refillRequests.length} pending</span>` : `<span class="badge badge-green">None pending</span>`}
        </div>
        <div id="refill-box">
        ${d.refillRequests.length ? d.refillRequests.map((r) => `
          <div class="alert-item" data-rid="${r.id}">
            <div class="alert-ico" style="background:var(--amber-soft);color:var(--amber)">${icon("syringe", 18)}</div>
            <div class="alert-body">
              <div class="alert-name">${esc(r.patient_name)}</div>
              <div class="alert-sym">Finished ${esc(r.medication)}${r.dose ? " · " + esc(r.dose) : ""}</div>
              <div class="alert-meta">${timeAgo(r.refill_requested_at)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
              <a class="btn btn-secondary btn-sm" href="#/patient/${r.patient_id}">Open</a>
              <button class="btn btn-ghost btn-sm" data-refilled="${r.id}">Mark refilled</button>
            </div>
          </div>`).join("") : `
          <div class="empty">${icon("checkCircle", 34)}<div class="empty-title">No pending refills</div><p>When a patient reports finishing a medication, it will appear here.</p></div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="padding:18px 18px 0">${icon("activity", 19)} Recent patient activity</div>
        ${d.recent.length ? d.recent.map((r) => `
          <a class="pt-row" href="#/patient/${r.patient_id}">
            <div class="tl-ico" style="background:${r.type === "dose" ? "var(--primary-soft)" : "var(--accent-soft)"};color:${r.type === "dose" ? "var(--primary)" : "var(--accent)"}">
              ${icon(r.type === "dose" ? "syringe" : "clipboard", 16)}
            </div>
            <div class="pt-info">
              <div class="pt-name">${esc(r.patient_name)} ${r.flagged ? '<span class="badge badge-red">flagged</span>' : ""}</div>
              <div class="pt-meta">${r.type === "dose" ? `Logged a dose${r.detail ? " · " + esc(r.detail) : ""}` : `Checked in${r.detail ? " · " + esc(r.detail) + " kg" : ""}`}</div>
            </div>
            <div class="pt-side">${timeAgo(r.created_at)}</div>
          </a>`).join("") : `<div class="empty">${icon("activity", 34)}<div class="empty-title">No activity yet</div><p>Patient dose logs and check-ins will show up here.</p></div>`}
      </div>
    </div>

    <div class="card">
      <div class="card-title" style="padding:18px 18px 0">${icon("calendar", 19)} Follow-ups due</div>
      ${d.dueFollowups.length ? d.dueFollowups.map((f) => `
        <a class="pt-row" href="#/patient/${f.patient_id}">
          <div class="avatar">${esc(initials(f.patient_name))}</div>
          <div class="pt-info">
            <div class="pt-name">${esc(f.patient_name)}</div>
            <div class="pt-meta">${esc(f.medication)} · due ${esc(fmtDate(f.next_followup))}</div>
          </div>
          ${icon("chevR", 17)}
        </a>`).join("") : `<div class="empty">${icon("calendar", 34)}<div class="empty-title">Nothing due</div><p>Follow-ups due in the next 3 days appear here.</p></div>`}
    </div>
  </div>`;

  view().querySelectorAll("[data-review]").forEach((b) => b.addEventListener("click", async () => {
    await api("POST", `/api/checkins/${b.dataset.review}/review`);
    toast("Alert marked as reviewed");
    viewDashboard();
  }));
  view().querySelectorAll("[data-refilled]").forEach((b) => b.addEventListener("click", async () => {
    await api("PATCH", `/api/plans/${b.dataset.refilled}`, { needsRefill: 0 });
    toast("Marked as refilled");
    viewDashboard();
  }));

  renderPracticeStats(d);
}

// ── messages inbox (every patient thread, most recent first) ─────
async function viewInbox() {
  view().innerHTML = `<div class="skel" style="height:300px"></div>`;
  const rows = await api("GET", "/api/messages/inbox");
  view().innerHTML = `
  <div class="page-head">
    <div><h1>Messages</h1><div class="sub">Every patient conversation, most recent first</div></div>
  </div>
  <div class="card">
    ${rows.length ? rows.map((r) => `
      <div class="pt-row" data-open="${r.patient_id}">
        <div class="avatar">${esc(initials(r.patient_name))}</div>
        <div class="pt-info">
          <div class="pt-name">${esc(r.patient_name)} ${r.unread ? `<span class="badge badge-red">${r.unread} new</span>` : ""}</div>
          <div class="pt-meta">${r.last_sender === "doctor" ? "You: " : ""}${esc((r.last_body || "").slice(0, 70))}${(r.last_body || "").length > 70 ? "…" : ""}</div>
        </div>
        <div class="pt-side">${timeAgo(r.last_at)}</div>
      </div>`).join("") : `<div class="empty">${icon("message", 34)}<div class="empty-title">No conversations yet</div><p>Messages between you and your patients will show up here.</p></div>`}
  </div>`;
  view().querySelectorAll("[data-open]").forEach((row) => row.addEventListener("click", () => {
    S.detailTab = "messages";
    location.hash = `#/patient/${row.dataset.open}`;
  }));
}

async function viewActivity() {
  view().innerHTML = `<div class="skel" style="height:300px"></div>`;
  const rows = await api("GET", "/api/activity");
  view().innerHTML = `
  <div class="page-head">
    <div><h1>Recent activity</h1><div class="sub">Every patient dose log and check-in, most recent first</div></div>
  </div>
  <div class="card">
    ${rows.length ? rows.map((r) => `
      <a class="pt-row" href="#/patient/${r.patient_id}">
        <div class="tl-ico" style="background:${r.type === "dose" ? "var(--primary-soft)" : "var(--accent-soft)"};color:${r.type === "dose" ? "var(--primary)" : "var(--accent)"}">
          ${icon(r.type === "dose" ? "syringe" : "clipboard", 16)}
        </div>
        <div class="pt-info">
          <div class="pt-name">${esc(r.patient_name)} ${r.flagged ? '<span class="badge badge-red">flagged</span>' : ""}</div>
          <div class="pt-meta">${r.type === "dose" ? `Logged a dose${r.detail ? " · " + esc(r.detail) : ""}` : `Checked in${r.detail ? " · " + esc(r.detail) + " kg" : ""}`}</div>
        </div>
        <div class="pt-side">${timeAgo(r.created_at)}</div>
      </a>`).join("") : `<div class="empty">${icon("activity", 34)}<div class="empty-title">No activity yet</div><p>Patient dose logs and check-ins will show up here.</p></div>`}
  </div>`;
}

function stat(ico, bg, fg, val, lbl) {
  return `<div class="stat"><div class="stat-ico" style="background:${bg};color:${fg}">${icon(ico, 19)}</div><div class="stat-val">${val}</div><div class="stat-lbl">${lbl}</div></div>`;
}

// ── Practice statistics: animated, interactive KPIs + charts ─────
const CATEGORY_META = {
  glp1: { label: "GLP-1 / Weight loss", color: "#283618", icon: "scale" },      // rich olive (brand)
  peptide: { label: "Peptides", color: "#C6A15B", icon: "droplet" },           // rich gold
  custom: { label: "Custom", color: "#6C4FB0", icon: "layers" },
};

function practiceStatsHTML(d) {
  const filter = S.dashFilter || "all";
  const catCount = (cat) => (d.categoryBreakdown.find((c) => c.category === cat) || {}).n || 0;
  const filteredRxTotal = filter === "all" ? d.prescriptionsTotal : catCount(filter);
  const pctPrescribedVsConsulted = d.consultationsTotal ? Math.round((filteredRxTotal / d.consultationsTotal) * 100) : 0;

  // 14-day buckets from raw plan rows (client-side, so tab filtering needs no refetch)
  const days = 14;
  const buckets = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(today); dt.setDate(today.getDate() - i);
    buckets.push({ key: dt.toISOString().slice(0, 10), label: dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), glp1: 0, peptide: 0, custom: 0 });
  }
  const bmap = new Map(buckets.map((b) => [b.key, b]));
  for (const r of d.recentPlans || []) {
    const b = bmap.get(String(r.created_at).slice(0, 10));
    if (b && r.category in b) b[r.category]++;
  }
  const series = Object.keys(CATEGORY_META).filter((k) => filter === "all" || filter === k)
    .map((k) => ({ key: k, color: CATEGORY_META[k].color, label: CATEGORY_META[k].label }));
  const hasTrend = buckets.some((b) => series.some((s) => b[s.key]));

  const distribution = Object.keys(CATEGORY_META).filter((k) => filter === "all" || filter === k)
    .map((k) => ({ name: CATEGORY_META[k].label, value: catCount(k), color: CATEGORY_META[k].color, key: k }));
  const distTotal = distribution.reduce((s, x) => s + x.value, 0);

  const medRows = (d.medBreakdown || []).filter((m) => filter === "all" || m.category === filter).slice(0, 6);
  const medTotal = medRows.reduce((s, m) => s + m.n, 0) || 1;

  return `
  <div class="card card-pad" style="margin-bottom:20px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px">
      <div>
        <div class="card-title" style="margin:0">${icon("activity", 19)} Practice Statistics</div>
        <p class="hint" style="margin-top:2px">Prescriptions, consultations &amp; medication mix</p>
      </div>
      <div class="pstat-tabs">
        <button class="pstat-tab ${filter === "all" ? "on" : ""}" data-dashfilter="all">All</button>
        <button class="pstat-tab ${filter === "glp1" ? "on" : ""}" data-dashfilter="glp1">${icon("scale", 13)} GLP-1</button>
        <button class="pstat-tab ${filter === "peptide" ? "on" : ""}" data-dashfilter="peptide">${icon("droplet", 13)} Peptides</button>
      </div>
    </div>

    <div class="stat-grid" style="margin-bottom:18px">
      <div class="stat pstat-kpi">
        <div class="stat-ico" style="background:var(--primary-soft);color:var(--primary)">${icon("pill", 19)}</div>
        <div class="stat-val" data-count="${filteredRxTotal}">0</div>
        <div class="stat-lbl">Prescriptions issued</div>
      </div>
      <div class="stat pstat-kpi">
        <div class="stat-ico" style="background:var(--brand-soft);color:var(--brand)">${icon("checkCircle", 19)}</div>
        <div class="stat-val" data-count="${d.consultationsTotal}">0</div>
        <div class="stat-lbl">Consultations completed</div>
      </div>
      <div class="stat pstat-kpi">
        <div class="stat-ico" style="background:var(--accent-soft);color:var(--accent)">${icon("trend", 19)}</div>
        <div class="stat-val" data-count="${pctPrescribedVsConsulted}" data-suffix="%">0%</div>
        <div class="stat-lbl">Prescribed vs. consulted</div>
      </div>
    </div>

    <div class="two-col">
      <div class="card card-pad" style="box-shadow:none">
        <div style="font-weight:700;font-size:13.5px;margin-bottom:2px">14-day prescribing trend</div>
        <p class="hint" style="margin-bottom:8px">Daily prescriptions by program</p>
        ${hasTrend ? stackedBarChart(buckets, series, { aria: "14-day prescribing trend" }) : `<div class="empty" style="padding:20px 0">${icon("chart", 28)}<p>No prescriptions in the last 14 days.</p></div>`}
      </div>
      <div class="card card-pad" style="box-shadow:none">
        <div style="font-weight:700;font-size:13.5px;margin-bottom:2px">Medication mix</div>
        <p class="hint" style="margin-bottom:8px">% of prescriptions by category</p>
        ${distTotal ? donutChart(distribution, { aria: "Medication mix" }) : `<div class="empty" style="padding:20px 0">${icon("droplet", 28)}<p>No prescriptions yet.</p></div>`}
        ${distTotal ? `<div class="pstat-legend">
          ${distribution.map((x) => {
            const pct = Math.round((x.value / (distTotal || 1)) * 100);
            return `<div class="pstat-legend-row"><span><span class="dot" style="background:${x.color}"></span>${esc(x.name)}</span><b>${x.value} <span class="hint">(${pct}%)</span></b></div>`;
          }).join("")}
        </div>` : ""}
      </div>
    </div>

    ${medRows.length ? `
    <div style="margin-top:18px">
      <div style="font-weight:700;font-size:13.5px;margin-bottom:10px">Top prescribed medications</div>
      ${medRows.map((m) => {
        const pct = Math.round((m.n / medTotal) * 100);
        const color = (CATEGORY_META[m.category] || {}).color || "#8B8C78";
        return `<div style="margin-bottom:9px">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px"><span>${esc(m.medication)}</span><b>${m.n} <span class="hint">(${pct}%)</span></b></div>
          <div style="height:6px;border-radius:4px;background:#ECEBE3;overflow:hidden"><div class="bar-grow-x" style="width:${pct}%;height:100%;background:${color};border-radius:4px"></div></div>
        </div>`;
      }).join("")}
    </div>` : ""}
  </div>`;
}

function renderPracticeStats(d) {
  const box = document.getElementById("practice-stats");
  if (!box) return;
  box.innerHTML = practiceStatsHTML(d);
  box.querySelectorAll("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    animateCountUp(el, target, 900, el.dataset.suffix || "");
  });
  box.querySelectorAll("[data-dashfilter]").forEach((b) => b.addEventListener("click", () => {
    S.dashFilter = b.dataset.dashfilter;
    renderPracticeStats(d);
  }));
}

function alertSummary(symptoms) {
  const bad = [];
  for (const s of S.presets.symptoms) {
    const v = symptoms[s.key];
    if (v && s.alertOn.includes(v)) bad.push(`${s.label.split(" /")[0]}: ${v}`);
  }
  return bad.join(" · ") || "Flagged check-in";
}

// ── patients list ────────────────────────────────────────────────
async function viewPatients() {
  view().innerHTML = `<div class="skel" style="height:400px"></div>`;
  S.patients = await api("GET", "/api/patients");
  view().innerHTML = `
  <div class="page-head">
    <div><h1>Patients</h1><div class="sub">${S.patients.length} registered</div></div>
    <a class="btn btn-primary" href="#/consult">${icon("plus", 18)} New consultation</a>
  </div>
  <div class="field" style="max-width:420px">
    <label for="pt-search" style="position:absolute;left:-9999px">Search patients</label>
    <input class="input" id="pt-search" type="search" placeholder="Search by name or mobile…">
  </div>
  <div class="card" id="pt-list"></div>`;
  const paint = (q = "") => {
    const list = S.patients.filter((p) =>
      !q || p.name.toLowerCase().includes(q) || String(p.mobile).includes(q.replace(/\D/g, "") || " "));
    document.getElementById("pt-list").innerHTML = list.length ? list.map((p) => `
      <a class="pt-row" href="#/patient/${p.id}">
        <div class="avatar">${esc(initials(p.name))}</div>
        <div class="pt-info">
          <div class="pt-name">${esc(p.name)}
            ${p.open_alerts ? `<span class="badge badge-red">${p.open_alerts} alert${p.open_alerts > 1 ? "s" : ""}</span>` : ""}
            ${p.unread_msgs ? `<span class="badge badge-violet">${p.unread_msgs} new msg</span>` : ""}
          </div>
          <div class="pt-meta">+${esc(p.mobile)}${p.current_plan ? ` · ${esc(p.current_plan)}` : " · no active program"}${p.last_weight ? ` · ${esc(p.last_weight)} kg` : ""}</div>
        </div>
        <div class="pt-side">${p.active_plans ? `<span class="badge badge-green">active</span><br>` : `<span class="badge badge-gray">inactive</span><br>`}<span style="font-size:11.5px">${p.last_activity ? "seen " + timeAgo(p.last_activity) : "no activity"}</span></div>
      </a>`).join("") : `<div class="empty">${icon("users", 34)}<div class="empty-title">No patients found</div><p>Start a new consultation to register your first patient.</p></div>`;
  };
  paint();
  document.getElementById("pt-search").addEventListener("input", (e) => paint(e.target.value.toLowerCase().trim()));
}

// ── patient detail ───────────────────────────────────────────────
async function viewPatient(id) {
  view().innerHTML = `<div class="skel" style="height:90px;margin-bottom:16px"></div><div class="skel" style="height:340px"></div>`;
  let d;
  try { d = await api("GET", `/api/patients/${id}`); }
  catch (e) { view().innerHTML = `<div class="empty">${icon("alert", 34)}<div class="empty-title">${esc(e.message)}</div></div>`; return; }
  const { patient: p, plans, doses, checkins, messages } = d;
  const activePlan = plans.find((pl) => pl.status === "active");
  const weights = checkins.filter((c) => c.weight_kg != null).map((c) => ({ x: c.date, y: c.weight_kg })).reverse();
  if (p.start_weight_kg && !weights.length) weights.push({ x: p.created_at.slice(0, 10), y: p.start_weight_kg });
  const bmi = calcBMIClient(p.height_cm, weights.length ? weights[weights.length - 1].y : p.start_weight_kg);
  const wtChange = weights.length > 1 ? (weights[weights.length - 1].y - weights[0].y) : null;

  view().innerHTML = `
  <a href="#/patients" class="btn btn-ghost btn-sm" style="margin-bottom:14px">${icon("back", 16)} All patients</a>
  <div class="detail-head">
    <div class="avatar">${esc(initials(p.name))}</div>
    <div style="flex:1;min-width:200px">
      <h1 style="font-size:23px">${esc(p.title ? p.title + " " : "")}${esc(p.name)}</h1>
      <div class="sub" style="color:var(--muted);font-size:13.5px">
        +${esc(p.mobile)}${p.age ? ` · ${esc(p.age)} y` : ""}${p.gender ? ` · ${esc(p.gender)}` : ""}
        ${activePlan ? ` · <span class="badge badge-green">${esc(activePlan.medication)}${activePlan.dose ? " " + esc(activePlan.dose) : ""}</span>` : ' · <span class="badge badge-gray">no active program</span>'}
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" id="btn-share">${icon("key", 16)} Share access</button>
      <a class="btn btn-primary btn-sm" href="#/consult?patient=${p.id}">${icon("plus", 16)} New program</a>
    </div>
  </div>

  <div class="metric-strip">
    <div class="metric"><b>${weights.length ? weights[weights.length - 1].y + " kg" : (p.start_weight_kg ? p.start_weight_kg + " kg" : "—")}</b>Current weight</div>
    <div class="metric"><b style="color:${wtChange != null && wtChange < 0 ? "var(--accent)" : "inherit"}">${wtChange != null ? (wtChange > 0 ? "+" : "") + wtChange.toFixed(1) + " kg" : "—"}</b>Change</div>
    <div class="metric"><b>${bmi ?? "—"}</b>BMI ${bmi ? "· " + bmiCategoryClient(bmi) : ""}</div>
    <div class="metric"><b>${doses.length}</b>Doses logged</div>
    <div class="metric"><b>${checkins.length}</b>Check-ins</div>
  </div>

  <div class="tabs" role="tablist">
    ${["overview", "guide", "logs", "messages"].map((t) => `<button class="tab ${S.detailTab === t ? "on" : ""}" data-tab="${t}" role="tab">${t[0].toUpperCase() + t.slice(1)}${t === "messages" && messages.some((m) => m.sender === "patient" && !m.read_at) ? " •" : ""}</button>`).join("")}
  </div>
  <div id="tab-body"></div>`;

  view().querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    S.detailTab = t.dataset.tab;
    view().querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === t));
    paintTab();
  }));

  document.getElementById("btn-share").addEventListener("click", () => sharePinModal(p));

  function paintTab() {
    const box = document.getElementById("tab-body");
    if (S.detailTab === "overview") {
      const intake = p.intake || {};
      const allergySeverity = intake.allergies__severity ? ` <span class="badge badge-amber">${esc(intake.allergies__severity)}</span>` : "";
      const goals = Array.isArray(intake.health_goals) ? intake.health_goals : [];

      box.innerHTML = `
      <div class="two-col">
        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="card card-pad">
            <div class="card-title">${icon("user", 19)} Patient chart</div>
            <div class="emr-grid">
              <div><span class="emr-lbl">Name</span><span class="emr-val">${esc(p.title ? p.title + " " : "")}${esc(p.name)}</span></div>
              <div><span class="emr-lbl">Age</span><span class="emr-val">${p.age ? esc(p.age) + " years" : "—"}</span></div>
              <div><span class="emr-lbl">Gender</span><span class="emr-val">${esc(p.gender || "—")}</span></div>
              <div><span class="emr-lbl">Height</span><span class="emr-val">${p.height_cm ? esc(p.height_cm) + " cm" : "—"}</span></div>
              <div><span class="emr-lbl">Weight</span><span class="emr-val">${weights.length ? esc(weights[weights.length - 1].y) : esc(p.start_weight_kg || "—")} kg</span></div>
              <div><span class="emr-lbl">BMI</span><span class="emr-val">${bmi ?? "—"}${bmi ? " · " + esc(bmiCategoryClient(bmi)) : ""}</span></div>
              <div><span class="emr-lbl">Mobile</span><span class="emr-val">+${esc(p.mobile)}</span></div>
              ${p.national_id ? `<div><span class="emr-lbl">Emirates ID / passport</span><span class="emr-val">${esc(p.national_id)}</span></div>` : ""}
              <div class="full"><span class="emr-lbl">Chronic illnesses</span><span class="emr-val">${esc(p.chronic_illnesses || "None reported")}</span></div>
              <div class="full"><span class="emr-lbl">Current medications</span><span class="emr-val">${esc(p.medications || "None reported")}</span></div>
              <div class="full"><span class="emr-lbl">Allergies</span><span class="emr-val">${esc(p.allergies || "No known drug allergies")}${allergySeverity}</span></div>
              <div class="full"><span class="emr-lbl">Cancer / tumor history</span><span class="emr-val">${esc(intake.cancer_history || "No")}</span></div>
              ${goals.length ? `<div class="full"><span class="emr-lbl">Health goals</span><span class="emr-val">${goals.map((g) => `<span class="badge badge-cyan">${esc(g)}</span>`).join(" ")}</span></div>` : ""}
              ${p.notes ? `<div class="full"><span class="emr-lbl">Notes</span><span class="emr-val">${esc(p.notes)}</span></div>` : ""}
            </div>
          </div>

          ${activePlan && activePlan.clinical_suggestion ? `
          <div class="card card-pad">
            <div class="card-title" style="justify-content:space-between">
              <span style="display:flex;align-items:center;gap:10px">${icon("file", 19)} Clinical record (EMR)</span>
              <button class="btn btn-secondary btn-sm" id="rec-copy" type="button">${icon("copy", 15)} Copy</button>
            </div>
            <pre style="margin:0;font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre-wrap;line-height:1.5;color:var(--muted)">${esc(activePlan.clinical_suggestion)}</pre>
          </div>` : ""}

          <div class="card card-pad">
            <div class="card-title">${icon("trend", 19)} Weight trend</div>
            ${weights.length > 1 ? lineChart(weights, { color: "#283618", unit: " kg", aria: "Weight trend" }) : `<div class="empty">${icon("scale", 30)}<p>Weight entries from check-ins will chart here.</p></div>`}
          </div>

          <div class="card card-pad">
            <div class="card-title">${icon("layers", 19)} Programs</div>
            ${plans.length ? plans.map((pl) => `
              <div class="timeline-item">
                <div class="tl-ico" style="background:var(--brand-soft);color:var(--brand)">${icon(routeIcon(pl.route), 16)}</div>
                <div style="flex:1">
                  <div style="font-weight:700;font-family:var(--font-head);font-size:14.5px">${esc(pl.title)}
                    <span class="badge ${pl.status === "active" ? "badge-green" : pl.status === "completed" ? "badge-cyan" : "badge-gray"}">${esc(pl.status)}</span>
                  </div>
                  <div style="font-size:13px;color:var(--muted)">${esc(pl.medication)}${pl.dose ? " · " + esc(pl.dose) : ""}${pl.quantity > 1 ? " × " + pl.quantity : ""} · ${esc(pl.frequency)} · started ${esc(fmtDate(pl.created_at))}${pl.needs_refill ? ' · <span class="badge badge-amber">refill requested</span>' : ""}</div>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-ghost btn-sm" data-open-guide="${pl.id}">${icon("book", 15)} Guide</button>
                  ${pl.status === "active" ? `
                  <button class="btn btn-ghost btn-sm" data-edit-dose="${pl.id}">${icon("edit", 15)} Dose</button>
                  <button class="btn btn-ghost btn-sm" data-stop="${pl.id}">Stop</button>` : ""}
                </div>
              </div>`).join("") : `<div class="empty">${icon("layers", 30)}<p>No programs yet. Start a consultation to publish one.</p></div>`}
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="card card-pad">
            <div class="card-title">${icon("activity", 19)} Recent activity</div>
            ${chartActivityHTML(doses, checkins)}
          </div>

          <div class="card card-pad">
            <div class="card-title">${icon("file", 19)} Last prescriptions</div>
            ${plans.length ? plans.slice(0, 6).map((pl) => `
              <div class="rx-row">
                <div>
                  <div class="rx-name">${esc(pl.medication)}${pl.dose ? " · " + esc(pl.dose) : ""}</div>
                  <div class="rx-meta">${esc(fmtDate(pl.created_at))}</div>
                </div>
                <span class="badge ${pl.status === "active" ? "badge-green" : pl.status === "completed" ? "badge-cyan" : "badge-gray"}">${esc(pl.status)}</span>
              </div>`).join("") : `<p class="hint">No prescriptions yet.</p>`}
          </div>

          <div class="card card-pad">
            <div class="card-title">${icon("droplet", 19)} Lab tests</div>
            ${(() => {
              const withTests = plans.filter((pl) => pl.blood_test && pl.blood_test !== "none");
              if (!withTests.length) return `<p class="hint">No blood tests requested for this patient.</p>`;
              return withTests.map((pl) => `
                <div class="rx-row">
                  <div>
                    <div class="rx-name">${pl.category === "glp1" ? "Weight Loss Blood Test Panel" : esc(pl.medication) + " — key blood tests"}</div>
                    <div class="rx-meta">${esc(pl.medication)} · ${esc(fmtDate(pl.created_at))}</div>
                  </div>
                  <span class="badge ${pl.blood_test === "required" ? "badge-red" : "badge-amber"}">${esc(pl.blood_test)}</span>
                </div>`).join("");
            })()}
          </div>

          ${intakeSummaryCard(p)}

          <div class="card card-pad">
            <div class="card-title">${icon("clipboard", 19)} Latest check-ins</div>
            ${checkins.slice(0, 6).map((c) => checkinCard(c)).join("") || `<div class="empty">${icon("clipboard", 30)}<p>No check-ins yet.</p></div>`}
          </div>
        </div>
      </div>`;
      const recCopy = box.querySelector("#rec-copy");
      if (recCopy) recCopy.addEventListener("click", async () => { await navigator.clipboard.writeText(activePlan.clinical_suggestion); toast("Clinical record copied"); });
      box.querySelectorAll("[data-stop]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm("Stop this program? The patient will see it as stopped.")) return;
        await api("PATCH", `/api/plans/${b.dataset.stop}`, { status: "stopped" });
        toast("Program stopped");
        viewPatient(id);
      }));
      box.querySelectorAll("[data-edit-dose]").forEach((b) => b.addEventListener("click", () => {
        const pl = plans.find((x) => x.id === Number(b.dataset.editDose));
        editDoseModal(pl, () => viewPatient(id));
      }));
      box.querySelectorAll("[data-open-guide]").forEach((b) => b.addEventListener("click", () => {
        S.guidePlanId = Number(b.dataset.openGuide);
        S.detailTab = "guide";
        view().querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x.dataset.tab === "guide"));
        paintTab();
      }));
    }

    if (S.detailTab === "guide") {
      injectGuideCss();
      const active = plans.filter((pl) => pl.status === "active");
      const guidePlans = active.length ? active : (plans[0] ? [plans[0]] : []);
      const primaryPl = guidePlans.find((pl) => pl.category === "glp1") || guidePlans[0];
      const activeId = S.guidePlanId && guidePlans.some((pl) => pl.id === S.guidePlanId) ? S.guidePlanId : (primaryPl && primaryPl.id);
      const renderOne = (pl) => buildGuide(pl, p, S.user.name);
      box.innerHTML = guidePlans.length ? `
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px">
          <button class="btn btn-secondary btn-sm" id="btn-print">${icon("printer", 16)} Print / PDF</button>
          <button class="btn btn-accent btn-sm" id="btn-wa">${icon("whatsapp", 16)} Send via WhatsApp</button>
        </div>
        ${guidePickerHTML(guidePlans, activeId)}
        <div id="g-active-guide">${renderOne(guidePlans.find((pl) => pl.id === activeId))}</div>`
        : `<div class="empty">${icon("file", 34)}<div class="empty-title">No guide yet</div><p>Publish a program from a consultation and the patient guide will appear here.</p></div>`;
      if (guidePlans.length) {
        wireGuidePicker(box, guidePlans, renderOne, activeId);
        box.querySelectorAll("[data-gpick]").forEach((b) => b.addEventListener("click", () => { S.guidePlanId = Number(b.dataset.gpick); }));
        document.getElementById("btn-print").addEventListener("click", () => window.print());
        document.getElementById("btn-wa").addEventListener("click", () => {
          const link = `${location.origin}/portal`;
          const medSummary = guidePlans.length > 1 ? `${primaryPl.medication} and ${guidePlans.length - 1} other program${guidePlans.length > 2 ? "s" : ""}` : primaryPl.medication;
          const txt = `Hello ${p.title ? p.title + " " : ""}${p.name}, your personal treatment guide for ${medSummary} is ready.\n\nOpen your patient portal here: ${link}\nSign in with your mobile number. If you need a new PIN, just ask.\n\n— ${S.user.name}, DoCare`;
          window.open(waLink(p.mobile, txt), "_blank");
        });
      }
    }

    if (S.detailTab === "logs") {
      box.innerHTML = `
      <div class="two-col">
        <div class="card card-pad">
          <div class="card-title">${icon("syringe", 19)} Dose log</div>
          ${doses.length ? `<div class="table-scroll"><table class="table">
            <thead><tr><th>Date</th><th>Dose</th><th>Site</th><th>Notes</th></tr></thead>
            <tbody>${doses.map((dl) => `<tr><td>${esc(fmtDate(dl.taken_at, true))}</td><td>${esc(dl.dose || "—")}</td><td>${esc(dl.site || "—")}</td><td>${esc(dl.notes || "")}</td></tr>`).join("")}</tbody>
          </table></div>` : `<div class="empty">${icon("syringe", 30)}<p>No doses logged yet.</p></div>`}
        </div>
        <div class="card card-pad">
          <div class="card-title">${icon("clipboard", 19)} Check-in history</div>
          ${checkins.length ? checkins.map((c) => checkinCard(c)).join("") : `<div class="empty">${icon("clipboard", 30)}<p>No check-ins yet.</p></div>`}
        </div>
      </div>`;
    }

    if (S.detailTab === "messages") {
      box.innerHTML = `
      <div class="card card-pad" style="max-width:680px">
        <div class="card-title">${icon("message", 19)} Messages with ${esc(p.name)}</div>
        <div class="msg-list" id="msg-list">
          ${messages.length ? messages.map((m) => `
            <div class="msg ${m.sender}">
              ${esc(m.body)}
              <div class="msg-time">${timeAgo(m.created_at)}</div>
            </div>`).join("") : `<div class="empty">${icon("message", 30)}<p>No messages yet. Send the first note below.</p></div>`}
        </div>
        <form id="msg-form" style="display:flex;gap:8px;margin-top:14px">
          <label for="msg-input" style="position:absolute;left:-9999px">Message</label>
          <input class="input" id="msg-input" placeholder="Write a note to the patient…" autocomplete="off">
          <button class="btn btn-primary" type="submit" aria-label="Send">${icon("send", 18)}</button>
        </form>
      </div>`;
      const list = document.getElementById("msg-list");
      list.scrollTop = list.scrollHeight;
      document.getElementById("msg-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const inp = document.getElementById("msg-input");
        if (!inp.value.trim()) return;
        await api("POST", `/api/patients/${id}/messages`, { body: inp.value });
        viewPatient(id);
      });
    }
  }
  paintTab();
}

// Intake summary card for the patient detail — mirrors Consult-Buddy's intake read-out.
// Merged dose-log + check-in feed for the patient chart's "Recent activity"
// side card — same event shape as the dashboard/Recent-activity page.
function chartActivityHTML(doses, checkins) {
  const rows = [
    ...doses.map((d) => ({ type: "dose", created_at: d.taken_at, detail: d.dose, flagged: false })),
    ...checkins.map((c) => ({ type: "checkin", created_at: c.created_at, detail: c.weight_kg, flagged: c.flagged })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
  if (!rows.length) return `<div class="empty">${icon("activity", 30)}<p>No activity yet.</p></div>`;
  return rows.map((r) => `
    <div class="pt-row" style="cursor:default">
      <div class="tl-ico" style="background:${r.type === "dose" ? "var(--primary-soft)" : "var(--accent-soft)"};color:${r.type === "dose" ? "var(--primary)" : "var(--accent)"}">
        ${icon(r.type === "dose" ? "syringe" : "clipboard", 16)}
      </div>
      <div class="pt-info">
        <div class="pt-name">${r.type === "dose" ? "Logged a dose" : "Checked in"} ${r.flagged ? '<span class="badge badge-red">flagged</span>' : ""}</div>
        <div class="pt-meta">${r.type === "dose" ? esc(r.detail || "") : (r.detail ? esc(r.detail) + " kg" : "")}</div>
      </div>
      <div class="pt-side">${timeAgo(r.created_at)}</div>
    </div>`).join("");
}

function intakeSummaryCard(p) {
  const intake = p.intake || {};
  const goals = Array.isArray(intake.health_goals) ? intake.health_goals : [];
  const conditions = Array.isArray(intake.health_conditions) ? intake.health_conditions : [];
  const rows = [];
  if (goals.length) rows.push(`<div><b>Health goals:</b> ${goals.map((g) => `<span class="badge badge-cyan">${esc(g)}</span>`).join(" ")}</div>`);
  if (conditions.length) rows.push(`<div><b>Conditions:</b> ${conditions.map((c) => `<span class="badge badge-amber">${esc(c)}</span>`).join(" ")}</div>`);
  if (intake.cancer_history && intake.cancer_history !== "No") rows.push(`<div><b>Cancer/tumor history:</b> ${esc(intake.cancer_history)}</div>`);
  if (intake.previous_glp1 === "Yes") rows.push(`<div><b>Previous GLP-1 use:</b> Yes${intake.previous_glp1__notes ? " — " + esc(intake.previous_glp1__notes) : ""}</div>`);
  if (intake.is_pregnant === "Yes") rows.push(`<div><b>Pregnant:</b> Yes</div>`);
  if (intake.is_breastfeeding === "Yes") rows.push(`<div><b>Breastfeeding:</b> Yes</div>`);
  if (intake.additional_notes) rows.push(`<div><b>Patient notes:</b> ${esc(intake.additional_notes)}</div>`);
  if (!rows.length) return "";
  return `<div class="card card-pad">
    <div class="card-title">${icon("clipboard", 19)} Intake &amp; assessment</div>
    <div style="font-size:13.5px;display:flex;flex-direction:column;gap:10px">${rows.join("")}</div>
  </div>`;
}

function checkinCard(c) {
  const bad = [];
  for (const s of S.presets.symptoms) {
    const v = c.symptoms[s.key];
    if (v && s.options.indexOf(v) > 0) bad.push(`${s.label.split(" /")[0]}: ${v}`);
  }
  return `
  <div class="timeline-item">
    <div class="tl-ico" style="background:${c.flagged ? "var(--danger-soft)" : "var(--accent-soft)"};color:${c.flagged ? "var(--danger)" : "var(--accent)"}">${icon(c.flagged ? "alert" : "checkCircle", 16)}</div>
    <div style="flex:1">
      <div style="font-size:13.5px;font-weight:700;font-family:var(--font-head)">${esc(fmtDate(c.date))}
        ${c.weight_kg ? `<span class="badge badge-cyan">${esc(c.weight_kg)} kg</span>` : ""}
        ${c.flagged ? '<span class="badge badge-red">flagged</span>' : ""}
      </div>
      <div style="font-size:12.5px;color:var(--muted)">${esc(bad.join(" · ") || "Feeling well — no symptoms reported")}</div>
      ${c.notes ? `<div style="font-size:12.5px;color:var(--muted);font-style:italic">"${esc(c.notes)}"</div>` : ""}
    </div>
  </div>`;
}

// ── modals ───────────────────────────────────────────────────────
function modal(html, wide) {
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim";
  scrim.innerHTML = `<div class="modal${wide ? " modal-wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  scrim.addEventListener("click", (e) => { if (e.target === scrim) scrim.remove(); });
  document.addEventListener("keydown", function onEsc(e) { if (e.key === "Escape") { scrim.remove(); document.removeEventListener("keydown", onEsc); } });
  document.body.appendChild(scrim);
  scrim.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => scrim.remove()));
  return scrim;
}

async function sharePinModal(p) {
  const scrim = modal(`
    <div class="modal-head"><h3>Patient portal access</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <p style="font-size:14px;color:var(--muted)">Generate a fresh 6-digit PIN for <b>${esc(p.name)}</b>. The previous PIN stops working and the patient signs in at <b>${location.host}/portal</b> with their mobile number + this PIN.</p>
    <div id="pin-zone" style="margin-top:14px">
      <button class="btn btn-primary btn-block" id="gen-pin">${icon("key", 18)} Generate new PIN</button>
    </div>`);
  scrim.querySelector("#gen-pin").addEventListener("click", async () => {
    const { pin } = await api("POST", `/api/patients/${p.id}/pin`);
    const link = `${location.origin}/portal`;
    const waText = `Hello ${p.title ? p.title + " " : ""}${p.name}, here is your access to your personal treatment portal:\n\n🔗 ${link}\n📱 Mobile: +${p.mobile}\n🔑 PIN: ${pin}\n\nYou can view your guide, log your doses and report how you feel — I'll be following your progress.\n\n— ${S.user.name}, DoCare`;
    scrim.querySelector("#pin-zone").innerHTML = `
      <div class="pin-display">${pin}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-accent" style="flex:1" id="pin-wa">${icon("whatsapp", 18)} Send via WhatsApp</button>
        <button class="btn btn-secondary" id="pin-copy">${icon("copy", 18)} Copy message</button>
      </div>
      <p class="hint" style="margin-top:10px">This PIN is shown once. Generating another one invalidates it.</p>`;
    scrim.querySelector("#pin-wa").addEventListener("click", () => window.open(waLink(p.mobile, waText), "_blank"));
    scrim.querySelector("#pin-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(waText); toast("Message copied"); });
  });
}

function editDoseModal(pl, done) {
  const tpl = S.templates.find((t) => t.category === "glp1" && t.config.medication === pl.medication);
  const doses = tpl ? tpl.config.doses : null;
  const scrim = modal(`
    <div class="modal-head"><h3>Adjust dose — ${esc(pl.medication)}</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <div class="field">
      <label for="nd-dose">New dose</label>
      ${doses ? `<select class="input" id="nd-dose">${doses.map((d) => `<option ${d === pl.dose ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>`
              : `<input class="input" id="nd-dose" value="${esc(pl.dose)}">`}
    </div>
    <div class="field"><label for="nd-note">Note for the patient (optional)</label><input class="input" id="nd-note" placeholder="e.g. Increase as discussed in follow-up"></div>
    <button class="btn btn-primary btn-block" id="nd-save">Save new dose</button>`);
  scrim.querySelector("#nd-save").addEventListener("click", async () => {
    const dose = scrim.querySelector("#nd-dose").value;
    const note = scrim.querySelector("#nd-note").value.trim();
    await api("PATCH", `/api/plans/${pl.id}`, { dose });
    if (note) await api("POST", `/api/patients/${pl.patient_id}/messages`, { body: `Dose update: ${pl.medication} is now ${dose}. ${note}` });
    scrim.remove();
    toast(`Dose updated to ${dose}`);
    done && done();
  });
}

// ── consultation wizard ──────────────────────────────────────────
const WIZ_STEPS = ["Intake", "Program", "Clinical", "Review & publish"];

// A blank "program in progress" — the Program step builds one of these at a
// time, then "+ Add to program" pushes a copy into S.wizard.cart so a single
// consultation can prescribe several medications (e.g. a GLP-1 + a peptide).
function freshDraft(category) {
  return {
    category, template: null, protocol: null, protocolBase: null, customizing: false,
    medication: "", dose: "", quantity: 1, route: "injection", frequency: "weekly", halfLifeHours: null,
    phases: [],
  };
}

async function viewConsult() {
  if (!S.patients.length) { try { S.patients = await api("GET", "/api/patients"); } catch {} }
  const preselect = (location.hash.match(/patient=(\d+)/) || [])[1];
  S.wizard = {
    step: 0,
    intakeSub: 0, // sub-step within Intake: identity → clinical → goals → objective
    existingId: preselect ? Number(preselect) : null,
    patient: { name: "", mobile: "", email: "", nationalId: "", title: "", age: "", gender: "", heightCm: "", weightKg: "", activityLevel: "Sedentary", chronicIllnesses: "", medications: "", allergies: "", intake: {} },
    cart: [],              // programs added so far this consultation (one entry per medication)
    draft: freshDraft("glp1"), // the program currently being configured on the Program step
    followupDays: 28, clinicalNote: "", supplements: "",
    diet: {},              // shared metabolic targets — only relevant while a glp1 program is in the cart
  };
  if (preselect) {
    const p = S.patients.find((x) => x.id === Number(preselect));
    if (p) loadPatientIntoWizard(p);
  }
  paintWizard();
}

// Copy an existing patient row into the wizard's patient draft.
function loadPatientIntoWizard(p) {
  Object.assign(S.wizard.patient, {
    name: p.name, mobile: p.mobile, email: p.email || "", nationalId: p.national_id || "",
    title: p.title || "", age: p.age || "", gender: p.gender || "",
    heightCm: p.height_cm || "", weightKg: p.last_weight || p.start_weight_kg || "",
    intake: p.intake_json ? JSON.parse(p.intake_json) : {},
  });
}

// live metrics for the current wizard patient
function wizMetrics() {
  return computeMetrics(S.wizard.patient, S.presets.activityLevels);
}

// Patient Summary panel HTML (BMI/BMR/TDEE/target/protein) — mirrors
// Consult-Buddy's consultation side panel.
function patientSummaryHTML(showRx) {
  const w = S.wizard, m = wizMetrics();
  const cell = (lbl, val) => `<div class="metric"><b>${val}</b>${lbl}</div>`;
  const rows = [];
  if (m.bmi) rows.push(cell(`BMI · ${esc(m.bmiCat)}`, m.bmi));
  if (m.bmr) rows.push(cell("BMR", m.bmr + " kcal"));
  if (m.tdee) rows.push(cell("TDEE", m.tdee + " kcal"));
  if (m.target) rows.push(cell("Weight-loss target", m.target + " kcal"));
  if (m.proteinMin) rows.push(cell("Protein / day", `${m.proteinMin}–${m.proteinMax} g`));
  if (showRx && w.cart.length) rows.push(cell("Rx", esc(w.cart.map((c) => c.medication + (c.dose ? " " + c.dose : "")).join(", "))));
  if (!rows.length) return "";
  return `<div class="metric-strip">${rows.join("")}</div>`;
}

function wizHead() {
  return `
  <div class="page-head"><div><h1>New consultation</h1><div class="sub">Consult → build program → publish guide</div></div></div>
  <div class="steps">
    ${WIZ_STEPS.map((s, i) => `<div class="step-dot ${i < S.wizard.step ? "done" : ""} ${i === S.wizard.step ? "on" : ""}"><div class="step-bar"></div><div class="step-lbl">${i + 1}. ${s}</div></div>`).join("")}
  </div>`;
}

function paintWizard() {
  const w = S.wizard;
  if (w.step === 0) return wizStepIntake();
  if (w.step === 1) return wizStepProgram();
  if (w.step === 2) return wizStepClinical();
  return wizStepReview();
}

// ── intake question rendering (ported from Consult-Buddy intake) ─────────
// `conditionalOn.value` may be a string or an array of strings (OR match).
function intakeVisible(q) {
  if (!q.conditionalOn) return true;
  const w = S.wizard;
  const src = q.conditionalOn.questionId === "gender"
    ? w.patient.gender
    : w.patient.intake[q.conditionalOn.questionId];
  if (!src) return false;
  const targets = Array.isArray(q.conditionalOn.value) ? q.conditionalOn.value : [q.conditionalOn.value];
  if (Array.isArray(src)) return src.some((a) => targets.some((t) => a.includes(t)));
  return targets.some((t) => String(src).includes(t));
}

function reqMark(q) { return q.required ? ' <span class="req">*</span>' : ""; }

function renderIntakeQuestion(q) {
  const ans = S.wizard.patient.intake;
  const val = ans[q.id];
  if (q.type === "select") {
    // `patientField` questions (e.g. activity level) bind straight to the
    // patient record instead of the free-form intake bag.
    const bind = q.patientField ? "patient" : "intake";
    const curVal = q.patientField ? S.wizard.patient[q.patientField] : val;
    return `<div class="field"><label>${esc(q.question)}${reqMark(q)}</label>
      <div class="chip-row">${q.options.map((o) => `<button type="button" class="chip ${curVal === o ? "on" : ""}" data-iqchip="${q.id}" data-field="${q.patientField || q.id}" data-bind="${bind}" data-v="${esc(o)}">${esc(o)}</button>`).join("")}</div>
      ${q.hasNotes && curVal && curVal !== "No" ? `<textarea class="input" data-iqnotes="${q.id}" rows="2" placeholder="Notes (optional)" style="margin-top:6px">${esc(ans[q.id + "__notes"] || "")}</textarea>` : ""}
    </div>`;
  }
  if (q.type === "multiselect") {
    const gateOn = q.hasGate ? ans[q.id + "__gate"] === true : true;
    const selected = Array.isArray(val) ? val : [];
    return `<div class="field"><label>${esc(q.question)}${reqMark(q)}</label>
      ${q.hasGate ? `<div class="chip-row" style="margin-bottom:8px">
        <button type="button" class="chip ${gateOn ? "on" : ""}" data-gate="${q.id}" data-v="yes">Yes</button>
        <button type="button" class="chip ${ans[q.id + "__gate"] === false ? "on" : ""}" data-gate="${q.id}" data-v="no">No</button>
      </div>` : ""}
      ${gateOn ? `<div class="chip-row">
        ${q.options.map((o) => `<button type="button" class="chip ${selected.includes(o) ? "on" : ""}" data-iqmulti="${q.id}" data-v="${esc(o)}"${q.id === "health_goals" && (S.presets.goalDescriptions || {})[o] ? ` title="${esc(S.presets.goalDescriptions[o])}"` : ""}>${esc(o)}</button>`).join("")}
        ${q.hasOther ? `<button type="button" class="chip ${selected.includes("Other") ? "on" : ""}" data-iqmulti="${q.id}" data-v="Other">Other</button>` : ""}
      </div>
      ${q.hasOther && selected.includes("Other") ? `<input class="input" data-iqother="${q.id}" placeholder="Other — please specify" value="${esc(ans[q.id + "__other"] || "")}" style="margin-top:6px">` : ""}
      ${q.hasNotes ? `<textarea class="input" data-iqnotes="${q.id}" rows="2" placeholder="Notes (optional)" style="margin-top:6px">${esc(ans[q.id + "__notes"] || "")}</textarea>` : ""}` : ""}
    </div>`;
  }
  // text
  return `<div class="field"><label>${esc(q.question)}</label>
    <textarea class="input" data-iqnotes="${q.id}" rows="2" placeholder="Optional">${esc(val || "")}</textarea></div>`;
}

// Wire intake question events within a scope. `rerender` re-renders the step.
function wireIntake(scope, rerender) {
  const w = S.wizard;
  const ans = w.patient.intake;
  scope.querySelectorAll("[data-iqchip]").forEach((b) => b.addEventListener("click", () => {
    const key = b.dataset.field || b.dataset.iqchip, v = b.dataset.v;
    if (b.dataset.bind === "patient") w.patient[key] = (w.patient[key] === v ? "" : v);
    else ans[key] = (ans[key] === v ? "" : v);
    rerender();
  }));
  scope.querySelectorAll("[data-gate]").forEach((b) => b.addEventListener("click", () => {
    ans[b.dataset.gate + "__gate"] = b.dataset.v === "yes";
    rerender();
  }));
  scope.querySelectorAll("[data-iqmulti]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.iqmulti, v = b.dataset.v;
    const arr = Array.isArray(ans[id]) ? ans[id] : [];
    ans[id] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    rerender();
  }));
  scope.querySelectorAll("[data-iqother]").forEach((el) => el.addEventListener("input", () => { ans[el.dataset.iqother + "__other"] = el.value; }));
  scope.querySelectorAll("[data-iqnotes]").forEach((el) => el.addEventListener("input", () => {
    const id = el.dataset.iqnotes;
    const q = S.presets.intakeQuestions.find((x) => x.id === id);
    ans[q && q.type === "text" ? id : id + "__notes"] = el.value;
  }));
}

// Per-sub-step validators — mobile-OR-email is enough to continue the
// intake, but a mobile number is still required before publish (portal
// login = mobile+PIN).
function validateIdentity() {
  const p = S.wizard.patient, missing = [];
  if (!p.name.trim()) missing.push("full name");
  if (!p.mobile.trim() && !p.email.trim()) missing.push("mobile number or email");
  if (!p.age) missing.push("age");
  if (!p.gender) missing.push("gender");
  if (!p.heightCm) missing.push("height");
  if (!p.weightKg) missing.push("weight");
  return missing;
}

function validateClinical() {
  const p = S.wizard.patient, missing = [];
  for (const q of S.presets.intakeQuestions) {
    if (q.section !== "Clinical" || !q.required || !intakeVisible(q)) continue;
    if (q.type === "multiselect") {
      if (p.intake[q.id + "__gate"] === undefined) missing.push(q.question.toLowerCase());
    } else if (!p.intake[q.id]) {
      missing.push(q.question.toLowerCase());
    }
  }
  if (p.intake.allergies__gate === true && !p.intake.allergies__severity) missing.push("allergy severity");
  return missing;
}

function validateGoals() {
  const goals = S.wizard.patient.intake.health_goals;
  return Array.isArray(goals) && goals.length ? [] : ["at least one health goal"];
}

// ── Quick fill — deterministic (no AI call) parser for a pasted free-text
// blurb like "Ahmed Ali, 0501234567, 35y Male, 180cm, 95kg, diabetic,
// allergic to penicillin". Runs entirely client-side; the doctor confirms
// everything before continuing.
function parseIntakeText(text) {
  const t = String(text || "").trim();
  const out = {};
  if (!t) return out;

  const emailMatch = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) out.email = emailMatch[0];

  const mobileMatch = t.match(/(\+?\d[\d\s-]{6,17}\d)/);
  if (mobileMatch) {
    const digits = mobileMatch[0].replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) out.mobile = digits;
  }

  const ageMatch = t.match(/\b(\d{1,3})\s*(?:y\.?o\.?|yrs?|years?|y)\b/i);
  if (ageMatch) out.age = ageMatch[1];

  // Check "female" before "male" — "male" is a substring of "female".
  if (/\bfemale\b/i.test(t)) out.gender = "Female";
  else if (/\bmale\b/i.test(t)) out.gender = "Male";

  const hMatch = t.match(/\b(\d{2,3})\s*cm\b/i);
  if (hMatch) out.heightCm = hMatch[1];

  const wMatch = t.match(/\b(\d{2,3}(?:\.\d+)?)\s*kg\b/i);
  if (wMatch) out.weightKg = wMatch[1];

  // First comma-separated segment that looks like a name: has letters, no
  // digits, isn't just the gender word, and isn't the email segment.
  const segs = t.split(",").map((s) => s.trim());
  for (const s of segs) {
    if (s && /[a-zA-Z]/.test(s) && !/\d/.test(s) && !/^(male|female)$/i.test(s) && !s.includes("@")) { out.name = s; break; }
  }

  const condKeywords = [
    [/diabet/i, "Diabetes"], [/hypertens|high blood pressure/i, "Hypertension"],
    [/thyroid/i, "Thyroid disorder"], [/asthma/i, "Asthma"], [/cholesterol/i, "High cholesterol"],
  ];
  const foundConditions = condKeywords.filter(([re]) => re.test(t)).map(([, label]) => label);
  if (foundConditions.length) out.conditionsNote = foundConditions.join(", ");

  const allergyMatch = t.match(/allerg(?:y|ic)\s*(?:to|:)?\s*([a-zA-Z ,]+)?/i);
  if (allergyMatch) out.allergyNote = (allergyMatch[1] || "").trim().replace(/,\s*$/, "") || "mentioned — confirm details";

  return out;
}

// Applies a parsed quick-fill result onto the wizard patient/intake state.
// Returns a list of human-readable labels for what changed (for a toast).
function applyQuickFill(text) {
  const w = S.wizard, r = parseIntakeText(text), changed = [];
  if (r.name) { w.patient.name = r.name; changed.push("name"); }
  if (r.mobile) { w.patient.mobile = r.mobile; changed.push("mobile"); }
  if (r.email) { w.patient.email = r.email; changed.push("email"); }
  if (r.age) { w.patient.age = r.age; changed.push("age"); }
  if (r.gender) { w.patient.gender = r.gender; changed.push("gender"); }
  if (r.heightCm) { w.patient.heightCm = r.heightCm; changed.push("height"); }
  if (r.weightKg) { w.patient.weightKg = r.weightKg; changed.push("weight"); }
  if (r.conditionsNote) {
    w.patient.intake.health_conditions__gate = true;
    w.patient.intake.health_conditions__notes = [w.patient.intake.health_conditions__notes, `Detected: ${r.conditionsNote}`].filter(Boolean).join(" · ");
    changed.push("chronic illnesses (please confirm)");
  }
  if (r.allergyNote) {
    w.patient.intake.allergies__gate = true;
    w.patient.intake.allergies__notes = [w.patient.intake.allergies__notes, `Detected: ${r.allergyNote}`].filter(Boolean).join(" · ");
    changed.push("allergies (please confirm)");
  }
  return changed;
}

// Banner shown under the mobile field when the typed number matches an
// already-registered patient — surfaces a quick history (date + medication
// per past prescription) so the doctor can decide to reuse the record.
function existingPatientMatchHTML(p, plans) {
  const rows = (plans || []).slice(0, 4).map((pl) => `
    <div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:5px 0;border-top:1px solid rgba(0,0,0,.07)">
      <span>${esc(fmtDate(pl.created_at))} · ${esc(pl.medication)}${pl.dose ? " " + esc(pl.dose) : ""}</span>
      <span class="badge ${pl.status === "active" ? "badge-green" : pl.status === "completed" ? "badge-cyan" : "badge-gray"}">${esc(pl.status)}</span>
    </div>`).join("");
  return `<div class="match-box">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
      <div>
        <div style="font-weight:700;display:flex;align-items:center;gap:6px">${icon("users", 15)} Existing patient found: ${esc(p.name)}</div>
        <div class="hint">+${esc(p.mobile)}${p.age ? ` · ${esc(p.age)}y` : ""}${p.gender ? ` · ${esc(p.gender)}` : ""}</div>
      </div>
      <button class="btn btn-primary btn-sm" id="wz-use-existing" type="button">${icon("checkCircle", 15)} Use this patient</button>
    </div>
    <div style="margin-top:8px">
      ${rows || `<p class="hint" style="margin:6px 0 0">No previous prescriptions on file yet.</p>`}
    </div>
  </div>`;
}

// ── Intake sub-wizard (mirrors Consult-Buddy's step-per-section flow:
// Identity & Demographics → Vitals & Medical History → Primary Health
// Objectives → Objective-Specific). The last sub-step is skipped entirely
// when no objective-specific question applies to the selected goals —
// same dynamic step count Consult-Buddy's peptide intake uses.
function intakeSubSteps() {
  const steps = [
    { key: "identity", label: "Identity & Demographics" },
    { key: "clinical", label: "Vitals & Medical History" },
    { key: "goals", label: "Primary Health Objectives" },
  ];
  const hasObjective = S.presets.intakeQuestions.some((q) => q.section === "Objective-Specific Questions" && intakeVisible(q));
  if (hasObjective) steps.push({ key: "objective", label: "Objective-Specific Questions" });
  return steps;
}

function intakeProgressHTML() {
  const steps = intakeSubSteps();
  const idx = Math.min(S.wizard.intakeSub, steps.length - 1);
  const pct = Math.round(((idx + 1) / steps.length) * 100);
  return `<div class="intake-progress">
    <div class="intake-progress-top"><span>Step ${idx + 1} of ${steps.length} — ${esc(steps[idx].label)}</span><span>${pct}%</span></div>
    <div class="intake-progress-bar"><div style="width:${pct}%"></div></div>
  </div>`;
}

function advanceIntake() {
  const steps = intakeSubSteps();
  if (S.wizard.intakeSub + 1 < steps.length) { S.wizard.intakeSub++; wizStepIntake(); }
  else { S.wizard.step = 1; paintWizard(); }
}

function retreatIntake() {
  if (S.wizard.intakeSub > 0) { S.wizard.intakeSub--; wizStepIntake(); }
}

function wizIntakeShell(bodyHtml, sideHtml) {
  const steps = intakeSubSteps();
  const idx = S.wizard.intakeSub;
  const mainCard = `
  <div class="card card-pad">
    ${intakeProgressHTML()}
    ${bodyHtml}
    <p class="err-text" id="wz-err" hidden role="alert"></p>
    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:14px">
      <button class="btn btn-ghost" id="wz-back" ${idx === 0 ? "disabled" : ""}>${icon("chevL", 17)} Back</button>
      <button class="btn btn-primary" id="wz-next">${idx === steps.length - 1 ? "Continue to program" : "Continue"} ${icon("chevR", 17)}</button>
    </div>
  </div>`;
  view().innerHTML = sideHtml
    ? `${wizHead()}<div class="two-col">${mainCard}<div id="wz-side">${sideHtml}</div></div>`
    : `${wizHead()}<div style="max-width:820px">${mainCard}</div>`;
}

function showIntakeErr(missing) {
  const err = document.getElementById("wz-err");
  err.textContent = `Please complete: ${missing.join(", ")}.`;
  err.hidden = false;
}

function wizStepIntake() {
  const key = intakeSubSteps()[Math.min(S.wizard.intakeSub, intakeSubSteps().length - 1)].key;
  if (key === "identity") return wizIntakeIdentity();
  if (key === "clinical") return wizIntakeClinical();
  if (key === "goals") return wizIntakeGoals();
  return wizIntakeObjective();
}

// ── Sub-step 1: Identity & Demographics ───────────────────────────────
function wizIntakeIdentity() {
  const w = S.wizard;
  const genderChips = ["Male", "Female", "Other"];
  const titleChips = ["Mr", "Ms", "Mrs", "Dr"];

  wizIntakeShell(`
    <div class="card-title">${icon("user", 19)} Identity &amp; Demographics</div>
    <div class="field">
      <label for="wz-patsearch">Existing patient</label>
      <div style="position:relative">
        <input class="input" id="wz-patsearch" autocomplete="off" placeholder="Search by name or mobile number…"
          value="${w.existingId ? esc((S.patients.find((p) => p.id === w.existingId) || {}).name || "") : ""}">
        <div class="pat-results" id="wz-patresults" hidden></div>
      </div>
      <span class="hint">${w.existingId
        ? `Follow-up for this patient — <button type="button" class="linklike" id="wz-clear-existing">clear selection</button> to start a new patient instead.`
        : "Type to search existing patients (name or mobile) for a follow-up, or just fill the form below for a new patient."}</span>
    </div>

    <div class="qf-box">
      <label>${icon("sparkle", 15)} Quick fill — paste patient details</label>
      <div style="display:flex;gap:8px">
        <input class="input" id="qf-input" placeholder="Ahmed Ali, 0501234567, 35y Male, 180cm, 95kg, diabetic...">
        <button class="btn btn-secondary" id="qf-parse" type="button">Parse</button>
      </div>
      <span class="hint">Paste a quick note and the fields below fill in automatically — always confirm before continuing.</span>
    </div>

    <div class="intake-sec-title first">${icon("user", 15)} Identity</div>
    <div class="form-grid">
      <div class="field full"><label for="wp-name">Full name (as per passport/ID) <span class="req">*</span></label><input class="input" id="wp-name" value="${esc(w.patient.name)}" autocomplete="off"></div>
      <div class="field"><label for="wp-mobile">Mobile number <span class="req">*</span></label><input class="input" id="wp-mobile" type="tel" inputmode="tel" placeholder="9715xxxxxxxx" value="${esc(w.patient.mobile)}"></div>
      <div class="field"><label for="wp-email">Email</label><input class="input" id="wp-email" type="email" placeholder="patient@example.com" value="${esc(w.patient.email)}"></div>
      <div class="field full" style="margin-top:-8px"><span class="hint">Mobile number or email is required (at least one) — mobile is needed for the patient's portal login.</span></div>
      <div class="field full"><label for="wp-natid">Emirates ID / passport number <span class="hint" style="font-weight:400">(optional)</span></label><input class="input" id="wp-natid" autocomplete="off" placeholder="784-XXXX-XXXXXXX-X or passport no." value="${esc(w.patient.nationalId || "")}"></div>
      <div class="field full" id="wz-mobile-match"></div>
      <div class="field full"><label>Title</label><div class="chip-row">${titleChips.map((t) => `<button type="button" class="chip ${w.patient.title === t ? "on" : ""}" data-demochip="title" data-v="${t}">${t}</button>`).join("")}</div></div>
    </div>

    <div class="intake-sec-title">${icon("clipboard", 15)} Demographics</div>
    <div class="form-grid">
      <div class="field"><label for="wp-age">Age <span class="req">*</span></label><input class="input" id="wp-age" type="number" inputmode="numeric" min="12" max="110" value="${esc(w.patient.age)}"></div>
      <div class="field"><label>Gender <span class="req">*</span></label><div class="chip-row">${genderChips.map((g) => `<button type="button" class="chip ${w.patient.gender === g ? "on" : ""}" data-demochip="gender" data-v="${g}">${g}</button>`).join("")}</div></div>
      <div class="field"><label for="wp-height">Height (cm) <span class="req">*</span></label><input class="input" id="wp-height" type="number" inputmode="decimal" min="100" max="250" value="${esc(w.patient.heightCm)}"></div>
      <div class="field"><label for="wp-weight">Weight (kg) <span class="req">*</span></label><input class="input" id="wp-weight" type="number" inputmode="decimal" min="25" max="350" step="0.1" value="${esc(w.patient.weightKg)}"></div>
      <div class="field full"><label>Activity level</label><div class="chip-row">${Object.keys(S.presets.activityLevels || {}).map((a) => `<button type="button" class="chip ${w.patient.activityLevel === a ? "on" : ""}" data-demochip="activityLevel" data-v="${a}">${a}</button>`).join("")}</div></div>
      <div class="field full"><label>Body shape</label><div class="chip-row">${(S.presets.bodyShapes || []).map((b) => `<button type="button" class="chip ${w.patient.intake.body_shape === b ? "on" : ""}" data-demochip="intake.body_shape" data-v="${b}">${b}</button>`).join("")}</div></div>
    </div>
    <div id="wz-metrics">${patientSummaryHTML(false)}</div>
  `);

  const demoTextIds = { name: "wp-name", mobile: "wp-mobile", email: "wp-email", nationalId: "wp-natid", age: "wp-age", heightCm: "wp-height", weightKg: "wp-weight" };
  const commitDemo = () => {
    Object.entries(demoTextIds).forEach(([k, id]) => { w.patient[k] = document.getElementById(id).value; });
  };
  const liveMetrics = () => {
    commitDemo();
    document.getElementById("wz-metrics").innerHTML = patientSummaryHTML(false);
  };
  Object.values(demoTextIds).forEach((id) => document.getElementById(id).addEventListener("input", liveMetrics));

  // Look up the mobile number against existing records as the doctor types,
  // so a returning patient's history is one click away instead of requiring
  // the "Existing patient" dropdown to be found manually.
  let mobileCheckTimer = null;
  document.getElementById("wp-mobile").addEventListener("input", (e) => {
    clearTimeout(mobileCheckTimer);
    mobileCheckTimer = setTimeout(() => checkMobileMatch(e.target.value), 400);
  });
  if (!w.existingId && w.patient.mobile) checkMobileMatch(w.patient.mobile);

  function checkMobileMatch(raw) {
    const box = document.getElementById("wz-mobile-match");
    if (!box) return;
    const norm = normMobileClient(raw);
    if (norm.length < 7) { box.innerHTML = ""; return; }
    const match = S.patients.find((p) => p.mobile === norm);
    if (!match || match.id === w.existingId) { box.innerHTML = ""; return; }
    const checkToken = norm;
    box.innerHTML = `<div class="hint">${icon("search", 13)} Checking records…</div>`;
    api("GET", `/api/patients/${match.id}`).then((d) => {
      if (normMobileClient(document.getElementById("wp-mobile").value) !== checkToken) return; // stale response
      box.innerHTML = existingPatientMatchHTML(match, d.plans);
      document.getElementById("wz-use-existing").addEventListener("click", () => {
        commitDemo();
        w.existingId = match.id;
        loadPatientIntoWizard(match);
        toast(`Loaded existing record for ${match.name}`);
        wizIntakeIdentity();
      });
    }).catch(() => { box.innerHTML = ""; });
  }

  view().querySelectorAll("[data-demochip]").forEach((b) => b.addEventListener("click", () => {
    commitDemo();
    const f = b.dataset.demochip, v = b.dataset.v;
    if (f.startsWith("intake.")) {
      const key = f.slice("intake.".length);
      w.patient.intake[key] = (w.patient.intake[key] === v ? "" : v);
    } else {
      w.patient[f] = (w.patient[f] === v ? "" : v);
    }
    wizIntakeIdentity();
  }));

  document.getElementById("qf-parse").addEventListener("click", () => {
    commitDemo();
    const inp = document.getElementById("qf-input");
    if (!inp.value.trim()) return;
    const changed = applyQuickFill(inp.value);
    wizIntakeIdentity();
    toast(changed.length ? `Filled in: ${changed.join(", ")}` : "Nothing recognised — please fill in manually", changed.length ? "ok" : "bad");
  });
  document.getElementById("qf-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("qf-parse").click(); }
  });

  // Searchable existing-patient picker: typing filters by name or mobile
  // number; focusing with an empty box lists the most recent patients, so
  // the dropdown still works like the old <select> for small practices.
  const searchInput = document.getElementById("wz-patsearch");
  const resultsBox = document.getElementById("wz-patresults");
  const patMatches = (q) => {
    const digits = q.replace(/\D/g, "");
    return S.patients.filter((p) =>
      !q || p.name.toLowerCase().includes(q) || (digits.length >= 3 && p.mobile.includes(digits))
    ).slice(0, 8);
  };
  const paintResults = () => {
    const q = searchInput.value.toLowerCase().trim();
    const list = patMatches(q);
    resultsBox.hidden = false;
    resultsBox.innerHTML = list.length
      ? list.map((p) => `
        <button type="button" class="pat-result" data-pick="${p.id}">
          <span class="avatar" style="width:30px;height:30px;font-size:11px">${esc(initials(p.name))}</span>
          <span><b>${esc(p.name)}</b><br><span style="font-size:12px;color:var(--muted)">+${esc(p.mobile)}${p.current_plan ? " · " + esc(p.current_plan) : ""}</span></span>
        </button>`).join("")
      : `<div style="padding:12px 14px;font-size:13px;color:var(--muted)">No matching patients — continue below to register a new one.</div>`;
    resultsBox.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("mousedown", (e) => {
      e.preventDefault(); // fire before the input's blur hides the list
      commitDemo();
      w.existingId = Number(b.dataset.pick);
      loadPatientIntoWizard(S.patients.find((x) => x.id === w.existingId));
      toast(`Loaded existing record for ${w.patient.name}`);
      wizIntakeIdentity();
    }));
  };
  searchInput.addEventListener("input", paintResults);
  searchInput.addEventListener("focus", paintResults);
  searchInput.addEventListener("blur", () => setTimeout(() => { resultsBox.hidden = true; }, 150));
  const clearBtn = document.getElementById("wz-clear-existing");
  if (clearBtn) clearBtn.addEventListener("click", () => {
    w.existingId = null;
    wizIntakeIdentity();
  });

  document.getElementById("wz-back").addEventListener("click", retreatIntake);
  document.getElementById("wz-next").addEventListener("click", () => {
    commitDemo();
    const missing = validateIdentity();
    if (missing.length) return showIntakeErr(missing);
    advanceIntake();
  });
}

// ── Sub-step 2: Vitals & Medical History ──────────────────────────────
function wizIntakeClinical() {
  const w = S.wizard;
  const m = wizMetrics();
  const bmiColor = !m.bmi ? "var(--bg)" : m.bmi < 18.5 ? "var(--primary-soft)" : m.bmi < 25 ? "var(--accent-soft)" : m.bmi < 30 ? "var(--amber-soft)" : "var(--danger-soft)";
  const bmiFg = !m.bmi ? "var(--muted)" : m.bmi < 18.5 ? "var(--primary)" : m.bmi < 25 ? "var(--accent)" : m.bmi < 30 ? "var(--amber)" : "var(--danger)";

  const qById = (id) => S.presets.intakeQuestions.find((q) => q.id === id);
  const chronicQ = qById("health_conditions"), allergyQ = qById("allergies"), cancerQ = qById("cancer_history"), glp1Q = qById("previous_glp1");
  const pregQ = qById("is_pregnant"), breastQ = qById("is_breastfeeding");
  const showPregBox = w.patient.gender === "Female";

  wizIntakeShell(`
    <div class="card-title">${icon("clipboard", 19)} Vitals &amp; Medical History</div>

    <div class="bmi-badge" style="background:${bmiColor};color:${bmiFg}">
      <span>BMI: ${m.bmi ?? "—"}</span>
      <span class="cat">${esc(m.bmiCat || "Waiting for data…")}</span>
    </div>

    <div class="metabolic-box">
      <h3>${icon("flame", 14)} Metabolic stats</h3>
      <div class="metabolic-grid">
        <div><div class="m-lbl">BMR (resting)</div><div class="m-val">${m.bmr ?? "—"} <span style="font-size:12px;font-weight:500">kcal</span></div></div>
        <div><div class="m-lbl">${icon("utensils", 12)} Maintenance (TDEE)</div><div class="m-val">${m.tdee ?? "—"} <span style="font-size:12px;font-weight:500">kcal</span></div></div>
      </div>
      <div class="metabolic-target">
        <div class="m-lbl">${icon("trend", 12)} Weight-loss target</div>
        <div class="m-val">${m.target ?? "—"} <span style="font-size:13px;font-weight:500">kcal/day</span></div>
      </div>
    </div>

    ${showPregBox ? `
    <div class="preg-box">
      <h3>Pregnancy screening</h3>
      ${renderIntakeQuestion(pregQ)}
      ${renderIntakeQuestion(breastQ)}
    </div>` : ""}

    <div class="clinical-box chronic">
      <h3>${icon("shield", 13)} Chronic illnesses</h3>
      ${renderIntakeQuestion(chronicQ)}
    </div>

    <div class="clinical-box allergy">
      <h3>${icon("alert", 13)} Allergy history</h3>
      ${renderIntakeQuestion(allergyQ)}
      ${w.patient.intake.allergies__gate === true ? `
      <div class="field" style="margin-top:2px">
        <label>Severity of worst reaction <span class="req">*</span></label>
        <div class="chip-row">
          ${["Mild", "Moderate", "Severe / life-threatening"].map((s) => `<button type="button" class="chip ${w.patient.intake.allergies__severity === s ? "on" : ""}" data-iqchip="allergies__severity" data-field="allergies__severity" data-v="${esc(s)}">${esc(s)}</button>`).join("")}
        </div>
      </div>` : ""}
    </div>

    ${renderIntakeQuestion(cancerQ)}
    ${renderIntakeQuestion(glp1Q)}
  `);

  wireIntake(view(), () => wizIntakeClinical());
  document.getElementById("wz-back").addEventListener("click", retreatIntake);
  document.getElementById("wz-next").addEventListener("click", () => {
    const missing = validateClinical();
    if (missing.length) return showIntakeErr(missing);
    advanceIntake();
  });
}

// ── Sub-step 3: Primary Health Objectives ─────────────────────────────
// Suggested-peptides side panel, keyed off the currently selected health
// goals (ported concept from Consult-Buddy's LivePeptideSuggestions —
// merges each goal's list, Primary priority wins if any goal marks it so).
function suggestedPeptidesHTML() {
  const goals = S.wizard.patient.intake.health_goals || [];
  if (!goals.length) {
    return `<div class="card card-pad suggested-peptides">
      <div class="card-title">${icon("sparkle", 17)} Suggested Medications</div>
      <div class="empty" style="padding:16px 6px">${icon("droplet", 28)}<p>Select a health goal to see suggested medications here.</p></div>
    </div>`;
  }
  const seen = new Map();
  for (const g of goals) {
    const list = (S.presets.healthGoalPeptides || {})[g] || [];
    for (const item of list) {
      const cur = seen.get(item.name);
      if (!cur || (cur !== "Primary" && item.priority === "Primary")) seen.set(item.name, item.priority);
    }
  }
  const isGlp1 = (name) => S.templates.some((t) => t.category === "glp1" && (t.config.medication || t.name) === name);
  const entries = [...seen.entries()].sort((a, b) =>
    // GLP-1 referrals first (they exist only under the Weight loss goal),
    // then Primary peptides, then Secondary.
    (isGlp1(a[0]) ? -1 : 0) - (isGlp1(b[0]) ? -1 : 0) ||
    (a[1] === "Primary" ? -1 : 1) - (b[1] === "Primary" ? -1 : 1));
  return `<div class="card card-pad suggested-peptides">
    <div class="card-title">${icon("sparkle", 17)} Suggested Medications</div>
    ${entries.length ? `
    <div class="sp-list">
      ${entries.map(([name, priority]) => `
        <div class="sp-row ${priority === "Primary" ? "sp-primary" : "sp-secondary"}">
          <div class="sp-name"><span>${esc(name)}</span>${isGlp1(name)
            ? `<span class="badge badge-teal">GLP-1</span>`
            : `<span class="badge ${priority === "Primary" ? "badge-teal" : "badge-gray"}">${priority}</span>`}</div>
          ${peptideOrGlp1Info(name) ? `<button type="button" class="sp-info" data-peptide="${esc(name)}" aria-label="View ${esc(name)} details">${icon("info", 14)}</button>` : ""}
        </div>`).join("")}
    </div>
    <p class="hint" style="margin-top:10px">Based on selected health goals · <b>Primary</b> = best fit for this goal, highlighted above · <b>Secondary</b> = also worth considering · Tap ${icon("info", 11)} for full protocol details.</p>`
    : `<p class="hint">No commonly-suggested medications for these goals — a custom program may suit best.</p>`}
  </div>`;
}

// Clinical-reference lookup shared by the suggestions panel and detail modal
// — checks peptide info first, then GLP-1 info (both share the same shape).
function peptideOrGlp1Info(name) {
  return (S.presets.peptideInfo || {})[name] || (S.presets.glp1Info || {})[name];
}

function wirePeptideInfoButtons(scope) {
  scope.querySelectorAll("[data-peptide]").forEach((b) => b.addEventListener("click", () => showPeptideDetail(b.dataset.peptide)));
}

// Peptide clinical-reference detail modal (ported layout from Consult-Buddy's
// PeptideDetailSheet: Talking Points → How It Works → Best Use For → Target
// Benefits → Prescribing Info grid → Contraindications → side effects etc).
function showPeptideDetail(name) {
  const info = peptideOrGlp1Info(name);
  if (!info) return;

  const talkingPoints = [
    info.howItWorks ? { label: "Mechanism", text: info.howItWorks.split(".")[0] + "." } : null,
    info.targetBenefits ? { label: "Benefits", text: info.targetBenefits } : null,
    info.treatmentDuration ? { label: "Timeline", text: info.treatmentDuration } : null,
    info.commonSideEffects ? { label: "Side Effects", text: info.commonSideEffects } : null,
  ].filter(Boolean);

  const section = (ico, title, content, cls) => content ? `
    <div class="pep-sec ${cls}">
      <div class="pep-sec-head">${icon(ico, 15)} ${esc(title)}</div>
      <p>${esc(content)}</p>
    </div>` : "";

  const infoCard = (label, value) => value ? `<div class="pep-info-card"><div class="lbl">${esc(label)}</div><div class="val">${esc(value)}</div></div>` : "";

  modal(`
    <div class="modal-head">
      <h3 style="display:flex;align-items:center;gap:8px">${icon(routeIcon(info.administrationRoute), 18)} ${esc(name)}</h3>
      <button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button>
    </div>
    <p class="hint" style="margin:-8px 0 14px">Clinical reference for practitioner use</p>
    ${info.categories && info.categories.length ? `<div class="chip-row" style="margin-bottom:14px">${info.categories.map((c) => `<span class="badge badge-teal">${esc(c)}</span>`).join("")}</div>` : ""}

    <div class="pep-talking">
      <div class="pep-sec-head" style="margin-bottom:2px">${icon("sparkle", 15)} Talking Points for Patients</div>
      ${talkingPoints.map((t) => `<div class="pep-tp"><span class="badge badge-cyan">${esc(t.label)}</span><span>${esc(t.text)}</span></div>`).join("")}
    </div>

    ${section("activity", "How It Works", info.howItWorks, "teal")}
    ${section("book", "Best Use For", info.bestUseFor, "amber")}
    ${section("activity", "Target Benefits", info.targetBenefits, "green")}

    <div class="pep-rx-title">Prescribing Information</div>
    <div class="pep-rx-grid">
      ${infoCard("Dosage", info.dosageInstructions)}
      ${infoCard("Route", info.administrationRoute)}
      ${infoCard("Strength", info.strengthVolume)}
      ${infoCard("Duration", info.treatmentDuration)}
    </div>

    ${info.contraindications ? `<div class="pep-warn"><div class="pep-sec-head">${icon("alert", 15)} Contraindications</div><p>${esc(info.contraindications)}</p></div>` : ""}
    ${section("alert", "Common Side Effects", info.commonSideEffects, "rose")}
    ${section("droplet", "Key Blood Tests", info.keyBloodTests, "violet")}
    ${section("layers", "Possible Combinations", info.possibleCombinations, "sky")}
    ${section("pill", "Recommended Supplements", info.recommendedSupplements, "amber")}
  `, true);
}

function wizIntakeGoals() {
  const goalsQ = S.presets.intakeQuestions.find((q) => q.id === "health_goals");
  wizIntakeShell(`
    <div class="card-title">${icon("sparkle", 19)} Primary Health Objectives</div>
    <p class="hint" style="margin-bottom:14px">Select every goal that applies — choosing <b>Weight loss</b> routes this consultation into the GLP-1 / weight-loss program, and each goal reveals its own follow-up questions next.</p>
    ${renderIntakeQuestion(goalsQ)}
  `, suggestedPeptidesHTML());
  wireIntake(view(), () => wizIntakeGoals());
  wirePeptideInfoButtons(view());
  document.getElementById("wz-back").addEventListener("click", retreatIntake);
  document.getElementById("wz-next").addEventListener("click", () => {
    const missing = validateGoals();
    if (missing.length) return showIntakeErr(missing);
    if ((S.wizard.patient.intake.health_goals || []).includes("Weight loss")) S.wizard.category = "glp1";
    advanceIntake();
  });
}

// ── Sub-step 4: Objective-Specific Questions (skipped if none apply) ──
function wizIntakeObjective() {
  const qs = S.presets.intakeQuestions.filter((q) => q.section === "Objective-Specific Questions" && intakeVisible(q));
  wizIntakeShell(`
    <div class="card-title">${icon("activity", 19)} Objective-Specific Questions</div>
    ${qs.map(renderIntakeQuestion).join("")}
  `);
  wireIntake(view(), () => wizIntakeObjective());
  document.getElementById("wz-back").addEventListener("click", retreatIntake);
  document.getElementById("wz-next").addEventListener("click", () => advanceIntake());
}

// A doctor can prescribe several programs in one consultation (e.g. a
// GLP-1 plus a peptide). The Program step builds one at a time in
// `w.draft`; "+ Add to program" pushes a snapshot into `w.cart` and resets
// the draft so another can be configured. "Continue" also silently adds
// whatever is currently in the draft (if valid) so the common single-
// medication case still works in one click, exactly as before.
function wizStepProgram() {
  const w = S.wizard;
  const d = w.draft;
  const cats = [
    { key: "glp1", label: "GLP-1 / Weight loss", ico: "syringe" },
    { key: "peptide", label: "Peptide therapy", ico: "droplet" },
    { key: "custom", label: "Custom program", ico: "sparkle" },
  ];
  const tpls = S.templates.filter((t) => t.category === d.category);

  view().innerHTML = `${wizHead()}
  <div class="two-col">
  <div class="card card-pad">
    <div class="card-title">${icon("layers", 19)} Choose the treatment program</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      ${cats.map((c) => `<button class="chip ${d.category === c.key ? "on" : ""}" data-cat="${c.key}">${esc(c.label)}</button>`).join("")}
    </div>
    <div id="wz-program-body"></div>
    <div style="margin-top:14px">
      <button class="btn btn-secondary" id="wz-add-cart" type="button">${icon("plus", 16)} Add to program</button>
    </div>
    ${cartHTML()}
    <p class="err-text" id="wz-err" hidden role="alert"></p>
    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:18px">
      <button class="btn btn-ghost" id="wz-back">${icon("chevL", 17)} Back</button>
      <button class="btn btn-primary" id="wz-next">Continue ${icon("chevR", 17)}</button>
    </div>
  </div>
  <div id="wz-side">${suggestedPeptidesHTML()}</div>
  </div>`;
  wirePeptideInfoButtons(view());

  function cartHTML() {
    if (!w.cart.length) return "";
    return `
    <div class="card" style="background:var(--bg);margin-top:16px">
      <div class="card-title" style="padding:14px 16px 0">${icon("checkCircle", 17)} Programs added (${w.cart.length})</div>
      ${w.cart.map((c, i) => `
        <div class="pt-row">
          <div class="pt-info">
            <div class="pt-name">${esc(c.medication)}${c.dose ? " · " + esc(c.dose) : ""}${c.quantity > 1 ? ` × ${c.quantity}` : ""} <span class="badge ${c.category === "glp1" ? "badge-teal" : c.category === "peptide" ? "badge-cyan" : "badge-gray"}">${c.category === "glp1" ? "GLP-1" : c.category[0].toUpperCase() + c.category.slice(1)}</span></div>
            <div class="pt-meta">${esc(c.frequency)}</div>
          </div>
          <button class="icon-btn" data-delcart="${i}" aria-label="Remove ${esc(c.medication)}">${icon("x", 16)}</button>
        </div>`).join("")}
    </div>`;
  }

  view().querySelectorAll("[data-delcart]").forEach((b) => b.addEventListener("click", () => {
    w.cart.splice(Number(b.dataset.delcart), 1);
    wizStepProgram();
  }));

  view().querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => {
    w.draft = freshDraft(b.dataset.cat);
    wizStepProgram();
  }));

  const body = document.getElementById("wz-program-body");

  if (d.category === "custom") {
    body.innerHTML = `
    <div class="form-grid">
      <div class="field"><label for="cu-med">Medication / treatment name <span class="req">*</span></label><input class="input" id="cu-med" value="${esc(d.medication)}" placeholder="e.g. Metformin XR"></div>
      <div class="field"><label for="cu-dose">Dose</label><input class="input" id="cu-dose" value="${esc(d.dose)}" placeholder="e.g. 500 mg"></div>
      <div class="field"><label for="cu-route">Route</label><select class="input" id="cu-route">${["injection", "oral", "nasal", "topical"].map((r) => `<option ${d.route === r ? "selected" : ""}>${r}</option>`).join("")}</select></div>
      <div class="field"><label for="cu-freq">Frequency</label><select class="input" id="cu-freq">${["daily", "twice daily", "weekly", "twice a week", "every 3 days", "every other day", "as needed"].map((f) => `<option ${d.frequency === f ? "selected" : ""}>${f}</option>`).join("")}</select></div>
    </div>
    ${phasesEditor()}`;
    wirePhases(body);
    ["cu-med", "cu-dose", "cu-route", "cu-freq"].forEach((id) => body.querySelector("#" + id).addEventListener("input", () => {
      d.medication = body.querySelector("#cu-med").value;
      d.dose = body.querySelector("#cu-dose").value;
      d.route = body.querySelector("#cu-route").value;
      d.frequency = body.querySelector("#cu-freq").value;
    }));
  } else {
    body.innerHTML = `
    <div class="tpl-grid">
      ${tpls.map((t) => `
        <button class="tpl-card ${d.template && d.template.id === t.id ? "sel" : ""}" data-tpl="${t.id}">
          ${icon(routeIcon(t.config.route || (t.config.protocols && t.config.protocols[0] && t.config.protocols[0].route)), 20)}
          <div class="tpl-name">${esc(t.name)}</div>
          <div class="tpl-sub">${d.category === "glp1" ? esc(t.config.generic || "") + " · " + esc(t.config.frequency) : (t.config.protocols ? t.config.protocols.length + " protocol" + (t.config.protocols.length > 1 ? "s" : "") : "")}</div>
        </button>`).join("")}
    </div>
    <div id="wz-tpl-detail" style="margin-top:18px"></div>`;

    body.querySelectorAll("[data-tpl]").forEach((b) => b.addEventListener("click", () => {
      d.template = S.templates.find((t) => t.id === Number(b.dataset.tpl));
      d.medication = d.template.config.medication || d.template.name;
      if (d.category === "glp1") {
        d.route = d.template.config.route;
        d.frequency = d.template.config.frequency;
        d.halfLifeHours = d.template.config.halfLifeHours;
        d.dose = d.template.config.doses[0];
        d.phases = suggestTitration(d.template.config.doses, d.dose, d.template.config.titration);
      } else {
        d.protocol = d.template.config.protocols[0];
        applyProtocolTo(d);
      }
      wizStepProgram();
    }));

    const det = document.getElementById("wz-tpl-detail");
    if (d.template && d.category === "glp1") {
      const doses = d.template.config.doses;
      det.innerHTML = `
      <hr class="divider">
      <div class="form-grid">
        <div class="field"><label for="g-dose">Starting dose</label><select class="input" id="g-dose">${doses.map((dd) => `<option ${d.dose === dd ? "selected" : ""}>${dd}</option>`).join("")}</select></div>
        <div class="field"><label for="g-qty">Quantity (pens/units)</label><input class="input" id="g-qty" type="number" min="1" step="1" value="${esc(d.quantity || 1)}"></div>
      </div>
      ${phasesEditor()}`;
      det.querySelector("#g-dose").addEventListener("change", (e) => {
        d.dose = e.target.value;
        d.phases = suggestTitration(doses, d.dose, d.template.config.titration);
        wizStepProgram();
      });
      det.querySelector("#g-qty").addEventListener("input", (e) => { d.quantity = Number(e.target.value) || 1; });
      if (!d.phases.length) d.phases = suggestTitration(doses, d.dose, d.template.config.titration);
      det.querySelector("#phases-box").outerHTML = phasesRows();
      wirePhases(det);
    }
    if (d.template && d.category === "peptide") {
      const protos = d.template.config.protocols;
      const selIdx = protos.findIndex((pr) => pr === d.protocolBase || pr === d.protocol);
      det.innerHTML = `
      <hr class="divider">
      <div class="field">
        <label for="pp-proto">Protocol</label>
        <select class="input" id="pp-proto">${protos.map((pr, i) => `<option value="${i}" ${i === selIdx ? "selected" : ""}>${esc(pr.protocolType)} — ${esc(pr.doseVolume)} · ${esc(pr.time)}</option>`).join("")}</select>
      </div>
      ${d.customizing ? `
      <div class="form-grid" id="pp-custom">
        <div class="field"><label for="pc-dosevol">Dose (volume)</label><input class="input" id="pc-dosevol" data-pk="doseVolume" value="${esc(d.protocol.doseVolume || "")}"></div>
        <div class="field"><label for="pc-doseamt">Dose (amount)</label><input class="input" id="pc-doseamt" data-pk="doseAmount" value="${esc(d.protocol.doseAmount || "")}"></div>
        <div class="field"><label for="pc-strength">Strength / concentration</label><input class="input" id="pc-strength" data-pk="strength" value="${esc(d.protocol.strength || "")}"></div>
        <div class="field"><label for="pc-duration">Vial lasts / duration</label><input class="input" id="pc-duration" data-pk="duration" value="${esc(d.protocol.duration || "")}"></div>
        <div class="field"><label for="pc-time">Timing</label><input class="input" id="pc-time" data-pk="time" value="${esc(d.protocol.time || "")}"></div>
        <div class="field"><label for="pc-cycle">Cycle</label><input class="input" id="pc-cycle" data-pk="cycle" value="${esc(d.protocol.cycle || "")}"></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 8px">
        <button class="btn btn-secondary btn-sm" id="pp-save-custom" type="button">${icon("check", 15)} Save as my protocol</button>
        <button class="btn btn-ghost btn-sm" id="pp-cancel-custom" type="button">Reset to standard</button>
      </div>
      <p class="hint">Edits apply to this consultation. "Save as my protocol" also stores it in your Program library for future use.</p>` : `
      <div class="metric-strip">
        <div class="metric"><b>${esc(d.protocol.strength)}</b>Strength</div>
        <div class="metric"><b>${esc(d.protocol.doseAmount || d.protocol.doseVolume)}</b>Dose</div>
        <div class="metric"><b>${esc(d.protocol.duration)}</b>Vial lasts</div>
        <div class="metric"><b>${esc(d.protocol.cycle)}</b>Cycle</div>
      </div>
      <p class="hint">${esc(d.protocol.summary)}</p>
      <button class="btn btn-ghost btn-sm" id="pp-customize" type="button">${icon("edit", 15)} Customize protocol</button>`}`;

      det.querySelector("#pp-proto").addEventListener("change", (e) => {
        d.protocol = protos[Number(e.target.value)];
        d.protocolBase = d.protocol;
        d.customizing = false;
        applyProtocolTo(d);
        wizStepProgram();
      });

      const custBtn = det.querySelector("#pp-customize");
      if (custBtn) custBtn.addEventListener("click", () => {
        d.protocolBase = protos.includes(d.protocol) ? d.protocol : (protos[selIdx >= 0 ? selIdx : 0]);
        d.protocol = { ...d.protocol, protocolType: d.protocol.protocolType.replace(/ \(customized\)$/, "") + " (customized)" };
        d.customizing = true;
        wizStepProgram();
      });

      if (d.customizing) {
        // Plain-text edits mutate the cloned protocol in place (no re-render,
        // so focus is preserved); derived draft fields refresh on each input.
        det.querySelectorAll("#pp-custom [data-pk]").forEach((inp) => inp.addEventListener("input", () => {
          d.protocol[inp.dataset.pk] = inp.value;
          d.protocol.summary = `${d.medication} ${d.protocol.doseVolume || d.protocol.doseAmount || ""} — ${d.protocol.time || ""}`.trim();
          applyProtocolTo(d);
        }));
        det.querySelector("#pp-cancel-custom").addEventListener("click", () => {
          d.protocol = d.protocolBase || protos[0];
          d.customizing = false;
          applyProtocolTo(d);
          wizStepProgram();
        });
        det.querySelector("#pp-save-custom").addEventListener("click", async () => {
          const name = prompt("Save this customized protocol as:", `${d.medication} — my protocol`);
          if (!name) return;
          await api("POST", "/api/templates", {
            name: name.trim(), category: "peptide",
            config: { medication: d.medication, protocols: [{ ...d.protocol, protocolType: "Saved Custom Protocol" }] },
          });
          S.templates = await api("GET", "/api/templates");
          toast("Customized protocol saved to your Program library");
          wizStepProgram();
        });
      }
    }
  }

  document.getElementById("wz-back").addEventListener("click", () => { w.step = 0; paintWizard(); });

  document.getElementById("wz-add-cart").addEventListener("click", () => {
    const err = document.getElementById("wz-err");
    err.hidden = true;
    if (!addDraftToCart()) { err.textContent = "Choose a program (or enter a custom medication) before adding it."; err.hidden = false; return; }
    toast("Added to program");
    wizStepProgram();
  });

  document.getElementById("wz-next").addEventListener("click", () => {
    const err = document.getElementById("wz-err");
    addDraftToCart(); // silently include an in-progress selection, if any
    if (!w.cart.length) { err.textContent = "Add at least one program before continuing."; err.hidden = false; return; }
    w.step = 2;
    prefillFromIntake();
    if (!Object.keys(w.diet).length && w.cart.some((c) => c.category === "glp1")) w.diet = defaultDiet();
    paintWizard();
  });
}

// Pushes the current draft into the cart (computing its default
// instructions/warnings/blood-test suggestion) and resets the draft to a
// blank program of the same category. Returns false if the draft has no
// medication selected yet.
function addDraftToCart() {
  const w = S.wizard, d = w.draft;
  if (!d.medication) return false;
  w.cart.push({
    ...d,
    phases: d.phases.map((p) => ({ ...p })),
    instructions: defaultInstructionsFor(d),
    warnings: defaultWarningsFor(d),
    bloodTest: "none",
  });
  w.draft = freshDraft(d.category);
  return true;
}

function applyProtocolTo(d) {
  const pr = d.protocol;
  d.dose = pr.doseVolume + (pr.doseAmount ? ` (${pr.doseAmount})` : "");
  d.route = pr.route.toLowerCase().includes("oral") ? "oral" : pr.route.toLowerCase().includes("nasal") ? "nasal" : pr.route.toLowerCase().includes("topical") ? "topical" : "injection";
  d.frequency = inferFreqLabel(pr.time);
  d.phases = [{ label: pr.protocolType, dose: d.dose, weeks: "", note: `${pr.time} — ${pr.cycle}` }];
}

function inferFreqLabel(time) {
  const t = String(time || "").toLowerCase();
  if (t.includes("twice daily")) return "twice daily";
  if (t.includes("daily")) return "daily";
  if (t.includes("every 3 days")) return "every 3 days";
  if (t.includes("5 days on")) return "5 days per week";
  if (t.includes("3 times") || t.includes("3x")) return "3 times per week";
  if (t.includes("twice a week") || t.includes("twice weekly")) return "twice a week";
  if (t.includes("weekly")) return "weekly";
  if (t.includes("on demand") || t.includes("as needed")) return "as needed";
  return "daily";
}

// Uses the real per-medication titration schedule (src/presets.js
// GLP1_MEDICATIONS[].titration) when available; falls back to a generic
// 2-step suggestion for medications/peptides without one.
// Auto-fill only a single ~1-month phase (the starting dose) rather than
// the whole escalation ladder — a doctor prescribes one month at a time
// and reviews at follow-up, so the default should match that, not commit
// the patient's guide to a multi-month schedule up front. "+ Add phase"
// still lets a doctor manually plan further steps if they want to.
function suggestTitration(ladder, start, schedule) {
  if (schedule && schedule.length) {
    const idx = schedule.findIndex((s) => s.dose === start);
    const step = schedule[idx >= 0 ? idx : 0];
    return [{
      label: step.note || step.dose,
      dose: step.dose,
      weeks: step.weeks ?? 4,
      note: "1-month starting supply — review and adjust at follow-up",
    }];
  }
  const i = ladder.indexOf(start);
  return [{ label: "Starting phase", dose: ladder[i >= 0 ? i : 0] ?? start, weeks: 4, note: "1-month starting supply — review and adjust at follow-up" }];
}

function phasesEditor() {
  return `<hr class="divider"><div class="card-title" style="font-size:14.5px">${icon("layers", 17)} Dose schedule <span class="hint" style="font-weight:400">(1 month by default — add more phases only if planning the escalation ahead)</span></div>${phasesRows()}`;
}

function phasesRows() {
  const phases = S.wizard.draft.phases;
  return `<div id="phases-box">
    ${phases.map((ph, i) => `
    <div class="phase-row" data-i="${i}">
      <input class="input" data-k="label" placeholder="Phase name" value="${esc(ph.label || "")}" aria-label="Phase ${i + 1} name">
      <input class="input" data-k="dose" placeholder="Dose" value="${esc(ph.dose || "")}" aria-label="Phase ${i + 1} dose">
      <input class="input" data-k="weeks" type="number" min="0" placeholder="Wks" value="${esc(ph.weeks ?? "")}" aria-label="Phase ${i + 1} weeks">
      <input class="input" data-k="note" placeholder="Note" value="${esc(ph.note || "")}" aria-label="Phase ${i + 1} note">
      <button class="icon-btn" data-del="${i}" aria-label="Remove phase">${icon("x", 16)}</button>
    </div>`).join("")}
    <button class="btn btn-secondary btn-sm" id="add-phase" type="button">${icon("plus", 15)} Add phase</button>
  </div>`;
}

function wirePhases(scope) {
  const phases = S.wizard.draft.phases;
  const box = scope.querySelector("#phases-box");
  if (!box) return;
  box.querySelectorAll(".phase-row").forEach((row) => {
    row.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => {
      phases[Number(row.dataset.i)][inp.dataset.k] = inp.value;
    }));
  });
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    phases.splice(Number(b.dataset.del), 1);
    box.outerHTML = phasesRows();
    wirePhases(scope);
  }));
  box.querySelector("#add-phase").addEventListener("click", () => {
    phases.push({ label: "", dose: "", weeks: "", note: "" });
    box.outerHTML = phasesRows();
    wirePhases(scope);
  });
}

// item: {category, template, protocol, medication, route} — a cart entry
// or the in-progress draft; both share this shape.
function defaultInstructionsFor(item) {
  if (item.category === "glp1") {
    const admin = item.template && item.template.config.administration;
    const base = admin || (item.route === "oral"
      ? "Take your tablet first thing in the morning on an empty stomach with a small sip of water. Wait at least 30 minutes before eating, drinking or taking other medicines."
      : "Inject once weekly, on the same day each week, at any time of day. Rotate injection sites: abdomen, thigh, or upper arm.");
    return `${base}\nEat slowly, stop when comfortably full, and prioritise protein at every meal.\nStay well hydrated (2–3 L water daily).`;
  }
  if (item.category === "peptide" && item.protocol) {
    const info = (S.presets.peptideInfo || {})[item.medication];
    const storage = (info && info.storageNotes) || "Store vials refrigerated (2–8°C) away from light.";
    const missed = info && info.missedDose ? `\nMissed dose: ${info.missedDose}` : "";
    return `${item.protocol.time}.\nRoute: ${item.protocol.route}.\nCycle: ${item.protocol.cycle}.\n${storage}${missed}`;
  }
  return "";
}

function defaultWarningsFor(item) {
  if (item.category === "glp1") {
    const flags = (S.presets.glp1Eligibility && S.presets.glp1Eligibility.redFlags) || [];
    const flagsText = flags.length ? `Contact me promptly if you experience:\n- ${flags.join("\n- ")}` : "Contact me promptly if you experience any severe or concerning symptom.";
    return `${flagsText}\nMild nausea, softer stools and reduced appetite are common in the first weeks and usually settle.`;
  }
  if (item.category === "peptide") {
    const info = (S.presets.peptideInfo || {})[item.medication];
    if (info && info.redFlags && info.redFlags.length) {
      return `Contact me promptly if you notice:\n- ${info.redFlags.join("\n- ")}`;
    }
    return "Contact me if you notice: significant redness, swelling or pain at the injection site, rash or itching elsewhere, unusual fatigue, or any symptom that concerns you.";
  }
  return "Contact your doctor if you experience any unexpected or severe symptoms.";
}

function defaultDiet() {
  const m = wizMetrics();
  const diet = {};
  if (m.proteinMin) { diet.proteinMin = m.proteinMin; diet.proteinMax = m.proteinMax; }
  if (m.target) diet.calories = m.target;
  diet.water = "2–3 L daily";
  return diet;
}

// Compose a free-text summary of a multiselect intake answer (options + other + notes).
function intakeText(id) {
  const a = S.wizard.patient.intake;
  const parts = [];
  if (Array.isArray(a[id])) parts.push(...a[id].filter((x) => x !== "Other"));
  if (a[id + "__other"]) parts.push(a[id + "__other"]);
  if (a[id + "__severity"]) parts.push(`severity: ${a[id + "__severity"]}`);
  if (a[id + "__notes"]) parts.push(a[id + "__notes"]);
  return parts.join(", ");
}

// Prefill the clinical free-text fields from intake answers (once), so the
// generated record and guide stay coherent with the intake.
function prefillFromIntake() {
  const w = S.wizard;
  if (!w.patient.chronicIllnesses) w.patient.chronicIllnesses = intakeText("health_conditions");
  if (!w.patient.allergies) w.patient.allergies = intakeText("allergies");
}

// Human-readable frequency phrase for the MEDICATION(S) PRESCRIBED line
// ("weekly" → "once weekly").
function freqPhrase(f) {
  const t = String(f || "").toLowerCase();
  if (t === "weekly") return "once weekly";
  if (t === "daily") return "once daily";
  return t || "as directed";
}

function humanRoute(route) {
  return { injection: "subcutaneous injection", oral: "oral", nasal: "nasal spray", topical: "topical" }[route] || route || "";
}

// One line for the MEDICATION(S) PRESCRIBED section.
function emrMedLine(it) {
  if (it.category === "glp1") {
    const generic = (S.templates.find((t) => t.category === "glp1" && (t.config.medication || t.name) === it.medication) || {}).config?.generic;
    return `${it.medication}${generic ? ` (${generic})` : ""} ${it.dose || ""} ${freqPhrase(it.frequency)}`.replace(/ +/g, " ").trim();
  }
  if (it.category === "peptide" && it.protocol) {
    const pr = it.protocol;
    return `${it.medication} — ${pr.doseAmount ? pr.doseAmount + " " : ""}${pr.doseVolume ? `(${pr.doseVolume})` : ""} — ${pr.time || freqPhrase(it.frequency)}, ${humanRoute(it.route)}${pr.duration ? `, for ${pr.duration} total cycle` : ""}`.replace(/ +/g, " ").trim();
  }
  return `${it.medication}${it.dose ? " " + it.dose : ""} — ${freqPhrase(it.frequency)}${it.route ? ", " + humanRoute(it.route) : ""}`;
}

// Rationale + Supply lines under a peptide/custom medication line, only when
// there's protocol data to draw them from (GLP-1 items don't get these).
function emrMedExtra(it, goals) {
  if (!it.protocol) return "";
  const info = peptideOrGlp1Info(it.medication);
  const mech = info && info.howItWorks ? info.howItWorks.split(".")[0] + "." : "";
  const goalTxt = goals && goals.length ? goals[0] : "the patient's stated goals";
  const pr = it.protocol;
  return `\n   Rationale: Selected for '${goalTxt}'.${mech ? " " + mech : ""}\n   Supply: ${pr.strength || ""}${pr.doseVolume ? `, ${pr.doseVolume}/dose` : ""}${pr.duration ? ` (vial lasts ~${pr.duration})` : ""}`;
}

// Builds the full structured clinical encounter record (EMR) for every
// program added this consultation — Date of Encounter / PATIENT /
// CLINICAL SUMMARY / MEDICATION(S) PRESCRIBED / INVESTIGATIONS / PLAN /
// Physician, matching DarDoc's standard consultation-note format.
function buildMultiClinicalSuggestion(patient, items, metrics, note, followupDays) {
  if (!items.length || !patient.name) return "";
  const m = metrics || {};
  const intake = patient.intake || {};
  const salutation = patient.title || (patient.gender === "Male" ? "Mr" : patient.gender === "Female" ? "Ms" : "");
  const Pronoun = patient.gender === "Male" ? "He" : patient.gender === "Female" ? "She" : "The patient";
  const genderLc = (patient.gender || "").toLowerCase();
  const hasGlp1 = items.some((i) => i.category === "glp1");
  const others = items.filter((i) => i.category !== "glp1");
  const goals = Array.isArray(intake.health_goals) ? intake.health_goals : [];

  const conditions = patient.chronicIllnesses || (Array.isArray(intake.health_conditions) ? intake.health_conditions.join(", ") : "") || "None reported";
  const currentMeds = patient.medications || "None reported";
  const allergyText = patient.allergies || (intake.allergies__gate === true ? "Reported — see allergy history" : "No known drug allergies");
  const noAllergies = allergyText === "No known drug allergies";
  const cancerHistory = intake.cancer_history || "No";
  const prevGlp1 = intake.previous_glp1 === "Yes";

  const encounterDate = new Date();
  const followup = new Date(encounterDate.getTime() + (followupDays || 28) * 864e5);

  // ── PATIENT block ──
  const patientBlock = [
    "PATIENT", "",
    `Name: ${patient.name}`,
    patient.age ? `Age: ${patient.age} years` : null,
    patient.gender ? `Gender: ${patient.gender}` : null,
    patient.heightCm ? `Height: ${patient.heightCm} cm` : null,
    patient.weightKg ? `Weight: ${patient.weightKg} kg` : null,
    m.bmi ? `BMI: ${m.bmi} kg/m²` : null,
    `Chronic Illnesses: ${conditions}`,
    `Current Medications: ${currentMeds}`,
    `Allergies: ${allergyText}`,
    `Cancer / Tumor History: ${cancerHistory}`,
    goals.length ? `Health Goals: ${goals.join(", ")}` : null,
  ].filter((l) => l !== null).join("\n");

  // ── CLINICAL SUMMARY ──
  const bmiCatLc = m.bmiCat ? m.bmiCat.charAt(0).toLowerCase() + m.bmiCat.slice(1) : "";
  let p1 = `${salutation ? salutation + ". " : ""}${patient.name} is a ${patient.age || "—"}-year-old ${genderLc}`.trim();
  p1 += bmiCatLc ? ` with ${bmiCatLc}${m.bmi ? ` (BMI ${m.bmi} kg/m²)` : ""}` : (m.bmi ? ` (BMI ${m.bmi} kg/m²)` : "");
  p1 += conditions === "None reported" ? " and no significant chronic illnesses." : ` and a history of ${conditions}.`;
  if (hasGlp1) p1 += prevGlp1 ? " There is a prior history of GLP-1/peptide medication use." : " There is no prior history of GLP-1/peptide medication use.";
  p1 += noAllergies ? ` ${Pronoun} reports no known drug allergies.` : ` Allergies: ${allergyText}.`;
  if (others.length) p1 += ` Cancer/tumor history: ${cancerHistory.toLowerCase()}.`;
  if (others.length && goals.length) p1 += ` Stated health goals include ${goals.join(", ").toLowerCase()}.`;
  p1 += others.length && !hasGlp1
    ? " Following clinical review, a personalised peptide therapy plan was formulated based on presentation, goals, and safety profile. There are no identified contraindications to the prescribed regimen."
    : " There are no identified contraindications to GLP-1 receptor agonist therapy.";

  const paras = [p1];

  if (hasGlp1 && (m.target || m.proteinMin)) {
    const bits = [];
    if (m.target) bits.push(`a daily caloric intake target of ≤${m.target} kcal/day was recommended`);
    if (m.proteinMin) bits.push(`a protein intake goal of ${m.proteinMin}–${m.proteinMax} g/day was set`);
    paras.push(`Based on the current assessment, ${bits.join(", and ")}. Lifestyle modification, dietary optimization, physical activity, realistic weight-loss expectations, and treatment goals were discussed.`);
  }

  if (others.length) {
    const mechs = others.map((it) => {
      const info = peptideOrGlp1Info(it.medication);
      const sentence = info && info.howItWorks ? info.howItWorks.split(".")[0] + "." : "";
      return `${it.medication} is${others.length > 1 ? " included" : " utilized"}${sentence ? " — " + sentence : ""}`;
    });
    const focus = goals.length ? goals.join(" and ").toLowerCase() : "the patient's stated goals";
    paras.push(`The therapeutic regimen focuses on ${focus}. ${mechs.join(" ")}`);
  }

  // ── MEDICATION(S) PRESCRIBED ──
  const medHeader = items.length > 1 ? "MEDICATIONS PRESCRIBED" : "MEDICATION PRESCRIBED";
  const medLines = items.length === 1
    ? [emrMedLine(items[0]) + emrMedExtra(items[0], goals)]
    : items.map((it, i) => `${i + 1}. ${emrMedLine(it)}${emrMedExtra(it, goals)}`);
  const counsel = others.length
    ? "The patient was counseled regarding expected benefits, common side effects, injection technique, storage, adherence, and the importance of reporting any adverse effects promptly."
    : "The patient was counseled regarding expected benefits, common side effects, injection technique, adherence, and the importance of reporting any adverse effects promptly.";

  // ── INVESTIGATIONS ──
  const invLines = [];
  const glp1Blood = items.find((i) => i.category === "glp1" && i.bloodTest && i.bloodTest !== "none");
  if (glp1Blood) {
    invLines.push(`Weight Loss Blood Test Panel: ${glp1Blood.bloodTest === "required" ? "Required" : "Recommended"}\n\nLink: https://www.dardoc.com/dubai/lab-test/weight-loss-blood-test`);
  }
  for (const it of others) {
    if (it.bloodTest && it.bloodTest !== "none") {
      const info = peptideOrGlp1Info(it.medication);
      invLines.push(`${it.medication} — Key blood tests: ${(info && info.keyBloodTests) || "as clinically indicated"} (${it.bloodTest})`);
    }
  }
  const investigations = invLines.length ? invLines.join("\n\n") : "No additional investigations required at this time.";

  // ── PLAN ──
  const planBullets = [
    "Assess response, tolerance, and compliance at follow-up.",
    "Consider dose titration if treatment is well tolerated.",
    hasGlp1
      ? "Continue monitoring weight, appetite, and any medication-related side effects."
      : "Continue monitoring symptoms, injection-site reactions, and any medication-related side effects.",
  ];
  if (others.length) planBullets.push("Reinforce lifestyle modifications, nutrition, hydration, sleep, and physical activity.");

  const sections = [
    `Date of Encounter: ${fmtDMY(encounterDate)}`,
    patientBlock,
    `CLINICAL SUMMARY\n\n${paras.join("\n\n")}`,
    `${medHeader}\n\n${medLines.join("\n\n")}\n\n${counsel}`,
    `INVESTIGATIONS\n\n${investigations}`,
    `PLAN\n\nFollow-up appointment scheduled for ${fmtDMY(followup)}.\n\n${planBullets.join("\n")}`,
    `Physician:\n${S.user.name}\nDarDoc Healthcare`,
  ];
  return [sections.join("\n\n"), note].filter(Boolean).join("\n\n");
}

function wizStepClinical() {
  const w = S.wizard;
  const hasGlp1 = w.cart.some((c) => c.category === "glp1");

  view().innerHTML = `${wizHead()}
  <div class="card card-pad" style="max-width:820px">
    <div class="card-title">${icon("clipboard", 19)} Clinical details &amp; guide content</div>

    ${w.cart.map((c, i) => `
      <div class="card" style="background:var(--bg);margin-bottom:14px">
        <div class="card-title" style="padding:14px 16px 0;font-size:15px">${icon(c.category === "glp1" ? "syringe" : "droplet", 17)} ${esc(c.medication)}${c.dose ? " · " + esc(c.dose) : ""}${c.quantity > 1 ? ` × ${c.quantity}` : ""}</div>
        <div class="form-grid" style="padding:12px 16px 16px">
          <div class="field full"><label for="ci-instr-${i}">Instructions for the patient</label><textarea class="input" id="ci-instr-${i}" rows="4">${esc(c.instructions)}</textarea></div>
          <div class="field full"><label for="ci-warn-${i}">Warnings — when to contact you</label><textarea class="input" id="ci-warn-${i}" rows="3">${esc(c.warnings)}</textarea></div>
          <div class="field"><label for="ci-blood-${i}">Blood test</label>
            <select class="input" id="ci-blood-${i}">
              <option value="none" ${c.bloodTest === "none" ? "selected" : ""}>Not needed</option>
              <option value="recommended" ${c.bloodTest === "recommended" ? "selected" : ""}>Recommended</option>
              <option value="required" ${c.bloodTest === "required" ? "selected" : ""}>Required</option>
            </select>
          </div>
        </div>
      </div>`).join("")}

    <div class="form-grid">
      <div class="field"><label for="cl-chronic">Chronic illnesses</label><input class="input" id="cl-chronic" value="${esc(w.patient.chronicIllnesses)}" placeholder="None"></div>
      <div class="field"><label for="cl-meds">Current medications</label><input class="input" id="cl-meds" value="${esc(w.patient.medications)}" placeholder="None"></div>
      <div class="field"><label for="cl-allergy">Allergies</label><input class="input" id="cl-allergy" value="${esc(w.patient.allergies)}" placeholder="None"></div>
      <div class="field"><label for="cl-fu">Follow-up in (days)</label><input class="input" id="cl-fu" type="number" min="3" max="180" value="${esc(w.followupDays)}"></div>
      ${hasGlp1 ? `
      <div class="field"><label for="cl-cal">Calorie target (kcal/day)</label><input class="input" id="cl-cal" type="number" value="${esc(w.diet.calories ?? "")}"></div>
      <div class="field"><label>Protein target (g/day)</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="input" id="cl-prot-min" type="number" value="${esc(w.diet.proteinMin ?? "")}" aria-label="Protein minimum"> –
          <input class="input" id="cl-prot-max" type="number" value="${esc(w.diet.proteinMax ?? "")}" aria-label="Protein maximum">
        </div>
      </div>` : ""}
      <div class="field full"><label for="cl-supp">Supplements (optional — shown in the guide)</label><input class="input" id="cl-supp" value="${esc(w.supplements)}" placeholder="e.g. Vitamin D3 2000 IU daily, Omega-3 1 g"></div>
      <div class="field full"><label for="cl-note">Private clinical note (EMR — not shown to patient)</label><textarea class="input" id="cl-note" rows="3" placeholder="Consultation summary for your records…">${esc(w.clinicalNote)}</textarea></div>
    </div>

    <div class="card" style="background:var(--bg);margin-top:6px">
      <div class="card-title" style="padding:16px 16px 0;justify-content:space-between">
        <span style="display:flex;align-items:center;gap:10px">${icon("file", 18)} Clinical record &amp; suggestion (EMR)</span>
        <button class="btn btn-secondary btn-sm" id="cl-copy" type="button">${icon("copy", 15)} Copy record</button>
      </div>
      <pre id="cl-emr" style="margin:12px 16px 16px;padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);font-family:ui-monospace,Menlo,monospace;font-size:12.5px;white-space:pre-wrap;line-height:1.5"></pre>
    </div>

    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:14px">
      <button class="btn btn-ghost" id="wz-back">${icon("chevL", 17)} Back</button>
      <button class="btn btn-primary" id="wz-next">Preview guide ${icon("chevR", 17)}</button>
    </div>
  </div>`;

  const refreshEmr = () => {
    collect();
    document.getElementById("cl-emr").textContent = buildMultiClinicalSuggestion(
      { name: w.patient.name, title: w.patient.title, gender: w.patient.gender, mobile: w.patient.mobile,
        age: w.patient.age, heightCm: w.patient.heightCm, weightKg: w.patient.weightKg,
        chronicIllnesses: w.patient.chronicIllnesses, medications: w.patient.medications, allergies: w.patient.allergies,
        intake: w.patient.intake },
      w.cart, wizMetrics(), w.clinicalNote, w.followupDays
    ) || "Add a medication and patient details to generate the clinical record.";
  };
  view().querySelectorAll("input, select, textarea").forEach((el) => el.addEventListener("input", refreshEmr));
  refreshEmr();

  document.getElementById("cl-copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.getElementById("cl-emr").textContent);
    toast("Clinical record copied");
  });
  document.getElementById("wz-back").addEventListener("click", () => { collect(); w.step = 1; paintWizard(); });
  document.getElementById("wz-next").addEventListener("click", () => { collect(); w.step = 3; paintWizard(); });

  function collect() {
    w.cart.forEach((c, i) => {
      c.instructions = document.getElementById(`ci-instr-${i}`).value;
      c.warnings = document.getElementById(`ci-warn-${i}`).value;
      c.bloodTest = document.getElementById(`ci-blood-${i}`).value;
    });
    w.patient.chronicIllnesses = document.getElementById("cl-chronic").value;
    w.patient.medications = document.getElementById("cl-meds").value;
    w.patient.allergies = document.getElementById("cl-allergy").value;
    w.followupDays = Number(document.getElementById("cl-fu").value) || 28;
    w.supplements = document.getElementById("cl-supp").value;
    w.clinicalNote = document.getElementById("cl-note").value;
    if (hasGlp1) {
      w.diet.calories = Number(document.getElementById("cl-cal").value) || undefined;
      w.diet.proteinMin = Number(document.getElementById("cl-prot-min").value) || undefined;
      w.diet.proteinMax = Number(document.getElementById("cl-prot-max").value) || undefined;
    }
  }
}

function wizStepReview() {
  const w = S.wizard;
  injectGuideCss();
  const nextFollowup = new Date(Date.now() + w.followupDays * 864e5).toISOString().slice(0, 10);
  const createdAt = new Date().toISOString().slice(0, 10);
  const fakePlans = w.cart.map((c) => ({
    title: `${c.medication} — ${c.category === "glp1" ? "Weight Loss Program" : c.category === "peptide" ? "Peptide Therapy" : "Treatment Program"}`,
    category: c.category, medication: c.medication, dose: c.dose, quantity: c.quantity, route: c.route, frequency: c.frequency,
    phases: c.phases.filter((p) => p.label || p.dose), instructions: c.instructions, warnings: c.warnings,
    diet: c.category === "glp1" ? w.diet : {}, blood_test: c.bloodTest, supplements: w.supplements,
    created_at: createdAt, next_followup: nextFollowup,
  }));
  const clinicalSuggestion = buildMultiClinicalSuggestion(
    { name: w.patient.name, title: w.patient.title, gender: w.patient.gender, mobile: w.patient.mobile,
      age: w.patient.age, heightCm: w.patient.heightCm, weightKg: w.patient.weightKg,
      chronicIllnesses: w.patient.chronicIllnesses, medications: w.patient.medications, allergies: w.patient.allergies,
      intake: w.patient.intake },
    w.cart, wizMetrics(), w.clinicalNote, w.followupDays
  );
  w.clinicalSuggestion = clinicalSuggestion;
  view().innerHTML = `${wizHead()}
  <div class="two-col" style="grid-template-columns:1fr 340px">
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="card-title" style="margin:0">${icon("file", 19)} Guide preview — what the patient sees</div>
      </div>
      <div id="guide-preview" style="display:flex;flex-direction:column;gap:18px">
        ${buildComboGuide(fakePlans, { name: w.patient.name, title: w.patient.title }, S.user.name)}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card card-pad">
        <div class="card-title">${icon("send", 18)} Publish</div>
        <p style="font-size:13.5px;color:var(--muted);margin-bottom:14px">
          Publishing saves ${w.cart.length > 1 ? `${w.cart.length} programs` : "the program"} for <b>${esc(w.patient.name)}</b>${w.existingId ? "" : ", registers them as a new patient"} and generates their portal access PIN to share on WhatsApp.
        </p>
        <p class="err-text" id="wz-err" hidden role="alert"></p>
        <button class="btn btn-accent btn-block" id="wz-publish"><span class="spin"></span><span class="btn-label">${icon("check", 18)} Publish guide</span></button>
        <button class="btn btn-ghost btn-block" id="wz-back" style="margin-top:8px">${icon("chevL", 16)} Back to edit</button>
      </div>
      <div class="card card-pad">
        <div class="card-title">${icon("scale", 18)} Patient summary</div>
        ${patientSummaryHTML(true) || `<p class="hint">Add height, weight and age in the intake to compute metrics.</p>`}
      </div>
      ${clinicalSuggestion ? `<div class="card card-pad">
        <div class="card-title" style="justify-content:space-between">
          <span style="display:flex;align-items:center;gap:10px">${icon("file", 18)} Clinical record (EMR)</span>
          <button class="btn btn-secondary btn-sm" id="rv-copy" type="button">${icon("copy", 15)} Copy</button>
        </div>
        <pre style="margin:0;font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre-wrap;line-height:1.5;color:var(--muted)">${esc(clinicalSuggestion)}</pre>
      </div>` : ""}
    </div>
  </div>`;
  if (clinicalSuggestion) document.getElementById("rv-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(clinicalSuggestion); toast("Clinical record copied"); });

  document.getElementById("wz-back").addEventListener("click", () => { w.step = 2; paintWizard(); });
  document.getElementById("wz-publish").addEventListener("click", async () => {
    const btn = document.getElementById("wz-publish");
    const err = document.getElementById("wz-err");
    err.hidden = true;
    if (!w.patient.mobile.trim()) {
      err.textContent = "A mobile number is required to publish — it's how the patient signs in to their portal. Go back to Intake and add one.";
      err.hidden = false;
      return;
    }
    btn.classList.add("loading");
    try {
      let patientId = w.existingId, newPin = null;
      if (!patientId) {
        const created = await api("POST", "/api/patients", {
          name: w.patient.name, mobile: w.patient.mobile, email: w.patient.email, nationalId: w.patient.nationalId, title: w.patient.title,
          age: Number(w.patient.age) || null, gender: w.patient.gender,
          heightCm: Number(w.patient.heightCm) || null, weightKg: Number(w.patient.weightKg) || null,
          activityLevel: w.patient.activityLevel, chronicIllnesses: w.patient.chronicIllnesses,
          medications: w.patient.medications, allergies: w.patient.allergies, intake: w.patient.intake,
        });
        patientId = created.id;
        newPin = created.pin;
      } else {
        await api("PATCH", `/api/patients/${patientId}`, {
          email: w.patient.email, nationalId: w.patient.nationalId, chronicIllnesses: w.patient.chronicIllnesses, medications: w.patient.medications,
          allergies: w.patient.allergies, intake: w.patient.intake,
          heightCm: Number(w.patient.heightCm) || null, weightKg: Number(w.patient.weightKg) || null,
          age: Number(w.patient.age) || null, gender: w.patient.gender, activityLevel: w.patient.activityLevel,
        });
      }
      // One plan row per program added this consultation — each keeps its
      // own dose/quantity/instructions/warnings/blood test, sharing the
      // visit-level follow-up date, clinical note and EMR suggestion.
      for (let i = 0; i < w.cart.length; i++) {
        const c = w.cart[i], p = fakePlans[i];
        await api("POST", "/api/plans", {
          patientId, category: c.category, title: p.title, medication: c.medication,
          dose: c.dose, quantity: c.quantity, route: c.route, frequency: c.frequency, halfLifeHours: c.halfLifeHours,
          phases: p.phases, instructions: c.instructions, warnings: c.warnings,
          diet: p.diet, followupDays: w.followupDays, bloodTest: c.bloodTest, clinicalNote: w.clinicalNote,
          clinicalSuggestion: w.clinicalSuggestion, supplements: w.supplements,
        });
      }
      toast("Guide published");
      publishedModal(patientId, w, newPin);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.classList.remove("loading");
    }
  });
}

function publishedModal(patientId, w, pin) {
  const link = `${location.origin}/portal`;
  const name = `${w.patient.title ? w.patient.title + " " : ""}${w.patient.name}`;
  const medSummary = w.cart.length > 1 ? `${w.cart.length} programs` : `${w.cart[0].medication}${w.cart[0].dose ? " " + w.cart[0].dose : ""}`;
  const waText = pin
    ? `Hello ${name}, your personal treatment guide for ${medSummary} is ready! 🎉\n\n🔗 Your portal: ${link}\n📱 Mobile: +${w.patient.mobile}\n🔑 PIN: ${pin}\n\nView your guide, log your doses, and check in regularly — I'll be following your progress.\n\n— ${S.user.name}, DoCare`
    : `Hello ${name}, your updated treatment guide for ${medSummary} is ready in your portal:\n\n🔗 ${link}\n\nSign in with your mobile number and your existing PIN (ask me for a new one if needed).\n\n— ${S.user.name}, DoCare`;
  const scrim = modal(`
    <div style="text-align:center;padding:6px 0 2px">
      <div style="width:60px;height:60px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;margin:0 auto 14px">${icon("checkCircle", 30)}</div>
      <h3 style="font-size:20px">Guide published</h3>
      <p style="font-size:14px;color:var(--muted);margin:6px 0 14px">${esc(w.patient.name)}'s program${w.cart.length > 1 ? "s are" : " is"} live in their patient portal.</p>
      ${pin ? `<div class="pin-display">${pin}</div><p class="hint" style="margin-bottom:14px">Their portal PIN — shown once. You can regenerate it any time from the patient page.</p>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-accent" style="flex:1;min-width:170px" id="pub-wa">${icon("whatsapp", 18)} Send via WhatsApp</button>
        <button class="btn btn-secondary" id="pub-copy">${icon("copy", 18)} Copy</button>
      </div>
      <a class="btn btn-ghost btn-block" style="margin-top:8px" href="#/patient/${patientId}" id="pub-open">Open patient record</a>
    </div>`);
  scrim.querySelector("#pub-wa").addEventListener("click", () => window.open(waLink(w.patient.mobile, waText), "_blank"));
  scrim.querySelector("#pub-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(waText); toast("Message copied"); });
  scrim.querySelector("#pub-open").addEventListener("click", () => scrim.remove());
}

// ── templates library ────────────────────────────────────────────
// ── knowledge base (read-only — managed by the super admin panel) ──
async function viewKb() {
  view().innerHTML = `<div class="skel" style="height:300px"></div>`;
  const articles = await api("GET", "/api/kb");
  view().innerHTML = `
  <div class="page-head">
    <div><h1>Knowledge Base</h1><div class="sub">Reference articles maintained by your super admin</div></div>
  </div>
  <div class="field" style="max-width:420px">
    <label for="kb-search" style="position:absolute;left:-9999px">Search knowledge base</label>
    <input class="input" id="kb-search" type="search" placeholder="Search articles…">
  </div>
  <div id="kb-results"></div>`;

  const paint = (q = "") => {
    const list = articles.filter((a) => !q || a.title.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
    const byCat = {};
    for (const a of list) (byCat[a.category] || (byCat[a.category] = [])).push(a);
    document.getElementById("kb-results").innerHTML = list.length ? Object.entries(byCat).map(([cat, items]) => `
      <h2 style="font-size:16px;margin:18px 0 10px;color:var(--brand)">${esc(cat)}</h2>
      <div class="card">
        ${items.map((a) => `
          <div class="pt-row" data-kbarticle="${a.id}">
            <div class="pt-info">
              <div class="pt-name">${esc(a.title)}</div>
              <div class="pt-meta">Updated ${esc(fmtDate(a.updated_at))}</div>
            </div>
            ${icon("chevR", 17)}
          </div>`).join("")}
      </div>`).join("") : `<div class="empty">${icon("book", 34)}<div class="empty-title">${q ? "No matching articles" : "No articles yet"}</div><p>${q ? "Try a different search." : "Your super admin can add reference articles from the admin panel."}</p></div>`;
    document.getElementById("kb-results").querySelectorAll("[data-kbarticle]").forEach((r) => r.addEventListener("click", () => {
      const a = articles.find((x) => x.id === Number(r.dataset.kbarticle));
      modal(`
        <div class="modal-head">
          <h3>${esc(a.title)}</h3>
          <button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button>
        </div>
        <span class="badge badge-violet" style="margin-bottom:14px;display:inline-block">${esc(a.category)}</span>
        <p style="font-size:14.5px;line-height:1.65;white-space:pre-wrap">${esc(a.body)}</p>
      `, true);
    }));
  };
  paint();
  document.getElementById("kb-search").addEventListener("input", (e) => paint(e.target.value.toLowerCase().trim()));
}

async function viewTemplates() {
  const cats = [
    { key: "glp1", label: "GLP-1 / Weight loss" },
    { key: "peptide", label: "Peptides" },
    { key: "custom", label: "My custom programs" },
  ];
  view().innerHTML = `
  <div class="page-head">
    <div><h1>Program library</h1><div class="sub">Built-in presets plus your own reusable programs</div></div>
    <button class="btn btn-primary" id="tpl-add">${icon("plus", 18)} New template</button>
  </div>
  ${cats.map((c) => {
    const list = S.templates.filter((t) => t.category === c.key);
    return `
    <h2 style="font-size:16px;margin:18px 0 10px;color:var(--brand)">${c.label}</h2>
    ${list.length ? `<div class="tpl-grid">
      ${list.map((t) => `
      <div class="tpl-card" style="cursor:default">
        ${icon(c.key === "custom" ? routeIcon(t.config.route) : routeIcon(t.config.route || (t.config.protocols && t.config.protocols[0] && t.config.protocols[0].route)), 20)}
        <div class="tpl-name">${esc(t.name)}</div>
        <div class="tpl-sub">${c.key === "glp1"
          ? `${esc(t.config.generic || "")} · ${esc(t.config.frequency)} · doses: ${t.config.doses.join(", ")}`
          : c.key === "peptide"
          ? esc((t.config.protocols || []).map((p) => p.protocolType).join(" · "))
          : `${esc(t.config.medication || "")} ${esc(t.config.dose || "")} · ${esc(t.config.frequency || "")}`}</div>
      </div>`).join("")}
    </div>` : `<p class="hint">No templates here yet.</p>`}`;
  }).join("")}`;

  document.getElementById("tpl-add").addEventListener("click", () => {
    const scrim = modal(`
      <div class="modal-head"><h3>New custom template</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
      <div class="form-grid">
        <div class="field"><label for="nt-name">Template name <span class="req">*</span></label><input class="input" id="nt-name" placeholder="e.g. Metformin starter"></div>
        <div class="field"><label for="nt-med">Medication</label><input class="input" id="nt-med"></div>
        <div class="field"><label for="nt-dose">Dose</label><input class="input" id="nt-dose"></div>
        <div class="field"><label for="nt-freq">Frequency</label><select class="input" id="nt-freq">${["daily", "twice daily", "weekly", "twice a week", "every 3 days", "as needed"].map((f) => `<option>${f}</option>`).join("")}</select></div>
        <div class="field"><label for="nt-route">Route</label><select class="input" id="nt-route">${["oral", "injection", "nasal", "topical"].map((r) => `<option>${r}</option>`).join("")}</select></div>
      </div>
      <button class="btn btn-primary btn-block" id="nt-save">Save template</button>`);
    scrim.querySelector("#nt-save").addEventListener("click", async () => {
      const name = scrim.querySelector("#nt-name").value.trim();
      if (!name) return toast("Template name is required", "bad");
      await api("POST", "/api/templates", {
        name, category: "custom",
        config: {
          medication: scrim.querySelector("#nt-med").value || name,
          dose: scrim.querySelector("#nt-dose").value,
          frequency: scrim.querySelector("#nt-freq").value,
          route: scrim.querySelector("#nt-route").value,
        },
      });
      S.templates = await api("GET", "/api/templates");
      scrim.remove();
      toast("Template saved");
      viewTemplates();
    });
  });
}

// ── settings ─────────────────────────────────────────────────────
function viewSettings() {
  view().innerHTML = `
  <div class="page-head"><div><h1>Settings</h1><div class="sub">Account &amp; security</div></div></div>
  <div class="card card-pad" style="max-width:480px">
    <div class="card-title">${icon("key", 19)} Change password</div>
    <form id="pw-form">
      <div class="field"><label for="pw-cur">Current password</label><input class="input" id="pw-cur" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="pw-new">New password</label><input class="input" id="pw-new" type="password" autocomplete="new-password" minlength="8" required><span class="hint">At least 8 characters.</span></div>
      <p class="err-text" id="pw-err" hidden role="alert"></p>
      <button class="btn btn-primary" type="submit">Update password</button>
    </form>
  </div>`;
  document.getElementById("pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("pw-err");
    err.hidden = true;
    try {
      await api("POST", "/api/auth/password", {
        current: document.getElementById("pw-cur").value,
        next: document.getElementById("pw-new").value,
      });
      toast("Password updated");
      e.target.reset();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

boot();
