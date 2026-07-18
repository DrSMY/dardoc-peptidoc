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
addColumn("templates", "is_customized", "INTEGER NOT NULL DEFAULT 0"); // edited via super admin panel

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

seed();

module.exports = { db, hashSecret, verifySecret };
