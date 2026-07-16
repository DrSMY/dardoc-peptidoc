// Super Admin SPA — manage clinical protocols, peptide info, health-goal
// mapping, and the knowledge base. Separate login/role from the doctor app.
"use strict";

const S = { user: null, templates: [], peptideInfo: [], goalMap: [], kb: [], protocolFilter: "all" };
const app = document.getElementById("app");

async function boot() {
  try {
    S.user = await api("GET", "/api/admin/me");
    renderShell();
    route();
  } catch {
    renderLogin();
  }
}

window.addEventListener("hashchange", () => { if (S.user) route(); });

// ── login ────────────────────────────────────────────────────────
function renderLogin() {
  document.title = "Sign in — Super Admin";
  app.innerHTML = `
  <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px">
    <div class="card card-pad" style="width:min(420px,100%)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px">
        <div style="width:46px;height:46px;border-radius:13px;background:var(--violet);color:#fff;display:flex;align-items:center;justify-content:center">${icon("shield", 24)}</div>
        <div>
          <div style="font-family:var(--font-head);font-weight:800;font-size:17px">Super Admin</div>
          <div style="font-size:12.5px;color:var(--muted)">Protocols &amp; knowledge base</div>
        </div>
      </div>
      <h1 style="font-size:22px;margin-bottom:4px">Admin sign in</h1>
      <p style="color:var(--muted);font-size:14px;margin-bottom:20px">Manage clinical protocols, peptide info and the knowledge base.</p>
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
      <p style="margin-top:16px;text-align:center;font-size:13px"><a href="/doctor">Doctor dashboard →</a></p>
    </div>
  </div>`;
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    const err = document.getElementById("lg-err");
    err.hidden = true;
    btn.classList.add("loading");
    try {
      S.user = await api("POST", "/api/admin/login", {
        email: document.getElementById("lg-email").value,
        password: document.getElementById("lg-pass").value,
      });
      renderShell();
      location.hash = "#/overview";
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
  { hash: "#/overview", label: "Overview", ico: "grid" },
  { hash: "#/protocols", label: "Protocols & Medications", ico: "layers" },
  { hash: "#/peptide-info", label: "Peptide Clinical Info", ico: "droplet" },
  { hash: "#/goal-map", label: "Health Goal Mapping", ico: "sparkle" },
  { hash: "#/kb", label: "Knowledge Base", ico: "book" },
];

function renderShell() {
  document.title = "Super Admin — DarDoc · PeptiDoc";
  app.innerHTML = `
  <div class="mobile-bar">
    <div class="brand-line">${icon("shield", 20)} Super Admin</div>
    <button class="icon-btn" style="color:#fff" id="m-logout" aria-label="Sign out">${icon("logout", 20)}</button>
  </div>
  <nav class="m-nav" id="m-nav">
    ${NAV.map((n) => `<a href="${n.hash}">${esc(n.label)}</a>`).join("")}
  </nav>
  <div class="shell">
    <aside class="sidebar">
      <div class="sb-brand">
        <div class="sb-mark">${icon("shield", 21)}</div>
        <div><div class="sb-name">Super Admin</div><div class="sb-sub">DarDoc · PeptiDoc</div></div>
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
  const h = location.hash || "#/overview";
  document.querySelectorAll(".sb-link, .m-nav a").forEach((a) => a.classList.toggle("on", h.startsWith(a.getAttribute("href"))));
}

function view() { return document.getElementById("view"); }

function route() {
  const h = location.hash || "#/overview";
  setActiveNav();
  if (h.startsWith("#/protocols")) return viewProtocols();
  if (h.startsWith("#/peptide-info")) return viewPeptideInfo();
  if (h.startsWith("#/goal-map")) return viewGoalMap();
  if (h.startsWith("#/kb")) return viewKb();
  return viewOverview();
}

// ── overview ─────────────────────────────────────────────────────
async function viewOverview() {
  view().innerHTML = `<div class="skel" style="height:200px"></div>`;
  const [templates, peptideInfo, goalMap, kb] = await Promise.all([
    api("GET", "/api/templates"),
    api("GET", "/api/admin/peptide-info"),
    api("GET", "/api/admin/health-goal-peptides"),
    api("GET", "/api/kb"),
  ]);
  S.templates = templates; S.peptideInfo = peptideInfo; S.goalMap = goalMap; S.kb = kb;
  const glp1Count = templates.filter((t) => t.category === "glp1").length;
  const pepCount = templates.filter((t) => t.category === "peptide").length;
  const customizedCount = templates.filter((t) => t.is_customized).length + peptideInfo.filter((p) => p.isCustomized).length;

  view().innerHTML = `
  <div class="page-head">
    <div><h1>Overview</h1><div class="sub">Everything a doctor's consultation flow draws on, in one place</div></div>
  </div>
  <div class="stat-grid" style="margin-bottom:20px">
    ${stat("layers", "var(--primary-soft)", "var(--primary)", glp1Count, "GLP-1 medications")}
    ${stat("droplet", "var(--brand-soft)", "var(--brand)", pepCount, "Peptide dosing protocols")}
    ${stat("sparkle", "var(--violet-soft)", "var(--violet)", peptideInfo.length, "Peptide clinical-info entries")}
    ${stat("book", "var(--accent-soft)", "var(--accent)", kb.length, "Knowledge base articles")}
    ${stat("edit", "var(--amber-soft)", "var(--amber)", customizedCount, "Customized (protected) entries")}
  </div>
  <div class="card card-pad">
    <div class="card-title">${icon("info", 19)} How this works</div>
    <p style="font-size:14px;color:var(--text);line-height:1.6">
      Peptide protocols, GLP-1 medications, health-goal suggestions and knowledge-base articles edited here
      go live immediately in the doctor's consultation wizard. Anything you edit or add is marked
      <b>customized</b> and is protected from being overwritten by future code updates — untouched entries
      still get refreshed automatically when the app is updated with new clinical data.
    </p>
  </div>`;
}

function stat(ico, bg, fg, val, lbl) {
  return `<div class="stat"><div class="stat-ico" style="background:${bg};color:${fg}">${icon(ico, 19)}</div><div class="stat-val">${val}</div><div class="stat-lbl">${lbl}</div></div>`;
}

// ── protocols & medications (templates table: glp1 + peptide + custom) ──
async function viewProtocols() {
  view().innerHTML = `<div class="skel" style="height:400px"></div>`;
  S.templates = await api("GET", "/api/templates");
  paintProtocols();
}

function paintProtocols() {
  const filter = S.protocolFilter;
  const rows = S.templates.filter((t) => filter === "all" || t.category === filter);
  view().innerHTML = `
  <div class="page-head">
    <div><h1>Protocols &amp; Medications</h1><div class="sub">GLP-1 titration schedules and peptide dosing ladders</div></div>
    <button class="btn btn-primary" id="add-protocol">${icon("plus", 18)} Add protocol</button>
  </div>
  <div class="tabs" role="tablist">
    ${["all", "glp1", "peptide", "custom"].map((c) => `<button class="tab ${filter === c ? "on" : ""}" data-pf="${c}">${c === "all" ? "All" : c === "glp1" ? "GLP-1" : c[0].toUpperCase() + c.slice(1)}</button>`).join("")}
  </div>
  <div class="card" id="proto-list">
    ${rows.length ? rows.map((t) => `
      <div class="adm-row" data-tpl="${t.id}">
        <div class="adm-row-info">
          <div class="adm-row-name">${esc(t.name)}
            <span class="badge ${t.category === "glp1" ? "badge-cyan" : t.category === "peptide" ? "badge-teal" : "badge-gray"}">${esc(t.category)}</span>
            ${t.is_customized ? `<span class="badge badge-amber">customized</span>` : ""}
          </div>
          <div class="adm-row-meta">${t.config.medication ? esc(t.config.medication) : ""}${t.config.doses ? " · " + t.config.doses.length + " dose steps" : ""}${t.config.protocols ? " · " + t.config.protocols.length + " protocol" + (t.config.protocols.length > 1 ? "s" : "") : ""}</div>
        </div>
        ${icon("chevR", 17)}
      </div>`).join("") : `<div class="empty">${icon("layers", 34)}<div class="empty-title">No protocols in this category</div></div>`}
  </div>`;
  view().querySelectorAll("[data-pf]").forEach((b) => b.addEventListener("click", () => { S.protocolFilter = b.dataset.pf; paintProtocols(); }));
  document.getElementById("add-protocol").addEventListener("click", () => protocolEditorModal(null));
  view().querySelectorAll("[data-tpl]").forEach((r) => r.addEventListener("click", () => {
    protocolEditorModal(S.templates.find((t) => t.id === Number(r.dataset.tpl)));
  }));
}

function protocolEditorModal(tpl) {
  const isNew = !tpl;
  modal(`
    <div class="modal-head">
      <h3>${isNew ? "Add protocol" : esc(tpl.name)}</h3>
      <button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button>
    </div>
    <div class="form-grid">
      <div class="field"><label for="pe-name">Name</label><input class="input" id="pe-name" value="${isNew ? "" : esc(tpl.name)}"></div>
      <div class="field"><label>Category</label><div class="chip-row">
        ${["glp1", "peptide", "custom"].map((c) => `<button type="button" class="chip ${(!isNew && tpl.category === c) || (isNew && c === "peptide") ? "on" : ""}" data-catchip="${c}">${c === "glp1" ? "GLP-1" : c[0].toUpperCase() + c.slice(1)}</button>`).join("")}
      </div></div>
    </div>
    <div class="field full">
      <label for="pe-config">Config (JSON)</label>
      <textarea class="input json-editor" id="pe-config">${esc(JSON.stringify(isNew ? { medication: "", doses: [] } : tpl.config, null, 2))}</textarea>
      <span class="hint">GLP-1 shape: {medication, generic, route, frequency, halfLifeHours, doses:[...], titration:[{dose,weeks,note}], administration}. Peptide shape: {medication, protocols:[{protocolType, doseVolume, doseAmount, strength, duration, cycle, time, route, summary}]}.</span>
    </div>
    <p class="err-text" id="pe-err" hidden role="alert"></p>
    <div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px">
      ${!isNew ? `<button class="btn btn-ghost" id="pe-delete" style="color:var(--danger)">${icon("x", 16)} Delete</button>` : `<span></span>`}
      <button class="btn btn-primary" id="pe-save">${icon("check", 16)} Save</button>
    </div>
  `, true);

  let category = isNew ? "peptide" : tpl.category;
  document.querySelectorAll("[data-catchip]").forEach((b) => b.addEventListener("click", () => {
    category = b.dataset.catchip;
    document.querySelectorAll("[data-catchip]").forEach((x) => x.classList.toggle("on", x === b));
  }));

  document.getElementById("pe-save").addEventListener("click", async () => {
    const err = document.getElementById("pe-err");
    err.hidden = true;
    let config;
    try { config = JSON.parse(document.getElementById("pe-config").value); }
    catch { err.textContent = "Config must be valid JSON."; err.hidden = false; return; }
    const name = document.getElementById("pe-name").value.trim();
    if (!name) { err.textContent = "Name is required."; err.hidden = false; return; }
    try {
      if (isNew) await api("POST", "/api/admin/templates", { name, category, config });
      else await api("PUT", `/api/admin/templates/${tpl.id}`, { name, category, config });
      document.querySelector(".modal-scrim")?.remove();
      toast(isNew ? "Protocol added" : "Protocol updated");
      viewProtocols();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  if (!isNew) {
    document.getElementById("pe-delete").addEventListener("click", async () => {
      if (!confirm(`Delete "${tpl.name}"? This cannot be undone.`)) return;
      await api("DELETE", `/api/admin/templates/${tpl.id}`);
      document.querySelector(".modal-scrim")?.remove();
      toast("Protocol deleted");
      viewProtocols();
    });
  }
}

// ── peptide clinical info (peptide_info table) ────────────────────
async function viewPeptideInfo() {
  view().innerHTML = `<div class="skel" style="height:400px"></div>`;
  S.peptideInfo = await api("GET", "/api/admin/peptide-info");
  view().innerHTML = `
  <div class="page-head">
    <div><h1>Peptide Clinical Info</h1><div class="sub">Talking points, dosing instructions and patient-facing guidance shown in the "Suggested Peptides" detail view</div></div>
    <button class="btn btn-primary" id="add-info">${icon("plus", 18)} Add peptide</button>
  </div>
  <div class="card" id="info-list">
    ${S.peptideInfo.length ? S.peptideInfo.map((p) => `
      <div class="adm-row" data-pep="${esc(p.name)}">
        <div class="adm-row-info">
          <div class="adm-row-name">${esc(p.name)} ${p.isCustomized ? `<span class="badge badge-amber">customized</span>` : ""}</div>
          <div class="adm-row-meta">${esc((p.data.categories || []).join(", ") || "No categories set")}</div>
        </div>
        ${icon("chevR", 17)}
      </div>`).join("") : `<div class="empty">${icon("droplet", 34)}<div class="empty-title">No peptide info yet</div></div>`}
  </div>`;
  document.getElementById("add-info").addEventListener("click", () => peptideInfoModal(null));
  view().querySelectorAll("[data-pep]").forEach((r) => r.addEventListener("click", () => {
    peptideInfoModal(S.peptideInfo.find((p) => p.name === r.dataset.pep));
  }));
}

function peptideInfoModal(entry) {
  const isNew = !entry;
  const exampleShape = {
    categories: ["Longevity"],
    howItWorks: "", targetBenefits: "", bestUseFor: "",
    dosageInstructions: "", administrationRoute: "", strengthVolume: "", treatmentDuration: "",
    contraindications: "", commonSideEffects: "", keyBloodTests: "", recommendedSupplements: "", possibleCombinations: "",
    whoItsFor: [], dailyRoutine: "", storageNotes: "", onset: "", missedDose: "", redFlags: [], lifestyleTips: [],
  };
  modal(`
    <div class="modal-head">
      <h3>${isNew ? "Add peptide clinical info" : esc(entry.name)}</h3>
      <button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button>
    </div>
    <div class="field"><label for="pi-name">Peptide name</label><input class="input" id="pi-name" value="${isNew ? "" : esc(entry.name)}" ${isNew ? "" : "disabled"}></div>
    <div class="field full">
      <label for="pi-data">Clinical &amp; patient-facing info (JSON)</label>
      <textarea class="input json-editor" id="pi-data" style="min-height:340px">${esc(JSON.stringify(isNew ? exampleShape : entry.data, null, 2))}</textarea>
      <span class="hint">Fields: categories[], howItWorks, targetBenefits, bestUseFor, dosageInstructions, administrationRoute, strengthVolume, treatmentDuration, contraindications, commonSideEffects, keyBloodTests, recommendedSupplements, possibleCombinations, whoItsFor[], dailyRoutine, storageNotes, onset, missedDose, redFlags[], lifestyleTips[].</span>
    </div>
    <p class="err-text" id="pi-err" hidden role="alert"></p>
    <div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px">
      ${!isNew ? `<button class="btn btn-ghost" id="pi-delete" style="color:var(--danger)">${icon("x", 16)} Delete</button>` : `<span></span>`}
      <button class="btn btn-primary" id="pi-save">${icon("check", 16)} Save</button>
    </div>
  `, true);

  document.getElementById("pi-save").addEventListener("click", async () => {
    const err = document.getElementById("pi-err");
    err.hidden = true;
    let data;
    try { data = JSON.parse(document.getElementById("pi-data").value); }
    catch { err.textContent = "Info must be valid JSON."; err.hidden = false; return; }
    const name = document.getElementById("pi-name").value.trim() || (entry && entry.name);
    if (!name) { err.textContent = "Name is required."; err.hidden = false; return; }
    try {
      await api("POST", "/api/admin/peptide-info", { name, data });
      document.querySelector(".modal-scrim")?.remove();
      toast(isNew ? "Peptide info added" : "Peptide info updated");
      viewPeptideInfo();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  if (!isNew) {
    document.getElementById("pi-delete").addEventListener("click", async () => {
      if (!confirm(`Delete clinical info for "${entry.name}"? This also removes it from health-goal suggestions.`)) return;
      await api("POST", "/api/admin/peptide-info/delete", { name: entry.name });
      document.querySelector(".modal-scrim")?.remove();
      toast("Peptide info deleted");
      viewPeptideInfo();
    });
  }
}

// ── health-goal → peptide mapping ─────────────────────────────────
const KNOWN_GOALS = [
  "Weight loss", "Healthy aging & longevity", "Build muscle & recover better", "Heal injuries & reduce pain",
  "Improve metabolism & reduce belly fat", "Improve sleep & reset body clock", "Cognitive function & mood enhancement",
  "Sexual health", "Immune function & inflammation", "Gut health", "Skin & hair",
];

async function viewGoalMap() {
  view().innerHTML = `<div class="skel" style="height:400px"></div>`;
  const [goalMap, peptideInfo] = await Promise.all([api("GET", "/api/admin/health-goal-peptides"), api("GET", "/api/admin/peptide-info")]);
  S.goalMap = goalMap; S.peptideInfo = peptideInfo;
  const byGoal = {};
  for (const r of goalMap) (byGoal[r.goal] || (byGoal[r.goal] = [])).push(r);

  view().innerHTML = `
  <div class="page-head">
    <div><h1>Health Goal Mapping</h1><div class="sub">Which peptides get suggested for each primary health objective</div></div>
  </div>
  ${KNOWN_GOALS.map((goal) => `
    <div class="card card-pad" style="margin-bottom:14px">
      <div class="card-title" style="margin-bottom:10px">${esc(goal)}</div>
      <div data-goalrows="${esc(goal)}">
        ${(byGoal[goal] || []).map((r) => `
          <div class="goal-matrix-row">
            <span>${esc(r.peptide_name)}</span>
            <span class="badge ${r.priority === "Primary" ? "badge-teal" : "badge-gray"}">${esc(r.priority)}</span>
            <span></span>
            <button class="icon-btn" data-delgoal="${r.id}" aria-label="Remove">${icon("x", 16)}</button>
          </div>`).join("") || `<p class="hint" style="margin-bottom:8px">No peptides mapped yet.</p>`}
      </div>
      <div class="goal-matrix-row" style="margin-top:6px">
        <select class="input" data-newpep="${esc(goal)}">
          <option value="">— choose peptide —</option>
          ${peptideInfo.map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("")}
        </select>
        <select class="input" data-newprio="${esc(goal)}">
          <option value="Secondary">Secondary</option>
          <option value="Primary">Primary</option>
        </select>
        <button class="btn btn-secondary btn-sm" data-addgoal="${esc(goal)}">${icon("plus", 14)} Add</button>
        <span></span>
      </div>
    </div>`).join("")}`;

  view().querySelectorAll("[data-delgoal]").forEach((b) => b.addEventListener("click", async () => {
    await api("DELETE", `/api/admin/health-goal-peptides/${b.dataset.delgoal}`);
    toast("Mapping removed");
    viewGoalMap();
  }));
  view().querySelectorAll("[data-addgoal]").forEach((b) => b.addEventListener("click", async () => {
    const goal = b.dataset.addgoal;
    const peptideName = view().querySelector(`[data-newpep="${CSS.escape(goal)}"]`).value;
    const priority = view().querySelector(`[data-newprio="${CSS.escape(goal)}"]`).value;
    if (!peptideName) return toast("Choose a peptide first", "bad");
    await api("POST", "/api/admin/health-goal-peptides", { goal, peptideName, priority });
    toast("Mapping added");
    viewGoalMap();
  }));
}

// ── knowledge base ─────────────────────────────────────────────────
async function viewKb() {
  view().innerHTML = `<div class="skel" style="height:400px"></div>`;
  S.kb = await api("GET", "/api/kb");
  view().innerHTML = `
  <div class="page-head">
    <div><h1>Knowledge Base</h1><div class="sub">Reference articles for the doctor side — protocols, guidelines, anything worth writing down</div></div>
    <button class="btn btn-primary" id="add-kb">${icon("plus", 18)} New article</button>
  </div>
  <div class="card" id="kb-list">
    ${S.kb.length ? S.kb.map((a) => `
      <div class="adm-row" data-kb="${a.id}">
        <div class="adm-row-info">
          <div class="adm-row-name">${esc(a.title)} <span class="badge badge-violet">${esc(a.category)}</span></div>
          <div class="adm-row-meta">Updated ${esc(fmtDate(a.updated_at))}</div>
        </div>
        ${icon("chevR", 17)}
      </div>`).join("") : `<div class="empty">${icon("book", 34)}<div class="empty-title">No articles yet</div><p>Add clinical references, protocols or guidelines for the doctor side.</p></div>`}
  </div>`;
  document.getElementById("add-kb").addEventListener("click", () => kbModal(null));
  view().querySelectorAll("[data-kb]").forEach((r) => r.addEventListener("click", () => {
    kbModal(S.kb.find((a) => a.id === Number(r.dataset.kb)));
  }));
}

function kbModal(article) {
  const isNew = !article;
  modal(`
    <div class="modal-head">
      <h3>${isNew ? "New article" : "Edit article"}</h3>
      <button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button>
    </div>
    <div class="form-grid">
      <div class="field full"><label for="kb-title">Title</label><input class="input" id="kb-title" value="${isNew ? "" : esc(article.title)}"></div>
      <div class="field full"><label for="kb-category">Category</label><input class="input" id="kb-category" placeholder="e.g. GLP-1, Peptides, Blood tests, General" value="${isNew ? "" : esc(article.category)}"></div>
    </div>
    <div class="field full">
      <label for="kb-body">Content</label>
      <textarea class="input kb-editor" id="kb-body">${isNew ? "" : esc(article.body)}</textarea>
    </div>
    <p class="err-text" id="kb-err" hidden role="alert"></p>
    <div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px">
      ${!isNew ? `<button class="btn btn-ghost" id="kb-delete" style="color:var(--danger)">${icon("x", 16)} Delete</button>` : `<span></span>`}
      <button class="btn btn-primary" id="kb-save">${icon("check", 16)} Save</button>
    </div>
  `, true);

  document.getElementById("kb-save").addEventListener("click", async () => {
    const err = document.getElementById("kb-err");
    err.hidden = true;
    const title = document.getElementById("kb-title").value.trim();
    if (!title) { err.textContent = "Title is required."; err.hidden = false; return; }
    const payload = { title, category: document.getElementById("kb-category").value.trim() || "General", body: document.getElementById("kb-body").value };
    try {
      if (isNew) await api("POST", "/api/admin/kb", payload);
      else await api("PUT", `/api/admin/kb/${article.id}`, payload);
      document.querySelector(".modal-scrim")?.remove();
      toast(isNew ? "Article added" : "Article updated");
      viewKb();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });

  if (!isNew) {
    document.getElementById("kb-delete").addEventListener("click", async () => {
      if (!confirm(`Delete "${article.title}"?`)) return;
      await api("DELETE", `/api/admin/kb/${article.id}`);
      document.querySelector(".modal-scrim")?.remove();
      toast("Article deleted");
      viewKb();
    });
  }
}

// ── shared modal helper (mirrors /doctor/app.js's modal()) ────────
function modal(html, wide) {
  document.querySelector(".modal-scrim")?.remove();
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim";
  scrim.innerHTML = `<div class="modal${wide ? " modal-wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  scrim.addEventListener("click", (e) => { if (e.target === scrim) scrim.remove(); });
  document.addEventListener("keydown", function onEsc(e) { if (e.key === "Escape") { scrim.remove(); document.removeEventListener("keydown", onEsc); } });
  document.body.appendChild(scrim);
  scrim.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => scrim.remove()));
  return scrim;
}

boot();
