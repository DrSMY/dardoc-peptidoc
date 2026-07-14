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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
addColumn("plans", "clinical_suggestion", "TEXT DEFAULT ''");     // auto-generated EMR record
addColumn("plans", "supplements", "TEXT DEFAULT ''");             // optional supplements list

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
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (userCount === 0) {
    const email = process.env.ADMIN_EMAIL || "drsamimoha2018@gmail.com";
    const password = process.env.ADMIN_PASSWORD || "DarDoc@2026";
    db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)")
      .run(email.toLowerCase(), hashSecret(password), "Dr. Sami", "admin");
    console.log(`Seeded admin account: ${email} (change the password after first login)`);
  }

  const tplCount = db.prepare("SELECT COUNT(*) AS n FROM templates").get().n;
  if (tplCount === 0) {
    const ins = db.prepare("INSERT INTO templates (name, category, config_json, builtin) VALUES (?,?,?,1)");
    for (const [med, cfg] of Object.entries(presets.GLP1_MEDICATIONS)) {
      ins.run(med, "glp1", JSON.stringify({
        medication: med,
        generic: cfg.generic,
        route: cfg.route,
        frequency: cfg.frequency,
        halfLifeHours: cfg.halfLifeHours,
        doses: cfg.doses,
      }));
    }
    for (const [pep, protocols] of Object.entries(presets.PEPTIDE_PROTOCOLS)) {
      ins.run(pep, "peptide", JSON.stringify({ medication: pep, protocols }));
    }
    console.log("Seeded built-in GLP-1 and peptide templates");
  }
}

seed();

module.exports = { db, hashSecret, verifySecret };
