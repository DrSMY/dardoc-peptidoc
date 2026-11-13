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
  // Any edit or tap inside a consultation starts a short idle timer; when it
  // fires the work so far is saved to Drafts.
  ["input", "click"].forEach((ev) => document.getElementById("view").addEventListener(ev, scheduleAutosave));
  refreshDraftBadge();
  refreshRefillBadge();
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
  // Walking away from a consultation mid-way keeps it as a draft.
  const inWizard = h.startsWith("#/consult");
  if (S.inWizard && !inWizard) { clearTimeout(autosaveTimer); persistDraft(false); }
  S.inWizard = inWizard;
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

  <div class="two-col" style="margin-bottom:20px">
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
          <div class="alert-item">
            <div class="alert-ico" style="background:var(--amber-soft);color:var(--amber)">${icon("syringe", 18)}</div>
            <div class="alert-body">
              <div class="alert-name">${esc(r.patient_name)}</div>
              <div class="alert-sym">${esc(r.medication)}${r.dose ? " · " + esc(r.dose) : ""}${r.dose_action ? " — " + esc(doseActionLabel(r.dose_action, r.requested_dose)) : ""}${r.has_side_effects === "yes" ? ` · side effects ${severityBadgeHTML(r.side_effect_severity)}` : ""}</div>
              <div class="alert-meta">${timeAgo(r.refill_requested_at)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
              <button class="btn btn-secondary btn-sm" data-review-refill="${r.plan_id}" data-review-patient="${r.patient_id}">Review</button>
              <a class="btn btn-ghost btn-sm" href="#/patient/${r.patient_id}">Open chart</a>
            </div>
          </div>`).join("") : `
          <div class="empty">${icon("checkCircle", 34)}<div class="empty-title">No pending refills</div><p>When a patient reports finishing a medication, it will appear here.</p></div>`}
        </div>
      </div>

    </div>

    <div>
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
  </div>

  <div id="patient-forms">${patientFormsCardHTML(d.patientForms)}</div>

  <div id="refill-due">${refillDueCardHTML(d.refillDue)}</div>`;

  view().querySelectorAll("[data-review]").forEach((b) => b.addEventListener("click", async () => {
    await api("POST", `/api/checkins/${b.dataset.review}/review`);
    toast("Alert marked as reviewed");
    viewDashboard();
  }));
  view().querySelectorAll("[data-review-refill]").forEach((b) => b.addEventListener("click", async () => {
    const planId = Number(b.dataset.reviewRefill);
    const detail = await api("GET", `/api/patients/${b.dataset.reviewPatient}`);
    const pl = detail.plans.find((x) => x.id === planId);
    // Older flags (set before this feature) may have no backing request row
    // — still reviewable, just without the "patient asked for" panel.
    const reqRow = (detail.refillRequests || []).find((r) => r.plan_id === planId && r.status === "pending");
    if (pl) refillFormModal(detail.patient, pl, reqRow);
  }));

  wirePatientForms(d.patientForms);
  wireRefillDue(d.refillDue);
  paintRefillBadge(d.refillDue.length);
  renderPracticeStats(d);
}

// ── who is up for refill ─────────────────────────────────────────────
// Everyone in the practice sees the same list and can contact a patient
// straight from it. WhatsApp and email carry the patient's refill link.
const REFILL_DUE_SHOWN = 6;

function dueLabel(due) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const days = Math.round((new Date(String(due).slice(0, 10) + "T12:00:00") - today) / 864e5);
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, cls: "badge-red" };
  if (days === 0) return { text: "Due today", cls: "badge-amber" };
  return { text: `Due in ${days} day${days === 1 ? "" : "s"}`, cls: "badge-amber" };
}

function refillDueRowHTML(r, i) {
  const due = dueLabel(r.due);
  const what = r.kind === "followup" ? "Follow-up visit, no medication" : r.medications.join(", ");
  return `
  <div class="due-row"${i >= REFILL_DUE_SHOWN ? " hidden" : ""}>
    <div class="avatar">${esc(initials(r.patient_name))}</div>
    <div class="due-info">
      <div class="due-name"><a href="#/patient/${r.patient_id}">${esc(r.title ? r.title + " " : "")}${esc(r.patient_name)}</a> <span class="badge ${due.cls}">${esc(due.text)}</span></div>
      <div class="pt-meta">${esc(what)}${r.doctor_name ? ` · ${esc(r.doctor_name)}` : ""} · +${esc(r.mobile)}</div>
    </div>
    <div class="due-actions">
      <button class="btn btn-accent btn-sm" type="button" data-due-wa="${i}">${icon("whatsapp", 15)} WhatsApp</button>
      <a class="btn btn-secondary btn-sm" href="${esc(telHref(r.mobile))}">${icon("phone", 15)} Call</a>
      <button class="btn btn-secondary btn-sm" type="button" data-due-email="${i}">${icon("mail", 15)} Email</button>
      <button class="btn btn-ghost btn-sm" type="button" data-due-ignore="${i}" aria-label="Ignore the reminder for ${esc(r.patient_name)}">Ignore</button>
    </div>
  </div>`;
}

function refillDueCardHTML(rows) {
  return `
  <div class="card" style="margin-bottom:20px">
    <div class="card-title" style="padding:18px 18px 4px;flex-wrap:wrap">${icon("calendar", 19)} Up for refill
      ${rows.length ? `<span class="badge badge-amber">${rows.length}</span>` : `<span class="badge badge-green">All clear</span>`}
    </div>
    ${rows.length ? `
      <p class="hint" style="padding:0 18px 8px;margin:0">Patients due in the next 7 days or overdue. Contact them here; the WhatsApp and email messages include their refill link.</p>
      ${rows.map(refillDueRowHTML).join("")}
      ${rows.length > REFILL_DUE_SHOWN ? `<div style="padding:12px 18px"><button class="linklike" type="button" id="due-more">Show all ${rows.length}</button></div>` : ""}`
    : `<p class="hint" style="padding:0 18px 18px;margin:0">No one needs contacting in the next 7 days.</p>`}
  </div>`;
}

// Redraws the card after Ignore or Undo, leaving "Show all" as it was.
function paintRefillDue(rows) {
  const box = document.getElementById("refill-due");
  if (box) {
    const showingAll = !box.querySelector("#due-more");
    box.innerHTML = refillDueCardHTML(rows);
    wireRefillDue(rows);
    if (showingAll && box.querySelector("#due-more")) box.querySelector("#due-more").click();
  }
  paintRefillBadge(rows.length);
}

// The message for one row: a refill request link when the patient has a
// program and this user may create one, otherwise a plain reminder.
async function refillDueMessage(r) {
  const clinic = S.user.clinic || S.user.orgName || "";
  const subject = r.kind === "followup" ? `Time for your follow-up${clinic ? ` — ${clinic}` : ""}` : `Time for your refill${clinic ? ` — ${clinic}` : ""}`;
  const person = { name: r.patient_name, title: r.title };
  if (r.kind === "refill" && canPrescribe()) {
    try {
      const link = await api("POST", `/api/patients/${r.patient_id}/refill-link`, {});
      return { subject, text: refillLinkMessage(person, `${location.origin}/r/${link.token}`) };
    } catch { /* fall through to the plain reminder */ }
  }
  const firstName = String(r.patient_name || "").trim().split(/\s+/)[0] || "there";
  const ask = r.kind === "followup" ? "It's time for your follow-up." : "Looks like you're due for your next refill.";
  return { subject, text: `Hi ${r.title ? r.title + " " : ""}${firstName},\n\n${ask} Please reply to this message and we'll arrange it for you.\n\n${signatureBlock(S.user)}` };
}

function wireRefillDue(rows) {
  const more = document.getElementById("due-more");
  if (more) more.addEventListener("click", () => {
    view().querySelectorAll(".due-row[hidden]").forEach((el) => { el.hidden = false; });
    more.parentNode.remove();
  });
  view().querySelectorAll("[data-due-wa]").forEach((b) => b.addEventListener("click", async () => {
    // Opened before the link is fetched, or the browser treats it as a pop-up.
    const win = window.open("", "_blank");
    const r = rows[Number(b.dataset.dueWa)];
    const { text } = await refillDueMessage(r);
    win.location = waLink(r.mobile, text);
  }));
  view().querySelectorAll("[data-due-email]").forEach((b) => b.addEventListener("click", async () => {
    const r = rows[Number(b.dataset.dueEmail)];
    const { subject, text } = await refillDueMessage(r);
    openEmail(r.email, subject, text);
  }));
  view().querySelectorAll("[data-due-ignore]").forEach((b) => b.addEventListener("click", async () => {
    const r = rows[Number(b.dataset.dueIgnore)];
    b.disabled = true;
    try {
      const out = await api("POST", `/api/refills/due/${r.patient_id}/ignore`, {});
      paintRefillDue(out.rows);
      toast(`${r.patient_name} removed from Up for refill`, "ok", {
        label: "Undo",
        onClick: async () => {
          try {
            paintRefillDue((await api("POST", `/api/refills/due/${r.patient_id}/restore`, { dues: out.dues })).rows);
          } catch (e) { toast(e.message, "bad"); }
        },
      });
    } catch (e) {
      b.disabled = false;
      toast(e.message, "bad");
    }
  }));
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

const DASH_RANGES = [
  { key: "all", label: "All time" },
  { key: "14", label: "Last 2 weeks" },
  { key: "30", label: "Last month" },
  { key: "90", label: "Last 3 months" },
  { key: "180", label: "Last 6 months" },
];

function practiceStatsHTML(d) {
  const filter = S.dashFilter || "all";
  const range = S.dashRange || "all";
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
  const doctorRows = (d.doctorBreakdown || []).filter((x) => x.consultations || x.prescriptions);
  const doctorMax = Math.max(1, ...doctorRows.map((x) => x.consultations));

  return `
  <div class="card card-pad" style="margin-bottom:20px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:10px">
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
    <div style="margin-bottom:16px">
      <div class="pstat-tabs">
        ${DASH_RANGES.map((r) => `<button class="pstat-tab ${range === r.key ? "on" : ""}" data-dashrange="${r.key}">${r.label}</button>`).join("")}
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
      <div class="stat pstat-kpi">
        <div class="stat-ico" style="background:var(--amber-soft);color:var(--amber)">${icon("syringe", 19)}</div>
        <div class="stat-val" data-count="${d.refillsTotal || 0}">0</div>
        <div class="stat-lbl">Refills processed</div>
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

    ${doctorRows.length > 1 ? `
    <div style="margin-top:18px">
      <div style="font-weight:700;font-size:13.5px;margin-bottom:10px">Consultations by doctor</div>
      ${doctorRows.map((x) => {
        const pct = Math.round((x.consultations / doctorMax) * 100);
        return `<div style="margin-bottom:9px">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px"><span>${esc(x.doctor_name)}</span><b>${x.consultations} consult${x.consultations === 1 ? "" : "s"} <span class="hint">· ${x.prescriptions} Rx</span></b></div>
          <div style="height:6px;border-radius:4px;background:#ECEBE3;overflow:hidden"><div class="bar-grow-x" style="width:${pct}%;height:100%;background:#283618;border-radius:4px"></div></div>
        </div>`;
      }).join("")}
    </div>` : ""}
  </div>`;
}

function renderPracticeStats(d) {
  const box = document.getElementById("practice-stats");
  if (!box) return;
  box.style.opacity = "";
  box.innerHTML = practiceStatsHTML(d);
  box.querySelectorAll("[data-count]").forEach((el) => {
    const target = Number(el.dataset.count) || 0;
    animateCountUp(el, target, 900, el.dataset.suffix || "");
  });
  box.querySelectorAll("[data-dashfilter]").forEach((b) => b.addEventListener("click", () => {
    S.dashFilter = b.dataset.dashfilter;
    renderPracticeStats(d);
  }));
  box.querySelectorAll("[data-dashrange]").forEach((b) => b.addEventListener("click", async () => {
    S.dashRange = b.dataset.dashrange;
    box.style.opacity = "0.5";
    try {
      Object.assign(d, await api("GET", `/api/dashboard?range=${encodeURIComponent(S.dashRange)}`));
    } catch { /* keep showing the previous range on failure */ }
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
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px 20px;flex-wrap:wrap">
    <div class="field" style="flex:1 1 280px;max-width:420px">
      <label for="pt-search" style="position:absolute;left:-9999px">Search patients</label>
      <input class="input" id="pt-search" type="search" placeholder="Search by name or mobile…">
    </div>
    ${isSuperadmin() ? `
    <div role="group" aria-label="Download the practice report as Excel" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:16px">
      <span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--muted);margin-right:2px">${icon("file", 15)} Excel report</span>
      ${[["month", "This month"], ["3m", "3 months"], ["6m", "6 months"], ["all", "All"]].map(([r, label]) =>
        `<a class="btn btn-secondary btn-sm" href="/api/reports/practice?range=${r}" download>${label}</a>`).join("")}
    </div>` : ""}
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
  const { patient: p, plans, doses, checkins, messages, refillRequests, visits, patientForms, fileEdits } = d;
  const activePlan = plans.find((pl) => pl.status === "active");
  const weights = checkins.filter((c) => c.weight_kg != null).map((c) => ({ x: c.date, y: c.weight_kg })).reverse();
  // The patient's actual current weight — the latest logged weight (check-ins
  // and refills both log one), else their recorded current weight, else their
  // starting weight. Computed before the starting-weight anchor below.
  const latestWeight = weights.length ? weights[weights.length - 1].y : (p.current_weight_kg || p.start_weight_kg);
  // Anchor the trend at the weight they started on, so "Change" means change
  // since registration even when only one weight has been logged since.
  const startDate = p.created_at.slice(0, 10);
  if (p.start_weight_kg && (!weights.length || weights[0].x > startDate)) weights.unshift({ x: startDate, y: p.start_weight_kg });
  const bmi = calcBMIClient(p.height_cm, latestWeight);
  const wtChange = weights.length > 1 ? (weights[weights.length - 1].y - weights[0].y) : null;
  // The consultation record, followed by every refill since, so "Copy record"
  // carries the refills into the practice's EMR too.
  const visitRecords = [...visits].reverse().map((v) => v.clinical_suggestion);
  const clinicalRecord = [activePlan && activePlan.clinical_suggestion, ...visitRecords, refillRecordText(p, plans, refillRequests)].filter(Boolean).join("\n\n");

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
      <button class="btn btn-primary btn-sm" id="btn-new-program">${icon("plus", 16)} New program</button>` : ""}
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

  const newProgBtn = document.getElementById("btn-new-program");
  if (newProgBtn) newProgBtn.addEventListener("click", () => {
    const active = plans.filter((pl) => pl.status === "active");
    if (!active.length) { location.hash = `#/consult?patient=${p.id}`; return; }
    refillOrNewChooserModal(p, active);
  });

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
            <div class="card-title" style="justify-content:space-between">
              <span style="display:flex;align-items:center;gap:10px">${icon("user", 19)} Patient chart</span>
              ${isSuperadmin() ? `<button class="btn btn-secondary btn-sm" type="button" data-file-edit="chart">${icon("edit", 15)} Edit</button>` : ""}
            </div>
            <div class="emr-grid">
              <div><span class="emr-lbl">Name</span><span class="emr-val">${esc(p.title ? p.title + " " : "")}${esc(p.name)}</span></div>
              <div><span class="emr-lbl">Patient no.</span><span class="emr-val">${esc(p.id)}</span></div>
              <div><span class="emr-lbl">Age</span><span class="emr-val">${p.age ? esc(p.age) + " years" : "—"}</span></div>
              ${p.dob ? `<div><span class="emr-lbl">Date of birth</span><span class="emr-val">${esc(fmtDate(p.dob))}</span></div>` : ""}
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
              ${refillRequests.length ? `<div class="full"><span class="emr-lbl">Latest refill</span><span class="emr-val">${latestRefillSummaryHTML(refillRequests[0], plans)}</span></div>` : ""}
            </div>
          </div>

          ${patientFormFileCardHTML(patientForms)}

          ${clinicalRecord ? `
          <div class="card card-pad">
            <div class="card-title" style="justify-content:space-between">
              <span style="display:flex;align-items:center;gap:10px">${icon("file", 19)} Clinical record (EMR)</span>
              <span style="display:flex;gap:6px;flex-wrap:wrap">
                ${isSuperadmin() && (activePlan || visits.length) ? `<button class="btn btn-secondary btn-sm" type="button" data-file-edit="record">${icon("edit", 15)} Edit</button>` : ""}
                <button class="btn btn-secondary btn-sm" id="rec-copy" type="button">${icon("copy", 15)} Copy record</button>
              </span>
            </div>
            <pre style="margin:0;font-family:ui-monospace,Menlo,monospace;font-size:12px;white-space:pre-wrap;line-height:1.5;color:var(--muted)">${esc(clinicalRecord)}</pre>
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
                  <button class="btn btn-ghost btn-sm" data-refill="${pl.id}">${icon("syringe", 15)} Refill</button>
                  <button class="btn btn-ghost btn-sm" data-stop="${pl.id}">Stop</button>` : ""}` : ""}
                </div>
              </div>`).join("") : `<div class="empty">${icon("layers", 30)}<p>No programs yet. Start a consultation to publish one.</p></div>`}
          </div>

          ${refillHistoryCardHTML(plans, refillRequests)}

          ${fileEditsCardHTML(fileEdits)}
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
      wireFileEditing(box, { p, plans, doses, checkins, refillRequests, visits, reload: () => viewPatient(id) });
      const recCopy = box.querySelector("#rec-copy");
      if (recCopy) recCopy.addEventListener("click", async () => { await navigator.clipboard.writeText(clinicalRecord); toast("Clinical record copied"); });
      box.querySelectorAll("[data-stop]").forEach((b) => b.addEventListener("click", async () => {
        if (!confirm("Stop this program? The patient will see it as stopped.")) return;
        await api("PATCH", `/api/plans/${b.dataset.stop}`, { status: "stopped" });
        toast("Program stopped");
        viewPatient(id);
      }));
      box.querySelectorAll("[data-refill]").forEach((b) => b.addEventListener("click", () => {
        const pl = plans.find((x) => x.id === Number(b.dataset.refill));
        if (pl) refillFormModal(p, pl);
      }));
      box.querySelectorAll("[data-review-refill]").forEach((b) => b.addEventListener("click", () => {
        const planId = Number(b.dataset.reviewRefill);
        const pl = plans.find((x) => x.id === planId);
        const reqRow = refillRequests.find((r) => r.plan_id === planId && r.status === "pending");
        if (pl) refillFormModal(p, pl, reqRow);
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
      // Nothing active and the latest visit prescribed nothing: their guide is
      // their health plan.
      if (!active.length && visits.length) {
        box.innerHTML = `
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <button class="btn btn-secondary btn-sm" id="btn-copytext">${icon("copy", 16)} Copy guide text</button>
          <a class="btn btn-secondary btn-sm" href="/api/patients/${p.id}/guide-pdf" download>${icon("file", 16)} Download PDF</a>
          <button class="btn btn-secondary btn-sm" id="btn-pdf">${icon("file", 16)} Send PDF</button>
          <button class="btn btn-accent btn-sm" id="btn-wa">${icon("whatsapp", 16)} Send guide link</button>
        </div>
        ${buildVisitGuide(visits[0], p, S.user.name)}`;
        document.getElementById("btn-copytext").addEventListener("click", async () => {
          await navigator.clipboard.writeText(buildVisitGuideText(visits[0], p, S.user.name));
          toast("Guide text copied");
        });
        document.getElementById("btn-pdf").addEventListener("click", () => guidePdfModal({ ...p, noMedication: true }));
        document.getElementById("btn-wa").addEventListener("click", () => guideLinkModal({ ...p, noMedication: true }));
        return;
      }
      const guidePlans = active.length ? active : (plans[0] ? [plans[0]] : []);
      const primaryPl = guidePlans.find((pl) => pl.category === "glp1") || guidePlans[0];
      const activeId = S.guidePlanId && guidePlans.some((pl) => pl.id === S.guidePlanId) ? S.guidePlanId : (primaryPl && primaryPl.id);
      const renderOne = (pl) => buildGuide(pl, p, S.user.name);
      box.innerHTML = guidePlans.length ? `
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <button class="btn btn-secondary btn-sm" id="btn-copytext">${icon("copy", 16)} Copy guide text</button>
          <a class="btn btn-secondary btn-sm" href="/api/patients/${p.id}/guide-pdf" download>${icon("file", 16)} Download PDF</a>
          <button class="btn btn-secondary btn-sm" id="btn-refilllink">${icon("syringe", 16)} Send refill link</button>
          <button class="btn btn-secondary btn-sm" id="btn-pdf">${icon("file", 16)} Send PDF</button>
          <button class="btn btn-accent btn-sm" id="btn-wa">${icon("whatsapp", 16)} Send guide link</button>
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
        document.getElementById("btn-pdf").addEventListener("click", () => guidePdfModal(p));
        document.getElementById("btn-wa").addEventListener("click", () => guideLinkModal(p));
        document.getElementById("btn-refilllink").addEventListener("click", () => refillLinkModal(p));
      }
    }

    if (S.detailTab === "logs") {
      const admin = isSuperadmin();
      const addBtn = (kind, label) => (admin ? `<button class="btn btn-secondary btn-sm" type="button" data-file-edit="${kind}">${icon("plus", 15)} ${label}</button>` : "");
      box.innerHTML = `
      <div class="two-col">
        <div class="card card-pad">
          <div class="card-title card-title-split">
            <span>${icon("syringe", 19)} Dose log</span>${addBtn("dose", "Add dose")}
          </div>
          ${doses.length ? `<div class="table-scroll"><table class="table dose-table">
            <thead><tr><th>Date</th><th>Dose</th><th>Site</th><th>Notes</th>${admin ? `<th><span style="position:absolute;left:-9999px">Actions</span></th>` : ""}</tr></thead>
            <tbody>${doses.map((dl) => `<tr><td>${esc(fmtDate(dl.taken_at, true))}</td><td data-label="Dose"${dl.dose ? "" : ` class="is-empty"`}>${esc(dl.dose || "—")}</td><td data-label="Site"${dl.site ? "" : ` class="is-empty"`}>${esc(dl.site || "—")}</td><td data-label="Notes"${dl.notes ? "" : ` class="is-empty"`}>${esc(dl.notes || "")}</td>${admin ? `<td class="dose-acts" style="text-align:right;white-space:nowrap">${fileActs("dose", dl.id)}</td>` : ""}</tr>`).join("")}</tbody>
          </table></div>` : `<div class="empty">${icon("syringe", 30)}<p>No doses logged yet.</p></div>`}
        </div>
        <div class="card card-pad">
          <div class="card-title card-title-split">
            <span>${icon("clipboard", 19)} Check-in history</span>${addBtn("checkin", "Add weight or check-in")}
          </div>
          ${checkins.length ? checkins.map((c) => checkinCard(c, fileActs("checkin", c.id))).join("") : `<div class="empty">${icon("clipboard", 30)}<p>No check-ins yet.</p></div>`}
        </div>
      </div>`;
      wireFileEditing(box, { p, plans, doses, checkins, refillRequests, visits, reload: () => viewPatient(id) });
    }

    if (S.detailTab === "messages") {
      box.innerHTML = `
      <div class="card card-pad" style="max-width:680px">
        <div class="card-title">${icon("message", 19)} Messages with ${esc(p.name)}</div>
        <div class="msg-list" id="msg-list">
          ${messages.length ? messages.map((m) => `
            <div class="msg ${m.sender}">
              <span class="msg-body">${esc(m.body)}</span>
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

// The patient's own account of their last lab test, from the patient form.
const labDateDMY = (intake) => String(intake.last_lab_date || "").split("-").reverse().join("/");
const abnormalLabsText = (intake) => (intake.abnormal_labs || []).map((l) => [l.name, l.value].filter(Boolean).join(" ")).join("; ");

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
  if (intake.planning_pregnancy === "Yes") rows.push(`<div><b>Planning a pregnancy:</b> Yes</div>`);
  if (intake.thyroid_history && intake.thyroid_history !== "No") rows.push(`<div><b>Medullary thyroid cancer or MEN 2:</b> ${esc(intake.thyroid_history)}</div>`);
  if (intake.pancreas_history && intake.pancreas_history !== "No") rows.push(`<div><b>Pancreatitis or gallbladder problems:</b> ${esc(intake.pancreas_history)}</div>`);
  if (intake.last_lab_date) rows.push(`<div><b>Last lab test:</b> ${esc(labDateDMY(intake))}</div>`);
  if (abnormalLabsText(intake)) rows.push(`<div><b>Abnormal lab results, as reported by the patient:</b> ${esc(abnormalLabsText(intake))}</div>`);
  if (activityDetailSummary(intake.activity_detail)) rows.push(`<div><b>Exercise:</b> ${esc(activityDetailSummary(intake.activity_detail))}</div>`);
  if (intake.additional_notes) rows.push(`<div><b>Patient notes:</b> ${esc(intake.additional_notes)}</div>`);
  if (!rows.length) return "";
  return `<div class="card card-pad">
    <div class="card-title">${icon("clipboard", 19)} Intake &amp; assessment</div>
    <div style="font-size:13.5px;display:flex;flex-direction:column;gap:10px;overflow-wrap:anywhere">${rows.join("")}</div>
  </div>`;
}

function checkinCard(c, acts = "") {
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
    ${acts}
  </div>`;
}

// modal() lives in shared.js — used across doctor/portal/guide pages.

// ── Super admin: correcting a patient's file ─────────────────────
// The chart, the record text, and single entries in the dose, weight,
// check-in and refill logs. The server refuses these for anyone else, so the
// buttons are only drawn for the Super admin. None of it changes what the
// patient is prescribed (that is Edit program); it corrects what the file says.
function fileActs(kind, id) {
  return isSuperadmin() ? `
    <span class="file-acts">
      <button type="button" class="btn btn-ghost btn-sm" data-file-edit="${kind}" data-id="${id}">Edit</button>
      <button type="button" class="btn btn-ghost btn-sm" data-file-del="${kind}" data-id="${id}">Delete</button>
    </span>` : "";
}

// A form in a modal: Save shows the server's message if it refuses.
function fileFormModal({ title, hint, body, wide, saveLabel = "Save changes", onOpen, onSave }) {
  const scrim = modal(`
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    ${hint ? `<p class="hint" style="margin:-6px 0 14px">${hint}</p>` : ""}
    <form id="ff-form" novalidate>
      ${body}
      <p class="err-text" id="ff-err" role="alert" hidden></p>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px">
        <button type="button" class="btn btn-secondary" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary" id="ff-save"><span class="spin"></span><span class="btn-label">${esc(saveLabel)}</span></button>
      </div>
    </form>`, wide);
  const err = scrim.querySelector("#ff-err"), btn = scrim.querySelector("#ff-save");
  if (onOpen) onOpen(scrim);
  scrim.querySelector("#ff-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    btn.classList.add("loading"); btn.disabled = true;
    try { await onSave(scrim); scrim.remove(); }
    catch (ex) { err.textContent = ex.message || "Couldn't save. Please try again."; err.hidden = false; }
    finally { btn.classList.remove("loading"); btn.disabled = false; }
  });
  return scrim;
}
const numOrNull = (v) => (String(v ?? "").trim() === "" ? null : Number(v));

function patientChartEditModal(p, reload) {
  // A working copy shaped like the consultation's patient, so the intake
  // questions drawn there can be reused here.
  const draft = { gender: p.gender || "", activityLevel: p.activity_level || "", title: p.title || "", intake: JSON.parse(JSON.stringify(p.intake || {})) };
  const formOnly = ["planning_pregnancy", "thyroid_history", "pancreas_history"];
  const v = (x) => esc(x ?? "");
  const titles = [...new Set(["Mr", "Ms", "Mrs", "Dr", p.title].filter(Boolean))];
  const chips = (key, options) => options.map((o) => `<button type="button" class="chip ${draft[key] === o ? "on" : ""}" data-fe-chip="${key}" data-v="${esc(o)}">${esc(o)}</button>`).join("");
  const body = `
    <div class="intake-sec-title first">${icon("user", 15)} Identity</div>
    <div class="form-grid">
      <div class="field full"><label for="fe-name">Full name (as per passport/ID)</label><input class="input" id="fe-name" value="${v(p.name)}" autocomplete="off"></div>
      <div class="field full"><label>Title</label><div class="chip-row" id="fe-title">${chips("title", titles)}</div></div>
      <div class="field"><label for="fe-mobile">Mobile number</label><input class="input" id="fe-mobile" type="tel" inputmode="tel" value="${v(p.mobile)}"><span class="hint">This is also the patient's sign-in for the patient app.</span></div>
      <div class="field"><label for="fe-email">Email</label><input class="input" id="fe-email" type="email" value="${v(p.email)}"></div>
      <div class="field full"><label for="fe-natid">Emirates ID / passport number</label><input class="input" id="fe-natid" value="${v(p.national_id)}" autocomplete="off"></div>
      <div class="field"><label for="fe-dob">Date of birth</label><input class="input" id="fe-dob" type="date" min="1900-01-01" max="${todayISO()}" value="${v(p.dob)}"></div>
      <div class="field"><label for="fe-age">Age</label><input class="input" id="fe-age" type="number" inputmode="numeric" min="12" max="110" value="${v(p.age)}"><span class="hint">Worked out from the date of birth when one is set.</span></div>
      <div class="field full"><label>Gender</label><div class="chip-row" id="fe-gender">${chips("gender", ["Male", "Female", "Other"])}</div></div>
    </div>
    <div class="intake-sec-title">${icon("scale", 15)} Measurements</div>
    <div class="form-grid">
      <div class="field"><label for="fe-height">Height (cm)</label><input class="input" id="fe-height" type="number" inputmode="decimal" min="100" max="250" step="0.1" value="${v(p.height_cm)}"></div>
      <div class="field"><label for="fe-start">Starting weight (kg)</label><input class="input" id="fe-start" type="number" inputmode="decimal" min="25" max="350" step="0.1" value="${v(p.start_weight_kg)}"></div>
      <div class="field"><label for="fe-max">Maximum weight reached (kg)</label><input class="input" id="fe-max" type="number" inputmode="decimal" min="25" max="350" step="0.1" value="${v(p.max_weight_kg)}"></div>
      <div class="field"><label for="fe-goal">Goal weight (kg)</label><input class="input" id="fe-goal" type="number" inputmode="decimal" min="25" max="350" step="0.1" value="${v(p.goal_weight_kg)}"></div>
      <div class="field full"><span class="hint">The current weight is the latest weight on the Logs tab. Correct or add weights there.</span></div>
      <div class="field full"><label>Activity level</label><div class="chip-row" id="fe-activity">${chips("activityLevel", Object.keys(S.presets.activityLevels || {}))}</div></div>
    </div>
    <div class="intake-sec-title">${icon("clipboard", 15)} Medical chart</div>
    <div class="field"><label for="fe-chronic">Chronic illnesses</label><textarea class="input" id="fe-chronic" rows="2" placeholder="None reported">${v(p.chronic_illnesses)}</textarea></div>
    <div class="field"><label for="fe-meds">Current medications</label><textarea class="input" id="fe-meds" rows="2" placeholder="None reported">${v(p.medications)}</textarea></div>
    <div class="field"><label for="fe-allergies">Allergies</label><textarea class="input" id="fe-allergies" rows="2" placeholder="No known drug allergies">${v(p.allergies)}</textarea></div>
    <div class="field"><label for="fe-notes">Notes</label><textarea class="input" id="fe-notes" rows="2">${v(p.notes)}</textarea></div>
    <div class="intake-sec-title">${icon("clipboard", 15)} Intake answers</div>
    <p class="hint" style="margin:-4px 0 10px">Shown under Intake &amp; assessment on the patient page.</p>
    <div id="fe-intake"></div>`;

  const paintIntake = (scrim) => {
    const box = scrim.querySelector("#fe-intake");
    const qs = S.presets.intakeQuestions.filter((q) => !q.patientField && intakeVisible(q, draft)
      && !(formOnly.includes(q.id) && (p.intake || {})[q.id] === undefined)
      && !(draft.gender === "Male" && /pregnan|breastfeed/.test(q.id)));
    let section = "";
    box.innerHTML = qs.map((q) => {
      const head = q.section !== section ? `<div class="fe-sub">${esc(q.section)}</div>` : "";
      section = q.section;
      const sev = q.id === "allergies" && draft.intake.allergies__gate === true ? `
        <div class="field"><label>Allergy severity</label><div class="chip-row">${["Mild", "Moderate", "Severe / life-threatening"].map((x) =>
          `<button type="button" class="chip ${draft.intake.allergies__severity === x ? "on" : ""}" data-iqchip="allergies__severity" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div></div>` : "";
      return head + renderIntakeQuestion(q, draft) + sev;
    }).join("");
    wireIntake(box, () => paintIntake(scrim), draft);
  };

  fileFormModal({
    title: `Edit ${p.name}'s chart`, wide: true,
    hint: "Corrects the patient's details and medical chart. Every change is kept in the edit history.",
    body,
    onOpen(scrim) {
      paintIntake(scrim);
      scrim.querySelectorAll("[data-fe-chip]").forEach((b) => b.addEventListener("click", () => {
        const key = b.dataset.feChip;
        draft[key] = draft[key] === b.dataset.v ? "" : b.dataset.v;
        b.parentNode.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c.dataset.v === draft[key]));
        if (key === "gender") paintIntake(scrim);
      }));
      const dob = scrim.querySelector("#fe-dob"), age = scrim.querySelector("#fe-age");
      const syncAge = () => { age.disabled = !!dob.value; };
      dob.addEventListener("input", syncAge);
      syncAge();
    },
    async onSave(scrim) {
      const g = (id) => scrim.querySelector("#" + id).value;
      const dob = g("fe-dob");
      await api("PATCH", `/api/patients/${p.id}`, {
        fileEdit: true,
        name: g("fe-name"), title: draft.title, mobile: g("fe-mobile"), email: g("fe-email").trim(), nationalId: g("fe-natid").trim(),
        dob, ...(dob ? {} : { age: numOrNull(g("fe-age")) }), gender: draft.gender,
        heightCm: numOrNull(g("fe-height")), startWeightKg: numOrNull(g("fe-start")), maxWeightKg: numOrNull(g("fe-max")), goalWeightKg: numOrNull(g("fe-goal")),
        activityLevel: draft.activityLevel || "Sedentary",
        chronicIllnesses: g("fe-chronic").trim(), medications: g("fe-meds").trim(), allergies: g("fe-allergies").trim(), notes: g("fe-notes").trim(),
        intake: draft.intake,
      });
      toast("Chart updated");
      reload();
    },
  });
}

function clinicalRecordEditModal(p, plans, visits, reload) {
  const active = plans.find((pl) => pl.status === "active");
  const records = [
    ...(active ? [{ key: "planId", id: active.id, label: `Consultation record, ${fmtDate(active.created_at)}`, text: active.clinical_suggestion || "" }] : []),
    ...[...visits].reverse().map((vr) => ({ key: "visitId", id: vr.id, label: `Visit record, ${fmtDate(vr.created_at)}`, text: vr.clinical_suggestion || "" })),
  ];
  if (!records.length) return toast("There is no consultation record to edit yet", "bad");
  fileFormModal({
    title: "Edit clinical record", wide: true,
    hint: "Corrects the wording of the record. Refill updates at the end of the record are written from the refill history, so correct those under Refill requests &amp; history.",
    body: records.map((r, i) => `
      <div class="field"><label for="fr-${i}">${esc(r.label)}</label>
        <textarea class="input" id="fr-${i}" rows="${records.length > 1 ? 12 : 20}" spellcheck="true" style="font-family:ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.5">${esc(r.text)}</textarea></div>`).join(""),
    async onSave(scrim) {
      let changed = 0;
      for (const [i, r] of records.entries()) {
        const text = scrim.querySelector(`#fr-${i}`).value;
        if (text === r.text) continue;
        await api("PATCH", `/api/patients/${p.id}/clinical-record`, { [r.key]: r.id, text });
        changed++;
      }
      toast(changed ? "Clinical record updated" : "Nothing was changed");
      if (changed) reload();
    },
  });
}

// "2026-07-27T07:33:00.000Z" as the value a date-and-time field shows locally.
function localDateTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function doseEditModal(p, plans, dose, reload) {
  const active = plans.filter((pl) => pl.status === "active");
  const plan = dose ? plans.find((pl) => pl.id === dose.plan_id) : active[0];
  const sites = [...new Set([...INJECTION_SITES.map((z) => z.name), dose && dose.site].filter(Boolean))];
  fileFormModal({
    title: dose ? "Edit dose" : "Add a dose",
    hint: dose ? "Corrects this entry in the dose log." : `Adds a dose to ${esc(p.name)}'s log, as if they had logged it themselves.`,
    saveLabel: dose ? "Save changes" : "Add dose",
    body: `
      ${!dose && active.length > 1 ? `<div class="field"><label for="fd-plan">Medication</label><select class="input" id="fd-plan">${active.map((pl) => `<option value="${pl.id}">${esc(pl.medication)}</option>`).join("")}</select></div>` : ""}
      <div class="form-grid">
        <div class="field"><label for="fd-at">Date and time taken</label><input class="input" id="fd-at" type="datetime-local" max="${localDateTime()}" value="${localDateTime(dose && dose.taken_at)}"></div>
        <div class="field"><label for="fd-dose">Dose</label><input class="input" id="fd-dose" value="${esc(dose ? dose.dose || "" : (plan && plan.dose) || "")}" list="fd-doses" autocomplete="off">
          <datalist id="fd-doses">${((plan && plan.doseOptions) || []).map((d) => `<option value="${esc(d)}">`).join("")}</datalist></div>
        <div class="field full"><label for="fd-site">Site</label><input class="input" id="fd-site" value="${esc((dose && dose.site) || "")}" list="fd-sites" autocomplete="off" placeholder="Where it was injected or applied (optional)">
          <datalist id="fd-sites">${sites.map((x) => `<option value="${esc(x)}">`).join("")}</datalist></div>
        <div class="field full"><label for="fd-notes">Notes</label><textarea class="input" id="fd-notes" rows="2">${esc((dose && dose.notes) || "")}</textarea></div>
      </div>`,
    onOpen(scrim) {
      const sel = scrim.querySelector("#fd-plan");
      if (sel) sel.addEventListener("change", () => { const pl = active.find((x) => x.id === Number(sel.value)); scrim.querySelector("#fd-dose").value = (pl && pl.dose) || ""; });
    },
    async onSave(scrim) {
      const g = (id) => scrim.querySelector("#" + id);
      const at = g("fd-at").value;
      if (!at) throw new Error("Enter the date and time the dose was taken.");
      const payload = { takenAt: new Date(at).toISOString(), dose: g("fd-dose").value, site: g("fd-site").value, notes: g("fd-notes").value };
      if (dose) await api("PATCH", `/api/dose-logs/${dose.id}`, payload);
      else await api("POST", `/api/patients/${p.id}/dose-logs`, { ...payload, planId: g("fd-plan") ? Number(g("fd-plan").value) : plan && plan.id });
      toast(dose ? "Dose updated" : "Dose added");
      reload();
    },
  });
}

function checkinEditModal(p, c, reload) {
  const sym = (c && c.symptoms) || {};
  fileFormModal({
    title: c ? "Edit weight or check-in" : "Add a weight or check-in", wide: true,
    hint: c ? "Corrects this entry. The patient's current weight follows the latest weight in the log." : `Adds an entry to ${esc(p.name)}'s log. A weight alone is enough.`,
    saveLabel: c ? "Save changes" : "Add entry",
    body: `
      <div class="form-grid">
        <div class="field"><label for="fc-date">Date</label><input class="input" id="fc-date" type="date" max="${todayISO()}" value="${esc((c && c.date) || todayISO())}"></div>
        <div class="field"><label for="fc-weight">Weight (kg)</label><input class="input" id="fc-weight" type="number" inputmode="decimal" min="20" max="400" step="0.1" value="${esc((c && c.weight_kg) ?? "")}"></div>
      </div>
      <div class="intake-sec-title">${icon("activity", 15)} Symptoms</div>
      <div class="form-grid">${S.presets.symptoms.map((s) => `
        <div class="field"><label for="fc-s-${s.key}">${esc(s.label)}</label>
          <select class="input" id="fc-s-${s.key}" data-sym="${s.key}"><option value="">Not recorded</option>${s.options.map((o) => `<option ${sym[s.key] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`).join("")}
      </div>
      <div class="field"><label for="fc-notes">Notes</label><textarea class="input" id="fc-notes" rows="2">${esc((c && c.notes) || "")}</textarea></div>`,
    async onSave(scrim) {
      const symptoms = {};
      scrim.querySelectorAll("[data-sym]").forEach((el) => { if (el.value) symptoms[el.dataset.sym] = el.value; });
      const payload = { date: scrim.querySelector("#fc-date").value, weightKg: scrim.querySelector("#fc-weight").value, symptoms, notes: scrim.querySelector("#fc-notes").value };
      if (c) await api("PATCH", `/api/checkins/${c.id}`, payload);
      else await api("POST", `/api/patients/${p.id}/checkins`, payload);
      toast(c ? "Entry updated" : "Entry added");
      reload();
    },
  });
}

function refillEntryEditModal(p, plans, r, reload) {
  const plan = plans.find((pl) => pl.id === r.plan_id) || {};
  const opt = (value, label, cur) => `<option value="${value}" ${cur === value ? "selected" : ""}>${label}</option>`;
  fileFormModal({
    title: "Edit refill entry", wide: true,
    hint: `${esc(r.prior_medication || plan.medication || "Refill")}, ${esc(fmtDate(r.decided_at || r.created_at))}. This corrects the record only. To change the dose the patient is on now, use Edit program.`,
    body: `
      <div class="form-grid">
        <div class="field"><label for="fx-weight">Weight (kg)</label><input class="input" id="fx-weight" type="number" inputmode="decimal" min="20" max="400" step="0.1" value="${esc(r.weight_kg ?? "")}"></div>
        <div class="field"><label for="fx-qty">Quantity</label><input class="input" id="fx-qty" type="number" inputmode="numeric" min="1" max="24" value="${esc(r.quantity ?? "")}"></div>
        <div class="field"><label for="fx-has">Side effects</label><select class="input" id="fx-has">${opt("", "Not recorded", r.has_side_effects || "")}${opt("no", "None", r.has_side_effects)}${opt("yes", "Yes", r.has_side_effects)}</select></div>
        <div class="field"><label for="fx-sev">Severity</label><select class="input" id="fx-sev">${opt("", "Not recorded", r.side_effect_severity || "")}${opt("mild", "Mild", r.side_effect_severity)}${opt("moderate", "Moderate", r.side_effect_severity)}${opt("severe", "Severe", r.side_effect_severity)}</select></div>
        <div class="field full"><label for="fx-details">Side-effect details</label><textarea class="input" id="fx-details" rows="2">${esc(r.side_effects || "")}</textarea></div>
        ${plan.category === "glp1" && !r.results_felt ? "" : `<div class="field full"><label for="fx-results">How it's working</label><textarea class="input" id="fx-results" rows="2">${esc(r.results_felt || "")}</textarea></div>`}
        <div class="field"><label for="fx-action">Patient asked for</label><select class="input" id="fx-action">${opt("", "Not recorded", r.dose_action || "")}${["same", "increase", "decrease", "custom", "talk"].map((a) => opt(a, doseActionLabel(a, ""), r.dose_action)).join("")}</select></div>
        <div class="field"><label for="fx-req">Dose asked for</label><input class="input" id="fx-req" value="${esc(r.requested_dose || "")}" placeholder="Only for a specific dose"></div>
        <div class="field full"><label for="fx-notes">Patient's message</label><textarea class="input" id="fx-notes" rows="2">${esc(r.notes || "")}</textarea></div>
        <div class="field"><label for="fx-prior">Dose before</label><input class="input" id="fx-prior" value="${esc(r.prior_dose || "")}"></div>
        ${r.status === "approved" ? `<div class="field"><label for="fx-decided">Dose after</label><input class="input" id="fx-decided" value="${esc(r.decided_dose || "")}"></div>` : ""}
      </div>`,
    onOpen(scrim) {
      const has = scrim.querySelector("#fx-has"), sev = scrim.querySelector("#fx-sev");
      const sync = () => { sev.disabled = has.value !== "yes"; if (sev.disabled) sev.value = ""; };
      has.addEventListener("change", sync);
      sync();
    },
    async onSave(scrim) {
      const g = (id) => { const el = scrim.querySelector("#" + id); return el ? el.value : undefined; };
      await api("PATCH", `/api/refill-requests/${r.id}`, {
        weightKg: g("fx-weight"), quantity: g("fx-qty") || null, hasSideEffects: g("fx-has"), sideEffectSeverity: g("fx-sev"), sideEffects: g("fx-details"),
        resultsFelt: g("fx-results"), doseAction: g("fx-action"), requestedDose: g("fx-req"), notes: g("fx-notes"), priorDose: g("fx-prior"), decidedDose: g("fx-decided"),
      });
      toast("Refill entry updated");
      reload();
    },
  });
}

// Every correction made to this file, newest first. Super admin only.
function fileEditsCardHTML(edits) {
  if (!isSuperadmin() || !edits || !edits.length) return "";
  return `
  <details class="card card-pad file-history">
    <summary><span class="card-title" style="margin:0">${icon("clock", 19)} Edit history <span class="badge badge-gray">${edits.length}</span></span></summary>
    <p class="hint" style="margin:10px 0 6px">Corrections made to this file by the Super admin.</p>
    ${edits.map((e) => `
      <div class="rx-row">
        <div style="min-width:0">
          <div class="rx-name" style="overflow-wrap:anywhere">${esc(e.summary)}</div>
          <div class="rx-meta">${esc(fmtDate(e.created_at, true))}${e.user_name ? ` · ${esc(e.user_name)}` : ""}</div>
        </div>
      </div>`).join("")}
  </details>`;
}

function wireFileEditing(scope, { p, plans, doses, checkins, refillRequests, visits, reload }) {
  if (!isSuperadmin()) return;
  const find = (list, id) => list.find((x) => x.id === Number(id));
  scope.querySelectorAll("[data-file-edit]").forEach((b) => b.addEventListener("click", () => {
    const kind = b.dataset.fileEdit, id = b.dataset.id;
    if (kind === "chart") patientChartEditModal(p, reload);
    if (kind === "record") clinicalRecordEditModal(p, plans, visits, reload);
    if (kind === "dose") doseEditModal(p, plans, id ? find(doses, id) : null, reload);
    if (kind === "checkin") checkinEditModal(p, id ? find(checkins, id) : null, reload);
    if (kind === "refill" && find(refillRequests, id)) refillEntryEditModal(p, plans, find(refillRequests, id), reload);
  }));
  scope.querySelectorAll("[data-file-del]").forEach((b) => b.addEventListener("click", async () => {
    const kind = b.dataset.fileDel;
    const what = { dose: "this dose", checkin: "this weight or check-in", refill: "this refill entry" }[kind];
    const path = { dose: "dose-logs", checkin: "checkins", refill: "refill-requests" }[kind];
    if (!confirm(`Delete ${what} from ${p.name}'s file? It can't be brought back. The edit history keeps a note of what was removed.`)) return;
    try { await api("DELETE", `/api/${path}/${b.dataset.id}`); toast("Deleted"); reload(); }
    catch (ex) { toast(ex.message, "bad"); }
  }));
}


// ── shareable guide link ─────────────────────────────────────────
// The link opens the patient's active guide as a web page (no sign-in), with
// the same tap-to-expand sections the doctor sees, and can be reopened until
// it expires. Sending again reuses the same link, so the patient's earlier
// message keeps working.
function guideLinkSubject(patient) {
  const clinic = S.user.clinic || S.user.orgName || "";
  return `${patient.noMedication ? "Your personal health plan" : "Your personal treatment guide"}${clinic ? ` — ${clinic}` : ""}`;
}

function guideLinkMessage(patient, url) {
  const firstName = String(patient.name || "").trim().split(/\s+/)[0] || "there";
  const u = S.user;
  // The sender signs it, exactly as set in Settings → Your signature; a
  // line the doctor hasn't filled in is simply left out.
  const signature = [
    [u.name, u.credentials].filter(Boolean).join(" "),
    u.signature,
    u.clinic || u.orgName || "DarDoc Healthcare",
  ].filter(Boolean);
  if (patient.noMedication) {
    return [
      "🩺 *PERSONAL HEALTH PLAN*",
      "",
      `Dear ${patient.title ? patient.title + " " : ""}${firstName},`,
      "",
      "Thank you for your visit. Your personal plan is ready, built around your goals.",
      "It includes your daily protein and nutrition targets, how to build your plate, an example day of eating, and how medication could help if you need it later.",
      "",
      "Tap the link to open it:",
      "",
      url,
      "",
      "",
      ...signature,
    ].join("\n");
  }
  return [
    "🩺 *PERSONAL TREATMENT GUIDE*",
    "",
    "👋 *WELCOME TO YOUR TREATMENT JOURNEY*",
    `Dear ${patient.title ? patient.title + " " : ""}${firstName},`,
    "",
    "Welcome to your treatment journey.",
    "Our goal is sustainable results while protecting your health, preserving muscle, improving nutrition, and building habits that can continue long term.",
    "We're here to support you throughout your treatment — with messages, follow-ups, refills, and personalised guidance whenever you need them.",
    "",
    "Tap the link to open it — you can expand each section to see how to take your medication, what to expect, side effects and when to contact us:",
    "",
    url,
    "",
    "",
    ...signature,
  ].join("\n");
}

async function guideLinkModal(patient) {
  const scrim = modal(`
    <div class="modal-head"><h3>Send guide link</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <p class="hint" style="margin:-6px 0 14px">A private link to <b>${esc(patient.name)}</b>'s ${patient.noMedication ? "health plan" : "guide"}. It opens like a web page on any phone or computer, with sections that expand on tap, and can be reopened anytime until it expires.</p>
    <div id="gl-body"><div class="skel" style="height:190px"></div></div>`);
  const body = scrim.querySelector("#gl-body");
  let link;
  const urlOf = (l) => `${location.origin}/g/${l.token}`;
  const metaText = (l) => `Active until ${fmtDate(l.expiresAt)} · ${l.views ? `opened ${l.views} time${l.views === 1 ? "" : "s"}, last ${timeAgo(l.lastViewedAt)}` : "not opened yet"}`;
  try { link = await api("POST", `/api/patients/${patient.id}/guide-link`, {}); }
  catch (ex) { body.innerHTML = `<p class="err-text">${esc(ex.message)}</p>`; return; }

  body.innerHTML = `
    <div class="field"><label for="gl-msg">Message</label><textarea class="input" id="gl-msg" rows="16"></textarea></div>
    <div class="card" style="background:var(--bg);padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
      <span id="gl-url" style="flex:1;min-width:0;font-size:12.5px;color:var(--muted);word-break:break-all"></span>
      <button class="btn btn-ghost btn-sm" id="gl-copylink" type="button">${icon("copy", 15)} Link</button>
      <a class="btn btn-ghost btn-sm" id="gl-open" target="_blank" rel="noopener">Open</a>
    </div>
    <p class="hint" id="gl-meta" style="margin-bottom:14px"></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-accent" style="flex:1;min-width:180px" id="gl-wa" type="button">${icon("whatsapp", 18)} Send via WhatsApp</button>
      <button class="btn btn-secondary" id="gl-email" type="button">${icon("mail", 18)} Email</button>
      <button class="btn btn-secondary" id="gl-copy" type="button">${icon("copy", 18)} Copy message</button>
    </div>
    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:14px;flex-wrap:wrap">
      <button class="linklike" id="gl-renew" type="button">Generate a new link</button>
      <button class="linklike" id="gl-off" type="button">Disable link</button>
    </div>`;
  const $ = (id) => scrim.querySelector("#" + id);
  const msg = $("gl-msg");
  const paint = () => {
    $("gl-url").textContent = urlOf(link);
    $("gl-open").href = urlOf(link);
    $("gl-meta").textContent = metaText(link);
  };
  msg.value = guideLinkMessage(patient, urlOf(link));
  paint();

  $("gl-wa").addEventListener("click", () => {
    if (!patient.mobile) return toast("This patient has no mobile number on file", "bad");
    window.open(waLink(patient.mobile, msg.value), "_blank");
  });
  $("gl-email").addEventListener("click", () => openEmail(patient.email, guideLinkSubject(patient), msg.value));
  $("gl-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(msg.value); toast("Message copied"); });
  $("gl-copylink").addEventListener("click", async () => { await navigator.clipboard.writeText(urlOf(link)); toast("Link copied"); });
  $("gl-renew").addEventListener("click", async () => {
    if (!confirm("Generate a new link? Any link already sent to the patient will stop working.")) return;
    try {
      const old = urlOf(link);
      link = await api("POST", `/api/patients/${patient.id}/guide-link`, { renew: true });
      msg.value = msg.value.includes(old) ? msg.value.split(old).join(urlOf(link)) : guideLinkMessage(patient, urlOf(link));
      paint();
      toast("New link generated — the old one no longer works");
    } catch (ex) { toast(ex.message, "bad"); }
  });
  $("gl-off").addEventListener("click", async () => {
    if (!confirm("Disable this link? The patient will no longer be able to open the guide with it.")) return;
    try { await api("DELETE", `/api/patients/${patient.id}/guide-link`); scrim.remove(); toast("Link disabled"); }
    catch (ex) { toast(ex.message, "bad"); }
  });
}

// ── guide as a PDF ───────────────────────────────────────────────
// For patients who'd rather have a file than a link: the server builds the
// guide as a PDF (facility name, no web address), and it goes with the
// message. Where the device can share files the share sheet attaches it in
// one step; otherwise WhatsApp or email opens with the message ready and the
// PDF is saved for the doctor to attach.
function guidePdfMessage(patient) {
  const firstName = String(patient.name || "").trim().split(/\s+/)[0] || "there";
  const u = S.user;
  const signature = [
    [u.name, u.credentials].filter(Boolean).join(" "),
    u.signature,
    u.clinic || u.orgName || "DarDoc Healthcare",
  ].filter(Boolean);
  const dear = `Dear ${patient.title ? patient.title + " " : ""}${firstName},`;
  if (patient.noMedication) {
    return [
      "🩺 *PERSONAL HEALTH PLAN*",
      "",
      dear,
      "",
      "Thank you for your visit. Your personal plan is ready, built around your goals.",
      "It's attached as a PDF. It includes your daily protein and nutrition targets, how to build your plate, an example day of eating, and how medication could help if you need it later.",
      "",
      "",
      ...signature,
    ].join("\n");
  }
  return [
    "🩺 *PERSONAL TREATMENT GUIDE*",
    "",
    "👋 *WELCOME TO YOUR TREATMENT JOURNEY*",
    dear,
    "",
    "Welcome to your treatment journey.",
    "Our goal is sustainable results while protecting your health, preserving muscle, improving nutrition, and building habits that can continue long term.",
    "We're here to support you throughout your treatment — with messages, follow-ups, refills, and personalised guidance whenever you need them.",
    "",
    "Your personal treatment guide is attached as a PDF. It covers how to take your medication, what to expect, food and daily habits, side effects and when to contact us, and your follow-up.",
    "",
    "",
    ...signature,
  ].join("\n");
}

async function guidePdfModal(patient) {
  const scrim = modal(`
    <div class="modal-head"><h3>Send guide as PDF</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <p class="hint" style="margin:-6px 0 14px">For patients who'd rather have a file than a link. The PDF of <b>${esc(patient.name)}</b>'s ${patient.noMedication ? "health plan" : "guide"} names the facility and has no web address in it.</p>
    <div id="gpdf-body"><div class="skel" style="height:190px"></div></div>`);
  const body = scrim.querySelector("#gpdf-body");
  let file;
  try {
    const res = await fetch(`/api/patients/${patient.id}/guide-pdf`);
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) || {}).error || "Couldn't make the PDF. Please try again.");
    const disp = res.headers.get("Content-Disposition") || "";
    const named = disp.match(/filename\*=UTF-8''([^;]+)/i);
    const name = named ? decodeURIComponent(named[1]) : `${patient.noMedication ? "Health plan" : "Treatment guide"} - ${patient.name}.pdf`;
    file = new File([await res.blob()], name, { type: "application/pdf" });
  } catch (ex) { body.innerHTML = `<p class="err-text">${esc(ex.message)}</p>`; return; }

  const fileUrl = URL.createObjectURL(file);
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  body.innerHTML = `
    <div class="card" style="background:var(--bg);padding:10px 12px;margin-bottom:12px;display:flex;align-items:center;gap:10px">
      <span style="color:var(--brand)">${icon("file", 22)}</span>
      <span style="flex:1;min-width:0"><b style="display:block;font-size:14px;word-break:break-word">${esc(file.name)}</b><span style="font-size:12.5px;color:var(--muted)">PDF · ${Math.max(1, Math.round(file.size / 1024))} KB</span></span>
      <a class="btn btn-ghost btn-sm" href="${fileUrl}" target="_blank" rel="noopener">Preview</a>
    </div>
    <div class="field"><label for="gpdf-msg">Message</label><textarea class="input" id="gpdf-msg" rows="13"></textarea></div>
    ${canShare ? `<button class="btn btn-accent btn-block" id="gpdf-share" type="button" style="margin-bottom:8px">${icon("share", 18)} Share PDF with message</button>
    <p class="hint" style="margin:0 0 12px">Opens your device's share sheet with the PDF attached. Choose WhatsApp or Mail, then the patient.</p>` : ""}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn ${canShare ? "btn-secondary" : "btn-accent"}" style="flex:1;min-width:170px" id="gpdf-wa" type="button">${icon("whatsapp", 18)} WhatsApp</button>
      <button class="btn btn-secondary" style="flex:1;min-width:120px" id="gpdf-email" type="button">${icon("mail", 18)} Email</button>
      <a class="btn btn-secondary" id="gpdf-dl" href="${fileUrl}" download="${esc(file.name)}">${icon("file", 18)} Download</a>
      <button class="btn btn-secondary" id="gpdf-copy" type="button">${icon("copy", 18)} Copy message</button>
    </div>
    <p class="hint" style="margin:10px 0 0">WhatsApp and Email open the patient's chat or a new email with this message, and save the PDF to your downloads for you to attach.</p>`;
  const $ = (id) => scrim.querySelector("#" + id);
  const msg = $("gpdf-msg");
  msg.value = guidePdfMessage(patient);
  const saveFile = () => $("gpdf-dl").click();

  if (canShare) {
    $("gpdf-share").addEventListener("click", async () => {
      try { await navigator.share({ files: [file], title: guideLinkSubject(patient), text: msg.value }); }
      catch (ex) { if (ex.name !== "AbortError") toast("Couldn't open the share sheet. Use WhatsApp or Email instead.", "bad"); }
    });
  }
  $("gpdf-wa").addEventListener("click", () => {
    if (!patient.mobile) return toast("This patient has no mobile number on file", "bad");
    saveFile();
    window.open(waLink(patient.mobile, msg.value), "_blank");
    toast("PDF saved to your downloads. Attach it in the WhatsApp chat.");
  });
  $("gpdf-email").addEventListener("click", () => {
    saveFile();
    openEmail(patient.email, guideLinkSubject(patient), msg.value);
    toast("PDF saved to your downloads. Attach it to the email.");
  });
  $("gpdf-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(msg.value); toast("Message copied"); });
}

// ── dedicated refill link ────────────────────────────────────────
// A separate link from the guide link — sendable on its own ("time for your
// refill?") so the patient lands straight on the request form, not the
// whole treatment guide.
function refillLinkMessage(patient, url) {
  const firstName = String(patient.name || "").trim().split(/\s+/)[0] || "there";
  const u = S.user;
  const signature = [
    [u.name, u.credentials].filter(Boolean).join(" "),
    u.signature,
    u.clinic || u.orgName || "DarDoc Healthcare",
  ].filter(Boolean);
  return [
    `Hi ${patient.title ? patient.title + " " : ""}${firstName},`,
    "",
    "Looks like you're due for your next refill. Tap the link below to let me know how you're doing and your dose preference — I'll review it and confirm:",
    "",
    url,
    "",
    "",
    ...signature,
  ].join("\n");
}

async function refillLinkModal(patient) {
  const scrim = modal(`
    <div class="modal-head"><h3>Send refill link</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <p class="hint" style="margin:-6px 0 14px">A private link to request a refill for <b>${esc(patient.name)}</b> — separate from the guide link, so it can be sent on its own. Opens straight to the request form, no sign-in.</p>
    <div id="rl-body"><div class="skel" style="height:190px"></div></div>`);
  const body = scrim.querySelector("#rl-body");
  let link;
  const urlOf = (l) => `${location.origin}/r/${l.token}`;
  const metaText = (l) => `Active until ${fmtDate(l.expiresAt)} · ${l.views ? `opened ${l.views} time${l.views === 1 ? "" : "s"}, last ${timeAgo(l.lastViewedAt)}` : "not opened yet"}`;
  try { link = await api("POST", `/api/patients/${patient.id}/refill-link`, {}); }
  catch (ex) { body.innerHTML = `<p class="err-text">${esc(ex.message)}</p>`; return; }

  body.innerHTML = `
    <div class="field"><label for="rl-msg">Message</label><textarea class="input" id="rl-msg" rows="10"></textarea></div>
    <div class="card" style="background:var(--bg);padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
      <span id="rl-url" style="flex:1;min-width:0;font-size:12.5px;color:var(--muted);word-break:break-all"></span>
      <button class="btn btn-ghost btn-sm" id="rl-copylink" type="button">${icon("copy", 15)} Link</button>
      <a class="btn btn-ghost btn-sm" id="rl-open" target="_blank" rel="noopener">Open</a>
    </div>
    <p class="hint" id="rl-meta" style="margin-bottom:14px"></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-accent" style="flex:1;min-width:180px" id="rl-wa" type="button">${icon("whatsapp", 18)} Send via WhatsApp</button>
      <button class="btn btn-secondary" id="rl-email" type="button">${icon("mail", 18)} Email</button>
      <button class="btn btn-secondary" id="rl-copy" type="button">${icon("copy", 18)} Copy message</button>
    </div>
    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:14px;flex-wrap:wrap">
      <button class="linklike" id="rl-renew" type="button">Generate a new link</button>
      <button class="linklike" id="rl-off" type="button">Disable link</button>
    </div>`;
  const $ = (id) => scrim.querySelector("#" + id);
  const msg = $("rl-msg");
  const paint = () => {
    $("rl-url").textContent = urlOf(link);
    $("rl-open").href = urlOf(link);
    $("rl-meta").textContent = metaText(link);
  };
  msg.value = refillLinkMessage(patient, urlOf(link));
  paint();

  $("rl-wa").addEventListener("click", () => {
    if (!patient.mobile) return toast("This patient has no mobile number on file", "bad");
    window.open(waLink(patient.mobile, msg.value), "_blank");
  });
  $("rl-email").addEventListener("click", () => {
    const clinic = S.user.clinic || S.user.orgName || "";
    openEmail(patient.email, `Time for your refill${clinic ? ` — ${clinic}` : ""}`, msg.value);
  });
  $("rl-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(msg.value); toast("Message copied"); });
  $("rl-copylink").addEventListener("click", async () => { await navigator.clipboard.writeText(urlOf(link)); toast("Link copied"); });
  $("rl-renew").addEventListener("click", async () => {
    if (!confirm("Generate a new link? Any link already sent to the patient will stop working.")) return;
    try {
      const old = urlOf(link);
      link = await api("POST", `/api/patients/${patient.id}/refill-link`, { renew: true });
      msg.value = msg.value.includes(old) ? msg.value.split(old).join(urlOf(link)) : refillLinkMessage(patient, urlOf(link));
      paint();
      toast("New link generated — the old one no longer works");
    } catch (ex) { toast(ex.message, "bad"); }
  });
  $("rl-off").addEventListener("click", async () => {
    if (!confirm("Disable this link? The patient will no longer be able to request a refill with it.")) return;
    try { await api("DELETE", `/api/patients/${patient.id}/refill-link`); scrim.remove(); toast("Link disabled"); }
    catch (ex) { toast(ex.message, "bad"); }
  });
}

// ── organisation logo ────────────────────────────────────────────
// The clinic's own logo heads every patient guide. Any image is redrawn on a
// canvas at a sensible size and uploaded as PNG, so a phone photo of a
// letterhead or a 4000px export doesn't hit the size limit.
function logoFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return reject(new Error("Choose a PNG, JPG, WebP or SVG image."));
    const svg = file.type === "image/svg+xml";
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const w0 = img.naturalWidth || 512, h0 = img.naturalHeight || 256;
      for (let side = 600; side >= 200; side -= 100) {
        const k = svg ? side / Math.max(w0, h0) : Math.min(1, side / Math.max(w0, h0));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const out = c.toDataURL("image/png");
        if (out.length <= 900000) return resolve(out);
      }
      reject(new Error("That image is too detailed — try a simpler or smaller version of the logo."));
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error("Couldn't read that image.")); };
    img.src = objUrl;
  });
}

function logoUploaderHTML(logoUrl) {
  return `
  <div class="field" id="lg-box">
    <label>Clinic logo</label>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div id="lg-preview" style="width:176px;height:76px;border:1px solid var(--border);border-radius:var(--r-md);background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:6px;box-sizing:border-box"></div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start">
        <label class="btn btn-secondary btn-sm" for="lg-file" style="cursor:pointer">${icon("plus", 15)} Upload logo</label>
        <input type="file" id="lg-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
        <button type="button" class="btn btn-ghost btn-sm" id="lg-remove">Remove</button>
      </div>
    </div>
    <span class="hint">Shown at the top of every patient guide your clinic sends. A PNG with a transparent background works best.</span>
    <p class="err-text" id="lg-err" hidden role="alert"></p>
  </div>`;
}
// `onChange(newLogoUrl)` runs after each successful upload or removal.
function wireLogoUploader(scope, orgId, logoUrl, onChange) {
  const q = (id) => scope.querySelector("#" + id);
  const paint = (url) => {
    q("lg-preview").innerHTML = url ? `<img src="${esc(url)}" alt="Clinic logo" style="max-width:100%;max-height:100%;object-fit:contain">` : `<span class="hint">No logo yet</span>`;
    q("lg-remove").hidden = !url;
  };
  paint(logoUrl);
  const fail = (ex) => { q("lg-err").textContent = ex.message; q("lg-err").hidden = false; };
  q("lg-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    q("lg-err").hidden = true;
    if (!file) return;
    try {
      const r = await api("POST", `/api/orgs/${orgId}/logo`, { dataUrl: await logoFileToDataUrl(file) });
      paint(r.logoUrl); onChange(r.logoUrl); toast("Logo saved");
    } catch (ex) { fail(ex); }
    e.target.value = "";
  });
  q("lg-remove").addEventListener("click", async () => {
    if (!confirm("Remove the clinic logo from patient guides?")) return;
    try { const r = await api("DELETE", `/api/orgs/${orgId}/logo`); paint(r.logoUrl); onChange(r.logoUrl); toast("Logo removed"); }
    catch (ex) { fail(ex); }
  });
}
// Keeps the signed-in user's own copy current so guide previews pick it up.
const rememberOwnLogo = (orgId) => (url) => { if (orgId === S.user.orgId) S.user.logoUrl = url; };

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
    const waText = `Hello ${p.title ? p.title + " " : ""}${p.name}, here is your access to your personal treatment portal:\n\n🔗 ${link}\n📱 Mobile: +${p.mobile}\n🔑 PIN: ${pin}\n\nYou can view your guide, log your doses and report how you feel — I'll be following your progress.\n\n— ${S.user.name}, ${S.user.clinic || S.user.orgName || "DarDoc Healthcare"}`;
    scrim.querySelector("#pin-zone").innerHTML = `
      <div class="pin-display">${pin}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-accent" style="flex:1" id="pin-wa">${icon("whatsapp", 18)} Send via WhatsApp</button>
        <button class="btn btn-secondary" id="pin-email">${icon("mail", 18)} Email</button>
        <button class="btn btn-secondary" id="pin-copy">${icon("copy", 18)} Copy message</button>
      </div>
      <p class="hint" style="margin-top:10px">This PIN is shown once. Generating another one invalidates it.</p>`;
    scrim.querySelector("#pin-wa").addEventListener("click", () => window.open(waLink(p.mobile, waText), "_blank"));
    scrim.querySelector("#pin-email").addEventListener("click", () => {
      const clinic = S.user.clinic || S.user.orgName || "";
      openEmail(p.email, `Your patient portal access${clinic ? ` — ${clinic}` : ""}`, waText);
    });
    scrim.querySelector("#pin-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(waText); toast("Message copied"); });
  });
}

// ── refills: quick update on an existing program ──────────────────
// Starting a new program for a patient who already has one active asks
// first whether this is a refill (a quick check-in that updates the
// existing program) or a genuinely new program (the full consultation).
function refillOrNewChooserModal(patient, activePlans) {
  const scrim = modal(`
    <div class="modal-head"><h3>New program for ${esc(patient.name)}</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <p class="hint" style="margin-top:-6px;margin-bottom:16px">Refilling is a quick update to an existing program. Starting a new program runs the full consultation.</p>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn btn-primary btn-block" id="choose-refill" type="button">${icon("syringe", 16)} Refill an existing program</button>
      <button class="btn btn-secondary btn-block" id="choose-new" type="button">${icon("plus", 16)} Start a new program</button>
    </div>`);
  scrim.querySelector("#choose-new").addEventListener("click", () => {
    scrim.remove();
    location.hash = `#/consult?patient=${patient.id}`;
  });
  scrim.querySelector("#choose-refill").addEventListener("click", () => {
    scrim.remove();
    if (activePlans.length === 1) refillFormModal(patient, activePlans[0]);
    else refillPlanPickerModal(patient, activePlans);
  });
}

function refillPlanPickerModal(patient, activePlans) {
  const scrim = modal(`
    <div class="modal-head"><h3>Which program?</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${activePlans.map((pl) => `
        <button class="btn btn-secondary btn-block" data-pick-plan="${pl.id}" type="button" style="justify-content:flex-start;gap:8px">
          ${icon(routeIcon(pl.route), 16)} ${esc(pl.medication)}${pl.dose ? " · " + esc(pl.dose) : ""}
        </button>`).join("")}
    </div>`);
  scrim.querySelectorAll("[data-pick-plan]").forEach((b) => b.addEventListener("click", () => {
    const pl = activePlans.find((x) => x.id === Number(b.dataset.pickPlan));
    scrim.remove();
    if (pl) refillFormModal(patient, pl);
  }));
}

function doseActionLabel(action, requestedDose) {
  if (action === "increase") return "Increase dose";
  if (action === "decrease") return "Decrease dose";
  if (action === "custom") return `Switch to ${requestedDose || "a specific dose"}`;
  if (action === "talk") return "Wants to talk to you first";
  return "Stay the same";
}

// Severity as a colour-coded badge (with the word, never colour alone), so a
// severe report stands out wherever a request is listed.
function severityBadgeHTML(sev) {
  if (!sev) return `<span class="badge badge-gray">severity not given</span>`;
  const cls = { mild: "badge-green", moderate: "badge-amber", severe: "badge-red" }[sev] || "badge-gray";
  return `<span class="badge ${cls}">${esc(sev)}</span>`;
}

// The structured side-effects answer, formatted for a doctor-facing summary.
function sideEffectsSummaryHTML(r) {
  if (r.has_side_effects === "yes") return `Side effects ${severityBadgeHTML(r.side_effect_severity)}`;
  if (r.has_side_effects === "no") return "No side effects reported";
  return r.side_effects ? "Side effects reported" : "";
}

// The one form behind every refill: logged in clinic (applies immediately,
// `reqRow` omitted) or reviewing a patient-submitted request (`reqRow` is the
// pending refill_requests row — shown read-only, with Approve/Decline instead
// of a plain save). Either way it's logged to refill_requests, never treated
// as a new consultation.
function refillFormModal(patient, pl, reqRow) {
  injectGuideCss();
  const isPeptide = pl.category === "peptide";
  const ladder = pl.doseOptions || [];
  const up = doseLadderStep(ladder, pl.dose, "up");
  const down = doseLadderStep(ladder, pl.dose, "down");
  const askedFor = reqRow && reqRow.dose_action;
  const initial = (askedFor === "increase" && up) ? "increase" : (askedFor === "decrease" && down) ? "decrease" : askedFor === "custom" ? "custom" : "same";
  const customDose = reqRow && reqRow.requested_dose ? reqRow.requested_dose : pl.dose;
  const followupDefault = (() => {
    const dt = new Date(); dt.setDate(dt.getDate() + (pl.followup_days || 28));
    return dt.toISOString().slice(0, 10);
  })();
  const askedAt = reqRow && (reqRow.created_at || reqRow.refill_requested_at);
  const lastWeight = patient.current_weight_kg || patient.start_weight_kg;
  const library = (cat) => S.templates.filter((t) => t.category === cat && (t.config.medication || t.name) !== pl.medication);
  const medOptions = (cat) => library(cat).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  const customBody = ladder.length
    ? `<label class="rr-sr" for="rf-dose">Dose</label><select class="input" id="rf-dose">${ladder.map((dd) => `<option ${dd === customDose ? "selected" : ""}>${esc(dd)}</option>`).join("")}</select>`
    : `<label class="rr-sr" for="rf-dose">Dose</label><input class="input" id="rf-dose" value="${esc(customDose || "")}">`;
  const switchBody = `
    <div class="field" style="margin-bottom:10px"><label for="rf-newmed">New medication</label>
      <select class="input" id="rf-newmed">
        <option value="">Choose a medication…</option>
        <optgroup label="GLP-1 / weight loss">${medOptions("glp1")}</optgroup>
        <optgroup label="Peptides">${medOptions("peptide")}</optgroup>
      </select>
    </div>
    <div id="rf-newmed-dose"></div>
    <p class="hint" style="margin:0">The patient's guide, instructions and warnings switch to the new medication when you save.</p>`;
  const scrim = modal(`
    <div class="modal-head"><h3>${reqRow ? "Review refill request" : "Refill"} — ${esc(pl.medication)}</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    ${reqRow ? `
    <div class="card card-pad" style="background:var(--bg);box-shadow:none;margin-bottom:14px">
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:6px">${esc(patient.name)} asked for this${askedAt ? " " + timeAgo(askedAt) : ""}</div>
      ${reqRow.weight_kg ? `<div style="font-size:13.5px;margin-bottom:4px"><b>Reported weight:</b> ${esc(reqRow.weight_kg)} kg</div>` : ""}
      ${sideEffectsSummaryHTML(reqRow) ? `<div style="font-size:13.5px;margin-bottom:4px;font-weight:700">${sideEffectsSummaryHTML(reqRow)}</div>` : ""}
      ${reqRow.side_effects ? `<div style="font-size:13.5px;margin-bottom:4px">${esc(reqRow.side_effects)}</div>` : ""}
      ${reqRow.results_felt ? `<div style="font-size:13.5px;margin-bottom:4px"><b>Results felt:</b> ${esc(reqRow.results_felt)}</div>` : ""}
      ${reqRow.dose_action ? `<div style="font-size:13.5px;margin-bottom:4px"><b>Asked for:</b> ${esc(doseActionLabel(reqRow.dose_action, reqRow.requested_dose))}</div>` : ""}
      ${reqRow.notes ? `<div style="font-size:13.5px"><b>Notes:</b> ${esc(reqRow.notes)}</div>` : ""}
    </div>
    ${reqRow.dose_action === "talk" ? `<p class="hint" style="margin:-6px 0 14px">They'd like to talk before any dose change, so the dose is left unchanged until you do.</p>` : ""}` : `
    <div class="field"><label for="rf-weight">Weight today (kg)</label><input class="input" id="rf-weight" type="number" step="0.1" inputmode="decimal" placeholder="${esc(lastWeight ? `Last recorded: ${lastWeight} kg` : "Optional")}"></div>
    <div class="field"><label for="rf-side">Side effects since last visit</label><textarea class="input" id="rf-side" rows="2" placeholder="Optional"></textarea></div>
    ${isPeptide ? `<div class="field"><label for="rf-results">Results felt</label><textarea class="input" id="rf-results" rows="2" placeholder="Optional"></textarea></div>` : ""}
    `}
    <div class="field">
      <label id="rf-next-legend">Next step</label>
      <fieldset class="rr-group" aria-labelledby="rf-next-legend">
        ${rrOption("rf-action", "same", { title: "Keep current dose", sub: pl.dose ? `Stay on ${pl.dose}` : "" }, "", initial === "same")}
        ${up ? rrOption("rf-action", "increase", { title: "Increase dose", sub: `To ${up}` }, "", initial === "increase") : ""}
        ${down ? rrOption("rf-action", "decrease", { title: "Lower dose", sub: `To ${down}` }, "", initial === "decrease") : ""}
        ${rrOption("rf-action", "custom", { title: "Choose a specific dose" }, customBody, initial === "custom")}
        ${rrOption("rf-action", "switch", { title: "Change medication", sub: "Switch to a different medication" }, switchBody, false)}
      </fieldset>
    </div>
    <div class="field"><label for="rf-qty">Quantity dispensed</label><input class="input" id="rf-qty" type="number" min="1" value="${esc(pl.quantity || 1)}"></div>
    <div class="field"><label for="rf-followup">Next follow-up</label><input class="input" id="rf-followup" type="date" value="${followupDefault}"></div>
    <div class="field"><label for="rf-msg">Message to patient (optional)</label><input class="input" id="rf-msg" placeholder="e.g. Great progress, keep going at this dose"></div>
    <p class="err-text" id="rf-err" hidden role="alert"></p>
    <div style="display:flex;gap:8px;margin-top:4px">
      ${reqRow ? `<button class="btn btn-ghost btn-block" id="rf-decline" type="button">Decline</button>` : ""}
      <button class="btn btn-primary btn-block" id="rf-save" type="button">${reqRow ? "Approve & apply" : "Save refill"}</button>
    </div>`);
  wireRefillRequestFields(scrim);

  // The medication being switched to, in the same shape the consultation
  // builds, so its dose, schedule, instructions and warnings come out the same.
  let next = null;
  const newmedDose = scrim.querySelector("#rf-newmed-dose");
  const paintNewDose = () => {
    if (!next) { newmedDose.innerHTML = ""; return; }
    if (next.category === "glp1") {
      const doses = next.template.config.doses;
      newmedDose.innerHTML = `<div class="field" style="margin-bottom:10px"><label for="rf-newdose">Starting dose</label><select class="input" id="rf-newdose">${doses.map((dd) => `<option ${dd === next.dose ? "selected" : ""}>${esc(dd)}</option>`).join("")}</select></div>`;
      newmedDose.querySelector("#rf-newdose").addEventListener("change", (e) => {
        next.dose = e.target.value;
        next.phases = suggestTitration(doses, next.dose, next.template.config.titration);
      });
      return;
    }
    const opts = peptideProtocolOptions(next.medication, next.template);
    newmedDose.innerHTML = opts.length ? `<div class="field" style="margin-bottom:10px"><label for="rf-newproto">Protocol</label><select class="input" id="rf-newproto">${opts.map((o) => `<option value="${esc(o.key)}" ${o.key === next.protocolKey ? "selected" : ""}>${esc(o.protocol.protocolType)}${o.protocol.doseVolume || o.protocol.doseAmount ? ` — ${esc(o.protocol.doseVolume || o.protocol.doseAmount)}` : ""}</option>`).join("")}</select></div>` : "";
    const sel = newmedDose.querySelector("#rf-newproto");
    if (sel) sel.addEventListener("change", () => {
      const opt = opts.find((o) => o.key === sel.value);
      next.protocolKey = opt.key; next.protocol = opt.protocol; next.protocolBase = opt.protocol;
      applyProtocolTo(next);
    });
  };
  scrim.querySelector("#rf-newmed").addEventListener("change", (e) => {
    const t = S.templates.find((x) => x.id === Number(e.target.value));
    if (!t) { next = null; paintNewDose(); return; }
    next = { ...freshDraft(t.category), template: t, medication: t.config.medication || t.name, quantity: Number(scrim.querySelector("#rf-qty").value) || 1 };
    if (t.category === "glp1") {
      next.route = t.config.route; next.frequency = t.config.frequency; next.halfLifeHours = t.config.halfLifeHours;
      next.dose = t.config.doses[0];
      next.phases = suggestTitration(t.config.doses, next.dose, t.config.titration);
    } else {
      const first = peptideProtocolOptions(next.medication, t)[0];
      next.protocolKey = first ? first.key : null;
      next.protocol = first ? first.protocol : (t.config.protocols || [])[0];
      next.protocolBase = next.protocol;
      if (next.protocol) applyProtocolTo(next);
    }
    paintNewDose();
  });

  const afterSave = () => { if (location.hash.startsWith("#/patient/")) viewPatient(patient.id); else viewDashboard(); };
  const errBox = scrim.querySelector("#rf-err");
  scrim.querySelector("#rf-save").addEventListener("click", async () => {
    errBox.hidden = true;
    const action = scrim.querySelector('input[name="rf-action"]:checked').value;
    const dose = action === "increase" ? up : action === "decrease" ? down : action === "custom" ? scrim.querySelector("#rf-dose").value.trim() : action === "switch" ? (next && next.dose) : pl.dose;
    if (action === "switch" && !next) { errBox.textContent = "Choose the medication to change to."; errBox.hidden = false; return; }
    const medicationChange = action === "switch" ? {
      medication: next.medication, category: next.category, route: next.route, frequency: next.frequency, halfLifeHours: next.halfLifeHours,
      title: `${next.medication} — ${next.category === "glp1" ? "Weight Loss Program" : "Peptide Therapy"}`,
      phases: (next.phases || []).filter((ph) => ph.label || ph.dose),
      instructions: defaultInstructionsFor(next), warnings: defaultWarningsFor(next),
      // Moving onto a GLP-1 from something else brings the nutrition plan with it.
      diet: next.category === "glp1" && pl.category !== "glp1" ? defaultDietForPatient(patient) : null,
    } : null;
    const quantity = Number(scrim.querySelector("#rf-qty").value) || 1;
    const nextFollowup = scrim.querySelector("#rf-followup").value || null;
    const message = scrim.querySelector("#rf-msg").value.trim();
    // A patient's reported weight was already logged when they sent the
    // request, so only a weight typed in clinic is sent from here.
    const weightEl = scrim.querySelector("#rf-weight");
    const weightKg = weightEl ? Number(weightEl.value) || null : null;
    const sideEffects = scrim.querySelector("#rf-side") ? scrim.querySelector("#rf-side").value.trim() : "";
    const resultsFelt = scrim.querySelector("#rf-results") ? scrim.querySelector("#rf-results").value.trim() : "";
    try {
      if (reqRow) {
        await api("POST", `/api/refill-requests/${reqRow.id || reqRow.request_id}/decide`, { decision: "approved", dose, quantity, nextFollowup, message, medicationChange });
      } else {
        await api("POST", `/api/plans/${pl.id}/refill`, { dose, quantity, nextFollowup, weightKg, sideEffects, resultsFelt, message, medicationChange });
      }
      scrim.remove();
      toast(medicationChange ? `Refill saved, medication changed to ${medicationChange.medication}` : "Refill saved");
      afterSave();
    } catch (ex) { errBox.textContent = ex.message || "Could not save"; errBox.hidden = false; }
  });
  const declineBtn = scrim.querySelector("#rf-decline");
  if (declineBtn) declineBtn.addEventListener("click", async () => {
    const message = scrim.querySelector("#rf-msg").value.trim();
    try {
      await api("POST", `/api/refill-requests/${reqRow.id || reqRow.request_id}/decide`, { decision: "declined", message });
      scrim.remove();
      toast("Request declined");
      afterSave();
    } catch (ex) { errBox.textContent = ex.message || "Could not decline"; errBox.hidden = false; }
  });
}

// The patient chart's refill panel: pending requests awaiting a decision,
// then a dated log of every refill already resolved — doctor-entered or
// patient-requested — so it reads as history, never as another consultation.
function refillHistoryCardHTML(plans, refillRequests) {
  if (!refillRequests || !refillRequests.length) return "";
  const pending = refillRequests.filter((r) => r.status === "pending");
  const resolved = refillRequests.filter((r) => r.status !== "pending");
  const planName = (id) => { const pl = plans.find((x) => x.id === id); return pl ? pl.medication : "Program"; };
  const heading = (r) => {
    const from = r.prior_medication || planName(r.plan_id);
    const to = r.decided_medication || from;
    if (to !== from) return `<b>${esc(from)}</b> ${esc(r.prior_dose || "")} → <b>${esc(to)}</b> ${esc(r.decided_dose || "")} <span class="badge badge-amber">medication changed</span>`;
    return `<b>${esc(from)}</b> ${r.prior_dose && r.decided_dose && r.prior_dose !== r.decided_dose ? `${esc(r.prior_dose)} → ${esc(r.decided_dose)}` : esc(r.decided_dose || r.prior_dose || "")}`;
  };
  return `
  <div class="card card-pad">
    <div class="card-title" style="justify-content:space-between">
      <span style="display:flex;align-items:center;gap:10px">${icon("syringe", 19)} Refill requests &amp; history</span>
      ${pending.length ? `<span class="badge badge-amber">${pending.length} pending</span>` : ""}
    </div>
    ${pending.map((r) => `
      <div class="alert-item">
        <div class="alert-ico" style="background:var(--amber-soft);color:var(--amber)">${icon("syringe", 18)}</div>
        <div class="alert-body">
          <div class="alert-name">${esc(r.prior_medication || planName(r.plan_id))}${r.prior_dose ? ` · ${esc(r.prior_dose)}` : ""}</div>
          <div class="alert-meta">Patient request · ${esc(fmtDate(r.created_at))} · ${timeAgo(r.created_at)}</div>
          ${refillDetailsHTML(r)}
          ${fileActs("refill", r.id)}
        </div>
        <button class="btn btn-secondary btn-sm" style="align-self:flex-start" data-review-refill="${r.plan_id}">Review</button>
      </div>`).join("")}
    ${resolved.length ? resolved.slice(0, 10).map((r) => `
      <div class="timeline-item">
        <div class="tl-ico" style="background:var(--brand-soft);color:var(--brand)">${icon("syringe", 15)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13.5px">${heading(r)}
            ${r.status === "approved" ? `<span class="badge badge-green">refilled</span>` : `<span class="badge badge-gray">declined</span>`}</div>
          <div style="font-size:12.5px;color:var(--muted)">
            ${r.source === "patient" ? "Patient request" : "Logged in clinic"} · ${esc(fmtDate(r.decided_at || r.created_at))}${r.decided_by_name ? ` · by ${esc(r.decided_by_name)}` : ""}
          </div>
          ${refillDetailsHTML(r)}
          ${fileActs("refill", r.id)}
        </div>
      </div>`).join("") : (!pending.length ? `<p class="hint">No refills logged yet.</p>` : "")}
  </div>`;
}

// What was reported with a refill — weight, side effects, dose preference
// and the patient's own words — so it stays in the patient's file.
function refillDetailsHTML(r) {
  const facts = [
    r.weight_kg ? `<span>Weight <b>${esc(r.weight_kg)} kg</b></span>` : "",
    sideEffectsSummaryHTML(r) ? `<span>${sideEffectsSummaryHTML(r)}</span>` : "",
    r.dose_action ? `<span>Asked for <b>${esc(doseActionLabel(r.dose_action, r.requested_dose))}</b></span>` : "",
  ].filter(Boolean);
  const quotes = [
    r.side_effects ? ["Side-effect details", r.side_effects] : null,
    r.results_felt ? ["How it's working", r.results_felt] : null,
    r.notes ? ["Message", r.notes] : null,
  ].filter(Boolean);
  if (!facts.length && !quotes.length) return "";
  return `<div class="rf-details">
    ${facts.length ? `<div class="rf-facts">${facts.join("")}</div>` : ""}
    ${quotes.map(([k, v]) => `<div class="rf-quote"><span>${k}</span>${esc(v)}</div>`).join("")}
  </div>`;
}

// One line for the patient summary: the most recent refill at a glance.
function latestRefillSummaryHTML(r, plans) {
  const pl = plans.find((x) => x.id === r.plan_id);
  const from = r.prior_medication || (pl ? pl.medication : "Program");
  const to = r.status === "approved" ? (r.decided_medication || from) : from;
  const dose = r.status === "approved" && r.decided_dose
    ? (to !== from ? `${r.prior_dose || ""} → ${to} ${r.decided_dose}` : r.prior_dose && r.prior_dose !== r.decided_dose ? `${r.prior_dose} → ${r.decided_dose}` : r.decided_dose)
    : (r.prior_dose || "");
  const status = r.status === "approved" ? `<span class="badge badge-green">refilled</span>`
    : r.status === "declined" ? `<span class="badge badge-gray">declined</span>`
    : `<span class="badge badge-amber">awaiting review</span>`;
  const bits = [
    esc(fmtDate(r.decided_at || r.created_at)),
    esc(`${from}${dose ? " " + dose : ""}`),
    r.weight_kg ? `${esc(r.weight_kg)} kg` : "",
    r.has_side_effects === "yes" ? `side effects ${severityBadgeHTML(r.side_effect_severity)}` : r.has_side_effects === "no" ? "no side effects" : "",
  ].filter(Boolean);
  return `${bits.join(" · ")} ${status}`;
}

// Refills written in the clinical record's own plain-text style, oldest
// first, so the record reads as one running history and copies as one.
function refillRecordText(p, plans, refillRequests) {
  if (!refillRequests || !refillRequests.length) return "";
  const sev = {
    mild: "Mild (did not disrupt daily routine)",
    moderate: "Moderate (disrupted daily activities)",
    severe: "Severe (hard to tolerate / needed medical help)",
  };
  return [...refillRequests].reverse().map((r) => {
    const pl = plans.find((x) => x.id === r.plan_id) || {};
    const bmi = r.weight_kg ? calcBMIClient(p.height_cm, r.weight_kg) : null;
    const lines = [
      `REFILL UPDATE — ${fmtDate(r.decided_at || r.created_at)}`,
      "",
      `Patient: ${p.name} · Patient no. ${p.id} · Mobile +${p.mobile}`,
      `Medication: ${r.prior_medication || pl.medication || "—"}`,
      `Source: ${r.source === "patient" ? "Patient refill request" : "Recorded in clinic"}`,
    ];
    if (r.weight_kg) lines.push(`Weight: ${r.weight_kg} kg${bmi ? ` (BMI ${bmi})` : ""}`);
    if (r.has_side_effects === "yes") lines.push(`Side effects: ${sev[r.side_effect_severity] || "Yes"}`);
    else if (r.has_side_effects === "no") lines.push("Side effects: None reported");
    if (r.side_effects) lines.push(`Side-effect details: ${r.side_effects}`);
    if (r.results_felt) lines.push(`Response to treatment: ${r.results_felt}`);
    if (r.dose_action) lines.push(`Patient preference: ${doseActionLabel(r.dose_action, r.requested_dose)}`);
    if (r.notes) lines.push(`Patient message: ${r.notes}`);
    if (r.status === "approved") {
      const switched = r.prior_medication && r.decided_medication && r.prior_medication !== r.decided_medication;
      const change = switched ? `medication changed from ${r.prior_medication} ${r.prior_dose || ""} to ${r.decided_medication} ${r.decided_dose || ""}`.replace(/ +/g, " ").trim()
        : r.prior_dose && r.decided_dose && r.prior_dose !== r.decided_dose
          ? `dose changed ${r.prior_dose} → ${r.decided_dose}` : `dose continued at ${r.decided_dose || r.prior_dose || "—"}`;
      lines.push(`Outcome: Refill approved — ${change}${r.quantity ? `, quantity ${r.quantity}` : ""}`);
    } else if (r.status === "declined") lines.push("Outcome: Request declined");
    else lines.push("Outcome: Awaiting doctor review");
    if (r.decided_by_name) lines.push(`Reviewed by: ${r.decided_by_name}`);
    return lines.join("\n");
  }).join("\n\n");
}

// ── patient information forms ────────────────────────────────────────
// For someone who bought their medication before any consultation, or who
// couldn't join one: they get a private link and fill in their own details.
// Their answers wait for a doctor, who reviews them in a pre-filled
// consultation and publishes from there.
const medNames = (meds) => meds.map((m) => `${m.medication}${m.dose ? " " + m.dose : ""}`).join(", ");

function patientFormMessage(patient, reason, meds, url) {
  const firstName = String(patient.name || "").trim().split(/\s+/)[0] || "there";
  const u = S.user;
  const signature = [
    [u.name, u.credentials].filter(Boolean).join(" "),
    u.signature,
    u.clinic || u.orgName || "DarDoc Healthcare",
  ].filter(Boolean);
  const opening = reason === "purchased"
    ? `You recently purchased *${medNames(meds)}*. Since you haven't had a consultation yet, we need some information from you to complete your file and make sure your delivery and medication follow-up are done properly.`
    : `We're sorry you weren't able to join your consultation.${meds.length ? ` You chose *${medNames(meds)}*.` : ""} So that your doctor can still review your health and look after you properly, we need some information from you.`;
  return [
    "🩺 *COMPLETE YOUR DETAILS*",
    "",
    `Dear ${patient.title ? patient.title + " " : ""}${firstName},`,
    "",
    opening,
    "",
    `It takes about 3 minutes, and each question explains why we ask it. Some answers, such as ${isMalePatient(patient) ? "" : "pregnancy or "}certain medical conditions, affect whether a medication is safe for you, so please complete this before starting any medication.`,
    "",
    "Tap the link to confirm what we already have and add the rest:",
    "",
    url,
    "",
    "Your doctor will review your answers and contact you if anything needs discussing.",
    "",
    "",
    ...signature,
  ].join("\n");
}
const patientFormSubject = () => `Please complete your details — ${S.user.clinic || S.user.orgName || "your clinic"}`;
const patientFormUrl = (token) => `${location.origin}/f/${token}`;

// The dose choices on offer for one library medication.
function formDoseChoices(tpl) {
  if (tpl.category === "glp1") return (tpl.config.doses || []).map((dose) => ({ value: dose, label: dose }));
  return peptideProtocolOptions(tpl.config.medication || tpl.name, tpl).map((o) => {
    const pr = o.protocol;
    return { value: o.key, label: [pr.doseVolume || pr.doseAmount, pr.protocolType].filter(Boolean).join(" · ") };
  });
}

function patientFormModal(channel) {
  const w = S.wizard, p = w.patient;
  const libs = [["glp1", "GLP-1 / weight loss"], ["peptide", "Peptides"]];
  const rows = [{ templateId: "", choice: "" }];
  const medOptions = (sel) => libs.map(([cat, label]) => `
    <optgroup label="${label}">
      ${S.templates.filter((t) => t.category === cat).map((t) => `<option value="${t.id}" ${String(t.id) === String(sel) ? "selected" : ""}>${esc(t.name)}</option>`).join("")}
    </optgroup>`).join("");
  const rowHTML = (r, i) => {
    const tpl = S.templates.find((t) => String(t.id) === String(r.templateId));
    const doses = tpl ? formDoseChoices(tpl) : [];
    return `
    <div class="fm-row">
      <select class="input" data-fm-med="${i}" aria-label="Medication">
        <option value="">Choose a medication…</option>
        ${medOptions(r.templateId)}
      </select>
      <select class="input" data-fm-dose="${i}" aria-label="Dose" ${tpl ? "" : "disabled"}>
        ${tpl ? doses.map((o) => `<option value="${esc(o.value)}" ${o.value === r.choice ? "selected" : ""}>${esc(o.label)}</option>`).join("") : `<option>Dose</option>`}
      </select>
      ${rows.length > 1 ? `<button type="button" class="icon-btn" data-fm-del="${i}" aria-label="Remove this medication">${icon("x", 16)}</button>` : ""}
    </div>`;
  };

  const scrim = modal(`
    <div class="modal-head"><h3>Send patient form</h3><button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button></div>
    <div id="fm-body">
      <p class="hint" style="margin:-6px 0 14px">A private link where the patient confirms what we have and fills in the rest. You review their answers before anything goes ahead.</p>
      <div class="field">
        <label>Why are you sending this?</label>
        <div class="chip-row">
          <button type="button" class="chip on" data-fm-reason="purchased">Purchased medication</button>
          <button type="button" class="chip" data-fm-reason="missed">Couldn't join consultation</button>
        </div>
      </div>
      <div class="field">
        <label id="fm-med-label">Medication and dose they purchased</label>
        <div id="fm-rows"></div>
        <button type="button" class="linklike" id="fm-add" style="display:inline-flex;align-items:center;gap:4px;align-self:flex-start;margin-top:4px">${icon("plus", 14)} Add another medication</button>
      </div>
      <div class="form-grid">
        <div class="field full"><label for="fm-name">Patient's name</label><input class="input" id="fm-name" value="${esc(p.name)}" autocomplete="off"></div>
        <div class="field"><label for="fm-mobile">Mobile${channel === "wa" ? ' <span class="req">*</span>' : ""}</label><input class="input" id="fm-mobile" type="tel" value="${esc(p.mobile)}" placeholder="9715xxxxxxxx"></div>
        <div class="field"><label for="fm-email">Email${channel === "email" ? ' <span class="req">*</span>' : ""}</label><input class="input" id="fm-email" type="email" value="${esc(p.email)}"></div>
      </div>
      <p class="err-text" id="fm-err" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" id="fm-next" type="button"><span class="spin"></span><span class="btn-label">Create the link</span></button>
    </div>`, true);
  const $ = (id) => scrim.querySelector("#" + id);
  let reason = "purchased";

  function paintRows() {
    $("fm-rows").innerHTML = rows.map(rowHTML).join("");
    scrim.querySelectorAll("[data-fm-med]").forEach((el) => el.addEventListener("change", () => {
      const r = rows[Number(el.dataset.fmMed)];
      r.templateId = el.value;
      const tpl = S.templates.find((t) => String(t.id) === String(r.templateId));
      r.choice = tpl ? (formDoseChoices(tpl)[0] || {}).value || "" : "";
      paintRows();
    }));
    scrim.querySelectorAll("[data-fm-dose]").forEach((el) => el.addEventListener("change", () => { rows[Number(el.dataset.fmDose)].choice = el.value; }));
    scrim.querySelectorAll("[data-fm-del]").forEach((el) => el.addEventListener("click", () => { rows.splice(Number(el.dataset.fmDel), 1); paintRows(); }));
  }
  paintRows();
  $("fm-add").addEventListener("click", () => { rows.push({ templateId: "", choice: "" }); paintRows(); });
  scrim.querySelectorAll("[data-fm-reason]").forEach((b) => b.addEventListener("click", () => {
    reason = b.dataset.fmReason;
    scrim.querySelectorAll("[data-fm-reason]").forEach((x) => x.classList.toggle("on", x === b));
    $("fm-med-label").textContent = reason === "purchased" ? "Medication and dose they purchased" : "Medication and dose they chose (optional)";
  }));

  $("fm-next").addEventListener("click", async () => {
    const err = $("fm-err");
    const show = (msg) => { err.textContent = msg; err.hidden = false; };
    err.hidden = true;
    const name = $("fm-name").value.trim(), mobile = $("fm-mobile").value.trim(), email = $("fm-email").value.trim();
    const meds = rows.filter((r) => r.templateId).map((r) => {
      const tpl = S.templates.find((t) => String(t.id) === String(r.templateId));
      const d = applyTemplateTo(freshDraft(tpl.category), tpl, r.choice);
      return { templateId: tpl.id, medication: d.medication, category: d.category, route: d.route, frequency: d.frequency, dose: d.dose, protocolKey: d.protocolKey || "" };
    });
    if (reason === "purchased" && !meds.length) return show("Choose the medication the patient purchased.");
    if (!name) return show("Add the patient's name.");
    if (channel === "wa" && !mobile) return show("Add a mobile number to send this on WhatsApp.");
    if (channel === "email" && !email) return show("Add an email address to send this by email.");
    const btn = $("fm-next");
    btn.classList.add("loading");
    try {
      const form = await api("POST", "/api/patient-forms", {
        patientId: w.existingId, reason, meds,
        patient: { name, title: p.title, mobile, email, dob: p.dob, gender: p.gender, heightCm: p.heightCm, weightKg: p.weightKg, medications: p.medications, intake: p.intake },
      });
      paintSend(form, { name, title: p.title, gender: p.gender, mobile, email });
    } catch (ex) {
      show(ex.message);
    } finally {
      btn.classList.remove("loading");
    }
  });

  // Second step: the message, ready to send. The send is its own click so the
  // browser allows WhatsApp to open in a new tab.
  function paintSend(form, person) {
    const url = patientFormUrl(form.token);
    const primary = (ch) => (ch === channel ? "btn-accent" : "btn-secondary");
    $("fm-body").innerHTML = `
      <div class="field"><label for="fm-msg">Message</label><textarea class="input" id="fm-msg" rows="14"></textarea></div>
      <div class="card" style="background:var(--bg);padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px">
        <span style="flex:1;min-width:0;font-size:12.5px;color:var(--muted);word-break:break-all">${esc(url)}</span>
        <button class="btn btn-ghost btn-sm" id="fm-copylink" type="button">${icon("copy", 15)} Link</button>
        <a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener">Preview</a>
      </div>
      <p class="hint" style="margin-bottom:14px">The link works for 30 days, or until the patient sends their answers. They'll appear on your dashboard under Patient forms.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ${primary("wa")}" style="flex:1;min-width:150px" id="fm-wa" type="button">${icon("whatsapp", 18)} Send via WhatsApp</button>
        <button class="btn ${primary("email")}" style="flex:1;min-width:150px" id="fm-mail" type="button">${icon("mail", 18)} Send by email</button>
        <button class="btn btn-secondary" id="fm-copy" type="button">${icon("copy", 18)} Copy</button>
      </div>
      <button class="btn btn-ghost btn-block" id="fm-done" type="button" style="margin-top:10px">Done</button>`;
    const msg = $("fm-msg");
    msg.value = patientFormMessage(person, form.reason, form.meds, url);
    // Once it's sent the patient takes over, and everything typed so far went
    // with the form, so there's no consultation left to keep as a draft.
    const handOver = async () => {
      w.published = true;
      clearTimeout(autosaveTimer);
      await w._saving;
      if (w.draftId) { try { await api("DELETE", `/api/drafts/${w.draftId}`); } catch { /* best effort */ } }
      w.draftId = null;
      refreshDraftBadge();
    };
    $("fm-wa").addEventListener("click", () => {
      if (!person.mobile) return toast("This patient has no mobile number on file", "bad");
      window.open(waLink(person.mobile, msg.value), "_blank");
      handOver();
    });
    $("fm-mail").addEventListener("click", () => { openEmail(person.email, patientFormSubject(), msg.value); handOver(); });
    $("fm-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(msg.value); toast("Message copied"); handOver(); });
    $("fm-copylink").addEventListener("click", async () => { await navigator.clipboard.writeText(url); toast("Link copied"); });
    $("fm-done").addEventListener("click", async () => {
      await handOver();
      scrim.remove();
      location.hash = "#/dashboard";
    });
  }
}

// Opens a submitted form as a consultation, filled in with the patient's
// answers and the medication they bought, so the doctor checks and publishes.
async function openFormReview(id) {
  view().innerHTML = `<div class="skel" style="height:340px"></div>`;
  let f;
  try { f = await api("GET", `/api/patient-forms/${id}`); }
  catch (ex) { view().innerHTML = `<div class="empty">${icon("alert", 32)}<div class="empty-title">${esc(ex.message)}</div></div>`; return; }
  if (f.status !== "submitted") {
    view().innerHTML = `<div class="empty">${icon("checkCircle", 32)}<div class="empty-title">This form has already been dealt with</div><p><a href="#/dashboard">Back to the dashboard</a></p></div>`;
    return;
  }
  if (f.draftId) return void resumeDraft(f.draftId);
  if (f.patientId && !S.patients.some((x) => x.id === f.patientId)) { try { S.patients = await api("GET", "/api/patients"); } catch {} }

  const w = S.wizard, a = f.answers, known = f.patient || {};
  const knownGoals = known.intake && Array.isArray(known.intake.health_goals) && known.intake.health_goals.length ? known.intake.health_goals : null;
  w.existingId = f.patientId || null;
  w.form = { id: f.id, flags: f.flags, urgent: f.urgent, submittedAt: f.submittedAt, reason: f.reason, newPatient: f.newPatient };
  Object.assign(w.patient, {
    name: a.name, mobile: a.mobile, email: a.email, title: f.title || "", age: a.age, dob: a.dob, gender: a.gender,
    heightCm: a.heightCm, weightKg: a.weightKg,
    startWeightKg: known.startWeightKg || a.weightKg, maxWeightKg: known.maxWeightKg || "",
    goalWeightKg: known.goalWeightKg || suggestGoalWeightKg(a.heightCm) || "", goalWeightCustomized: known.goalWeightKg != null,
    nationalId: known.nationalId || "", activityLevel: known.activityLevel || "Sedentary", medications: a.medications,
    intake: { ...(known.intake || {}), ...f.intake, ...(knownGoals ? { health_goals: knownGoals } : {}) },
  });
  w.cart = f.meds.map((m) => {
    const tpl = S.templates.find((t) => t.id === m.templateId) || S.templates.find((t) => t.category === m.category && (t.config.medication || t.name) === m.medication);
    const d = freshDraft(tpl ? tpl.category : "custom");
    if (tpl) applyTemplateTo(d, tpl, m.category === "glp1" ? m.dose : m.protocolKey);
    else Object.assign(d, { medication: m.medication, dose: m.dose, route: m.route || "injection", frequency: m.frequency || "weekly" });
    return cartItemFrom(d);
  });
  paintWizard();
}

// Stays at the top of every step of the review, so a reported risk can't be
// scrolled past on the way to publishing.
function formReviewBannerHTML(form) {
  const flags = form.flags || [];
  const urgent = flags.filter((f) => f.level === "urgent"), review = flags.filter((f) => f.level === "review");
  const list = (items) => `<ul>${items.map((f) => `<li>${esc(f.text)}</li>`).join("")}</ul>`;
  return `
  <div class="fm-banner ${urgent.length ? "fm-urgent" : ""}">
    ${icon(urgent.length ? "alert" : "clipboard", 18)}
    <div>
      <b>Filled in by the patient on ${esc(fmtDate(form.submittedAt))}. Nobody has spoken with them yet.</b>
      ${urgent.length ? `<div class="fm-group"><b>Urgent: told not to start until you have spoken</b>${list(urgent)}</div>` : ""}
      ${review.length ? `<div class="fm-group"><b>Please check</b>${list(review)}</div>` : ""}
    </div>
  </div>`;
}

function patientFormsCardHTML(pf) {
  const { toReview, waiting } = pf;
  if (!toReview.length && !waiting.length) return "";
  const urgent = toReview.filter((f) => f.urgent).length;
  const what = (f) => (f.meds.length ? medNames(f.meds) : "No medication chosen yet");
  const contact = (f) => [f.mobile ? `+${f.mobile}` : "", f.email].filter(Boolean).join(" · ");
  return `
  <div class="card" style="margin-bottom:20px">
    <div class="card-title" style="padding:18px 18px 4px;flex-wrap:wrap">${icon("clipboard", 19)} Patient forms
      ${toReview.length ? `<span class="badge badge-amber">${toReview.length} to review</span>` : ""}
      ${urgent ? `<span class="badge badge-red">${urgent} urgent</span>` : ""}
    </div>
    ${toReview.map((f) => `
    <div class="due-row">
      <div class="avatar">${esc(initials(f.name))}</div>
      <div class="due-info">
        <div class="due-name">${f.patientId ? `<a href="#/patient/${f.patientId}">${esc(f.name)}</a>` : esc(f.name)} ${f.urgent ? `<span class="badge badge-red">urgent</span>` : ""}</div>
        <div class="pt-meta">${esc(what(f))} · ${esc(contact(f))} · sent in ${timeAgo(f.submittedAt)}</div>
        ${f.flags.length ? `<div class="fm-flags">${f.flags.map((x) => `<span class="${x.level === "urgent" ? "fm-flag-u" : ""}">${esc(x.text)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="due-actions">
        <a class="btn btn-primary btn-sm" href="#/consult?form=${f.id}">Review</a>
        <button class="btn btn-ghost btn-sm" type="button" data-form-dismiss="${f.id}">Dismiss</button>
      </div>
    </div>`).join("")}
    ${waiting.length ? `<div class="fm-sub">Waiting for the patient (${waiting.length})</div>` : ""}
    ${waiting.map((f, i) => `
    <div class="due-row">
      <div class="avatar">${esc(initials(f.name))}</div>
      <div class="due-info">
        <div class="due-name">${f.patientId ? `<a href="#/patient/${f.patientId}">${esc(f.name)}</a>` : esc(f.name)}</div>
        <div class="pt-meta">${esc(what(f))} · sent ${timeAgo(f.createdAt)} · ${f.views ? `opened ${timeAgo(f.lastViewedAt)}` : "not opened yet"}</div>
      </div>
      <div class="due-actions">
        ${f.mobile ? `<button class="btn btn-accent btn-sm" type="button" data-form-wa="${i}">${icon("whatsapp", 15)} Remind</button>` : ""}
        ${f.email ? `<button class="btn btn-secondary btn-sm" type="button" data-form-mail="${i}">${icon("mail", 15)} Email</button>` : ""}
        <button class="btn btn-ghost btn-sm" type="button" data-form-cancel="${f.id}">Cancel</button>
      </div>
    </div>`).join("")}
  </div>`;
}

function wirePatientForms(pf) {
  const box = document.getElementById("patient-forms");
  if (!box) return;
  const textFor = (f) => patientFormMessage({ name: f.name, title: f.title }, f.reason, f.meds, patientFormUrl(f.token));
  // Reminding keeps the same link working for another full period. The window
  // opens first, inside the click, or the browser blocks it.
  const extend = (f) => { api("POST", `/api/patient-forms/${f.id}/resend`, {}).catch(() => {}); };
  box.querySelectorAll("[data-form-wa]").forEach((b) => b.addEventListener("click", () => {
    const f = pf.waiting[Number(b.dataset.formWa)];
    window.open(waLink(f.mobile, textFor(f)), "_blank");
    extend(f);
  }));
  box.querySelectorAll("[data-form-mail]").forEach((b) => b.addEventListener("click", () => {
    const f = pf.waiting[Number(b.dataset.formMail)];
    openEmail(f.email, patientFormSubject(), textFor(f));
    extend(f);
  }));
  box.querySelectorAll("[data-form-cancel]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Cancel this form? The link will stop working.")) return;
    await api("DELETE", `/api/patient-forms/${b.dataset.formCancel}`);
    toast("Form cancelled");
    viewDashboard();
  }));
  box.querySelectorAll("[data-form-dismiss]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Dismiss this form without a review? Their answers stay in their file and in Messages, but no program will be created.")) return;
    await api("DELETE", `/api/patient-forms/${b.dataset.formDismiss}`);
    toast("Form dismissed");
    viewDashboard();
  }));
}

// The form as part of the patient's file.
function patientFormFileCardHTML(forms) {
  if (!forms || !forms.length) return "";
  return `
  <div class="card card-pad">
    <div class="card-title" style="flex-wrap:wrap">${icon("clipboard", 19)} Patient form
      ${forms[0].status === "submitted" ? `<span class="badge badge-amber">waiting for review</span>` : `<span class="badge badge-green">reviewed</span>`}
      ${forms[0].status === "submitted" && forms[0].urgent ? `<span class="badge badge-red">urgent</span>` : ""}
    </div>
    ${forms.map((f, i) => `
      <details ${i === 0 && f.status === "submitted" ? "open" : ""} class="fm-file">
        <summary>${esc(f.meds.length ? medNames(f.meds) : "No medication chosen")} · filled in ${esc(fmtDate(f.submittedAt))}</summary>
        <div class="rf-quote" style="white-space:pre-wrap;margin-top:8px">${esc(f.summary)}</div>
      </details>
      ${f.status === "submitted" ? `<a class="btn btn-primary btn-sm" style="margin-top:10px" href="#/consult?form=${f.id}">Review and publish</a>` : ""}`).join("")}
  </div>`;
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
    patient: { name: "", mobile: "", email: "", nationalId: "", title: "", age: "", dob: "", gender: "", heightCm: "",
      weightKg: "", startWeightKg: "", maxWeightKg: "", goalWeightKg: "", goalWeightCustomized: false,
      activityLevel: "Sedentary", chronicIllnesses: "", medications: "", allergies: "", intake: {} },
    cart: [],              // programs added so far this consultation (one entry per medication)
    noMedication: false,   // doctor explicitly chose not to prescribe anything this visit
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
  const formId = Number((location.hash.match(/form=(\d+)/) || [])[1]);
  if (formId) return void openFormReview(formId);
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
    title: p.title || "", age: p.age || "", dob: p.dob || "", gender: p.gender || "",
    heightCm: p.height_cm || "", weightKg: p.last_weight || p.current_weight_kg || p.start_weight_kg || "",
    startWeightKg: p.start_weight_kg || "", maxWeightKg: p.max_weight_kg || "",
    goalWeightKg: p.goal_weight_kg || "", goalWeightCustomized: p.goal_weight_kg != null,
    intake: p.intake_json ? JSON.parse(p.intake_json) : {},
  });
}

// Whole years between a YYYY-MM-DD date of birth and today, or null when the
// date is missing, malformed, in the future or implausibly old.
function ageFromDob(dob) {
  const m = String(dob || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = new Date();
  let age = t.getFullYear() - Number(m[1]);
  if ((t.getMonth() + 1) * 100 + t.getDate() < Number(m[2]) * 100 + Number(m[3])) age--;
  return age >= 0 && age <= 120 ? age : null;
}
const todayISO = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

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
    <div><h1>${S.wizard.form ? "Review patient form" : "New consultation"}</h1><div class="sub">${S.wizard.form ? "Filled in by the patient. Check each step, then publish." : "Consult → build program → publish guide"}</div></div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="hint" id="wz-autosave">${savedStampText()}</span>
      <button class="btn btn-secondary btn-sm" id="wz-savelater" type="button">${icon("clock", 16)} Save for later</button>
    </div>
  </div>
  <div class="steps">
    ${WIZ_STEPS.map((s, i) => `<div class="step-dot ${i < S.wizard.step ? "done" : ""} ${i === S.wizard.step ? "on" : ""}"><div class="step-bar"></div><div class="step-lbl">${i + 1}. ${s}</div></div>`).join("")}
  </div>
  ${S.wizard.form ? formReviewBannerHTML(S.wizard.form) : ""}`;
}

// ── drafts: a consultation is kept until it is published ─────────────
// Nothing here touches the real patients/plans tables. The wizard saves
// itself to Drafts whenever a page is completed (the step changes), when the
// doctor navigates away from the consultation, and a few seconds after they
// stop typing — so no patient is ever lost part-way. "Save for later" is the
// manual version of the same thing. Publishing deletes the draft.
const wizardHasContent = (w) => !!(w && w.patient && (w.patient.name.trim() || w.patient.mobile.trim() || w.patient.email.trim()));

function wizardProgress(w) {
  if (w.step === 0) {
    const subs = intakeSubSteps();
    return `Intake · ${subs[Math.min(w.intakeSub, subs.length - 1)].label}`;
  }
  return WIZ_STEPS[w.step] || "";
}

// What gets stored: the wizard's data, minus bookkeeping that only means
// something in this browser tab, minus the one-time plaintext PIN, and with
// each program's template reduced to its id (re-found in the library on
// resume) rather than a copy of the whole library record.
function wizardSnapshot(w) {
  const { _pos, _saving, savedAt, published, pendingPin, ...rest } = w;
  return JSON.parse(JSON.stringify(rest, (k, v) => (k === "template" && v && typeof v === "object" ? { id: v.id } : v)));
}

function savedStampText() {
  const w = S.wizard;
  return w && w.savedAt ? `Draft saved ${new Date(w.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "";
}

// Saves the current consultation as a draft (creating it the first time).
// Saves are queued one after another, so two quick triggers can never create
// two drafts. Resolves true when something was saved.
function persistDraft(showErrors) {
  const w = S.wizard;
  if (!w || w.published || !wizardHasContent(w)) return Promise.resolve(false);
  const run = async () => {
    if (w.published) return false;
    const p = w.patient;
    const body = {
      label: p.name.trim() || p.mobile.trim() || p.email.trim(),
      progress: wizardProgress(w), mobile: p.mobile.trim(), state: wizardSnapshot(w), formId: w.form ? w.form.id : null,
    };
    if (w.draftId) {
      try { await api("PUT", `/api/drafts/${w.draftId}`, body); }
      catch (ex) {
        if (ex.status !== 404) throw ex;   // discarded elsewhere — keep the work by saving it afresh
        w.draftId = (await api("POST", "/api/drafts", body)).id;
      }
    } else {
      w.draftId = (await api("POST", "/api/drafts", body)).id;
    }
    w.savedAt = Date.now();
    const stamp = document.getElementById("wz-autosave");
    if (stamp) stamp.textContent = savedStampText();
    refreshDraftBadge();
    return true;
  };
  w._saving = (w._saving || Promise.resolve()).then(run).catch((ex) => {
    if (showErrors) toast(ex.message || "Could not save draft", "bad");
    return false;
  });
  return w._saving;
}

// Called whenever the wizard paints: a change of page means the previous one
// was completed, so save.
function autosavePosition() {
  const w = S.wizard;
  if (!w) return;
  const pos = `${w.step}.${w.intakeSub}`;
  const prev = w._pos;
  w._pos = pos;
  if (prev !== undefined && prev !== pos) persistDraft(false);
}

let autosaveTimer = null;
function scheduleAutosave() {
  if (!S.wizard || S.wizard.published || !location.hash.startsWith("#/consult")) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => persistDraft(false), 6000);
}

// Amber count on the Drafts nav link, so unfinished files are never out of sight.
// Amber count on Dashboard: how many patients are up for refill, visible from
// any page.
async function refreshRefillBadge() {
  let rows;
  try { rows = await api("GET", "/api/refills/due"); } catch { return; }
  paintRefillBadge(rows.length);
}
function paintRefillBadge(count) {
  document.querySelectorAll('a[href="#/dashboard"]').forEach((a) => {
    let b = a.querySelector(".badge");
    if (!count) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.className = "badge badge-amber"; b.style.marginLeft = "6px"; a.appendChild(b); }
    b.textContent = count;
  });
}

async function refreshDraftBadge() {
  if (!S.user || !canPrescribe()) return;
  let rows;
  try { rows = await api("GET", "/api/drafts"); } catch { return; }
  document.querySelectorAll('a[href="#/drafts"]').forEach((a) => {
    let b = a.querySelector(".badge");
    if (!rows.length) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.className = "badge badge-amber"; b.style.marginLeft = "6px"; a.appendChild(b); }
    b.textContent = rows.length;
  });
}

async function saveDraftForLater() {
  const w = S.wizard;
  if (!w) return;
  if (!wizardHasContent(w)) return toast("Add the patient's name or mobile number first", "bad");
  if (await persistDraft(true)) toast("Saved — resume anytime from Drafts");
}

async function resumeDraft(draftId) {
  view().innerHTML = `<div class="skel" style="height:340px"></div>`;
  try {
    const { state } = await api("GET", `/api/drafts/${draftId}`);
    // Programs were saved with just their template's id; find the record again.
    const rehydrate = (o) => { if (o && o.template && o.template.id != null) o.template = S.templates.find((t) => t.id === o.template.id) || null; };
    rehydrate(state.draft);
    (state.cart || []).forEach(rehydrate);
    state.patient = { dob: "", ...state.patient };
    state.draftId = draftId;
    S.wizard = state;
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
  <div class="page-head"><div><h1>Drafts</h1><div class="sub">Every consultation stays here until you publish it — pick one up where you left off</div></div></div>
  ${drafts.length ? `<div class="card">
    ${drafts.map((d) => `
      <div class="pt-row" data-draft="${d.id}">
        <div class="pt-info">
          <div class="pt-name">${esc(d.label || "Untitled consultation")}${d.progress ? ` <span class="badge badge-amber">${esc(d.progress)}</span>` : ""}</div>
          <div class="pt-meta">${d.mobile ? `+${esc(d.mobile)} · ` : ""}Saved ${timeAgo(d.updated_at)}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" data-resume="${d.id}">${icon("chevR", 15)} Resume</button>
          <button class="icon-btn" data-discard="${d.id}" aria-label="Discard draft">${icon("x", 16)}</button>
        </div>
      </div>`).join("")}
  </div>` : `<div class="empty">${icon("clock", 34)}<div class="empty-title">No drafts</div><p>Consultations you start but don't publish will show up here.</p></div>`}`;
  view().querySelectorAll("[data-resume]").forEach((b) => b.addEventListener("click", () => { location.hash = `#/consult?draft=${b.dataset.resume}`; }));
  view().querySelectorAll("[data-discard]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Discard this saved consultation? This can't be undone.")) return;
    await api("DELETE", `/api/drafts/${b.dataset.discard}`);
    refreshDraftBadge();
    viewDrafts();
  }));
}

function paintWizard() {
  const w = S.wizard;
  autosavePosition();
  if (w.step === 0) return wizStepIntake();
  if (w.step === 1) return wizStepProgram();
  if (w.step === 2) return wizStepLabs();
  if (w.step === 3) return wizStepClinical();
  return wizStepReview();
}

// ── intake question rendering (ported from Consult-Buddy intake) ─────────
// `conditionalOn.value` may be a string or an array of strings (OR match).
function intakeVisible(q, patient = S.wizard.patient) {
  if (!q.conditionalOn) return true;
  const src = q.conditionalOn.questionId === "gender"
    ? patient.gender
    : patient.intake[q.conditionalOn.questionId];
  if (!src) return false;
  const targets = Array.isArray(q.conditionalOn.value) ? q.conditionalOn.value : [q.conditionalOn.value];
  if (Array.isArray(src)) return src.some((a) => targets.some((t) => a.includes(t)));
  return targets.some((t) => String(src).includes(t));
}

function reqMark(q) { return q.required ? ' <span class="req">*</span>' : ""; }

// `patient` is the object the answers live on: the consultation's patient by
// default, or the copy the chart editor is working on.
function renderIntakeQuestion(q, patient = S.wizard.patient) {
  const ans = patient.intake;
  const val = ans[q.id];
  if (q.type === "select") {
    // `patientField` questions (e.g. activity level) bind straight to the
    // patient record instead of the free-form intake bag.
    const bind = q.patientField ? "patient" : "intake";
    const curVal = q.patientField ? patient[q.patientField] : val;
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
function wireIntake(scope, rerender, patient = S.wizard.patient) {
  const ans = patient.intake;
  scope.querySelectorAll("[data-iqchip]").forEach((b) => b.addEventListener("click", () => {
    const key = b.dataset.field || b.dataset.iqchip, v = b.dataset.v;
    if (b.dataset.bind === "patient") patient[key] = (patient[key] === v ? "" : v);
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
  if (r.age) { w.patient.age = r.age; w.patient.dob = ""; changed.push("age"); }
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
  autosavePosition();
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
    <div class="field"${w.form && w.existingId ? ' style="display:none"' : ""}>
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
    ${w.form ? "" : `
    <div class="field full" style="margin-top:-8px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost btn-sm" id="wz-missed-appt">${icon("whatsapp", 15)} Send missed-appointment message</button>
        <button type="button" class="btn btn-ghost btn-sm" id="wz-form-wa">${icon("whatsapp", 15)} Send patient form</button>
        <button type="button" class="btn btn-ghost btn-sm" id="wz-form-email">${icon("mail", 15)} Email patient form</button>
      </div>
      <span class="hint">If ${esc(w.patient.name || "this patient")} isn't present, send a quick WhatsApp to reschedule. If they bought their medication without a consultation, or can't join one, send the patient form so they can fill in their own details.</span>
    </div>`}

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
      <div class="field">
        <label for="wp-age">Age <span class="req">*</span></label>
        <input class="input" id="wp-age" type="number" inputmode="numeric" min="12" max="110" value="${esc(w.patient.age)}">
        <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
          <span class="hint">or</span>
          <input class="input" id="wp-dob" type="date" min="1900-01-01" max="${todayISO()}" value="${esc(w.patient.dob || "")}" aria-label="Date of birth" style="flex:1;min-width:0">
          <span class="hint">date of birth</span>
        </div>
      </div>
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
  wirePeptideInfoButtons(view());

  const demoTextIds = { name: "wp-name", mobile: "wp-mobile", email: "wp-email", nationalId: "wp-natid", age: "wp-age", dob: "wp-dob", heightCm: "wp-height", weightKg: "wp-weight", startWeightKg: "wp-startweight", maxWeightKg: "wp-maxweight" };
  const commitDemo = () => {
    Object.entries(demoTextIds).forEach(([k, id]) => { w.patient[k] = document.getElementById(id).value; });
  };
  const liveMetrics = () => {
    commitDemo();
    // A fresh height suggests a goal weight (BMI 25) — but only until the
    // doctor has typed into that field themselves.
    if (!w.patient.goalWeightCustomized) {
      const suggested = suggestGoalWeightKg(w.patient.heightCm);
      w.patient.goalWeightKg = suggested ?? "";
      document.getElementById("wp-goalweight").value = w.patient.goalWeightKg;
    }
    document.getElementById("wz-metrics").innerHTML = patientSummaryHTML(false);
    refreshPatientInfoSide();
  };
  // Age can be typed or worked out from a date of birth — whichever the
  // doctor has. Registered before the generic handler below so the other
  // field is already reconciled when the values are read back.
  const ageEl = document.getElementById("wp-age"), dobEl = document.getElementById("wp-dob");
  dobEl.addEventListener("input", () => { const a = ageFromDob(dobEl.value); if (a !== null) ageEl.value = a; });
  ageEl.addEventListener("input", () => { dobEl.value = ""; });
  Object.values(demoTextIds).forEach((id) => document.getElementById(id).addEventListener("input", liveMetrics));
  document.getElementById("wp-goalweight").addEventListener("input", (e) => {
    w.patient.goalWeightKg = e.target.value;
    w.patient.goalWeightCustomized = true;
    document.getElementById("wz-metrics").innerHTML = patientSummaryHTML(false);
    refreshPatientInfoSide();
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
  ["wa", "email"].forEach((channel) => {
    const btn = document.getElementById(`wz-form-${channel}`);
    if (btn) btn.addEventListener("click", () => { commitDemo(); patientFormModal(channel); });
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
  const showPregBox = w.patient.gender !== "Male" && (w.patient.gender === "Female" || w.patient.intake.is_pregnant !== undefined);
  // Only the patient form asks these, so they appear only once it has.
  const formQ = (id) => (w.patient.intake[id] !== undefined ? renderIntakeQuestion(qById(id)) : "");

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
      ${formQ("planning_pregnancy")}
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
    ${formQ("thyroid_history")}
    ${formQ("pancreas_history")}
    ${renderIntakeQuestion(glp1Q)}
    ${w.patient.intake.last_lab_date ? `
    <div class="clinical-box chronic">
      <h3>${icon("clipboard", 13)} Last lab test, from the patient's form</h3>
      <div style="font-size:14px;line-height:1.6;overflow-wrap:anywhere">
        <div>${esc(labDateDMY(w.patient.intake))}</div>
        <div>${abnormalLabsText(w.patient.intake) ? `<b>Abnormal, as reported by the patient:</b> ${esc(abnormalLabsText(w.patient.intake))}` : "No abnormal results listed"}</div>
      </div>
    </div>` : ""}
  `, wizSidePanel());
  wireNotesPanel(view());
  wirePeptideInfoButtons(view());

  wireIntake(view(), () => wizIntakeClinical());
  document.getElementById("wz-back").addEventListener("click", retreatIntake);
  document.getElementById("wz-next").addEventListener("click", () => {
    const missing = validateClinical();
    if (missing.length) return showIntakeErr(missing);
    advanceIntake();
  });
}

// ── persistent side panel: patient summary + notes + recommended meds ──
// Shown on every consultation page so demographics/BMI/goal weight, a note
// jotted early in the intake, and the medications suggested from the
// patient's health goals all stay visible the whole way through — not just
// on the one step that happened to collect them.
function patientInfoSideHTML() {
  const w = S.wizard, p = w.patient, m = wizMetrics();
  const row = (lbl, val) => val ? `<div class="pi-row"><span class="pi-lbl">${lbl}</span><span class="pi-val">${val}</span></div>` : "";
  const demo = [p.age ? `${esc(p.age)} y` : "", esc(p.gender || "")].filter(Boolean).join(" · ");
  return `<div class="card card-pad" id="wz-patientinfo">
    <div class="card-title">${icon("user", 17)} Patient summary</div>
    ${row("Name", esc(p.name) || "—")}
    ${row("Age / Gender", demo)}
    ${row("Height", p.heightCm ? esc(p.heightCm) + " cm" : "")}
    ${row("Weight", p.weightKg ? esc(p.weightKg) + " kg" : "")}
    ${row("BMI", m.bmi ? `${m.bmi} · ${esc(m.bmiCat)}` : "")}
    ${row("Goal weight", p.goalWeightKg ? esc(p.goalWeightKg) + " kg" : "")}
    ${row("BMR", m.bmr ? m.bmr + " kcal" : "")}
    ${row("TDEE", m.tdee ? m.tdee + " kcal" : "")}
    ${row("Calorie target", m.target ? m.target + " kcal" : "")}
    ${row("Protein target", m.proteinMin ? `${m.proteinMin}–${m.proteinMax} g` : "")}
    ${!p.name && !p.heightCm && !p.weightKg ? `<p class="hint">Fill in the Identity step to see this patient's summary here.</p>` : ""}
  </div>`;
}
// Re-renders just the summary card in place — called as the doctor types on
// the Identity step, without touching the notes textarea or meds list next
// to it (both live in the same sidebar but shouldn't re-render together).
function refreshPatientInfoSide() {
  const box = document.getElementById("wz-patientinfo");
  if (box) box.outerHTML = patientInfoSideHTML();
}
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
  return patientInfoSideHTML() + patientNotesSideHTML() + suggestedPeptidesHTML();
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
    refreshPatientInfoSide();
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
    ${qs.map((q) => renderIntakeQuestion(q)).join("")}
  `, wizSidePanel());
  wireNotesPanel(view());
  wirePeptideInfoButtons(view());
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
    <div style="margin-top:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <button class="btn btn-secondary" id="wz-add-cart" type="button">${icon("plus", 16)} Add to program</button>
      ${!w.cart.length ? `<button type="button" class="linklike" id="wz-no-med">or continue without prescribing a medication</button>` : ""}
    </div>
    ${w.noMedication && !w.cart.length ? `
    <div class="g-callout g-teal" style="margin-top:14px">
      ${icon("info", 17)}
      <div style="flex:1">No medication will be prescribed this visit. You'll still get the EMR note, and the patient still gets a guide with their nutrition plan and how medication could help. <button type="button" class="linklike" id="wz-no-med-cancel">Add a medication instead</button></div>
    </div>` : ""}
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
  const noMedBtn = document.getElementById("wz-no-med");
  if (noMedBtn) noMedBtn.addEventListener("click", () => { w.noMedication = true; wizStepProgram(); });
  const noMedCancelBtn = document.getElementById("wz-no-med-cancel");
  if (noMedCancelBtn) noMedCancelBtn.addEventListener("click", () => { w.noMedication = false; wizStepProgram(); });

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
      applyTemplateTo(d, S.templates.find((t) => t.id === Number(b.dataset.tpl)));
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
    if (!w.cart.length && !w.noMedication) { err.textContent = "Add at least one program before continuing, or choose to continue without a medication."; err.hidden = false; return; }
    w.step = 2;
    prefillFromIntake();
    if (!Object.keys(w.diet).length && (w.noMedication || w.cart.some((c) => c.category === "glp1"))) w.diet = defaultDiet();
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
  w.noMedication = false; // a medication was added after all
  w.cart.push(cartItemFrom(d));
  w.draft = freshDraft(d.category);
  return true;
}

function cartItemFrom(d) {
  return {
    ...d,
    phases: d.phases.map((p) => ({ ...p })),
    instructions: defaultInstructionsFor(d),
    warnings: defaultWarningsFor(d),
    bloodTest: "none",
  };
}

// Fills a program draft from a library template. `choice` picks the dose (a
// GLP-1) or dosing protocol (a peptide); without one it takes the first.
function applyTemplateTo(d, tpl, choice) {
  d.template = tpl;
  d.medication = tpl.config.medication || tpl.name;
  if (d.category === "glp1") {
    d.route = tpl.config.route;
    d.frequency = tpl.config.frequency;
    d.halfLifeHours = tpl.config.halfLifeHours;
    d.dose = choice || tpl.config.doses[0];
    d.phases = suggestTitration(tpl.config.doses, d.dose, tpl.config.titration);
  } else {
    // Default to the guidebook's first approved variant; fall back to the
    // clinic's own protocol for anything the guidebook doesn't cover.
    const opts = peptideProtocolOptions(d.medication, tpl);
    const sel = opts.find((o) => o.key === choice) || opts[0];
    d.protocolKey = sel ? sel.key : null;
    d.protocol = sel ? sel.protocol : tpl.config.protocols[0];
    d.protocolBase = d.protocol;
    d.customizing = false;
    applyProtocolTo(d);
  }
  return d;
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

// Calories are set for weight loss when that's the aim: on a GLP-1, when weight
// is a stated goal, or when BMI is above the healthy range. Otherwise they sit
// at the level that maintains the patient's weight.
function dietFromMetrics(m, weightLoss) {
  const diet = { water: "2–3 L daily", plate: { ...DIET_PLATE_DEFAULT } };
  if (m.proteinMin) { diet.proteinMin = m.proteinMin; diet.proteinMax = m.proteinMax; diet.proteinBasisKg = m.proteinBasisKg; diet.proteinBasis = m.proteinBasis; }
  const calories = weightLoss || Number(m.bmi) >= 25 ? m.target : m.tdee;
  if (calories) diet.calories = calories;
  diet.proteinTarget = dietProteinTarget(diet) || undefined;
  diet.meals = defaultDietMeals(diet.proteinTarget);
  return diet;
}

const isWeightGoal = (goals) => (S.presets.weightLossGoals || []).some((g) => (goals || []).includes(g));

function defaultDiet() {
  const w = S.wizard;
  return dietFromMetrics(wizMetrics(), w.cart.some((c) => c.category === "glp1") || isWeightGoal(w.patient.intake.health_goals));
}

function defaultDietForPatient(p) {
  const m = computeMetrics({
    heightCm: p.height_cm, weightKg: p.current_weight_kg || p.start_weight_kg, goalWeightKg: p.goal_weight_kg,
    age: p.age, gender: p.gender, activityLevel: p.activity_level,
  }, S.presets.activityLevels);
  return dietFromMetrics(m, true);
}

// The wizard's plan follows the patient's details until the doctor edits it, so
// going back to correct a weight updates the protein target and the example day.
function syncWizardDiet() {
  const w = S.wizard;
  const fresh = defaultDiet();
  const d = w.diet;
  if (!d.rangeEdited) { d.proteinMin = fresh.proteinMin; d.proteinMax = fresh.proteinMax; d.proteinBasisKg = fresh.proteinBasisKg; d.proteinBasis = fresh.proteinBasis; }
  if (!d.caloriesEdited) d.calories = fresh.calories;
  if (!d.water) d.water = fresh.water;
  if (!d.plate) d.plate = fresh.plate;
  if (!d.targetEdited) d.proteinTarget = dietProteinTarget({ proteinMin: d.proteinMin, proteinMax: d.proteinMax }) || undefined;
  if (!d.mealsEdited) d.meals = defaultDietMeals(d.proteinTarget);
}

// The doctor's review of the plan before it reaches the patient. Everything the
// guide shows from it can be changed here, and the guide preview follows.
function dietEditorHTML(diet, patient) {
  const d = dietPlanFor(diet);
  const conditions = String(patient.chronicIllnesses || patient.chronic_illnesses || "");
  const allergies = String(patient.allergies || "").trim();
  const inp = (id, label, value, attrs) => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" value="${esc(value ?? "")}" ${attrs || ""}></div>`;
  return `
  <div class="card" style="background:var(--bg);margin-bottom:14px">
    <div class="card-title" style="padding:16px 16px 0;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <span style="display:flex;align-items:center;gap:10px">${icon("utensils", 18)} Nutrition plan for the patient's guide</span>
      <button class="btn btn-ghost btn-sm" id="de-rebuild" type="button">${icon("activity", 15)} Rebuild example day</button>
    </div>
    <p class="hint" style="margin:8px 16px 0">Worked out from this patient's goal weight, or their current weight if there is no goal. Review it and change anything you like; the patient sees what you publish.</p>
    ${/kidney|renal|ckd|nephro/i.test(conditions) ? `<div class="g-callout g-amber" style="margin:10px 16px 0">${icon("alert", 17)}<div>Kidney disease is on file. Please check this protein target is safe for this patient.</div></div>` : ""}
    ${allergies && !/^(none|no known)/i.test(allergies) ? `<div class="g-callout g-amber" style="margin:10px 16px 0">${icon("alert", 17)}<div>Allergies on file: ${esc(allergies)}. Please check the example day avoids them.</div></div>` : ""}
    <div class="form-grid" style="padding:12px 16px 0">
      <div class="field"><label>Daily protein (g)</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="input" style="flex:1;min-width:70px" id="de-pmin" type="number" value="${esc(d.proteinMin ?? "")}" aria-label="Protein minimum"> –
          <input class="input" style="flex:1;min-width:70px" id="de-pmax" type="number" value="${esc(d.proteinMax ?? "")}" aria-label="Protein maximum">
        </div>
        <span class="hint" id="de-basis">${d.proteinBasisKg ? `1.2–1.5 × ${d.proteinBasis === "goal" ? "goal weight" : "current weight"} (${esc(d.proteinBasisKg)} kg)` : ""}</span>
      </div>
      ${inp("de-target", "Example day adds up to (g)", d.proteinTarget, 'type="number" min="0"')}
      ${inp("de-cal", "Calorie target (kcal/day)", d.calories, 'type="number" min="0"')}
      ${inp("de-water", "Water", d.water)}
    </div>
    <div style="padding:0 16px"><div style="font-weight:700;font-size:13.5px;margin-bottom:8px">Plate portions</div></div>
    <div class="de-plate" style="padding:0 16px">
      ${inp("de-p", "Protein", d.plate.protein)}
      ${inp("de-f", "Fibre", d.plate.fibre)}
      ${inp("de-c", "Carbs", d.plate.carbs)}
    </div>
    <div style="padding:0 16px"><div style="font-weight:700;font-size:13.5px;margin-bottom:8px">Example day</div>
      ${d.meals.map((m) => `
        <div class="de-meal">
          <div class="de-meal-head"><label for="de-items-${m.key}">${esc(m.name)}</label>
            <span class="de-meal-g"><input class="input" id="de-g-${m.key}" type="number" min="0" value="${esc(m.proteinG ?? "")}" aria-label="${esc(m.name)} protein in grams"> g protein</span>
          </div>
          <textarea class="input" id="de-items-${m.key}" rows="2">${esc(m.items)}</textarea>
        </div>`).join("")}
    </div>
    <div class="field" style="padding:0 16px 16px;margin:0"><label for="de-note">Note for the patient (optional)</label><textarea class="input" id="de-note" rows="2" placeholder="Anything specific to this patient, e.g. vegetarian swaps">${esc(d.note || "")}</textarea></div>
  </div>`;
}

function wireDietEditor(root, diet) {
  const el = (id) => root.querySelector("#" + id);
  const num = (id) => Number(el(id).value) || undefined;
  const paintMeals = () => diet.meals.forEach((m) => {
    el(`de-g-${m.key}`).value = m.proteinG ?? "";
    el(`de-items-${m.key}`).value = m.items;
  });
  const rebuild = () => { diet.meals = defaultDietMeals(dietProteinTarget(diet)); diet.mealsEdited = false; paintMeals(); };
  const onRange = () => {
    diet.proteinMin = num("de-pmin"); diet.proteinMax = num("de-pmax"); diet.rangeEdited = true;
    // The doctor's own figures, so the guide no longer explains them as a formula.
    delete diet.proteinBasisKg; delete diet.proteinBasis;
    el("de-basis").textContent = "";
    if (diet.targetEdited) return;
    diet.proteinTarget = dietProteinTarget({ proteinMin: diet.proteinMin, proteinMax: diet.proteinMax }) || undefined;
    el("de-target").value = diet.proteinTarget ?? "";
    if (!diet.mealsEdited) rebuild();
  };
  el("de-pmin").addEventListener("input", onRange);
  el("de-pmax").addEventListener("input", onRange);
  el("de-target").addEventListener("input", () => {
    diet.proteinTarget = num("de-target"); diet.targetEdited = !!diet.proteinTarget;
    if (!diet.mealsEdited) rebuild();
  });
  el("de-cal").addEventListener("input", () => { diet.calories = num("de-cal"); diet.caloriesEdited = true; });
  el("de-water").addEventListener("input", () => { diet.water = el("de-water").value; });
  [["de-p", "protein"], ["de-f", "fibre"], ["de-c", "carbs"]].forEach(([id, key]) => el(id).addEventListener("input", () => { diet.plate[key] = el(id).value; }));
  el("de-note").addEventListener("input", () => { diet.note = el("de-note").value; });
  // Looked up on each edit, because rebuilding replaces the meal objects.
  const meal = (key) => diet.meals.find((x) => x.key === key);
  diet.meals.forEach(({ key }) => {
    el(`de-g-${key}`).addEventListener("input", () => { meal(key).proteinG = num(`de-g-${key}`) ?? null; diet.mealsEdited = true; });
    el(`de-items-${key}`).addEventListener("input", () => { meal(key).items = el(`de-items-${key}`).value; diet.mealsEdited = true; });
  });
  el("de-rebuild").addEventListener("click", () => {
    if (diet.mealsEdited && !confirm("Replace your edits to the example day with a fresh one built from the protein target?")) return;
    rebuild();
  });
}

// Shown in a guide when nothing was prescribed. Written for the patient's own
// goals; the doctor reviews and edits it before publishing.
const MEDICATION_WHY = {
  "Weight loss": "Diet and activity are the foundation of weight loss, but the body pushes back: as weight falls, hunger rises and metabolism slows, which is why weight so often returns. GLP-1 medications act on the appetite signals between your gut and brain, helping you feel full sooner and think about food less, so a plan like this one is easier to keep up. In clinical trials, people using them alongside diet and activity lost significantly more weight than with diet and activity alone.",
  "Improve metabolism & reduce belly fat": "Belly fat and insulin resistance are driven by hormones as well as calories. GLP-1 medications improve blood sugar control and appetite regulation, and can help reduce fat around the waist when used with a healthy diet and regular activity.",
  "Healthy aging & longevity": "Energy, recovery and cellular repair naturally decline with age. Some peptide therapies are used to support these processes alongside good sleep, nutrition and exercise.",
  "Build muscle & recover better": "Building muscle depends on training, protein and recovery. Some peptide therapies are used to support growth hormone signalling and tissue repair, which may help you recover between sessions.",
  "Heal injuries & reduce pain": "Recovery depends on rest, rehabilitation and good nutrition. Some peptide therapies are used to support tissue repair and may help alongside these.",
  "Improve sleep & reset body clock": "Good sleep habits come first. When they aren't enough, some peptide therapies are used to support the body's natural sleep rhythms.",
  "Cognitive function & mood enhancement": "Sleep, stress and nutrition all affect focus and mood. Some peptide therapies are used to support focus, memory and resilience to stress alongside these.",
  "Sexual health": "Sexual health is affected by hormones, blood flow and overall health. Once any underlying causes have been checked, some treatments can help support desire and function.",
  "Immune function & inflammation": "Nutrition, sleep and activity shape how the immune system works. Some peptide therapies are used to help regulate immune activity and inflammation alongside these.",
  "Gut health": "Diet is the first step for gut health. Some peptide therapies are used to support the repair of the gut lining and calm inflammation alongside it.",
  "Skin & hair": "Protein, hydration and sun protection all matter for skin and hair. Some peptide therapies are used to support collagen and hair follicle health alongside these.",
};

function medicationWhyDefault(goals) {
  const known = (goals || []).filter((g) => MEDICATION_WHY[g]);
  const closing = "Medication isn't needed by everyone and isn't right for everyone. If your progress stalls, or you'd like to explore this, speak to your doctor, who can check whether it's safe and suitable for you.";
  if (!known.length) return `Healthy eating and activity come first. When they aren't enough on their own, medication can add to them.\n\n${closing}`;
  const options = (g) => ((S.presets.healthGoalPeptides || {})[g] || []).filter((x) => x.priority === "Primary").map((x) => x.name);
  const parts = known.map((g) => {
    const names = options(g);
    return `**${g}**\n${MEDICATION_WHY[g]}${names.length ? `\nOptions your doctor may discuss: ${names.join(", ")}.` : ""}`;
  });
  return `${parts.join("\n\n")}\n\n${closing}`;
}

// What the record and the guide preview need for a visit with no medication.
function wizVisitDraft(extra) {
  const w = S.wizard;
  return {
    diet: w.diet, goals: Array.isArray(w.patient.intake.health_goals) ? w.patient.intake.health_goals.filter((g) => g !== "Other") : [],
    medicationWhy: w.medicationWhy || "", advice: w.advice || "", ...extra,
  };
}

// The arguments for the clinical record: the metrics reflect whatever the doctor
// settled on in the nutrition plan, so the record and the guide always agree.
function wizEmrArgs(labs, supps) {
  const w = S.wizard;
  const m = { ...wizMetrics() };
  if (w.diet.calories) m.target = w.diet.calories;
  if (w.diet.proteinMin) {
    m.proteinMin = w.diet.proteinMin; m.proteinMax = w.diet.proteinMax;
    m.proteinBasisKg = w.diet.proteinBasisKg; m.proteinBasis = w.diet.proteinBasis;
  }
  m.plate = w.diet.plate;
  return [
    { name: w.patient.name, title: w.patient.title, gender: w.patient.gender, mobile: w.patient.mobile,
      age: w.patient.age, heightCm: w.patient.heightCm, weightKg: w.patient.weightKg,
      chronicIllnesses: w.patient.chronicIllnesses, medications: w.patient.medications, allergies: w.patient.allergies,
      intake: w.patient.intake, noMedication: !w.cart.length, medicationWhy: w.medicationWhy, fromForm: w.form || null },
    w.cart, m, w.clinicalNote, w.followupDays, labs, supps,
  ];
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
  const noMed = !items.length && patient.noMedication;
  if (!patient.name || (!items.length && !noMed)) return "";
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
  // Written from the patient's own form: the record says so, and doesn't claim
  // a conversation, counselling or a contraindication check that hasn't happened.
  const form = patient.fromForm || null;

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
    form && intake.thyroid_history ? `Medullary Thyroid Cancer / MEN 2: ${intake.thyroid_history}` : null,
    form && intake.pancreas_history ? `Pancreatitis / Gallbladder Problems: ${intake.pancreas_history}` : null,
    form && intake.last_lab_date ? `Last Lab Test: ${labDateDMY(intake)}` : null,
    form && abnormalLabsText(intake) ? `Abnormal Lab Results (patient-reported): ${abnormalLabsText(intake)}` : null,
    form && intake.is_pregnant ? `Pregnant: ${intake.is_pregnant}${intake.planning_pregnancy === "Yes" ? " (planning a pregnancy)" : ""}` : null,
    form && intake.is_breastfeeding ? `Breastfeeding: ${intake.is_breastfeeding}` : null,
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
  if (others.length || noMed) p1 += ` Cancer/tumor history: ${cancerHistory.toLowerCase()}.`;
  if ((others.length || noMed) && goals.length) p1 += ` Stated health goals include ${goals.join(", ").toLowerCase()}.`;
  p1 += form
    ? (noMed
      ? " Following review of the patient's form, no medication was prescribed."
      : (form.flags || []).length
        ? ` Patient-reported items reviewed by the prescribing doctor: ${form.flags.map((f) => f.text).join("; ")}.`
        : " No contraindications were identified from the information the patient provided.")
    : noMed
    ? " Following clinical review, no medication was prescribed at this visit."
    : others.length && !hasGlp1
      ? " Following clinical review, a personalised peptide therapy plan was formulated based on presentation, goals, and safety profile. There are no identified contraindications to the prescribed regimen."
      : " There are no identified contraindications to GLP-1 receptor agonist therapy.";

  const paras = [p1];

  const proteinBasisNote = m.proteinBasisKg ? ` (1.2–1.5 g/kg of ${m.proteinBasis === "goal" ? "goal weight" : "current weight"}, ${m.proteinBasisKg} kg)` : "";
  if ((hasGlp1 || noMed) && (m.target || m.proteinMin)) {
    const bits = [];
    if (m.target) bits.push(`a daily caloric intake target of ≤${m.target} kcal/day was recommended`);
    if (m.proteinMin) bits.push(`a protein intake goal of ${m.proteinMin}–${m.proteinMax} g/day${proteinBasisNote} was set`);
    paras.push(`Based on the current assessment, ${bits.join(", and ")}. A personalised nutrition plan was provided, with plate portions and an example day of eating. ${form ? "Guidance on lifestyle, nutrition, physical activity and realistic expectations is provided in the patient's guide." : noMed ? "Lifestyle modification, physical activity, treatment goals, and how medication could help if needed were discussed." : "Lifestyle modification, dietary optimization, physical activity, realistic weight-loss expectations, and treatment goals were discussed."}`);
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
  const medLines = noMed
    ? ["None. No medication was prescribed at this visit."]
    : items.length === 1
      ? [emrMedLine(items[0]) + emrMedExtra(items[0], goals)]
      : items.map((it, i) => `${i + 1}. ${emrMedLine(it)}${emrMedExtra(it, goals)}`);
  const counsel = form
    ? `Written guidance on expected benefits, common side effects, how to take the medication, and when to report problems is provided in the patient's guide.${form.spoken ? "" : " No verbal counseling has taken place."}`
    : noMed
    ? `The patient was counseled on nutrition, hydration, and physical activity${patient.medicationWhy ? ", and on how medication could support their goals if needed in future" : ""}.`
    : others.length
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
  const planBullets = noMed ? [
    "Assess progress against the patient's goals at follow-up.",
    "Review whether medication is appropriate at that point.",
    "Reinforce the nutrition plan, hydration, sleep, and physical activity.",
  ] : [
    "Assess response, tolerance, and compliance at follow-up.",
    "Consider dose titration if treatment is well tolerated.",
    hasGlp1
      ? "Continue monitoring weight, appetite, and any medication-related side effects."
      : "Continue monitoring symptoms, injection-site reactions, and any medication-related side effects.",
  ];
  if (others.length) planBullets.push("Reinforce lifestyle modifications, nutrition, hydration, sleep, and physical activity.");

  // With nothing prescribed, the plan given to the patient is the main outcome
  // of the visit, so the record spells it out.
  const plate = m.plate || {};
  const nutritionBlock = noMed ? [
    "NUTRITION PLAN", "",
    m.proteinMin ? `Daily protein: ${m.proteinMin}–${m.proteinMax} g${proteinBasisNote}` : null,
    m.target ? `Daily calories: ≤${m.target} kcal` : null,
    plate.protein ? `Plate portions: ${plate.protein} protein, ${plate.fibre} fibre, ${String(plate.carbs).toLowerCase()} carbs` : null,
    "Example day of eating provided: breakfast, morning snack, lunch, afternoon snack, dinner.",
  ].filter((l) => l !== null).join("\n") : "";

  const formSource = form
    ? `Source: Patient-completed online form, submitted ${fmtDMY(new Date(String(form.submittedAt).replace(" ", "T") + "Z"))}. ${form.spoken ? "The prescribing doctor spoke with the patient about the urgent items before publishing." : "No consultation took place."}${form.reason === "purchased" && items.length ? " The patient purchased the medication before this review." : ""}`
    : "";
  const sections = [
    form ? `Date of Review: ${fmtDMY(encounterDate)}\n${formSource}` : `Date of Encounter: ${fmtDMY(encounterDate)}`,
    patientBlock,
    notesBlock,
    `CLINICAL SUMMARY\n\n${paras.join("\n\n")}`,
    nutritionBlock,
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
  wirePeptideInfoButtons(view());

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
  const noMed = !w.cart.length;
  const showDiet = hasGlp1 || noMed;
  if (showDiet) syncWizardDiet();
  if (noMed && !w.whyEdited) w.medicationWhy = medicationWhyDefault(w.patient.intake.health_goals);

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
      <div class="field full"><label for="cl-note">Private clinical note (EMR — not shown to patient)</label><textarea class="input" id="cl-note" rows="3" placeholder="Consultation summary for your records…">${esc(w.clinicalNote)}</textarea></div>
      ${noMed ? `
      <div class="field full"><label for="cl-advice">Advice for the patient (shown in their guide)</label><textarea class="input" id="cl-advice" rows="3" placeholder="Optional">${esc(w.advice || "")}</textarea></div>
      <div class="field full"><label for="cl-why">How medication could help (shown in their guide)</label><textarea class="input" id="cl-why" rows="9">${esc(w.medicationWhy || "")}</textarea><span class="hint">Written from the patient's goals. Edit it, or clear it to leave this section out.</span></div>` : ""}
    </div>

    ${showDiet ? dietEditorHTML(w.diet, w.patient) : ""}

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
  wirePeptideInfoButtons(view());

  // The EMR box starts populated from every field on this page (and the two
  // steps before it), and stays in sync with them — until the doctor types
  // into the box directly. From that point on, field edits are collected as
  // usual but never overwrite what the doctor wrote; only "Regenerate"
  // (an explicit, confirmed action) discards hand edits and starts over.
  const emrBox = document.getElementById("cl-emr");
  const customFlag = document.getElementById("cl-custom-flag");
  if (showDiet) wireDietEditor(view(), w.diet);
  const computeAutoEmr = () => buildMultiClinicalSuggestion(
    ...wizEmrArgs((w.labTests || []).filter((l) => l.on), (w.suppList || []).filter((s) => s.on))
  ) || "Add the patient's details to generate the clinical record.";
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
    if (noMed) {
      w.advice = document.getElementById("cl-advice").value;
      const why = document.getElementById("cl-why").value;
      if (why !== w.medicationWhy) w.whyEdited = true;
      w.medicationWhy = why;
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
  const previewSigner = { name: S.user.name, credentials: S.user.credentials, signature: S.user.signature, clinic: S.user.clinic || S.user.orgName || "", appName: S.user.appName || "", logoUrl: S.user.logoUrl || "" };
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
  const clinicalSuggestion = w.emrCustomized ? (w.clinicalSuggestion || "") : buildMultiClinicalSuggestion(...wizEmrArgs(previewLabs, previewSupps));
  w.clinicalSuggestion = clinicalSuggestion;
  const guidePerson = { name: w.patient.name, title: w.patient.title, gender: w.patient.gender };
  const previewVisit = wizVisitDraft({ signedBy: previewSigner, labTests: previewLabs, suppList: previewSupps, next_followup: nextFollowup, created_at: createdAt });
  const guideText = fakePlans.length ? buildComboGuideText(fakePlans, guidePerson, S.user.name) : buildVisitGuideText(previewVisit, guidePerson, S.user.name);
  const guideHtml = fakePlans.length ? buildComboGuide(fakePlans, guidePerson, S.user.name) : buildVisitGuide(previewVisit, guidePerson, S.user.name);
  const publishSaves = w.cart.length > 1 ? `${w.cart.length} programs` : w.cart.length === 1 ? "the program" : "this consultation";
  const urgentFlags = w.form ? (w.form.flags || []).filter((f) => f.level === "urgent") : [];
  view().innerHTML = `${wizHead()}
  <div class="two-col" style="grid-template-columns:1fr 340px">
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:10px;flex-wrap:wrap">
        <div class="card-title" style="margin:0">${icon("file", 19)} Guide preview — what the patient sees</div>
        <button class="btn btn-secondary btn-sm" id="rv-guide-copy" type="button">${icon("copy", 15)} Copy guide text</button>
      </div>
      <div id="guide-preview" style="display:flex;flex-direction:column;gap:18px">
        ${guideHtml}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card card-pad">
        <div class="card-title">${icon("send", 18)} Publish</div>
        <p style="font-size:13.5px;color:var(--muted);margin-bottom:14px">
          Publishing saves ${publishSaves} for <b>${esc(w.patient.name)}</b>${w.existingId ? "" : ", registers them as a new patient"} and generates their portal access PIN to share on WhatsApp.
          ${w.cart.length ? `<br><b>Rx:</b> ${esc(w.cart.map((c) => c.medication + (c.dose ? " " + c.dose : "")).join(", "))}` : ""}
        </p>
        ${urgentFlags.length ? `
        <label class="fm-spoke">
          <input type="checkbox" id="wz-spoke" ${w.form.spoken ? "checked" : ""}>
          <span>I have spoken with the patient about: ${esc(urgentFlags.map((f) => f.text.toLowerCase()).join("; "))}. They were told not to start until I had.</span>
        </label>` : ""}
        <p class="err-text" id="wz-err" hidden role="alert"></p>
        <button class="btn btn-accent btn-block" id="wz-publish"><span class="spin"></span><span class="btn-label">${icon("check", 18)} Publish guide</span></button>
        <button class="btn btn-ghost btn-block" id="wz-back" style="margin-top:8px">${icon("chevL", 16)} Back to edit</button>
      </div>
      ${wizSidePanel()}
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
  wirePeptideInfoButtons(view());
  if (clinicalSuggestion) document.getElementById("rv-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(clinicalSuggestion); toast("Clinical record copied"); });
  document.getElementById("rv-guide-copy").addEventListener("click", async () => { await navigator.clipboard.writeText(guideText); toast("Guide text copied"); });

  document.getElementById("wz-back").addEventListener("click", () => { w.step = 3; paintWizard(); });
  // Ticking it changes what the record says, so the page redraws from it.
  const spoke = document.getElementById("wz-spoke");
  if (spoke) spoke.addEventListener("change", () => { w.form.spoken = spoke.checked; wizStepReview(); });
  document.getElementById("wz-publish").addEventListener("click", async () => {
    const btn = document.getElementById("wz-publish");
    const err = document.getElementById("wz-err");
    err.hidden = true;
    if (urgentFlags.length && !w.form.spoken) {
      err.textContent = "This patient was told not to start until you have spoken. Speak with them, then tick the box above to publish.";
      err.hidden = false;
      return;
    }
    if (!w.patient.mobile.trim()) {
      err.textContent = "A mobile number is required to publish — it's how the patient signs in to their portal. Go back to Intake and add one.";
      err.hidden = false;
      return;
    }
    btn.classList.add("loading");
    try {
      let patientId = w.existingId, newPin = w.pendingPin || null;
      if (!patientId) {
        const created = await api("POST", "/api/patients", {
          name: w.patient.name, mobile: w.patient.mobile, email: w.patient.email, nationalId: w.patient.nationalId, title: w.patient.title,
          age: Number(w.patient.age) || null, dob: w.patient.dob || "", gender: w.patient.gender,
          heightCm: Number(w.patient.heightCm) || null, weightKg: Number(w.patient.weightKg) || null,
          startWeightKg: Number(w.patient.startWeightKg) || null, maxWeightKg: Number(w.patient.maxWeightKg) || null,
          goalWeightKg: Number(w.patient.goalWeightKg) || null,
          activityLevel: w.patient.activityLevel, chronicIllnesses: w.patient.chronicIllnesses,
          medications: w.patient.medications, allergies: w.patient.allergies, intake: w.patient.intake,
        });
        patientId = created.id;
        newPin = created.pin;
        // If a later step fails, retrying must update this patient rather
        // than try to register them a second time.
        w.existingId = patientId;
        w.pendingPin = newPin;
      } else {
        await api("PATCH", `/api/patients/${patientId}`, {
          email: w.patient.email, nationalId: w.patient.nationalId, chronicIllnesses: w.patient.chronicIllnesses, medications: w.patient.medications,
          allergies: w.patient.allergies, intake: w.patient.intake,
          heightCm: Number(w.patient.heightCm) || null, weightKg: Number(w.patient.weightKg) || null,
          startWeightKg: Number(w.patient.startWeightKg) || null, maxWeightKg: Number(w.patient.maxWeightKg) || null,
          goalWeightKg: Number(w.patient.goalWeightKg) || null,
          age: Number(w.patient.age) || null, dob: w.patient.dob || "", gender: w.patient.gender, activityLevel: w.patient.activityLevel,
        });
      }
      // One plan row per program added this consultation — each keeps its
      // own dose/quantity/instructions/warnings/blood test, sharing the
      // visit-level follow-up date, clinical note and EMR suggestion.
      // Chosen labs/supplements are visit-level — attach to every plan so
      // the guide (rendered per-medication) can always show them.
      const cleanLabs = (w.labTests || []).filter((l) => l.on).map((l) => ({ name: l.name, detail: l.detail, fasting: !!l.fasting, required: !!l.required, link: l.link || "" }));
      const cleanSupps = (w.suppList || []).filter((s) => s.on).map((s) => ({ name: s.name, dose: s.dose || "", benefit: s.benefit || "" }));
      // Programs already saved by an earlier, interrupted attempt aren't repeated.
      for (let i = w.plansSaved || 0; i < w.cart.length; i++) {
        const c = w.cart[i], p = fakePlans[i];
        await api("POST", "/api/plans", {
          patientId, category: c.category, title: p.title, medication: c.medication,
          dose: c.dose, quantity: c.quantity, route: c.route, frequency: c.frequency, halfLifeHours: c.halfLifeHours,
          phases: p.phases, instructions: c.instructions, warnings: c.warnings,
          diet: p.diet, followupDays: w.followupDays, bloodTest: c.bloodTest, clinicalNote: w.clinicalNote,
          clinicalSuggestion: w.clinicalSuggestion, supplements: w.supplements,
          labTests: cleanLabs, suppList: cleanSupps,
        });
        w.plansSaved = i + 1;
      }
      // Nothing prescribed: the record and the guide are saved with the visit.
      if (!w.cart.length && !w.visitSaved) {
        await api("POST", `/api/patients/${patientId}/visits`, wizVisitDraft({
          clinicalNote: w.clinicalNote, clinicalSuggestion: w.clinicalSuggestion, followupDays: w.followupDays,
          labTests: cleanLabs, suppList: cleanSupps,
        }));
        w.visitSaved = true;
      }
      if (w.form) {
        // The form made this file without ever sharing a PIN, so one is issued now.
        if (w.form.newPatient && !newPin) {
          newPin = (await api("POST", `/api/patients/${patientId}/pin`)).pin;
          w.pendingPin = newPin;
        }
        if (!w.formDone) {
          await api("POST", `/api/patient-forms/${w.form.id}/complete`, { patientId });
          w.formDone = true;
        }
      }
      // Only now — patient and every program safely saved — does the draft go.
      w.published = true;
      clearTimeout(autosaveTimer);
      await w._saving;
      if (w.draftId) { try { await api("DELETE", `/api/drafts/${w.draftId}`); } catch { /* best effort */ } }
      w.pendingPin = null;
      refreshDraftBadge();
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
  const companyName = S.user.clinic || S.user.orgName || "DarDoc Healthcare";
  const hasProgram = w.cart.length > 0;
  const emailSubject = hasProgram ? `Your personal treatment guide — ${companyName}` : `Your personal health plan — ${companyName}`;
  const medSummary = w.cart.length > 1 ? `${w.cart.length} programs` : hasProgram ? `${w.cart[0].medication}${w.cart[0].dose ? " " + w.cart[0].dose : ""}` : "";
  const waText = hasProgram
    ? (pin
      ? `Hello ${name}, your personal treatment guide for ${medSummary} is ready! 🎉\n\n🔗 Your portal: ${link}\n📱 Mobile: +${w.patient.mobile}\n🔑 PIN: ${pin}\n\nView your guide, log your doses, and check in regularly — I'll be following your progress.\n\n— ${S.user.name}, ${companyName}`
      : `Hello ${name}, your updated treatment guide for ${medSummary} is ready in your portal:\n\n🔗 ${link}\n\nSign in with your mobile number and your existing PIN (ask me for a new one if needed).\n\n— ${S.user.name}, ${companyName}`)
    : (pin
      ? `Hello ${name}, thank you for your visit today. Your personal health plan is ready in your portal:\n\n🔗 Your portal: ${link}\n📱 Mobile: +${w.patient.mobile}\n🔑 PIN: ${pin}\n\nWe'll be in touch ahead of your next follow-up.\n\n— ${S.user.name}, ${companyName}`
      : `Hello ${name}, thank you for your visit today. Your personal health plan is ready in your portal:\n\n🔗 ${link}\n\nSign in with your mobile number and your existing PIN (ask me for a new one if needed).\n\n— ${S.user.name}, ${companyName}`);
  const scrim = modal(`
    <div style="text-align:center;padding:6px 0 2px">
      <div style="width:60px;height:60px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;margin:0 auto 14px">${icon("checkCircle", 30)}</div>
      <h3 style="font-size:20px">Guide published</h3>
      <p style="font-size:14px;color:var(--muted);margin:6px 0 14px">${hasProgram ? `${esc(w.patient.name)}'s program${w.cart.length > 1 ? "s are" : " is"} live in their patient portal.` : `${esc(w.patient.name)}'s visit is recorded and their health plan is live in their patient portal. No medication was prescribed this time.`}</p>
      ${pin ? `<div class="pin-display">${pin}</div><p class="hint" style="margin-bottom:14px">Their portal PIN — shown once. You can regenerate it any time from the patient page.</p>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-accent" style="flex:1;min-width:170px" id="pub-guide">${icon("whatsapp", 18)} Send guide link</button>
        <button class="btn btn-secondary" style="flex:1;min-width:170px" id="pub-pdf">${icon("file", 18)} Send guide PDF</button>
        <button class="btn btn-secondary" style="flex:1;min-width:170px" id="pub-wa">${icon("whatsapp", 18)} Send portal login</button>
        <button class="btn btn-secondary" id="pub-email">${icon("mail", 18)} Email login</button>
        <button class="btn btn-secondary" id="pub-copy">${icon("copy", 18)} Copy</button>
      </div>
      <a class="btn btn-ghost btn-block" style="margin-top:8px" href="#/patient/${patientId}" id="pub-open">Open patient record</a>
    </div>`);
  scrim.querySelector("#pub-guide").addEventListener("click", () => guideLinkModal({ id: patientId, name: w.patient.name, title: w.patient.title, mobile: w.patient.mobile, email: w.patient.email, noMedication: !hasProgram }));
  scrim.querySelector("#pub-pdf").addEventListener("click", () => guidePdfModal({ id: patientId, name: w.patient.name, title: w.patient.title, mobile: w.patient.mobile, email: w.patient.email, noMedication: !hasProgram }));
  scrim.querySelector("#pub-email").addEventListener("click", () => openEmail(w.patient.email, emailSubject, waText));
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
    diet: { ...(plan.diet || {}) },
  };
  // A program published before nutrition plans existed gets one to start from.
  const ensureDiet = () => {
    if (Array.isArray(state.diet.meals) && state.diet.meals.length) return;
    const fresh = defaultDietForPatient(patient);
    const start = { ...fresh, ...state.diet };
    if (state.diet.proteinMin && state.diet.proteinMin !== fresh.proteinMin) { delete start.proteinBasisKg; delete start.proteinBasis; }
    start.proteinTarget = dietProteinTarget(state.diet.proteinMin ? state.diet : start) || undefined;
    start.meals = defaultDietMeals(start.proteinTarget);
    state.diet = start;
  };
  d.template = S.templates.find((t) => t.category === plan.category && (t.config.medication || t.name) === plan.medication) || null;

  paint();

  function paint() {
    const cats = [
      { key: "glp1", label: "GLP-1 / Weight loss" },
      { key: "peptide", label: "Peptide therapy" },
      { key: "custom", label: "Custom program" },
    ];
    if (d.category === "glp1") ensureDiet();
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
        ${d.category === "glp1" ? dietEditorHTML(state.diet, patient) : ""}
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
    if (d.category === "glp1") wireDietEditor(view(), state.diet);

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
        ...(d.category === "glp1" ? { diet: state.diet } : {}),
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
        ${o.logo_version
          ? `<div class="avatar" style="background:#fff;border:1px solid var(--border);width:48px;height:48px;padding:4px;box-sizing:border-box"><img src="/api/org-logo/${o.id}?v=${o.logo_version}" alt="" style="max-width:100%;max-height:100%;object-fit:contain"></div>`
          : `<div class="avatar">${esc(initials(o.name))}</div>`}
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
      ${!isNew ? logoUploaderHTML() : ""}
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
  if (!isNew) wireLogoUploader(scrim, o.id, o.logo_version ? `/api/org-logo/${o.id}?v=${o.logo_version}` : "", rememberOwnLogo(o.id));
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
  ${isSuperadmin() || isPlatformAdmin() ? `
  <div class="card card-pad" id="lg-card">
    <div class="card-title">${icon("home", 19)} Clinic logo</div>
    <p class="hint" style="margin:-6px 0 14px">The logo for <b>${esc(u.orgName || "your clinic")}</b>, shown on the patient guides you send.</p>
    ${logoUploaderHTML()}
  </div>` : ""}
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

  const logoCard = document.getElementById("lg-card");
  if (logoCard) wireLogoUploader(logoCard, u.orgId, u.logoUrl, rememberOwnLogo(u.orgId));

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
