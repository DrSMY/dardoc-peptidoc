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
  const portal = opts && opts.portal;
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
        Log your doses and check in regularly in this app so ${esc(signerName)} can track your progress.</div>
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
      You can message ${esc(signerName)} anytime through your patient portal. If you need to speak to a doctor urgently, please contact our customer care team directly.
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
`;

function injectGuideCss() {
  if (!document.getElementById("guide-css")) {
    const st = document.createElement("style");
    st.id = "guide-css";
    st.textContent = GUIDE_CSS;
    document.head.appendChild(st);
  }
}
