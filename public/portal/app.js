// Patient portal SPA — mobile-first
"use strict";

const S = {
  me: null,          // { patient, plans, doctorName, presets }
  data: null,        // { doses, checkins }
  tab: "home",
};

const app = document.getElementById("app");

async function boot() {
  injectGuideCss(); // accordion styles used throughout the portal, not just the Guide tab
  try {
    S.me = await api("GET", "/api/portal/me");
    S.data = await api("GET", "/api/portal/data");
    renderShell();
    paint();
  } catch {
    renderLogin();
  }
}

function activePlan() {
  return S.me.plans.find((p) => p.status === "active") || S.me.plans[0] || null;
}

// ── login ────────────────────────────────────────────────────────
function renderLogin() {
  document.title = "Sign in — My Portal";
  app.innerHTML = `
  <div class="p-app">
    <div class="login-hero">
      <img src="/brand/docare-olive-sm.png" alt="DoCare" style="height:76px;width:auto;display:block;margin:0 auto 16px">
      <h1>Your treatment portal</h1>
      <p>Sign in with your mobile number and the PIN your doctor sent you on WhatsApp.</p>
    </div>
    <div style="padding:0 20px">
      <form id="pl-form" class="card card-pad" novalidate>
        <div class="field">
          <label for="pl-mob">Mobile number</label>
          <input class="input" id="pl-mob" type="tel" inputmode="tel" autocomplete="tel" placeholder="9715xxxxxxxx">
          <span class="hint">Include your country code, e.g. 9715…</span>
        </div>
        <div class="field">
          <label for="pl-pin">6-digit PIN</label>
          <input class="input" id="pl-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="••••••" style="letter-spacing:.3em;font-size:20px">
        </div>
        <p class="err-text" id="pl-err" hidden role="alert"></p>
        <button class="btn btn-primary btn-block" type="submit"><span class="spin"></span><span class="btn-label">Open my portal</span></button>
      </form>
      <p style="text-align:center;font-size:13px;color:var(--muted);margin-top:16px">
        No PIN yet? Ask your doctor to send your access.<br><a href="/">← Back to home</a>
      </p>
    </div>
  </div>`;
  document.getElementById("pl-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    const err = document.getElementById("pl-err");
    err.hidden = true;
    btn.classList.add("loading");
    try {
      await api("POST", "/api/portal/login", {
        mobile: document.getElementById("pl-mob").value,
        pin: document.getElementById("pl-pin").value,
      });
      await boot();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.classList.remove("loading");
    }
  });
}

// ── shell + nav ──────────────────────────────────────────────────
const TABS = [
  { key: "home", label: "Home", ico: "home" },
  { key: "guide", label: "My Guide", ico: "book" },
  { key: "log", label: "Log", ico: "plus", fab: true },
  { key: "progress", label: "Progress", ico: "trend" },
  { key: "messages", label: "Messages", ico: "message" },
];

function renderShell() {
  document.title = "My Portal — DoCare";
  app.innerHTML = `
  <div class="p-app">
    <header class="p-top">
      <div class="brand-line">
        <img src="/brand/docare-gold-sm.png" alt="DoCare" style="height:36px;width:auto">
        <div>
          <div class="t-name">My Treatment Portal</div>
          <div class="t-sub">with ${esc(S.me.doctorName)} · DoCare</div>
        </div>
      </div>
      <button class="icon-btn" id="p-logout" aria-label="Sign out">${icon("logout", 20)}</button>
    </header>
    <main class="p-view" id="p-view"></main>
    <nav class="p-nav" aria-label="Main">
      ${TABS.map((t) => t.fab
        ? `<button data-tab="${t.key}" class="nav-log" aria-label="Log a dose or check-in"><span class="log-fab">${icon("plus", 24)}</span><span style="margin-top:2px">${t.label}</span></button>`
        : `<button data-tab="${t.key}">${icon(t.ico, 21)}${t.label}</button>`).join("")}
    </nav>
  </div>`;
  app.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    S.tab = b.dataset.tab;
    paint();
  }));
  document.getElementById("p-logout").addEventListener("click", async () => {
    await api("POST", "/api/portal/logout");
    S.me = null;
    renderLogin();
  });
}

function paint() {
  app.querySelectorAll(".p-nav [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
  const v = document.getElementById("p-view");
  window.scrollTo(0, 0);
  if (S.tab === "home") return paintHome(v);
  if (S.tab === "guide") return paintGuide(v);
  if (S.tab === "log") return paintLog(v);
  if (S.tab === "progress") return paintProgress(v);
  if (S.tab === "messages") return paintMessages(v);
}

// ── phase engine ─────────────────────────────────────────────────
// Doses logged against a specific medication (plan_id) — falls back to
// doses with no plan_id when there's only ever been one active plan, so
// existing single-medication patients keep working unchanged.
function dosesForPlan(planId) {
  const tagged = S.data.doses.filter((d) => d.plan_id === planId);
  if (tagged.length) return tagged;
  return S.data.doses.filter((d) => !d.plan_id);
}

function currentPhase(plan) {
  plan = plan || activePlan();
  if (!plan) return null;
  const lastDose = dosesForPlan(plan.id)[0];
  if (!lastDose) return null;
  const cycleHours = frequencyToHours(plan.frequency);
  const phases = cycleHours <= 24 ? S.me.presets.phasesDaily : S.me.presets.phasesWeekly;
  const scale = cycleHours / (cycleHours <= 24 ? 24 : 168);
  const hoursSince = (Date.now() - new Date(lastDose.taken_at).getTime()) / 36e5;
  const h = hoursSince % cycleHours;
  const phase = phases.find((p) => h >= p.range[0] * scale && h < p.range[1] * scale) || phases[phases.length - 1];
  return { phase, phases, h, hoursSince, cycleHours, idx: phases.indexOf(phase) };
}

function nextDoseText(plan) {
  const lastDose = dosesForPlan(plan.id)[0];
  if (!lastDose) return "Log your first dose to start tracking";
  const cycleHours = frequencyToHours(plan.frequency);
  if (String(plan.frequency).includes("needed")) return "Take only when needed, as instructed";
  const next = new Date(new Date(lastDose.taken_at).getTime() + cycleHours * 36e5);
  const diff = next.getTime() - Date.now();
  if (diff <= 0) return "Your next dose is due now";
  const totalH = Math.round(diff / 36e5);
  const days = Math.floor(totalH / 24), hrs = totalH % 24;
  return `Next dose in ${days ? days + "d " : ""}${hrs}h — ${next.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`;
}

// Rough estimated % of the medication still active in the body — a simple
// illustrative model (fast absorption ramp, then first-order decay using
// the medication's half-life if known), not a clinical PK calculation.
function estimatedLevelPct(plan, ph) {
  if (!ph) return 0;
  const hl = plan.half_life_hours || ph.cycleHours * 0.6;
  const rampHours = Math.min(6, ph.cycleHours * 0.05) || 1;
  if (ph.hoursSince <= rampHours) return Math.round(92 * (ph.hoursSince / rampHours));
  const decayH = ph.hoursSince - rampHours;
  return Math.max(4, Math.round(92 * Math.pow(0.5, decayH / hl)));
}

// Interactive radial-progress illustration for the home screen: a ring
// showing the estimated % of medication still active, the current phase
// name/description, and a week-of-cycle caption.
function phaseIllustrationHTML(plan, ph) {
  if (!ph) {
    return `
    <div class="phase-illus" style="background:linear-gradient(135deg, var(--brand), var(--primary))">
      <div class="phase-illus-ring" style="position:relative;width:140px;height:140px">
        <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="No dose logged yet">
          <circle cx="70" cy="70" r="60" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="12"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:50%;width:96px;height:96px;margin:auto">${productIllustration(plan.route, 60)}</div>
      </div>
      <div class="phase-illus-body">
        <div class="phase-lbl">${esc(plan.medication)}${plan.dose ? " " + esc(plan.dose) : ""} · ${esc(plan.frequency)}</div>
        <div class="phase-name">Ready to start</div>
        <div class="phase-desc">Log your first dose and this illustration will track your cycle and estimated levels.</div>
      </div>
    </div>`;
  }
  const pct = estimatedLevelPct(plan, ph);
  const R = 60, C = 2 * Math.PI * R;
  const offset = C * (1 - pct / 100);
  const weekOf = ph.cycleHours > 24 ? `Day ${Math.floor(ph.h / 24) + 1} of ${Math.round(ph.cycleHours / 24)}` : `Hour ${Math.floor(ph.h)} of ${ph.cycleHours}`;
  return `
  <div class="phase-illus" style="background:linear-gradient(135deg, ${ph.phase.color}, ${ph.phase.color}CC)">
    <div class="phase-illus-ring">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="${pct}% of ${esc(plan.medication)} estimated still active">
        <circle cx="70" cy="70" r="${R}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="12"/>
        <circle cx="70" cy="70" r="${R}" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
          transform="rotate(-90 70 70)" style="transition: stroke-dashoffset .6s var(--ease)"/>
        <text x="70" y="65" text-anchor="middle" font-size="26" font-weight="800" fill="#fff" font-family="var(--font-head)">${pct}%</text>
        <text x="70" y="84" text-anchor="middle" font-size="10.5" fill="rgba(255,255,255,.85)">in system</text>
      </svg>
    </div>
    <div class="phase-illus-body">
      <div class="phase-lbl">${esc(plan.medication)}${plan.dose ? " " + esc(plan.dose) : ""} · ${weekOf}</div>
      <div class="phase-name">${esc(ph.phase.name)}</div>
      <div class="phase-desc">${esc(ph.phase.desc)}</div>
      <div class="phase-track">${ph.phases.map((_, i) => `<div class="phase-seg ${i <= ph.idx ? "done" : ""}"></div>`).join("")}</div>
      <div class="phase-meta"><span>${esc(nextDoseText(plan))}</span></div>
    </div>
  </div>`;
}

// ── home ─────────────────────────────────────────────────────────
function paintHome(v) {
  const p = S.me.patient;
  const active = S.me.plans.filter((pl) => pl.status === "active");
  const primary = active.find((pl) => pl.category === "glp1") || active[0] || null;
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const ph = primary ? currentPhase(primary) : null;
  const weights = S.data.checkins.filter((c) => c.weight_kg != null);
  const lastCheckin = S.data.checkins[0];

  v.innerHTML = `
  <div class="hello">
    <h1>${greet}, ${esc(p.title ? p.title + " " : "")}${esc(p.name.split(" ")[0])}</h1>
    <div class="sub">${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
  </div>

  ${!primary ? `
  <div class="list-card card-pad empty">${icon("file", 34)}
    <div class="empty-title">No treatment plan yet</div>
    <p>Your doctor hasn't published a guide for you yet. It will appear here as soon as it's ready.</p>
  </div>` : phaseIllustrationHTML(primary, ph)}

  <div class="qa-grid">
    <button class="qa" id="qa-dose"><span class="qa-ico" style="background:var(--primary-soft);color:var(--primary)">${icon(primary ? routeIcon(primary.route) : "syringe", 20)}</span><b>Log dose</b><span>${S.data.doses.length ? "Last: " + timeAgo(S.data.doses[0].taken_at) : "Nothing logged yet"}</span></button>
    <button class="qa" id="qa-checkin"><span class="qa-ico" style="background:var(--accent-soft);color:var(--accent)">${icon("clipboard", 20)}</span><b>Daily check-in</b><span>${lastCheckin ? "Last: " + fmtDate(lastCheckin.date) : "Tell us how you feel"}</span></button>
    <button class="qa" id="qa-guide"><span class="qa-ico" style="background:var(--brand-soft);color:var(--brand)">${icon("book", 20)}</span><b>My guide</b><span>${active.length ? active.length + " medication" + (active.length > 1 ? "s" : "") : "Not published yet"}</span></button>
    <button class="qa" id="qa-msg"><span class="qa-ico" style="background:var(--violet-soft);color:var(--violet)">${icon("message", 20)}</span><b>Message doctor</b><span>${esc(S.me.doctorName)}</span></button>
  </div>

  ${active.length ? `
  <div class="list-card">
    <div class="list-head"><h3>${icon("layers", 18)} Your medications</h3><span class="badge badge-teal">${active.length}</span></div>
    ${active.map((pl) => medRowHTML(pl)).join("")}
  </div>` : ""}

  ${primary && primary.next_followup ? `
  <div class="list-card card-pad" style="display:flex;gap:12px;align-items:center">
    <span class="qa-ico" style="background:var(--amber-soft);color:var(--amber)">${icon("calendar", 20)}</span>
    <div><b style="font-family:var(--font-head);font-size:14.5px">Follow-up due ${esc(fmtDate(primary.next_followup))}</b>
    <div style="font-size:12.5px;color:var(--muted)">Your doctor will review your dose and progress.</div></div>
  </div>` : ""}

  ${weights.length > 1 ? `
  <div class="list-card">
    <div class="list-head"><h3>${icon("trend", 18)} Weight trend</h3><span class="badge ${weights[0].weight_kg <= weights[weights.length - 1].weight_kg ? "badge-green" : "badge-amber"}">${(weights[0].weight_kg - weights[weights.length - 1].weight_kg).toFixed(1)} kg</span></div>
    <div class="card-pad" style="padding-top:8px">${lineChart(weights.map((c) => ({ x: c.date, y: c.weight_kg })).reverse(), { color: "#283618", unit: " kg", height: 150, aria: "Weight trend" })}</div>
  </div>` : ""}`;

  v.querySelector("#qa-dose").addEventListener("click", () => { S.tab = "log"; S.logMode = "dose"; S.logPlanId = primary ? primary.id : null; paint(); });
  v.querySelector("#qa-checkin").addEventListener("click", () => { S.tab = "log"; S.logMode = "checkin"; paint(); });
  v.querySelector("#qa-guide").addEventListener("click", () => { S.tab = "guide"; paint(); });
  v.querySelector("#qa-msg").addEventListener("click", () => { S.tab = "messages"; paint(); });

  v.querySelectorAll("[data-med-guide]").forEach((b) => b.addEventListener("click", () => {
    S.guidePlanId = Number(b.dataset.medGuide); S.tab = "guide"; paint();
  }));
  v.querySelectorAll("[data-med-log]").forEach((b) => b.addEventListener("click", () => {
    S.logPlanId = Number(b.dataset.medLog); S.tab = "log"; S.logMode = "dose"; paint();
  }));
  v.querySelectorAll("[data-med-finish]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(`Tell ${S.me.doctorName} you've finished this medication and need a refill?`)) return;
    await api("POST", `/api/portal/plans/${b.dataset.medFinish}/finished`, {});
    S.me = await api("GET", "/api/portal/me");
    toast("Your doctor has been notified to arrange a refill.");
    paint();
  }));
}

// One row per active medication on the home screen — dose/frequency at a
// glance, plus quick links to that medication's own guide, its own dose
// log, and a "finished this medication" flag for the doctor to reorder.
// Each medication is its own collapsible group — tap the header to reveal
// next-dose timing and the Guide/Log/Finished actions, instead of showing
// everything as text up front.
function medRowHTML(pl) {
  return `
  <details class="med-row">
    <summary class="med-row-sum">
      <span class="med-row-illus">${productIllustration(pl.route, 40)}</span>
      <span class="pt-info">
        <span class="pt-name">${esc(pl.medication)}${pl.dose ? " · " + esc(pl.dose) : ""} ${pl.needs_refill ? '<span class="badge badge-amber">refill requested</span>' : ""}</span>
        <span class="pt-meta">${esc(pl.frequency)}${pl.quantity > 1 ? ` · × ${esc(pl.quantity)}` : ""}</span>
      </span>
      ${icon("chevR", 16)}
    </summary>
    <div class="med-row-body">
      <div class="pt-meta" style="margin-bottom:10px">${esc(nextDoseText(pl))}</div>
      <div class="med-row-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-med-guide="${pl.id}">${icon("book", 14)} Guide</button>
        <button type="button" class="btn btn-secondary btn-sm" data-med-log="${pl.id}">${icon(routeIcon(pl.route), 14)} Log dose</button>
        ${!pl.needs_refill ? `<button type="button" class="btn btn-ghost btn-sm" data-med-finish="${pl.id}">${icon("checkCircle", 14)} Finished — need refill</button>` : ""}
      </div>
    </div>
  </details>`;
}

// ── guide ────────────────────────────────────────────────────────
// Every active medication is its own full guide, selectable via a chip
// picker — "Also on your program" summaries were replaced by this so a
// patient can open any prescribed medication's complete guide on its own.
function paintGuide(v) {
  injectGuideCss();
  const active = S.me.plans.filter((p) => p.status === "active");
  const plans = active.length ? active : (S.me.plans[0] ? [S.me.plans[0]] : []);
  if (!plans.length) {
    v.innerHTML = `<div class="list-card card-pad empty">${icon("book", 34)}<div class="empty-title">No guide yet</div><p>Your personalised treatment guide will appear here once your doctor publishes it.</p></div>`;
    return;
  }
  const primary = plans.find((p) => p.category === "glp1") || plans[0];
  const activeId = S.guidePlanId && plans.some((p) => p.id === S.guidePlanId) ? S.guidePlanId : primary.id;
  const others = S.me.plans.filter((x) => !plans.includes(x));
  const renderOne = (plan) => buildGuide(plan, S.me.patient, S.me.doctorName);
  v.innerHTML = `
  <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
    <button class="btn btn-secondary btn-sm" id="g-print">${icon("printer", 15)} Print / Save PDF</button>
  </div>
  ${guidePickerHTML(plans, activeId)}
  <div id="g-active-guide">${renderOne(plans.find((p) => p.id === activeId))}</div>
  ${others.length ? `
  <div class="list-card" style="margin-top:16px">
    <div class="list-head"><h3>${icon("layers", 18)} Previous programs</h3></div>
    ${others.map((o) => `
      <div style="padding:12px 16px;border-top:1px solid var(--border);font-size:13.5px">
        <b style="font-family:var(--font-head)">${esc(o.medication)}${o.dose ? " " + esc(o.dose) : ""}</b>
        <span class="badge ${o.status === "active" ? "badge-green" : "badge-gray"}">${esc(o.status)}</span>
        <div style="color:var(--muted);font-size:12.5px">Started ${esc(fmtDate(o.created_at))}</div>
      </div>`).join("")}
  </div>` : ""}`;
  wireGuidePicker(v, plans, renderOne, activeId);
  v.querySelectorAll("[data-gpick]").forEach((b) => b.addEventListener("click", () => { S.guidePlanId = Number(b.dataset.gpick); }));
  v.querySelector("#g-print").addEventListener("click", () => window.print());
}

// ── log (dose + check-in) ────────────────────────────────────────
function paintLog(v) {
  const active = S.me.plans.filter((pl) => pl.status === "active");
  const plan = active.find((pl) => pl.id === S.logPlanId) || active.find((pl) => pl.category === "glp1") || active[0] || null;
  const mode = S.logMode || "dose";
  const sites = ["Abdomen L", "Abdomen R", "Thigh L", "Thigh R", "Arm L", "Arm R"];
  const now = new Date();
  const localDT = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  v.innerHTML = `
  <div class="hello"><h1>Log</h1><div class="sub">Keep your doctor in the loop — it takes 30 seconds.</div></div>
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <button class="chip ${mode === "dose" ? "on" : ""}" id="lg-dose-tab">${plan && plan.route !== "injection" ? "Log dose" : "Log injection"}</button>
    <button class="chip ${mode === "checkin" ? "on" : ""}" id="lg-ci-tab">Daily check-in</button>
  </div>
  <div id="log-body"></div>`;

  v.querySelector("#lg-dose-tab").addEventListener("click", () => { S.logMode = "dose"; paintLog(v); });
  v.querySelector("#lg-ci-tab").addEventListener("click", () => { S.logMode = "checkin"; paintLog(v); });
  const body = v.querySelector("#log-body");

  if (mode === "dose") {
    // Different medications can be logged on the same day, so when more
    // than one is active the patient picks which one this entry is for.
    const medPicker = active.length > 1 ? `
      <div class="field"><label>Which medication?</label>
        <div class="chip-row" id="ds-med-picker">
          ${active.map((pl) => `<button type="button" class="chip ${plan && pl.id === plan.id ? "on" : ""}" data-medpick="${pl.id}">${esc(pl.medication)}${pl.dose ? " · " + esc(pl.dose) : ""}</button>`).join("")}
        </div>
      </div>` : "";
    body.innerHTML = `
    <form class="list-card card-pad" id="dose-form">
      ${medPicker}
      ${plan && active.length <= 1 ? `<div class="metric-strip" style="margin-top:0"><div class="metric"><b>${esc(plan.medication)}</b>${esc(plan.dose ? plan.dose + " · " : "")}${esc(plan.frequency)}</div></div>` : ""}
      <div class="field"><label for="ds-when">When</label><input class="input" id="ds-when" type="datetime-local" value="${localDT}" max="${localDT}"></div>
      <div class="field"><label for="ds-dose">Dose</label><input class="input" id="ds-dose" value="${esc(plan ? plan.dose : "")}" placeholder="e.g. 2.5mg"></div>
      ${plan && plan.route === "injection" ? `
      <div class="field"><label>Injection site</label>
        <div class="site-grid" id="ds-sites">${sites.map((s) => `<button type="button" class="chip" data-site="${s}">${s}</button>`).join("")}</div>
        <span class="hint">Rotate sites to avoid soreness.</span>
      </div>` : ""}
      <div class="field"><label for="ds-notes">Notes (optional)</label><input class="input" id="ds-notes" placeholder="Anything to mention?"></div>
      <button class="btn btn-primary btn-block" type="submit"><span class="spin"></span><span class="btn-label">Save dose</span></button>
    </form>
    ${S.data.doses.length ? accordion("clock", `Recent doses (${S.data.doses.length})`, S.data.doses.slice(0, 5).map((d) => {
      const medName = (S.me.plans.find((pl) => pl.id === d.plan_id) || {}).medication;
      return `
      <div style="padding:9px 0;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:13.5px">
        <span>${medName ? `<b>${esc(medName)}</b> ` : ""}${esc(d.dose || "Dose")}${d.site ? ` · ${esc(d.site)}` : ""}</span>
        <span style="color:var(--muted)">${esc(fmtDate(d.taken_at, true))}</span>
      </div>`;
    }).join("").replace("border-top:1px solid var(--border);", ""), false) : ""}`;

    body.querySelectorAll("[data-medpick]").forEach((b) => b.addEventListener("click", () => {
      S.logPlanId = Number(b.dataset.medpick);
      paintLog(v);
    }));
    let site = "";
    body.querySelectorAll("[data-site]").forEach((b) => b.addEventListener("click", () => {
      body.querySelectorAll("[data-site]").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      site = b.dataset.site;
    }));
    body.querySelector("#dose-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      btn.classList.add("loading");
      try {
        await api("POST", "/api/portal/doses", {
          planId: plan ? plan.id : undefined,
          takenAt: new Date(body.querySelector("#ds-when").value).toISOString(),
          dose: body.querySelector("#ds-dose").value,
          site,
          notes: body.querySelector("#ds-notes").value,
        });
        S.data = await api("GET", "/api/portal/data");
        toast(`${plan ? plan.medication + " dose" : "Dose"} saved — nice work!`);
        S.tab = "home";
        paint();
      } catch (ex) { toast(ex.message, "bad"); }
      finally { btn.classList.remove("loading"); }
    });
  } else {
    const syms = S.me.presets.symptoms;
    body.innerHTML = `
    <form class="list-card card-pad" id="ci-form">
      <div class="form-grid">
        <div class="field"><label for="ci-date">Date</label><input class="input" id="ci-date" type="date" value="${new Date().toISOString().slice(0, 10)}" max="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label for="ci-wt">Weight (kg) — optional</label><input class="input" id="ci-wt" type="number" step="0.1" min="25" max="350" inputmode="decimal" placeholder="e.g. 82.5"></div>
      </div>
      ${accordion("clipboard", "How are you feeling today?", syms.map((s) => `
      <div class="sym-block">
        <div class="sym-lbl">${esc(s.label)}</div>
        <div class="sym-opts" data-sym="${s.key}">
          ${s.options.map((o, i) => `<button type="button" class="chip" data-v="${esc(o)}" data-sev="${i === 0 ? "" : s.alertOn.includes(o) ? "bad" : i >= 2 ? "warn" : ""}">${esc(o)}</button>`).join("")}
        </div>
      </div>`).join(""), true)}
      <div class="field"><label for="ci-notes">Anything else? (optional)</label><textarea class="input" id="ci-notes" rows="2" placeholder="Describe how you're feeling…"></textarea></div>
      <button class="btn btn-accent btn-block" type="submit"><span class="spin"></span><span class="btn-label">Submit check-in</span></button>
    </form>`;

    const selected = {};
    body.querySelectorAll("[data-sym]").forEach((row) => {
      row.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => {
        row.querySelectorAll(".chip").forEach((x) => x.classList.remove("on", "warn", "bad"));
        b.classList.add("on");
        if (b.dataset.sev) b.classList.add(b.dataset.sev);
        selected[row.dataset.sym] = b.dataset.v;
      }));
    });
    body.querySelector("#ci-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      btn.classList.add("loading");
      try {
        const r = await api("POST", "/api/portal/checkins", {
          date: body.querySelector("#ci-date").value,
          weightKg: Number(body.querySelector("#ci-wt").value) || null,
          symptoms: selected,
          notes: body.querySelector("#ci-notes").value,
        });
        S.data = await api("GET", "/api/portal/data");
        toast(r.flagged ? "Check-in sent — your doctor has been alerted about your symptoms." : "Check-in saved. Keep it up!");
        S.tab = "home";
        paint();
      } catch (ex) { toast(ex.message, "bad"); }
      finally { btn.classList.remove("loading"); }
    });
  }
}

// ── progress ─────────────────────────────────────────────────────
function paintProgress(v) {
  const weights = S.data.checkins.filter((c) => c.weight_kg != null).map((c) => ({ x: c.date, y: c.weight_kg })).reverse();
  const doses = S.data.doses;
  const checkins = S.data.checkins;
  const p = S.me.patient;
  const start = p.start_weight_kg;
  const nowW = weights.length ? weights[weights.length - 1].y : start;
  const lost = start && nowW ? (start - nowW) : null;
  const bmi = calcBMIClient(p.height_cm, nowW);

  v.innerHTML = `
  <div class="hello"><h1>Progress</h1><div class="sub">Everything you and your doctor can see.</div></div>

  <div class="stat-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">
    <div class="stat"><div class="stat-ico" style="background:var(--primary-soft);color:var(--primary)">${icon("scale", 18)}</div><div class="stat-val">${nowW ? nowW + " kg" : "—"}</div><div class="stat-lbl">Current weight</div></div>
    <div class="stat"><div class="stat-ico" style="background:var(--accent-soft);color:var(--accent)">${icon("trend", 18)}</div><div class="stat-val">${lost != null ? (lost >= 0 ? "−" : "+") + Math.abs(lost).toFixed(1) + " kg" : "—"}</div><div class="stat-lbl">Since start</div></div>
    <div class="stat"><div class="stat-ico" style="background:var(--brand-soft);color:var(--brand)">${icon("syringe", 18)}</div><div class="stat-val">${doses.length}</div><div class="stat-lbl">Doses logged</div></div>
    <div class="stat"><div class="stat-ico" style="background:var(--violet-soft);color:var(--violet)">${icon("clipboard", 18)}</div><div class="stat-val">${checkins.length}</div><div class="stat-lbl">Check-ins</div></div>
  </div>

  ${bmi ? `<div class="list-card card-pad" style="display:flex;gap:12px;align-items:center;margin-bottom:16px">
    <span class="qa-ico" style="background:var(--brand-soft);color:var(--brand)">${icon("info", 20)}</span>
    <div style="font-size:14px"><b style="font-family:var(--font-head)">BMI ${bmi}</b> — ${esc(bmiCategoryClient(bmi))}</div>
  </div>` : ""}

  <div class="list-card">
    <div class="list-head"><h3>${icon("trend", 18)} Weight</h3></div>
    <div class="card-pad" style="padding-top:8px">
      ${weights.length > 1 ? lineChart(weights, { color: "#283618", unit: " kg", aria: "Weight trend" }) : `<div class="empty">${icon("scale", 30)}<p>Add your weight in your daily check-ins to see the trend here.</p></div>`}
    </div>
  </div>

  <div class="list-card">
    <div class="list-head"><h3>${icon("clock", 18)} History</h3></div>
    ${[...doses.map((d) => ({ t: d.taken_at, type: "dose", d })), ...checkins.map((c) => ({ t: c.date + "T12:00:00", type: "checkin", d: c }))]
      .sort((a, b) => new Date(b.t) - new Date(a.t)).slice(0, 30).map((it) => it.type === "dose" ? `
      <div style="padding:11px 16px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:center;font-size:13.5px">
        <span class="qa-ico" style="width:32px;height:32px;background:var(--primary-soft);color:var(--primary)">${icon("syringe", 15)}</span>
        <div style="flex:1"><b>${esc(it.d.dose || "Dose")}</b>${it.d.site ? ` · ${esc(it.d.site)}` : ""}</div>
        <span style="color:var(--muted);font-size:12px">${esc(fmtDate(it.d.taken_at))}</span>
      </div>` : `
      <div style="padding:11px 16px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:center;font-size:13.5px">
        <span class="qa-ico" style="width:32px;height:32px;background:${it.d.flagged ? "var(--danger-soft)" : "var(--accent-soft)"};color:${it.d.flagged ? "var(--danger)" : "var(--accent)"}">${icon("clipboard", 15)}</span>
        <div style="flex:1"><b>Check-in</b>${it.d.weight_kg ? ` · ${esc(it.d.weight_kg)} kg` : ""}${it.d.flagged ? ' · <span class="badge badge-red">flagged</span>' : ""}</div>
        <span style="color:var(--muted);font-size:12px">${esc(fmtDate(it.d.date))}</span>
      </div>`).join("") || `<div class="empty" style="padding:24px">${icon("clock", 28)}<p>Your dose and check-in history will appear here.</p></div>`}
  </div>`;
}

// ── messages ─────────────────────────────────────────────────────
async function paintMessages(v) {
  const msgs = await api("GET", "/api/portal/messages");
  v.innerHTML = `
  <div class="hello"><h1>Messages</h1><div class="sub">Direct line to ${esc(S.me.doctorName)}. Not for emergencies.</div></div>
  <div class="msg-list" id="p-msgs" style="padding-bottom:70px">
    ${msgs.length ? msgs.map((m) => `
      <div class="msg ${m.sender}">${esc(m.body)}<div class="msg-time">${m.sender === "doctor" ? esc(S.me.doctorName) + " · " : ""}${timeAgo(m.created_at)}</div></div>`).join("")
    : `<div class="empty">${icon("message", 32)}<div class="empty-title">No messages yet</div><p>Questions about your treatment? Write to your doctor below.</p></div>`}
  </div>
  <form class="msg-bar" id="p-msg-form">
    <label for="p-msg-input" style="position:absolute;left:-9999px">Message</label>
    <input class="input" id="p-msg-input" placeholder="Write to your doctor…" autocomplete="off" style="flex:1">
    <button class="btn btn-primary" type="submit" aria-label="Send" style="min-width:52px">${icon("send", 19)}</button>
  </form>`;
  window.scrollTo(0, document.body.scrollHeight);
  document.getElementById("p-msg-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const inp = document.getElementById("p-msg-input");
    if (!inp.value.trim()) return;
    await api("POST", "/api/portal/messages", { body: inp.value });
    paintMessages(v);
  });
}

boot();
