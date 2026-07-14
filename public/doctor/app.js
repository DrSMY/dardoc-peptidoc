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
  document.title = "Sign in — DarDoc · PeptiDoc";
  app.innerHTML = `
  <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px">
    <div class="card card-pad" style="width:min(420px,100%)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px">
        <div style="width:46px;height:46px;border-radius:13px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center">${icon("stethoscope", 24)}</div>
        <div>
          <div style="font-family:var(--font-head);font-weight:800;font-size:17px">DarDoc · PeptiDoc</div>
          <div style="font-size:12.5px;color:var(--muted)">Doctor dashboard</div>
        </div>
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
  { hash: "#/templates", label: "Program library", ico: "layers" },
  { hash: "#/settings", label: "Settings", ico: "settings" },
];

function renderShell() {
  document.title = "Doctor Dashboard — DarDoc · PeptiDoc";
  app.innerHTML = `
  <div class="mobile-bar">
    <div class="brand-line">${icon("stethoscope", 20)} DarDoc · PeptiDoc</div>
    <button class="icon-btn" style="color:#fff" id="m-logout" aria-label="Sign out">${icon("logout", 20)}</button>
  </div>
  <nav class="m-nav" id="m-nav">
    ${NAV.map((n) => `<a href="${n.hash}">${esc(n.label)}</a>`).join("")}
  </nav>
  <div class="shell">
    <aside class="sidebar">
      <div class="sb-brand">
        <div class="sb-mark">${icon("stethoscope", 21)}</div>
        <div><div class="sb-name">DarDoc · PeptiDoc</div><div class="sb-sub">Doctor dashboard</div></div>
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
}

function stat(ico, bg, fg, val, lbl) {
  return `<div class="stat"><div class="stat-ico" style="background:${bg};color:${fg}">${icon(ico, 19)}</div><div class="stat-val">${val}</div><div class="stat-lbl">${lbl}</div></div>`;
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
      !q || p.name.toLowerCase().includes(q) || String(p.mobile).includes(q.replace(/\D/g, "") || " "));
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
      box.innerHTML = `
      <div class="two-col">
        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="card card-pad">
            <div class="card-title">${icon("trend", 19)} Weight trend</div>
            ${weights.length > 1 ? lineChart(weights, { color: "#0E7490", unit: " kg", aria: "Weight trend" }) : `<div class="empty">${icon("scale", 30)}<p>Weight entries from check-ins will chart here.</p></div>`}
          </div>
          <div class="card card-pad">
            <div class="card-title">${icon("layers", 19)} Programs</div>
            ${plans.length ? plans.map((pl) => `
              <div class="timeline-item">
                <div class="tl-ico" style="background:var(--brand-soft);color:var(--brand)">${icon(pl.route === "injection" ? "syringe" : "pill", 16)}</div>
                <div style="flex:1">
                  <div style="font-weight:700;font-family:var(--font-head);font-size:14.5px">${esc(pl.title)}
                    <span class="badge ${pl.status === "active" ? "badge-green" : pl.status === "completed" ? "badge-cyan" : "badge-gray"}">${esc(pl.status)}</span>
                  </div>
                  <div style="font-size:13px;color:var(--muted)">${esc(pl.medication)}${pl.dose ? " · " + esc(pl.dose) : ""} · ${esc(pl.frequency)} · started ${esc(fmtDate(pl.created_at))}</div>
                </div>
                ${pl.status === "active" ? `
                <div style="display:flex;gap:6px">
                  <button class="btn btn-ghost btn-sm" data-edit-dose="${pl.id}">${icon("edit", 15)} Dose</button>
                  <button class="btn btn-ghost btn-sm" data-stop="${pl.id}">Stop</button>
                </div>` : ""}
              </div>`).join("") : `<div class="empty">${icon("layers", 30)}<p>No programs yet. Start a consultation to publish one.</p></div>`}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="card card-pad">
            <div class="card-title">${icon("clipboard", 19)} Latest check-ins</div>
            ${checkins.slice(0, 6).map((c) => checkinCard(c)).join("") || `<div class="empty">${icon("clipboard", 30)}<p>No check-ins yet.</p></div>`}
          </div>
          <div class="card card-pad">
            <div class="card-title">${icon("info", 19)} Clinical notes</div>
            <div style="font-size:13.5px;display:flex;flex-direction:column;gap:8px">
              <div><b>Chronic illnesses:</b> ${esc(p.chronic_illnesses || "None recorded")}</div>
              <div><b>Medications:</b> ${esc(p.medications || "None recorded")}</div>
              <div><b>Allergies:</b> ${esc(p.allergies || "None recorded")}</div>
              ${p.notes ? `<div><b>Notes:</b> ${esc(p.notes)}</div>` : ""}
            </div>
          </div>
        </div>
      </div>`;
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
    }

    if (S.detailTab === "guide") {
      injectGuideCss();
      const pl = activePlan || plans[0];
      box.innerHTML = pl ? `
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px">
          <button class="btn btn-secondary btn-sm" id="btn-print">${icon("printer", 16)} Print / PDF</button>
          <button class="btn btn-accent btn-sm" id="btn-wa">${icon("whatsapp", 16)} Send via WhatsApp</button>
        </div>
        <div id="guide-box">${buildGuide(pl, p, S.user.name)}</div>`
        : `<div class="empty">${icon("file", 34)}<div class="empty-title">No guide yet</div><p>Publish a program from a consultation and the patient guide will appear here.</p></div>`;
      if (pl) {
        document.getElementById("btn-print").addEventListener("click", () => window.print());
        document.getElementById("btn-wa").addEventListener("click", () => {
          const link = `${location.origin}/portal`;
          const txt = `Hello ${p.title ? p.title + " " : ""}${p.name}, your personal treatment guide for ${pl.medication} is ready.\n\nOpen your patient portal here: ${link}\nSign in with your mobile number. If you need a new PIN, just ask.\n\n— ${S.user.name}, DarDoc · PeptiDoc`;
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
function modal(html) {
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
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
    const waText = `Hello ${p.title ? p.title + " " : ""}${p.name}, here is your access to your personal treatment portal:\n\n🔗 ${link}\n📱 Mobile: +${p.mobile}\n🔑 PIN: ${pin}\n\nYou can view your guide, log your doses and report how you feel — I'll be following your progress.\n\n— ${S.user.name}, DarDoc · PeptiDoc`;
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
const WIZ_STEPS = ["Patient", "Program", "Clinical", "Review & publish"];

async function viewConsult() {
  if (!S.patients.length) { try { S.patients = await api("GET", "/api/patients"); } catch {} }
  const preselect = (location.hash.match(/patient=(\d+)/) || [])[1];
  S.wizard = {
    step: 0,
    existingId: preselect ? Number(preselect) : null,
    patient: { name: "", mobile: "", title: "", age: "", gender: "", heightCm: "", weightKg: "", activityLevel: "Sedentary", chronicIllnesses: "", medications: "", allergies: "" },
    category: "glp1",
    template: null,
    protocol: null,
    medication: "", dose: "", route: "injection", frequency: "weekly", halfLifeHours: null,
    phases: [],
    instructions: "", warnings: "", bloodTest: "none", followupDays: 28, clinicalNote: "",
    diet: {},
  };
  if (preselect) {
    const p = S.patients.find((x) => x.id === Number(preselect));
    if (p) Object.assign(S.wizard.patient, { name: p.name, mobile: p.mobile, title: p.title || "", age: p.age || "", gender: p.gender || "", heightCm: p.height_cm || "", weightKg: p.last_weight || p.start_weight_kg || "" });
  }
  paintWizard();
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
  if (w.step === 0) return wizStepPatient();
  if (w.step === 1) return wizStepProgram();
  if (w.step === 2) return wizStepClinical();
  return wizStepReview();
}

function wizStepPatient() {
  const w = S.wizard;
  view().innerHTML = `${wizHead()}
  <div class="card card-pad" style="max-width:760px">
    <div class="card-title">${icon("user", 19)} Who is this consultation for?</div>
    <div class="field">
      <label for="wz-existing">Existing patient</label>
      <select class="input" id="wz-existing">
        <option value="">— New patient —</option>
        ${S.patients.map((p) => `<option value="${p.id}" ${w.existingId === p.id ? "selected" : ""}>${esc(p.name)} (+${esc(p.mobile)})</option>`).join("")}
      </select>
      <span class="hint">Pick an existing patient for a follow-up, or leave as new.</span>
    </div>
    <hr class="divider">
    <div class="form-grid">
      <div class="field"><label for="wp-name">Full name <span class="req">*</span></label><input class="input" id="wp-name" value="${esc(w.patient.name)}" autocomplete="off"></div>
      <div class="field"><label for="wp-mobile">Mobile (with country code) <span class="req">*</span></label><input class="input" id="wp-mobile" type="tel" inputmode="tel" placeholder="9715xxxxxxxx" value="${esc(w.patient.mobile)}"></div>
      <div class="field"><label for="wp-title">Title</label><select class="input" id="wp-title">${["", "Mr", "Ms", "Mrs", "Dr"].map((t) => `<option ${w.patient.title === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label for="wp-age">Age</label><input class="input" id="wp-age" type="number" inputmode="numeric" min="12" max="110" value="${esc(w.patient.age)}"></div>
      <div class="field"><label for="wp-gender">Gender</label><select class="input" id="wp-gender">${["", "Male", "Female", "Other"].map((g) => `<option ${w.patient.gender === g ? "selected" : ""}>${g}</option>`).join("")}</select></div>
      <div class="field"><label for="wp-activity">Activity level</label><select class="input" id="wp-activity">${Object.keys(S.presets.activityLevels).map((a) => `<option ${w.patient.activityLevel === a ? "selected" : ""}>${a}</option>`).join("")}</select></div>
      <div class="field"><label for="wp-height">Height (cm)</label><input class="input" id="wp-height" type="number" inputmode="decimal" min="100" max="250" value="${esc(w.patient.heightCm)}"></div>
      <div class="field"><label for="wp-weight">Weight (kg)</label><input class="input" id="wp-weight" type="number" inputmode="decimal" min="25" max="350" step="0.1" value="${esc(w.patient.weightKg)}"></div>
    </div>
    <div class="metric-strip" id="wz-metrics"></div>
    <p class="err-text" id="wz-err" hidden role="alert"></p>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px">
      <button class="btn btn-primary" id="wz-next">Continue ${icon("chevR", 17)}</button>
    </div>
  </div>`;

  const upd = () => {
    ["name", "mobile", "title", "age", "gender", "activityLevel", "heightCm", "weightKg"].forEach((k) => {
      const idmap = { name: "wp-name", mobile: "wp-mobile", title: "wp-title", age: "wp-age", gender: "wp-gender", activityLevel: "wp-activity", heightCm: "wp-height", weightKg: "wp-weight" };
      S.wizard.patient[k] = document.getElementById(idmap[k]).value;
    });
    const bmi = calcBMIClient(+S.wizard.patient.heightCm, +S.wizard.patient.weightKg);
    const box = document.getElementById("wz-metrics");
    if (bmi) {
      const cat = bmiCategoryClient(bmi);
      box.innerHTML = `<div class="metric"><b>${bmi}</b>BMI</div><div class="metric"><b>${cat}</b>Category</div>`;
    } else box.innerHTML = "";
  };
  view().querySelectorAll("input, select").forEach((el) => el.addEventListener("input", upd));
  upd();

  document.getElementById("wz-existing").addEventListener("change", (e) => {
    S.wizard.existingId = e.target.value ? Number(e.target.value) : null;
    if (S.wizard.existingId) {
      const p = S.patients.find((x) => x.id === S.wizard.existingId);
      Object.assign(S.wizard.patient, { name: p.name, mobile: p.mobile, title: p.title || "", age: p.age || "", gender: p.gender || "", heightCm: p.height_cm || "", weightKg: p.last_weight || p.start_weight_kg || "" });
    }
    wizStepPatient();
  });

  document.getElementById("wz-next").addEventListener("click", () => {
    upd();
    const err = document.getElementById("wz-err");
    if (!S.wizard.patient.name.trim() || !S.wizard.patient.mobile.trim()) {
      err.textContent = "Name and mobile number are required — the mobile number is the patient's portal ID.";
      err.hidden = false;
      return;
    }
    S.wizard.step = 1;
    paintWizard();
  });
}

function wizStepProgram() {
  const w = S.wizard;
  const cats = [
    { key: "glp1", label: "GLP-1 / Weight loss", ico: "syringe" },
    { key: "peptide", label: "Peptide therapy", ico: "droplet" },
    { key: "custom", label: "Custom program", ico: "sparkle" },
  ];
  const tpls = S.templates.filter((t) => t.category === w.category);

  view().innerHTML = `${wizHead()}
  <div class="card card-pad">
    <div class="card-title">${icon("layers", 19)} Choose the treatment program</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      ${cats.map((c) => `<button class="chip ${w.category === c.key ? "on" : ""}" data-cat="${c.key}">${esc(c.label)}</button>`).join("")}
    </div>
    <div id="wz-program-body"></div>
    <p class="err-text" id="wz-err" hidden role="alert"></p>
    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:18px">
      <button class="btn btn-ghost" id="wz-back">${icon("chevL", 17)} Back</button>
      <button class="btn btn-primary" id="wz-next">Continue ${icon("chevR", 17)}</button>
    </div>
  </div>`;

  view().querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => {
    w.category = b.dataset.cat;
    w.template = null; w.protocol = null; w.medication = ""; w.dose = ""; w.phases = [];
    wizStepProgram();
  }));

  const body = document.getElementById("wz-program-body");

  if (w.category === "custom") {
    body.innerHTML = `
    <div class="form-grid">
      <div class="field"><label for="cu-med">Medication / treatment name <span class="req">*</span></label><input class="input" id="cu-med" value="${esc(w.medication)}" placeholder="e.g. Metformin XR"></div>
      <div class="field"><label for="cu-dose">Dose</label><input class="input" id="cu-dose" value="${esc(w.dose)}" placeholder="e.g. 500 mg"></div>
      <div class="field"><label for="cu-route">Route</label><select class="input" id="cu-route">${["injection", "oral", "nasal", "topical"].map((r) => `<option ${w.route === r ? "selected" : ""}>${r}</option>`).join("")}</select></div>
      <div class="field"><label for="cu-freq">Frequency</label><select class="input" id="cu-freq">${["daily", "twice daily", "weekly", "twice a week", "every 3 days", "every other day", "as needed"].map((f) => `<option ${w.frequency === f ? "selected" : ""}>${f}</option>`).join("")}</select></div>
    </div>
    ${phasesEditor()}`;
    wirePhases(body);
    ["cu-med", "cu-dose", "cu-route", "cu-freq"].forEach((id) => body.querySelector("#" + id).addEventListener("input", () => {
      w.medication = body.querySelector("#cu-med").value;
      w.dose = body.querySelector("#cu-dose").value;
      w.route = body.querySelector("#cu-route").value;
      w.frequency = body.querySelector("#cu-freq").value;
    }));
  } else {
    body.innerHTML = `
    <div class="tpl-grid">
      ${tpls.map((t) => `
        <button class="tpl-card ${w.template && w.template.id === t.id ? "sel" : ""}" data-tpl="${t.id}">
          ${icon(w.category === "glp1" ? "syringe" : "droplet", 20)}
          <div class="tpl-name">${esc(t.name)}</div>
          <div class="tpl-sub">${w.category === "glp1" ? esc(t.config.generic || "") + " · " + esc(t.config.frequency) : (t.config.protocols ? t.config.protocols.length + " protocol" + (t.config.protocols.length > 1 ? "s" : "") : "")}</div>
        </button>`).join("")}
    </div>
    <div id="wz-tpl-detail" style="margin-top:18px"></div>`;

    body.querySelectorAll("[data-tpl]").forEach((b) => b.addEventListener("click", () => {
      w.template = S.templates.find((t) => t.id === Number(b.dataset.tpl));
      w.medication = w.template.config.medication || w.template.name;
      if (w.category === "glp1") {
        w.route = w.template.config.route;
        w.frequency = w.template.config.frequency;
        w.halfLifeHours = w.template.config.halfLifeHours;
        w.dose = w.template.config.doses[0];
      } else {
        w.protocol = w.template.config.protocols[0];
        applyProtocol();
      }
      wizStepProgram();
    }));

    const det = document.getElementById("wz-tpl-detail");
    if (w.template && w.category === "glp1") {
      const doses = w.template.config.doses;
      det.innerHTML = `
      <hr class="divider">
      <div class="form-grid">
        <div class="field"><label for="g-dose">Starting dose</label><select class="input" id="g-dose">${doses.map((d) => `<option ${w.dose === d ? "selected" : ""}>${d}</option>`).join("")}</select></div>
        <div class="field"><label>Frequency</label><input class="input" value="${esc(w.frequency)}" disabled></div>
      </div>
      ${phasesEditor()}`;
      det.querySelector("#g-dose").addEventListener("change", (e) => {
        w.dose = e.target.value;
        w.phases = suggestTitration(doses, w.dose);
        wizStepProgram();
      });
      if (!w.phases.length) w.phases = suggestTitration(doses, w.dose);
      det.insertAdjacentHTML("beforeend", "");
      // re-render phases with suggestion
      det.querySelector("#phases-box").outerHTML = phasesRows();
      wirePhases(det);
    }
    if (w.template && w.category === "peptide") {
      const protos = w.template.config.protocols;
      det.innerHTML = `
      <hr class="divider">
      <div class="field">
        <label for="pp-proto">Protocol</label>
        <select class="input" id="pp-proto">${protos.map((pr, i) => `<option value="${i}" ${w.protocol === pr ? "selected" : ""}>${esc(pr.protocolType)} — ${esc(pr.doseVolume)} · ${esc(pr.time)}</option>`).join("")}</select>
      </div>
      <div class="metric-strip">
        <div class="metric"><b>${esc(w.protocol.strength)}</b>Strength</div>
        <div class="metric"><b>${esc(w.protocol.doseAmount || w.protocol.doseVolume)}</b>Dose</div>
        <div class="metric"><b>${esc(w.protocol.duration)}</b>Vial lasts</div>
        <div class="metric"><b>${esc(w.protocol.cycle)}</b>Cycle</div>
      </div>
      <p class="hint">${esc(w.protocol.summary)}</p>`;
      det.querySelector("#pp-proto").addEventListener("change", (e) => {
        w.protocol = protos[Number(e.target.value)];
        applyProtocol();
        wizStepProgram();
      });
    }
  }

  function applyProtocol() {
    const pr = w.protocol;
    w.dose = pr.doseVolume + (pr.doseAmount ? ` (${pr.doseAmount})` : "");
    w.route = pr.route.toLowerCase().includes("oral") ? "oral" : pr.route.toLowerCase().includes("nasal") ? "nasal" : pr.route.toLowerCase().includes("topical") ? "topical" : "injection";
    const f = inferFreqLabel(pr.time);
    w.frequency = f;
    w.phases = [{ label: pr.protocolType, dose: w.dose, weeks: "", note: `${pr.time} — ${pr.cycle}` }];
  }

  document.getElementById("wz-back").addEventListener("click", () => { w.step = 0; paintWizard(); });
  document.getElementById("wz-next").addEventListener("click", () => {
    const err = document.getElementById("wz-err");
    if (!w.medication) { err.textContent = "Choose a program (or enter a custom medication) before continuing."; err.hidden = false; return; }
    w.step = 2;
    // pre-fill clinical defaults
    if (!w.instructions) w.instructions = defaultInstructions();
    if (!w.warnings) w.warnings = defaultWarnings();
    if (!Object.keys(w.diet).length) w.diet = defaultDiet();
    paintWizard();
  });
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

function suggestTitration(ladder, start) {
  const i = ladder.indexOf(start);
  const phases = [{ label: "Starting phase", dose: start, weeks: 4, note: "Begin here — take it slow and steady" }];
  if (i >= 0 && i + 1 < ladder.length) {
    phases.push({ label: "Step up", dose: ladder[i + 1], weeks: 4, note: "Only if well tolerated — confirm at follow-up" });
  }
  phases.push({ label: "Review", dose: "", weeks: "", note: "Dose reviewed at your follow-up consultation" });
  return phases;
}

function phasesEditor() {
  return `<hr class="divider"><div class="card-title" style="font-size:14.5px">${icon("layers", 17)} Dose schedule / titration <span class="hint" style="font-weight:400">(shown in the patient guide)</span></div>${phasesRows()}`;
}

function phasesRows() {
  const w = S.wizard;
  return `<div id="phases-box">
    ${w.phases.map((ph, i) => `
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
  const w = S.wizard;
  const box = scope.querySelector("#phases-box");
  if (!box) return;
  box.querySelectorAll(".phase-row").forEach((row) => {
    row.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", () => {
      w.phases[Number(row.dataset.i)][inp.dataset.k] = inp.value;
    }));
  });
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    w.phases.splice(Number(b.dataset.del), 1);
    box.outerHTML = phasesRows();
    wirePhases(scope);
  }));
  box.querySelector("#add-phase").addEventListener("click", () => {
    w.phases.push({ label: "", dose: "", weeks: "", note: "" });
    box.outerHTML = phasesRows();
    wirePhases(scope);
  });
}

function defaultInstructions() {
  const w = S.wizard;
  if (w.category === "glp1") {
    return w.route === "oral"
      ? "Take your tablet first thing in the morning on an empty stomach with a small sip of water. Wait at least 30 minutes before eating, drinking or taking other medicines.\nEat slowly, stop when comfortably full, and prioritise protein at every meal.\nStay well hydrated (2–3 L water daily)."
      : "Inject once weekly, on the same day each week, at any time of day.\nRotate injection sites: abdomen, thigh, or upper arm.\nEat slowly, stop when comfortably full, and prioritise protein at every meal.\nStay well hydrated (2–3 L water daily).";
  }
  if (w.category === "peptide" && w.protocol) {
    return `${w.protocol.time}.\nRoute: ${w.protocol.route}.\nCycle: ${w.protocol.cycle}.\nStore vials refrigerated (2–8°C) away from light.`;
  }
  return "";
}

function defaultWarnings() {
  const w = S.wizard;
  if (w.category === "glp1") {
    return "Contact me promptly if you experience: severe or persistent abdominal pain, repeated vomiting or inability to keep fluids down, signs of dehydration (dizziness, dark urine), severe constipation lasting more than 4 days, or an allergic reaction (rash, swelling, difficulty breathing).\nMild nausea, softer stools and reduced appetite are common in the first weeks and usually settle.";
  }
  if (w.category === "peptide") {
    return "Contact me if you notice: significant redness, swelling or pain at the injection site, rash or itching elsewhere, unusual fatigue, or any symptom that concerns you.";
  }
  return "Contact your doctor if you experience any unexpected or severe symptoms.";
}

function defaultDiet() {
  const w = S.wizard;
  if (w.category !== "glp1") return {};
  const kg = +w.patient.weightKg;
  const bmr = (() => {
    const h = +w.patient.heightCm, a = +w.patient.age;
    if (!kg || !h || !a) return null;
    const base = 10 * kg + 6.25 * h - 5 * a;
    return Math.round(w.patient.gender === "Female" ? base - 161 : base + 5);
  })();
  const mult = (S.presets.activityLevels[w.patient.activityLevel] || { multiplier: 1.2 }).multiplier;
  const diet = {};
  if (kg) { diet.proteinMin = Math.round(kg * 1.2); diet.proteinMax = Math.round(kg * 1.5); }
  if (bmr) diet.calories = Math.round(bmr * mult - 500);
  diet.water = "2–3 L daily";
  return diet;
}

function wizStepClinical() {
  const w = S.wizard;
  view().innerHTML = `${wizHead()}
  <div class="card card-pad" style="max-width:820px">
    <div class="card-title">${icon("clipboard", 19)} Clinical details &amp; guide content</div>
    <div class="form-grid">
      <div class="field full"><label for="cl-instr">Instructions for the patient</label><textarea class="input" id="cl-instr" rows="5">${esc(w.instructions)}</textarea></div>
      <div class="field full"><label for="cl-warn">Warnings — when to contact you</label><textarea class="input" id="cl-warn" rows="4">${esc(w.warnings)}</textarea></div>
      <div class="field"><label for="cl-chronic">Chronic illnesses</label><input class="input" id="cl-chronic" value="${esc(w.patient.chronicIllnesses)}" placeholder="None"></div>
      <div class="field"><label for="cl-meds">Current medications</label><input class="input" id="cl-meds" value="${esc(w.patient.medications)}" placeholder="None"></div>
      <div class="field"><label for="cl-allergy">Allergies</label><input class="input" id="cl-allergy" value="${esc(w.patient.allergies)}" placeholder="None"></div>
      <div class="field"><label for="cl-blood">Blood test</label>
        <select class="input" id="cl-blood">
          <option value="none" ${w.bloodTest === "none" ? "selected" : ""}>Not needed</option>
          <option value="recommended" ${w.bloodTest === "recommended" ? "selected" : ""}>Recommended</option>
          <option value="required" ${w.bloodTest === "required" ? "selected" : ""}>Required</option>
        </select>
      </div>
      <div class="field"><label for="cl-fu">Follow-up in (days)</label><input class="input" id="cl-fu" type="number" min="3" max="180" value="${esc(w.followupDays)}"></div>
      ${w.category === "glp1" ? `
      <div class="field"><label for="cl-cal">Calorie target (kcal/day)</label><input class="input" id="cl-cal" type="number" value="${esc(w.diet.calories ?? "")}"></div>
      <div class="field"><label>Protein target (g/day)</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="input" id="cl-prot-min" type="number" value="${esc(w.diet.proteinMin ?? "")}" aria-label="Protein minimum"> –
          <input class="input" id="cl-prot-max" type="number" value="${esc(w.diet.proteinMax ?? "")}" aria-label="Protein maximum">
        </div>
      </div>` : ""}
      <div class="field full"><label for="cl-note">Private clinical note (EMR — not shown to patient)</label><textarea class="input" id="cl-note" rows="3" placeholder="Consultation summary for your records…">${esc(w.clinicalNote)}</textarea></div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:10px;margin-top:8px">
      <button class="btn btn-ghost" id="wz-back">${icon("chevL", 17)} Back</button>
      <button class="btn btn-primary" id="wz-next">Preview guide ${icon("chevR", 17)}</button>
    </div>
  </div>`;

  document.getElementById("wz-back").addEventListener("click", () => { collect(); w.step = 1; paintWizard(); });
  document.getElementById("wz-next").addEventListener("click", () => { collect(); w.step = 3; paintWizard(); });

  function collect() {
    w.instructions = document.getElementById("cl-instr").value;
    w.warnings = document.getElementById("cl-warn").value;
    w.patient.chronicIllnesses = document.getElementById("cl-chronic").value;
    w.patient.medications = document.getElementById("cl-meds").value;
    w.patient.allergies = document.getElementById("cl-allergy").value;
    w.bloodTest = document.getElementById("cl-blood").value;
    w.followupDays = Number(document.getElementById("cl-fu").value) || 28;
    w.clinicalNote = document.getElementById("cl-note").value;
    if (w.category === "glp1") {
      w.diet.calories = Number(document.getElementById("cl-cal").value) || undefined;
      w.diet.proteinMin = Number(document.getElementById("cl-prot-min").value) || undefined;
      w.diet.proteinMax = Number(document.getElementById("cl-prot-max").value) || undefined;
    }
  }
}

function wizStepReview() {
  const w = S.wizard;
  injectGuideCss();
  const fakePlan = {
    title: `${w.medication} — ${w.category === "glp1" ? "Weight Loss Program" : w.category === "peptide" ? "Peptide Therapy" : "Treatment Program"}`,
    medication: w.medication, dose: w.dose, route: w.route, frequency: w.frequency,
    phases: w.phases.filter((p) => p.label || p.dose), instructions: w.instructions, warnings: w.warnings,
    diet: w.diet, blood_test: w.bloodTest,
    created_at: new Date().toISOString().slice(0, 10),
    next_followup: new Date(Date.now() + w.followupDays * 864e5).toISOString().slice(0, 10),
  };
  view().innerHTML = `${wizHead()}
  <div class="two-col" style="grid-template-columns:1fr 340px">
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="card-title" style="margin:0">${icon("file", 19)} Guide preview — what the patient sees</div>
      </div>
      <div id="guide-preview">${buildGuide(fakePlan, { name: w.patient.name, title: w.patient.title }, S.user.name)}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="card card-pad">
        <div class="card-title">${icon("send", 18)} Publish</div>
        <p style="font-size:13.5px;color:var(--muted);margin-bottom:14px">
          Publishing saves the program for <b>${esc(w.patient.name)}</b>${w.existingId ? "" : ", registers them as a new patient"} and generates their portal access PIN to share on WhatsApp.
        </p>
        <p class="err-text" id="wz-err" hidden role="alert"></p>
        <button class="btn btn-accent btn-block" id="wz-publish"><span class="spin"></span><span class="btn-label">${icon("check", 18)} Publish guide</span></button>
        <button class="btn btn-ghost btn-block" id="wz-back" style="margin-top:8px">${icon("chevL", 16)} Back to edit</button>
      </div>
      ${w.clinicalNote ? `<div class="card card-pad"><div class="card-title">${icon("shield", 18)} Private note (EMR)</div><p style="font-size:13px;color:var(--muted);white-space:pre-wrap">${esc(w.clinicalNote)}</p></div>` : ""}
    </div>
  </div>`;

  document.getElementById("wz-back").addEventListener("click", () => { w.step = 2; paintWizard(); });
  document.getElementById("wz-publish").addEventListener("click", async () => {
    const btn = document.getElementById("wz-publish");
    const err = document.getElementById("wz-err");
    err.hidden = true;
    btn.classList.add("loading");
    try {
      let patientId = w.existingId, newPin = null;
      if (!patientId) {
        const created = await api("POST", "/api/patients", {
          name: w.patient.name, mobile: w.patient.mobile, title: w.patient.title,
          age: Number(w.patient.age) || null, gender: w.patient.gender,
          heightCm: Number(w.patient.heightCm) || null, weightKg: Number(w.patient.weightKg) || null,
          activityLevel: w.patient.activityLevel, chronicIllnesses: w.patient.chronicIllnesses,
          medications: w.patient.medications, allergies: w.patient.allergies,
        });
        patientId = created.id;
        newPin = created.pin;
      } else {
        await api("PATCH", `/api/patients/${patientId}`, {
          chronicIllnesses: w.patient.chronicIllnesses, medications: w.patient.medications, allergies: w.patient.allergies,
        });
      }
      await api("POST", "/api/plans", {
        patientId, category: w.category, title: fakePlan.title, medication: w.medication,
        dose: w.dose, route: w.route, frequency: w.frequency, halfLifeHours: w.halfLifeHours,
        phases: fakePlan.phases, instructions: w.instructions, warnings: w.warnings,
        diet: w.diet, followupDays: w.followupDays, bloodTest: w.bloodTest, clinicalNote: w.clinicalNote,
      });
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
  const waText = pin
    ? `Hello ${name}, your personal treatment guide for ${w.medication} is ready! 🎉\n\n🔗 Your portal: ${link}\n📱 Mobile: +${w.patient.mobile}\n🔑 PIN: ${pin}\n\nView your guide, log your doses, and check in regularly — I'll be following your progress.\n\n— ${S.user.name}, DarDoc · PeptiDoc`
    : `Hello ${name}, your updated treatment guide for ${w.medication} is ready in your portal:\n\n🔗 ${link}\n\nSign in with your mobile number and your existing PIN (ask me for a new one if needed).\n\n— ${S.user.name}, DarDoc · PeptiDoc`;
  const scrim = modal(`
    <div style="text-align:center;padding:6px 0 2px">
      <div style="width:60px;height:60px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;margin:0 auto 14px">${icon("checkCircle", 30)}</div>
      <h3 style="font-size:20px">Guide published</h3>
      <p style="font-size:14px;color:var(--muted);margin:6px 0 14px">${esc(w.patient.name)}'s program is live in their patient portal.</p>
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
        ${icon(c.key === "glp1" ? "syringe" : c.key === "peptide" ? "droplet" : "sparkle", 20)}
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
