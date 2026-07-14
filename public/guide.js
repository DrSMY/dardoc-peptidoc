// Patient guide renderer — shared by the doctor preview and the patient portal.
// buildGuide(plan, patient, doctorName) → HTML string (self-contained, print-friendly).
"use strict";

function buildGuide(plan, patient, doctorName) {
  const diet = plan.diet || {};
  const phases = plan.phases || [];
  const routeLabel = {
    injection: "Subcutaneous injection",
    oral: "By mouth (oral)",
    nasal: "Nasal spray",
    topical: "Applied to skin (topical)",
  }[plan.route] || plan.route;

  const routeIcon = plan.route === "injection" ? "syringe" : "pill";

  const scheduleRows = phases.map((ph, i) => `
    <tr>
      <td><span class="g-step">${i + 1}</span></td>
      <td><strong>${esc(ph.label || `Phase ${i + 1}`)}</strong>${ph.weeks ? `<div class="g-sub">${esc(String(ph.weeks))} week${ph.weeks == 1 ? "" : "s"}</div>` : ""}</td>
      <td>${esc(ph.dose || "—")}</td>
      <td>${esc(ph.note || "")}</td>
    </tr>`).join("");

  const dietItems = [];
  if (diet.calories) dietItems.push({ ico: "flame", label: "Daily calorie target", val: `${diet.calories} kcal` });
  if (diet.proteinMin) dietItems.push({ ico: "utensils", label: "Daily protein", val: `${diet.proteinMin}–${diet.proteinMax || diet.proteinMin} g` });
  if (diet.water) dietItems.push({ ico: "droplet", label: "Water", val: diet.water });

  const bloodTest = plan.blood_test && plan.blood_test !== "none"
    ? `<div class="g-callout ${plan.blood_test === "required" ? "g-red" : "g-amber"}">
        ${icon("droplet", 18)}
        <div><strong>Blood test ${plan.blood_test === "required" ? "REQUIRED" : "recommended"}.</strong>
        Please complete your blood test as advised by your doctor.</div>
      </div>` : "";

  return `
  <div class="guide">
    <header class="g-head">
      <div class="g-brand">
        <div class="g-logo">${icon("stethoscope", 22)}</div>
        <div>
          <div class="g-brand-name">DarDoc · PeptiDoc</div>
          <div class="g-brand-sub">Personal Treatment Guide</div>
        </div>
      </div>
      <div class="g-issued">Issued ${esc(fmtDate(plan.created_at))}</div>
    </header>

    <section class="g-patient card-pad">
      <div>
        <div class="g-hello">Prepared for</div>
        <h2>${esc(patient.title ? patient.title + " " : "")}${esc(patient.name)}</h2>
        <div class="g-doc">by ${esc(doctorName || "your doctor")}</div>
      </div>
      <div class="g-med-pill">${icon(routeIcon, 18)} ${esc(plan.medication)}${plan.dose ? ` · ${esc(plan.dose)}` : ""}</div>
    </section>

    <section class="g-sec">
      <h3>${icon("clipboard", 18)} Your program</h3>
      <div class="g-facts">
        <div class="g-fact"><div class="g-fact-lbl">Medication</div><div class="g-fact-val">${esc(plan.medication)}</div></div>
        ${plan.dose ? `<div class="g-fact"><div class="g-fact-lbl">Starting dose</div><div class="g-fact-val">${esc(plan.dose)}</div></div>` : ""}
        <div class="g-fact"><div class="g-fact-lbl">How to take it</div><div class="g-fact-val">${esc(routeLabel)}</div></div>
        <div class="g-fact"><div class="g-fact-lbl">Frequency</div><div class="g-fact-val">${esc(plan.frequency)}</div></div>
      </div>
    </section>

    ${phases.length ? `
    <section class="g-sec">
      <h3>${icon("layers", 18)} Dose schedule</h3>
      <div class="table-scroll">
        <table class="g-table">
          <thead><tr><th></th><th>Phase</th><th>Dose</th><th>Notes</th></tr></thead>
          <tbody>${scheduleRows}</tbody>
        </table>
      </div>
    </section>` : ""}

    ${plan.instructions ? `
    <section class="g-sec">
      <h3>${icon("info", 18)} Instructions from your doctor</h3>
      <div class="g-prose">${esc(plan.instructions).replace(/\n/g, "<br>")}</div>
    </section>` : ""}

    ${dietItems.length ? `
    <section class="g-sec">
      <h3>${icon("utensils", 18)} Nutrition targets</h3>
      <div class="g-facts">
        ${dietItems.map((d) => `<div class="g-fact"><div class="g-fact-lbl">${esc(d.label)}</div><div class="g-fact-val">${esc(d.val)}</div></div>`).join("")}
      </div>
    </section>` : ""}

    ${plan.warnings ? `
    <section class="g-sec">
      <h3>${icon("alert", 18)} When to contact your doctor</h3>
      <div class="g-callout g-red">${icon("alert", 18)}<div>${esc(plan.warnings).replace(/\n/g, "<br>")}</div></div>
    </section>` : ""}

    ${bloodTest}

    <section class="g-sec">
      <h3>${icon("calendar", 18)} Follow-up</h3>
      <div class="g-callout g-teal">
        ${icon("calendar", 18)}
        <div>Your next follow-up is due around <strong>${esc(fmtDate(plan.next_followup))}</strong>.
        Log your doses and check in regularly in this app so ${esc(doctorName || "your doctor")} can track your progress.</div>
      </div>
    </section>

    <footer class="g-foot">
      This guide was prepared personally for ${esc(patient.name)} and is not general medical advice.
      If you feel seriously unwell, seek urgent medical care immediately.
    </footer>
  </div>`;
}

// Guide styles are injected once wherever the guide is shown.
const GUIDE_CSS = `
.guide { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); overflow: hidden; }
.g-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 18px 22px; background: linear-gradient(120deg, var(--brand), #2A6A6D); color: #fff; }
.g-brand { display: flex; gap: 12px; align-items: center; }
.g-logo { width: 42px; height: 42px; border-radius: 12px; background: rgba(255,255,255,.15); display: flex; align-items: center; justify-content: center; }
.g-brand-name { font-family: var(--font-head); font-weight: 800; font-size: 17px; }
.g-brand-sub { font-size: 12.5px; opacity: .8; }
.g-issued { font-size: 12.5px; opacity: .85; text-align: right; }
.g-patient { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
.g-hello { font-size: 12.5px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
.g-patient h2 { font-size: 24px; margin: 2px 0; }
.g-doc { color: var(--muted); font-size: 14px; }
.g-med-pill { display: inline-flex; align-items: center; gap: 8px; background: var(--brand-soft); color: var(--brand); font-weight: 700; font-family: var(--font-head); padding: 10px 18px; border-radius: var(--r-full); font-size: 15px; }
.g-sec { padding: 20px 22px 4px; }
.g-sec h3 { display: flex; align-items: center; gap: 8px; font-size: 15px; color: var(--brand); margin-bottom: 12px; }
.g-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 14px; }
.g-fact { background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-md); padding: 10px 14px; }
.g-fact-lbl { font-size: 11.5px; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
.g-fact-val { font-family: var(--font-head); font-weight: 700; font-size: 15.5px; margin-top: 2px; }
.g-table { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 14px; }
.g-table th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 8px 10px; border-bottom: 1.5px solid var(--border); }
.g-table td { padding: 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
.g-step { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: var(--brand-soft); color: var(--brand); font-weight: 700; font-size: 13px; }
.g-sub { font-size: 12px; color: var(--muted); }
.g-prose { font-size: 14.5px; margin-bottom: 14px; }
.g-callout { display: flex; gap: 10px; padding: 14px 16px; border-radius: var(--r-md); font-size: 14px; margin: 0 0 14px; }
.g-sec .g-callout { margin: 0 0 14px; }
.guide > .g-callout { margin: 0 22px 14px; }
.g-callout svg { flex-shrink: 0; margin-top: 1px; }
.g-red { background: var(--danger-soft); color: #7C1D1D; }
.g-red svg { color: var(--danger); }
.g-amber { background: var(--amber-soft); color: #7A3E06; }
.g-amber svg { color: var(--amber); }
.g-teal { background: var(--brand-soft); color: var(--brand-strong); }
.g-teal svg { color: var(--brand); }
.g-foot { padding: 14px 22px 20px; font-size: 12px; color: var(--faint); border-top: 1px solid var(--border); margin-top: 8px; }
@media print {
  body * { visibility: hidden; }
  .guide, .guide * { visibility: visible; }
  .guide { position: absolute; inset: 0; border: none; }
}
`;

function injectGuideCss() {
  if (!document.getElementById("guide-css")) {
    const st = document.createElement("style");
    st.id = "guide-css";
    st.textContent = GUIDE_CSS;
    document.head.appendChild(st);
  }
}
