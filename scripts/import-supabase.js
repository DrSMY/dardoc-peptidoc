// Import existing patients from the legacy Supabase backends into the new SQLite DB.
//
//   node scripts/import-supabase.js
//
// Always imports from the glp1-doctor/glp1-patient project (patients, plans,
// shot logs, check-ins, messages) — anon-readable, idempotent by mobile number.
//
// Consult-Buddy consultations live behind authenticated RLS. To also pull those,
// run with your Consult-Buddy doctor login:
//   CB_EMAIL=you@example.com CB_PASSWORD=... node scripts/import-supabase.js
//
// Newly created patients get a fresh 6-digit portal PIN, printed once at the end.

const crypto = require("node:crypto");
const { db, hashSecret } = require("../src/db");
const presets = require("../src/presets");

const GLP1_URL = "https://glyxanezsslpcoksjzwx.supabase.co";
const GLP1_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdseXhhbmV6c3NscGNva3Nqend4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NjM3MjUsImV4cCI6MjA5ODAzOTcyNX0.osEG9nLXN8-DkzkCfRniMmiyC2h0w3B3zD_A4hlPJ5c";

const CB_URL = "https://kokottennducgqcearxu.supabase.co";
const CB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtva290dGVubmR1Y2dxY2Vhcnh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODcyNzcsImV4cCI6MjA4NjU2MzI3N30.H0DfboGuhCStlxTYZXTNZbpuocd48nUZ5ls_yWRb3pA";

function normMobile(m) {
  return String(m || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "");
}

async function sb(base, key, path, bearer) {
  const res = await fetch(`${base}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${bearer || key}` },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function checkinFlag(symptoms) {
  for (const s of presets.SYMPTOMS) {
    const v = symptoms[s.key];
    if (v && s.alertOn.includes(v)) return 1;
  }
  return 0;
}

const doctorId = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get()?.id;
if (!doctorId) {
  console.error("No doctor account in DB — start the server once first.");
  if (require.main === module) process.exit(1);
}

const newPins = [];

function upsertPatient(fields) {
  const mobile = normMobile(fields.mobile);
  if (!mobile) return null;
  const existing = db.prepare("SELECT id FROM patients WHERE mobile = ?").get(mobile);
  if (existing) {
    console.log(`  = ${fields.name} (+${mobile}) already exists — skipping patient row`);
    return { id: existing.id, existed: true };
  }
  const pin = String(crypto.randomInt(100000, 1000000));
  const r = db.prepare(`INSERT INTO patients
    (doctor_id, name, mobile, pin_hash, title, age, gender, height_cm, start_weight_kg, chronic_illnesses, medications, allergies, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?, datetime('now')))`)
    .run(doctorId, fields.name, mobile, hashSecret(pin), fields.title || "", fields.age || null,
      fields.gender || "", fields.heightCm || null, fields.weightKg || null,
      fields.chronic || "", fields.meds || "", fields.allergies || "",
      fields.notes || "", fields.createdAt || null);
  newPins.push({ name: fields.name, mobile, pin });
  console.log(`  + imported ${fields.name} (+${mobile})`);
  return { id: Number(r.lastInsertRowid), existed: false };
}

// ── GLP-1 project ────────────────────────────────────────────────
async function importGlp1() {
  console.log("\n── glp1-doctor/glp1-patient project ──");
  const patients = await sb(GLP1_URL, GLP1_KEY, "patients?select=*");
  const logs = await sb(GLP1_URL, GLP1_KEY, "activity_logs?select=*&order=created_at.asc");
  const msgs = await sb(GLP1_URL, GLP1_KEY, "messages?select=*&order=created_at.asc");

  for (const p of patients) {
    const d = p.plan_data || {};
    const gender = d.sex === "M" ? "Male" : d.sex === "F" ? "Female" : "";
    const res = upsertPatient({
      name: p.name, mobile: p.mobile, age: d.age || null, gender,
      heightCm: d.height || null, weightKg: d.weight || null,
      notes: d.notes || "", createdAt: (p.created_at || "").replace("T", " ").slice(0, 19),
    });
    if (!res || res.existed) continue;
    const pid = res.id;

    // Plan from plan_data
    if (d.medName) {
      const route = d.medType === "oral" ? "oral" : "injection";
      const frequency = route === "oral" ? "daily" : "weekly";
      const diet = {};
      if (d.kcal) diet.calories = Math.round(d.kcal);
      if (d.protMin) { diet.proteinMin = d.protMin; diet.proteinMax = d.protMax || d.protMin; }
      diet.water = "2–3 L daily";
      db.prepare(`INSERT INTO plans
        (patient_id, doctor_id, category, title, medication, dose, route, frequency, half_life_hours,
         phases_json, instructions, warnings, diet_json, followup_days, next_followup, blood_test, clinical_note, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,date('now','+28 days'),?,?,COALESCE(?, datetime('now')))`)
        .run(pid, doctorId, "glp1", `${d.medName} — Weight Loss Program`, d.medName, d.dose || "",
          route, frequency, d.halfLife ? d.halfLife * 24 : null,
          JSON.stringify([{ label: "Current phase", dose: d.dose || "", weeks: "", note: "Imported from previous DarDoc GLP-1 app" }]),
          route === "oral"
            ? "Take your tablet first thing in the morning on an empty stomach with a small sip of water. Wait at least 30 minutes before eating.\nEat slowly, prioritise protein, and stay well hydrated (2–3 L daily)."
            : "Inject once weekly, on the same day each week.\nRotate injection sites: abdomen, thigh, or upper arm.\nEat slowly, prioritise protein, and stay well hydrated (2–3 L daily).",
          "Contact me promptly if you experience: severe or persistent abdominal pain, repeated vomiting or inability to keep fluids down, signs of dehydration, severe constipation lasting more than 4 days, or an allergic reaction.",
          JSON.stringify(diet), 28, d.bloodTest ? "recommended" : "none", d.notes || "",
          (p.created_at || "").replace("T", " ").slice(0, 19));
    }

    // Activity logs → dose_logs / checkins
    for (const log of logs.filter((l) => l.patient_id === p.id)) {
      const data = log.data || {};
      if (log.type === "shot") {
        const notes = [data.reaction && data.reaction !== "None" ? `Reaction: ${data.reaction}` : "", data.notes || ""].filter(Boolean).join(" · ");
        db.prepare("INSERT INTO dose_logs (patient_id, plan_id, taken_at, dose, site, notes, created_at) VALUES (?,(SELECT id FROM plans WHERE patient_id=? LIMIT 1),?,?,?,?,?)")
          .run(pid, pid, data.date || log.created_at, data.dose || "", data.site || "", notes, (log.created_at || "").replace("T", " ").slice(0, 19));
      } else if (log.type === "checkin") {
        const energyMap = { High: "Energetic", Moderate: "Normal", Low: "Tired", "Very Low": "Exhausted" };
        const symptoms = {};
        if (data.hunger) symptoms.hunger = data.hunger;
        if (data.nausea) symptoms.nausea = data.nausea;
        if (data.constipation) symptoms.constipation = data.constipation;
        if (data.mood) symptoms.mood = ["Great", "Good", "Low", "Very low"].includes(data.mood) ? data.mood : data.mood === "Very Low" ? "Very low" : data.mood;
        if (data.energy && energyMap[data.energy]) symptoms.fatigue = energyMap[data.energy];
        const extra = [data.cravings ? `Cravings: ${data.cravings}` : "", data.foodnoise ? `Food noise: ${data.foodnoise}` : "", data.notes || ""].filter(Boolean).join(" · ");
        db.prepare("INSERT INTO checkins (patient_id, plan_id, date, weight_kg, symptoms_json, notes, flagged, reviewed, created_at) VALUES (?,(SELECT id FROM plans WHERE patient_id=? LIMIT 1),?,?,?,?,?,1,?)")
          .run(pid, pid, (data.date || log.created_at).slice(0, 10), data.weight || null,
            JSON.stringify(symptoms), extra, checkinFlag(symptoms), (log.created_at || "").replace("T", " ").slice(0, 19));
      }
    }

    // Messages
    for (const m of msgs.filter((x) => x.patient_id === p.id)) {
      db.prepare("INSERT INTO messages (patient_id, sender, body, read_at, created_at) VALUES (?,?,?,?,?)")
        .run(pid, m.sender === "doctor" ? "doctor" : "patient", m.message,
          (m.sender === "doctor" ? m.read_by_patient : m.read_by_doctor) ? (m.created_at || "").replace("T", " ").slice(0, 19) : null,
          (m.created_at || "").replace("T", " ").slice(0, 19));
    }
  }
  console.log(`glp1 project: ${patients.length} patients, ${logs.length} activity logs, ${msgs.length} messages processed`);
}

// ── Consult-Buddy (optional, needs doctor login) ─────────────────
async function importConsultBuddy() {
  const email = process.env.CB_EMAIL, password = process.env.CB_PASSWORD;
  if (!email || !password) {
    console.log("\n── Consult-Buddy ──\nSkipped (RLS requires login). To import, run:\n  CB_EMAIL=you@example.com CB_PASSWORD=yourpassword node scripts/import-supabase.js");
    return;
  }
  console.log("\n── Consult-Buddy project ──");
  const auth = await fetch(`${CB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: CB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!auth.ok) { console.error(`Consult-Buddy login failed (HTTP ${auth.status}) — check CB_EMAIL/CB_PASSWORD.`); return; }
  const { access_token } = await auth.json();
  const consults = await sb(CB_URL, CB_KEY, "consultations?select=*&order=created_at.asc", access_token);
  let imported = 0;
  for (const c of consults) {
    const a = c.intake_answers || {};
    const mobile = a.mobileNumber || a.mobile || a.phone || "";
    if (!c.patient_name || !mobile) continue;
    const res = upsertPatient({
      name: c.patient_name, mobile,
      age: Number(a.age) || null, gender: a.gender || "",
      heightCm: Number(a.height) || null, weightKg: Number(a.weight) || null,
      chronic: a.chronicIllnesses || "", meds: a.medications || "", allergies: a.allergies || "",
      notes: c.doctor_notes || "", createdAt: (c.created_at || "").replace("T", " ").slice(0, 19),
    });
    if (res && !res.existed) imported++;
  }
  console.log(`Consult-Buddy: ${consults.length} consultations scanned, ${imported} new patients imported`);
}

(async () => {
  if (!doctorId) return;
  // Each source is isolated: a Supabase outage or auth failure logs and moves on,
  // never crashing the caller (the server runs this at boot when IMPORT_SUPABASE=1).
  try { await importGlp1(); } catch (e) { console.error("glp1 import failed:", e.message); }
  try { await importConsultBuddy(); } catch (e) { console.error("Consult-Buddy import failed:", e.message); }
  if (newPins.length) {
    console.log("\n════ NEW PORTAL PINs (shown once — share via WhatsApp) ════");
    for (const p of newPins) console.log(`  ${p.name.padEnd(24)} +${p.mobile.padEnd(15)} PIN: ${p.pin}`);
  }
  console.log("\nImport complete.");
})().catch((e) => console.error("Import error:", e.message));
