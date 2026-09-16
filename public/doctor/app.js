// Doctor dashboard SPA
"use strict";

const S = {
  user: null,
  templates: [],
  presets: null,
  protocols: {},  // medication → guidebook presentations, each with its dosing variants
  patients: [],
  wizard: null,
  detailTab: "overview",
  teamOrgId: null,   // platform owner viewing another organisation's team
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
  const [templates, presets, protocols] = await Promise.all([
    api("GET", "/api/templates"),
    api("GET", "/api/presets"),
    api("GET", "/api/clinical/protocols").catch(() => ({ byMedication: {} })),
  ]);
  S.templates = templates;
  S.presets = presets;
  S.protocols = protocols.byMedication || {};
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
// `rx: true` marks a page that prescribes or changes a patient's treatment.
// An admin account sees the practice — patients, programs, guides, history —
// but never these, and the server refuses them regardless (requireClinician).
const NAV = [
  { hash: "#/dashboard", label: "Dashboard", ico: "grid" },
  { hash: "#/consult", label: "New consultation", ico: "plus", rx: true },
  { hash: "#/drafts", label: "Drafts", ico: "clock", rx: true },
  { hash: "#/patients", label: "Patients", ico: "users" },
  { hash: "#/activity", label: "Recent activity", ico: "activity" },
  { hash: "#/messages", label: "Messages", ico: "message" },
  { hash: "#/templates", label: "Program library", ico: "layers" },
  { hash: "#/kb", label: "Knowledge Base", ico: "book" },
  { hash: "#/team", label: "Team", ico: "users", su: true },
  { hash: "#/orgs", label: "Organisations", ico: "shield", pa: true },
  { hash: "#/settings", label: "Settings", ico: "settings" },
];

// Can the signed-in user prescribe? Mirrors requireClinician on the server —
// the UI hides what the API would refuse, rather than offering dead buttons.
function canPrescribe() {
  return !!S.user && (S.user.role === "doctor" || S.user.role === "superadmin");
}
function isSuperadmin() {
  return !!S.user && S.user.role === "superadmin";
}
// The platform owner set the app up: only they create organisations.
function isPlatformAdmin() {
  return !!S.user && !!S.user.platformAdmin;
}
function navForUser() {
  return NAV.filter((n) => (!n.rx || canPrescribe()) && (!n.su || isSuperadmin()) && (!n.pa || isPlatformAdmin()));
}

function renderShell() {
  document.title = "Doctor Dashboard — DoCare";
  app.innerHTML = `
  <div class="mobile-bar">
    <div class="brand-line"><img src="/brand/docare-gold-sm.png" alt="DoCare" style="height:30px;width:auto"></div>
    <button class="icon-btn" style="color:#fff" id="m-logout" aria-label="Sign out">${icon("logout", 20)}</button>
  </div>
  <nav class="m-nav" id="m-nav">
    ${navForUser().map((n) => `<a href="${n.hash}">${esc(n.label)}</a>`).join("")}
  </nav>
  <div class="shell">
    <aside class="sidebar">
      <div class="sb-brand" style="flex-direction:column;align-items:flex-start;gap:7px">
        <img src="/brand/docare-gold-sm.png" alt="DoCare" style="height:56px;width:auto">
        <div class="sb-sub">${esc(S.user.orgName || "Doctor dashboard")}</div>
      </div>
      <nav class="sb-nav" id="sb-nav">
        ${navForUser().map((n) => `<a class="sb-link" href="${n.hash}">${icon(n.ico, 19)} ${esc(n.label)}</a>`).join("")}
      </nav>
      <div class="sb-user">
        <div class="avatar">${esc(initials(S.user.name))}</div>
        <div><div class="sb-user-name">${esc(S.user.name)}</div><div class="sb-user-role">${esc(ROLE_LABEL[S.user.role] || S.user.role)}</div></div>
        <button class="icon-btn" id="sb-logout" aria-label="Sign out">${icon("logout", 19)}</button>
      </div>
    </aside>
    <main class="main" id="view"></main>
  </div>`;
  const logout = async () => { await api("POST", "/api/auth/logout"); location.hash = ""; S.user = null; renderLogin(); };
  document.getElementById("sb-logout").addEventListener("click", logout);
  document.getElementById("m-logout").addEventListener("click", logout);
  // Delegated so it keeps working across every wizard step repaint — wizHead()
  // (and its "Save for later" button) is re-rendered on every step change,
  // but #view itself is never replaced.
  document.getElementById("view").addEventListener("click", (e) => {
    if (e.target.closest("#wz-savelater")) saveDraftForLater();
  });
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
  if (h.startsWith("#/consult")) return canPrescribe() ? viewConsult() : viewNoAccess("New consultation");
  if (h.startsWith("#/drafts")) return canPrescribe() ? viewDrafts() : viewNoAccess("Drafts");
  if (h.startsWith("#/team")) return isSuperadmin() ? viewTeam() : viewNoAccess("Team");
  if (h.startsWith("#/orgs")) { S.teamOrgId = null; return isPlatformAdmin() ? viewOrgs() : viewNoAccess("Organisations"); }
  const pm = h.match(/^#\/plan\/(\d+)/);
  if (pm) return canPrescribe() ? viewEditPlan(Number(pm[1])) : viewNoAccess("Edit program");
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
    ${canPrescribe() ? `<a class="btn btn-primary" href="#/consult">${icon("plus", 18)} New consultation</a>` : ""}
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
    ${canPrescribe() ? `<a class="btn btn-primary" href="#/consult">${icon("plus", 18)} New consultation</a>` : ""}
  </div>
  <div class="field" style="max-width:420px">
    <label for="pt-search" style="position:absolute;left:-9999px">Search patients</label>
    <input class="input" id="pt-search" type="search" placeholder="Search by name or mobile…">
  </div>
  <div class="card" id="pt-list"></div>`;
  const CAP = 60;
  const paint = (q = "") => {
    const all = S.patients.filter((p) =>
      !q || p.name.toLowerCase().includes(q) || String(p.mobile).includes(q.replace(/\D/g, "") || " "));
    // With hundreds of records, render a capped slice unless searching, so the
    // page stays snappy — the search box reaches every patient.
    const list = q ? all : all.slice(0, CAP);
    const moreNote = !q && all.length > CAP
      ? `<div class="hint" style="padding:12px 16px">${icon("search", 13)} Showing ${CAP} of ${all.length} patients — search by name or mobile to find any record.</div>`
      : "";
    document.getElementById("pt-list").innerHTML = (list.length ? list.map((p) => `
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
      </a>`).join("") : `<div class="empty">${icon("users", 34)}<div class="empty-title">No patients found</div><p>${q ? "Try a different name or mobile number." : "Start a new consultation to register your first patient."}</p></div>`) + moreNote;
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
  const latestWeight = weights.length ? weights[weights.length - 1].y : (p.current_weight_kg || p.start_weight_kg);
  const bmi = calcBMIClient(p.height_cm, latestWeight);
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
      ${canPrescribe() ? `
      <button class="btn btn-secondary btn-sm" id="btn-share">${icon("key", 16)} Share access</button>
      <a class="btn btn-primary btn-sm" href="#/consult?patient=${p.id}">${icon("plus", 16)} New program</a>` : ""}
    </div>
  </div>

  <div class="metric-strip">
    <div class="metric"><b>${latestWeight ? latestWeight + " kg" : "—"}</b>Current weight</div>
    <div class="metric"><b style="color:${wtChange != null && wtChange < 0 ? "var(--accent)" : "inherit"}">${wtChange != null ? (wtChange > 0 ? "+" : "") + wtChange.toFixed(1) + " kg" : "—"}</b>Change</div>
    <div class="metric"><b>${bmi ?? "—"}</b>BMI ${bmi ? "· " + bmiCategoryClient(bmi) : ""}</div>
    ${p.max_weight_kg ? `<div class="metric"><b>${p.max_weight_kg} kg</b>Max weight</div>` : ""}
    ${p.goal_weight_kg ? `<div class="metric"><b>${p.goal_weight_kg} kg</b>Goal weight</div>` : ""}
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

  const shareBtn = document.getElementById("btn-share");
  if (shareBtn) shareBtn.addEventListener("click", () => sharePinModal(p));

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
              <div><span class="emr-lbl">Weight</span><span class="emr-val">${latestWeight ? esc(latestWeight) + " kg" : "—"}</span></div>
              <div><span class="emr-lbl">BMI</span><span class="emr-val">${bmi ?? "—"}${bmi ? " · " + esc(bmiCategoryClient(bmi)) : ""}</span></div>
              ${p.start_weight_kg ? `<div><span class="emr-lbl">Starting weight</span><span class="emr-val">${esc(p.start_weight_kg)} kg</span></div>` : ""}
              ${p.max_weight_kg ? `<div><span class="emr-lbl">Maximum weight reached</span><span class="emr-val">${esc(p.max_weight_kg)} kg</span></div>` : ""}
              ${p.goal_weight_kg ? `<div><span class="emr-lbl">Goal weight</span><span class="emr-val">${esc(p.goal_weight_kg)} kg</span></div>` : ""}
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
              <button class="btn btn-secondary btn-sm" id="rec-copy" type="button">${icon("copy", 15)} Copy record</button>
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
                <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
                  <button class="btn btn-ghost btn-sm" data-open-guide="${pl.id}">${icon("book", 15)} Guide</button>
                  ${canPrescribe() ? `
                  <a class="btn btn-secondary btn-sm" href="#/plan/${pl.id}">${icon("edit", 15)} Edit program</a>
                  ${pl.status === "active" ? `
                  <button class="btn btn-ghost btn-sm" data-edit-dose="${pl.id}">Dose</button>
                  <button class="btn btn-ghost btn-sm" data-stop="${pl.id}">Stop</button>` : ""}` : ""}
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
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <button class="btn btn-secondary btn-sm" id="btn-copytext">${icon("copy", 16)} Copy guide text</button>
          <button class="btn btn-secondary btn-sm" id="btn-print">${icon("printer", 16)} Print / PDF</button>
          <button class="btn btn-accent btn-sm" id="btn-wa">${icon("whatsapp", 16)} Send via WhatsApp</button>
        </div>
        ${guidePickerHTML(guidePlans, activeId)}
        <div id="g-active-guide">${renderOne(guidePlans.find((pl) => pl.id === activeId))}</div>`
        : `<div class="empty">${icon("file", 34)}<div class="empty-title">No guide yet</div><p>Publish a program from a consultation and the patient guide will appear here.</p></div>`;
      if (guidePlans.length) {
        wireGuidePicker(box, guidePlans, renderOne, activeId);
        box.querySelectorAll("[data-gpick]").forEach((b) => b.addEventListener("click", () => { S.guidePlanId = Number(b.dataset.gpick); }));
        document.getElementById("btn-copytext").addEventListener("click", async () => {
          // Every active program in one consolidated letter — not just the
          // medication currently on screen — so a patient on two peptides
          // never gets two separate, repetitive full guides copied one after
          // another.
          await navigator.clipboard.writeText(buildComboGuideText(guidePlans, p, S.user.name));
          toast("Guide text copied");
        });
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
              <div class="msg-time">${m.sender === "doctor" && m.senderName ? esc(m.senderName) + " · " : ""}${timeAgo(m.created_at)}</div>
            </div>`).join("") : `<div class="empty">${icon("message", 30)}<p>No messages yet. Send the first note below.</p></div>`}
        </div>
        ${canPrescribe() ? `
        <form id="msg-form" style="display:flex;gap:8px;margin-top:14px">
          <label for="msg-input" style="position:absolute;left:-9999px">Message</label>
          <input class="input" id="msg-input" placeholder="Write a note to the patient…" autocomplete="off">
          <button class="btn btn-primary" type="submit" aria-label="Send">${icon("send", 18)}</button>
        </form>` : `<p class="hint" style="margin-top:14px">${icon("shield", 14)} Your account can read this conversation but not reply.</p>`}
      </div>`;
      const list = document.getElementById("msg-list");
      list.scrollTop = list.scrollHeight;
      const msgForm = document.getElementById("msg-form");
      if (msgForm) msgForm.addEventListener("submit", async (e) => {
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
  if (activityDetailSummary(intake.activity_detail)) rows.push(`<div><b>Exercise:</b> ${esc(activityDetailSummary(intake.activity_detail))}</div>`);
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
const WIZ_STEPS = ["Intake", "Program", "Labs & Supplements", "Clinical", "Review & publish"];

// A blank "program in progress" — the Program step builds one of these at a
// time, then "+ Add to program" pushes a copy into S.wizard.cart so a single
// consultation can prescribe several medications (e.g. a GLP-1 + a peptide).
function freshDraft(category) {
  return {
    category, template: null, protocol: null, protocolBase: null, protocolKey: null, customizing: false,
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
    draftId: null,          // set once this consultation has been "saved for later"
    patient: { name: "", mobile: "", email: "", nationalId: "", title: "", age: "", gender: "", heightCm: "",
      weightKg: "", startWeightKg: "", maxWeightKg: "", goalWeightKg: "", goalWeightCustomized: false,
      activityLevel: "Sedentary", chronicIllnesses: "", medications: "", allergies: "", intake: {} },
    cart: [],              // programs added so far this consultation (one entry per medication)
    draft: freshDraft("glp1"), // the program currently being configured on the Program step
    followupDays: 28, clinicalNote: "", supplements: "",
    labTests: [],          // chosen lab tests (structured) — shown in the guide
    suppList: [],          // chosen supplements (structured) — shown in the guide
    labsAnalyzed: false,   // whether the AI analysis has been auto-run for the current cart
    diet: {},              // shared metabolic targets — only relevant while a glp1 program is in the cart
    clinicalSuggestion: "",
    emrCustomized: false,  // doctor has hand-edited the EMR text — stop overwriting it from field changes
  };
  if (location.hash.includes("draft=")) {
    const draftId = Number((location.hash.match(/draft=(\d+)/) || [])[1]);
    if (draftId) return void resumeDraft(draftId);
  }
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
    heightCm: p.height_cm || "", weightKg: p.last_weight || p.current_weight_kg || p.start_weight_kg || "",
    startWeightKg: p.start_weight_kg || "", maxWeightKg: p.max_weight_kg || "",
    goalWeightKg: p.goal_weight_kg || "", goalWeightCustomized: p.goal_weight_kg != null,
    intake: p.intake_json ? JSON.parse(p.intake_json) : {},
  });
}

// A goal weight suggestion — the weight for a BMI of 25 at this patient's
// height — offered as a starting point, never forced: the doctor can
// overwrite or clear it, and once they do it stops being auto-recomputed.
function suggestGoalWeightKg(heightCm) {
  const h = Number(heightCm);
  if (!h) return null;
  return Math.round(25 * (h / 100) ** 2 * 10) / 10;
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
  <div class="page-head">
    <div><h1>New consultation</h1><div class="sub">Consult → build program → publish guide</div></div>
    <button class="btn btn-secondary btn-sm" id="wz-savelater" type="button">${icon("clock", 16)} Save for later</button>
  </div>
  <div class="steps">
    ${WIZ_STEPS.map((s, i) => `<div class="step-dot ${i < S.wizard.step ? "done" : ""} ${i === S.wizard.step ? "on" : ""}"><div class="step-bar"></div><div class="step-lbl">${i + 1}. ${s}</div></div>`).join("")}
  </div>`;
}

// A consultation that can't be finished in one sitting is saved as an
// incomplete draft — nothing here touches the real patients/plans tables.
// Available on every wizard step (wired once via delegation on #view, since
// wizHead() is re-rendered on every step change).
async function saveDraftForLater() {
  const w = S.wizard;
  if (!w) return;
  const label = w.patient.name || w.patient.mobile || "Untitled consultation";
  try {
    if (w.draftId) await api("PUT", `/api/drafts/${w.draftId}`, { label, state: w });
    else { const created = await api("POST", "/api/drafts", { label, state: w }); w.draftId = created.id; }
    toast("Saved — resume anytime from Drafts");
  } catch (ex) {
    toast(ex.message || "Could not save draft", "bad");
  }
}

async function resumeDraft(draftId) {
  view().innerHTML = `<div class="skel" style="height:340px"></div>`;
  try {
    const { state } = await api("GET", `/api/drafts/${draftId}`);
    S.wizard = state;
    S.wizard.draftId = draftId;
    paintWizard();
  } catch (ex) {
    view().innerHTML = `<div class="empty">${icon("alert", 32)}<div class="empty-title">${esc(ex.message || "Draft not found")}</div></div>`;
  }
}

// ── incomplete consultations list ─────────────────────────────────
async function viewDrafts() {
  view().innerHTML = `<div class="skel" style="height:200px"></div>`;
  const drafts = await api("GET", "/api/drafts");
  view().innerHTML = `
  <div class="page-head"><div><h1>Drafts</h1><div class="sub">Consultations saved for later — pick one up where you left off</div></div></div>
  ${drafts.length ? `<div class="card">
    ${drafts.map((d) => `
      <div class="pt-row" data-draft="${d.id}">
        <div class="pt-info">
          <div class="pt-name">${esc(d.label || "Untitled consultation")}</div>
          <div class="pt-meta">Saved ${timeAgo(d.updated_at)}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" data-resume="${d.id}">${icon("chevR", 15)} Resume</button>
          <button class="icon-btn" data-discard="${d.id}" aria-label="Discard draft">${icon("x", 16)}</button>
        </div>
      </div>`).join("")}
  </div>` : `<div class="empty">${icon("clock", 34)}<div class="empty-title">No drafts</div><p>Consultations saved for later will show up here.</p></div>`}`;
  view().querySelectorAll("[data-resume]").forEach((b) => b.addEventListener("click", () => { location.hash = `#/consult?draft=${b.dataset.resume}`; }));
  view().querySelectorAll("[data-discard]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Discard this saved consultation? This can't be undone.")) return;
    await api("DELETE", `/api/drafts/${b.dataset.discard}`);
    viewDrafts();
  }));
}

function paintWizard() {
  const w = S.wizard;
  if (w.step === 0) return wizStepIntake();
  if (w.step === 1) return wizStepProgram();
  if (w.step === 2) return wizStepLabs();
  if (w.step === 3) return wizStepClinical();
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
function parseIntakeText(text, opts) {
  const t = String(text || "").trim();
  const out = {};
  if (!t) return out;
  // A pasted note often ends with the sender's own sign-off ("— Dr Sami")
  // or opens with a clinic/referrer name — reject those as name candidates
  // so the doctor's own name doesn't get filled in as the patient's.
  // Normalised the same way on both sides — letters and spaces only,
  // lowercased — so "Dr. Sami" (the stored name, title-cased with a
  // period) matches a candidate "Dr Sami" (title-stripped, no period)
  // rather than silently failing to exclude it.
  const bareName = (x) => String(x).replace(/[^\p{L}\s]/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
  const excludeNames = new Set(((opts && opts.excludeNames) || []).map(bareName).filter(Boolean));
  // Individual words of an excluded name ("dr sami" → "dr", "sami") — tier 4
  // below only ever proposes a single bare word, so the full-string check
  // above can't catch it there; "Sami" alone has to be excluded too, or a
  // sign-off ending in just the doctor's first name slips through as if it
  // were the patient's.
  const excludeParts = new Set([...excludeNames].flatMap((n) => n.split(" ").filter((w) => w.length >= 2)));

  const emailMatch = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  if (emailMatch) out.email = emailMatch[0];

  // Mobile — prefer a labelled number, else the longest 7–15 digit run.
  const mobLabel = t.match(/(?:mobile|phone|contact|tel|whatsapp|cell|number|no\.?)\s*[:#-]?\s*(\+?[\d][\d\s().-]{5,18}\d)/i);
  const mobRaw = mobLabel ? mobLabel[1] : (t.match(/(\+?\d[\d\s().-]{6,18}\d)/) || [])[0];
  if (mobRaw) {
    const digits = mobRaw.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) out.mobile = digits;
  }

  const segsAll = t.split(/[\n,;|]+/).map((s) => s.trim()).filter(Boolean);

  // Age — labelled ("age: 35"), suffixed ("35y/35yo/35 years"), "35F/35 M",
  // "45, male", or a bare number segment (1–110).
  const ageMatch = t.match(/\bage\s*[:#-]?\s*(\d{1,3})\b/i)
    || t.match(/\b(\d{1,3})\s*(?:y\.?o\.?|yrs?|years?|y)\b/i)
    || t.match(/\b(\d{1,3})\s*[/,-]?\s*(?:male|female|[mf])\b/i);
  if (ageMatch && Number(ageMatch[1]) > 0 && Number(ageMatch[1]) <= 120) out.age = ageMatch[1];
  if (!out.age) {
    const bare = segsAll.find((s) => /^\d{1,3}$/.test(s) && Number(s) >= 1 && Number(s) <= 110);
    if (bare) out.age = bare;
  }

  // Gender — words, a lone M/F segment, an age-adjacent M/F, or a leading
  // slash-shorthand token ("M/35/95kg/180cm").
  const lone = segsAll.map((s) => s.toLowerCase());
  if (/\bfemale\b/i.test(t) || lone.includes("f")) out.gender = "Female";
  else if (/\bmale\b/i.test(t) || lone.includes("m")) out.gender = "Male";
  else if (/\d\s*[/,-]?\s*f\b/i.test(t)) out.gender = "Female";
  else if (/\d\s*[/,-]?\s*m\b/i.test(t)) out.gender = "Male";
  else if (/^\s*f\s*\//i.test(t)) out.gender = "Female";
  else if (/^\s*m\s*\//i.test(t)) out.gender = "Male";

  const hMatch = t.match(/(?:height|ht)\s*[:#-]?\s*(\d{2,3}(?:\.\d+)?)/i) || t.match(/\b(\d{2,3}(?:\.\d+)?)\s*cm\b/i);
  if (hMatch) out.heightCm = hMatch[1];

  const wKgMatch = t.match(/(?:weight|wt)\s*[:#-]?\s*(\d{2,3}(?:\.\d+)?)\s*kgs?\b/i) || t.match(/\b(\d{2,3}(?:\.\d+)?)\s*kgs?\b/i);
  const wLbsMatch = t.match(/(?:weight|wt)\s*[:#-]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i) || t.match(/\b(\d{2,3}(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i);
  if (wKgMatch) {
    out.weightKg = wKgMatch[1];
  } else if (wLbsMatch) {
    out.weightKg = String(Math.round(Number(wLbsMatch[1]) * 0.453592 * 10) / 10);
  } else {
    const wBareMatch = t.match(/(?:weight|wt)\s*[:#-]?\s*(\d{2,3}(?:\.\d+)?)\b/i);
    if (wBareMatch) out.weightKg = wBareMatch[1];
  }

  const eidMatch = t.match(/(?:emirates\s*id|eid|national\s*id|passport)\s*(?:no\.?|number|#)?\s*[:#-]?\s*([\dA-Z-]{6,20})/i);
  if (eidMatch) out.nationalId = eidMatch[1].trim();

  // ── Name ─────────────────────────────────────────────────────────
  // Tokens that must never be treated as (part of) a name.
  const TITLES = /^(mr|mrs|ms|miss|dr|prof|sheikh|sheikha|mister|madam)\.?$/i;
  const STOP = new Set(["male", "female", "patient", "name", "mobile", "phone", "contact", "tel",
    "age", "years", "year", "yrs", "yo", "kg", "kgs", "cm", "height", "weight", "gender", "sex",
    "diabetic", "diabetes", "hypertension", "hypertensive", "asthma", "thyroid", "allergy", "allergic",
    "allergies", "none", "nil", "email", "whatsapp", "dob", "eid", "id", "the", "is", "a", "an", "old",
    "he", "she", "his", "her", "with", "and", "history", "wants", "for", "weightloss", "peptide",
    "hello", "hi", "hey", "dear", "my", "im", "named", "called", "booking", "book", "new", "am", "i",
    "wt", "ht", "yr", "obesity", "obese", "pcos", "pcod",
    "needs", "need", "wants", "want", "requesting", "request", "please", "taking", "on", "of", "to",
    "medication", "med", "meds", "mounjaro", "wegovy", "ozempic", "rybelsus", "saxenda", "zepbound",
    "glp", "glp1", "peptides", "bpc", "semaglutide", "tirzepatide",
    "lbs", "lb", "pounds", "pound", "referral", "consult", "consultation", "review", "checkup",
    "regards", "thanks", "thank", "sincerely", "best", "cheers", "yours", "kindly", "warmly",
    "respectfully", "greetings", "follow", "up", "needed", "notes", "prepared", "discussed"]);
  const looksLikeName = (seg, strict = true) => {
    const words = seg.trim().replace(/[.,]+$/, "").split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 5) return null;
    const kept = [];
    for (const w0 of words) {
      if (/\d/.test(w0)) return null;                        // any digit in this token → not a clean name
      const w = w0.replace(/[^\p{L}'-]/gu, "");
      if (!w) return null;                                   // nothing alphabetic left → not a clean name
      if (TITLES.test(w)) { kept.push(w0.replace(/[^\p{L}]/gu, "")); continue; }
      if (STOP.has(w.toLowerCase())) return null;            // a keyword → this segment isn't the name
      if (w.length < 2) return null;
      if (strict && !/^[A-Z]/.test(w)) return null;          // an inferred candidate must be capitalised word for word
      kept.push(w0);
    }
    if (!kept.length) return null;
    const full = kept.join(" ");
    if (excludeNames.has(bareName(full))) return null;
    return full;
  };

  // 1) Explicit label wins: "Name: X" / "Patient: X" / "name is X" / "named X".
  const nameLabel = t.match(/(?:patient\s*name|patient|name)\s*[:#-]\s*([^\n,;|]+)/i)
    || t.match(/\b(?:name\s+is|named|called|patient\s+is)\s+([A-Za-z][\p{L}'’.\s-]{1,40})/iu);
  if (nameLabel) {
    const cand = looksLikeName(nameLabel[1], false);
    if (cand) out.name = cand;
  }
  // 2) Otherwise scan comma / newline / pipe segments for the first name-like one.
  if (!out.name) {
    const segs = t.split(/[\n,;|]+/).map((s) => s.trim()).filter(Boolean);
    for (const s of segs) {
      if (s.includes("@")) continue;
      const cand = looksLikeName(s);
      if (cand) { out.name = cand; break; }
    }
  }
  // 3) A run of 2–4 consecutive capitalised words, anywhere in the text —
  //    tries every such run in order (not just the first), since a real
  //    name often sits after a greeting or an explanatory clause that has
  //    its own capitalised words ("Hi Dr Sami, ... her father Khalid
  //    Rahman, 62 years old...": the first run is the greeting, and would
  //    wrongly stop the search here without trying the rest of the text).
  if (!out.name) {
    const capRuns = t.match(/\b[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){1,3}\b/g) || [];
    for (const run of capRuns) {
      const cand = looksLikeName(run);
      if (cand) { out.name = cand; break; }
    }
  }
  // 4) Last resort — the first standalone word that isn't a keyword/unit/title
  //    (catches a lone first name like "Meera 20 female"). Only for short,
  //    bare inputs — see note above.
  if (!out.name && t.split(/\s+/).length <= 6) {
    for (const word of t.split(/[\s,;|\n]+/)) {
      const w = word.replace(/[^\p{L}'-]/gu, "");
      if (w.length >= 2 && w.length <= 20 && !/\d/.test(word) && !TITLES.test(w) && !STOP.has(w.toLowerCase()) && /^[A-Za-z]/.test(w) && !excludeParts.has(w.toLowerCase())) {
        out.name = w.charAt(0).toUpperCase() + w.slice(1);
        break;
      }
    }
  }
  // Split a leading title off the name into its own field.
  if (out.name) {
    const parts = out.name.split(/\s+/);
    if (parts.length > 1 && TITLES.test(parts[0])) {
      out.title = parts[0].replace(/\./g, "");
      out.name = parts.slice(1).join(" ");
    }
  }

  const condKeywords = [
    [/diabet/i, "Diabetes"], [/hypertens|high blood pressure|htn\b/i, "Hypertension"],
    [/thyroid/i, "Thyroid disorder"], [/asthma/i, "Asthma"], [/cholesterol|dyslipid/i, "High cholesterol"],
    [/pcos|pcod/i, "PCOS"], [/fatty liver|nafld/i, "Fatty liver"],
  ];
  const foundConditions = condKeywords.filter(([re]) => re.test(t)).map(([, label]) => label);
  if (foundConditions.length) out.conditionsNote = foundConditions.join(", ");

  const allergyMatch = t.match(/allerg(?:y|ic)\s*(?:to|:)?\s*([a-zA-Z ,]+)?/i);
  if (allergyMatch) out.allergyNote = (allergyMatch[1] || "").trim().replace(/,\s*$/, "") || "mentioned — confirm details";

  return out;
}

// Tries the AI-assisted extractor first — it handles messy real-world
// pasted text far better than a regex ever will (a name buried after a
// clinic sign-off, weight given in lbs, a positional list with no units at
// all). Falls back to the local parser when the server route isn't
// configured (no ANTHROPIC_API_KEY) or the request fails for any reason,
// so quick fill always produces a result — just a better one when AI is
// available.
async function quickFillParse(text) {
  try {
    const res = await api("POST", "/api/intake/quickfill", { text });
    return { fields: res.fields || {}, source: "ai" };
  } catch {
    return { fields: parseIntakeText(text, { excludeNames: [S.user.name] }), source: "local" };
  }
}

// Applies an already-parsed quick-fill result (from either the AI route or
// the local parser — same shape either way) onto the wizard patient/intake
// state. Returns a list of human-readable labels for what changed, for a
// toast.
function applyQuickFillFields(r) {
  const w = S.wizard, changed = [];
  if (r.name) { w.patient.name = r.name; changed.push("name"); }
  if (r.title) { w.patient.title = r.title; }
  if (r.nationalId) { w.patient.nationalId = r.nationalId; changed.push("ID"); }
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

// ── activity detail (cardio/resistance) — optional, only offered once the
// patient is more active than sedentary ────────────────────────────────
function activityDetailSummary(d) {
  if (!d) return "";
  const bits = [];
  if (d.cardioType) bits.push(`Cardio: ${d.cardioType}${d.cardioSessions ? ` × ${d.cardioSessions}/wk` : ""}`);
  if (d.resistanceType) bits.push(`Resistance: ${d.resistanceType}${d.resistanceSessions ? ` × ${d.resistanceSessions}/wk` : ""}`);
  return bits.join(" · ");
}

function activityDetailModal(current, onSave) {
  const d = current || {};
  const scrim = modal(`
    <div class="modal-head"><h3>Exercise details</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <p class="hint" style="margin:-6px 0 14px">Optional — only what the patient can tell you.</p>
    <div class="form-grid">
      <div class="field full"><label for="ad-cardio">Cardio type</label><input class="input" id="ad-cardio" value="${esc(d.cardioType || "")}" placeholder="e.g. Running, cycling, swimming"></div>
      <div class="field"><label for="ad-cardio-n">Cardio sessions per week</label><input class="input" id="ad-cardio-n" type="number" min="0" max="14" value="${esc(d.cardioSessions || "")}"></div>
      <div class="field full"><label for="ad-resist">Resistance training type</label><input class="input" id="ad-resist" value="${esc(d.resistanceType || "")}" placeholder="e.g. Weights, bodyweight, bands"></div>
      <div class="field"><label for="ad-resist-n">Resistance sessions per week</label><input class="input" id="ad-resist-n" type="number" min="0" max="14" value="${esc(d.resistanceSessions || "")}"></div>
    </div>
    <button class="btn btn-primary btn-block" id="ad-save">Save</button>`);
  scrim.querySelector("#ad-save").addEventListener("click", () => {
    onSave({
      cardioType: scrim.querySelector("#ad-cardio").value.trim(),
      cardioSessions: scrim.querySelector("#ad-cardio-n").value.trim(),
      resistanceType: scrim.querySelector("#ad-resist").value.trim(),
      resistanceSessions: scrim.querySelector("#ad-resist-n").value.trim(),
    });
    scrim.remove();
  });
}

// ── missed-appointment quick message — for a patient who isn't present ──
function missedAppointmentText(patient, doctorName) {
  const name = `${patient.title ? patient.title + " " : ""}${patient.name || "there"}`;
  return `Hello ${name}, we noticed you weren't able to make it to your appointment with ${doctorName} today. No worries — let's find a time that works better for you.\n\nJust reply here or message us to reschedule, and we'll get you booked in.\n\n— ${doctorName}`;
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
    <div class="field full" style="margin-top:-8px">
      <button type="button" class="btn btn-ghost btn-sm" id="wz-missed-appt">${icon("whatsapp", 15)} Send missed-appointment message</button>
      <span class="hint">If ${esc(w.patient.name || "this patient")} isn't present, send a quick WhatsApp to reschedule — no need to continue this consultation.</span>
    </div>

    <div class="qf-box">
      <label>${icon("sparkle", 15)} Quick fill — paste patient details</label>
      <div style="display:flex;gap:8px">
        <input class="input" id="qf-input" placeholder="Ahmed Ali, 0501234567, 35y Male, 180cm, 95kg, diabetic...">
        <button class="btn btn-secondary" id="qf-parse" type="button"><span class="spin"></span><span class="btn-label">Parse</span></button>
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
      <div class="field">
        <label for="wp-height">Height (cm) <span class="req">*</span></label>
        <input class="input" id="wp-height" type="number" inputmode="decimal" min="100" max="250" value="${esc(w.patient.heightCm)}">
        <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
          <span class="hint">or</span>
          <input class="input" id="wp-height-ft" type="number" inputmode="numeric" min="3" max="8" placeholder="ft" style="width:64px" aria-label="Height, feet">
          <input class="input" id="wp-height-in" type="number" inputmode="decimal" min="0" max="11.9" step="0.1" placeholder="in" style="width:64px" aria-label="Height, inches">
          <span class="hint">ft / in</span>
        </div>
      </div>
      <div class="field">
        <label for="wp-weight">Weight (kg) <span class="req">*</span></label>
        <input class="input" id="wp-weight" type="number" inputmode="decimal" min="25" max="350" step="0.1" value="${esc(w.patient.weightKg)}">
        <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
          <span class="hint">or</span>
          <input class="input" id="wp-weight-lbs" type="number" inputmode="decimal" min="55" max="770" step="0.1" placeholder="lbs" style="width:80px" aria-label="Weight, pounds">
          <span class="hint">lbs</span>
        </div>
      </div>
      <div class="field"><label for="wp-startweight">Starting weight (kg) <span class="hint" style="font-weight:400">optional</span></label><input class="input" id="wp-startweight" type="number" inputmode="decimal" min="25" max="350" step="0.1" value="${esc(w.patient.startWeightKg)}" placeholder="Weight when treatment began"></div>
      <div class="field"><label for="wp-maxweight">Maximum weight reached (kg) <span class="hint" style="font-weight:400">optional</span></label><input class="input" id="wp-maxweight" type="number" inputmode="decimal" min="25" max="350" step="0.1" value="${esc(w.patient.maxWeightKg)}"></div>
      <div class="field">
        <label for="wp-goalweight">Goal weight (kg) <span class="hint" style="font-weight:400">optional</span></label>
        <input class="input" id="wp-goalweight" type="number" inputmode="decimal" min="25" max="350" step="0.1" value="${esc(w.patient.goalWeightKg)}">
        <span class="hint">Suggested for a target BMI of 25 — adjust or clear as needed.</span>
      </div>
      <div class="field full">
        <label>Activity level</label>
        <div class="chip-row">${Object.keys(S.presets.activityLevels || {}).map((a) => `<button type="button" class="chip ${w.patient.activityLevel === a ? "on" : ""}" data-demochip="activityLevel" data-v="${a}">${a}</button>`).join("")}</div>
        ${w.patient.activityLevel && w.patient.activityLevel !== "Sedentary" ? `
        <div style="margin-top:8px">
          <button type="button" class="btn btn-ghost btn-sm" id="wp-activity-detail">${icon("activity", 15)} ${activityDetailSummary(w.patient.intake.activity_detail) ? "Edit exercise details" : "Add exercise details (optional)"}</button>
          ${activityDetailSummary(w.patient.intake.activity_detail) ? `<div class="hint" style="margin-top:4px">${esc(activityDetailSummary(w.patient.intake.activity_detail))}</div>` : ""}
        </div>` : ""}
      </div>
      <div class="field full"><label>Body shape</label><div class="chip-row">${(S.presets.bodyShapes || []).map((b) => `<button type="button" class="chip ${w.patient.intake.body_shape === b ? "on" : ""}" data-demochip="intake.body_shape" data-v="${b}">${b}</button>`).join("")}</div></div>
    </div>
    <div id="wz-metrics">${patientSummaryHTML(false)}</div>
  `, wizSidePanel());
  wireNotesPanel(view());

  const demoTextIds = { name: "wp-name", mobile: "wp-mobile", email: "wp-email", nationalId: "wp-natid", age: "wp-age", heightCm: "wp-height", weightKg: "wp-weight", startWeightKg: "wp-startweight", maxWeightKg: "wp-maxweight" };
  const commitDemo = () => {
    Object.entries(demoTextIds).forEach(([k, id]) => { w.patient[k] = document.getElementById(id).value; });
  };
  const liveMetrics = () => {
    commitDemo();
    document.getElementById("wz-metrics").innerHTML = patientSummaryHTML(false);
    // A fresh height suggests a goal weight (BMI 25) — but only until the
    // doctor has typed into that field themselves.
    if (!w.patient.goalWeightCustomized) {
      const suggested = suggestGoalWeightKg(w.patient.heightCm);
      w.patient.goalWeightKg = suggested ?? "";
      document.getElementById("wp-goalweight").value = w.patient.goalWeightKg;
    }
  };
  Object.values(demoTextIds).forEach((id) => document.getElementById(id).addEventListener("input", liveMetrics));
  document.getElementById("wp-goalweight").addEventListener("input", (e) => {
    w.patient.goalWeightKg = e.target.value;
    w.patient.goalWeightCustomized = true;
  });

  const activityDetailBtn = document.getElementById("wp-activity-detail");
  if (activityDetailBtn) activityDetailBtn.addEventListener("click", () => {
    commitDemo();
    activityDetailModal(w.patient.intake.activity_detail, (detail) => {
      w.patient.intake.activity_detail = detail;
      wizIntakeIdentity();
    });
  });

  const missedApptBtn = document.getElementById("wz-missed-appt");
  if (missedApptBtn) missedApptBtn.addEventListener("click", () => {
    commitDemo();
    if (!w.patient.mobile.trim()) return toast("Add a mobile number first", "bad");
    window.open(waLink(w.patient.mobile, missedAppointmentText(w.patient, S.user.name)), "_blank");
  });

  // Height/weight can be typed in whichever unit the doctor has in front of
  // them (a US-format referral in lbs, a patient who knows their height in
  // feet) — the cm/kg fields above stay the values actually collected.
  wireUnitHelper(document.getElementById("wp-height"),
    [document.getElementById("wp-height-ft"), document.getElementById("wp-height-in")],
    (cm) => { const r = cmToFtIn(cm); return r && [r.ft, r.inch]; },
    (ft, inch) => ftInToCm(ft, inch));
  wireUnitHelper(document.getElementById("wp-weight"),
    [document.getElementById("wp-weight-lbs")],
    (kg) => { const lbs = kgToLbs(kg); return lbs != null && [lbs]; },
    (lbs) => lbsToKg(lbs));

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

  document.getElementById("qf-parse").addEventListener("click", async () => {
    commitDemo();
    const inp = document.getElementById("qf-input");
    const text = inp.value.trim();
    if (!text) return;
    const btn = document.getElementById("qf-parse");
    btn.classList.add("loading");
    const { fields, source } = await quickFillParse(text);
    btn.classList.remove("loading");
    const changed = applyQuickFillFields(fields);
    wizIntakeIdentity();
    const tag = source === "ai" ? " · AI" : "";
    toast(changed.length ? `Filled in: ${changed.join(", ")}${tag}` : "Nothing recognised — please fill in manually", changed.length ? "ok" : "bad");
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
  `, wizSidePanel());
  wireNotesPanel(view());

  wireIntake(view(), () => wizIntakeClinical());
  document.getElementById("wz-back").addEventListener("click", retreatIntake);
  document.getElementById("wz-next").addEventListener("click", () => {
    const missing = validateClinical();
    if (missing.length) return showIntakeErr(missing);
    advanceIntake();
  });
}

// ── persistent side panel: patient notes + recommended meds ──────────
// Shown on every consultation page so a note jotted early in the intake
// isn't lost by the time the doctor reaches Program/Labs/Clinical/Review —
// and the medications suggested from the patient's health goals stay
// visible underneath it the whole way through, not just on the Goals step.
function patientNotesSideHTML() {
  const w = S.wizard;
  return `<div class="card card-pad">
    <div class="card-title">${icon("edit", 17)} Patient notes</div>
    <textarea class="input" id="wz-notes" rows="4" placeholder="Notes or concerns for this consultation — carries through every step.">${esc(w.patient.intake.additional_notes || "")}</textarea>
  </div>`;
}
function wireNotesPanel(scope) {
  const box = (scope || document).querySelector("#wz-notes");
  if (box) box.addEventListener("input", (e) => { S.wizard.patient.intake.additional_notes = e.target.value; });
}
function wizSidePanel() {
  return patientNotesSideHTML() + suggestedPeptidesHTML();
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

// ── Clinical suggestion engine (deterministic, no external API) ────
// Analyses the chosen medications + patient findings and returns
// suggested lab tests and supplements, each with patient-facing detail.
// Draws on each medication's keyBloodTests/recommendedSupplements plus
// rules keyed off the patient's age, conditions and health goals.
function analyzeClinicalExtras(cart, patient) {
  const catalog = S.presets.labTestCatalog || [];
  const suppCatalog = S.presets.supplementCatalog || [];
  const labs = new Map();   // canonical name -> { name, detail, fasting, link, required, reasons:Set }
  const supps = new Map();  // canonical name -> { name, dose, benefit, reasons:Set }

  const matchLab = (fragment) => catalog.find((t) => t.match.some((m) => fragment.includes(m)));
  const matchSupp = (fragment) => suppCatalog.find((s) => s.match.some((m) => fragment.includes(m)));

  const addLab = (entry, reason, required) => {
    if (!entry) return;
    const cur = labs.get(entry.name) || { name: entry.name, detail: entry.detail, fasting: !!entry.fasting, link: entry.link || "", required: false, reasons: new Set() };
    if (reason) cur.reasons.add(reason);
    if (required) cur.required = true;
    labs.set(entry.name, cur);
  };
  const addSupp = (entry, dose, reason) => {
    if (!entry) return;
    const cur = supps.get(entry.name) || { name: entry.name, dose: entry.dose, benefit: entry.benefit, reasons: new Set() };
    if (dose) cur.dose = dose; // prefer the medication-specific dose text when present
    if (reason) cur.reasons.add(reason);
    supps.set(entry.name, cur);
  };

  const splitFrags = (text) => String(text || "").toLowerCase()
    .split(/[,;]|·|\band\b|\+/).map((s) => s.trim()).filter(Boolean);

  const hasGlp1 = cart.some((c) => c.category === "glp1");

  // 1) From each prescribed medication's clinical info.
  for (const item of cart) {
    const info = peptideOrGlp1Info(item.medication) || {};
    const reason = item.medication;
    splitFrags(info.keyBloodTests).forEach((frag) => addLab(matchLab(frag), reason, item.bloodTest === "required"));
    // supplements: keep the medication's own dose text where we can extract it
    String(info.recommendedSupplements || "").split(/[,;]/).forEach((chunk) => {
      const frag = chunk.toLowerCase().trim();
      const entry = matchSupp(frag);
      if (!entry) return;
      const doseM = chunk.match(/\(([^)]+)\)/) || chunk.match(/(\d[\d.\s–-]*(?:mg|mcg|g|iu|ml|units)[^,;]*)/i);
      addSupp(entry, doseM ? doseM[1].trim() : "", reason);
    });
  }

  // 2) The bundled weight-loss panel for GLP-1 / weight patients.
  if (hasGlp1 && S.presets.weightLossPanel) {
    const p = S.presets.weightLossPanel;
    addLab({ name: p.name, detail: p.detail, fasting: p.fasting, link: p.link }, "Weight-management baseline", false);
  }

  // 3) Rules from patient findings.
  const cond = String(patient.chronicIllnesses || "").toLowerCase();
  const goals = String((patient.intake && patient.intake.health_goals) || "").toLowerCase() + " " + String(patient.intake && patient.intake.primary_goal || "");
  const age = Number(patient.age) || 0;
  const byName = (n) => catalog.find((t) => t.name === n);
  const rule = (re, labName, why, req) => { if (re.test(cond)) addLab(byName(labName), why, req); };
  rule(/diab|dm2|dm1|\bdm\b|sugar|glucose|hba1c/, "HbA1c", "Diabetes / glucose history", false);
  rule(/diab|dm2|insulin resist|metabolic/, "Fasting Insulin", "Metabolic / insulin-resistance history", false);
  rule(/thyroid|hypothyroid|hyperthyroid/, "Thyroid Function (TSH)", "Thyroid history", false);
  rule(/pcos|pcod/, "Fasting Insulin", "PCOS", false);
  rule(/pcos|pcod/, "Sex Hormone Panel", "PCOS", false);
  rule(/pcos|pcod/, "Testosterone (Total & Free)", "PCOS", false);
  rule(/liver|fatty|hepat|nafld|nash/, "Liver Function (LFTs)", "Liver history", false);
  rule(/kidney|renal|ckd/, "Kidney Function (eGFR)", "Renal history", false);
  rule(/hypertension|blood pressure|htn|cardiac|heart/, "Comprehensive Metabolic Panel", "Cardiometabolic history", false);
  rule(/cholesterol|dyslipid|lipid/, "Lipid Profile", "Lipid history", false);
  rule(/anaem|anemia|fatigue|tired/, "Complete Blood Count (CBC)", "Fatigue / anaemia history", false);
  if (age >= 40) addLab(byName("Lipid Profile"), "Age ≥ 40 — cardiometabolic screen", false);

  // 4) Goal-driven supplements.
  if (hasGlp1 || /weight|metabol|belly|fat/.test(goals) || /obes/.test(cond)) {
    addSupp(suppCatalog.find((s) => s.name === "Protein supplement"), "", "Weight-loss muscle preservation");
    addSupp(suppCatalog.find((s) => s.name === "Vitamin D3"), "", "Weight-loss support");
  }

  const finalize = (m) => Array.from(m.values()).map((x) => ({ ...x, reasons: Array.from(x.reasons) }));
  return { labs: finalize(labs), supps: finalize(supps) };
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
  const w = S.wizard;
  const goalsQ = S.presets.intakeQuestions.find((q) => q.id === "health_goals");
  const isWeightLoss = (w.patient.intake.health_goals || []).includes("Weight loss");
  wizIntakeShell(`
    <div class="card-title">${icon("sparkle", 19)} Primary Health Objectives</div>
    <p class="hint" style="margin-bottom:14px">Select every goal that applies — choosing <b>Weight loss</b> routes this consultation into the GLP-1 / weight-loss program, and each goal reveals its own follow-up questions next.</p>
    ${renderIntakeQuestion(goalsQ)}
    ${isWeightLoss ? `
    <div class="g-callout g-teal" style="margin-top:14px;align-items:flex-start">
      ${icon("trend", 17)}
      <div style="flex:1">
        <b>Goal weight (optional)</b>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">
          <input class="input" id="wg-goalweight-inline" type="number" step="0.1" min="25" max="350" style="max-width:120px" value="${esc(w.patient.goalWeightKg)}" placeholder="kg">
          <span class="hint">kg — suggested for a target BMI of 25; also editable on the Identity page.</span>
        </div>
      </div>
    </div>` : ""}
  `, wizSidePanel());
  wireNotesPanel(view());
  wireIntake(view(), () => wizIntakeGoals());
  wirePeptideInfoButtons(view());
  const goalWeightInline = document.getElementById("wg-goalweight-inline");
  if (goalWeightInline) goalWeightInline.addEventListener("input", (e) => {
    w.patient.goalWeightKg = e.target.value;
    w.patient.goalWeightCustomized = true;
  });
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
  // additional_notes now lives permanently in the persistent side panel
  // (see patientNotesSideHTML) rather than as a one-time question here.
  const qs = S.presets.intakeQuestions.filter((q) => q.section === "Objective-Specific Questions" && q.id !== "additional_notes" && intakeVisible(q));
  wizIntakeShell(`
    <div class="card-title">${icon("activity", 19)} Objective-Specific Questions</div>
    ${qs.map(renderIntakeQuestion).join("")}
  `, wizSidePanel());
  wireNotesPanel(view());
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
  <div id="wz-side">${wizSidePanel()}</div>
  </div>`;
  wireNotesPanel(view());
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
          <div class="tpl-sub">${d.category === "glp1" ? esc(t.config.generic || "") + " · " + esc(t.config.frequency) : esc(peptideCardSub(t))}</div>
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
        // Default to the guidebook's first approved variant; fall back to the
        // clinic's own protocol for anything the guidebook doesn't cover.
        const first = peptideProtocolOptions(d.medication, d.template)[0];
        d.protocolKey = first ? first.key : null;
        d.protocol = first ? first.protocol : d.template.config.protocols[0];
        d.protocolBase = d.protocol;
        d.customizing = false;
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
      const opts = peptideProtocolOptions(d.medication, d.template);
      const sel = opts.find((o) => o.key === d.protocolKey) || opts[0];
      if (sel && !d.customizing && d.protocol !== sel.protocol) {
        // Re-rendering rebuilds the option objects, so re-anchor on the key.
        d.protocol = sel.protocol;
        d.protocolBase = sel.protocol;
      }
      det.innerHTML = `
      <hr class="divider">
      ${protocolPickerHTML(opts, sel)}
      ${d.customizing ? `
      <div class="form-grid" id="pp-custom">
        <div class="field"><label for="pc-dosevol">Dose (volume)</label><input class="input" id="pc-dosevol" data-pk="doseVolume" value="${esc(d.protocol.doseVolume || "")}"></div>
        <div class="field"><label for="pc-doseamt">Dose (amount delivered)</label><input class="input" id="pc-doseamt" data-pk="doseAmount" value="${esc(d.protocol.doseAmount || "")}"></div>
        <div class="field"><label for="pc-strength">Strength / concentration</label><input class="input" id="pc-strength" data-pk="strength" value="${esc(d.protocol.strength || "")}"></div>
        <div class="field"><label for="pc-course">Course length</label><input class="input" id="pc-course" data-pk="course" value="${esc(d.protocol.course || d.protocol.duration || "")}"></div>
        <div class="field"><label for="pc-doses">Doses in the course</label><input class="input" id="pc-doses" data-pk="totalDoses" value="${esc(d.protocol.totalDoses || "")}"></div>
        <div class="field"><label for="pc-supply">Supply to dispense</label><input class="input" id="pc-supply" data-pk="supply" value="${esc(d.protocol.supply || "")}"></div>
        <div class="field"><label for="pc-time">Timing</label><input class="input" id="pc-time" data-pk="time" value="${esc(d.protocol.time || "")}"></div>
        <div class="field"><label for="pc-cycle">Cycle</label><input class="input" id="pc-cycle" data-pk="cycle" value="${esc(d.protocol.cycle || "")}"></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 8px">
        <button class="btn btn-secondary btn-sm" id="pp-save-custom" type="button">${icon("check", 15)} Save as my protocol</button>
        <button class="btn btn-ghost btn-sm" id="pp-cancel-custom" type="button">Reset to standard</button>
      </div>
      <p class="hint">Edits apply to this consultation. "Save as my protocol" also stores it in your Program library for future use.</p>` : `
      ${protocolFactsHTML(sel)}
      <button class="btn btn-ghost btn-sm" id="pp-customize" type="button">${icon("edit", 15)} Customize protocol</button>`}`;

      det.querySelectorAll("[data-vkey]").forEach((b) => b.addEventListener("click", () => {
        const opt = opts.find((o) => o.key === b.dataset.vkey);
        if (!opt) return;
        d.protocolKey = opt.key;
        d.protocol = opt.protocol;
        d.protocolBase = opt.protocol;
        d.customizing = false;
        applyProtocolTo(d);
        wizStepProgram();
      }));

      const custBtn = det.querySelector("#pp-customize");
      if (custBtn) custBtn.addEventListener("click", () => {
        d.protocolBase = d.protocol;
        d.protocol = { ...d.protocol, protocolType: d.protocol.protocolType.replace(/ \(customized\)$/, "") + " (customized)" };
        d.customizing = true;
        wizStepProgram();
      });

      if (d.customizing) {
        // Plain-text edits mutate the cloned protocol in place (no re-render,
        // so focus is preserved); derived draft fields refresh on each input.
        det.querySelectorAll("#pp-custom [data-pk]").forEach((inp) => inp.addEventListener("input", () => {
          d.protocol[inp.dataset.pk] = inp.value;
          if (inp.dataset.pk === "course") d.protocol.courseWeeks = weeksFromCourse(inp.value);
          d.protocol.summary = `${d.medication} ${d.protocol.doseVolume || d.protocol.doseAmount || ""} — ${d.protocol.time || ""}`.trim();
          applyProtocolTo(d);
        }));
        det.querySelector("#pp-cancel-custom").addEventListener("click", () => {
          d.protocol = d.protocolBase || (sel && sel.protocol);
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
  // doseVolume and doseAmount say the same thing on the clinic's older
  // protocols ("0.15 ml (15 units)" twice over); only append the second when
  // it adds something, as the guidebook's does ("300 mcg per injection").
  const amt = pr.doseAmount && pr.doseAmount !== pr.doseVolume ? ` (${pr.doseAmount})` : "";
  d.dose = (pr.doseVolume || pr.doseAmount || "") + (pr.doseVolume ? amt : "");
  d.route = pr.route.toLowerCase().includes("oral") ? "oral" : pr.route.toLowerCase().includes("nasal") ? "nasal" : pr.route.toLowerCase().includes("topical") ? "topical" : "injection";
  d.frequency = inferFreqLabel(pr.frequency || pr.time);
  // A guidebook variant is a whole course, so the phase carries its length
  // and supply; the clinic's older protocols only know the timing and cycle.
  const supplyNote = [pr.totalDoses, pr.supply].filter(Boolean).join(" · ");
  d.phases = [{
    label: pr.protocolType,
    dose: d.dose,
    weeks: pr.courseWeeks || "",
    note: supplyNote || `${pr.time} — ${pr.cycle}`,
  }];
}

// ── the prescriber's guidebook, in the Program step ───────────────
// A guidebook dosing variant, expressed in the shape the wizard, the EMR
// note and the patient guide already read protocols in. `course`, `supply`
// and `totalDoses` are new: the guidebook prescribes a complete course, so
// how long it runs and what it takes to dispense it are part of the choice.
function guidebookProtocol(form, v) {
  const clean = (s) => { const t = String(s == null ? "" : s).trim(); return (t === "n/a" || t === "-" || t === "—") ? "" : t; };
  const course = clean(v.course);
  const supply = [clean(v.vials), clean(v.pens)].filter(Boolean).join(" or ");
  const name = clean(v.name).replace(/^variant\s+\d+\s*[-–—]\s*/i, "") || "Standard protocol";
  const dose = clean(v.dose);
  return {
    protocolType: name.charAt(0).toUpperCase() + name.slice(1),
    doseVolume: dose,
    doseAmount: clean(v.delivered),
    strength: clean(form.strength),
    route: clean(form.route),
    time: clean(form.timing) || clean(v.frequency),
    cycle: clean(form.cycling),
    duration: "",                       // the guidebook states supply, not how long a vial lasts
    frequency: clean(v.frequency),
    course,
    courseWeeks: weeksFromCourse(course),
    totalDoses: clean(v.doses),
    supply,
    note: clean(v.note),
    ref: form.ref,
    presentation: clean(form.presentation),
    source: "guidebook",
    summary: `${clean(form.name)} ${dose}${course ? ` — ${course}` : ""}${clean(v.frequency) ? `, ${clean(v.frequency).toLowerCase()}` : ""}`.trim(),
  };
}

// "4 weeks (28 days)" → "4"; "30 day cycle" → "4"; "One month" → "4".
// Feeds the dose-schedule row so the course length reaches the guide.
function weeksFromCourse(course) {
  const t = String(course || "").toLowerCase();
  let m = t.match(/(\d+(?:\.\d+)?)\s*week/);
  if (m) return String(Math.round(Number(m[1])));
  m = t.match(/(\d+)\s*month/);
  if (m) return String(Number(m[1]) * 4);
  m = t.match(/(\d+)\s*day/);
  if (m) return String(Math.max(1, Math.round(Number(m[1]) / 7)));
  if (/\bone month\b/.test(t)) return "4";
  return "";
}

// "4 weeks (28 days)" → "4 weeks" — the headline length, for the card.
function shortCourse(course) {
  return String(course || "").split("(")[0].trim();
}

// Every protocol this peptide can be prescribed on: the guidebook's approved
// dosing variants for each of its presentations, then whatever the clinic's
// own program library holds for it (the legacy standard protocol, plus any
// protocol a doctor has saved). Each option carries a stable key so the
// selection survives the step re-rendering.
function peptideProtocolOptions(medication, template) {
  const opts = [];
  for (const form of (S.protocols[medication] || [])) {
    (form.variants || []).forEach((v, i) => {
      opts.push({ key: `gb:${form.ref}:${i}`, source: "guidebook", form, protocol: guidebookProtocol(form, v) });
    });
  }
  ((template && template.config && template.config.protocols) || []).forEach((pr, i) => {
    opts.push({ key: `tpl:${i}`, source: "clinic", form: null, protocol: { ...pr, source: "clinic" } });
  });
  return opts;
}

// How many dosing options a peptide card is offering, so the count on the
// card matches the list that opens when it is chosen.
function peptideCardSub(t) {
  const med = (t.config && t.config.medication) || t.name;
  const forms = S.protocols[med] || [];
  const n = forms.reduce((sum, f) => sum + (f.variants || []).length, 0) +
    ((t.config && t.config.protocols) || []).length;
  if (!n) return "";
  const presentations = forms.length > 1 ? ` · ${forms.length} presentations` : "";
  return `${n} dosing option${n === 1 ? "" : "s"}${presentations}`;
}

// The protocol chooser: every variant laid out at once, grouped by the
// presentation it belongs to, so a medication with several forms or several
// course lengths shows all of them side by side rather than hiding them in
// a dropdown.
function protocolPickerHTML(opts, sel) {
  if (!opts.length) return `<p class="hint">No dosing protocol on file for this medication — use "Custom program" to enter one.</p>`;
  const groups = [];
  for (const o of opts) {
    const id = o.source === "guidebook" ? o.form.ref : "clinic";
    let g = groups.find((x) => x.id === id);
    if (!g) {
      g = {
        id, source: o.source, form: o.form, opts: [],
        label: o.source === "guidebook" ? o.form.presentation : "From your program library",
        sub: o.source === "guidebook" ? [o.form.strength, o.form.route].filter(Boolean).join(" · ") : "",
      };
      groups.push(g);
    }
    g.opts.push(o);
  }
  const gb = opts.filter((o) => o.source === "guidebook").length;
  const clinic = opts.length - gb;
  const count = [
    gb ? `${gb} approved variant${gb === 1 ? "" : "s"}` : "",
    clinic ? `${clinic} from your library` : "",
  ].filter(Boolean).join(" · ");

  return `
  <div class="pick-head">
    <span class="pick-lbl">${icon("layers", 16)} Dosing protocol</span>
    <span class="pick-count">${esc(count)}</span>
  </div>
  ${groups.map((g) => `
    ${groups.length > 1 ? `<div class="pick-group">${esc(g.label)}${g.sub ? `<span>${esc(g.sub)}</span>` : ""}</div>` : ""}
    ${g.opts.map((o) => protocolOptionHTML(o, !!sel && o.key === sel.key)).join("")}`).join("")}`;
}

function protocolOptionHTML(o, on) {
  const p = o.protocol;
  const gb = o.source === "guidebook";
  const dose = [p.doseVolume, p.doseAmount && p.doseAmount !== p.doseVolume ? p.doseAmount : ""].filter(Boolean).join(" · ");
  const facts = (gb
    ? [p.frequency, p.totalDoses, p.supply]
    : [p.time, p.duration ? `vial lasts ${p.duration}` : "", p.cycle]
  ).filter(Boolean);
  const course = gb ? shortCourse(p.course) : "";
  return `
  <label class="pick-item ${on ? "on" : ""}">
    <input type="radio" name="pp-variant" data-vkey="${esc(o.key)}" ${on ? "checked" : ""}>
    <span class="pick-body">
      <span class="pick-name">${esc(p.protocolType)}${course ? ` <span class="badge badge-gray">${esc(course)}</span>` : ""}</span>
      ${dose ? `<span class="pick-detail">${esc(dose)}</span>` : ""}
      ${facts.length ? `<span class="pick-facts">${esc(facts.join(" · "))}</span>` : ""}
      ${p.note ? `<span class="ai-why">${esc(p.note)}</span>` : ""}
    </span>
  </label>`;
}

// The product-level facts the chosen variant inherits — the things that are
// the same whichever variant is picked, and so belong under the list rather
// than repeated on every card.
function protocolFactsHTML(sel) {
  if (!sel) return "";
  const p = sel.protocol, f = sel.form;
  const rows = [
    ["Strength", p.strength],
    ["Route", p.route],
    ["Timing", p.time],
    ["Cycling & breaks", p.cycle],
    ["Dispensed as", f && f.containers],
    ["Monitoring", f && f.monitoring],
    ["Blood panels", f && f.panelRule],
  ].filter((r) => r[1]);
  const notes = [
    f && f.prescriberNote ? { cls: "g-teal", ico: "info", text: f.prescriberNote } : null,
    f && f.needsVerification ? { cls: "g-amber", ico: "alert", text: `Open in the guidebook: ${f.needsVerification}` } : null,
  ].filter(Boolean);
  return `
  ${rows.length ? `<dl class="pfacts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
  ${notes.map((n) => `<div class="g-callout ${n.cls}" style="margin-bottom:8px">${icon(n.ico, 17)}<div>${esc(n.text)}</div></div>`).join("")}`;
}

// Maps a protocol's own wording — the guidebook's "As needed, maximum twice
// per week" as much as the clinic's older free text — onto the dosing
// cadences the portal schedules reminders from. Tested most-specific first:
// a PRN protocol with a weekly cap is still PRN, not weekly.
function inferFreqLabel(time) {
  const t = String(time || "").toLowerCase();
  if (t.includes("as needed") || t.includes("on demand") || t.includes("on-demand")) return "as needed";
  if (t.includes("twice daily") || t.includes("twice per day") || t.includes("2-3 times per day")) return "twice daily";
  if (t.includes("every 3 days") || t.includes("every third day")) return "every 3 days";
  if (t.includes("every other day") || t.includes("alternate day")) return "every other day";
  if (t.includes("5 days on") || t.includes("5 days per week") || t.includes("5 of 7")) return "5 days per week";
  if (t.includes("3 times") || t.includes("3x")) return "3 times per week";
  if (t.includes("twice a week") || t.includes("twice weekly") || t.includes("twice per week")) return "twice a week";
  if (t.includes("weekly") || t.includes("per week")) return "weekly";
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

// The schedule editor works on any phases array, so the consultation wizard
// and the editor for an already-published program share it. Defaults to the
// wizard's draft for the wizard's own call sites.
function phasesRows(phases) {
  phases = phases || S.wizard.draft.phases;
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

function wirePhases(scope, phases) {
  phases = phases || S.wizard.draft.phases;
  const box = scope.querySelector("#phases-box");
  if (!box) return;
  box.querySelectorAll(".phase-row").forEach((row) => {
    row.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => {
      phases[Number(row.dataset.i)][inp.dataset.k] = inp.value;
    }));
  });
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    phases.splice(Number(b.dataset.del), 1);
    box.outerHTML = phasesRows(phases);
    wirePhases(scope, phases);
  }));
  box.querySelector("#add-phase").addEventListener("click", () => {
    phases.push({ label: "", dose: "", weeks: "", note: "" });
    box.outerHTML = phasesRows(phases);
    wirePhases(scope, phases);
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
    const pr = item.protocol;
    const info = (S.presets.peptideInfo || {})[item.medication];
    const storage = (info && info.storageNotes) || "Store vials refrigerated (2–8°C) away from light.";
    const missed = info && info.missedDose ? `\nMissed dose: ${info.missedDose}` : "";
    // A guidebook variant is a defined course, so the patient is told how
    // long it runs and how many doses it holds. Guidebook prose already ends
    // in a full stop where the clinic's fields don't, so only add one when
    // it's missing rather than producing "No cycling required..".
    const sentence = (s) => { const t = String(s || "").trim(); return !t ? "" : /[.!?]$/.test(t) ? t : t + "."; };
    // Some guidebook courses already name the dose count ("6 weeks + 4 week
    // maintenance (22 injections)"); don't say it twice.
    const totals = pr.totalDoses && !String(pr.course).includes(pr.totalDoses) ? ` — ${pr.totalDoses}` : "";
    const course = pr.course ? `Course: ${sentence(pr.course + totals)}\n` : "";
    return `${sentence(pr.time)}\n${course}Route: ${sentence(pr.route)}\nCycle: ${sentence(pr.cycle)}\n${storage}${missed}`;
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
    const length = pr.course ? `, ${pr.course} course` : pr.duration ? `, for ${pr.duration} total cycle` : "";
    // The guidebook's timing ends in a full stop; the line continues after it.
    const timing = String(pr.time || freqPhrase(it.frequency)).replace(/\.\s*$/, "");
    return `${it.medication} — ${pr.doseAmount ? pr.doseAmount + " " : ""}${pr.doseVolume ? `(${pr.doseVolume})` : ""} — ${timing}, ${humanRoute(it.route)}${length}`.replace(/ +/g, " ").trim();
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
  // The guidebook dispenses a whole course (a count of vials, pens or
  // bottles); the clinic's older protocols only say how long one vial lasts.
  const dispense = pr.supply
    ? ` — dispense ${pr.supply}${pr.totalDoses ? ` for ${pr.totalDoses}` : ""}`
    : pr.duration ? ` (vial lasts ~${pr.duration})` : "";
  return `\n   Rationale: Selected for '${goalTxt}'.${mech ? " " + mech : ""}\n   Supply: ${pr.strength || ""}${pr.doseVolume ? `, ${pr.doseVolume}/dose` : ""}${dispense}`;
}

// The clinician's signature as it appears at the foot of a record: name and
// credentials, then whatever extra lines they set (licence number, unit),
// then the clinic. Each doctor signs in their own name.
function signatureBlock(user) {
  const u = user || {};
  // Falls back to the signer's organisation name, never to a hardcoded
  // practice name — a signature must never claim to be from a clinic the
  // signer doesn't belong to.
  return [
    `${u.name || ""}${u.credentials ? `, ${u.credentials}` : ""}`.trim(),
    (u.signature || "").trim(),
    (u.clinic || u.orgName || "").trim(),
  ].filter(Boolean).join("\n");
}

// Builds the full structured clinical encounter record (EMR) for every
// program added this consultation — Date of Encounter / PATIENT /
// CLINICAL SUMMARY / MEDICATION(S) PRESCRIBED / INVESTIGATIONS / PLAN /
// Physician, matching DarDoc's standard consultation-note format.
// Every free-text note actually written during intake: "Other, please
// specify" write-ins, the optional notes box under a question, and the
// closing "anything else for the doctor" box. These used to reach only a
// summary card on the patient's dashboard page and never the EMR itself, so
// what the patient told the practice at intake was invisible in their
// clinical record. Chronic-illness and allergy notes are skipped here —
// they already flow into the PATIENT block's Chronic Illnesses / Allergies
// lines (see intakeText() / prefillFromIntake()) and would otherwise appear
// twice.
function intakeNotesText(intake) {
  const qs = (S.presets && S.presets.intakeQuestions) || [];
  const skip = new Set(["health_conditions", "allergies"]);
  const lines = [];
  for (const q of qs) {
    if (skip.has(q.id)) continue;
    if (q.type === "text") {
      const v = String(intake[q.id] || "").trim();
      if (v) lines.push(`${q.question} — ${v}`);
      continue;
    }
    const other = String(intake[q.id + "__other"] || "").trim();
    const notes = String(intake[q.id + "__notes"] || "").trim();
    const bits = [other && `Other: ${other}`, notes].filter(Boolean).join(" — ");
    if (bits) lines.push(`${q.question} — ${bits}`);
  }
  return lines;
}

function buildMultiClinicalSuggestion(patient, items, metrics, note, followupDays, labTests, suppList) {
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

  // ── ADDITIONAL NOTES FROM INTAKE ──
  const notesLines = intakeNotesText(intake);
  const notesBlock = notesLines.length ? `ADDITIONAL NOTES FROM INTAKE\n\n${notesLines.join("\n")}` : "";

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
  // Exactly what the doctor ticked in the Labs step, named test by test —
  // "Panel 1 — Basic Safety: Complete Blood Count (CBC), …". Nothing the
  // doctor did not order appears here, and no generic per-medication line
  // stands in for the actual order.
  const ordered = (labTests || []).filter((l) => l.on !== false);
  const isPanel = (l) => /^Panel\s/i.test(l.name);
  const flag = (l) => (l.required ? " (mandatory)" : "");
  const invLines = [];

  for (const p of ordered.filter(isPanel)) {
    const tests = String(p.detail || "").trim();
    invLines.push(`${p.name}${flag(p)}${tests ? `: ${tests}` : ""}`);
  }
  // Bookable bundles carry their own booking link (the weight-loss panel).
  for (const b of ordered.filter((l) => !isPanel(l) && l.link)) {
    invLines.push(`${b.name}${flag(b)}\n\nLink: ${b.link}`);
  }
  // Individual tests the doctor added or the analysis suggested outside a
  // panel — listed by name, since the name is the test. Anything a listed
  // panel already covers is not repeated here.
  const panelTests = orderedPanelTests(ordered);
  const singles = ordered.filter((l) => !isPanel(l) && !l.link && !testCoveredByPanels(l.name, panelTests));
  if (singles.length) {
    invLines.push(`Additional tests: ${singles.map((l) => l.name + flag(l)).join(", ")}`);
  }
  if (ordered.some((l) => l.fasting)) invLines.push("Fasting sample required.");

  const investigations = invLines.length ? invLines.join("\n\n") : "No additional investigations required at this time.";

  // ── SUPPLEMENTS ADVISED ──
  // The other half of the Labs & Supplements step. These reached the
  // patient's guide but never the clinical record, so the record did not
  // say what the patient was actually advised to take alongside the
  // prescription. Omitted entirely when nothing was selected.
  const advisedSupps = (suppList || []).filter((s) => s.on !== false);
  const supplementsBlock = advisedSupps.length
    ? `SUPPLEMENTS ADVISED\n\n${advisedSupps.map((s) => `${s.name}${s.dose ? ` — ${s.dose}` : ""}`).join("\n")}`
    : "";

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
    notesBlock,
    `CLINICAL SUMMARY\n\n${paras.join("\n\n")}`,
    `${medHeader}\n\n${medLines.join("\n\n")}\n\n${counsel}`,
    `INVESTIGATIONS\n\n${investigations}`,
    supplementsBlock,
    `PLAN\n\nFollow-up appointment scheduled for ${fmtDMY(followup)}.\n\n${planBullets.join("\n")}`,
    `Physician:\n${signatureBlock(S.user)}`,
  ].filter(Boolean);
  // The doctor's private consultation note — kept as its own labelled
  // section (previously tacked on with no heading, reading like a stray
  // paragraph) so it's unmistakably part of the record.
  const noteBlock = String(note || "").trim() ? `CLINICAL NOTES\n\n${String(note).trim()}` : "";
  return [sections.join("\n\n"), noteBlock].filter(Boolean).join("\n\n");
}

// Step 3 — AI-analysed lab tests + supplements. On first entry for the
// current cart it auto-runs analyzeClinicalExtras() to pre-select the
// suggested items; the doctor can toggle any off, add custom ones, and
// the chosen items flow into the guide.
// Supplement and lab names arrive from two places — the local catalog and
// the guidebook — and rarely agree on spelling. Compare on the meaningful
// words so "Zinc and Magnesium (ZMA)" and "Magnesium Glycinate" merge
// instead of appearing twice.
const SUPP_STOPWORDS = new Set(["and", "or", "the", "with", "supplement", "peptides", "acid", "complex", "profile", "level", "serum", "test", "in", "blood", "count", "total"]);
function normSupp(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function suppTokens(name) {
  return new Set(normSupp(name).split(" ").filter((w) => w.length >= 4 && !SUPP_STOPWORDS.has(w)));
}
function sameSupplement(a, b) {
  const A = suppTokens(a), B = suppTokens(b);
  if (!A.size || !B.size) return normSupp(a) === normSupp(b);
  for (const t of A) if (B.has(t)) return true;
  return false;
}

// Is this test already inside one of the ordered panels? Stops the same
// test being ordered twice — once as part of a panel, once on its own. The
// two names rarely match character for character, so three signals are
// tried: the whole name inside a panel test ("IGF-1" within "Insulin-like
// Growth Factor (IGF-1)"), the parenthesised code ("Thyroid Function (TSH)"
// against "Thyroid Stimulating Hormone (TSH)"), or two shared significant
// words ("Fasting Blood Glucose" against "Fasting Blood Sugar / Glucose").
// One shared word is not enough — "Insulin Level" must not be swallowed by
// "Insulin-like Growth Factor".
function testCoveredByPanels(name, panelTests) {
  const needle = normSupp(name);
  if (needle.length < 3 || !panelTests.length) return false;
  const has = (hay, phrase) => !!phrase && new RegExp(`(^| )${phrase}( |$)`).test(hay);
  const words = needle.split(" ").filter((w) => w.length >= 4 && !SUPP_STOPWORDS.has(w));
  const code = normSupp((String(name).match(/\(([^)]+)\)/) || [])[1] || "");
  return panelTests.some((t) => {
    const hay = normSupp(t);
    if (has(hay, needle) || has(hay, code)) return true;
    return words.filter((w) => has(hay, w)).length >= 2;
  });
}

// The individual tests inside the panels on this list. A panel carries its
// tests as one comma-joined string, but a test may hold commas of its own
// ("Lipid Profile (Cholesterol, LDL, HDL, Triglycerides)"), so only split on
// commas outside brackets.
function orderedPanelTests(labs) {
  return labs.filter((l) => /^Panel\s/i.test(l.name))
    .flatMap((l) => String(l.detail || "").split(/,(?![^(]*\))/))
    .map((t) => t.trim()).filter(Boolean);
}

// Pulls the prescriber's guidebook review for the current cart — the blood
// panels each peptide requires, its supporting supplements, and any
// cross-peptide safety rule that has fired — then re-renders the step. The
// guidebook is authoritative for peptides; analyzeClinicalExtras still
// covers GLP-1 and patient-finding rules that the guidebook does not model.
async function loadProtocolReview(cartKey) {
  const w = S.wizard;
  try {
    const res = await api("POST", "/api/clinical/review", {
      items: w.cart.map((c) => ({ medication: c.medication, route: c.route, category: c.category })),
      patientId: w.patient.id || undefined,
      patient: { age: w.patient.age, chronic_illnesses: w.patient.chronicIllnesses || w.patient.chronic_illnesses },
    });
    w.review = res;

    const seenL = new Set(w.labTests.map((l) => l.name));
    for (const p of res.panels || []) {
      const name = `${p.id} — ${p.name}`;
      if (seenL.has(name)) continue;
      w.labTests.push({
        name,
        detail: (p.tests || []).join(", "),
        fasting: (p.tests || []).some((t) => /fasting/i.test(t)),
        required: !!p.required,
        reasons: p.reasons || [],
        on: false,   // nothing pre-ticked — the doctor chooses what to order
        suggested: true,
      });
      seenL.add(name);
    }
    // A panel already contains its individual tests, so drop the loose
    // suggestions the local analysis made for the same thing — otherwise the
    // doctor sees "IGF-1" beside "Panel 2 — GH / IGF-1 Axis".
    const panelTests = (res.panels || []).flatMap((p) => p.tests || []);
    w.labTests = w.labTests.filter((l) => /^Panel /.test(l.name) || !testCoveredByPanels(l.name, panelTests));

    // Merge supplements on meaning, not exact spelling: the local catalog says
    // "Zinc and Magnesium (ZMA)" where the guidebook says "Magnesium Glycinate".
    for (const s of res.supplements || []) {
      const existing = w.suppList.find((x) => sameSupplement(x.name, s.name));
      if (existing) {
        if (!existing.dose && s.dose) existing.dose = s.dose;
        for (const r of s.reasons || []) if (!existing.reasons.includes(r)) existing.reasons.push(r);
        continue;
      }
      w.suppList.push({ name: s.name, dose: s.dose || "", benefit: "", reasons: s.reasons || [], on: false, suggested: true });
    }
    for (const a of res.advice || []) {
      if (!w.protocolAdvice) w.protocolAdvice = [];
      if (!w.protocolAdvice.some((x) => x.text === a.text)) w.protocolAdvice.push(a);
    }
  } catch {
    w.review = w.review || null;   // offline or not signed in — keep the local analysis
  }
  if (S.wizard.step === 2) wizStepLabs();
}

function wizStepLabs() {
  const w = S.wizard;

  // Auto-analyse once per cart composition (re-runs if the cart changed).
  const cartKey = w.cart.map((c) => c.medication).join("|");
  if (w.labsAnalyzed !== cartKey) {
    const res = analyzeClinicalExtras(w.cart, w.patient);
    // Merge: keep anything the doctor already added, pre-select suggestions.
    const seenL = new Set(w.labTests.map((l) => l.name));
    res.labs.forEach((l) => { if (!seenL.has(l.name)) w.labTests.push({ ...l, on: false, suggested: true }); });
    const seenS = new Set(w.suppList.map((s) => s.name));
    res.supps.forEach((s) => { if (!seenS.has(s.name)) w.suppList.push({ ...s, on: false, suggested: true }); });
    w.labsAnalyzed = cartKey;
    w.review = null;
    loadProtocolReview(cartKey);   // guidebook layer arrives and re-renders
  }

  const findings = (w.review && w.review.safety) || [];
  const blocking = findings.filter((f) => f.level === "blocking");
  const LEVEL = { blocking: ["g-red", "alert"], warning: ["g-amber", "alert"], info: ["g-teal", "info"] };
  const safetyBlock = findings.length ? `
    <div class="ai-block">
      <div class="ai-head">${icon("shield", 17)} Protocol safety — from the prescriber&rsquo;s guidebook
        ${blocking.length ? `<span class="badge badge-red">${blocking.length} must resolve</span>` : `<span class="badge badge-teal">${findings.length}</span>`}</div>
      ${findings.map((f) => `
        <div class="g-callout ${LEVEL[f.level][0]}" style="margin-bottom:8px">
          ${icon(LEVEL[f.level][1], 17)}
          <div><strong>${esc(f.title)}</strong><div style="margin-top:2px">${esc(f.detail)}</div></div>
        </div>`).join("")}
    </div>` : "";

  const reasonText = (r) => (r && r.length) ? `<span class="ai-why">${esc(r.join(" · "))}</span>` : "";
  const labRow = (l, i) => `
    <label class="pick-item ${l.on ? "on" : ""}">
      <input type="checkbox" data-lab="${i}" ${l.on ? "checked" : ""}>
      <span class="pick-body">
        <span class="pick-name">${esc(l.name)}${l.fasting ? ` <span class="badge badge-gray">fasting</span>` : ""}${l.required ? ` <span class="badge badge-red">required</span>` : ` <span class="badge badge-amber">recommended</span>`}</span>
        <span class="pick-detail">${esc(l.detail)}</span>
        ${reasonText(l.reasons)}
      </span>
    </label>`;
  const suppRow = (s, i) => `
    <label class="pick-item ${s.on ? "on" : ""}">
      <input type="checkbox" data-supp="${i}" ${s.on ? "checked" : ""}>
      <span class="pick-body">
        <span class="pick-name">${esc(s.name)}${s.dose ? ` · <span style="color:var(--muted);font-weight:600">${esc(s.dose)}</span>` : ""}</span>
        <span class="pick-detail">${esc(s.benefit || "")}</span>
        ${reasonText(s.reasons)}
      </span>
    </label>`;

  const medList = w.cart.map((c) => c.medication).join(", ") || "the program";
  const patientName = w.patient.name || "the patient";
  view().innerHTML = `${wizHead()}
  <div class="two-col">
  <div class="card card-pad">
    <div class="card-title">${icon("sparkles", 19)} AI clinical analysis — labs &amp; supplements</div>
    <p class="hint" style="margin:-4px 0 14px">Analysed <b>${esc(medList)}</b> against ${esc(patientName)}&rsquo;s findings and the prescriber&rsquo;s protocol guidebook. Nothing is pre-selected — tick anything you want to order or advise, or add your own. Chosen items appear in the patient&rsquo;s guide.</p>

    ${safetyBlock}

    <div class="ai-block">
      <div class="ai-head">${icon("droplet", 17)} Recommended lab tests <span class="badge badge-teal" id="lab-count"></span></div>
      <div id="lab-list">${w.labTests.length ? w.labTests.map(labRow).join("") : `<p class="hint">No specific lab tests suggested — add one below if needed.</p>`}</div>
      <div class="add-row">
        <input class="input" id="lab-add" placeholder="Add another lab test (name)">
        <button class="btn btn-secondary btn-sm" id="lab-add-btn" type="button">${icon("plus", 15)} Add</button>
      </div>
    </div>

    <div class="ai-block">
      <div class="ai-head">${icon("pill", 17)} Recommended supplements <span class="badge badge-teal" id="supp-count"></span></div>
      <div id="supp-list">${w.suppList.length ? w.suppList.map(suppRow).join("") : `<p class="hint">No supplements suggested — add one below if needed.</p>`}</div>
      ${(w.protocolAdvice || []).length ? `<div class="g-callout g-teal" style="margin:4px 0 10px">${icon("info", 17)}<div>${(w.protocolAdvice || []).map((a) => `<div><strong>${esc(a.reasons.join(", "))}:</strong> ${esc(a.text)}</div>`).join("")}</div></div>` : ""}
      <div class="add-row">
        <input class="input" id="supp-add" placeholder="Supplement name">
        <input class="input" id="supp-dose" placeholder="Dose (e.g. 2000 IU daily)" style="max-width:200px">
        <button class="btn btn-secondary btn-sm" id="supp-add-btn" type="button">${icon("plus", 15)} Add</button>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:16px">
      <button class="btn btn-ghost" id="wz-back">${icon("chevL", 17)} Back</button>
      <button class="btn btn-primary" id="wz-next" ${blocking.length ? "disabled" : ""} title="${blocking.length ? "Resolve the protocol safety issues first" : ""}">Continue ${icon("chevR", 17)}</button>
    </div>
  </div>
  <div id="wz-side">${wizSidePanel()}</div>
  </div>`;
  wireNotesPanel(view());

  const updateCounts = () => {
    document.getElementById("lab-count").textContent = w.labTests.filter((l) => l.on).length;
    document.getElementById("supp-count").textContent = w.suppList.filter((s) => s.on).length;
  };
  updateCounts();

  view().querySelectorAll("[data-lab]").forEach((cb) => cb.addEventListener("change", () => {
    w.labTests[Number(cb.dataset.lab)].on = cb.checked;
    cb.closest(".pick-item").classList.toggle("on", cb.checked);
    updateCounts();
  }));
  view().querySelectorAll("[data-supp]").forEach((cb) => cb.addEventListener("change", () => {
    w.suppList[Number(cb.dataset.supp)].on = cb.checked;
    cb.closest(".pick-item").classList.toggle("on", cb.checked);
    updateCounts();
  }));

  document.getElementById("lab-add-btn").addEventListener("click", () => {
    const name = document.getElementById("lab-add").value.trim();
    if (!name) return;
    w.labTests.push({ name, detail: "As requested by your doctor.", fasting: false, required: false, reasons: ["Added by doctor"], on: true });
    wizStepLabs();
  });
  document.getElementById("supp-add-btn").addEventListener("click", () => {
    const name = document.getElementById("supp-add").value.trim();
    if (!name) return;
    w.suppList.push({ name, dose: document.getElementById("supp-dose").value.trim(), benefit: "", reasons: ["Added by doctor"], on: true });
    wizStepLabs();
  });

  document.getElementById("wz-back").addEventListener("click", () => { w.step = 1; paintWizard(); });
  document.getElementById("wz-next").addEventListener("click", () => {
    // Derive the legacy fields the EMR/guide callout still read.
    const chosenLabs = w.labTests.filter((l) => l.on);
    const chosenSupps = w.suppList.filter((s) => s.on);
    const anyRequired = chosenLabs.some((l) => l.required);
    const bt = chosenLabs.length ? (anyRequired ? "required" : "recommended") : "none";
    w.cart.forEach((c) => { c.bloodTest = bt; });
    w.supplements = chosenSupps.map((s) => s.name + (s.dose ? ` (${s.dose})` : "")).join(", ");
    w.step = 3; paintWizard();
  });
}

function wizStepClinical() {
  const w = S.wizard;
  const hasGlp1 = w.cart.some((c) => c.category === "glp1");

  view().innerHTML = `${wizHead()}
  <div class="two-col">
  <div class="card card-pad">
    <div class="card-title">${icon("clipboard", 19)} Clinical details &amp; guide content</div>

    ${w.cart.map((c, i) => `
      <div class="card" style="background:var(--bg);margin-bottom:14px">
        <div class="card-title" style="padding:14px 16px 0;font-size:15px">${icon(c.category === "glp1" ? "syringe" : "droplet", 17)} ${esc(c.medication)}${c.dose ? " · " + esc(c.dose) : ""}${c.quantity > 1 ? ` × ${c.quantity}` : ""}</div>
        <div class="form-grid" style="padding:12px 16px 16px">
          <div class="field full"><label for="ci-instr-${i}">Instructions for the patient</label><textarea class="input" id="ci-instr-${i}" rows="4">${esc(c.instructions)}</textarea></div>
          <div class="field full"><label for="ci-warn-${i}">Warnings — when to contact you</label><textarea class="input" id="ci-warn-${i}" rows="3">${esc(c.warnings)}</textarea></div>
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
      <div class="field full"><label for="cl-note">Private clinical note (EMR — not shown to patient)</label><textarea class="input" id="cl-note" rows="3" placeholder="Consultation summary for your records…">${esc(w.clinicalNote)}</textarea></div>
    </div>

    <div class="card" style="background:var(--bg);margin-top:6px">
      <div class="card-title" style="padding:16px 16px 0;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <span style="display:flex;align-items:center;gap:10px">${icon("file", 18)} Clinical record &amp; suggestion (EMR)</span>
        <span style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" id="cl-regen" type="button" title="Rebuild from the details above, discarding any hand edits">${icon("activity", 15)} Regenerate</button>
          <button class="btn btn-secondary btn-sm" id="cl-copy" type="button">${icon("copy", 15)} Copy record</button>
        </span>
      </div>
      <p class="hint" style="margin:8px 16px 0">Every section — patient details, summary, medications, investigations, supplements, plan — is generated below and free to edit directly. Your edits are kept as you fill in the fields above; use Regenerate to start over.</p>
      <textarea id="cl-emr" rows="18" style="margin:10px 16px 16px;width:calc(100% - 32px);padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);font-family:ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.5;resize:vertical"></textarea>
      <p class="hint" id="cl-custom-flag" style="margin:0 16px 16px" hidden>${icon("edit", 13)} Hand-edited — further changes above won&rsquo;t overwrite your edits here.</p>
    </div>

    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:14px">
      <button class="btn btn-ghost" id="wz-back">${icon("chevL", 17)} Back</button>
      <button class="btn btn-primary" id="wz-next">Preview guide ${icon("chevR", 17)}</button>
    </div>
  </div>
  <div id="wz-side">${wizSidePanel()}</div>
  </div>`;
  wireNotesPanel(view());

  // The EMR box starts populated from every field on this page (and the two
  // steps before it), and stays in sync with them — until the doctor types
  // into the box directly. From that point on, field edits are collected as
  // usual but never overwrite what the doctor wrote; only "Regenerate"
  // (an explicit, confirmed action) discards hand edits and starts over.
  const emrBox = document.getElementById("cl-emr");
  const customFlag = document.getElementById("cl-custom-flag");
  const computeAutoEmr = () => buildMultiClinicalSuggestion(
    { name: w.patient.name, title: w.patient.title, gender: w.patient.gender, mobile: w.patient.mobile,
      age: w.patient.age, heightCm: w.patient.heightCm, weightKg: w.patient.weightKg,
      chronicIllnesses: w.patient.chronicIllnesses, medications: w.patient.medications, allergies: w.patient.allergies,
      intake: w.patient.intake },
    w.cart, wizMetrics(), w.clinicalNote, w.followupDays,
    (w.labTests || []).filter((l) => l.on), (w.suppList || []).filter((s) => s.on)
  ) || "Add a medication and patient details to generate the clinical record.";
  const refreshEmr = () => {
    collect();
    if (w.emrCustomized) return;
    emrBox.value = computeAutoEmr();
    w.clinicalSuggestion = emrBox.value;
  };
  view().querySelectorAll("input, select, textarea").forEach((el) => { if (el !== emrBox) el.addEventListener("input", refreshEmr); });
  refreshEmr();
  if (w.emrCustomized) { emrBox.value = w.clinicalSuggestion || computeAutoEmr(); customFlag.hidden = false; }

  emrBox.addEventListener("input", () => {
    w.emrCustomized = true;
    w.clinicalSuggestion = emrBox.value;
    customFlag.hidden = false;
  });
  document.getElementById("cl-regen").addEventListener("click", () => {
    if (w.emrCustomized && !confirm("Replace your edits with a freshly generated clinical record? This can\u2019t be undone.")) return;
    collect();
    w.emrCustomized = false;
    emrBox.value = computeAutoEmr();
    w.clinicalSuggestion = emrBox.value;
    customFlag.hidden = true;
  });

  document.getElementById("cl-copy").addEventListener("click", async () => {
    await navigator.clipboard.writeText(emrBox.value);
    toast("Clinical record copied");
  });
  document.getElementById("wz-back").addEventListener("click", () => { collect(); w.step = 2; paintWizard(); });
  document.getElementById("wz-next").addEventListener("click", () => { collect(); w.step = 4; paintWizard(); });

  function collect() {
    w.cart.forEach((c, i) => {
      c.instructions = document.getElementById(`ci-instr-${i}`).value;
      c.warnings = document.getElementById(`ci-warn-${i}`).value;
    });
    w.patient.chronicIllnesses = document.getElementById("cl-chronic").value;
    w.patient.medications = document.getElementById("cl-meds").value;
    w.patient.allergies = document.getElementById("cl-allergy").value;
    w.followupDays = Number(document.getElementById("cl-fu").value) || 28;
    w.clinicalNote = document.getElementById("cl-note").value;
    if (hasGlp1) {
      w.diet.calories = Number(document.getElementById("cl-cal").value) || undefined;
      w.diet.proteinMin = Number(document.getElementById("cl-prot-min").value) || undefined;
      w.diet.proteinMax = Number(document.getElementById("cl-prot-max").value) || undefined;
    }
  }
}

// Client-side mirror of src/api.js's guideInfoFor() — same source records
// via /api/presets, for the guide preview before anything is published (and
// so has no server-parsed plan to pull guideInfo from yet).
function previewGuideInfo(category, medication) {
  const info = category === "glp1" ? (S.presets.glp1Info || {})[medication] : (S.presets.peptideInfo || {})[medication];
  if (!info) return null;
  const redFlags = category === "glp1" ? ((S.presets.glp1Eligibility || {}).redFlags || []) : (info.redFlags || []);
  return {
    howItWorks: info.howItWorks || "", commonSideEffects: info.commonSideEffects || "", redFlags,
    videoLink: category === "glp1" ? ((S.presets.glp1VideoLinks || {})[medication] || "") : "",
  };
}

function wizStepReview() {
  const w = S.wizard;
  injectGuideCss();
  const nextFollowup = new Date(Date.now() + w.followupDays * 864e5).toISOString().slice(0, 10);
  const createdAt = new Date().toISOString().slice(0, 10);
  const previewLabs = (w.labTests || []).filter((l) => l.on);
  const previewSupps = (w.suppList || []).filter((s) => s.on);
  // Preview-only plans (nothing is saved yet), so they carry no server-side
  // signedBy — without one the guide preview would fall through to a
  // hardcoded practice name. Sign the preview the same way the server signs
  // the real thing once published: with the doctor actually running this
  // consultation.
  const previewSigner = { name: S.user.name, credentials: S.user.credentials, signature: S.user.signature, clinic: S.user.clinic || S.user.orgName || "", appName: S.user.appName || "" };
  const fakePlans = w.cart.map((c) => ({
    title: `${c.medication} — ${c.category === "glp1" ? "Weight Loss Program" : c.category === "peptide" ? "Peptide Therapy" : "Treatment Program"}`,
    category: c.category, medication: c.medication, dose: c.dose, quantity: c.quantity, route: c.route, frequency: c.frequency,
    phases: c.phases.filter((p) => p.label || p.dose), instructions: c.instructions, warnings: c.warnings,
    diet: c.category === "glp1" ? w.diet : {}, blood_test: c.bloodTest, supplements: w.supplements,
    labTests: previewLabs, suppList: previewSupps,
    created_at: createdAt, next_followup: nextFollowup,
    signedBy: previewSigner,
    // Same reference data the server attaches once published (see
    // doseOptionsFor in src/api.js) — the guidebook's approved dose ladder,
    // not a commitment to where the doctor plans to titrate this patient.
    doseOptions: c.category === "glp1" && c.template ? (c.template.config.doses || []) : [],
    guideInfo: previewGuideInfo(c.category, c.medication),
  }));
  // A hand-edited record from the Clinical step is the doctor's final word
  // on it and is published as-is; otherwise it's regenerated fresh here so
  // late changes (e.g. going back and adjusting labs) are reflected.
  const clinicalSuggestion = w.emrCustomized ? (w.clinicalSuggestion || "") : buildMultiClinicalSuggestion(
    { name: w.patient.name, title: w.patient.title, gender: w.patient.gender, mobile: w.patient.mobile,
      age: w.patient.age, heightCm: w.patient.heightCm, weightKg: w.patient.weightKg,
      chronicIllnesses: w.patient.chronicIllnesses, medications: w.patient.medications, allergies: w.patient.allergies,
      intake: w.patient.intake },
    w.cart, wizMetrics(), w.clinicalNote, w.followupDays, previewLabs, previewSupps
  );
  w.clinicalSuggestion = clinicalSuggestion;
  const guideText = buildComboGuideText(fakePlans, { name: w.patient.name, title: w.patient.title }, S.user.name);
  view().innerHTML = `${wizHead()}
  <div class="two-col" style="grid-template-columns:1fr 340px">
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;flex-wrap:wrap">
        <div class="card-title" style="margin:0">${icon("file", 19)} Guide preview — what the patient sees</div>
        <button class="btn btn-secondary btn-sm" id="rv-guide-copy" type="button">${icon("copy", 15)} Copy guide text</button>
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
      ${patientNotesSideHTML()}
      ${clinicalSuggestion ? `<div class="card card-pad">
        <div class="card-title" style="justify-content:space-between">
          <span style="display:flex;align-items:center;gap:10px">${icon("file", 18)} Clinical record (EMR)</span>
          <button class="btn btn-secondary btn-sm" id="rv-copy" type="button">${icon("copy", 15)} Copy record</button>
        </div>
        <pre style="margin:0;font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre-wrap;line-height:1.5;color:var(--muted)">${esc(clinicalSuggestion)}</pre>
      </div>` : ""}
    </div>
  </div>`;
  wireNotesPanel(view());
  if (clinicalSuggestion) document.getElementById("rv-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(clinicalSuggestion); toast("Clinical record copied"); });
  document.getElementById("rv-guide-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(guideText); toast("Guide text copied"); });

  document.getElementById("wz-back").addEventListener("click", () => { w.step = 3; paintWizard(); });
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
          startWeightKg: Number(w.patient.startWeightKg) || null, maxWeightKg: Number(w.patient.maxWeightKg) || null,
          goalWeightKg: Number(w.patient.goalWeightKg) || null,
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
          startWeightKg: Number(w.patient.startWeightKg) || null, maxWeightKg: Number(w.patient.maxWeightKg) || null,
          goalWeightKg: Number(w.patient.goalWeightKg) || null,
          age: Number(w.patient.age) || null, gender: w.patient.gender, activityLevel: w.patient.activityLevel,
        });
      }
      if (w.draftId) { try { await api("DELETE", `/api/drafts/${w.draftId}`); } catch { /* best effort */ } }
      // One plan row per program added this consultation — each keeps its
      // own dose/quantity/instructions/warnings/blood test, sharing the
      // visit-level follow-up date, clinical note and EMR suggestion.
      // Chosen labs/supplements are visit-level — attach to every plan so
      // the guide (rendered per-medication) can always show them.
      const cleanLabs = (w.labTests || []).filter((l) => l.on).map((l) => ({ name: l.name, detail: l.detail, fasting: !!l.fasting, required: !!l.required, link: l.link || "" }));
      const cleanSupps = (w.suppList || []).filter((s) => s.on).map((s) => ({ name: s.name, dose: s.dose || "", benefit: s.benefit || "" }));
      for (let i = 0; i < w.cart.length; i++) {
        const c = w.cart[i], p = fakePlans[i];
        await api("POST", "/api/plans", {
          patientId, category: c.category, title: p.title, medication: c.medication,
          dose: c.dose, quantity: c.quantity, route: c.route, frequency: c.frequency, halfLifeHours: c.halfLifeHours,
          phases: p.phases, instructions: c.instructions, warnings: c.warnings,
          diet: p.diet, followupDays: w.followupDays, bloodTest: c.bloodTest, clinicalNote: w.clinicalNote,
          clinicalSuggestion: w.clinicalSuggestion, supplements: w.supplements,
          labTests: cleanLabs, suppList: cleanSupps,
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

// ── edit a published program ─────────────────────────────────────
// Treatment gets revised at follow-up: a different peptide, a longer course,
// another panel, a supplement dropped. This edits a program that is already
// live in the patient's portal — the same choices the consultation offered,
// on a record that already exists. Saving republishes the guide.
async function viewEditPlan(planId) {
  view().innerHTML = `<div class="skel" style="height:110px;margin-bottom:16px"></div><div class="skel" style="height:420px"></div>`;
  let loaded = null;
  try { loaded = await api("GET", `/api/plans/${planId}`); } catch { /* handled below */ }
  if (!loaded || !loaded.plan || !loaded.patient) {
    return void (view().innerHTML = `<div class="empty">${icon("alert", 32)}<div class="empty-title">Program not found</div></div>`);
  }
  const { plan, patient } = loaded;
  // A local draft in the same shape the consultation uses, so the protocol
  // picker, the schedule editor and applyProtocolTo all work unchanged.
  const d = {
    category: plan.category, template: null, protocol: null, protocolBase: null, protocolKey: null, customizing: false,
    medication: plan.medication, dose: plan.dose || "", quantity: plan.quantity || 1,
    route: plan.route || "injection", frequency: plan.frequency || "weekly", halfLifeHours: plan.half_life_hours,
    phases: (plan.phases || []).map((p) => ({ ...p })),
  };
  const state = {
    title: plan.title, status: plan.status,
    instructions: plan.instructions || "", warnings: plan.warnings || "",
    labTests: (plan.labTests || []).map((l) => ({ ...l, on: true })),
    suppList: (plan.suppList || []).map((s) => ({ ...s, on: true })),
    changedMedication: false,
  };
  d.template = S.templates.find((t) => t.category === plan.category && (t.config.medication || t.name) === plan.medication) || null;

  paint();

  function paint() {
    const cats = [
      { key: "glp1", label: "GLP-1 / Weight loss" },
      { key: "peptide", label: "Peptide therapy" },
      { key: "custom", label: "Custom program" },
    ];
    view().innerHTML = `
    <div class="page-head">
      <div>
        <h1>Edit program</h1>
        <div class="sub">${esc(patient.name)} · published ${esc(fmtDate(plan.created_at))}${plan.updated_at && plan.updated_at !== plan.created_at ? ` · last edited ${esc(fmtDate(plan.updated_at))}` : ""}</div>
      </div>
      <a class="btn btn-ghost" href="#/patient/${patient.id}">${icon("chevL", 17)} Back to patient</a>
    </div>

    <div class="g-callout g-teal" style="margin-bottom:18px">${icon("info", 17)}
      <div>This program is live in ${esc(patient.name)}&rsquo;s portal. Saving updates what they see straight away, including their guide.</div></div>

    <div class="two-col">
      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="card card-pad">
          <div class="card-title">${icon("layers", 19)} Medication &amp; protocol</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
            ${cats.map((c) => `<button class="chip ${d.category === c.key ? "on" : ""}" data-cat="${c.key}">${esc(c.label)}</button>`).join("")}
          </div>
          <div id="ep-med"></div>
        </div>

        <div class="card card-pad">
          <div class="card-title">${icon("clipboard", 19)} Instructions &amp; warnings</div>
          <div class="field"><label for="ep-instr">Instructions for the patient</label><textarea class="input" id="ep-instr" rows="6">${esc(state.instructions)}</textarea></div>
          <div class="field"><label for="ep-warn">Warnings — when to contact you</label><textarea class="input" id="ep-warn" rows="4">${esc(state.warnings)}</textarea></div>
          ${state.changedMedication ? `<div class="g-callout g-amber">${icon("alert", 17)}<div>The medication changed. Check these still match — <button type="button" class="btn btn-ghost btn-sm" id="ep-regen" style="margin-left:4px">regenerate from the new protocol</button></div></div>` : ""}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:18px">
        <div class="card card-pad">
          <div class="card-title">${icon("droplet", 19)} Lab tests <span class="badge badge-gray" id="ep-lab-n">${state.labTests.filter((l) => l.on).length}</span></div>
          <div id="ep-labs"></div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <input class="input" id="ep-lab-add" placeholder="Add another test">
            <button class="btn btn-secondary btn-sm" id="ep-lab-btn" type="button">${icon("plus", 15)}</button>
          </div>
        </div>

        <div class="card card-pad">
          <div class="card-title">${icon("leaf", 19)} Supplements <span class="badge badge-gray" id="ep-supp-n">${state.suppList.filter((s) => s.on).length}</span></div>
          <div id="ep-supps"></div>
          <div class="form-grid" style="margin-top:10px">
            <div class="field" style="margin:0"><input class="input" id="ep-supp-add" placeholder="Supplement"></div>
            <div class="field" style="margin:0"><input class="input" id="ep-supp-dose" placeholder="Dose"></div>
          </div>
          <button class="btn btn-secondary btn-sm" id="ep-supp-btn" type="button" style="margin-top:8px">${icon("plus", 15)} Add supplement</button>
        </div>

        <div class="card card-pad">
          <div class="card-title">${icon("settings", 19)} Program</div>
          <div class="field"><label for="ep-title">Title</label><input class="input" id="ep-title" value="${esc(state.title)}"></div>
          <div class="field" style="margin-bottom:0"><label for="ep-status">Status</label>
            <select class="input" id="ep-status">
              ${["active", "completed", "stopped"].map((s) => `<option value="${s}" ${state.status === s ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
    </div>

    <p class="err-text" id="ep-err" hidden role="alert" style="margin-top:14px"></p>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px">
      <a class="btn btn-ghost" href="#/patient/${patient.id}">Cancel</a>
      <button class="btn btn-primary" id="ep-save">${icon("check", 17)} Save changes</button>
    </div>`;

    paintMedication();
    paintLabs();
    paintSupps();

    view().querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => {
      if (d.category === b.dataset.cat) return;
      d.category = b.dataset.cat;
      d.template = null; d.protocol = null; d.protocolKey = null; d.customizing = false;
      state.changedMedication = true;
      paint();
    }));
    document.getElementById("ep-instr").addEventListener("input", (e) => { state.instructions = e.target.value; });
    document.getElementById("ep-warn").addEventListener("input", (e) => { state.warnings = e.target.value; });
    document.getElementById("ep-title").addEventListener("input", (e) => { state.title = e.target.value; });
    document.getElementById("ep-status").addEventListener("change", (e) => { state.status = e.target.value; });
    const regen = document.getElementById("ep-regen");
    if (regen) regen.addEventListener("click", () => {
      const item = { ...d, category: d.category, template: d.template, protocol: d.protocol };
      state.instructions = defaultInstructionsFor(item) || state.instructions;
      state.warnings = defaultWarningsFor(item) || state.warnings;
      paint();
      toast("Instructions and warnings regenerated");
    });

    document.getElementById("ep-lab-btn").addEventListener("click", () => {
      const name = document.getElementById("ep-lab-add").value.trim();
      if (!name) return;
      state.labTests.push({ name, detail: "As requested by your doctor.", fasting: false, required: false, on: true });
      paint();
    });
    document.getElementById("ep-supp-btn").addEventListener("click", () => {
      const name = document.getElementById("ep-supp-add").value.trim();
      if (!name) return;
      state.suppList.push({ name, dose: document.getElementById("ep-supp-dose").value.trim(), benefit: "", on: true });
      paint();
    });
    document.getElementById("ep-save").addEventListener("click", save);
  }

  // The medication block mirrors the consultation's Program step: a template
  // grid, then the guidebook's dosing variants for whatever is chosen.
  function paintMedication() {
    const box = document.getElementById("ep-med");
    if (d.category === "custom") {
      box.innerHTML = `
      <div class="form-grid">
        <div class="field"><label for="ep-cu-med">Medication</label><input class="input" id="ep-cu-med" value="${esc(d.medication)}"></div>
        <div class="field"><label for="ep-cu-dose">Dose</label><input class="input" id="ep-cu-dose" value="${esc(d.dose)}"></div>
        <div class="field"><label for="ep-cu-route">Route</label><select class="input" id="ep-cu-route">${["injection", "oral", "nasal", "topical"].map((r) => `<option ${d.route === r ? "selected" : ""}>${r}</option>`).join("")}</select></div>
        <div class="field"><label for="ep-cu-freq">Frequency</label><select class="input" id="ep-cu-freq">${["daily", "twice daily", "weekly", "twice a week", "every 3 days", "every other day", "as needed"].map((f) => `<option ${d.frequency === f ? "selected" : ""}>${f}</option>`).join("")}</select></div>
      </div>
      ${phasesEditorFor(d.phases)}`;
      ["ep-cu-med", "ep-cu-dose", "ep-cu-route", "ep-cu-freq"].forEach((id) => box.querySelector("#" + id).addEventListener("input", () => {
        if (box.querySelector("#ep-cu-med").value !== d.medication) state.changedMedication = true;
        d.medication = box.querySelector("#ep-cu-med").value;
        d.dose = box.querySelector("#ep-cu-dose").value;
        d.route = box.querySelector("#ep-cu-route").value;
        d.frequency = box.querySelector("#ep-cu-freq").value;
      }));
      wirePhases(box, d.phases);
      return;
    }

    const tpls = S.templates.filter((t) => t.category === d.category);
    box.innerHTML = `
    <div class="tpl-grid">
      ${tpls.map((t) => `
        <button class="tpl-card ${d.template && d.template.id === t.id ? "sel" : ""}" data-tpl="${t.id}">
          ${icon(routeIcon(t.config.route || (t.config.protocols && t.config.protocols[0] && t.config.protocols[0].route)), 20)}
          <div class="tpl-name">${esc(t.name)}</div>
          <div class="tpl-sub">${d.category === "glp1" ? esc(t.config.generic || "") + " · " + esc(t.config.frequency) : esc(peptideCardSub(t))}</div>
        </button>`).join("")}
    </div>
    <div id="ep-tpl-detail" style="margin-top:18px"></div>`;

    box.querySelectorAll("[data-tpl]").forEach((b) => b.addEventListener("click", () => {
      const t = S.templates.find((x) => x.id === Number(b.dataset.tpl));
      if (d.template && d.template.id === t.id) return;
      d.template = t;
      d.medication = t.config.medication || t.name;
      state.changedMedication = true;
      if (d.category === "glp1") {
        d.route = t.config.route; d.frequency = t.config.frequency;
        d.halfLifeHours = t.config.halfLifeHours; d.dose = t.config.doses[0];
        d.phases = suggestTitration(t.config.doses, d.dose, t.config.titration);
      } else {
        const first = peptideProtocolOptions(d.medication, t)[0];
        d.protocolKey = first ? first.key : null;
        d.protocol = first ? first.protocol : (t.config.protocols || [])[0];
        d.protocolBase = d.protocol;
        if (d.protocol) applyProtocolTo(d);
      }
      paint();
    }));

    const det = document.getElementById("ep-tpl-detail");
    if (!d.template) { det.innerHTML = `<p class="hint">Pick a medication above to change this program.</p>`; return; }

    if (d.category === "glp1") {
      const doses = d.template.config.doses;
      det.innerHTML = `
      <hr class="divider">
      <div class="form-grid">
        <div class="field"><label for="ep-g-dose">Dose</label><select class="input" id="ep-g-dose">${doses.map((dd) => `<option ${d.dose === dd ? "selected" : ""}>${esc(dd)}</option>`).join("")}</select></div>
        <div class="field"><label for="ep-g-qty">Quantity (pens/units)</label><input class="input" id="ep-g-qty" type="number" min="1" step="1" value="${esc(d.quantity || 1)}"></div>
      </div>
      ${phasesEditorFor(d.phases)}`;
      det.querySelector("#ep-g-dose").addEventListener("change", (e) => {
        d.dose = e.target.value;
        d.phases = suggestTitration(doses, d.dose, d.template.config.titration);
        paint();
      });
      det.querySelector("#ep-g-qty").addEventListener("input", (e) => { d.quantity = Number(e.target.value) || 1; });
      wirePhases(det, d.phases);
      return;
    }

    const opts = peptideProtocolOptions(d.medication, d.template);
    const sel = opts.find((o) => o.key === d.protocolKey) || opts[0];
    if (sel && d.protocol !== sel.protocol && !d.customizing) { d.protocol = sel.protocol; d.protocolBase = sel.protocol; }
    det.innerHTML = `
    <hr class="divider">
    ${protocolPickerHTML(opts, sel)}
    ${protocolFactsHTML(sel)}
    ${phasesEditorFor(d.phases)}`;
    det.querySelectorAll("[data-vkey]").forEach((b) => b.addEventListener("click", () => {
      const opt = opts.find((o) => o.key === b.dataset.vkey);
      if (!opt) return;
      d.protocolKey = opt.key; d.protocol = opt.protocol; d.protocolBase = opt.protocol;
      applyProtocolTo(d);
      state.changedMedication = true;
      paint();
    }));
    wirePhases(det, d.phases);
  }

  function phasesEditorFor(phases) {
    return `<hr class="divider"><div class="card-title" style="font-size:14.5px">${icon("layers", 17)} Dose schedule</div>${phasesRows(phases)}`;
  }

  function paintLabs() {
    const box = document.getElementById("ep-labs");
    box.innerHTML = state.labTests.length ? state.labTests.map((l, i) => `
      <label class="pick-item ${l.on ? "on" : ""}">
        <input type="checkbox" data-eplab="${i}" ${l.on ? "checked" : ""}>
        <span class="pick-body">
          <span class="pick-name">${esc(l.name)}${l.required ? ` <span class="badge badge-red">required</span>` : ""}${l.fasting ? ` <span class="badge badge-gray">fasting</span>` : ""}</span>
          ${l.detail ? `<span class="pick-detail">${esc(l.detail)}</span>` : ""}
        </span>
      </label>`).join("") : `<p class="hint">No lab tests on this program.</p>`;
    box.querySelectorAll("[data-eplab]").forEach((cb) => cb.addEventListener("change", () => {
      state.labTests[Number(cb.dataset.eplab)].on = cb.checked;
      cb.closest(".pick-item").classList.toggle("on", cb.checked);
      document.getElementById("ep-lab-n").textContent = state.labTests.filter((l) => l.on).length;
    }));
  }

  function paintSupps() {
    const box = document.getElementById("ep-supps");
    box.innerHTML = state.suppList.length ? state.suppList.map((s, i) => `
      <label class="pick-item ${s.on ? "on" : ""}">
        <input type="checkbox" data-epsupp="${i}" ${s.on ? "checked" : ""}>
        <span class="pick-body">
          <span class="pick-name">${esc(s.name)}</span>
          ${s.dose ? `<span class="pick-detail">${esc(s.dose)}</span>` : ""}
        </span>
      </label>`).join("") : `<p class="hint">No supplements on this program.</p>`;
    box.querySelectorAll("[data-epsupp]").forEach((cb) => cb.addEventListener("change", () => {
      state.suppList[Number(cb.dataset.epsupp)].on = cb.checked;
      cb.closest(".pick-item").classList.toggle("on", cb.checked);
      document.getElementById("ep-supp-n").textContent = state.suppList.filter((s) => s.on).length;
    }));
  }

  async function save() {
    const err = document.getElementById("ep-err");
    err.hidden = true;
    if (!d.medication) { err.textContent = "Choose a medication before saving."; err.hidden = false; return; }
    const labs = state.labTests.filter((l) => l.on);
    const supps = state.suppList.filter((s) => s.on);
    try {
      await api("PATCH", `/api/plans/${plan.id}`, {
        title: state.title, status: state.status, category: d.category,
        medication: d.medication, dose: d.dose, quantity: d.quantity,
        route: d.route, frequency: d.frequency, halfLifeHours: d.halfLifeHours || null,
        phases: d.phases.filter((p) => p.label || p.dose),
        instructions: state.instructions, warnings: state.warnings,
        labTests: labs.map((l) => ({ name: l.name, detail: l.detail || "", fasting: !!l.fasting, required: !!l.required, link: l.link || "" })),
        suppList: supps.map((s) => ({ name: s.name, dose: s.dose || "", benefit: s.benefit || "" })),
        supplements: supps.map((s) => s.name + (s.dose ? ` (${s.dose})` : "")).join(", "),
        bloodTest: labs.length ? (labs.some((l) => l.required) ? "required" : "recommended") : "none",
      });
      toast("Program updated — the patient's guide is live");
      location.hash = `#/patient/${patient.id}`;
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  }
}

// ── roles ────────────────────────────────────────────────────────
const ROLE_LABEL = { superadmin: "Super admin", doctor: "Doctor", admin: "Admin" };
const ROLE_BLURB = {
  superadmin: "Full access, plus the team, the protocol library and the knowledge base.",
  doctor: "Runs consultations, prescribes, and signs guides and messages in their own name.",
  admin: "Sees patients, their programs and guides. Cannot start a consultation or change a program.",
};

// Shown instead of a page the signed-in role may not open. The server refuses
// these routes too — this is so the answer is an explanation rather than a
// failed request.
function viewNoAccess(pageLabel) {
  view().innerHTML = `
  <div class="page-head"><div><h1>${esc(pageLabel)}</h1><div class="sub">Not available on your account</div></div></div>
  <div class="card card-pad" style="max-width:560px">
    <div class="g-callout g-amber">${icon("shield", 18)}
      <div><strong>Your account is ${esc(ROLE_LABEL[S.user.role] || S.user.role)}.</strong>
      <div style="margin-top:3px">${esc(ROLE_BLURB[S.user.role] || "")}</div></div>
    </div>
    <p class="hint" style="margin-top:12px">Ask a super admin if you need this changed.</p>
    <a class="btn btn-secondary btn-sm" href="#/patients" style="margin-top:14px;display:inline-flex">${icon("users", 15)} Go to patients</a>
  </div>`;
}

// ── organisations ────────────────────────────────────────────────
// One install, several practices. Each organisation has its own staff and
// its own patients and sees nothing of any other's; only the clinical
// library — protocols, peptide info, the knowledge base — is shared.
async function viewOrgs() {
  view().innerHTML = `<div class="skel" style="height:110px;margin-bottom:16px"></div><div class="skel" style="height:280px"></div>`;
  const orgs = await api("GET", "/api/admin/orgs");
  view().innerHTML = `
  <div class="page-head">
    <div><h1>Organisations</h1><div class="sub">${orgs.filter((o) => o.active).length} active · ${orgs.reduce((n, o) => n + o.patients, 0)} patients in total</div></div>
    <button class="btn btn-primary" id="og-add">${icon("plus", 17)} New organisation</button>
  </div>
  <div class="card">
    ${orgs.map((o) => `
      <div class="pt-row" style="cursor:default">
        <div class="avatar">${esc(initials(o.name))}</div>
        <div class="pt-info">
          <div class="pt-name"><span>${esc(o.name)}</span>
            ${o.id === S.user.orgId ? `<span class="badge badge-teal">yours</span>` : ""}
            ${o.active ? "" : `<span class="badge badge-gray">deactivated</span>`}
          </div>
          <div class="pt-meta">${o.staff} staff · ${o.patients} patient${o.patients === 1 ? "" : "s"}${o.contact_email ? ` · ${esc(o.contact_email)}` : ""} · added ${esc(fmtDate(o.created_at))}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" data-og-team="${o.id}">${icon("users", 15)} Team</button>
          <button class="btn btn-ghost btn-sm" data-og-edit="${o.id}">${icon("edit", 15)} Edit</button>
          ${o.id === S.user.orgId ? "" : `<button class="btn btn-ghost btn-sm" data-og-active="${o.id}" data-next="${o.active ? 0 : 1}">${o.active ? "Deactivate" : "Reactivate"}</button>`}
        </div>
      </div>`).join("")}
  </div>
  <p class="hint" style="margin-top:14px">A new organisation starts with no patients and no history — only its first super admin, who then adds their own doctors and admins. Deactivating signs its staff out without deleting anything.</p>`;

  document.getElementById("og-add").addEventListener("click", () => orgModal(null, viewOrgs));
  view().querySelectorAll("[data-og-edit]").forEach((b) => b.addEventListener("click", () => {
    orgModal(orgs.find((o) => o.id === Number(b.dataset.ogEdit)), viewOrgs);
  }));
  view().querySelectorAll("[data-og-team]").forEach((b) => b.addEventListener("click", () => {
    S.teamOrgId = Number(b.dataset.ogTeam);
    location.hash = "#/team";
  }));
  view().querySelectorAll("[data-og-active]").forEach((b) => b.addEventListener("click", async () => {
    const o = orgs.find((x) => x.id === Number(b.dataset.ogActive));
    const next = Number(b.dataset.next);
    if (!next && !confirm(`Deactivate ${o.name}? Its ${o.staff} staff account${o.staff === 1 ? "" : "s"} will be signed out. Patient records are kept.`)) return;
    try {
      await api("PUT", `/api/admin/orgs/${o.id}`, { active: next });
      toast(next ? "Organisation reactivated" : "Organisation deactivated");
      viewOrgs();
    } catch (e) { toast(e.message); }
  }));
}

function orgModal(org, done) {
  const isNew = !org;
  const o = org || { name: "", contact_email: "", app_name: "" };
  const scrim = modal(`
    <div class="modal-head"><h3>${isNew ? "New organisation" : "Edit " + esc(o.name)}</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <form id="og-form">
      <div class="field"><label for="og-name">Organisation name <span class="req">*</span></label><input class="input" id="og-name" value="${esc(o.name)}" placeholder="Meridian Wellness Clinic" required></div>
      <div class="field"><label for="og-contact">Contact email</label><input class="input" id="og-contact" type="email" value="${esc(o.contact_email || "")}"></div>
      ${!isNew ? `
      <div class="field"><label for="og-app">Patient-facing app (optional)</label><input class="input" id="og-app" value="${esc(o.app_name || "")}" placeholder="e.g. DarDoc App — leave blank if this practice has none">
      <span class="hint">Named here, the patient guide explains that a subscribed patient gets everything inside it, and anyone without it gets a booking link instead — otherwise the guide stays general and never assumes one exists.</span></div>` : ""}
      ${isNew ? `
      <hr class="divider">
      <div class="card-title" style="font-size:14.5px">${icon("key", 17)} First super admin</div>
      <p class="hint" style="margin:-6px 0 12px">They sign in and add the rest of the team. This account cannot be created later without you.</p>
      <div class="form-grid">
        <div class="field"><label for="og-an">Full name <span class="req">*</span></label><input class="input" id="og-an" required placeholder="Dr Karim Nassar"></div>
        <div class="field"><label for="og-ac">Credentials</label><input class="input" id="og-ac" placeholder="MBBS"></div>
        <div class="field"><label for="og-ae">Email <span class="req">*</span></label><input class="input" id="og-ae" type="email" required></div>
        <div class="field"><label for="og-ap">Password <span class="req">*</span></label><input class="input" id="og-ap" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"></div>
      </div>` : ""}
      <p class="err-text" id="og-err" hidden role="alert"></p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" type="button" id="og-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">${isNew ? "Create organisation" : "Save changes"}</button>
      </div>
    </form>`);
  const g = (id) => scrim.querySelector("#" + id);
  g("og-cancel").addEventListener("click", () => scrim.remove());
  g("og-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = g("og-err");
    err.hidden = true;
    try {
      if (isNew) {
        await api("POST", "/api/admin/orgs", {
          name: g("og-name").value.trim(), contactEmail: g("og-contact").value.trim(),
          adminName: g("og-an").value.trim(), adminCredentials: g("og-ac").value.trim(),
          adminEmail: g("og-ae").value.trim(), adminPassword: g("og-ap").value,
        });
      } else {
        await api("PUT", `/api/admin/orgs/${o.id}`, { name: g("og-name").value.trim(), contactEmail: g("og-contact").value.trim(), appName: g("og-app").value.trim() });
      }
      scrim.remove();
      toast(isNew ? "Organisation created" : "Changes saved");
      done && done();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

// ── team ─────────────────────────────────────────────────────────
// The practice's staff accounts. Every doctor signs their own consultations,
// so adding a doctor here is what makes their name appear on the guides and
// messages they write.
async function viewTeam() {
  view().innerHTML = `<div class="skel" style="height:110px;margin-bottom:16px"></div><div class="skel" style="height:280px"></div>`;
  // The platform owner can arrive here from the Organisations page to manage
  // another practice's staff; everyone else sees their own.
  const orgId = isPlatformAdmin() && S.teamOrgId ? S.teamOrgId : S.user.orgId;
  const other = orgId !== S.user.orgId;
  const users = await api("GET", `/api/admin/users?org=${orgId}`);
  const orgName = other ? ((users[0] && users[0].orgName) || "another organisation") : (S.user.orgName || "");
  const active = users.filter((u) => u.active).length;
  view().innerHTML = `
  <div class="page-head">
    <div><h1>Team</h1><div class="sub">${esc(orgName)} · ${active} active ${active === 1 ? "account" : "accounts"}</div></div>
    <div style="display:flex;gap:8px">
      ${other ? `<a class="btn btn-ghost" href="#/orgs" id="tm-back">${icon("chevL", 17)} All organisations</a>` : ""}
      <button class="btn btn-primary" id="tm-add">${icon("plus", 17)} Add team member</button>
    </div>
  </div>
  ${other ? `<div class="g-callout g-amber" style="margin-bottom:16px">${icon("shield", 17)}<div>You are managing <b>${esc(orgName)}</b> as the platform owner. Their patients stay private to them.</div></div>` : ""}
  <div class="card">
    ${users.map((u) => `
      <div class="pt-row" style="cursor:default">
        <div class="avatar">${esc(initials(u.name))}</div>
        <div class="pt-info">
          <div class="pt-name"><span>${esc(u.name)}${u.credentials ? `<span style="font-weight:400;color:var(--muted)">, ${esc(u.credentials)}</span>` : ""}</span>
            <span class="badge ${u.role === "superadmin" ? "badge-teal" : u.role === "doctor" ? "badge-cyan" : "badge-gray"}">${esc(ROLE_LABEL[u.role] || u.role)}</span>
            ${u.active ? "" : `<span class="badge badge-gray">deactivated</span>`}
          </div>
          <div class="pt-meta">${esc(u.email)}${u.patients ? ` · ${u.patients} patient${u.patients === 1 ? "" : "s"}` : ""}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" data-tm-edit="${u.id}">${icon("edit", 15)} Edit</button>
          ${u.id === S.user.id ? "" : `<button class="btn btn-ghost btn-sm" data-tm-active="${u.id}" data-next="${u.active ? 0 : 1}">${u.active ? "Deactivate" : "Reactivate"}</button>`}
        </div>
      </div>`).join("")}
  </div>
  <p class="hint" style="margin-top:14px">Deactivating keeps every record that account signed — it only stops them signing in.</p>`;

  const backBtn = document.getElementById("tm-back");
  if (backBtn) backBtn.addEventListener("click", () => { S.teamOrgId = null; });
  document.getElementById("tm-add").addEventListener("click", () => teamMemberModal(null, viewTeam, orgId, orgName));
  view().querySelectorAll("[data-tm-edit]").forEach((b) => b.addEventListener("click", () => {
    teamMemberModal(users.find((u) => u.id === Number(b.dataset.tmEdit)), viewTeam, orgId, orgName);
  }));
  view().querySelectorAll("[data-tm-active]").forEach((b) => b.addEventListener("click", async () => {
    const u = users.find((x) => x.id === Number(b.dataset.tmActive));
    const next = Number(b.dataset.next);
    if (!next && !confirm(`Deactivate ${u.name}? They will be signed out and cannot sign in again until reactivated.`)) return;
    try {
      await api("PUT", `/api/admin/users/${u.id}`, { active: next });
      toast(next ? "Account reactivated" : "Account deactivated");
      viewTeam();
    } catch (e) { toast(e.message); }
  }));
}

// Add or edit a staff account. Password is required when creating and
// optional when editing (blank leaves the existing one alone).
function teamMemberModal(user, done, orgId, orgName) {
  const isNew = !user;
  // A brand-new account's Clinic field defaults to the organisation it's
  // being added into — never a name that happens to belong to a different
  // practice.
  const u = user || { name: "", email: "", role: "doctor", credentials: "", signature: "", clinic: orgName || S.user.orgName || "" };
  const roles = ["doctor", "admin", "superadmin"];
  const scrim = modal(`
    <div class="modal-head"><h3>${isNew ? "Add team member" : "Edit " + esc(u.name)}</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <p class="hint" style="margin-bottom:16px">Their name and credentials sign every guide, record and message they write.</p>
    <form id="tm-form">
      <div class="form-grid">
        <div class="field"><label for="tm-name">Full name <span class="req">*</span></label><input class="input" id="tm-name" value="${esc(u.name)}" placeholder="Dr Amina Haddad" required></div>
        <div class="field"><label for="tm-cred">Credentials</label><input class="input" id="tm-cred" value="${esc(u.credentials)}" placeholder="MBBS, MRCP"></div>
        <div class="field"><label for="tm-email">Email (their login) <span class="req">*</span></label><input class="input" id="tm-email" type="email" value="${esc(u.email)}" required></div>
        <div class="field"><label for="tm-pass">${isNew ? "Password" : "New password"} ${isNew ? '<span class="req">*</span>' : ""}</label><input class="input" id="tm-pass" type="password" autocomplete="new-password" minlength="8" ${isNew ? "required" : ""} placeholder="${isNew ? "At least 8 characters" : "Leave blank to keep current"}"></div>
        <div class="field full"><label for="tm-role">Role</label>
          <select class="input" id="tm-role">${roles.map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${ROLE_LABEL[r]}</option>`).join("")}</select>
          <span class="hint" id="tm-role-blurb">${esc(ROLE_BLURB[u.role])}</span>
        </div>
        <div class="field full"><label for="tm-sign">Extra signature lines</label><textarea class="input" id="tm-sign" rows="2" placeholder="DHA licence 12345&#10;Endocrinology">${esc(u.signature)}</textarea></div>
        <div class="field full"><label for="tm-clinic">Clinic</label><input class="input" id="tm-clinic" value="${esc(u.clinic)}"></div>
      </div>
      <div class="card" style="background:var(--bg);padding:12px 14px;margin:4px 0 14px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:700;margin-bottom:5px">Signature preview</div>
        <pre id="tm-preview" style="font-size:12.5px;color:var(--muted);white-space:pre-wrap;font-family:var(--font-body)"></pre>
      </div>
      <p class="err-text" id="tm-err" hidden role="alert"></p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" type="button" id="tm-cancel">Cancel</button>
        <button class="btn btn-primary" type="submit">${isNew ? "Create account" : "Save changes"}</button>
      </div>
    </form>`);

  const g = (id) => scrim.querySelector("#" + id);
  const refresh = () => {
    g("tm-role-blurb").textContent = ROLE_BLURB[g("tm-role").value] || "";
    g("tm-preview").textContent = signatureBlock({
      name: g("tm-name").value || "Name", credentials: g("tm-cred").value,
      signature: g("tm-sign").value, clinic: g("tm-clinic").value,
    });
  };
  ["tm-name", "tm-cred", "tm-sign", "tm-clinic", "tm-role"].forEach((id) => g(id).addEventListener("input", refresh));
  g("tm-role").addEventListener("change", refresh);
  refresh();
  g("tm-cancel").addEventListener("click", () => scrim.remove());
  g("tm-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = g("tm-err");
    err.hidden = true;
    const payload = {
      name: g("tm-name").value.trim(), email: g("tm-email").value.trim(), role: g("tm-role").value,
      credentials: g("tm-cred").value.trim(), signature: g("tm-sign").value.trim(), clinic: g("tm-clinic").value.trim(),
    };
    if (g("tm-pass").value) payload.password = g("tm-pass").value;
    if (isNew && orgId) payload.orgId = orgId;
    try {
      if (isNew) await api("POST", "/api/admin/users", payload);
      else await api("PUT", `/api/admin/users/${u.id}`, payload);
      scrim.remove();
      toast(isNew ? "Team member added" : "Changes saved");
      done && done();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

// ── settings ─────────────────────────────────────────────────────
function viewSettings() {
  const u = S.user;
  view().innerHTML = `
  <div class="page-head"><div><h1>Settings</h1><div class="sub">Your signature, account &amp; security</div></div></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px;align-items:start;max-width:1000px">
  <div class="card card-pad">
    <div class="card-title">${icon("edit", 19)} Your signature</div>
    <p class="hint" style="margin:-6px 0 14px">Signs every clinical record, patient guide and message you write. You are signed in as <b>${esc(ROLE_LABEL[u.role] || u.role)}</b>.</p>
    <form id="sig-form">
      <div class="field"><label for="sg-name">Full name</label><input class="input" id="sg-name" value="${esc(u.name || "")}" required></div>
      <div class="field"><label for="sg-cred">Credentials</label><input class="input" id="sg-cred" value="${esc(u.credentials || "")}" placeholder="MBBS, MSc"></div>
      <div class="field"><label for="sg-sign">Extra signature lines</label><textarea class="input" id="sg-sign" rows="2" placeholder="DHA licence 12345">${esc(u.signature || "")}</textarea></div>
      <div class="field"><label for="sg-clinic">Clinic</label><input class="input" id="sg-clinic" value="${esc(u.clinic || u.orgName || "")}"></div>
      <div class="card" style="background:var(--bg);padding:12px 14px;margin-bottom:14px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:700;margin-bottom:5px">Preview</div>
        <pre id="sg-preview" style="font-size:12.5px;color:var(--muted);white-space:pre-wrap;font-family:var(--font-body)"></pre>
      </div>
      <p class="err-text" id="sg-err" hidden role="alert"></p>
      <button class="btn btn-primary" type="submit">Save signature</button>
    </form>
  </div>
  <div class="card card-pad">
    <div class="card-title">${icon("key", 19)} Change password</div>
    <form id="pw-form">
      <div class="field"><label for="pw-cur">Current password</label><input class="input" id="pw-cur" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="pw-new">New password</label><input class="input" id="pw-new" type="password" autocomplete="new-password" minlength="8" required><span class="hint">At least 8 characters.</span></div>
      <p class="err-text" id="pw-err" hidden role="alert"></p>
      <button class="btn btn-primary" type="submit">Update password</button>
    </form>
  </div>
  </div>`;

  const sigPreview = () => {
    document.getElementById("sg-preview").textContent = signatureBlock({
      name: document.getElementById("sg-name").value,
      credentials: document.getElementById("sg-cred").value,
      signature: document.getElementById("sg-sign").value,
      clinic: document.getElementById("sg-clinic").value,
    });
  };
  ["sg-name", "sg-cred", "sg-sign", "sg-clinic"].forEach((id) => document.getElementById(id).addEventListener("input", sigPreview));
  sigPreview();
  document.getElementById("sig-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("sg-err");
    err.hidden = true;
    try {
      S.user = await api("PUT", "/api/me/signature", {
        name: document.getElementById("sg-name").value.trim(),
        credentials: document.getElementById("sg-cred").value.trim(),
        signature: document.getElementById("sg-sign").value.trim(),
        clinic: document.getElementById("sg-clinic").value.trim(),
      });
      renderShell();
      route();
      toast("Signature saved");
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
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
