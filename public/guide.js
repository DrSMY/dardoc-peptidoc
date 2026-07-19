// Patient guide renderer — shared by the doctor preview and the patient portal.
// buildGuide(plan, patient, doctorName) → HTML string (self-contained, print-friendly).
"use strict";

// Light markdown-ish → HTML for the master-document guide windows:
// escapes everything, then restores **bold**, linkifies URLs, keeps line breaks.
function guideProse(text) {
  let h = esc(String(text || ""));
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  return h.replace(/\n/g, "<br>");
}

// A collapsible <details> block — used throughout the guide so the patient
// sees short headers to tap open, instead of one long wall of text.
function accordion(icoName, title, bodyHtml, open) {
  return `<details class="g-acc" ${open ? "open" : ""}>
    <summary class="g-acc-sum">
      <span class="g-acc-sum-l">${typeof icoName === "string" && icoName.length <= 2 ? `<span class="g-emoji">${esc(icoName)}</span>` : icon(icoName, 17)} ${esc(title)}</span>
      ${icon("chevR", 15)}
    </summary>
    <div class="g-acc-body">${bodyHtml}</div>
  </details>`;
}

// The standard DarDoc guide windows for this medication+route (from
// public/patient-guides.js, generated off the master guides document).
// Skipped silently when the page didn't load the content or the
// medication has no standard guide (e.g. fully custom programs). Each
// window becomes its own collapsible accordion group rather than one long
// scroll of text — only the first (usually "at a glance"/"how it works")
// opens by default.
function standardGuideSections(plan) {
  if (typeof guideContentFor !== "function") return "";
  const content = guideContentFor(plan.medication, plan.route);
  if (!content) return "";
  const windows = content.sections.map((s, i) => accordion(s.emoji || "•", s.head, `<div class="g-prose">${guideProse(s.body)}</div>`, i === 0)).join("");
  const general = plan.category === "peptide" && typeof PEPTIDE_GENERAL_GUIDE !== "undefined" && PEPTIDE_GENERAL_GUIDE.length
    ? accordion("ℹ️", PEPTIDE_GENERAL_GUIDE[0].head, `<div class="g-prose">${guideProse(PEPTIDE_GENERAL_GUIDE[0].body)}</div>`, false) : "";
  return `
    <hr class="g-divider">
    <div class="g-std-head">Your complete medication guide</div>
    <div class="g-acc-group">${windows}${general}</div>`;
}

// A chip per prescribed medication — tap one to switch which medication's
// full guide is shown below. Used on both the patient portal's Guide tab
// and the doctor's per-patient Guide tab.
function guidePickerHTML(plans, activeId) {
  if (plans.length <= 1) return "";
  return `<div class="g-picker">
    ${plans.map((p) => `<button type="button" class="g-pick-chip ${p.id === activeId ? "on" : ""}" data-gpick="${p.id}">${icon(routeIcon(p.route), 15)} ${esc(p.medication)}${p.dose ? " · " + esc(p.dose) : ""}</button>`).join("")}
  </div>`;
}

// Wires the picker chips: clicking one re-renders `container` with that
// plan's full guide. `renderGuideFor(plan)` should return the guide HTML.
function wireGuidePicker(container, plans, renderGuideFor, activeId) {
  const picker = container.querySelector(".g-picker");
  if (!picker) return;
  picker.querySelectorAll("[data-gpick]").forEach((b) => b.addEventListener("click", () => {
    const id = Number(b.dataset.gpick);
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    const box = container.querySelector("#g-active-guide");
    box.innerHTML = renderGuideFor(plan);
    picker.querySelectorAll("[data-gpick]").forEach((x) => x.classList.toggle("on", Number(x.dataset.gpick) === id));
    window.scrollTo({ top: box.offsetTop - 12, behavior: "smooth" });
  }));
}

// Combines every active program into one guide. GLP-1 is always the focus
// when it's part of the plan — it gets the full guide (buildGuide, all
// standard windows) — while any other active medications are summarised in
// an "Also on your program" section with their dose, how-to-take steps and
// what-to-expect, so the patient has everything in one place without the
// GLP-1 story getting diluted. Falls back to buildGuide() unchanged when
// there's only one active program (the common case).
function buildComboGuide(plans, patient, doctorName) {
  if (!plans || !plans.length) return "";
  if (plans.length === 1) return buildGuide(plans[0], patient, doctorName);
  const primary = plans.find((p) => p.category === "glp1") || plans[0];
  const others = plans.filter((p) => p !== primary);
  const mainHtml = buildGuide(primary, patient, doctorName);
  if (!others.length) return mainHtml;
  const section = `
    <section class="g-sec">
      <h3>${icon("layers", 18)} Also on your program</h3>
      ${others.map(otherMedCardHTML).join("")}
    </section>`;
  const marker = '<footer class="g-foot">';
  const idx = mainHtml.indexOf(marker);
  return idx >= 0 ? mainHtml.slice(0, idx) + section + mainHtml.slice(idx) : mainHtml + section;
}

// Compact per-medication card for buildComboGuide()'s "Also on your
// program" section: dose + frequency, what to expect (how it works), and
// how to take it — pulled from the same standard guide content as the
// primary medication's full windows.
function otherMedCardHTML(plan) {
  const content = typeof guideContentFor === "function" ? guideContentFor(plan.medication, plan.route) : null;
  const how = content && content.sections.find((s) => /^HOW TO /i.test(s.head));
  const works = content && content.sections.find((s) => /WORKS|PROTOCOL AT A GLANCE/i.test(s.head));
  const phases = (plan.phases || []).filter((p) => p.dose || p.label);
  return `
  <div class="g-other-med">
    <div class="g-other-head">
      <span class="g-other-name">${icon(routeIcon(plan.route), 16)} ${esc(plan.medication)}</span>
      ${plan.dose ? `<span class="g-other-dose">${esc(plan.dose)}</span>` : ""}
    </div>
    <div class="g-other-meta">${esc(plan.frequency)}${plan.quantity > 1 ? ` · × ${esc(plan.quantity)}` : ""}${phases.length && phases[0].note ? ` · ${esc(phases[0].note)}` : ""}</div>
    ${works ? `<div class="g-other-block"><b>What to expect</b><div class="g-prose">${guideProse(works.body)}</div></div>` : ""}
    ${how ? `<div class="g-other-block"><b>How to take it</b><div class="g-prose">${guideProse(how.body)}</div></div>` : ""}
    ${plan.instructions ? `<div class="g-other-block"><b>Instructions from your doctor</b><div class="g-prose">${guideProse(plan.instructions)}</div></div>` : ""}
  </div>`;
}

function buildGuide(plan, patient, doctorName) {
  const diet = plan.diet || {};
  const phases = plan.phases || [];
  const routeLabel = {
    injection: "Subcutaneous injection",
    oral: "By mouth (oral)",
    nasal: "Nasal spray",
    topical: "Applied to skin (topical)",
  }[plan.route] || plan.route;

  const routeIco = routeIcon(plan.route);

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
        <img src="/brand/docare-gold-sm.png" alt="DoCare" style="height:48px;width:auto">
        <div>
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
      <div class="g-med-pill">${(() => {
        const photo = typeof medPhoto === "function" ? medPhoto(plan.medication, plan.category) : null;
        return photo ? `<img src="${photo}" alt="" class="g-med-pill-photo">` : icon(routeIco, 18);
      })()} ${esc(plan.medication)}${plan.dose ? ` · ${esc(plan.dose)}` : ""}</div>
    </section>

    <section class="g-sec g-sec-program">
      <h3>${icon("clipboard", 18)} Your program</h3>
      ${(() => {
        const photo = typeof medPhoto === "function" ? medPhoto(plan.medication, plan.category) : null;
        if (!photo) return "";
        const vial = typeof PEPTIDE_VIAL_PHOTO !== "undefined" && photo === PEPTIDE_VIAL_PHOTO;
        return `<img src="${photo}" alt="${esc(plan.medication)}" class="g-med-photo-overlay${vial ? " g-med-photo-vial" : ""}">`;
      })()}
      <div class="g-facts">
        <div class="g-fact"><div class="g-fact-lbl">Medication</div><div class="g-fact-val">${esc(plan.medication)}</div></div>
        ${plan.dose ? `<div class="g-fact"><div class="g-fact-lbl">Starting dose</div><div class="g-fact-val">${esc(plan.dose)}</div></div>` : ""}
        <div class="g-fact"><div class="g-fact-lbl">How to take it</div><div class="g-fact-val">${esc(routeLabel)}</div></div>
        <div class="g-fact"><div class="g-fact-lbl">Frequency</div><div class="g-fact-val">${esc(plan.frequency)}</div></div>
        ${plan.quantity && plan.quantity > 1 ? `<div class="g-fact"><div class="g-fact-lbl">Quantity dispensed</div><div class="g-fact-val">${esc(plan.quantity)}</div></div>` : ""}
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

    <section class="g-sec">
      <div class="g-acc-group">
        ${plan.instructions ? accordion("info", "Instructions from your doctor", `<div class="g-prose">${esc(plan.instructions).replace(/\n/g, "<br>")}</div>`, true) : ""}

        ${dietItems.length ? accordion("utensils", "Nutrition targets", `<div class="g-facts" style="margin-bottom:0">${dietItems.map((d) => `<div class="g-fact"><div class="g-fact-lbl">${esc(d.label)}</div><div class="g-fact-val">${esc(d.val)}</div></div>`).join("")}</div>`, false) : ""}

        ${plan.supplements ? accordion("pill", "Supplements", `<div class="g-prose">${esc(plan.supplements).replace(/\n/g, "<br>")}</div>`, false) : ""}

        ${plan.warnings ? accordion("alert", "When to contact your doctor", `<div class="g-callout g-red" style="margin:0">${icon("alert", 18)}<div>${esc(plan.warnings).replace(/\n/g, "<br>")}</div></div>`, true) : ""}
      </div>
    </section>

    ${bloodTest}

    ${standardGuideSections(plan)}

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
.guide { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); overflow: hidden; box-shadow: var(--shadow-md); }
.g-head {
  position: relative; overflow: hidden;
  display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 18px 22px;
  background: linear-gradient(135deg, var(--brand-strong), var(--brand) 55%, var(--gold-bronze) 130%);
  color: #fff;
}
.g-head::before {
  content: ""; position: absolute; inset: -40% -10% auto auto; width: 60%; height: 220%;
  background: radial-gradient(closest-side, rgba(225,199,132,.22), transparent 70%);
  pointer-events: none;
}
.g-brand { display: flex; gap: 12px; align-items: center; }
.g-brand img { filter: drop-shadow(0 2px 5px rgba(0,0,0,.5)) drop-shadow(0 0 12px rgba(225,199,132,.28)); }
.g-logo { width: 42px; height: 42px; border-radius: 12px; background: rgba(255,255,255,.15); display: flex; align-items: center; justify-content: center; }
.g-brand-name { font-family: var(--font-head); font-weight: 800; font-size: 17px; }
.g-brand-sub { font-size: 12.5px; opacity: .8; }
.g-issued { font-size: 12.5px; opacity: .85; text-align: right; }
.g-patient { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
.g-hello { font-size: 12.5px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
.g-patient h2 { font-size: 24px; margin: 2px 0; }
.g-doc { color: var(--muted); font-size: 14px; }
.g-med-pill { display: inline-flex; align-items: center; gap: 8px; background: var(--brand-soft); color: var(--brand); font-weight: 700; font-family: var(--font-head); padding: 8px 18px 8px 8px; border-radius: var(--r-full); font-size: 15px; }
.g-med-pill-photo { width: 30px; height: 30px; border-radius: 50%; object-fit: contain; background: #F0EEE2; padding: 3px; box-sizing: border-box; flex-shrink: 0; box-shadow: var(--inset-top-highlight); }
.g-sec { padding: 20px 22px 4px; }
.g-sec h3 { display: flex; align-items: center; gap: 8px; font-size: 15px; color: var(--brand); margin-bottom: 12px; }
.g-sec-program { position: relative; }
/* Small real-product photo, overlaid on the card's top-right corner so it
   sits beside the medication name/facts without ever covering that text —
   the facts grid gets top clearance so it never renders underneath it. */
.g-med-photo-overlay {
  position: absolute; top: 18px; right: 22px; width: 78px; height: 78px;
  object-fit: contain; border-radius: var(--r-md); background: #F0EEE2;
  padding: 8px; box-sizing: border-box; box-shadow: var(--shadow-sm); z-index: 1;
}
.g-sec-program .g-facts { padding-top: 92px; }
@media (max-width: 420px) {
  .g-med-photo-overlay { width: 60px; height: 60px; top: 14px; right: 16px; padding: 6px; }
  .g-sec-program .g-facts { padding-top: 72px; }
}
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
.g-red { background: var(--danger-soft); color: #7A2E22; }
.g-red svg { color: var(--danger); }
.g-amber { background: var(--amber-soft); color: #6E4A0E; }
.g-amber svg { color: var(--amber); }
.g-teal { background: var(--brand-soft); color: var(--brand-strong); }
.g-teal svg { color: var(--brand); }
.g-foot { padding: 14px 22px 20px; font-size: 12px; color: var(--faint); border-top: 1px solid var(--border); margin-top: 8px; }
.g-divider { border: none; border-top: 1.5px dashed var(--border-strong); margin: 20px 22px 4px; }
.g-std-head { padding: 14px 22px 0; font-family: var(--font-head); font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: .07em; color: var(--primary); }
.g-emoji { font-size: 16px; }
.g-prose a { color: var(--primary); word-break: break-all; }
.g-other-med { border: 1px solid var(--border); border-radius: var(--r-md); background: var(--bg); padding: 14px 16px; margin-bottom: 12px; }
.g-other-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-family: var(--font-head); font-weight: 700; font-size: 14.5px; }
.g-other-name { display: flex; align-items: center; gap: 8px; }
.g-other-dose { background: var(--primary-soft); color: var(--primary); padding: 3px 12px; border-radius: var(--r-full); font-size: 12.5px; font-weight: 700; white-space: nowrap; }
.g-other-meta { font-size: 12.5px; color: var(--muted); margin: 3px 0 4px; }
.g-other-block { margin-top: 8px; font-size: 13.5px; }
.g-other-block b { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--brand); margin-bottom: 3px; }

/* collapsible accordion groups — keeps the guide from reading as one wall of text */
.g-acc-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
.g-acc { border: 1px solid var(--border); border-radius: var(--r-md); background: var(--bg); overflow: hidden; }
.g-acc[open] { background: var(--surface); box-shadow: var(--inset-top-highlight); }
.g-acc-sum {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 13px 16px; cursor: pointer; list-style: none;
  font-family: var(--font-head); font-weight: 700; font-size: 14px; color: var(--brand-strong);
  transition: background .15s var(--ease);
}
.g-acc-sum::-webkit-details-marker { display: none; }
.g-acc-sum:hover { background: var(--brand-soft); }
.g-acc-sum-l { display: flex; align-items: center; gap: 9px; }
.g-acc-sum svg:last-child { color: var(--muted); transition: transform .2s var(--ease); flex-shrink: 0; }
.g-acc[open] .g-acc-sum svg:last-child { transform: rotate(90deg); }
.g-acc-body { padding: 2px 16px 16px; }
.g-acc-body .g-prose { margin-bottom: 0; }

/* medication picker chips — switch which prescribed medication's guide shows */
.g-picker { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.g-pick-chip {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 15px; border-radius: var(--r-full);
  border: 1.5px solid var(--border-strong); background: var(--surface); color: var(--muted);
  font-family: var(--font-head); font-weight: 600; font-size: 13.5px;
  cursor: pointer; transition: all .15s var(--ease);
}
.g-pick-chip:hover { border-color: var(--primary); color: var(--gold-bronze); }
.g-pick-chip.on {
  border-color: var(--brand); color: #fff;
  background: linear-gradient(180deg, #34461F, var(--brand));
  box-shadow: var(--inset-top-highlight), 0 2px 6px rgba(23,32,15,.22);
}
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
