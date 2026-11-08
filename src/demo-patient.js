// A demonstration patient, "Mr Test": about five months on Wegovy with a
// monthly dose escalation, weekly injections and weigh-ins, side-effect
// check-ins, five refill requests with the doctor's decisions, and the
// message thread around them. It shows how a patient's file builds up over a
// course of treatment. Everything is dated back from the day it is created,
// so the history always ends "now". It has a mobile number that can't reach
// anyone and no known portal PIN; the doctor can set one from the patient page.
"use strict";
const presets = require("./presets");

const DAY = 864e5;

function seedDemoPatient(db, hashSecret, crypto) {
  const adminEmail = (process.env.ADMIN_EMAIL || "drsamimoha2018@gmail.com").toLowerCase();
  const doc = db.prepare("SELECT id, name, org_id FROM users WHERE lower(email) = ? AND org_id IS NOT NULL").get(adminEmail)
    || db.prepare("SELECT id, name, org_id FROM users WHERE org_id IS NOT NULL AND role IN ('superadmin','doctor') ORDER BY id LIMIT 1").get();
  if (!doc) return console.log("Demo patient skipped: no doctor account to attach it to.");
  const mobile = ["971000000001", "971000000002", "971000000003", "971000000004"].find((m) => !db.prepare("SELECT 1 AS x FROM patients WHERE mobile = ?").get(m));
  if (!mobile) return console.log("Demo patient skipped: no free demo number.");

  const now = new Date();
  const start = new Date(now.getTime() - 147 * DAY);
  const at = (day, hh = 9, mm = 0) => { const d = new Date(start.getTime() + day * DAY); d.setUTCHours(hh - 4, mm, 0, 0); return d; }; // UAE time
  const sql = (d) => d.toISOString().slice(0, 19).replace("T", " ");
  const ymd = (d) => d.toISOString().slice(0, 10);
  const dmy = (d) => ymd(d).split("-").reverse().join("/");

  const height = 176, age = 43, startKg = 112, goalKg = 85;
  const wegovy = presets.GLP1_MEDICATIONS.Wegovy;
  const bmr = presets.calcBMR(startKg, height, age, "Male");
  const calories = presets.weightLossCalories(bmr * 1.2);
  const proteinMin = Math.round(goalKg * 1.2), proteinMax = Math.round(goalKg * 1.5);
  const bmi = Math.round((startKg / (height / 100) ** 2) * 10) / 10;

  // Weight: steady loss, slower in the month the dose was held.
  const marks = [[0, 112.0], [28, 108.9], [56, 106.2], [84, 103.6], [112, 101.8], [140, 100.1], [147, 99.6]];
  const weightOn = (day) => {
    let i = 0;
    while (i < marks.length - 2 && day > marks[i + 1][0]) i++;
    const [d0, w0] = marks[i], [d1, w1] = marks[i + 1];
    const w = w0 + ((w1 - w0) * (day - d0)) / (d1 - d0) + Math.sin(day * 1.7) * 0.25;
    return Math.round(w * 10) / 10;
  };

  // Refills: the patient asks the evening before, the doctor decides next morning.
  const refills = [
    { day: 27, prior: "0.25mg", decided: "0.5mg", action: "increase", se: "yes", sev: "mild", kg: 108.9,
      details: "Mild nausea for a day after each injection in the first two weeks. Settled now.", notes: "Feeling good and much less hungry. Happy to go up.",
      reply: "Approved. Your next pen is Wegovy 0.5mg once weekly; keep the same injection day. Mild nausea can come back for a few days after the step up. Small, slow meals and plenty of water help. Next review in 4 weeks." },
    { day: 55, prior: "0.5mg", decided: "1mg", action: "increase", se: "yes", sev: "mild", kg: 106.2,
      details: "Some constipation in week 6, better with more water and fibre.", notes: "",
      reply: "Approved, moving you to Wegovy 1mg once weekly. Keep up the water, vegetables and daily walks for the constipation. Next review in 4 weeks." },
    { day: 83, prior: "1mg", decided: "1.7mg", action: "increase", se: "no", sev: "", kg: 103.6,
      details: "", notes: "No problems this month.",
      reply: "Great progress, 8 kg down. Approved: Wegovy 1.7mg once weekly from your next injection. Next review in 4 weeks." },
    { day: 111, prior: "1.7mg", decided: "1.7mg", action: "talk", se: "yes", sev: "moderate", kg: 101.8,
      details: "Nausea for 2–3 days after each 1.7mg dose in the first two weeks and I vomited a couple of times. Better now but still tired some days.", notes: "Not sure about going up yet.",
      reply: "Thank you for the detailed update. Let's stay on 1.7mg for one more month so your body can settle before the final step. Eat small, protein-first meals and avoid greasy food on injection days. We'll look at 2.4mg at your next review." },
    { day: 139, prior: "1.7mg", decided: "2.4mg", action: "increase", se: "yes", sev: "mild", kg: 100.1,
      details: "Occasional mild nausea, easy to manage.", notes: "Ready for the next step.",
      reply: "Approved, moving to the maintenance dose: Wegovy 2.4mg once weekly. If it isn't tolerated we can go back to 1.7mg. Next review in 4 weeks." },
  ];
  const doseOn = (day) => { let d = "0.25mg"; for (const r of refills) if (day > r.day + 1) d = r.decided; return d; };

  const severityText = {
    mild: "Mild — noticeable, but didn't disrupt their daily routine",
    moderate: "Moderate — disrupted daily activities (rest, time off or changes needed)",
  };
  const doseText = (r) => {
    const ladder = wegovy.doses, i = ladder.indexOf(r.prior);
    if (r.action === "increase") return `Increase dose${ladder[i + 1] ? ` (next step ${ladder[i + 1]})` : ""}`;
    if (r.action === "talk") return "Wants to talk to the doctor before any dose change";
    return `Keep current dose (${r.prior})`;
  };

  const emr = [
    `Date of Encounter: ${dmy(at(0))}`, "",
    "PATIENT", "",
    "Name: Test", `Age: ${age} years`, "Gender: Male", `Height: ${height} cm`, `Weight: ${startKg} kg`, `BMI: ${bmi} kg/m²`,
    "Chronic Illnesses: Prediabetes", "Current Medications: None reported", "Allergies: No known drug allergies", "Cancer / Tumor History: No", "",
    "CLINICAL SUMMARY", "",
    `Mr. Test is a ${age}-year-old male with obesity Class II (BMI ${bmi} kg/m²) and prediabetes. There is no prior history of GLP-1/peptide medication use. He reports no known drug allergies. There are no identified contraindications to GLP-1 receptor agonist therapy.`, "",
    `Based on the current assessment, a daily caloric intake target of ≤${calories} kcal/day was recommended, and a protein intake goal of ${proteinMin}–${proteinMax} g/day was set. Lifestyle modification, dietary optimization, physical activity, realistic weight-loss expectations, and treatment goals were discussed.`, "",
    "MEDICATION PRESCRIBED", "",
    "Wegovy (semaglutide) 0.25mg once weekly", "",
    "The patient was counseled regarding expected benefits, common side effects, injection technique, adherence, and the importance of reporting any adverse effects promptly.", "",
    "INVESTIGATIONS", "",
    "Weight Loss Blood Test Panel (recommended, fasting).", "",
    "PLAN", "",
    `Follow-up appointment scheduled for ${dmy(at(28))}.`, "",
    "Assess response, tolerance, and compliance at follow-up.",
    "Consider dose titration if treatment is well tolerated.",
    "Continue monitoring weight, appetite, and any medication-related side effects.", "",
    "Physician:", doc.name, "DarDoc Healthcare",
  ].join("\n");

  const panel = presets.WEIGHT_LOSS_PANEL;
  const flags = (presets.GLP1_ELIGIBILITY && presets.GLP1_ELIGIBILITY.redFlags) || [];
  const warnings = `Contact me promptly if you experience:\n- ${flags.join("\n- ")}\nMild nausea, softer stools and reduced appetite are common in the first weeks and usually settle.`;
  const lastRefill = refills[refills.length - 1];

  const msg = db.prepare("INSERT INTO messages (patient_id, sender, body, read_at, created_at, sender_user_id) VALUES (?,?,?,?,?,?)");

  db.exec("BEGIN");
  try {
    const patientId = Number(db.prepare(`INSERT INTO patients
      (doctor_id, org_id, name, mobile, pin_hash, title, age, dob, gender, height_cm, start_weight_kg, current_weight_kg, max_weight_kg, goal_weight_kg,
       activity_level, chronic_illnesses, medications, allergies, notes, intake_json, email, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      doc.id, doc.org_id, "Test", mobile, hashSecret(crypto.randomBytes(16).toString("hex")), "Mr", age, `${now.getUTCFullYear() - age}-03-12`, "Male",
      height, startKg, weightOn(143), startKg, goalKg, "Sedentary", "Prediabetes", "", "",
      "Demonstration patient: sample data showing a five-month Wegovy course. Not a real person.",
      JSON.stringify({ body_shape: "Central/Abdominal fat dominant", health_goals: ["Weight loss"], health_conditions__gate: true, health_conditions: ["Prediabetes"], allergies__gate: false, cancer_history: "No", previous_glp1: "No" }),
      "mr.test@example.com", sql(at(0, 9, 5))).lastInsertRowid);

    const planId = Number(db.prepare(`INSERT INTO plans
      (patient_id, doctor_id, status, category, title, medication, dose, route, frequency, half_life_hours, phases_json, instructions, warnings, diet_json,
       followup_days, next_followup, blood_test, clinical_note, clinical_suggestion, quantity, needs_refill, first_dose_at, lab_tests_json, supplements_json,
       last_edited_by, last_edited_at, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      patientId, doc.id, "active", "glp1", "Wegovy — Weight Loss Program", "Wegovy", lastRefill.decided, "injection", "weekly", wegovy.halfLifeHours,
      JSON.stringify([{ label: "Starting dose", dose: "0.25mg", weeks: 4, note: "1-month starting supply — review and adjust at follow-up" }]),
      `${wegovy.administration}\nEat slowly, stop when comfortably full, and prioritise protein at every meal.\nStay well hydrated (2–3 L water daily).`,
      warnings,
      JSON.stringify({ water: "2–3 L daily", plate: { protein: "40–50%", fibre: "40–50%", carbs: "Less than 20%" }, proteinMin, proteinMax, proteinBasis: "goal", proteinBasisKg: goalKg, calories }),
      28, ymd(at(lastRefill.day + 1 + 28)), "recommended", "", emr, 1, 0, at(1, 20, 30).toISOString(),
      JSON.stringify(panel ? [{ name: panel.name, detail: panel.detail, link: panel.link, fasting: !!panel.fasting, required: false }] : []), "[]",
      doc.id, sql(at(lastRefill.day + 1, 9, 10)), sql(at(0, 10, 15)), sql(at(lastRefill.day + 1, 9, 10))).lastInsertRowid);

    // Weekly injections, the evening after the consultation onwards; one taken a day late.
    const sites = ["Lower right abdomen", "Lower left abdomen", "Right thigh", "Left thigh", "Upper right abdomen", "Upper left abdomen", "Right arm", "Left arm"];
    const dose = db.prepare("INSERT INTO dose_logs (patient_id, plan_id, taken_at, dose, site, notes, created_at) VALUES (?,?,?,?,?,?,?)");
    for (let k = 0; 1 + 7 * k <= 145; k++) {
      const late = k === 9;
      const day = 1 + 7 * k + (late ? 1 : 0);
      const t = at(day, 20, 30);
      dose.run(patientId, planId, t.toISOString(), doseOn(day), sites[k % sites.length], late ? "Took it a day late, travelling." : "", sql(t));
    }

    // Weekly check-ins two days after each injection: weight and how he's feeling.
    const base = { hunger: "Low", nausea: "None", vomiting: "None", constipation: "None", diarrhea: "None", fatigue: "Normal", dizziness: "None", injectionSite: "None", abdominalPain: "None" };
    const weekly = {
      0: { nausea: "Mild" }, 1: { nausea: "Mild" }, 4: { nausea: "Mild" }, 5: { constipation: "Mild" }, 6: { constipation: "Mild" },
      8: { nausea: "Mild", constipation: "Mild", hunger: "Absent" }, 9: { constipation: "Mild" }, 11: { injectionSite: "Redness" },
      12: { nausea: "Moderate", vomiting: "Few times", fatigue: "Tired", hunger: "Absent" }, 13: { nausea: "Moderate", fatigue: "Tired" },
      14: { nausea: "Mild" }, 18: { fatigue: "Energetic" }, 20: { nausea: "Mild" },
    };
    const notes = {
      0: "First week. A bit queasy the day after the injection.",
      12: "Nauseous for two days after the first 1.7mg dose, vomited a couple of times. Better today.",
      18: "Walking 8,000 steps most days now.",
    };
    const checkin = db.prepare("INSERT INTO checkins (patient_id, plan_id, date, weight_kg, symptoms_json, notes, flagged, reviewed, created_at) VALUES (?,?,?,?,?,?,?,?,?)");
    for (let k = 0; 3 + 7 * k <= 145; k++) {
      const day = 3 + 7 * k;
      const symptoms = { ...base, ...(weekly[k] || {}) };
      const flagged = presets.SYMPTOMS.some((s) => (s.alertOn || []).includes(symptoms[s.key])) ? 1 : 0;
      checkin.run(patientId, planId, ymd(at(day)), weightOn(day), JSON.stringify(symptoms), notes[k] || "", flagged, 1, sql(at(day, 19, 45)));
    }

    // Welcome, and an early question about nausea.
    msg.run(patientId, "doctor", "Welcome to your treatment, Mr Test. Your guide is ready. Take your first Wegovy 0.25mg injection tomorrow evening and log it in the app. Message me any time.", sql(at(0, 11)), sql(at(0, 10, 30)), doc.id);
    msg.run(patientId, "patient", "Had some mild nausea today after the first injection. Is that normal?", sql(at(3, 21)), sql(at(3, 20, 5)), null);
    msg.run(patientId, "doctor", "Yes, that's common at the start and usually settles within a few days. Eat small meals slowly, stop when you're comfortably full and sip water through the day. Let me know if it gets worse.", sql(at(3, 21, 30)), sql(at(3, 21)), doc.id);

    const refill = db.prepare(`INSERT INTO refill_requests
      (plan_id, patient_id, source, status, side_effects, weight_kg, results_felt, dose_action, requested_dose, notes, prior_dose, decided_dose, quantity,
       decided_by, decided_at, created_at, has_side_effects, side_effect_severity, prior_medication, decided_medication)
      VALUES (?,?,'patient','approved',?,?,'',?,'',?,?,?,1,?,?,?,?,?,'Wegovy','Wegovy')`);
    const refillWeight = db.prepare("INSERT INTO checkins (patient_id, plan_id, date, weight_kg, symptoms_json, notes, flagged, reviewed, created_at) VALUES (?,?,?,?,'{}',?,0,1,?)");
    for (const r of refills) {
      const asked = at(r.day, 18, 40), decided = at(r.day + 1, 9, 10);
      refill.run(planId, patientId, r.details, r.kg, r.action, r.notes, r.prior, r.decided, doc.id, sql(decided), sql(asked), r.se, r.sev);
      refillWeight.run(patientId, planId, ymd(asked), r.kg, "Reported with refill request (Wegovy)", sql(asked));
      const summary = [
        `Refill request — Wegovy ${r.prior}`, `Test · Patient no. ${patientId} · Mobile +${mobile}`, "",
        `Weight: ${r.kg} kg`,
        r.se === "yes" ? `Side effects: ${severityText[r.sev]}` : "Side effects: None",
        r.details ? `Details: ${r.details}` : "",
        `Next dose: ${doseText(r)}`,
        r.notes ? `Message: ${r.notes}` : "",
      ].filter((l, i) => l !== "" || i === 2).join("\n");
      msg.run(patientId, "patient", summary, sql(decided), sql(asked), null);
      msg.run(patientId, "doctor", r.reply, sql(at(r.day + 1, 12)), sql(at(r.day + 1, 9, 12)), doc.id);
    }

    // The hard week at 1.7mg.
    msg.run(patientId, "patient", "Felt quite sick for two days after the 1.7mg dose and vomited a couple of times. Better today.", sql(at(87, 20)), sql(at(87, 19, 30)), null);
    msg.run(patientId, "doctor", "Thanks for telling me. Keep sipping fluids and eat small, bland, protein-first meals for the next few days. If you can't keep fluids down or have severe stomach pain, seek urgent care. We'll review at your next refill.", sql(at(88, 10)), sql(at(88, 8, 45)), doc.id);

    db.exec("COMMIT");
    console.log(`Demo patient "Mr Test" created (patient no. ${patientId}, ${doc.name}).`);
  } catch (err) {
    db.exec("ROLLBACK");
    console.error("Demo patient not created:", err.message);
  }
}

module.exports = { seedDemoPatient };
