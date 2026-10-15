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
  const mc = typeof medColor === "function" ? medColor : () => "#283618";
  return `<div class="g-picker">
    ${plans.map((p) => `<button type="button" class="g-pick-chip ${p.id === activeId ? "on" : ""}" data-gpick="${p.id}" style="--mc:${mc(p)}">${typeof medFormIcon === "function" ? medFormIcon(p, 17) : icon(routeIcon(p.route), 15)} ${esc(p.medication)}${p.dose ? " · " + esc(p.dose) : ""}</button>`).join("")}
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

function buildGuide(plan, patient, doctorName, opts) {
  // opts.portal — render as an in-app page (no print letterhead / footer),
  // so the portal Guide tab can lead with a home-style hero header instead.
  // opts.shared — the public guide link: opened from WhatsApp in a browser,
  // not inside the app, so the copy must not tell the reader to "log in".
  const portal = opts && opts.portal;
  const shared = opts && opts.shared;
  // The program is signed by whoever prescribed it, which is not always the
  // person reading it — another doctor in the practice, or an admin.
  const signer = plan.signedBy || {};
  const signerName = signer.name || doctorName || "your doctor";
  // A program revised later says so, naming who changed it — the prescriber
  // on record stays the prescriber.
  const revisedLine = plan.revisedBy
    ? `Revised by ${esc(plan.revisedBy.name)}${plan.revisedBy.credentials ? `, ${esc(plan.revisedBy.credentials)}` : ""}${plan.updated_at ? ` on ${esc(fmtDate(plan.updated_at))}` : ""}`
    : "";
  const diet = plan.diet || {};
  const phases = plan.phases || [];
  const routeLabel = {
    injection: "Subcutaneous injection",
    oral: "By mouth (oral)",
    nasal: "Nasal spray",
    topical: "Applied to skin (topical)",
  }[plan.route] || plan.route;

  const routeIco = routeIcon(plan.route);

  // Deliberately not a week-by-week schedule — a doctor can revise a future
  // phase before it's ever reached, so the guide states only the dose the
  // patient is on right now and how long it's valid for. `phases[0]` is
  // that current phase (the wizard only ever auto-fills one phase at a
  // time — see suggestTitration — and any phase beyond it is a plan, not
  // a promise).
  const currentPhase = phases[0] || null;
  const doseOptions = Array.isArray(plan.doseOptions) ? plan.doseOptions : [];
  const doseNoteLines = [];
  if (currentPhase && currentPhase.weeks) {
    doseNoteLines.push(`This is your current dose for ${esc(String(currentPhase.weeks))} week${currentPhase.weeks == 1 ? "" : "s"}.`);
  }
  if (doseOptions.length) {
    doseNoteLines.push(`Approved doses for ${esc(plan.medication)}: ${doseOptions.map(esc).join(" → ")}. Your current dose is <strong>${esc(plan.dose || "—")}</strong>.`);
  }
  if (doseNoteLines.length) doseNoteLines.push("Your doctor may adjust this at your next review.");
  const doseNoteHtml = doseNoteLines.length ? `
    <div class="g-callout g-teal">
      ${icon("info", 18)}
      <div>${doseNoteLines.join("<br>")}</div>
    </div>` : "";

  const dietItems = [];
  if (diet.calories) dietItems.push({ ico: "flame", label: "Daily calorie target", val: `${diet.calories} kcal` });
  if (diet.proteinMin) dietItems.push({ ico: "utensils", label: "Daily protein", val: `${diet.proteinMin}–${diet.proteinMax || diet.proteinMin} g` });
  if (diet.water) dietItems.push({ ico: "droplet", label: "Water", val: diet.water });

  // Structured lab tests + supplements chosen in the consultation's
  // AI-analysis step. Fall back to the legacy blood-test callout /
  // free-text supplements only when no structured items exist.
  const labList = Array.isArray(plan.labTests) ? plan.labTests : [];
  const suppItems = Array.isArray(plan.suppList) ? plan.suppList : [];

  const labTestsHtml = labList.length ? `
    <section class="g-sec">
      <h3>${icon("droplet", 18)} Lab tests to complete</h3>
      <div class="g-lab-list">
        ${labList.map((l) => `
          <div class="g-lab">
            <div class="g-lab-top"><b>${esc(l.name)}</b>
              ${l.required ? `<span class="badge badge-red">required</span>` : `<span class="badge badge-amber">recommended</span>`}
              ${l.fasting ? `<span class="badge badge-gray">fasting</span>` : ""}
            </div>
            ${l.detail ? `<div class="g-lab-detail">${esc(l.detail)}</div>` : ""}
            ${l.link ? `<a class="g-lab-link" href="${esc(l.link)}" target="_blank" rel="noopener">Book this test ${icon("chevR", 13)}</a>` : ""}
          </div>`).join("")}
      </div>
    </section>` : "";

  const bloodTest = labList.length ? "" : (plan.blood_test && plan.blood_test !== "none"
    ? `<div class="g-callout ${plan.blood_test === "required" ? "g-red" : "g-amber"}">
        ${icon("droplet", 18)}
        <div><strong>Blood test ${plan.blood_test === "required" ? "REQUIRED" : "recommended"}.</strong>
        Please complete your blood test as advised by your doctor.</div>
      </div>` : "");

  const supplementsAcc = suppItems.length
    ? accordion("pill", "Recommended supplements", `<div class="g-supp-list">${suppItems.map((s) => `
        <div class="g-supp"><b>${esc(s.name)}</b>${s.dose ? ` · <span style="color:var(--muted);font-weight:600">${esc(s.dose)}</span>` : ""}${s.benefit ? `<div class="g-lab-detail">${esc(s.benefit)}</div>` : ""}</div>`).join("")}</div>`, false)
    : (plan.supplements ? accordion("pill", "Supplements", `<div class="g-prose">${esc(plan.supplements).replace(/\n/g, "<br>")}</div>`, false) : "");

  return `
  <div class="guide${portal ? " guide-portal" : ""}">
    ${portal ? "" : `
    <header class="g-head">
      <div class="g-brand">
        ${signer.logoUrl ? `<span class="g-logo-chip"><img src="${esc(signer.logoUrl)}" alt="${esc(signer.clinic || "Clinic logo")}" onerror="this.parentNode.style.display='none'"></span>` : ""}
        <div>
          ${!signer.logoUrl && signer.clinic ? `<div class="g-brand-name">${esc(signer.clinic)}</div>` : ""}
          <div class="g-brand-sub">Personal Treatment Guide</div>
        </div>
      </div>
      <div class="g-issued">Issued ${esc(fmtDate(plan.created_at))}</div>
    </header>

    <section class="g-patient card-pad">
      <div>
        <div class="g-hello">Prepared for</div>
        <h2>${esc(patient.title ? patient.title + " " : "")}${esc(patient.name)}</h2>
        <div class="g-doc">by ${esc(signerName)}${signer.credentials ? " · " + esc(signer.credentials) : ""}</div>
      </div>
      <div class="g-med-pill">${(() => {
        const photo = typeof medPhoto === "function" ? medPhoto(plan.medication, plan.category) : null;
        return photo ? `<img src="${photo}" alt="" class="g-med-pill-photo">` : icon(routeIco, 18);
      })()} ${esc(plan.medication)}${plan.dose ? ` · ${esc(plan.dose)}` : ""}</div>
    </section>`}

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
        ${plan.dose ? `<div class="g-fact"><div class="g-fact-lbl">Current dose</div><div class="g-fact-val">${esc(plan.dose)}</div></div>` : ""}
        <div class="g-fact"><div class="g-fact-lbl">How to take it</div><div class="g-fact-val">${esc(routeLabel)}</div></div>
        <div class="g-fact"><div class="g-fact-lbl">Frequency</div><div class="g-fact-val">${esc(plan.frequency)}</div></div>
        ${plan.quantity && plan.quantity > 1 ? `<div class="g-fact"><div class="g-fact-lbl">Quantity dispensed</div><div class="g-fact-val">${esc(plan.quantity)}</div></div>` : ""}
      </div>
      ${doseNoteHtml}
      ${(plan.guideInfo || {}).videoLink ? `<a class="g-video-link" href="${esc(plan.guideInfo.videoLink)}" target="_blank" rel="noopener">🎥 Watch: how ${esc(plan.medication)} works &amp; how to take it</a>` : ""}
    </section>

    <section class="g-sec">
      <div class="g-acc-group">
        ${plan.instructions ? accordion("info", "Instructions from your doctor", `<div class="g-prose">${esc(plan.instructions).replace(/\n/g, "<br>")}</div>`, true) : ""}

        ${dietItems.length ? accordion("utensils", "Nutrition targets", `<div class="g-facts" style="margin-bottom:0">${dietItems.map((d) => `<div class="g-fact"><div class="g-fact-lbl">${esc(d.label)}</div><div class="g-fact-val">${esc(d.val)}</div></div>`).join("")}</div>`, false) : ""}

        ${supplementsAcc}

        ${plan.warnings ? accordion("alert", "When to contact your doctor", `<div class="g-callout g-red" style="margin:0">${icon("alert", 18)}<div>${esc(plan.warnings).replace(/\n/g, "<br>")}</div></div>`, true) : ""}
      </div>
    </section>

    ${labTestsHtml}

    ${bloodTest}

    ${standardGuideSections(plan)}

    <section class="g-sec">
      <h3>${icon("calendar", 18)} Follow-up</h3>
      <div class="g-callout g-teal">
        ${icon("calendar", 18)}
        <div>Your next follow-up is due around <strong>${esc(fmtDate(plan.next_followup))}</strong>.
        ${shared
          ? `${esc(signerName)}'s team will be in touch to arrange it, or you're welcome to reach out whenever you're ready to book.${signer.appName ? ` If you have the ${esc(signer.appName)}, you can arrange it there too.` : ""}`
          : `Log your doses and check in regularly in this app so ${esc(signerName)} can track your progress.`}</div>
      </div>
    </section>

    ${portal ? "" : `
    <footer class="g-foot">
      <div class="g-sign">Prescribed and signed by<br>
        <b>${esc(signerName)}</b>${signer.credentials ? `, ${esc(signer.credentials)}` : ""}
        ${signer.signature ? `<br>${esc(signer.signature).replace(/\n/g, "<br>")}` : ""}
        <br>${esc(signer.clinic || "")}
        ${revisedLine ? `<div style="margin-top:6px">${revisedLine}</div>` : ""}
      </div>
      ${shared
        ? `If you have any questions about your treatment, please contact ${esc(signer.clinic || signerName)} directly. If you need urgent medical help, contact your nearest emergency service.`
        : `You can message ${esc(signerName)} anytime through your patient portal. If you need to speak to a doctor urgently, please contact our customer care team directly.`}
    </footer>`}
  </div>`;
}

// ── plain-text guide (for the "Copy guide text" button) ───────────
// A warm, first-person message from the doctor, written to be pasted
// straight into WhatsApp — not a clinical document. Bold via WhatsApp's own
// *single-asterisk* syntax, one emoji per section for quick visual scanning,
// blank-line segregation between sections instead of ASCII rule lines
// (which just read as clutter in a chat bubble).
function guideProseText(text) {
  return String(text || "").replace(/\*\*(.+?)\*\*/g, "$1").trim();
}

// "Severe abdominal pain (possible pancreatitis) — stop medication and seek
// urgent care" → "Severe abdominal pain". Strips the "— what to do about
// it" tail and any "(parenthetical)" aside, so a list of these reads as a
// flowing comma list of symptoms rather than a wall of clinical caveats.
function leadClause(s) {
  return String(s || "").split(/\s+—\s+/)[0].replace(/\s*\([^)]*\)/g, "").trim();
}
function lcFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
// "daily" → "once daily", "weekly" → "once weekly" — everything else (a
// custom frequency the doctor typed) is trusted as already-readable.
function guideFreqPhrase(f) {
  const t = String(f || "").trim().toLowerCase();
  if (t === "daily") return "once daily";
  if (t === "weekly") return "once weekly";
  return t;
}
// Structured lab tests, in the same required/recommended wording the HTML
// guide uses — shared by the single-plan and multi-peptide text guides.
function pushLabTestLines(push, section, labList) {
  if (!labList || !labList.length) return;
  section("🧪", "LAB TESTS");
  labList.forEach((l) => {
    const bits = [`${l.name} — ${l.required ? "required" : "recommended"}`];
    if (l.fasting) bits.push("fasting");
    push(`• ${bits.join(", ")}`);
    if (l.detail) push(`  ${l.detail}`);
  });
}
function commaList(items, conj) {
  const a = items.filter(Boolean);
  if (!a.length) return "";
  if (a.length === 1) return a[0];
  return `${a.slice(0, -1).join(", ")}, ${conj} ${a[a.length - 1]}`;
}

// "2026-09-24" → "between 21 and 27 September 2026" — the app schedules a
// single follow-up date, but a patient books their own appointment around
// it, so the message gives a window rather than implying an exact day.
function followUpWindowText(nextFollowup) {
  if (!nextFollowup) return "at your next scheduled visit";
  const base = new Date(String(nextFollowup).includes("T") ? nextFollowup : nextFollowup + "T12:00:00");
  if (isNaN(base)) return "at your next scheduled visit";
  const start = new Date(base.getTime() - 3 * 864e5);
  const end = new Date(base.getTime() + 3 * 864e5);
  const full = { day: "numeric", month: "long", year: "numeric" };
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startStr = start.toLocaleDateString("en-GB", sameMonth ? { day: "numeric" } : full);
  const endStr = end.toLocaleDateString("en-GB", full);
  return `between ${startStr} and ${endStr}`;
}

// Generic, category-level coaching — not tied to one specific medication,
// so it's the same for every GLP-1 (or every peptide) rather than living in
// the per-product content library.
const GLP1_MESSAGE_REASONS = ["persistent nausea or vomiting", "significant constipation or diarrhoea",
  "difficulty maintaining food or fluids", "excessive appetite suppression", "weakness or dizziness", "any medication concerns"];
const PEPTIDE_MESSAGE_REASONS = ["side effects that aren't settling", "an injection-site reaction",
  "questions about your protocol or supply", "anything that doesn't feel right"];

// opts.skipHeader / .skipFollowUp / .skipFooter — buildComboGuideText uses
// these to build one combined message instead of duplicating the welcome
// and sign-off per medication. opts.extraSection injects an "ALSO ON YOUR
// PROGRAM" block right before the follow-up section.
function buildGuideText(plan, patient, doctorName, opts) {
  const o = opts || {};
  const signer = plan.signedBy || {};
  const signerName = signer.name || doctorName || "your doctor";
  const isGlp1 = plan.category === "glp1";
  const diet = plan.diet || {};
  const info = plan.guideInfo || {};
  const currentPhase = (plan.phases || [])[0] || null;
  const doseOptions = Array.isArray(plan.doseOptions) ? plan.doseOptions : [];
  const firstName = String(patient.name || "").trim().split(/\s+/)[0] || "there";
  const routeLabel = {
    injection: "Subcutaneous injection", oral: "Oral tablet",
    nasal: "Nasal spray", topical: "Topical application",
  }[plan.route] || plan.route;

  const lines = [];
  const push = (s) => lines.push(s === undefined ? "" : s);
  const section = (emoji, title) => { push(); push(`${emoji} *${title}*`); };

  if (!o.skipHeader) {
    push("🩺 *PERSONAL TREATMENT GUIDE*");
    section("👋", "WELCOME TO YOUR TREATMENT JOURNEY");
    push(`Dear ${patient.title ? patient.title + " " : ""}${firstName},`);
    push();
    push("Welcome to your treatment journey.");
    push(isGlp1
      ? "Our goal is sustainable weight loss while protecting your health, preserving muscle, improving nutrition, and building habits that can continue long term."
      : "Our goal is to support your recovery and long-term health through this treatment, guided by careful monitoring throughout.");
    push("We're here to support you throughout your treatment — with messages, follow-ups, refills, and personalised guidance whenever you need them.");
    push();
    push(signerName);
  }

  section("📋", "YOUR CURRENT TREATMENT");
  push(`Medication: ${plan.medication}`);
  if (plan.dose) push(`Dose: ${plan.dose}`);
  push(`How to take: ${routeLabel}${plan.frequency ? `, ${guideFreqPhrase(plan.frequency)}` : ""}`);
  if (currentPhase && currentPhase.weeks) push(`Current duration: ${currentPhase.weeks} week${currentPhase.weeks == 1 ? "" : "s"}`);
  push();
  push("Continue this dose unless advised otherwise.");
  if (doseOptions.length) {
    push();
    push(`Approved doses for ${plan.medication}: ${doseOptions.join(" → ")}.`);
  }
  if (info.videoLink) {
    push();
    push(`🎥 Watch how ${plan.medication} works and how to take it: ${info.videoLink}`);
  }

  if (plan.instructions) {
    section("💊", `HOW TO TAKE ${String(plan.medication || "").toUpperCase()}`);
    // The stored instructions end with a generic "eat well / stay
    // hydrated" reminder (see defaultInstructionsFor) that the dedicated
    // nutrition sections below already cover in full — drop it here so
    // the same advice isn't said twice.
    const technique = isGlp1
      ? String(plan.instructions).split("\n").filter((l) => !/prioritise protein at every meal/i.test(l) && !/stay well hydrated/i.test(l)).join("\n").trim()
      : plan.instructions;
    push(guideProseText(technique));
  }

  if (isGlp1 && (diet.calories || diet.proteinMin || diet.water)) {
    section("🥗", "YOUR DAILY NUTRITION TARGETS");
    if (diet.calories) push(`Calories: approximately ${diet.calories} kcal`);
    if (diet.proteinMin) push(`Protein: ${diet.proteinMin}–${diet.proteinMax || diet.proteinMin} g`);
    push(`Water: ${diet.water || "2–3 litres daily"}`);
    push();
    push(`${plan.medication} reduces appetite, but the goal is not to stop eating. Your body still needs adequate protein, vitamins, minerals, fibre, and fluids.`);

    section("🍗", "PRIORITISE PROTEIN");
    push("Protein helps preserve muscle and keeps you fuller for longer. Include protein with every meal.");
    push("Good choices include chicken, turkey, lean beef, fish, seafood, eggs, Greek yoghurt, cottage cheese, low-fat labneh, lentils, chickpeas, and beans.");

    section("🍽️", "BUILD YOUR MEALS SIMPLY");
    push("Aim for:");
    push("• ½ plate: vegetables or salad");
    push("• ¼ plate: lean protein");
    push("• ¼ plate: complex carbohydrates");
    push();
    push("Choose oats, brown or basmati rice, quinoa, freekeh, whole-grain bread, sweet potato, lentils, and beans.");
    push();
    push("Limit sugary drinks, sweets, fried foods, fast food, processed snacks, large portions of rice, bread or pasta, and very fatty meals, which may worsen nausea.");

    section("🍏", "IF YOUR APPETITE IS LOW");
    push("Do not force large meals. Choose smaller, nutritious options such as eggs with vegetables, Greek yoghurt with berries, grilled chicken with salad, tuna with vegetables, lentil soup, or cottage cheese.");
    push();
    push("Avoid going through the day with almost no food simply because you are not hungry.");

    section("💧", "HYDRATION, FIBRE & EATING HABITS");
    push("Aim for 2–3 litres of water daily unless advised otherwise.");
    push("Include vegetables, fruit, oats, legumes, and whole grains for fibre.");
    push("Eat slowly, take smaller portions, stop when comfortably full, avoid overeating, limit late heavy meals, and avoid lying down immediately after eating.");
    push("Where appropriate, add regular walking and strength/resistance exercise 2–3 times weekly.");
  }

  if (info.howItWorks) {
    section("⚙️", `HOW ${String(plan.medication || "").toUpperCase()} HELPS`);
    push(info.howItWorks);
  }

  if (info.commonSideEffects) {
    section("⚠️", "COMMON SIDE EFFECTS");
    push(`Common effects include ${lcFirst(info.commonSideEffects.replace(/\.$/, ""))}.`);
    if (isGlp1) push("If nauseated, eat smaller meals, avoid greasy or heavy foods, eat slowly, and maintain hydration.");
    push(`Message me if symptoms persist or interfere with normal ${isGlp1 ? "eating or drinking" : "daily activity"}.`);
  }

  pushLabTestLines(push, section, plan.labTests);

  section("☎️", "WHEN TO CONTACT ME");
  push(`Message me for ${commaList(isGlp1 ? GLP1_MESSAGE_REASONS : PEPTIDE_MESSAGE_REASONS, "or")}.`);
  const urgentList = (info.redFlags || []).map(leadClause).filter(Boolean).map(lcFirst);
  if (urgentList.length) {
    push();
    push(`Seek urgent medical attention for ${commaList(urgentList, "or")}.`);
  }

  // Deliberately general: some patients have the practice's own app, many
  // don't, and the guide has to read naturally either way rather than
  // assuming everyone reads it inside something they may never have
  // installed.
  const appName = signer.appName || "";
  section("🔗", "STAYING CONNECTED WITH US");
  if (appName) {
    push(`If you have the ${appName} installed and subscribed, you can access everything — messaging, follow-ups, refills, and progress tracking — right there in the app.`);
    push();
    push("If you don't have it installed, don't worry — we'll send you a link whenever you need to book or purchase something, and you can rebook at any time.");
  } else {
    push("You're welcome to message me directly with any questions, request a follow-up or refill, and share how you're progressing.");
    push();
    push("Whenever you need to book or purchase something, we'll send you a link — you can arrange this whenever suits you.");
  }
  push();
  push("For non-medical matters such as appointments, payments, deliveries, technical support, or general assistance, our Customer Care Team is available to help.");

  if (o.extraSection) { push(); push(o.extraSection); }

  if (!o.skipFollowUp) {
    section("📅", "NEXT FOLLOW-UP & REFILL");
    push(`Your next follow-up and medication refill is expected ${followUpWindowText(plan.next_followup)}${appName ? ` and can be arranged easily through the ${appName}` : " — we'll be in touch to arrange it, or you're welcome to reach out"}.`);
    push();
    push("Until then:");
    push(`• Continue ${plan.medication}${plan.dose ? " " + plan.dose : ""}${plan.frequency ? " " + plan.frequency : ""}`);
    if (isGlp1 && diet.proteinMin) push(`• Aim for ${diet.proteinMin}–${diet.proteinMax || diet.proteinMin} g protein daily`);
    if (isGlp1 && diet.calories) push(`• Aim for approximately ${diet.calories} kcal/day`);
    if (isGlp1) push(`• Maintain hydration: ${diet.water || "2–3 L daily"}`);
    push("• Track your progress");
    push("• Contact me if needed");
  }

  if (!o.skipFooter) {
    section("💬", "A FINAL MESSAGE FROM YOUR DOCTOR");
    push(`${firstName}, remember that this is your journey, not a race.`);
    push(isGlp1
      ? "The medication is one part of the process. Our goal is safe weight loss, better health, muscle preservation, and habits you can maintain long term."
      : "The medication is one part of the process. Our goal is safe, steady progress and a full recovery you can build on.");
    push("Stay consistent, stay connected with us, and allow the process time to work.");
    push("I look forward to seeing your progress.");
    push();
    push(signerName);
    if (signer.credentials) push(signer.credentials);
    if (signer.signature) push(signer.signature);
    if (signer.clinic) push(signer.clinic);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// One combined message for more than one active program: the primary
// program gets the full letter, every other program is summarised in its
// own section right before the shared follow-up and sign-off.
function buildComboGuideText(plans, patient, doctorName) {
  if (!plans || !plans.length) return "";
  if (plans.length === 1) return buildGuideText(plans[0], patient, doctorName);
  const primary = plans.find((p) => p.category === "glp1") || plans[0];
  const others = plans.filter((p) => p !== primary);
  const otherBlocks = others.map((plan) => {
    const info = plan.guideInfo || {};
    const block = [`*${plan.medication}*${plan.dose ? ` — ${plan.dose}` : ""}`, plan.frequency ? guideFreqPhrase(plan.frequency) : ""];
    if (info.howItWorks) block.push(info.howItWorks);
    if (plan.instructions) block.push(guideProseText(plan.instructions));
    // Every medication's own side effects and red flags travel with it, even
    // when it isn't the primary program — a consolidated guide still has to
    // carry every warning sign, not just the lead medication's.
    if (info.commonSideEffects) block.push(`Common effects: ${lcFirst(info.commonSideEffects.replace(/\.$/, ""))}.`);
    const urgent = (info.redFlags || []).map(leadClause).filter(Boolean).map(lcFirst);
    if (urgent.length) block.push(`Seek urgent care for ${commaList(urgent, "or")}.`);
    return block.filter(Boolean).join("\n");
  }).join("\n\n");
  return buildGuideText(primary, patient, doctorName, {
    extraSection: `📎 *ALSO ON YOUR PROGRAM*\n\n${otherBlocks}`,
  });
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
/* the clinic's own logo sits on a white chip so any colours read on the dark header */
.g-logo-chip { display: inline-flex; align-items: center; justify-content: center; background: #fff; border-radius: 12px; padding: 6px 12px; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,.22); }
.g-brand .g-logo-chip img { height: 44px; max-width: 170px; width: auto; object-fit: contain; filter: none; display: block; }
@media (max-width: 480px) { .g-brand .g-logo-chip img { height: 36px; max-width: 130px; } .g-head { padding: 14px 16px; flex-wrap: wrap; gap: 8px; } .g-brand-sub { white-space: nowrap; } .g-issued { text-align: left; width: 100%; } }
.g-logo { width: 42px; height: 42px; border-radius: 12px; background: rgba(255,255,255,.15); display: flex; align-items: center; justify-content: center; }
.g-brand-name { font-family: var(--font-head); font-weight: 700; font-size: 17px; }
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
.g-video-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 700; color: var(--brand); font-family: var(--font-head); margin: -6px 0 14px; }
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
.g-sign { margin-bottom: 10px; color: var(--muted); line-height: 1.5; }
.g-sign b { font-family: var(--font-head); color: var(--text); }
.g-divider { border: none; border-top: 1.5px dashed var(--border-strong); margin: 20px 22px 4px; }
.g-std-head { padding: 14px 22px 0; font-family: var(--font-head); font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: .07em; color: var(--primary); }
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
.g-pick-chip { --mc: var(--brand); }
.g-pick-chip svg { color: var(--mc); }
.g-pick-chip:hover { border-color: var(--mc); color: color-mix(in srgb, var(--mc) 78%, #000); }
.g-pick-chip.on {
  border-color: var(--mc); color: #fff;
  background: var(--mc);
  box-shadow: var(--inset-top-highlight), 0 2px 8px color-mix(in srgb, var(--mc) 40%, transparent);
}
.g-pick-chip.on svg { color: #fff; }
@media print {
  body * { visibility: hidden; }
  .guide, .guide * { visibility: visible; }
  .guide { position: absolute; inset: 0; border: none; }
}

/* ── portal (in-app) guide — matches the Home tab's card language ── */
.guide-portal { background: transparent; border: none; box-shadow: none; overflow: visible; }
.guide-portal .g-sec {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm); margin-bottom: 14px; padding: 18px 18px 6px;
}
.guide-portal .g-sec > h3 { margin-bottom: 14px; }
.guide-portal .g-sec-program .g-med-photo-overlay { display: none; }   /* photo already in the hero */
.guide-portal .g-sec-program .g-facts { padding-top: 0; }
.guide-portal .g-acc-group { margin: 0 -18px; }
.guide-portal .g-acc { border-radius: 0; }
/* structured lab tests + supplements */
.g-lab-list, .g-supp-list { display: flex; flex-direction: column; gap: 10px; }
.g-lab { background: var(--bg); border: 1px solid var(--border); border-radius: var(--r-md); padding: 12px 14px; }
.g-lab-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-family: var(--font-head); font-size: 14.5px; }
.g-lab-detail { font-size: 13px; color: var(--muted); line-height: 1.5; margin-top: 4px; }
.g-lab-link { display: inline-flex; align-items: center; gap: 3px; margin-top: 8px; font-size: 13px; font-weight: 700; color: var(--brand); font-family: var(--font-head); }
.g-supp { padding: 4px 0; }
.g-supp b { font-family: var(--font-head); font-size: 14.5px; }
.g-toolbar { display: flex; align-items: center; gap: 10px; margin: 14px 0; }
.g-toolbar .btn { flex-shrink: 0; }
/* ── refill request form (portal sheet, guide-link sheet, dedicated /r/ page) ── */
.rr-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.rr-form .input { font-size: 16px; }            /* 16px stops iOS zooming into the field */
.rr-form textarea.input { min-height: 88px; }
.rr-sec { padding: 20px 0; border-bottom: 1px solid var(--border); }
.rr-sec:first-child { padding-top: 16px; }
.rr-sec:last-child { border-bottom: 0; }
.rr-sec-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
.rr-step { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
  background: var(--brand); color: #fff; font: 700 13px/1 var(--font-head); margin-top: 1px; }
.rr-q { margin: 0; font: 700 16.5px/1.3 var(--font-head); color: var(--text); }
.rr-hint { margin: 3px 0 0; font-size: 13.5px; line-height: 1.45; color: var(--muted); }
.rr-sublabel { display: block; margin: 16px 0 8px; padding: 0; font-size: 14.5px; font-weight: 600; color: var(--text); }
.rr-suffix { position: relative; }
.rr-suffix .input { padding-right: 46px; }
.rr-suffix > span { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 15px; font-weight: 600; color: var(--muted); pointer-events: none; }
/* option cards — every choice its own clearly bordered, tappable card */
.rr-group { border: 0; margin: 0; padding: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.rr-seg { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rr-opt { position: relative; background: var(--surface); border: 1.5px solid var(--border-strong); border-radius: 14px;
  transition: border-color .15s ease, box-shadow .15s ease; }
.rr-opt-head { display: flex; align-items: center; gap: 12px; min-height: 54px; padding: 12px 14px; cursor: pointer;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.rr-seg .rr-opt-head { justify-content: center; }
.rr-opt-head input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
.rr-radio { width: 20px; height: 20px; flex-shrink: 0; border-radius: 50%; border: 2px solid var(--border-strong); display: grid; place-items: center;
  transition: border-color .15s ease; }
.rr-radio::after { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--brand); transform: scale(0); transition: transform .15s ease; }
.rr-opt-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rr-opt-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; line-height: 1.3; color: var(--text); }
.rr-opt-sub { font-size: 13px; line-height: 1.35; color: var(--muted); }
.rr-opt.on { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
.rr-opt.on .rr-radio { border-color: var(--brand); }
.rr-opt.on .rr-radio::after { transform: scale(1); }
.rr-opt:has(input:focus-visible) { outline: 2px solid var(--primary); outline-offset: 2px; }
.rr-opt-body { padding: 0 14px 14px; }
.rr-opt-body .input { margin-bottom: 10px; }
@media (hover: hover) { .rr-opt:not(.on):hover { border-color: var(--sage); } }
.rr-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.rr-dot-mild { background: var(--accent); }
.rr-dot-moderate { background: var(--amber); }
.rr-dot-severe { background: var(--danger); }
/* explanation boxes — each in its own bounded box */
.rr-note { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px;
  background: var(--bg); border: 1px solid var(--border); }
.rr-note + .rr-note { margin-top: 8px; }
.rr-note svg { flex-shrink: 0; margin-top: 2px; color: var(--brand); }
.rr-note p { margin: 0; font-size: 14px; line-height: 1.55; color: var(--text); }
.rr-note-soft { background: var(--primary-soft); border-color: #EADBB8; }
.rr-note-soft svg { color: var(--gold-bronze); }
.rr-note-warn { background: var(--danger-soft); border-color: #EBC9C2; }
.rr-note-warn svg { color: var(--danger); }
.rr-yes .rr-group { margin-top: 16px; }
.rr-group > legend.rr-sublabel { margin: 0 0 8px; }
.rr-err { margin: 8px 0 0; font-size: 13.5px; font-weight: 600; color: var(--danger); }
/* modal → solid sheet; a bottom sheet on phones, with the send button always in reach */
.rr-sheet .modal { display: flex; flex-direction: column; overflow: hidden; padding: 0; max-height: 90vh; max-height: 90dvh;
  background: var(--surface); backdrop-filter: none; border: 1px solid var(--border); }
.rr-sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-shrink: 0;
  padding: 18px 20px 14px; border-bottom: 1px solid var(--border); }
.rr-kicker { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--gold-bronze); }
.rr-sheet-head h3 { margin: 2px 0 0; font: 700 19px/1.25 var(--font-head); color: var(--text); }
.rr-sheet-head h3 span { font-weight: 500; color: var(--muted); }
.rr-sheet-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; padding: 0 20px; }
.rr-sheet-foot { flex-shrink: 0; padding: 12px 20px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--surface); }
.rr-submit { min-height: 52px; font-size: 16px; }
.rr-foot-hint { margin: 8px 0 0; text-align: center; font-size: 12.5px; color: var(--muted); }
.rr-done { text-align: center; padding: 36px 24px calc(32px + env(safe-area-inset-bottom)); }
.rr-done-ico { width: 64px; height: 64px; margin: 0 auto 14px; border-radius: 50%; display: grid; place-items: center; background: var(--brand-soft); color: var(--brand); }
.rr-done h3 { margin: 0 0 6px; font: 700 20px/1.3 var(--font-head); }
.rr-done p { margin: 0 auto; max-width: 340px; font-size: 14.5px; line-height: 1.55; color: var(--muted); }
@media (max-width: 560px) {
  .rr-sheet { align-items: flex-end; padding: 0; }
  .rr-sheet .modal { width: 100%; max-height: 94vh; max-height: 94dvh; border-radius: 20px 20px 0 0; border-bottom: 0;
    animation: rrSheetUp .26s cubic-bezier(.2,.8,.2,1); }
  .rr-sheet-head { padding: 16px 16px 12px; }
  .rr-sheet-body { padding: 0 16px; }
  .rr-sheet-foot { padding-left: 16px; padding-right: 16px; }
}
@keyframes rrSheetUp { from { transform: translateY(40px); opacity: 0; } }
@media (prefers-reduced-motion: no-preference) {
  .rr-reveal { animation: rrFadeIn .2s ease-out; }
}
@keyframes rrFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
`;

function injectGuideCss() {
  if (!document.getElementById("guide-css")) {
    const st = document.createElement("style");
    st.id = "guide-css";
    st.textContent = GUIDE_CSS;
    document.head.appendChild(st);
  }
}

// ── refill request (shared by the portal, the guide link and the dedicated
// refill link) ───────────────────────────────────────────────────────────
// One form everywhere: weight, a structured side-effects question, (peptides)
// how it's working, and for GLP-1 programs a dose preference. Every choice is
// its own card; picking one opens a short explanation inside that card, so
// the decision is informed rather than a blind pick. Submitting never changes
// the program — it only logs a request the doctor reviews and decides on.

// The approved dose one step up or down from the current one, or null when
// the current dose isn't on the ladder or there's no step in that direction.
function doseLadderStep(options, current, dir) {
  const i = (options || []).indexOf(current);
  if (i === -1) return null;
  return options[i + (dir === "up" ? 1 : -1)] || null;
}

// Plain-language copy for each dose choice. Factual and non-prescriptive:
// each one describes what the choice means and that the doctor confirms
// before anything changes.
function doseChoiceCopy(plan) {
  const doses = Array.isArray(plan.doseOptions) ? plan.doseOptions : [];
  const cur = plan.dose || "your current dose";
  const up = doseLadderStep(doses, plan.dose, "up");
  const down = doseLadderStep(doses, plan.dose, "down");
  const onLadder = doses.includes(plan.dose);
  return {
    same: {
      title: "Keep my current dose", sub: plan.dose ? `Stay on ${plan.dose}` : "",
      body: `You'll continue on ${cur}. A good choice if any side effects are manageable and you're happy with your progress.`,
    },
    increase: {
      title: "Increase my dose", sub: up ? `Next step: ${up}` : onLadder ? "You're on the highest dose" : "",
      body: up || !onLadder
        ? "Usually considered once your current dose feels comfortable and progress has slowed. Your doctor will check you're ready before making the change."
        : "You're already on the highest approved dose. Your doctor can talk you through other ways to keep your progress going.",
    },
    decrease: {
      title: "Lower my dose", sub: down ? `Previous step: ${down}` : onLadder ? "You're on the starting dose" : "",
      body: down || !onLadder
        ? "Stepping down can ease side effects while keeping you on treatment. Your doctor will make sure it still supports your goals."
        : "You're on the starting dose, so there isn't a lower one. Your doctor can suggest other ways to ease side effects.",
    },
    custom: {
      title: "Choose a specific dose", sub: "Pick from the approved doses",
      body: "Your doctor will review the dose you choose before anything changes.",
    },
    talk: {
      title: "Talk to my doctor first", sub: "No dose change for now",
      body: "Nothing will change yet. Your doctor will contact you to talk things through before deciding on your next dose.",
    },
  };
}

const SEVERITY_COPY = {
  mild: {
    title: "Mild", sub: "Noticeable, but manageable",
    body: "Your side effects were noticeable but didn't get in the way of your day — you've been able to carry on with your normal routine.",
  },
  moderate: {
    title: "Moderate", sub: "Disrupted my day",
    body: "Your side effects disrupted your daily activities — you needed to rest, take time off, or change how you'd normally go about your day.",
  },
  severe: {
    title: "Severe", sub: "Hard to tolerate",
    body: "Your side effects were hard to tolerate, seriously affected your daily life, or you needed medical help.",
  },
};

function rrNote(text, tone) {
  const ico = tone === "warn" ? "alert" : tone === "soft" ? "heart" : "info";
  return `<div class="rr-note${tone ? " rr-note-" + tone : ""}">${icon(ico, 16)}<p>${text}</p></div>`;
}

// One choice card. Its explanation (bodyHTML) sits inside the card and only
// shows while the card is selected.
function rrOption(name, value, { title, sub, dot }, bodyHTML, checked) {
  return `
  <div class="rr-opt${checked ? " on" : ""}">
    <label class="rr-opt-head">
      <input type="radio" name="${name}" value="${value}"${checked ? " checked" : ""}>
      <span class="rr-radio" aria-hidden="true"></span>
      <span class="rr-opt-text">
        <span class="rr-opt-title">${dot ? `<span class="rr-dot rr-dot-${dot}" aria-hidden="true"></span>` : ""}${esc(title)}</span>
        ${sub ? `<span class="rr-opt-sub">${esc(sub)}</span>` : ""}
      </span>
    </label>
    ${bodyHTML ? `<div class="rr-opt-body"${checked ? "" : " hidden"}>${bodyHTML}</div>` : ""}
  </div>`;
}

function rrSection(step, question, hint, inner) {
  return `
  <section class="rr-sec">
    <div class="rr-sec-head">
      <span class="rr-step" aria-hidden="true">${step}</span>
      <div><h4 class="rr-q">${question}</h4>${hint ? `<p class="rr-hint">${hint}</p>` : ""}</div>
    </div>
    ${inner}
  </section>`;
}

// Just the fields — no modal chrome, no submit button — so the same markup
// works inside the sheet (portal, guide link) and inline on the /r/ page.
function refillRequestFieldsHTML(plan) {
  const isGlp1 = plan.category === "glp1";
  const isPeptide = plan.category === "peptide";
  const doseOptions = Array.isArray(plan.doseOptions) ? plan.doseOptions : [];
  let step = 0;
  const sections = [];

  sections.push(rrSection(++step, "What's your weight today?", "Optional — it helps your doctor track your progress.", `
    <label class="rr-sr" for="rr-weight">Weight in kilograms</label>
    <div class="rr-suffix">
      <input class="input" id="rr-weight" type="number" step="0.1" min="20" max="400" inputmode="decimal" placeholder="e.g. 82.5">
      <span aria-hidden="true">kg</span>
    </div>`));

  sections.push(rrSection(++step, "Have you had any side effects?", "Since your last dose or refill.", `
    <fieldset class="rr-group rr-seg">
      <legend class="rr-sr">Have you had any side effects?</legend>
      ${rrOption("rr-se", "no", { title: "No" }, "", true)}
      ${rrOption("rr-se", "yes", { title: "Yes" }, "")}
    </fieldset>
    <div class="rr-yes" id="rr-se-yes" hidden>
      <div style="margin-top:12px">${rrNote("We're sorry you're dealing with side effects. Let us know how much they've affected you, so we can suggest ways to ease them and adjust your plan going forward.", "soft")}</div>
      <fieldset class="rr-group" id="rr-sev-group">
        <legend class="rr-sublabel">How much have they affected you?</legend>
        ${rrOption("rr-severity", "mild", { ...SEVERITY_COPY.mild, dot: "mild" }, rrNote(SEVERITY_COPY.mild.body))}
        ${rrOption("rr-severity", "moderate", { ...SEVERITY_COPY.moderate, dot: "moderate" }, rrNote(SEVERITY_COPY.moderate.body))}
        ${rrOption("rr-severity", "severe", { ...SEVERITY_COPY.severe, dot: "severe" },
          rrNote(SEVERITY_COPY.severe.body) + rrNote("If you're feeling unwell right now, please don't wait for this request — contact your clinic or seek urgent medical care.", "warn"))}
      </fieldset>
      <p class="rr-err" id="rr-sev-err" role="alert" hidden>Please choose how much they've affected you.</p>
    </div>
    <label class="rr-sublabel" for="rr-side">Anything you'd like to add? <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
    <textarea class="input" id="rr-side" rows="3" placeholder="What you've noticed, when it happens, what helps"></textarea>`));

  if (isPeptide) {
    sections.push(rrSection(++step, "How has it been working for you?", "Any changes you've noticed — energy, sleep, recovery, skin, anything at all.", `
      <label class="rr-sr" for="rr-results">How it has been working</label>
      <textarea class="input" id="rr-results" rows="3" placeholder="Optional"></textarea>`));
  }

  if (isGlp1) {
    const copy = doseChoiceCopy(plan);
    const customBody = (doseOptions.length
      ? `<label class="rr-sr" for="rr-customdose">Dose</label>
         <select class="input" id="rr-customdose">${doseOptions.map((d) => `<option ${d === plan.dose ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>`
      : "") + rrNote(copy.custom.body);
    sections.push(rrSection(++step, "What would you like for your next dose?", "Your doctor makes the final decision. Tap an option to see what it means.", `
      <fieldset class="rr-group">
        <legend class="rr-sr">Your preference for your next dose</legend>
        ${rrOption("rr-dose", "same", copy.same, rrNote(copy.same.body), true)}
        ${rrOption("rr-dose", "increase", copy.increase, rrNote(copy.increase.body))}
        ${rrOption("rr-dose", "decrease", copy.decrease, rrNote(copy.decrease.body))}
        ${rrOption("rr-dose", "custom", copy.custom, customBody)}
        ${rrOption("rr-dose", "talk", copy.talk, rrNote(copy.talk.body))}
      </fieldset>`));
  }

  sections.push(rrSection(++step, "Anything else for your doctor?", "Optional.", `
    <label class="rr-sr" for="rr-notes">Anything else for your doctor</label>
    <textarea class="input" id="rr-notes" rows="3" placeholder="Questions, travel plans, anything we should know"></textarea>`));

  return sections.join("");
}

function rrReveal(el) {
  el.classList.remove("rr-reveal");
  void el.offsetWidth;
  el.classList.add("rr-reveal");
}

// Selecting a card marks it, opens its explanation and closes the others;
// "Yes" to side effects opens the empathy note and the severity question.
function wireRefillRequestFields(root) {
  root.querySelectorAll(".rr-opt input[type=radio]").forEach((input) => input.addEventListener("change", () => {
    if (!input.checked) return;
    root.querySelectorAll(`input[name="${input.name}"]`).forEach((r) => {
      const opt = r.closest(".rr-opt");
      opt.classList.toggle("on", r.checked);
      const body = opt.querySelector(".rr-opt-body");
      if (body) { body.hidden = !r.checked; if (r.checked) rrReveal(body); }
    });
    if (input.name === "rr-se") {
      const yes = root.querySelector("#rr-se-yes");
      yes.hidden = input.value !== "yes";
      if (!yes.hidden) rrReveal(yes);
    }
    if (input.name === "rr-severity") root.querySelector("#rr-sev-err").hidden = true;
  }));
}

// Returns true when the form can be sent; otherwise points at what's missing.
function checkRefillRequestFields(root) {
  const yes = root.querySelector('input[name="rr-se"][value="yes"]');
  if (yes && yes.checked && !root.querySelector('input[name="rr-severity"]:checked')) {
    const err = root.querySelector("#rr-sev-err");
    err.hidden = false;
    root.querySelector("#rr-sev-group").scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }
  return true;
}

function readRefillRequestFields(root) {
  const seRadio = root.querySelector('input[name="rr-se"]:checked');
  const sevRadio = root.querySelector('input[name="rr-severity"]:checked');
  const doseRadio = root.querySelector('input[name="rr-dose"]:checked');
  const customSel = root.querySelector("#rr-customdose");
  const val = (id) => { const el = root.querySelector("#" + id); return el ? el.value.trim() : ""; };
  const hasSideEffects = seRadio ? seRadio.value : "";
  const doseAction = doseRadio ? doseRadio.value : "";
  return {
    weightKg: Number(val("rr-weight")) || null,
    hasSideEffects,
    sideEffectSeverity: hasSideEffects === "yes" && sevRadio ? sevRadio.value : "",
    sideEffects: val("rr-side"),
    resultsFelt: val("rr-results"),
    doseAction,
    requestedDose: doseAction === "custom" && customSel ? customSel.value : "",
    notes: val("rr-notes"),
  };
}

function refillRequestFormHTML(plan) {
  return `
  <div class="rr-sheet-head">
    <div>
      <div class="rr-kicker">Request a refill</div>
      <h3>${esc(plan.medication)}${plan.dose ? ` <span>· ${esc(plan.dose)}</span>` : ""}</h3>
    </div>
    <button class="icon-btn" data-close aria-label="Close">${icon("x", 18)}</button>
  </div>
  <div class="rr-sheet-body rr-form">${refillRequestFieldsHTML(plan)}</div>
  <div class="rr-sheet-foot">
    <button class="btn btn-primary btn-block rr-submit" id="rr-submit" type="button">Send request</button>
    <p class="rr-foot-hint">Your doctor reviews every request before anything changes.</p>
  </div>`;
}

function refillDoneHTML(title, text) {
  return `<div class="rr-done"><div class="rr-done-ico">${icon("checkCircle", 32)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

// Opens the form as a sheet; submitFn(payload) does the actual POST (the
// endpoint differs between the portal, which is already signed in, and a
// public link, which authenticates by its token).
function openRefillRequestModal(plan, submitFn) {
  const scrim = modal(refillRequestFormHTML(plan));
  scrim.classList.add("rr-sheet");
  wireRefillRequestFields(scrim);
  scrim.querySelector("#rr-submit").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (!checkRefillRequestFields(scrim)) return;
    const payload = readRefillRequestFields(scrim);
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      await submitFn(payload);
      scrim.querySelector(".modal").innerHTML = refillDoneHTML("Request sent", "Thank you. Your doctor will review your answers and confirm your next step with you.");
      setTimeout(() => scrim.remove(), 2600);
    } catch (ex) {
      btn.disabled = false; btn.textContent = "Send request";
      toast((ex && ex.message) || "Could not send your request", "bad");
    }
  });
}
