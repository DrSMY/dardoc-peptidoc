// Patient information form (/f/<token>), for someone who bought their
// medication before any consultation or couldn't join one. No sign-in: the
// unguessable token in the URL is the credential. The patient confirms what
// the practice already has and fills in the rest. Each question says why it is
// asked, and each choice explains what it means. A doctor reviews every answer
// before treatment goes ahead; the server decides what gets flagged for them.
"use strict";

// guide.js and shared.js read a global `S` for per-medication colours.
const S = { medColors: {} };

(async function boot() {
  const root = document.getElementById("rp");
  const token = location.pathname.split("/").filter(Boolean)[1] || "";
  injectGuideCss();

  let clinic = null;
  const topHTML = () => (clinic ? `
    <header class="rp-top">
      ${clinic.logoUrl
        ? `<img class="rp-logo" src="${esc(clinic.logoUrl)}" alt="${esc(clinic.name || "Clinic logo")}">`
        : `<span class="rp-clinic">${esc(clinic.name || "Your clinic")}</span>`}
      <span class="rp-private">${icon("shield", 14)} Private link</span>
    </header>` : "");

  let data;
  try {
    data = await api("GET", `/api/form/${encodeURIComponent(token)}`);
  } catch (e) {
    root.innerHTML = `<div class="rp-state" style="margin-top:24px"><div class="rp-state-ico">${icon("alert", 30)}</div>
      <h1>This link isn't available</h1><p>${esc(e.message || "Please ask your clinic to send you a new link.")}</p></div>`;
    return;
  }
  clinic = data.clinic;
  document.title = `Complete your details${clinic.name ? " — " + clinic.name : ""}`;
  if (clinic.logoUrl) {
    const fav = document.createElement("link");
    fav.rel = "icon"; fav.href = clinic.logoUrl;
    document.head.appendChild(fav);
  }

  const waitText = `Please don't start ${data.meds && !data.meds.length ? "any new medication" : "your medication"} until your doctor has spoken with you.`;

  function doneHTML(wait, firstName) {
    return `${topHTML()}
      <div class="rp-state">
        <div class="rp-state-ico">${icon(wait ? "heart" : "checkCircle", 30)}</div>
        <h1>Thank you${firstName ? `, ${esc(firstName)}` : ""}</h1>
        <p>${wait
          ? "We have your answers, and your doctor will contact you."
          : "We have your answers. Your doctor will review them and be in touch with your next steps."}</p>
        ${wait ? `<div class="fp-done-note">${rrNote(`${waitText} Some of your answers need a conversation first.`, "warn")}</div>` : ""}
        <p>You can close this page.</p>
      </div>`;
  }

  if (data.status === "submitted") {
    root.innerHTML = doneHTML(data.wait);
    return;
  }

  const { reason, prefill, options } = data;
  const meds = data.meds.map((m, i) => ({ ...m, id: i + 1 }));
  const hasGlp1 = meds.some((m) => m.category === "glp1");
  const asksGlp1 = !meds.length || hasGlp1;
  const firstName = String(prefill.name || "").trim().split(/\s+/)[0] || "";
  S.medColors = medColorMap(meds);

  const isYes = (v) => v === true;
  const isNo = (v) => v === false;
  const radios = (name) => root.querySelector(`input[name="${name}"]:checked`);
  const val = (name) => { const r = radios(name); return r ? r.value : ""; };
  const text = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const ticked = (name) => [...root.querySelectorAll(`input[name="${name}"]:checked`)].map((x) => x.value);
  const err = (id) => `<p class="rr-err" id="err-${id}" role="alert" hidden></p>`;

  const field = (id, label, control, small) => `
    <div class="rr-field">
      <label class="rr-sublabel" for="${id}">${label}</label>
      ${control}
      ${small ? `<p class="fp-small">${small}</p>` : ""}
      ${err(id)}
    </div>`;
  const input = (id, value, attrs) => `<input class="input" id="${id}" value="${esc(value == null ? "" : value)}" ${attrs || ""}>`;
  const area = (id, value, placeholder, rows) => `<textarea class="input" id="${id}" rows="${rows || 3}" placeholder="${esc(placeholder || "")}">${esc(value || "")}</textarea>`;
  const seg = (legend, name, opts, current, cls) => `
    <fieldset class="rr-group rr-seg ${cls || ""}">
      <legend class="rr-sr">${legend}</legend>
      ${opts.map(([value, title]) => rrOption(name, value, { title }, "", current === value)).join("")}
    </fieldset>`;
  const chips = (legend, name, opts, selected) => `
    <fieldset class="rr-group">
      <legend class="rr-sublabel">${legend}</legend>
      <div class="fp-chips">
        ${opts.map((o) => `<label class="fp-chip"><input type="checkbox" name="${name}" value="${esc(o)}"${(selected || []).includes(o) ? " checked" : ""}>${esc(o)}</label>`).join("")}
      </div>
    </fieldset>`;

  // ── the questions ────────────────────────────────────────────────
  const medsText = meds.map((m) => `${m.medication}${m.dose ? " " + m.dose : ""}`).join(", ");
  const dobMax = new Date().toISOString().slice(0, 10);
  let step = 0;
  const sections = [];

  if (reason === "purchased" && meds.length) {
    sections.push(rrSection(++step, `Is this what you purchased?`, "Before anything is delivered, we want the right medication and dose on your file.", `
      ${seg("Is this what you purchased?", "f-medconfirm", [["yes", "Yes, that's right"], ["no", "No, it's different"]], "")}
      <div class="fp-reveal" id="f-medconfirm-no" hidden>
        ${field("f-medcorrection", "What did you purchase?", area("f-medcorrection", "", "Medication name and dose", 2))}
      </div>
      ${err("f-medconfirm")}`));
  }

  sections.push(rrSection(++step, "Please check your details", "So your medication, messages and follow-up reach the right person. Change anything that isn't right.", `
    ${field("f-name", "Full name, as on your ID or passport", input("f-name", prefill.name, 'autocomplete="name"'))}
    ${field("f-mobile", "Mobile number", input("f-mobile", prefill.mobile, 'type="tel" inputmode="tel" autocomplete="tel" placeholder="9715xxxxxxxx"'), "We use this for delivery updates and to sign you in to your patient portal.")}
    ${field("f-email", 'Email <span style="font-weight:400;color:var(--muted)">(optional)</span>', input("f-email", prefill.email, 'type="email" inputmode="email" autocomplete="email"'))}`));

  sections.push(rrSection(++step, "About you", "Some medications and doses depend on your age and gender. Your date of birth also helps us confirm it's really you.", `
    ${field("f-dob", "Date of birth", input("f-dob", prefill.dob, `type="date" min="1900-01-01" max="${dobMax}" autocomplete="bday"`), "")}
    <p class="fp-small" id="f-age" hidden></p>
    <div class="fp-note" id="f-minor" hidden>${rrNote(`Because you're under 18, ${waitText.charAt(0).toLowerCase() + waitText.slice(1)} A parent or guardian will need to be part of that conversation.`, "warn")}</div>
    <div class="rr-sublabel">Gender</div>
    ${seg("Gender", "f-gender", [["Female", "Female"], ["Male", "Male"], ["Other", "Other"]], prefill.gender || "", "fp-seg3")}
    ${err("f-gender")}
    <div class="fp-reveal" id="f-preg" ${prefill.gender && prefill.gender !== "Male" ? "" : "hidden"}>
      ${rrNote("Medications like this aren't considered safe during pregnancy or while breastfeeding, because of the possible risk to the baby. That's why we ask, even if it seems unlikely.")}
      <fieldset class="rr-group" style="margin-top:14px">
        <legend class="rr-sublabel" style="margin-top:0">Are you pregnant, or planning a pregnancy?</legend>
        ${rrOption("f-pregnancy", "no", { title: "No" }, rrNote("Thank you. If this changes, or you think you might be pregnant, please stop and contact us straight away."))}
        ${rrOption("f-pregnancy", "pregnant", { title: "Yes, I'm pregnant" }, rrNote(`${waitText} We'll contact you after you send this form.`, "warn"))}
        ${rrOption("f-pregnancy", "planning", { title: "I'm planning a pregnancy" }, rrNote(`${waitText} Some medications need stopping well before trying to conceive, so your doctor will talk through the timing with you.`, "warn"))}
      </fieldset>
      ${err("f-pregnancy")}
      <fieldset class="rr-group" style="margin-top:14px">
        <legend class="rr-sublabel" style="margin-top:0">Are you breastfeeding?</legend>
        ${rrOption("f-breastfeeding", "no", { title: "No" }, "")}
        ${rrOption("f-breastfeeding", "yes", { title: "Yes" }, rrNote(`${waitText} We'll contact you after you send this form.`, "warn"))}
      </fieldset>
      ${err("f-breastfeeding")}
    </div>`));

  sections.push(rrSection(++step, "Your height and weight", "Your doctor uses these to work out your BMI, check the medication and dose suit you, and set your daily calorie and protein targets.", `
    <div class="fp-two">
      <div class="rr-field">
        <label class="rr-sublabel" for="f-height">Height</label>
        <div class="rr-suffix">${input("f-height", prefill.heightCm, 'type="number" inputmode="decimal" step="0.1" min="100" max="250" placeholder="165"')}<span aria-hidden="true">cm</span></div>
      </div>
      <div class="rr-field" style="margin-top:0">
        <label class="rr-sublabel" for="f-weight">Weight today</label>
        <div class="rr-suffix">${input("f-weight", prefill.weightKg, 'type="number" inputmode="decimal" step="0.1" min="25" max="350" placeholder="80"')}<span aria-hidden="true">kg</span></div>
      </div>
    </div>
    ${err("f-height")}${err("f-weight")}
    <p class="fp-small" id="f-bmi" hidden></p>`));

  sections.push(rrSection(++step, "Do you have any chronic illnesses?", "Conditions like diabetes, high blood pressure or thyroid problems can change which dose is safe, or what your doctor checks along the way.", `
    ${seg("Do you have any chronic illnesses?", "f-conditionsgate", [["no", "No"], ["yes", "Yes"]], isYes(prefill.conditionsGate) ? "yes" : isNo(prefill.conditionsGate) ? "no" : "")}
    ${err("f-conditionsgate")}
    <div class="fp-reveal" id="f-conditions" ${isYes(prefill.conditionsGate) ? "" : "hidden"}>
      ${rrNote("Thank you for telling us. Your doctor will check how your treatment fits with this, and may ask for a blood test first.")}
      ${chips("Tick all that apply", "f-condition", options.conditions, prefill.conditions)}
      ${field("f-conditionsother", 'Anything else? <span style="font-weight:400;color:var(--muted)">(optional)</span>', input("f-conditionsother", prefill.conditionsOther, 'placeholder="Any other condition"'))}
      ${field("f-conditionsnotes", 'Details <span style="font-weight:400;color:var(--muted)">(optional)</span>', area("f-conditionsnotes", prefill.conditionsNotes, "How long you've had it, how it's being treated", 2))}
      ${err("f-condition")}
    </div>`));

  sections.push(rrSection(++step, "Are you taking any medications at the moment?", `Include vitamins, supplements and herbal products. Some medicines interact with treatment or need adjusting${hasGlp1 ? ". For example, insulin and some diabetes tablets can cause low blood sugar alongside this type of medication" : ""}.`, `
    ${seg("Are you taking any medications at the moment?", "f-medsgate", [["no", "No"], ["yes", "Yes"]], prefill.medications ? "yes" : "")}
    ${err("f-medsgate")}
    <div class="fp-reveal" id="f-meds" ${prefill.medications ? "" : "hidden"}>
      ${rrNote("Please keep taking your regular medicines unless your doctor tells you otherwise.")}
      ${field("f-medications", "Name and dose of each one", area("f-medications", prefill.medications, "e.g. Metformin 500 mg twice a day"))}
    </div>`));

  sections.push(rrSection(++step, "Do you have any allergies?", "To food, medications or anything else. This is so we never give you something you've reacted to, including ingredients in an injection or supplement.", `
    ${seg("Do you have any allergies?", "f-allergiesgate", [["no", "No"], ["yes", "Yes"]], isYes(prefill.allergiesGate) ? "yes" : isNo(prefill.allergiesGate) ? "no" : "")}
    ${err("f-allergiesgate")}
    <div class="fp-reveal" id="f-allergies" ${isYes(prefill.allergiesGate) ? "" : "hidden"}>
      ${chips("What are you allergic to?", "f-allergytype", options.allergyTypes, prefill.allergyTypes)}
      ${err("f-allergytype")}
      ${field("f-allergydetails", 'Details <span style="font-weight:400;color:var(--muted)">(optional)</span>', area("f-allergydetails", prefill.allergyDetails, "What it was, and what happened", 2))}
      <fieldset class="rr-group" style="margin-top:14px">
        <legend class="rr-sublabel" style="margin-top:0">How bad was your worst reaction?</legend>
        ${rrOption("f-allergysev", "Mild", { title: "Mild", sub: "Settled without treatment", dot: "mild" }, rrNote("Such as a small rash or itching that went away by itself."), prefill.allergySeverity === "Mild")}
        ${rrOption("f-allergysev", "Moderate", { title: "Moderate", sub: "Needed treatment", dot: "moderate" }, rrNote("Such as a reaction that needed antihistamines or a visit to a doctor."), prefill.allergySeverity === "Moderate")}
        ${rrOption("f-allergysev", "Severe / life-threatening", { title: "Severe", sub: "Needed urgent care", dot: "severe" }, rrNote("Such as swelling, trouble breathing, or emergency treatment. Your doctor will check your medication's ingredients before you start."), prefill.allergySeverity === "Severe / life-threatening")}
      </fieldset>
      ${err("f-allergysev")}
    </div>`));

  sections.push(rrSection(++step, asksGlp1
    ? "Have you or a close family member ever had cancer or a tumour, including thyroid cancer, or a condition called MEN 2?"
    : "Have you or a close family member ever had cancer or a tumour?", "A few medications aren't suitable after certain cancers, so your doctor needs to know.", `
    <fieldset class="rr-group">
      <legend class="rr-sr">Cancer or tumour history</legend>
      ${options.cancer.map((o) => rrOption("f-cancer", o, { title: o.replace("Yes - ", "Yes, ") }, "", prefill.cancer === o)).join("")}
    </fieldset>
    ${err("f-cancer")}
    <div class="fp-reveal" id="f-cancer-yes" ${prefill.cancer && prefill.cancer !== "No" ? "" : "hidden"}>
      ${field("f-cancernotes", 'Which type, and who? <span style="font-weight:400;color:var(--muted)">(optional)</span>', input("f-cancernotes", prefill.cancerNotes, 'placeholder="e.g. Breast cancer, my mother"'))}
      ${asksGlp1 ? `
      <fieldset class="rr-group" style="margin-top:14px">
        <legend class="rr-sublabel" style="margin-top:0">Was it medullary thyroid cancer (MTC), or MEN 2?</legend>
        ${rrOption("f-thyroid", "no", { title: "No" }, "")}
        ${rrOption("f-thyroid", "unsure", { title: "I'm not sure" }, rrNote("That's fine. Your doctor will go through this with you."))}
        ${rrOption("f-thyroid", "yes", { title: "Yes" }, rrNote(`Medications like this aren't used with this personal or family history. ${waitText}`, "warn"))}
      </fieldset>
      ${err("f-thyroid")}` : ""}
    </div>`));

  if (asksGlp1) {
    sections.push(rrSection(++step, "Have you ever had pancreatitis or gallbladder problems?", "This type of medication can make these conditions more likely to come back, so your doctor checks for them first.", `
      <fieldset class="rr-group">
        <legend class="rr-sr">Pancreatitis or gallbladder problems</legend>
        ${rrOption("f-pancreas", "no", { title: "No" }, "")}
        ${rrOption("f-pancreas", "pancreatitis", { title: "Pancreatitis", sub: "Inflammation of the pancreas" }, rrNote(`Medications like this are usually not used after pancreatitis. ${waitText}`, "warn"))}
        ${rrOption("f-pancreas", "gallbladder", { title: "Gallbladder problems", sub: "Such as gallstones" }, rrNote("Thank you. Your doctor will take this into account when reviewing your treatment."))}
        ${rrOption("f-pancreas", "both", { title: "Both" }, rrNote(`Medications like this are usually not used after pancreatitis. ${waitText}`, "warn"))}
      </fieldset>
      ${err("f-pancreas")}`));
  }

  // A first-timer who bought a dose above the starting dose should hear that now.
  const aboveStart = meds.filter((m) => m.category === "glp1" && m.startingDose && m.dose && m.dose !== m.startingDose);
  const firstTimeNote = aboveStart.length
    ? rrNote(`Treatment with ${esc(aboveStart[0].medication)} usually starts at ${esc(aboveStart[0].startingDose)}, and yours is ${esc(aboveStart[0].dose)}. Please wait for your doctor to confirm your starting dose before your first injection.`, "soft")
    : rrNote("Thank you. Your doctor will explain how to take your first dose.");
  sections.push(rrSection(++step, "Have you used a GLP-1 or peptide medication before?", "It tells your doctor whether your dose is the right place to start.", `
    <fieldset class="rr-group">
      <legend class="rr-sr">Previous use</legend>
      ${rrOption("f-prevuse", "No", { title: "No, this is my first time" }, firstTimeNote, prefill.prevUse === "No")}
      ${rrOption("f-prevuse", "Yes", { title: "Yes, I have" }, field("f-prevusenotes", "Which one, what dose, and when did you last take it?", area("f-prevusenotes", prefill.prevUseNotes, "e.g. Ozempic 0.5 mg, stopped in March", 2)), prefill.prevUse === "Yes")}
    </fieldset>
    ${err("f-prevuse")}`));

  sections.push(rrSection(++step, "Anything else you'd like your doctor to know?", "Optional. Questions, worries, or anything you think matters.", `
    <label class="rr-sr" for="f-notes">Anything else for your doctor</label>
    ${area("f-notes", "", "Write anything you like")}`));

  // ── the page ─────────────────────────────────────────────────────
  const intro = reason === "purchased"
    ? {
      sub: `Hi${firstName ? " " + esc(firstName) : ""}, thank you for your order.`,
      medLabel: meds.length > 1 ? "You recently purchased these" : "You recently purchased",
      why: "Since you haven't had a consultation yet, we need a few details from you to complete your file and make sure your delivery and medication follow-up are done properly.",
    }
    : {
      sub: `Hi${firstName ? " " + esc(firstName) : ""}, we're sorry you couldn't join your consultation.`,
      medLabel: meds.length > 1 ? "The medications you chose" : "The medication you chose",
      why: "These questions cover what your doctor would normally ask, so they can still review your health and look after you properly.",
    };
  const med = (m) => `
    <div class="rp-med" style="--mc:${medColor(m)}">
      <span class="rp-med-ico">${medFormIcon(m, 22)}</span>
      <div><div class="rp-med-name">${esc(m.medication)}</div><div class="rp-med-dose">${[m.dose, m.frequency].filter(Boolean).map(esc).join(" · ")}</div></div>
    </div>`;

  root.innerHTML = `${topHTML()}
    <div class="fp-progress" aria-hidden="true"><div class="fp-progress-track"><div class="fp-progress-fill" id="f-progress"></div></div></div>
    <h1 class="rp-title">Complete your details</h1>
    <p class="rp-sub">${intro.sub}</p>
    ${meds.length ? `<p class="fp-medlabel">${intro.medLabel}</p><div class="fp-meds">${meds.map(med).join("")}</div>` : ""}
    <div class="fp-intro">
      ${rrNote(esc(intro.why))}
      ${rrNote(`Your doctor reads every answer${meds.length ? " before you start your medication, so please finish this first" : ""}. Each question says why we ask. It takes about 3 minutes.`, "soft")}
    </div>
    <div class="rp-form rr-form" id="f-form">${sections.join("")}</div>
    <label class="fp-confirm">
      <input type="checkbox" id="f-confirmed">
      <span>My answers are correct to the best of my knowledge, and I'll tell my doctor if anything changes.</span>
    </label>
    ${err("f-confirmed")}
    <div class="fp-send">
      <button class="btn btn-primary btn-block" id="f-submit" type="button">Send to my doctor</button>
      <p>Your answers go only to your care team.</p>
    </div>`;

  // ── behaviour ────────────────────────────────────────────────────
  // Selecting a card marks it and opens its explanation.
  wireRefillRequestFields(root);

  const reveal = (id, show) => {
    const el = document.getElementById(id);
    if (!el || el.hidden === !show) return;
    el.hidden = !show;
    if (show) rrReveal(el);
  };
  const onPick = (name, fn) => root.querySelectorAll(`input[name="${name}"]`).forEach((r) => r.addEventListener("change", () => { if (r.checked) fn(r.value); }));
  onPick("f-medconfirm", (v) => reveal("f-medconfirm-no", v === "no"));
  onPick("f-gender", (v) => reveal("f-preg", v !== "Male"));
  onPick("f-conditionsgate", (v) => reveal("f-conditions", v === "yes"));
  onPick("f-medsgate", (v) => reveal("f-meds", v === "yes"));
  onPick("f-allergiesgate", (v) => reveal("f-allergies", v === "yes"));
  onPick("f-cancer", (v) => reveal("f-cancer-yes", v !== "No"));

  function refreshDob() {
    const age = ageFrom(text("f-dob"));
    const line = document.getElementById("f-age");
    line.hidden = age === null;
    if (age !== null) line.textContent = `That makes you ${age}.`;
    reveal("f-minor", age !== null && age < 18);
  }
  function ageFrom(dob) {
    const m = String(dob).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const t = new Date();
    let age = t.getFullYear() - Number(m[1]);
    if ((t.getMonth() + 1) * 100 + t.getDate() < Number(m[2]) * 100 + Number(m[3])) age--;
    return age >= 0 && age <= 120 ? age : null;
  }
  function refreshBmi() {
    const bmi = calcBMIClient(Number(text("f-height")), Number(text("f-weight")));
    const line = document.getElementById("f-bmi");
    const ok = bmi && bmi > 10 && bmi < 90;
    line.hidden = !ok;
    if (ok) line.textContent = `Your BMI works out at ${bmi}. Your doctor looks at this together with your health history.`;
  }
  document.getElementById("f-dob").addEventListener("input", refreshDob);
  document.getElementById("f-height").addEventListener("input", refreshBmi);
  document.getElementById("f-weight").addEventListener("input", refreshBmi);
  refreshDob();
  refreshBmi();

  // Every required answer, in page order: what's missing, where to say so.
  const checks = () => [
    reason === "purchased" && meds.length ? { id: "f-medconfirm", bad: !val("f-medconfirm"), msg: "Please confirm whether this is what you purchased." } : null,
    { id: "f-name", bad: !text("f-name"), msg: "Please enter your full name." },
    { id: "f-mobile", bad: text("f-mobile").replace(/\D/g, "").length < 7, msg: "Please enter a valid mobile number." },
    { id: "f-email", bad: !!text("f-email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text("f-email")), msg: "Please check your email address." },
    { id: "f-dob", bad: ageFrom(text("f-dob")) === null, msg: "Please enter your date of birth." },
    { id: "f-gender", bad: !val("f-gender"), msg: "Please choose one." },
    val("f-gender") && val("f-gender") !== "Male" ? { id: "f-pregnancy", bad: !val("f-pregnancy"), msg: "Please choose one." } : null,
    val("f-gender") && val("f-gender") !== "Male" ? { id: "f-breastfeeding", bad: !val("f-breastfeeding"), msg: "Please choose one." } : null,
    { id: "f-height", bad: !(Number(text("f-height")) >= 100 && Number(text("f-height")) <= 250), msg: "Please enter your height in centimetres, between 100 and 250." },
    { id: "f-weight", bad: !(Number(text("f-weight")) >= 25 && Number(text("f-weight")) <= 350), msg: "Please enter your weight in kilograms, between 25 and 350." },
    { id: "f-conditionsgate", bad: !val("f-conditionsgate"), msg: "Please choose one." },
    val("f-conditionsgate") === "yes" ? { id: "f-condition", bad: !ticked("f-condition").length && !text("f-conditionsother"), msg: "Please tick at least one, or type it under \"Anything else\"." } : null,
    { id: "f-medsgate", bad: !val("f-medsgate"), msg: "Please choose one." },
    val("f-medsgate") === "yes" ? { id: "f-medications", bad: !text("f-medications"), msg: "Please list your medications." } : null,
    { id: "f-allergiesgate", bad: !val("f-allergiesgate"), msg: "Please choose one." },
    val("f-allergiesgate") === "yes" ? { id: "f-allergytype", bad: !ticked("f-allergytype").length, msg: "Please tick at least one." } : null,
    val("f-allergiesgate") === "yes" ? { id: "f-allergysev", bad: !val("f-allergysev"), msg: "Please choose one." } : null,
    { id: "f-cancer", bad: !val("f-cancer"), msg: "Please choose one." },
    asksGlp1 && val("f-cancer") && val("f-cancer") !== "No" ? { id: "f-thyroid", bad: !val("f-thyroid"), msg: "Please choose one." } : null,
    asksGlp1 ? { id: "f-pancreas", bad: !val("f-pancreas"), msg: "Please choose one." } : null,
    { id: "f-prevuse", bad: !val("f-prevuse"), msg: "Please choose one." },
    { id: "f-confirmed", bad: !document.getElementById("f-confirmed").checked, msg: "Please tick this to confirm your answers." },
  ].filter(Boolean);

  // Progress, and clearing a question's error as soon as it's answered.
  function refresh() {
    const all = checks();
    const done = all.filter((c) => !c.bad).length;
    document.getElementById("f-progress").style.transform = `scaleX(${all.length ? done / all.length : 0})`;
    for (const c of all) {
      const e = document.getElementById("err-" + c.id);
      if (e && !c.bad) e.hidden = true;
    }
  }
  root.addEventListener("input", refresh);
  root.addEventListener("change", refresh);
  refresh();

  document.getElementById("f-submit").addEventListener("click", async (ev) => {
    const btn = ev.currentTarget;
    root.querySelectorAll(".rr-err").forEach((e) => { e.hidden = true; });
    const bad = checks().filter((c) => c.bad);
    if (bad.length) {
      for (const c of bad) {
        const e = document.getElementById("err-" + c.id);
        if (e) { e.textContent = c.msg; e.hidden = false; }
      }
      const first = document.getElementById("err-" + bad[0].id);
      if (first) first.closest(".rr-sec, .fp-confirm, main").scrollIntoView({ behavior: "smooth", block: "start" });
      const box = first && first.parentElement.querySelector("input, textarea");
      if (box && /^(TEXTAREA|INPUT)$/.test(box.tagName) && box.type !== "radio" && box.type !== "checkbox") box.focus({ preventScroll: true });
      return;
    }
    const payload = {
      name: text("f-name"), mobile: text("f-mobile"), email: text("f-email"), dob: text("f-dob"), gender: val("f-gender"),
      medConfirm: val("f-medconfirm"), medCorrection: text("f-medcorrection"),
      pregnancy: val("f-pregnancy"), breastfeeding: val("f-breastfeeding"),
      heightCm: Number(text("f-height")), weightKg: Number(text("f-weight")),
      conditionsGate: val("f-conditionsgate") === "yes", conditions: ticked("f-condition"),
      conditionsOther: text("f-conditionsother"), conditionsNotes: text("f-conditionsnotes"),
      medsGate: val("f-medsgate") === "yes", medications: text("f-medications"),
      allergiesGate: val("f-allergiesgate") === "yes", allergyTypes: ticked("f-allergytype"),
      allergyDetails: text("f-allergydetails"), allergySeverity: val("f-allergysev"),
      cancer: val("f-cancer"), cancerNotes: text("f-cancernotes"), thyroid: val("f-thyroid"), pancreas: val("f-pancreas"),
      prevUse: val("f-prevuse"), prevUseNotes: text("f-prevusenotes"),
      notes: text("f-notes"), confirmed: true,
    };
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const out = await api("POST", `/api/form/${encodeURIComponent(token)}`, payload);
      root.innerHTML = doneHTML(out.wait, String(payload.name).trim().split(/\s+/)[0]);
      window.scrollTo(0, 0);
    } catch (ex) {
      btn.disabled = false; btn.textContent = "Send to my doctor";
      toast((ex && ex.message) || "Could not send your answers. Please try again.", "bad");
    }
  });
})();
