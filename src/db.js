// SQLite database layer — zero dependencies (node:sqlite).
const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const presets = require("./presets");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "peptidoc.sqlite"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'doctor',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  mobile TEXT NOT NULL UNIQUE,
  pin_hash TEXT,
  title TEXT DEFAULT '',
  age INTEGER,
  gender TEXT DEFAULT '',
  height_cm REAL,
  start_weight_kg REAL,
  activity_level TEXT DEFAULT 'Sedentary',
  chronic_illnesses TEXT DEFAULT '',
  medications TEXT DEFAULT '',
  allergies TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active',       -- active | completed | stopped
  category TEXT NOT NULL DEFAULT 'custom',     -- glp1 | peptide | custom
  title TEXT NOT NULL,
  medication TEXT NOT NULL,
  dose TEXT DEFAULT '',
  route TEXT DEFAULT 'injection',              -- injection | oral | nasal | topical
  frequency TEXT DEFAULT 'weekly',             -- weekly | daily | every 3 days | custom...
  half_life_hours REAL,
  phases_json TEXT DEFAULT '[]',               -- titration/schedule phases
  instructions TEXT DEFAULT '',
  warnings TEXT DEFAULT '',
  diet_json TEXT DEFAULT '{}',                 -- {calories, proteinMin, proteinMax}
  followup_days INTEGER DEFAULT 28,
  next_followup TEXT,
  blood_test TEXT DEFAULT 'none',              -- none | recommended | required
  clinical_note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  config_json TEXT NOT NULL DEFAULT '{}',
  builtin INTEGER NOT NULL DEFAULT 0,
  is_customized INTEGER NOT NULL DEFAULT 0,    -- edited via super admin panel — never re-seeded from presets.js
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS peptide_info (
  name TEXT PRIMARY KEY,
  data_json TEXT NOT NULL DEFAULT '{}',        -- clinical + patient-facing fields (see src/presets.js PEPTIDE_INFO shape)
  is_customized INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS health_goal_peptides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal TEXT NOT NULL,
  peptide_name TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Secondary',  -- Primary | Secondary
  is_customized INTEGER NOT NULL DEFAULT 0,
  UNIQUE(goal, peptide_name)
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dose_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  plan_id INTEGER REFERENCES plans(id),
  taken_at TEXT NOT NULL,
  dose TEXT DEFAULT '',
  site TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  plan_id INTEGER REFERENCES plans(id),
  date TEXT NOT NULL,
  weight_kg REAL,
  symptoms_json TEXT DEFAULT '{}',
  notes TEXT DEFAULT '',
  flagged INTEGER NOT NULL DEFAULT 0,
  reviewed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  sender TEXT NOT NULL,                        -- doctor | patient
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                          -- doctor | patient
  ref_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plans_patient ON plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_doses_patient ON dose_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_checkins_patient ON checkins(patient_id);
CREATE INDEX IF NOT EXISTS idx_msgs_patient ON messages(patient_id);
`);

// Idempotent column additions for DBs created before these fields existed
// (production disk already holds a schema — ADD COLUMN is a no-op if present).
function addColumn(table, col, def) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch { /* already exists */ }
}
addColumn("patients", "intake_json", "TEXT DEFAULT '{}'");        // structured intake answers
addColumn("patients", "national_id", "TEXT DEFAULT ''");          // Emirates ID / passport number (optional)
addColumn("patients", "email", "TEXT DEFAULT ''");                // optional — identity alongside/instead of mobile
addColumn("plans", "clinical_suggestion", "TEXT DEFAULT ''");     // auto-generated EMR record
addColumn("plans", "supplements", "TEXT DEFAULT ''");             // optional supplements list
addColumn("plans", "quantity", "INTEGER DEFAULT 1");              // pens/units dispensed for this program
addColumn("plans", "needs_refill", "INTEGER DEFAULT 0");          // patient flagged "finished my injection" — doctor should reorder
addColumn("plans", "refill_requested_at", "TEXT");
addColumn("plans", "first_dose_at", "TEXT");                      // cached from the first dose_logs row — drives the active-window calc
addColumn("plans", "lab_tests_json", "TEXT DEFAULT '[]'");        // chosen lab tests [{name, detail, fasting, required, link}] — shown in the guide
addColumn("plans", "supplements_json", "TEXT DEFAULT '[]'");      // chosen supplements [{name, dose, benefit}] — shown in the guide
addColumn("templates", "is_customized", "INTEGER NOT NULL DEFAULT 0"); // edited via super admin panel
// Staff identity — every clinical document is signed by the clinician who
// wrote it, not by whoever is looking at it, so the signature travels with
// the user record.
addColumn("users", "credentials", "TEXT DEFAULT ''");             // "MBBS, MSc" — printed under the name
addColumn("users", "signature", "TEXT DEFAULT ''");               // extra signature lines (licence no., department)
addColumn("users", "clinic", "TEXT DEFAULT ''"); // organisation line on the note footer — blank falls back to the user's org name, never a hardcoded practice
addColumn("users", "active", "INTEGER NOT NULL DEFAULT 1");       // deactivated staff keep their history but cannot sign in
addColumn("messages", "sender_user_id", "INTEGER");               // which clinician wrote it — the patient sees their name
addColumn("plans", "last_edited_by", "INTEGER");                  // who last revised a published program
addColumn("plans", "last_edited_at", "TEXT");

// ── organisations ───────────────────────────────────────────────
// The app serves more than one practice. An organisation owns its staff and
// its patients, and sees nothing of any other organisation's. The clinical
// library (protocols, peptide info, knowledge base) stays shared — it is
// the prescriber's guidebook, not anyone's patient data.
db.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  contact_email TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
addColumn("users", "org_id", "INTEGER");
addColumn("users", "platform_admin", "INTEGER NOT NULL DEFAULT 0"); // may create organisations and cross into any of them
addColumn("patients", "org_id", "INTEGER");
// The organisation's own patient-facing app/subscription product, if it has
// one — e.g. "DarDoc App". No default (stays NULL until set), specifically
// so "never configured" (NULL) stays distinguishable from "a super admin
// deliberately cleared it" (empty string) — see the one-time seed below,
// which must only ever fire for the former.
addColumn("organizations", "app_name", "TEXT");
db.exec("CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_patients_org ON patients(org_id);");

// ── weight tracking ─────────────────────────────────────────────
// `start_weight_kg` is the weight recorded when the patient was first
// registered and is never overwritten afterwards. `current_weight_kg` is
// updated at each consultation. Both `max_weight_kg` and `goal_weight_kg`
// are optional, doctor-entered fields — the wizard suggests a goal weight
// (the weight for a BMI of 25) but never requires one.
addColumn("patients", "current_weight_kg", "REAL");
addColumn("patients", "max_weight_kg", "REAL");
addColumn("patients", "goal_weight_kg", "REAL");
// A patient's age is either typed in or derived from a date of birth. When a
// DOB is on file the API always reports the *current* age computed from it,
// so the record never goes stale; `age` is only the stored fallback.
addColumn("patients", "dob", "TEXT");

// ── incomplete consultations ("save for later") ──────────────────
// A snapshot of the wizard's in-memory state, so a consultation that can't
// be finished in one sitting isn't lost — nothing here touches the real
// patients/plans tables until the doctor actually publishes.
db.exec(`
CREATE TABLE IF NOT EXISTS wizard_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL REFERENCES users(id),
  org_id INTEGER,
  label TEXT DEFAULT '',
  state_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_drafts_org ON wizard_drafts(org_id);`);
// What the Drafts list shows so an unfinished file can be told apart at a
// glance: which step it stopped on, and the patient's mobile.
addColumn("wizard_drafts", "progress", "TEXT DEFAULT ''");
addColumn("wizard_drafts", "mobile", "TEXT DEFAULT ''");

// ── organisation logo ────────────────────────────────────────────
// The clinic's own logo replaces any house branding on the patient guide.
// The image lives in its own table so that `SELECT * FROM organizations`
// (used by list screens) never drags image bytes along; `logo_version` is
// the cache-busting stamp on the image URL (0 = no logo).
addColumn("organizations", "logo_version", "INTEGER NOT NULL DEFAULT 0");
db.exec(`
CREATE TABLE IF NOT EXISTS org_logos (
  org_id INTEGER PRIMARY KEY REFERENCES organizations(id),
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

// ── shareable guide links ────────────────────────────────────────
// A private, unguessable link a doctor sends over WhatsApp. It opens the
// patient's current active guide as a web page — no sign-in — and can be
// reopened until it expires or the doctor disables it.
db.exec(`
CREATE TABLE IF NOT EXISTS guide_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_guide_links_patient ON guide_links(patient_id);`);

// ── refill requests / updates ─────────────────────────────────────
// Every refill is logged here, whether the doctor records it directly in
// clinic or a patient asks for it through their guide link or portal. A
// patient-submitted request starts 'pending' until the doctor reviews it; a
// doctor-entered refill is logged already 'approved', since the doctor is
// the one deciding on the spot. This is the patient's refill history — a log
// of updates, not a new consultation record.
db.exec(`
CREATE TABLE IF NOT EXISTS refill_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  source TEXT NOT NULL DEFAULT 'doctor',        -- doctor | patient
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | approved | declined
  side_effects TEXT DEFAULT '',                 -- free-text details (always optional)
  weight_kg REAL,
  results_felt TEXT DEFAULT '',                 -- peptide programs: how it's working
  dose_action TEXT DEFAULT '',                  -- glp1 programs: increase | decrease | same | custom | talk
  requested_dose TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  prior_dose TEXT DEFAULT '',
  decided_dose TEXT DEFAULT '',
  quantity INTEGER,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_refill_requests_patient ON refill_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_refill_requests_plan ON refill_requests(plan_id);`);
// The structured version of the side-effects question (yes/no, then
// severity) — `side_effects` stays the free-text "anything else" box, always
// optional and shown regardless of the yes/no answer.
addColumn("refill_requests", "has_side_effects", "TEXT DEFAULT ''");     // 'yes' | 'no'
addColumn("refill_requests", "side_effect_severity", "TEXT DEFAULT ''"); // 'mild' | 'moderate' | 'severe'

// ── dedicated refill links ─────────────────────────────────────────
// A separate shareable link just for requesting a refill — distinct from the
// guide link, so it can be sent on its own (e.g. "time for your refill?")
// without pointing the patient at the whole treatment guide. Same
// unguessable-token pattern as guide_links.
db.exec(`
CREATE TABLE IF NOT EXISTS refill_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_refill_links_patient ON refill_links(patient_id);`);
// What a refill changed when the doctor switched the medication itself.
addColumn("refill_requests", "prior_medication", "TEXT DEFAULT ''");
addColumn("refill_requests", "decided_medication", "TEXT DEFAULT ''");

// ── visits without a medication ─────────────────────────────────────
// A consultation that ends with nothing prescribed still produces a record
// and a patient guide (diet plan, why medication could help). There is no
// program row to hang those on, so they live here.
db.exec(`
CREATE TABLE IF NOT EXISTS visit_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER NOT NULL REFERENCES users(id),
  clinical_note TEXT DEFAULT '',
  clinical_suggestion TEXT DEFAULT '',
  diet_json TEXT NOT NULL DEFAULT '{}',
  goals_json TEXT NOT NULL DEFAULT '[]',
  medication_why TEXT DEFAULT '',
  advice TEXT DEFAULT '',
  lab_tests_json TEXT NOT NULL DEFAULT '[]',
  supplements_json TEXT NOT NULL DEFAULT '[]',
  next_followup TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_visit_records_patient ON visit_records(patient_id);`);

// ── patient information forms ─────────────────────────────────────
// For someone who bought their medication before any consultation, or who
// couldn't join one: the team sends a private link and the patient fills in
// their own details. Nothing here is a prescription — the answers wait for a
// doctor, who reviews them in a pre-filled consultation and publishes from
// there. `patient_id` is set straight away for a known patient, otherwise on
// submission; `new_patient` marks a record the form itself created.
db.exec(`
CREATE TABLE IF NOT EXISTS patient_forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id),
  patient_id INTEGER REFERENCES patients(id),
  new_patient INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'purchased',     -- purchased | missed
  status TEXT NOT NULL DEFAULT 'sent',          -- sent | submitted | completed | cancelled
  mobile TEXT DEFAULT '',
  email TEXT DEFAULT '',
  label TEXT DEFAULT '',                        -- the patient's name, for lists
  prefill_json TEXT NOT NULL DEFAULT '{}',      -- what the practice already knows, for the patient to confirm
  meds_json TEXT NOT NULL DEFAULT '[]',         -- [{templateId, medication, category, route, frequency, dose, protocolKey}]
  answers_json TEXT,
  flags_json TEXT NOT NULL DEFAULT '[]',        -- [{level: urgent|review, text}], worked out on the server
  urgent INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  submitted_at TEXT,
  completed_at TEXT,
  completed_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_patient_forms_org ON patient_forms(org_id, status);
CREATE INDEX IF NOT EXISTS idx_patient_forms_patient ON patient_forms(patient_id);`);
// So reopening a form's review resumes the same draft instead of starting another.
addColumn("wizard_drafts", "form_id", "INTEGER");

// ── GLP-1 patient-education video links ──────────────────────────
// Optional, per-medication URL the doctor pastes in from the admin panel —
// never guessed or auto-filled — shown in the guide only once set.
db.exec(`
CREATE TABLE IF NOT EXISTS glp1_video_links (
  medication TEXT PRIMARY KEY,
  url TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);

// Everything that existed before organisations belongs to the practice that
// has been using the app: DarDoc Healthcare becomes organisation 1 and adopts
// every existing user and patient. Runs once — afterwards nothing is orphaned.
function seedOrganizations() {
  const DEFAULT_ORG = process.env.DEFAULT_ORG_NAME || "DarDoc Healthcare";
  let org = db.prepare("SELECT * FROM organizations WHERE slug = 'dardoc'").get();
  if (!org) {
    db.prepare("INSERT INTO organizations (name, slug) VALUES (?, 'dardoc')").run(DEFAULT_ORG);
    org = db.prepare("SELECT * FROM organizations WHERE slug = 'dardoc'").get();
    console.log(`Seeded default organisation: ${org.name}`);
  }
  // DarDoc Healthcare's real patient app — set once here since it's a known
  // fact about this specific organisation, not something to guess for every
  // install. Only ever fires while app_name is still NULL (truly never
  // configured); once a super admin sets or deliberately clears it from the
  // Organisations page, this never overwrites their choice again.
  if (org.app_name == null && org.slug === "dardoc") {
    db.prepare("UPDATE organizations SET app_name = 'DarDoc App' WHERE id = ?").run(org.id);
    org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(org.id);
  }
  const orphanUsers = db.prepare("UPDATE users SET org_id = ? WHERE org_id IS NULL").run(org.id).changes;
  const orphanPatients = db.prepare("UPDATE patients SET org_id = ? WHERE org_id IS NULL").run(org.id).changes;
  if (orphanUsers || orphanPatients) {
    console.log(`Adopted into ${org.name}: ${orphanUsers} user(s), ${orphanPatients} patient(s)`);
  }
  // Whoever set the app up keeps the keys to the platform itself.
  const adminEmail = (process.env.ADMIN_EMAIL || "drsamimoha2018@gmail.com").toLowerCase();
  db.prepare("UPDATE users SET platform_admin = 1 WHERE email = ? AND role = 'superadmin'").run(adminEmail);
  return org;
}
// Called after seed() below, so the super admin it creates on a fresh
// install is adopted too.

// ── password / pin hashing (scrypt) ─────────────────────────────
function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(secret), salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifySecret(secret, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(secret), salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
}

// ── seed ─────────────────────────────────────────────────────────
function seed() {
  // Dr. Sami's own account is the super admin — one login for both running
  // consultations and managing clinical protocols/knowledge base. Fresh
  // databases get it seeded directly as 'superadmin'; a database seeded
  // before the super admin panel existed gets promoted once (and its
  // password reset to the value below) the first time this code runs
  // against it — after that one-time promotion it's left alone so a later
  // password change (via Settings) is never clobbered on reboot.
  const adminEmail = (process.env.ADMIN_EMAIL || "drsamimoha2018@gmail.com").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "Drsami@1985";
  const existingAdmin = db.prepare("SELECT * FROM users WHERE email = ?").get(adminEmail);
  if (!existingAdmin) {
    db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)")
      .run(adminEmail, hashSecret(adminPassword), "Dr. Sami", "superadmin");
    console.log(`Seeded super admin account: ${adminEmail}`);
  } else if (existingAdmin.role !== "superadmin") {
    db.prepare("UPDATE users SET role = 'superadmin', password_hash = ? WHERE id = ?")
      .run(hashSecret(adminPassword), existingAdmin.id);
    console.log(`Promoted ${adminEmail} to super admin (password reset)`);
  }

  // Builtin templates/peptide-info/health-goal-mappings mirror src/presets.js
  // — upserted by name on every boot so code-pushed clinical-data updates
  // propagate to existing databases, EXCEPT rows the super admin panel has
  // customized (is_customized = 1), which are left untouched forever.
  const findBuiltin = db.prepare("SELECT id, is_customized FROM templates WHERE name = ? AND builtin = 1");
  const insertTpl = db.prepare("INSERT INTO templates (name, category, config_json, builtin) VALUES (?,?,?,1)");
  const updateTpl = db.prepare("UPDATE templates SET category = ?, config_json = ? WHERE id = ?");
  const upsertBuiltin = (name, category, config) => {
    const existing = findBuiltin.get(name);
    if (existing && existing.is_customized) return;
    const configJson = JSON.stringify(config);
    if (existing) updateTpl.run(category, configJson, existing.id);
    else insertTpl.run(name, category, configJson);
  };
  for (const [med, cfg] of Object.entries(presets.GLP1_MEDICATIONS)) {
    upsertBuiltin(med, "glp1", {
      medication: med,
      generic: cfg.generic,
      route: cfg.route,
      frequency: cfg.frequency,
      halfLifeHours: cfg.halfLifeHours,
      doses: cfg.doses,
      titration: cfg.titration,
      administration: cfg.administration,
    });
  }
  for (const [pep, protocols] of Object.entries(presets.PEPTIDE_PROTOCOLS)) {
    upsertBuiltin(pep, "peptide", { medication: pep, protocols });
  }

  const findInfo = db.prepare("SELECT is_customized FROM peptide_info WHERE name = ?");
  const upsertInfo = db.prepare(`
    INSERT INTO peptide_info (name, data_json) VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET data_json = excluded.data_json, updated_at = datetime('now')`);
  for (const [name, info] of Object.entries(presets.PEPTIDE_INFO)) {
    const existing = findInfo.get(name);
    if (existing && existing.is_customized) continue;
    upsertInfo.run(name, JSON.stringify(info));
  }

  // Insert any (goal, peptide) pairs added in code that the DB doesn't have
  // yet — OR IGNORE keeps every existing row (including customized ones).
  const insertGoal = db.prepare("INSERT OR IGNORE INTO health_goal_peptides (goal, peptide_name, priority) VALUES (?,?,?)");
  for (const [goal, list] of Object.entries(presets.HEALTH_GOAL_PEPTIDES)) {
    for (const item of list) insertGoal.run(goal, item.name, item.priority);
  }

  seedKnowledgeBase();
}

// ── knowledge base auto-seed ─────────────────────────────────────
// Publish every GLP-1 medication and peptide's clinical reference into the
// doctor-facing knowledge base, organized by category. Articles are keyed by
// title and only inserted when missing, so anything the super admin edits or
// deletes stays untouched on later boots.
function seedKnowledgeBase() {
  const exists = db.prepare("SELECT id FROM kb_articles WHERE title = ?");
  const insert = db.prepare("INSERT INTO kb_articles (title, category, body) VALUES (?,?,?)");
  const put = (title, category, body) => { if (!exists.get(title)) insert.run(title, category, body); };

  for (const [med, cfg] of Object.entries(presets.GLP1_MEDICATIONS)) {
    const info = presets.GLP1_INFO[med] || {};
    const block = (label, v) => (v && String(v).trim()) ? `${label}:\n${v}` : null;
    const lines = [
      `Generic: ${cfg.generic}`,
      `Route: ${cfg.route} · Frequency: ${cfg.frequency}`,
      cfg.halfLifeHours ? `Half-life: ~${cfg.halfLifeHours} hours` : null,
      `Dose ladder: ${(cfg.doses || []).join(" → ")}`,
      "",
      "Titration schedule:",
      ...(cfg.titration || []).map((t) => `• ${t.dose} — ${t.weeks ? `${t.weeks} week${t.weeks == 1 ? "" : "s"}` : "ongoing"}${t.note ? ` (${t.note})` : ""}`),
      "",
      cfg.administration ? `Administration:\n${cfg.administration}` : null,
      "",
      block("How it works", info.howItWorks),
      block("Best use for", info.bestUseFor),
      block("Target benefits", info.targetBenefits),
      block("Common side effects", info.commonSideEffects),
      block("Key blood tests", info.keyBloodTests),
      block("Contraindications", info.contraindications),
    ].filter((l) => l !== null);
    put(`${med} (${cfg.generic})`, "GLP-1 Medications", lines.join("\n"));
  }

  // Complete GLP-1 nutrition guide (extracted from the DarDoc patient-guides
  // master document by the same parser that generates public/patient-guides.js).
  const nutriPath = path.join(__dirname, "nutrition-guide.txt");
  if (fs.existsSync(nutriPath)) {
    put("Complete Nutrition Guide — GLP-1 Weight Management", "GLP-1 Medications", fs.readFileSync(nutriPath, "utf8"));
  }

  for (const [name, info] of Object.entries(presets.PEPTIDE_INFO)) {
    const cat = (info.categories && info.categories[0]) ? `Peptides — ${info.categories[0]}` : "Peptides";
    const block = (label, v) => (v && String(v).trim()) ? `${label}:\n${Array.isArray(v) ? v.map((x) => `• ${x}`).join("\n") : v}` : null;
    const protocols = (presets.PEPTIDE_PROTOCOLS[name] || [])
      .map((p) => `• ${p.protocolType}: ${p.doseVolume || p.doseAmount} — ${p.time} (${p.strength}; vial lasts ${p.duration}; cycle: ${p.cycle})`)
      .join("\n");
    const body = [
      block("How it works", info.howItWorks),
      block("Best use for", info.bestUseFor),
      block("Target benefits", info.targetBenefits),
      block("Dosage", info.dosageInstructions),
      block("Route", info.administrationRoute),
      block("Strength / volume", info.strengthVolume),
      block("Treatment duration", info.treatmentDuration),
      protocols ? `Dosing protocols:\n${protocols}` : null,
      block("Contraindications", info.contraindications),
      block("Common side effects", info.commonSideEffects),
      block("Key blood tests", info.keyBloodTests),
      block("Possible combinations", info.possibleCombinations),
      block("Recommended supplements", info.recommendedSupplements),
      block("Red flags", info.redFlags),
      block("Lifestyle tips", info.lifestyleTips),
    ].filter(Boolean).join("\n\n");
    put(name, cat, body || "See peptide clinical info in the consultation wizard.");
  }
}

// ── one-time data changes ──────────────────────────────────────────
// Each runs once per database, so a later edit (say, renaming someone again
// from the Team page) is never overwritten on the next boot.
db.exec("CREATE TABLE IF NOT EXISTS data_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));");
function once(name, fn) {
  if (db.prepare("SELECT 1 AS x FROM data_migrations WHERE name = ?").get(name)) return;
  fn();
  db.prepare("INSERT INTO data_migrations (name) VALUES (?)").run(name);
}

// "25mg" was part of the Wegovy Pill's description, so it showed beside every
// dose, including 1.5mg. Knowledge-base articles are keyed by title, so the
// existing one is renamed here or seeding would add a second copy.
once("wegovy-pill-remove-25mg-label", () => {
  const before = "oral semaglutide 25mg (SNAC absorption enhancer)";
  const after = "oral semaglutide (SNAC absorption enhancer)";
  db.prepare("UPDATE kb_articles SET title = replace(title, ?, ?), body = replace(body, ?, ?) WHERE title LIKE 'Wegovy Pill (%'").run(before, after, before, after);
  db.prepare("UPDATE templates SET config_json = replace(config_json, ?, ?)").run(before, after);
  db.prepare("UPDATE plans SET clinical_suggestion = replace(clinical_suggestion, ?, ?) WHERE medication = 'Wegovy Pill'").run(before, after);
});

// Only when exactly one account matches, so nobody else can be renamed by
// mistake; otherwise the log says so and it can be done from the Team page.
once("rename-dr-marwa-abuaita", () => {
  const rows = db.prepare("SELECT id, name FROM users").all().filter((u) => /\bmarwa\b/i.test(u.name));
  if (rows.length !== 1) return console.log(`Dr Marwa rename skipped: ${rows.length} matching staff account(s).`);
  const name = rows[0].name.replace(/\b(marwa)\b.*$/i, "$1 Abuaita");
  db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, rows[0].id);
  console.log(`Staff account renamed: "${rows[0].name}" is now "${name}".`);
});

// Protein now follows the goal weight. Active programs that were worked out from
// the patient's weight under the old rule are updated; a range that doesn't match
// that rule was set by a doctor, so it stays as it is.
once("protein-from-goal-weight", () => {
  const rows = db.prepare(`SELECT pl.id, pl.diet_json, p.goal_weight_kg AS goal, p.current_weight_kg AS current, p.start_weight_kg AS start
    FROM plans pl JOIN patients p ON p.id = pl.patient_id WHERE pl.status = 'active' AND p.goal_weight_kg > 0`).all();
  let updated = 0;
  for (const r of rows) {
    let diet;
    try { diet = JSON.parse(r.diet_json || "{}"); } catch { continue; }
    const weight = r.current || r.start;
    if (!diet.proteinMin || diet.rangeEdited || !weight || r.goal >= weight) continue;
    if (![r.current, r.start].some((w) => w && Math.round(w * 1.2) === diet.proteinMin)) continue;
    diet.proteinMin = Math.round(r.goal * 1.2);
    diet.proteinMax = Math.round(r.goal * 1.5);
    diet.proteinBasisKg = r.goal;
    diet.proteinBasis = "goal";
    if (!diet.targetEdited) delete diet.proteinTarget;
    if (!diet.mealsEdited) delete diet.meals;
    db.prepare("UPDATE plans SET diet_json = ? WHERE id = ?").run(JSON.stringify(diet), r.id);
    updated++;
  }
  console.log(`Protein from goal weight: updated ${updated} of ${rows.length} active program(s) with a goal weight.`);
});

seed();
const DEFAULT_ORG = seedOrganizations();

// The organisation a new record belongs to when none is named — the practice
// this install was set up for.
function defaultOrgId() { return DEFAULT_ORG.id; }

module.exports = { db, hashSecret, verifySecret, defaultOrgId };
