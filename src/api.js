// JSON API for both the doctor dashboard and the patient portal.
const crypto = require("node:crypto");
const { db, hashSecret, verifySecret } = require("./db");
const presets = require("./presets");
const protocolMap = require("./protocol-map.js");

const SESSION_HOURS = { doctor: 24 * 14, patient: 24 * 90 };

// ── helpers ──────────────────────────────────────────────────────
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) { reject(new Error("body too large")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

function getCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setSession(res, kind, refId) {
  const token = crypto.randomBytes(24).toString("hex");
  const hours = SESSION_HOURS[kind];
  db.prepare("INSERT INTO sessions (token, kind, ref_id, expires_at) VALUES (?,?,?,datetime('now', ?))")
    .run(token, kind, refId, `+${hours} hours`);
  const name = kind === "doctor" ? "pdsid" : "pdpat";
  const prev = res.getHeader("Set-Cookie") || [];
  res.setHeader("Set-Cookie", [].concat(prev, `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${hours * 3600}`));
  return token;
}

function clearSession(req, res, kind) {
  const name = kind === "doctor" ? "pdsid" : "pdpat";
  const token = getCookies(req)[name];
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.setHeader("Set-Cookie", `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// Any signed-in staff user. Three roles share this session:
//   superadmin — everything, plus managing the team, protocols and the KB
//   doctor     — consults, prescribes, and signs in their own name
//   admin      — sees patients and their programs, but prescribes nothing
// getDoctor answers "is someone signed in"; use requireClinician for anything
// that writes to a patient's record.
function getDoctor(req) {
  const token = getCookies(req).pdsid;
  if (!token) return null;
  const s = db.prepare("SELECT * FROM sessions WHERE token = ? AND kind = 'doctor' AND expires_at > datetime('now')").get(token);
  if (!s) return null;
  return db.prepare("SELECT id, email, name, role, credentials, signature, clinic, active FROM users WHERE id = ? AND active = 1").get(s.ref_id) || null;
}

// Super admin: manages the team, the clinical protocols and the knowledge base.
function requireSuperadmin(req) {
  const user = getDoctor(req);
  return user && user.role === "superadmin" ? user : null;
}

// Only a clinician may create or change anything a patient will act on. An
// admin can read the same records but never writes to them.
function requireClinician(req) {
  const user = getDoctor(req);
  return user && (user.role === "doctor" || user.role === "superadmin") ? user : null;
}
const NOT_CLINICIAN = { error: "Your account can view records but cannot prescribe or change a program." };

function getPatient(req) {
  const token = getCookies(req).pdpat;
  if (!token) return null;
  const s = db.prepare("SELECT * FROM sessions WHERE token = ? AND kind = 'patient' AND expires_at > datetime('now')").get(token);
  if (!s) return null;
  return db.prepare("SELECT * FROM patients WHERE id = ? AND archived = 0").get(s.ref_id) || null;
}

function generatePin() {
  return String(crypto.randomInt(100000, 1000000)); // 6 digits, no leading-zero ambiguity
}

function normMobile(m) {
  return String(m || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "");
}

// The clinician who signed a program. Looked up per plan rather than taken
// from the session, so a guide opened months later — or by a different
// doctor, or by an admin — still shows who actually prescribed it.
function signerFor(userId) {
  const u = db.prepare("SELECT name, credentials, signature, clinic FROM users WHERE id = ?").get(userId);
  return {
    name: u ? u.name : "Your doctor",
    credentials: (u && u.credentials) || "",
    signature: (u && u.signature) || "",
    clinic: (u && u.clinic) || "DarDoc Healthcare",
  };
}

// Messages carry the name of the clinician who sent them, so a practice with
// more than one doctor does not sign every reply with the same name. Messages
// written before the column existed fall back to the patient's own doctor.
function withSender(messages, fallbackDoctorId) {
  const names = new Map();
  const nameOf = (id) => {
    if (!names.has(id)) {
      const u = db.prepare("SELECT name FROM users WHERE id = ?").get(id);
      names.set(id, u ? u.name : "Your doctor");
    }
    return names.get(id);
  };
  return messages.map((m) => (m.sender === "doctor"
    ? { ...m, senderName: nameOf(m.sender_user_id || fallbackDoctorId) }
    : m));
}

function parsePlan(row) {
  if (!row) return null;
  const safe = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  return {
    ...row,
    signedBy: signerFor(row.doctor_id),
    revisedBy: row.last_edited_by && row.last_edited_by !== row.doctor_id ? signerFor(row.last_edited_by) : null,
    phases: JSON.parse(row.phases_json || "[]"),
    diet: JSON.parse(row.diet_json || "{}"),
    labTests: safe(row.lab_tests_json || "[]", []),
    suppList: safe(row.supplements_json || "[]", []),
    phases_json: undefined,
    diet_json: undefined,
    lab_tests_json: undefined,
    supplements_json: undefined,
  };
}

// Patient-facing plan: strip the doctor's private clinical fields.
function parsePlanPublic(row) {
  const p = parsePlan(row);
  if (!p) return null;
  return { ...p, clinical_note: undefined, clinical_suggestion: undefined };
}

function checkinFlag(symptoms) {
  const alerts = [];
  for (const s of presets.SYMPTOMS) {
    const v = symptoms[s.key];
    if (v && s.alertOn.includes(v)) alerts.push(`${s.label}: ${v}`);
  }
  return alerts;
}

// ── route table ──────────────────────────────────────────────────
// Each handler: (req, res, params, body) — return true-ish when handled.
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const rx = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "(\\d+)"; }) + "$");
  routes.push({ method, rx, keys, handler });
}

// ── auth: doctor ─────────────────────────────────────────────────
route("POST", "/api/auth/login", async (req, res, _p, body) => {
  const email = String(body.email || "").toLowerCase().trim();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifySecret(body.password || "", user.password_hash)) {
    return json(res, 401, { error: "Invalid email or password." });
  }
  if (!user.active) return json(res, 403, { error: "This account has been deactivated." });
  setSession(res, "doctor", user.id);
  json(res, 200, publicUser(user));
});

// The staff fields the dashboard may see — never the password hash.
function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    credentials: u.credentials || "", signature: u.signature || "",
    clinic: u.clinic || "DarDoc Healthcare", active: u.active === undefined ? 1 : u.active,
  };
}

route("POST", "/api/auth/logout", (req, res) => { clearSession(req, res, "doctor"); json(res, 200, { ok: true }); });

route("GET", "/api/me", (req, res) => {
  const user = getDoctor(req);
  if (!user) return json(res, 401, { error: "Not signed in." });
  json(res, 200, user);
});

route("POST", "/api/auth/password", async (req, res, _p, body) => {
  const user = getDoctor(req);
  if (!user) return json(res, 401, { error: "Not signed in." });
  const full = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  if (!verifySecret(body.current || "", full.password_hash)) return json(res, 400, { error: "Current password is incorrect." });
  if (!body.next || String(body.next).length < 8) return json(res, 400, { error: "New password must be at least 8 characters." });
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashSecret(body.next), user.id);
  json(res, 200, { ok: true });
});

// ── presets & templates ─────────────────────────────────────────
// Peptide info + health-goal mappings are served live from the DB (seeded
// from presets.js, then editable via the super admin panel — see src/db.js
// seed() for the is_customized protection against being overwritten).
function dbPeptideInfo() {
  const out = {};
  for (const r of db.prepare("SELECT name, data_json FROM peptide_info").all()) out[r.name] = JSON.parse(r.data_json);
  return out;
}
function dbHealthGoalPeptides() {
  const out = {};
  for (const r of db.prepare("SELECT goal, peptide_name, priority FROM health_goal_peptides ORDER BY id").all()) {
    (out[r.goal] || (out[r.goal] = [])).push({ name: r.peptide_name, priority: r.priority });
  }
  return out;
}

route("GET", "/api/presets", (req, res) => {
  json(res, 200, {
    symptoms: presets.SYMPTOMS,
    phasesWeekly: presets.PK_PHASES_WEEKLY,
    phasesDaily: presets.PK_PHASES_DAILY,
    activityLevels: presets.ACTIVITY_LEVELS,
    bodyShapes: presets.BODY_SHAPES,
    intakeSections: presets.INTAKE_SECTIONS,
    intakeQuestions: presets.INTAKE_QUESTIONS,
    weightLossGoals: presets.WEIGHT_LOSS_GOALS,
    healthGoalPeptides: dbHealthGoalPeptides(),
    peptideInfo: dbPeptideInfo(),
    glp1Info: presets.GLP1_INFO,
    goalDescriptions: presets.GOAL_DESCRIPTIONS,
    glp1Eligibility: presets.GLP1_ELIGIBILITY,
    labTestCatalog: presets.LAB_TEST_CATALOG,
    weightLossPanel: presets.WEIGHT_LOSS_PANEL,
    supplementCatalog: presets.SUPPLEMENT_CATALOG,
  });
});

route("GET", "/api/templates", (req, res) => {
  if (!getDoctor(req)) return json(res, 401, { error: "Not signed in." });
  const rows = db.prepare("SELECT * FROM templates ORDER BY category, name").all()
    .map((t) => ({ ...t, config: JSON.parse(t.config_json), config_json: undefined }));
  json(res, 200, rows);
});

route("POST", "/api/templates", async (req, res, _p, body) => {
  if (!requireClinician(req)) return json(res, 403, NOT_CLINICIAN);
  if (!body.name) return json(res, 400, { error: "Template name is required." });
  const r = db.prepare("INSERT INTO templates (name, category, config_json) VALUES (?,?,?)")
    .run(body.name, body.category || "custom", JSON.stringify(body.config || {}));
  json(res, 200, { id: Number(r.lastInsertRowid) });
});

// ── super admin: protocols & knowledge base ─────────────────────
route("POST", "/api/admin/login", async (req, res, _p, body) => {
  const email = String(body.email || "").toLowerCase().trim();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifySecret(body.password || "", user.password_hash) || user.role !== "superadmin" || !user.active) {
    return json(res, 401, { error: "Invalid email or password." });
  }
  setSession(res, "doctor", user.id);
  json(res, 200, publicUser(user));
});

// ── super admin: the clinical team ──────────────────────────────
// Doctors sign their own consultations, so each one is a real user with
// their own login and signature. Admins get the same read access to
// patients and programs but cannot prescribe — see requireClinician.
const STAFF_ROLES = ["doctor", "admin", "superadmin"];

route("GET", "/api/admin/users", (req, res) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  const rows = db.prepare("SELECT * FROM users ORDER BY active DESC, role, name").all().map(publicUser);
  const counts = db.prepare("SELECT doctor_id, COUNT(*) n FROM patients WHERE archived = 0 GROUP BY doctor_id").all();
  const byDoctor = Object.fromEntries(counts.map((c) => [c.doctor_id, c.n]));
  json(res, 200, rows.map((u) => ({ ...u, patients: byDoctor[u.id] || 0 })));
});

route("POST", "/api/admin/users", async (req, res, _p, body) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  const email = String(body.email || "").toLowerCase().trim();
  const name = String(body.name || "").trim();
  const role = STAFF_ROLES.includes(body.role) ? body.role : "doctor";
  if (!name || !email) return json(res, 400, { error: "Name and email are required." });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: "Enter a valid email address." });
  if (String(body.password || "").length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return json(res, 409, { error: "That email already has an account." });
  const r = db.prepare(`INSERT INTO users (email, password_hash, name, role, credentials, signature, clinic)
    VALUES (?,?,?,?,?,?,?)`).run(email, hashSecret(body.password), name, role,
      String(body.credentials || "").trim(), String(body.signature || "").trim(),
      String(body.clinic || "DarDoc Healthcare").trim());
  json(res, 200, publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(Number(r.lastInsertRowid))));
});

route("PUT", "/api/admin/users/:id", async (req, res, p, body) => {
  const me = requireSuperadmin(req);
  if (!me) return json(res, 401, { error: "Not signed in as super admin." });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(p.id));
  if (!user) return json(res, 404, { error: "User not found." });

  const sets = [], vals = [];
  const put = (col, v) => { sets.push(`${col} = ?`); vals.push(v); };
  if (body.name !== undefined) put("name", String(body.name).trim());
  if (body.credentials !== undefined) put("credentials", String(body.credentials).trim());
  if (body.signature !== undefined) put("signature", String(body.signature).trim());
  if (body.clinic !== undefined) put("clinic", String(body.clinic).trim());
  if (body.email !== undefined) {
    const email = String(body.email).toLowerCase().trim();
    const clash = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, user.id);
    if (clash) return json(res, 409, { error: "That email already has an account." });
    put("email", email);
  }
  if (body.password) {
    if (String(body.password).length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
    put("password_hash", hashSecret(body.password));
  }
  // The last active super admin must keep the keys, or nobody can manage the
  // team again — the same reason they cannot deactivate themselves.
  const activeSupers = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'superadmin' AND active = 1").get().n;
  if (body.role !== undefined && STAFF_ROLES.includes(body.role) && body.role !== user.role) {
    if (user.role === "superadmin" && activeSupers <= 1) return json(res, 400, { error: "This is the only super admin — promote someone else first." });
    put("role", body.role);
  }
  if (body.active !== undefined) {
    const next = body.active ? 1 : 0;
    if (!next && user.id === me.id) return json(res, 400, { error: "You cannot deactivate your own account." });
    if (!next && user.role === "superadmin" && activeSupers <= 1) return json(res, 400, { error: "This is the only super admin — promote someone else first." });
    put("active", next);
    if (!next) db.prepare("DELETE FROM sessions WHERE kind = 'doctor' AND ref_id = ?").run(user.id);
  }
  if (!sets.length) return json(res, 400, { error: "Nothing to update." });
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...vals, user.id);
  json(res, 200, publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)));
});

// A clinician edits their own signature without needing the super admin.
route("PUT", "/api/me/signature", async (req, res, _p, body) => {
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  db.prepare("UPDATE users SET name = ?, credentials = ?, signature = ?, clinic = ? WHERE id = ?")
    .run(String(body.name || me.name).trim(), String(body.credentials || "").trim(),
      String(body.signature || "").trim(), String(body.clinic || "DarDoc Healthcare").trim(), me.id);
  json(res, 200, publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(me.id)));
});

route("GET", "/api/admin/me", (req, res) => {
  const user = requireSuperadmin(req);
  if (!user) return json(res, 401, { error: "Not signed in as super admin." });
  json(res, 200, user);
});

// Protocols: builtin GLP-1 medications & peptide dosing ladders (the
// `templates` table — same one doctors read from, edits here go live
// immediately and are protected from the next code-push reseed).
route("PUT", "/api/admin/templates/:id", async (req, res, p, body) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  const row = db.prepare("SELECT id FROM templates WHERE id = ?").get(Number(p.id));
  if (!row) return json(res, 404, { error: "Protocol not found." });
  db.prepare("UPDATE templates SET name = ?, category = ?, config_json = ?, is_customized = 1 WHERE id = ?")
    .run(body.name, body.category, JSON.stringify(body.config || {}), Number(p.id));
  json(res, 200, { ok: true });
});

route("POST", "/api/admin/templates", async (req, res, _p, body) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  if (!body.name || !body.category) return json(res, 400, { error: "Name and category are required." });
  const r = db.prepare("INSERT INTO templates (name, category, config_json, builtin, is_customized) VALUES (?,?,?,1,1)")
    .run(body.name, body.category, JSON.stringify(body.config || {}));
  json(res, 200, { id: Number(r.lastInsertRowid) });
});

route("DELETE", "/api/admin/templates/:id", (req, res, p) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  db.prepare("DELETE FROM templates WHERE id = ?").run(Number(p.id));
  json(res, 200, { ok: true });
});

// Peptide clinical/patient-facing reference info (keyed by name, not a
// numeric id, so upsert/delete take the name in the request body instead
// of a URL param).
route("GET", "/api/admin/peptide-info", (req, res) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  const rows = db.prepare("SELECT name, data_json, is_customized, updated_at FROM peptide_info ORDER BY name").all()
    .map((r) => ({ name: r.name, data: JSON.parse(r.data_json), isCustomized: !!r.is_customized, updatedAt: r.updated_at }));
  json(res, 200, rows);
});

route("POST", "/api/admin/peptide-info", async (req, res, _p, body) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  const name = String(body.name || "").trim();
  if (!name) return json(res, 400, { error: "Peptide name is required." });
  db.prepare(`
    INSERT INTO peptide_info (name, data_json, is_customized) VALUES (?, ?, 1)
    ON CONFLICT(name) DO UPDATE SET data_json = excluded.data_json, is_customized = 1, updated_at = datetime('now')`)
    .run(name, JSON.stringify(body.data || {}));
  json(res, 200, { ok: true });
});

route("POST", "/api/admin/peptide-info/delete", async (req, res, _p, body) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  db.prepare("DELETE FROM peptide_info WHERE name = ?").run(String(body.name || ""));
  db.prepare("DELETE FROM health_goal_peptides WHERE peptide_name = ?").run(String(body.name || ""));
  json(res, 200, { ok: true });
});

// Health-goal → peptide mapping (the "Suggested Peptides" side panel data)
route("GET", "/api/admin/health-goal-peptides", (req, res) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  json(res, 200, db.prepare("SELECT * FROM health_goal_peptides ORDER BY goal, priority DESC, peptide_name").all());
});

route("POST", "/api/admin/health-goal-peptides", async (req, res, _p, body) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  const goal = String(body.goal || "").trim(), peptideName = String(body.peptideName || "").trim();
  if (!goal || !peptideName) return json(res, 400, { error: "Goal and peptide name are required." });
  db.prepare(`
    INSERT INTO health_goal_peptides (goal, peptide_name, priority, is_customized) VALUES (?,?,?,1)
    ON CONFLICT(goal, peptide_name) DO UPDATE SET priority = excluded.priority, is_customized = 1`)
    .run(goal, peptideName, body.priority === "Primary" ? "Primary" : "Secondary");
  json(res, 200, { ok: true });
});

route("DELETE", "/api/admin/health-goal-peptides/:id", (req, res, p) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  db.prepare("DELETE FROM health_goal_peptides WHERE id = ?").run(Number(p.id));
  json(res, 200, { ok: true });
});

// Knowledge base — readable by any signed-in doctor/superadmin, writable
// only by super admin.
route("GET", "/api/kb", (req, res) => {
  if (!getDoctor(req)) return json(res, 401, { error: "Not signed in." });
  json(res, 200, db.prepare("SELECT * FROM kb_articles ORDER BY category, title").all());
});

route("POST", "/api/admin/kb", async (req, res, _p, body) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  if (!body.title) return json(res, 400, { error: "Title is required." });
  const r = db.prepare("INSERT INTO kb_articles (title, category, body) VALUES (?,?,?)")
    .run(body.title, body.category || "General", body.body || "");
  json(res, 200, { id: Number(r.lastInsertRowid) });
});

route("PUT", "/api/admin/kb/:id", async (req, res, p, body) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  const row = db.prepare("SELECT id FROM kb_articles WHERE id = ?").get(Number(p.id));
  if (!row) return json(res, 404, { error: "Article not found." });
  db.prepare("UPDATE kb_articles SET title = ?, category = ?, body = ?, updated_at = datetime('now') WHERE id = ?")
    .run(body.title, body.category || "General", body.body || "", Number(p.id));
  json(res, 200, { ok: true });
});

route("DELETE", "/api/admin/kb/:id", (req, res, p) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  db.prepare("DELETE FROM kb_articles WHERE id = ?").run(Number(p.id));
  json(res, 200, { ok: true });
});

// ── dashboard ────────────────────────────────────────────────────
route("GET", "/api/dashboard", (req, res) => {
  if (!getDoctor(req)) return json(res, 401, { error: "Not signed in." });
  const activePatients = db.prepare("SELECT COUNT(DISTINCT patient_id) AS n FROM plans WHERE status = 'active'").get().n;
  const totalPatients = db.prepare("SELECT COUNT(*) AS n FROM patients WHERE archived = 0").get().n;
  const checkins7 = db.prepare("SELECT COUNT(*) AS n FROM checkins WHERE created_at > datetime('now','-7 days')").get().n;
  const doses7 = db.prepare("SELECT COUNT(*) AS n FROM dose_logs WHERE created_at > datetime('now','-7 days')").get().n;
  const unread = db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender = 'patient' AND read_at IS NULL").get().n;
  const alerts = db.prepare(`
    SELECT c.*, p.name AS patient_name, p.mobile FROM checkins c
    JOIN patients p ON p.id = c.patient_id
    WHERE c.flagged = 1 AND c.reviewed = 0
    ORDER BY c.created_at DESC LIMIT 30`).all()
    .map((c) => ({ ...c, symptoms: JSON.parse(c.symptoms_json || "{}"), symptoms_json: undefined }));
  const refillRequests = db.prepare(`
    SELECT pl.id, pl.medication, pl.dose, pl.refill_requested_at, p.id AS patient_id, p.name AS patient_name, p.mobile
    FROM plans pl JOIN patients p ON p.id = pl.patient_id
    WHERE pl.needs_refill = 1
    ORDER BY pl.refill_requested_at DESC LIMIT 30`).all();
  const dueFollowups = db.prepare(`
    SELECT pl.id, pl.title, pl.medication, pl.next_followup, p.id AS patient_id, p.name AS patient_name, p.mobile
    FROM plans pl JOIN patients p ON p.id = pl.patient_id
    WHERE pl.status = 'active' AND pl.next_followup IS NOT NULL AND date(pl.next_followup) <= date('now','+3 days')
    ORDER BY pl.next_followup ASC LIMIT 30`).all();
  const recent = db.prepare(`
    SELECT * FROM (
      SELECT 'checkin' AS type, c.created_at AS created_at, p.name AS patient_name, p.id AS patient_id,
             c.weight_kg AS detail, c.flagged AS flagged
      FROM checkins c JOIN patients p ON p.id = c.patient_id
      UNION ALL
      SELECT 'dose' AS type, d.created_at AS created_at, p.name AS patient_name, p.id AS patient_id,
             d.dose AS detail, 0 AS flagged
      FROM dose_logs d JOIN patients p ON p.id = d.patient_id
    ) ORDER BY created_at DESC LIMIT 20`).all();

  // Practice statistics (prescriptions = every published plan; consultations
  // completed = every registered patient, since both are created together at
  // publish time in this app's flow).
  const prescriptionsTotal = db.prepare("SELECT COUNT(*) AS n FROM plans").get().n;
  const consultationsTotal = totalPatients;
  const categoryBreakdown = db.prepare("SELECT category, COUNT(*) AS n FROM plans GROUP BY category").all();
  const medBreakdown = db.prepare(`
    SELECT medication, category, COUNT(*) AS n FROM plans
    GROUP BY medication, category ORDER BY n DESC LIMIT 8`).all();
  const recentPlans = db.prepare(`
    SELECT created_at, category FROM plans
    WHERE created_at > datetime('now','-14 days')`).all();

  json(res, 200, {
    activePatients, totalPatients, checkins7, doses7, unread, alerts, dueFollowups, recent, refillRequests,
    prescriptionsTotal, consultationsTotal, categoryBreakdown, medBreakdown, recentPlans,
  });
});

// ── doctor: full messages inbox (every patient thread, most recent first) ──
route("GET", "/api/messages/inbox", (req, res) => {
  if (!getDoctor(req)) return json(res, 401, { error: "Not signed in." });
  const rows = db.prepare(`
    SELECT p.id AS patient_id, p.name AS patient_name, p.mobile,
      (SELECT body FROM messages m WHERE m.patient_id = p.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
      (SELECT sender FROM messages m WHERE m.patient_id = p.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
      (SELECT created_at FROM messages m WHERE m.patient_id = p.id ORDER BY m.created_at DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM messages m WHERE m.patient_id = p.id AND m.sender = 'patient' AND m.read_at IS NULL) AS unread
    FROM patients p
    WHERE p.archived = 0 AND EXISTS (SELECT 1 FROM messages m WHERE m.patient_id = p.id)
    ORDER BY last_at DESC`).all();
  json(res, 200, rows);
});

// Full recent-activity feed (dose logs + check-ins), for the dedicated
// Recent activity page — the dashboard keeps its own 20-row slice.
route("GET", "/api/activity", (req, res) => {
  if (!getDoctor(req)) return json(res, 401, { error: "Not signed in." });
  const rows = db.prepare(`
    SELECT * FROM (
      SELECT 'checkin' AS type, c.created_at AS created_at, p.name AS patient_name, p.id AS patient_id,
             c.weight_kg AS detail, c.flagged AS flagged
      FROM checkins c JOIN patients p ON p.id = c.patient_id
      UNION ALL
      SELECT 'dose' AS type, d.created_at AS created_at, p.name AS patient_name, p.id AS patient_id,
             d.dose AS detail, 0 AS flagged
      FROM dose_logs d JOIN patients p ON p.id = d.patient_id
    ) ORDER BY created_at DESC LIMIT 150`).all();
  json(res, 200, rows);
});

// ── patients ─────────────────────────────────────────────────────
route("GET", "/api/patients", (req, res) => {
  if (!getDoctor(req)) return json(res, 401, { error: "Not signed in." });
  const rows = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM plans pl WHERE pl.patient_id = p.id AND pl.status = 'active') AS active_plans,
      (SELECT title FROM plans pl WHERE pl.patient_id = p.id AND pl.status = 'active' ORDER BY pl.created_at DESC LIMIT 1) AS current_plan,
      (SELECT weight_kg FROM checkins c WHERE c.patient_id = p.id AND c.weight_kg IS NOT NULL ORDER BY c.date DESC LIMIT 1) AS last_weight,
      (SELECT MAX(created_at) FROM (
         SELECT created_at FROM dose_logs WHERE patient_id = p.id
         UNION ALL SELECT created_at FROM checkins WHERE patient_id = p.id
      )) AS last_activity,
      (SELECT COUNT(*) FROM checkins c WHERE c.patient_id = p.id AND c.flagged = 1 AND c.reviewed = 0) AS open_alerts,
      (SELECT COUNT(*) FROM messages m WHERE m.patient_id = p.id AND m.sender = 'patient' AND m.read_at IS NULL) AS unread_msgs
    FROM patients p WHERE p.archived = 0
    ORDER BY p.created_at DESC`).all();
  json(res, 200, rows.map((r) => ({ ...r, pin_hash: undefined })));
});

route("POST", "/api/patients", async (req, res, _p, body) => {
  const doc = requireClinician(req);
  if (!doc) return json(res, 403, NOT_CLINICIAN);
  const name = String(body.name || "").trim();
  const mobile = normMobile(body.mobile);
  if (!name || !mobile) return json(res, 400, { error: "Name and mobile number are required." });
  const dup = db.prepare("SELECT id FROM patients WHERE mobile = ?").get(mobile);
  if (dup) return json(res, 409, { error: "A patient with this mobile number already exists.", patientId: dup.id });
  const pin = generatePin();
  const r = db.prepare(`INSERT INTO patients
    (doctor_id, name, mobile, pin_hash, title, age, gender, height_cm, start_weight_kg, activity_level, chronic_illnesses, medications, allergies, notes, intake_json, email, national_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(doc.id, name, mobile, hashSecret(pin), body.title || "", body.age || null, body.gender || "",
      body.heightCm || null, body.weightKg || null, body.activityLevel || "Sedentary",
      body.chronicIllnesses || "", body.medications || "", body.allergies || "", body.notes || "",
      JSON.stringify(body.intake || {}), body.email || "", body.nationalId || "");
  json(res, 200, { id: Number(r.lastInsertRowid), pin });
});

route("GET", "/api/patients/:id", (req, res, p) => {
  if (!getDoctor(req)) return json(res, 401, { error: "Not signed in." });
  const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(p.id);
  if (!patient) return json(res, 404, { error: "Patient not found." });
  const plans = db.prepare("SELECT * FROM plans WHERE patient_id = ? ORDER BY created_at DESC").all(p.id).map(parsePlan);
  const doses = db.prepare("SELECT * FROM dose_logs WHERE patient_id = ? ORDER BY taken_at DESC LIMIT 200").all(p.id);
  const checkins = db.prepare("SELECT * FROM checkins WHERE patient_id = ? ORDER BY date DESC LIMIT 200").all(p.id)
    .map((c) => ({ ...c, symptoms: JSON.parse(c.symptoms_json || "{}"), symptoms_json: undefined }));
  const messages = db.prepare("SELECT * FROM messages WHERE patient_id = ? ORDER BY created_at ASC").all(p.id);
  db.prepare("UPDATE messages SET read_at = datetime('now') WHERE patient_id = ? AND sender = 'patient' AND read_at IS NULL").run(p.id);
  const intake = JSON.parse(patient.intake_json || "{}");
  json(res, 200, { patient: { ...patient, pin_hash: undefined, intake_json: undefined, intake },
    plans, doses, checkins, messages: withSender(messages, patient.doctor_id) });
});

route("PATCH", "/api/patients/:id", async (req, res, p, body) => {
  if (!getDoctor(req)) return json(res, 401, { error: "Not signed in." });
  const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(p.id);
  if (!patient) return json(res, 404, { error: "Patient not found." });
  const fields = { name: "name", title: "title", age: "age", gender: "gender", heightCm: "height_cm",
    weightKg: "start_weight_kg", activityLevel: "activity_level", chronicIllnesses: "chronic_illnesses",
    medications: "medications", allergies: "allergies", notes: "notes", archived: "archived", email: "email",
    nationalId: "national_id" };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(fields)) {
    if (body[k] !== undefined) { sets.push(`${col} = ?`); vals.push(body[k]); }
  }
  if (body.mobile !== undefined) { sets.push("mobile = ?"); vals.push(normMobile(body.mobile)); }
  if (body.intake !== undefined) { sets.push("intake_json = ?"); vals.push(JSON.stringify(body.intake)); }
  if (!sets.length) return json(res, 400, { error: "Nothing to update." });
  vals.push(p.id);
  db.prepare(`UPDATE patients SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  json(res, 200, { ok: true });
});

route("POST", "/api/patients/:id/pin", (req, res, p) => {
  if (!requireClinician(req)) return json(res, 403, NOT_CLINICIAN);
  const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(p.id);
  if (!patient) return json(res, 404, { error: "Patient not found." });
  const pin = generatePin();
  db.prepare("UPDATE patients SET pin_hash = ? WHERE id = ?").run(hashSecret(pin), p.id);
  db.prepare("DELETE FROM sessions WHERE kind = 'patient' AND ref_id = ?").run(p.id);
  json(res, 200, { pin });
});

// ── bulk history import (superadmin) ─────────────────────────────
// Imports historical consultation records as patients + completed
// ("previous history") plans — no active programs. Idempotent via
// `replace`: only ever removes rows this importer created (intake_json
// carries an `imported:true` marker), never real/live patients.
route("POST", "/api/admin/import-history", async (req, res, _p, body) => {
  const user = requireSuperadmin(req);
  if (!user) return json(res, 401, { error: "Not signed in as super admin." });
  const records = Array.isArray(body.records) ? body.records : [];
  const doctorId = user.id;

  const insPatient = db.prepare(`INSERT INTO patients
    (doctor_id, name, mobile, pin_hash, title, age, gender, height_cm, start_weight_kg, activity_level,
     chronic_illnesses, medications, allergies, notes, intake_json, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insPlan = db.prepare(`INSERT INTO plans
    (patient_id, doctor_id, status, category, title, medication, dose, route, frequency,
     instructions, supplements, followup_days, next_followup, blood_test, clinical_note, clinical_suggestion, created_at)
    VALUES (?,?,'completed',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const findMobile = db.prepare("SELECT id FROM patients WHERE mobile = ?");

  // node:sqlite has no .transaction() helper — use explicit BEGIN/COMMIT.
  db.exec("BEGIN");
  try {
    let removed = 0;
    if (body.replace) {
      const imported = db.prepare("SELECT id FROM patients WHERE intake_json LIKE '%\"imported\":true%'").all();
      const delPlans = db.prepare("DELETE FROM plans WHERE patient_id = ?");
      const delPat = db.prepare("DELETE FROM patients WHERE id = ?");
      for (const p of imported) { delPlans.run(p.id); delPat.run(p.id); removed++; }
    }
    let synth = 1, patientsAdded = 0, plansAdded = 0;
    for (const rec of records) {
      let mobile = normMobile(rec.mobile);
      if (!mobile) mobile = "0000" + String(synth++).padStart(8, "0"); // clearly-synthetic key for no-phone records
      let m = mobile, g = 0;
      while (findMobile.get(m)) m = mobile + String(++g); // never overwrite an existing patient
      const r = insPatient.run(doctorId, String(rec.name || "Unknown").trim() || "Unknown", m, null,
        rec.title || "", rec.age ?? null, rec.gender || "", rec.heightCm ?? null, rec.weightKg ?? null,
        rec.activityLevel || "", rec.chronicIllnesses || "", rec.medications || "", rec.allergies || "",
        rec.notes || "", JSON.stringify({ imported: true, ...(rec.intake || {}) }),
        rec.createdAt || (new Date().toISOString().slice(0, 10) + " 00:00:00"));
      const pid = Number(r.lastInsertRowid);
      patientsAdded++;
      for (const pl of (rec.plans || [])) {
        insPlan.run(pid, doctorId, pl.category || "custom",
          String(pl.title || pl.medication || "Program").slice(0, 140), String(pl.medication || "—").slice(0, 140),
          pl.dose || "", pl.route || "injection", pl.frequency || "",
          pl.instructions || "", pl.supplements || "", pl.followupDays || 0, pl.nextFollowup || null,
          pl.bloodTest || "none", pl.clinicalNote || "", pl.emr || "", pl.createdAt || rec.createdAt || null);
        plansAdded++;
      }
    }
    db.exec("COMMIT");
    json(res, 200, { ok: true, removed, patientsAdded, plansAdded });
  } catch (e) {
    db.exec("ROLLBACK");
    json(res, 500, { error: "Import failed: " + e.message });
  }
});

// ── plans ────────────────────────────────────────────────────────
// The prescriber's guidebook, keyed by the medication names the app uses:
// every approved presentation of a peptide with all of its dosing variants,
// so the Program step can offer the real protocol to choose from instead of
// a single hard-coded default. Loaded once per dashboard session.
route("GET", "/api/clinical/protocols", (req, res) => {
  if (!getDoctor(req)) return json(res, 401, { error: "Not signed in." });
  json(res, 200, { byMedication: protocolMap.protocolCatalogue() });
});

// Protocol review for a prescription in progress. The prescriber's guidebook
// decides which blood panels the chosen peptides require, which of them are
// mandatory rather than optional, which supporting supplements go with each,
// and which cross-peptide safety rules have fired. Kept on the server so
// there is one clinical implementation rather than a copy in the browser.
route("POST", "/api/clinical/review", async (req, res, _p, body) => {
  const doc = getDoctor(req);
  if (!doc) return json(res, 401, { error: "Not signed in." });
  const items = Array.isArray(body.items) ? body.items : [];
  const patient = body.patientId
    ? db.prepare("SELECT * FROM patients WHERE id = ?").get(body.patientId)
    : null;
  const who = patient || body.patient || {};

  const panels = new Map();
  const supplements = new Map();
  const advice = new Map();
  const protocols = [];

  for (const item of items) {
    const product = protocolMap.matchProtocol(item.medication, item.route);
    if (!product) continue;
    protocols.push({
      ref: product.ref, medication: item.medication, name: product.name,
      presentation: product.presentation, monitoring: product.monitoring || "",
      cycling: product.cycling || "", timing: product.timing || "",
      sideEffects: product.sideEffects || "", cautions: product.cautions || "",
      combinesWith: product.combinesWith || "", variants: product.variants || [],
      strength: product.strength || "", containers: product.containers || "",
    });
    for (const p of protocolMap.panelsForProduct(product, who)) {
      const cur = panels.get(p.id) || { ...p, reasons: [] };
      cur.required = cur.required || p.required;
      cur.suggested = cur.suggested || p.suggested;
      if (p.why && !cur.reasons.includes(p.why)) cur.reasons.push(p.why);
      panels.set(p.id, cur);
    }
    // "Collagen peptides 10-20 g/day; Vitamin C 500-1000 mg/day" → entries.
    // A few products give dietary instructions here instead of a list
    // ("Post-injection carbohydrate and protein… Avoid fasted use."); those
    // are carried as advice rather than dressed up as a supplement.
    for (const chunk of String(product.supplements || "").split(";")) {
      const text = chunk.trim();
      if (!text) continue;
      const m = text.match(/^(.+?)\s+(\d[\d.\-–\s]*(?:g|mg|mcg|iu|ml)\b.*)$/i);
      const name = (m ? m[1] : text).trim();
      const looksLikeSentence = /\.\s/.test(text) || (!m && name.split(/\s+/).length > 5);
      if (looksLikeSentence) {
        const key = "advice:" + text.toLowerCase();
        const cur = advice.get(key) || { text, reasons: [] };
        if (!cur.reasons.includes(product.name)) cur.reasons.push(product.name);
        advice.set(key, cur);
        continue;
      }
      const key = name.toLowerCase();
      const cur = supplements.get(key) || {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        dose: m ? m[2].trim() : "", reasons: [],
      };
      if (m && !cur.dose) cur.dose = m[2].trim();
      if (!cur.reasons.includes(product.name)) cur.reasons.push(product.name);
      supplements.set(key, cur);
    }
    // This practice's own additions for the product, on top of the guidebook.
    for (const extra of protocolMap.PRACTICE_SUPPLEMENTS[product.ref] || []) {
      const key = extra.name.toLowerCase();
      const cur = supplements.get(key) || { name: extra.name, dose: extra.dose || "", reasons: [] };
      if (extra.dose) cur.dose = extra.dose;
      if (!cur.reasons.includes(product.name)) cur.reasons.push(product.name);
      supplements.set(key, cur);
    }
  }

  json(res, 200, {
    protocols,
    panels: [...panels.values()],
    supplements: [...supplements.values()],
    advice: [...advice.values()],
    safety: protocolMap.protocolSafetyFindings(items, who),
  });
});

route("POST", "/api/plans", async (req, res, _p, body) => {
  const doc = requireClinician(req);
  if (!doc) return json(res, 403, NOT_CLINICIAN);
  const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(body.patientId);
  if (!patient) return json(res, 404, { error: "Patient not found." });
  if (!body.medication || !body.title) return json(res, 400, { error: "Program title and medication are required." });
  const followupDays = body.followupDays ?? 28;
  const r = db.prepare(`INSERT INTO plans
    (patient_id, doctor_id, category, title, medication, dose, quantity, route, frequency, half_life_hours,
     phases_json, instructions, warnings, diet_json, followup_days, next_followup, blood_test, clinical_note,
     clinical_suggestion, supplements, lab_tests_json, supplements_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,date('now', ?),?,?,?,?,?,?)`)
    .run(body.patientId, doc.id, body.category || "custom", body.title, body.medication,
      body.dose || "", Number(body.quantity) || 1, body.route || "injection", body.frequency || "weekly", body.halfLifeHours || null,
      JSON.stringify(body.phases || []), body.instructions || "", body.warnings || "",
      JSON.stringify(body.diet || {}), followupDays, `+${followupDays} days`,
      body.bloodTest || "none", body.clinicalNote || "",
      body.clinicalSuggestion || "", body.supplements || "",
      JSON.stringify(body.labTests || []), JSON.stringify(body.suppList || []));
  json(res, 200, { id: Number(r.lastInsertRowid) });
});

// One program with the patient it belongs to — what the editor loads.
route("GET", "/api/plans/:id", (req, res, p) => {
  if (!getDoctor(req)) return json(res, 401, { error: "Not signed in." });
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(p.id);
  if (!plan) return json(res, 404, { error: "Plan not found." });
  const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(plan.patient_id);
  json(res, 200, {
    plan: parsePlan(plan),
    patient: patient ? { ...patient, pin_hash: undefined, intake_json: undefined, intake: JSON.parse(patient.intake_json || "{}") } : null,
  });
});

route("PATCH", "/api/plans/:id", async (req, res, p, body) => {
  const editor = requireClinician(req);
  if (!editor) return json(res, 403, NOT_CLINICIAN);
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(p.id);
  if (!plan) return json(res, 404, { error: "Plan not found." });
  // Everything a published program can be revised on: a doctor may change
  // the medication itself, its protocol, the labs and the supplements —
  // treatment gets adjusted at follow-up, so the record has to move with it.
  const fields = { status: "status", title: "title", category: "category", medication: "medication",
    dose: "dose", quantity: "quantity", route: "route", frequency: "frequency", halfLifeHours: "half_life_hours",
    instructions: "instructions", warnings: "warnings", bloodTest: "blood_test", supplements: "supplements",
    clinicalNote: "clinical_note", clinicalSuggestion: "clinical_suggestion",
    nextFollowup: "next_followup", followupDays: "followup_days", needsRefill: "needs_refill" };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(fields)) {
    if (body[k] !== undefined) { sets.push(`${col} = ?`); vals.push(body[k]); }
  }
  if (body.phases !== undefined) { sets.push("phases_json = ?"); vals.push(JSON.stringify(body.phases)); }
  if (body.diet !== undefined) { sets.push("diet_json = ?"); vals.push(JSON.stringify(body.diet)); }
  if (body.labTests !== undefined) { sets.push("lab_tests_json = ?"); vals.push(JSON.stringify(body.labTests)); }
  if (body.suppList !== undefined) { sets.push("supplements_json = ?"); vals.push(JSON.stringify(body.suppList)); }
  if (!sets.length) return json(res, 400, { error: "Nothing to update." });
  // The prescriber stays the prescriber; whoever revised it is recorded
  // separately, so the guide can say who changed what the patient is doing.
  sets.push("updated_at = datetime('now')", "last_edited_by = ?", "last_edited_at = datetime('now')");
  vals.push(editor.id, p.id);
  db.prepare(`UPDATE plans SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  json(res, 200, { ok: true });
});

// ── doctor: review & messages ────────────────────────────────────
route("POST", "/api/checkins/:id/review", (req, res, p) => {
  if (!requireClinician(req)) return json(res, 403, NOT_CLINICIAN);
  db.prepare("UPDATE checkins SET reviewed = 1 WHERE id = ?").run(p.id);
  json(res, 200, { ok: true });
});

route("POST", "/api/patients/:id/messages", async (req, res, p, body) => {
  const doc = requireClinician(req);
  if (!doc) return json(res, 403, NOT_CLINICIAN);
  if (!body.body || !String(body.body).trim()) return json(res, 400, { error: "Message is empty." });
  db.prepare("INSERT INTO messages (patient_id, sender, body, sender_user_id) VALUES (?,?,?,?)")
    .run(p.id, "doctor", String(body.body).trim(), doc.id);
  json(res, 200, { ok: true });
});

// ── patient portal ───────────────────────────────────────────────
route("POST", "/api/portal/login", async (req, res, _p, body) => {
  const mobile = normMobile(body.mobile);
  const patient = db.prepare("SELECT * FROM patients WHERE mobile = ? AND archived = 0").get(mobile);
  if (!patient || !verifySecret(String(body.pin || "").trim(), patient.pin_hash)) {
    return json(res, 401, { error: "Mobile number or PIN is incorrect. Ask your doctor to resend your access PIN." });
  }
  setSession(res, "patient", patient.id);
  json(res, 200, { ok: true });
});

route("POST", "/api/portal/logout", (req, res) => { clearSession(req, res, "patient"); json(res, 200, { ok: true }); });

route("GET", "/api/portal/me", (req, res) => {
  const patient = getPatient(req);
  if (!patient) return json(res, 401, { error: "Not signed in." });
  const plans = db.prepare("SELECT * FROM plans WHERE patient_id = ? ORDER BY created_at DESC").all(patient.id).map(parsePlanPublic);
  const doctor = signerFor(patient.doctor_id);
  json(res, 200, {
    patient: { ...patient, pin_hash: undefined },
    plans,
    doctor,
    doctorName: doctor.name,
    presets: {
      symptoms: presets.SYMPTOMS,
      phasesWeekly: presets.PK_PHASES_WEEKLY,
      phasesDaily: presets.PK_PHASES_DAILY,
    },
  });
});

route("GET", "/api/portal/data", (req, res) => {
  const patient = getPatient(req);
  if (!patient) return json(res, 401, { error: "Not signed in." });
  const doses = db.prepare("SELECT * FROM dose_logs WHERE patient_id = ? ORDER BY taken_at DESC LIMIT 400").all(patient.id);
  const checkins = db.prepare("SELECT * FROM checkins WHERE patient_id = ? ORDER BY date DESC LIMIT 400").all(patient.id)
    .map((c) => ({ ...c, symptoms: JSON.parse(c.symptoms_json || "{}"), symptoms_json: undefined }));
  json(res, 200, { doses, checkins });
});

route("POST", "/api/portal/doses", async (req, res, _p, body) => {
  const patient = getPatient(req);
  if (!patient) return json(res, 401, { error: "Not signed in." });
  const plan = body.planId
    ? db.prepare("SELECT * FROM plans WHERE id = ? AND patient_id = ?").get(body.planId, patient.id)
    : db.prepare("SELECT * FROM plans WHERE patient_id = ? AND status = 'active' ORDER BY created_at DESC").get(patient.id);
  const takenAt = body.takenAt || new Date().toISOString();
  db.prepare("INSERT INTO dose_logs (patient_id, plan_id, taken_at, dose, site, notes) VALUES (?,?,?,?,?,?)")
    .run(patient.id, plan ? plan.id : null, takenAt, body.dose || (plan ? plan.dose : ""), body.site || "", body.notes || "");
  if (plan && !plan.first_dose_at) {
    db.prepare("UPDATE plans SET first_dose_at = ? WHERE id = ?").run(takenAt, plan.id);
  }
  json(res, 200, { ok: true });
});

// Patient reports a medication vial/pen as finished — flags the doctor to
// arrange a refill rather than silently letting the program lapse.
route("POST", "/api/portal/plans/:id/finished", (req, res, p) => {
  const patient = getPatient(req);
  if (!patient) return json(res, 401, { error: "Not signed in." });
  const plan = db.prepare("SELECT * FROM plans WHERE id = ? AND patient_id = ?").get(p.id, patient.id);
  if (!plan) return json(res, 404, { error: "Program not found." });
  db.prepare("UPDATE plans SET needs_refill = 1, refill_requested_at = datetime('now') WHERE id = ?").run(plan.id);
  json(res, 200, { ok: true });
});

route("POST", "/api/portal/checkins", async (req, res, _p, body) => {
  const patient = getPatient(req);
  if (!patient) return json(res, 401, { error: "Not signed in." });
  const plan = db.prepare("SELECT * FROM plans WHERE patient_id = ? AND status = 'active' ORDER BY created_at DESC").get(patient.id);
  const symptoms = body.symptoms && typeof body.symptoms === "object" ? body.symptoms : {};
  const alerts = checkinFlag(symptoms);
  const date = body.date || new Date().toISOString().slice(0, 10);
  db.prepare("INSERT INTO checkins (patient_id, plan_id, date, weight_kg, symptoms_json, notes, flagged) VALUES (?,?,?,?,?,?,?)")
    .run(patient.id, plan ? plan.id : null, date, body.weightKg || null, JSON.stringify(symptoms), body.notes || "", alerts.length ? 1 : 0);
  json(res, 200, { ok: true, flagged: alerts.length > 0, alerts });
});

route("GET", "/api/portal/messages", (req, res) => {
  const patient = getPatient(req);
  if (!patient) return json(res, 401, { error: "Not signed in." });
  const messages = db.prepare("SELECT * FROM messages WHERE patient_id = ? ORDER BY created_at ASC").all(patient.id);
  db.prepare("UPDATE messages SET read_at = datetime('now') WHERE patient_id = ? AND sender = 'doctor' AND read_at IS NULL").run(patient.id);
  json(res, 200, withSender(messages, patient.doctor_id));
});

route("POST", "/api/portal/messages", async (req, res, _p, body) => {
  const patient = getPatient(req);
  if (!patient) return json(res, 401, { error: "Not signed in." });
  if (!body.body || !String(body.body).trim()) return json(res, 400, { error: "Message is empty." });
  db.prepare("INSERT INTO messages (patient_id, sender, body) VALUES (?,?,?)").run(patient.id, "patient", String(body.body).trim());
  json(res, 200, { ok: true });
});

// ── dispatcher ───────────────────────────────────────────────────
async function handleApi(req, res, pathname) {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.rx);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = Number(m[i + 1]); });
    const body = ["POST", "PATCH", "PUT"].includes(req.method) ? await readBody(req) : {};
    try {
      await r.handler(req, res, params, body);
    } catch (err) {
      console.error(`API error ${req.method} ${pathname}:`, err);
      if (!res.headersSent) json(res, 500, { error: "Server error." });
    }
    return true;
  }
  return false;
}

module.exports = { handleApi };
