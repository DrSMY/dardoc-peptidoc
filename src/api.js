// JSON API for both the doctor dashboard and the patient portal.
const crypto = require("node:crypto");
const https = require("node:https");
const { db, hashSecret, verifySecret } = require("./db");
const presets = require("./presets");
const protocolMap = require("./protocol-map.js");
const { guidePdf } = require("./guide-pdf");

const SESSION_HOURS = { doctor: 24 * 14, patient: 24 * 90 };

// ── helpers ──────────────────────────────────────────────────────
function json(res, status, data, headers) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...(headers || {}) });
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
  const u = db.prepare(`SELECT u.id, u.email, u.name, u.role, u.credentials, u.signature, u.clinic, u.active,
      u.org_id, u.platform_admin, o.name AS org_name, o.slug AS org_slug, o.app_name, o.logo_version
    FROM users u LEFT JOIN organizations o ON o.id = u.org_id
    WHERE u.id = ? AND u.active = 1`).get(s.ref_id);
  if (!u) return null;
  // An organisation can be switched off without deleting anything; its staff
  // then cannot sign in, exactly like a deactivated account.
  const org = db.prepare("SELECT active FROM organizations WHERE id = ?").get(u.org_id);
  if (org && !org.active) return null;
  return u;
}

// Every patient belongs to exactly one organisation, and so does everything
// hanging off a patient. This predicate scopes any table with a patient_id.
const IN_ORG = "patient_id IN (SELECT id FROM patients WHERE org_id = ?)";

// A patient, but only if the signed-in user's organisation owns them. Used
// wherever a patient is reached by id, so one practice cannot read or write
// another's records by guessing a number.
// Date of birth as YYYY-MM-DD → a real, past calendar date, or null.
function parseDob(v) {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const age = ageFromDob(m[0]);
  return age >= 0 && age <= 120 ? m[0] : null;
}
function ageFromDob(dob, today) {
  const t = today || new Date();
  const [y, m, d] = dob.split("-").map(Number);
  let age = t.getFullYear() - y;
  if ((t.getMonth() + 1) * 100 + t.getDate() < m * 100 + d) age--;
  return age;
}
// With a date of birth on file the age is always derived from it.
function withLiveAge(row) {
  if (row && row.dob) row.age = ageFromDob(row.dob);
  return row;
}

function patientInOrg(id, user) {
  const row = db.prepare("SELECT * FROM patients WHERE id = ?").get(id);
  return row && row.org_id === user.org_id ? withLiveAge(row) : null;
}
const NOT_IN_ORG = { error: "Not found in your organisation." };

// The platform owner: sets up organisations and can manage any of them.
function requirePlatformAdmin(req) {
  const user = getDoctor(req);
  return user && user.platform_admin ? user : null;
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

// URL of an organisation's logo image, or "" when it has none. The version
// stamp busts caches whenever the logo is replaced or removed.
function orgLogoUrl(orgId, version) {
  return orgId && version ? `/api/org-logo/${orgId}?v=${version}` : "";
}

function normMobile(m) {
  return String(m || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "");
}

// The clinician who signed a program. Looked up per plan rather than taken
// from the session, so a guide opened months later — or by a different
// doctor, or by an admin — still shows who actually prescribed it.
function signerFor(userId) {
  const u = db.prepare(`SELECT u.name, u.credentials, u.signature, u.clinic, u.org_id, o.name AS org_name, o.app_name, o.logo_version
    FROM users u LEFT JOIN organizations o ON o.id = u.org_id WHERE u.id = ?`).get(userId);
  return {
    name: u ? u.name : "Your doctor",
    credentials: (u && u.credentials) || "",
    signature: (u && u.signature) || "",
    clinic: (u && (u.clinic || u.org_name)) || "",
    // The organisation's own patient-facing app, only when it actually has
    // one — a practice with no such app gets guide text that never assumes
    // it exists (see buildGuideText's appName fallback in guide.js).
    appName: (u && u.app_name) || "",
    // The clinic's own logo, when it has uploaded one — the guide header shows
    // this instead of any house branding.
    logoUrl: u ? orgLogoUrl(u.org_id, u.logo_version) : "",
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

// The full approved dose ladder for a GLP-1 medication (e.g. Mounjaro's
// 2.5mg → 15mg) — reference data, not a commitment to where this patient's
// dose is headed. The guide shows this list plus the patient's current
// dose, rather than a week-by-week schedule the doctor might revise.
function doseOptionsFor(category, medication) {
  if (category !== "glp1") return [];
  const cfg = presets.GLP1_MEDICATIONS[medication];
  return (cfg && cfg.doses) || [];
}

// The short reference facts the patient-facing text guide draws on — how
// the medication works, its common side effects, and what should prompt an
// urgent call rather than a routine message. Sourced from the same
// presets.js records the rest of the app already treats as authoritative
// (GLP1_INFO/PEPTIDE_INFO's one-line summaries, and GLP1_ELIGIBILITY's
// shared red-flag list — peptides carry their own per-product list).
function glp1VideoLink(medication) {
  const row = db.prepare("SELECT url FROM glp1_video_links WHERE medication = ?").get(medication);
  return (row && row.url) || "";
}

function guideInfoFor(category, medication) {
  const info = category === "glp1" ? presets.GLP1_INFO[medication] : presets.PEPTIDE_INFO[medication];
  if (!info) return null;
  const redFlags = category === "glp1" ? presets.GLP1_ELIGIBILITY.redFlags : (info.redFlags || []);
  return {
    howItWorks: info.howItWorks || "", commonSideEffects: info.commonSideEffects || "", redFlags,
    videoLink: category === "glp1" ? glp1VideoLink(medication) : "",
  };
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
    doseOptions: doseOptionsFor(row.category, row.medication),
    guideInfo: guideInfoFor(row.category, row.medication),
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
// `:token` matches an opaque URL-safe string; every other `:name` is a number.
function route(method, pattern, handler) {
  const keys = [];
  const rx = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return k === "token" ? "([A-Za-z0-9_-]{10,64})" : "(\\d+)"; }) + "$");
  routes.push({ method, rx, keys, handler });
}

// ── auth: doctor ─────────────────────────────────────────────────
route("POST", "/api/auth/login", async (req, res, _p, body) => {
  const email = String(body.email || "").toLowerCase().trim();
  const user = userWithOrg("u.email = ?", email);
  if (!user || !verifySecret(body.password || "", user.password_hash)) {
    return json(res, 401, { error: "Invalid email or password." });
  }
  if (!user.active) return json(res, 403, { error: "This account has been deactivated." });
  setSession(res, "doctor", user.id);
  json(res, 200, publicUser(user));
});

// The staff fields the dashboard may see — never the password hash. Every
// caller must pass a row that carries org_name (see userWithOrg below); the
// clinic/orgName fields fall back to that organisation's real name, never
// to a name that belongs to a different tenant.
function publicUser(u) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    credentials: u.credentials || "", signature: u.signature || "",
    clinic: u.clinic || u.org_name || "", active: u.active === undefined ? 1 : u.active,
    orgId: u.org_id || null, orgName: u.org_name || u.clinic || "", platformAdmin: !!u.platform_admin,
    appName: u.app_name || "",
    logoUrl: orgLogoUrl(u.org_id, u.logo_version),
  };
}

// A single user row with its organisation's name attached — the only shape
// publicUser() should ever be given.
function userWithOrg(where, ...vals) {
  return db.prepare(`SELECT u.*, o.name AS org_name, o.app_name, o.logo_version FROM users u
    LEFT JOIN organizations o ON o.id = u.org_id WHERE ${where}`).get(...vals);
}

route("POST", "/api/auth/logout", (req, res) => { clearSession(req, res, "doctor"); json(res, 200, { ok: true }); });

route("GET", "/api/me", (req, res) => {
  const user = getDoctor(req);
  if (!user) return json(res, 401, { error: "Not signed in." });
  json(res, 200, publicUser(user));
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
function dbGlp1VideoLinks() {
  const out = {};
  for (const r of db.prepare("SELECT medication, url FROM glp1_video_links").all()) if (r.url) out[r.medication] = r.url;
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
    glp1VideoLinks: dbGlp1VideoLinks(),
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
  const user = userWithOrg("u.email = ?", email);
  if (!user || !verifySecret(body.password || "", user.password_hash) || user.role !== "superadmin" || !user.active) {
    return json(res, 401, { error: "Invalid email or password." });
  }
  setSession(res, "doctor", user.id);
  json(res, 200, publicUser(user));
});

// ── platform: organisations ─────────────────────────────────────
// Each organisation is a separate practice with its own staff and its own
// patients. A new one starts empty — no patients, no programs, no history —
// and shares only the clinical library (protocols, peptide info, the
// knowledge base), which is the prescriber's guidebook rather than anyone's
// patient data.
function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org";
}

route("GET", "/api/admin/orgs", (req, res) => {
  if (!requirePlatformAdmin(req)) return json(res, 403, { error: "Only the platform owner can manage organisations." });
  const rows = db.prepare("SELECT * FROM organizations ORDER BY active DESC, name").all();
  const staff = db.prepare("SELECT org_id, COUNT(*) n FROM users WHERE active = 1 GROUP BY org_id").all();
  const pats = db.prepare("SELECT org_id, COUNT(*) n FROM patients WHERE archived = 0 GROUP BY org_id").all();
  const byOrgStaff = Object.fromEntries(staff.map((r) => [r.org_id, r.n]));
  const byOrgPats = Object.fromEntries(pats.map((r) => [r.org_id, r.n]));
  json(res, 200, rows.map((o) => ({ ...o, staff: byOrgStaff[o.id] || 0, patients: byOrgPats[o.id] || 0 })));
});

// Creating an organisation also creates its first super admin — otherwise
// nobody could ever sign in to it.
route("POST", "/api/admin/orgs", async (req, res, _p, body) => {
  if (!requirePlatformAdmin(req)) return json(res, 403, { error: "Only the platform owner can manage organisations." });
  const name = String(body.name || "").trim();
  if (!name) return json(res, 400, { error: "Organisation name is required." });
  let slug = String(body.slug || "").trim() || slugify(name);
  if (db.prepare("SELECT id FROM organizations WHERE slug = ?").get(slug)) {
    let n = 2;
    while (db.prepare("SELECT id FROM organizations WHERE slug = ?").get(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  const email = String(body.adminEmail || "").toLowerCase().trim();
  const adminName = String(body.adminName || "").trim();
  if (!email || !adminName) return json(res, 400, { error: "The first super admin's name and email are required." });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: "Enter a valid email address." });
  if (String(body.adminPassword || "").length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return json(res, 409, { error: "That email already has an account." });

  db.exec("BEGIN");
  try {
    const r = db.prepare("INSERT INTO organizations (name, slug, contact_email) VALUES (?,?,?)")
      .run(name, slug, String(body.contactEmail || "").trim());
    const orgId = Number(r.lastInsertRowid);
    db.prepare(`INSERT INTO users (email, password_hash, name, role, org_id, clinic, credentials)
      VALUES (?,?,?,'superadmin',?,?,?)`)
      .run(email, hashSecret(body.adminPassword), adminName, orgId, name, String(body.adminCredentials || "").trim());
    db.exec("COMMIT");
    const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(orgId);
    json(res, 200, { ...org, staff: 1, patients: 0 });
  } catch (e) {
    db.exec("ROLLBACK");
    json(res, 500, { error: "Could not create the organisation: " + e.message });
  }
});

route("PUT", "/api/admin/orgs/:id", async (req, res, p, body) => {
  const me = requirePlatformAdmin(req);
  if (!me) return json(res, 403, { error: "Only the platform owner can manage organisations." });
  const org = db.prepare("SELECT * FROM organizations WHERE id = ?").get(Number(p.id));
  if (!org) return json(res, 404, { error: "Organisation not found." });
  const sets = [], vals = [];
  if (body.name !== undefined) { sets.push("name = ?"); vals.push(String(body.name).trim()); }
  if (body.contactEmail !== undefined) { sets.push("contact_email = ?"); vals.push(String(body.contactEmail).trim()); }
  // The organisation's own patient app, if it has one (e.g. "DarDoc App") —
  // sent as "" to clear it deliberately, distinct from never having set it.
  if (body.appName !== undefined) { sets.push("app_name = ?"); vals.push(String(body.appName).trim()); }
  if (body.active !== undefined) {
    const next = body.active ? 1 : 0;
    // Switching off the organisation you are signed in to would lock you out.
    if (!next && org.id === me.org_id) return json(res, 400, { error: "You cannot deactivate your own organisation." });
    sets.push("active = ?"); vals.push(next);
    if (!next) db.prepare("DELETE FROM sessions WHERE kind = 'doctor' AND ref_id IN (SELECT id FROM users WHERE org_id = ?)").run(org.id);
  }
  if (!sets.length) return json(res, 400, { error: "Nothing to update." });
  db.prepare(`UPDATE organizations SET ${sets.join(", ")} WHERE id = ?`).run(...vals, org.id);
  json(res, 200, db.prepare("SELECT * FROM organizations WHERE id = ?").get(org.id));
});

// ── organisation logo ───────────────────────────────────────────
// Uploaded by the organisation's own super admin (or the platform owner) and
// shown on every patient guide in place of any house branding. PNG / JPEG /
// WebP only: SVG can carry script, and the bytes are checked rather than
// trusting the declared type.
const LOGO_MAX_BYTES = 700 * 1024;
function sniffImageMime(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}
function orgBrandingUser(req, orgId) {
  const u = getDoctor(req);
  if (!u) return null;
  return u.platform_admin || (u.role === "superadmin" && u.org_id === orgId) ? u : null;
}

// Public on purpose: the guide page a patient opens has no session.
route("GET", "/api/org-logo/:id", (req, res, p) => {
  const row = db.prepare("SELECT mime, data FROM org_logos WHERE org_id = ?").get(p.id);
  if (!row) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {
    "Content-Type": row.mime, "Cache-Control": "public, max-age=86400",
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'",
  });
  res.end(Buffer.from(row.data));
});

route("POST", "/api/orgs/:id/logo", async (req, res, p, body) => {
  if (!orgBrandingUser(req, p.id)) return json(res, 403, { error: "Only this organisation's super admin can change its logo." });
  if (!db.prepare("SELECT id FROM organizations WHERE id = ?").get(p.id)) return json(res, 404, { error: "Organisation not found." });
  const m = String(body.dataUrl || "").match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return json(res, 400, { error: "Choose a PNG, JPG or WebP image." });
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > LOGO_MAX_BYTES) return json(res, 400, { error: "That image is too large — keep the logo under 700 KB." });
  const mime = sniffImageMime(buf);
  if (!mime) return json(res, 400, { error: "That file is not a valid PNG, JPG or WebP image." });
  const version = Date.now();
  db.prepare(`INSERT INTO org_logos (org_id, mime, data) VALUES (?,?,?)
    ON CONFLICT(org_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = datetime('now')`).run(p.id, mime, buf);
  db.prepare("UPDATE organizations SET logo_version = ? WHERE id = ?").run(version, p.id);
  json(res, 200, { logoUrl: orgLogoUrl(p.id, version) });
});

route("DELETE", "/api/orgs/:id/logo", (req, res, p) => {
  if (!orgBrandingUser(req, p.id)) return json(res, 403, { error: "Only this organisation's super admin can change its logo." });
  db.prepare("DELETE FROM org_logos WHERE org_id = ?").run(p.id);
  db.prepare("UPDATE organizations SET logo_version = 0 WHERE id = ?").run(p.id);
  json(res, 200, { logoUrl: "" });
});

// ── super admin: the clinical team ──────────────────────────────
// Doctors sign their own consultations, so each one is a real user with
// their own login and signature. Admins get the same read access to
// patients and programs but cannot prescribe — see requireClinician.
const STAFF_ROLES = ["doctor", "admin", "superadmin"];

route("GET", "/api/admin/users", (req, res) => {
  const me = requireSuperadmin(req);
  if (!me) return json(res, 401, { error: "Not signed in as super admin." });
  // A super admin manages their own organisation's staff. The platform owner
  // may look into another organisation by naming it.
  const org = me.platform_admin && req.query && req.query.org ? Number(req.query.org) : me.org_id;
  const rows = db.prepare(`SELECT u.*, o.name AS org_name FROM users u
    LEFT JOIN organizations o ON o.id = u.org_id
    WHERE u.org_id = ? ORDER BY u.active DESC, u.role, u.name`).all(org).map(publicUser);
  const counts = db.prepare("SELECT doctor_id, COUNT(*) n FROM patients WHERE archived = 0 AND org_id = ? GROUP BY doctor_id").all(org);
  const byDoctor = Object.fromEntries(counts.map((c) => [c.doctor_id, c.n]));
  json(res, 200, rows.map((u) => ({ ...u, patients: byDoctor[u.id] || 0 })));
});

route("POST", "/api/admin/users", async (req, res, _p, body) => {
  const me = requireSuperadmin(req);
  if (!me) return json(res, 401, { error: "Not signed in as super admin." });
  const email = String(body.email || "").toLowerCase().trim();
  const name = String(body.name || "").trim();
  const role = STAFF_ROLES.includes(body.role) ? body.role : "doctor";
  if (!name || !email) return json(res, 400, { error: "Name and email are required." });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: "Enter a valid email address." });
  if (String(body.password || "").length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return json(res, 409, { error: "That email already has an account." });
  const org = me.platform_admin && body.orgId ? Number(body.orgId) : me.org_id;
  const orgRow = db.prepare("SELECT * FROM organizations WHERE id = ?").get(org);
  if (!orgRow) return json(res, 400, { error: "Unknown organisation." });
  const r = db.prepare(`INSERT INTO users (email, password_hash, name, role, credentials, signature, clinic, org_id)
    VALUES (?,?,?,?,?,?,?,?)`).run(email, hashSecret(body.password), name, role,
      String(body.credentials || "").trim(), String(body.signature || "").trim(),
      String(body.clinic || orgRow.name).trim(), org);
  json(res, 200, publicUser(userWithOrg("u.id = ?", Number(r.lastInsertRowid))));
});

route("PUT", "/api/admin/users/:id", async (req, res, p, body) => {
  const me = requireSuperadmin(req);
  if (!me) return json(res, 401, { error: "Not signed in as super admin." });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(p.id));
  if (!user) return json(res, 404, { error: "User not found." });
  if (user.org_id !== me.org_id && !me.platform_admin) return json(res, 404, NOT_IN_ORG);

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
  const activeSupers = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'superadmin' AND active = 1 AND org_id = ?").get(user.org_id).n;
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
  json(res, 200, publicUser(userWithOrg("u.id = ?", user.id)));
});

// A clinician edits their own signature without needing the super admin.
route("PUT", "/api/me/signature", async (req, res, _p, body) => {
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  db.prepare("UPDATE users SET name = ?, credentials = ?, signature = ?, clinic = ? WHERE id = ?")
    .run(String(body.name || me.name).trim(), String(body.credentials || "").trim(),
      String(body.signature || "").trim(), String(body.clinic || me.org_name || "").trim(), me.id);
  json(res, 200, publicUser(userWithOrg("u.id = ?", me.id)));
});

route("GET", "/api/admin/me", (req, res) => {
  const user = requireSuperadmin(req);
  if (!user) return json(res, 401, { error: "Not signed in as super admin." });
  json(res, 200, publicUser(user));
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

// GLP-1 patient-education video links — one optional URL per medication,
// pasted in by the super admin (never guessed or auto-filled). Shown in the
// guide only for the medications that have one set.
route("GET", "/api/admin/glp1-video-links", (req, res) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  const links = dbGlp1VideoLinks();
  json(res, 200, Object.keys(presets.GLP1_INFO).map((medication) => ({ medication, url: links[medication] || "" })));
});

route("POST", "/api/admin/glp1-video-links", async (req, res, _p, body) => {
  if (!requireSuperadmin(req)) return json(res, 401, { error: "Not signed in as super admin." });
  const medication = String(body.medication || "").trim();
  if (!medication) return json(res, 400, { error: "Medication is required." });
  db.prepare(`
    INSERT INTO glp1_video_links (medication, url) VALUES (?, ?)
    ON CONFLICT(medication) DO UPDATE SET url = excluded.url, updated_at = datetime('now')`)
    .run(medication, String(body.url || "").trim());
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
// "range" scopes the practice-statistics block (prescriptions, consultations,
// category/medication/doctor breakdowns) to a trailing window — the rest of
// the dashboard (open alerts, pending refills, due follow-ups) always shows
// everything outstanding regardless of range, since those are todo lists, not
// historical reporting.
const DASHBOARD_RANGES = { "14": 14, "30": 30, "90": 90, "180": 180 };
// A file created by a patient form isn't a consultation until a doctor publishes it.
const NOT_FORM_ONLY = "id NOT IN (SELECT patient_id FROM patient_forms WHERE status = 'submitted' AND new_patient = 1)";
function rangeSinceSql(range) {
  const days = DASHBOARD_RANGES[range];
  return days ? `datetime('now','-${days} days')` : "datetime('0001-01-01')";
}

// Everyone in the practice sees who is due within the next week or overdue,
// one row per patient, so whoever is free can contact them. A patient who has
// already asked for this refill is in the Refill requests list instead.
const REFILL_DUE_WINDOW = "+7 days";
function refillDueRows(orgId) {
  const rows = new Map();
  const planRows = db.prepare(`
    SELECT pl.medication, pl.dose, pl.next_followup, date(pl.next_followup) AS due_day, p.id AS patient_id, p.name AS patient_name, p.title, p.mobile, p.email, u.name AS doctor_name
    FROM plans pl JOIN patients p ON p.id = pl.patient_id LEFT JOIN users u ON u.id = pl.doctor_id
    WHERE pl.status = 'active' AND COALESCE(pl.needs_refill, 0) = 0 AND pl.next_followup IS NOT NULL
      AND date(pl.next_followup) <= date('now', ?) AND p.archived = 0 AND p.org_id = ?
      AND NOT EXISTS (SELECT 1 FROM refill_due_ignored i WHERE i.patient_id = p.id AND i.due = date(pl.next_followup))
    ORDER BY pl.next_followup ASC`).all(REFILL_DUE_WINDOW, orgId);
  for (const r of planRows) {
    const med = `${r.medication}${r.dose ? " " + r.dose : ""}`;
    const row = rows.get(r.patient_id);
    if (row) {
      if (!row.medications.includes(med)) row.medications.push(med);
      if (!row.dues.includes(r.due_day)) row.dues.push(r.due_day);
    } else rows.set(r.patient_id, { kind: "refill", patient_id: r.patient_id, patient_name: r.patient_name, title: r.title || "", mobile: r.mobile, email: r.email || "", doctor_name: r.doctor_name || "", due: r.next_followup, dues: [r.due_day], medications: [med] });
  }
  // Patients whose latest visit ended with nothing prescribed have no refill,
  // but their follow-up still needs a reminder.
  const visitRows = db.prepare(`
    SELECT v.next_followup, date(v.next_followup) AS due_day, p.id AS patient_id, p.name AS patient_name, p.title, p.mobile, p.email, u.name AS doctor_name
    FROM visit_records v JOIN patients p ON p.id = v.patient_id LEFT JOIN users u ON u.id = v.doctor_id
    WHERE v.id = (SELECT MAX(id) FROM visit_records WHERE patient_id = p.id)
      AND v.next_followup IS NOT NULL AND date(v.next_followup) <= date('now', ?) AND p.archived = 0 AND p.org_id = ?
      AND NOT EXISTS (SELECT 1 FROM refill_due_ignored i WHERE i.patient_id = p.id AND i.due = date(v.next_followup))
      AND NOT EXISTS (SELECT 1 FROM plans pl WHERE pl.patient_id = p.id AND pl.status = 'active')`).all(REFILL_DUE_WINDOW, orgId);
  for (const r of visitRows) {
    rows.set(r.patient_id, { kind: "followup", patient_id: r.patient_id, patient_name: r.patient_name, title: r.title || "", mobile: r.mobile, email: r.email || "", doctor_name: r.doctor_name || "", due: r.next_followup, dues: [r.due_day], medications: [] });
  }
  return [...rows.values()].sort((a, b) => String(a.due).localeCompare(String(b.due)));
}

// Just the list, for the reminder count on the navigation bar.
route("GET", "/api/refills/due", (req, res) => {
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  json(res, 200, refillDueRows(me.org_id));
});

// Takes a patient off the list for the dates on their row. A new date, set by
// their next refill or visit, brings them back.
route("POST", "/api/refills/due/:id/ignore", (req, res, p) => {
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  const patient = patientInOrg(p.id, me);
  if (!patient) return json(res, 404, NOT_IN_ORG);
  const row = refillDueRows(me.org_id).find((r) => r.patient_id === patient.id);
  const dues = row ? row.dues : [];
  const add = db.prepare("INSERT OR IGNORE INTO refill_due_ignored (patient_id, due, ignored_by) VALUES (?, ?, ?)");
  for (const due of dues) add.run(patient.id, due, me.id);
  json(res, 200, { dues, rows: refillDueRows(me.org_id) });
});

// Undo, for the dates that press of Ignore covered.
route("POST", "/api/refills/due/:id/restore", (req, res, p, body) => {
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  const patient = patientInOrg(p.id, me);
  if (!patient) return json(res, 404, NOT_IN_ORG);
  const drop = db.prepare("DELETE FROM refill_due_ignored WHERE patient_id = ? AND due = ?");
  for (const due of Array.isArray(body.dues) ? body.dues : []) drop.run(patient.id, String(due));
  json(res, 200, { rows: refillDueRows(me.org_id) });
});

route("GET", "/api/dashboard", (req, res) => {
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  const org = me.org_id;
  const since = rangeSinceSql(req.query && req.query.range);
  const activePatients = db.prepare(`SELECT COUNT(DISTINCT patient_id) AS n FROM plans WHERE status = 'active' AND ${IN_ORG}`).get(org).n;
  const totalPatients = db.prepare("SELECT COUNT(*) AS n FROM patients WHERE archived = 0 AND org_id = ?").get(org).n;
  const checkins7 = db.prepare(`SELECT COUNT(*) AS n FROM checkins WHERE created_at > datetime('now','-7 days') AND ${IN_ORG}`).get(org).n;
  const doses7 = db.prepare(`SELECT COUNT(*) AS n FROM dose_logs WHERE created_at > datetime('now','-7 days') AND ${IN_ORG}`).get(org).n;
  const unread = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE sender = 'patient' AND read_at IS NULL AND ${IN_ORG}`).get(org).n;
  const alerts = db.prepare(`
    SELECT c.*, p.name AS patient_name, p.mobile FROM checkins c
    JOIN patients p ON p.id = c.patient_id
    WHERE c.flagged = 1 AND c.reviewed = 0 AND p.org_id = ?
    ORDER BY c.created_at DESC LIMIT 30`).all(org)
    .map((c) => ({ ...c, symptoms: JSON.parse(c.symptoms_json || "{}"), symptoms_json: undefined }));
  const refillRequests = db.prepare(`
    SELECT pl.id AS plan_id, pl.category, pl.medication, pl.dose, pl.quantity, pl.refill_requested_at,
      p.id AS patient_id, p.name AS patient_name, p.mobile,
      rr.id AS request_id, rr.side_effects, rr.weight_kg, rr.results_felt, rr.dose_action, rr.requested_dose, rr.notes,
      rr.has_side_effects, rr.side_effect_severity
    FROM plans pl
    JOIN patients p ON p.id = pl.patient_id
    LEFT JOIN refill_requests rr ON rr.id = (
      SELECT id FROM refill_requests WHERE plan_id = pl.id AND status = 'pending' ORDER BY id DESC LIMIT 1)
    WHERE pl.needs_refill = 1 AND p.org_id = ?
    ORDER BY pl.refill_requested_at DESC LIMIT 30`).all(org);
  const refillDue = refillDueRows(org);
  const patientForms = patientFormRows(org);
  const recent = db.prepare(`
    SELECT * FROM (
      SELECT 'checkin' AS type, c.created_at AS created_at, p.name AS patient_name, p.id AS patient_id,
             c.weight_kg AS detail, c.flagged AS flagged
      FROM checkins c JOIN patients p ON p.id = c.patient_id WHERE p.org_id = ?
      UNION ALL
      SELECT 'dose' AS type, d.created_at AS created_at, p.name AS patient_name, p.id AS patient_id,
             d.dose AS detail, 0 AS flagged
      FROM dose_logs d JOIN patients p ON p.id = d.patient_id WHERE p.org_id = ?
    ) ORDER BY created_at DESC LIMIT 20`).all(org, org);

  // Practice statistics (prescriptions = every published plan; consultations
  // completed = every registered patient, since both are created together at
  // publish time in this app's flow) — scoped to the selected range.
  const prescriptionsTotal = db.prepare(`SELECT COUNT(*) AS n FROM plans WHERE created_at >= ${since} AND ${IN_ORG}`).get(org).n;
  const consultationsTotal = db.prepare(`SELECT COUNT(*) AS n FROM patients WHERE archived = 0 AND org_id = ? AND created_at >= ${since} AND ${NOT_FORM_ONLY}`).get(org).n;
  const categoryBreakdown = db.prepare(`
    SELECT category, COUNT(*) AS n FROM plans WHERE created_at >= ${since} AND ${IN_ORG} GROUP BY category`).all(org);
  const medBreakdown = db.prepare(`
    SELECT medication, category, COUNT(*) AS n FROM plans WHERE created_at >= ${since} AND ${IN_ORG}
    GROUP BY medication, category ORDER BY n DESC LIMIT 8`).all(org);
  const recentPlans = db.prepare(`
    SELECT created_at, category FROM plans
    WHERE created_at > datetime('now','-14 days') AND ${IN_ORG}`).all(org);
  // One row per clinician on staff, so a practice with several doctors can see
  // who's seeing whom — zero rows for a solo practice collapse this panel
  // away client-side rather than showing a lone, redundant total.
  const doctorBreakdown = db.prepare(`
    SELECT u.id AS doctor_id, u.name AS doctor_name,
      (SELECT COUNT(*) FROM patients WHERE doctor_id = u.id AND created_at >= ${since} AND ${NOT_FORM_ONLY}) AS consultations,
      (SELECT COUNT(*) FROM plans WHERE doctor_id = u.id AND created_at >= ${since}) AS prescriptions
    FROM users u
    WHERE u.org_id = ? AND u.role IN ('doctor','superadmin') AND u.active = 1
    ORDER BY consultations DESC, u.name ASC`).all(org);
  const refillsTotal = db.prepare(`
    SELECT COUNT(*) AS n FROM refill_requests
    WHERE status = 'approved' AND decided_at >= ${since} AND patient_id IN (SELECT id FROM patients WHERE org_id = ?)`).get(org).n;

  json(res, 200, {
    activePatients, totalPatients, checkins7, doses7, unread, alerts, refillDue, patientForms, recent, refillRequests,
    prescriptionsTotal, consultationsTotal, categoryBreakdown, medBreakdown, recentPlans, doctorBreakdown, refillsTotal,
  });
});

// ── doctor: full messages inbox (every patient thread, most recent first) ──
route("GET", "/api/messages/inbox", (req, res) => {
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  const rows = db.prepare(`
    SELECT p.id AS patient_id, p.name AS patient_name, p.mobile,
      (SELECT body FROM messages m WHERE m.patient_id = p.id ORDER BY m.created_at DESC LIMIT 1) AS last_body,
      (SELECT sender FROM messages m WHERE m.patient_id = p.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
      (SELECT created_at FROM messages m WHERE m.patient_id = p.id ORDER BY m.created_at DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM messages m WHERE m.patient_id = p.id AND m.sender = 'patient' AND m.read_at IS NULL) AS unread
    FROM patients p
    WHERE p.archived = 0 AND p.org_id = ? AND EXISTS (SELECT 1 FROM messages m WHERE m.patient_id = p.id)
    ORDER BY last_at DESC`).all(me.org_id);
  json(res, 200, rows);
});

// Full recent-activity feed (dose logs + check-ins), for the dedicated
// Recent activity page — the dashboard keeps its own 20-row slice.
route("GET", "/api/activity", (req, res) => {
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  const rows = db.prepare(`
    SELECT * FROM (
      SELECT 'checkin' AS type, c.created_at AS created_at, p.name AS patient_name, p.id AS patient_id,
             c.weight_kg AS detail, c.flagged AS flagged
      FROM checkins c JOIN patients p ON p.id = c.patient_id WHERE p.org_id = ?
      UNION ALL
      SELECT 'dose' AS type, d.created_at AS created_at, p.name AS patient_name, p.id AS patient_id,
             d.dose AS detail, 0 AS flagged
      FROM dose_logs d JOIN patients p ON p.id = d.patient_id WHERE p.org_id = ?
    ) ORDER BY created_at DESC LIMIT 150`).all(me.org_id, me.org_id);
  json(res, 200, rows);
});

// ── patients ─────────────────────────────────────────────────────
route("GET", "/api/patients", (req, res) => {
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  const rows = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM plans pl WHERE pl.patient_id = p.id AND pl.status = 'active') AS active_plans,
      (SELECT title FROM plans pl WHERE pl.patient_id = p.id AND pl.status = 'active' ORDER BY pl.created_at DESC LIMIT 1) AS current_plan,
      (SELECT weight_kg FROM checkins c WHERE c.patient_id = p.id AND c.weight_kg IS NOT NULL ORDER BY c.date DESC, c.id DESC LIMIT 1) AS last_weight,
      (SELECT MAX(created_at) FROM (
         SELECT created_at FROM dose_logs WHERE patient_id = p.id
         UNION ALL SELECT created_at FROM checkins WHERE patient_id = p.id
      )) AS last_activity,
      (SELECT COUNT(*) FROM checkins c WHERE c.patient_id = p.id AND c.flagged = 1 AND c.reviewed = 0) AS open_alerts,
      (SELECT COUNT(*) FROM messages m WHERE m.patient_id = p.id AND m.sender = 'patient' AND m.read_at IS NULL) AS unread_msgs
    FROM patients p WHERE p.archived = 0 AND p.org_id = ?
    ORDER BY p.created_at DESC`).all(me.org_id);
  json(res, 200, rows.map((r) => ({ ...withLiveAge(r), pin_hash: undefined })));
});

route("POST", "/api/patients", async (req, res, _p, body) => {
  const doc = requireClinician(req);
  if (!doc) return json(res, 403, NOT_CLINICIAN);
  const name = String(body.name || "").trim();
  const mobile = normMobile(body.mobile);
  if (!name || !mobile) return json(res, 400, { error: "Name and mobile number are required." });
  const dup = db.prepare("SELECT id, org_id FROM patients WHERE mobile = ?").get(mobile);
  // Mobile is the patient's portal login, so it has to stay unique across the
  // whole install, not just within one organisation.
  if (dup) {
    return json(res, 409, dup.org_id === doc.org_id
      ? { error: "A patient with this mobile number already exists.", patientId: dup.id }
      : { error: "That mobile number is already registered to another organisation." });
  }
  let dob = null;
  if (body.dob) {
    dob = parseDob(body.dob);
    if (!dob) return json(res, 400, { error: "Enter a valid date of birth." });
  }
  const pin = generatePin();
  // The weight entered when a patient is first registered is both their
  // starting weight and (for that first visit) their current weight.
  const startWeight = body.startWeightKg || body.weightKg || null;
  const r = db.prepare(`INSERT INTO patients
    (doctor_id, org_id, name, mobile, pin_hash, title, age, dob, gender, height_cm, start_weight_kg, current_weight_kg, max_weight_kg, goal_weight_kg, activity_level, chronic_illnesses, medications, allergies, notes, intake_json, email, national_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(doc.id, doc.org_id, name, mobile, hashSecret(pin), body.title || "", dob ? ageFromDob(dob) : (body.age || null), dob, body.gender || "",
      body.heightCm || null, startWeight, body.weightKg || startWeight, body.maxWeightKg || null, body.goalWeightKg || null,
      body.activityLevel || "Sedentary",
      body.chronicIllnesses || "", body.medications || "", body.allergies || "", body.notes || "",
      JSON.stringify(body.intake || {}), body.email || "", body.nationalId || "");
  json(res, 200, { id: Number(r.lastInsertRowid), pin });
});

route("GET", "/api/patients/:id", (req, res, p) => {
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  const patient = patientInOrg(p.id, me);
  if (!patient) return json(res, 404, NOT_IN_ORG);
  const plans = db.prepare("SELECT * FROM plans WHERE patient_id = ? ORDER BY created_at DESC").all(p.id).map(parsePlan);
  const doses = db.prepare("SELECT * FROM dose_logs WHERE patient_id = ? ORDER BY taken_at DESC LIMIT 200").all(p.id);
  const checkins = db.prepare("SELECT * FROM checkins WHERE patient_id = ? ORDER BY date DESC, id DESC LIMIT 200").all(p.id)
    .map((c) => ({ ...c, symptoms: JSON.parse(c.symptoms_json || "{}"), symptoms_json: undefined }));
  const messages = db.prepare("SELECT * FROM messages WHERE patient_id = ? ORDER BY created_at ASC").all(p.id);
  db.prepare("UPDATE messages SET read_at = datetime('now') WHERE patient_id = ? AND sender = 'patient' AND read_at IS NULL").run(p.id);
  const refillRequests = db.prepare(`
    SELECT rr.*, u.name AS decided_by_name FROM refill_requests rr
    LEFT JOIN users u ON u.id = rr.decided_by
    WHERE rr.patient_id = ? ORDER BY rr.created_at DESC`).all(p.id);
  const visits = db.prepare("SELECT * FROM visit_records WHERE patient_id = ? ORDER BY id DESC").all(p.id).map(parseVisit);
  const patientForms = db.prepare("SELECT * FROM patient_forms WHERE patient_id = ? AND status IN ('submitted','completed') ORDER BY id DESC").all(p.id).map((f) => {
    const answers = formJson(f.answers_json, null);
    return { ...formListRow(f), summary: answers ? formSummaryText(f, answers, formJson(f.flags_json, []), p.id) : "" };
  });
  const intake = JSON.parse(patient.intake_json || "{}");
  json(res, 200, { patient: { ...patient, pin_hash: undefined, intake_json: undefined, intake },
    plans, doses, checkins, messages: withSender(messages, patient.doctor_id), refillRequests, visits, patientForms });
});

route("PATCH", "/api/patients/:id", async (req, res, p, body) => {
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  const patient = patientInOrg(p.id, me);
  if (!patient) return json(res, 404, NOT_IN_ORG);
  const fields = { name: "name", title: "title", age: "age", gender: "gender", heightCm: "height_cm",
    // `weightKg` from a follow-up consultation is this visit's *current*
    // weight — the original starting weight is only ever touched via the
    // explicit `startWeightKg` field, so it stays the true baseline.
    weightKg: "current_weight_kg", startWeightKg: "start_weight_kg",
    maxWeightKg: "max_weight_kg", goalWeightKg: "goal_weight_kg",
    activityLevel: "activity_level", chronicIllnesses: "chronic_illnesses",
    medications: "medications", allergies: "allergies", notes: "notes", archived: "archived", email: "email",
    nationalId: "national_id" };
  const sets = [], vals = [];
  // A date of birth replaces a typed age; clearing it (sent as "") leaves the
  // typed age in force.
  if (body.dob !== undefined) {
    if (!body.dob) sets.push("dob = NULL");
    else {
      const dob = parseDob(body.dob);
      if (!dob) return json(res, 400, { error: "Enter a valid date of birth." });
      sets.push("dob = ?"); vals.push(dob);
      body.age = ageFromDob(dob);
    }
  }
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
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const patient = patientInOrg(p.id, me);
  if (!patient) return json(res, 404, NOT_IN_ORG);
  const pin = generatePin();
  db.prepare("UPDATE patients SET pin_hash = ? WHERE id = ?").run(hashSecret(pin), p.id);
  db.prepare("DELETE FROM sessions WHERE kind = 'patient' AND ref_id = ?").run(p.id);
  json(res, 200, { pin });
});

// ── incomplete consultations ("save for later") ──────────────────
// A snapshot of the wizard's client-side state — nothing here touches the
// real patients/plans tables. Scoped to the doctor's organisation (any
// clinician on the team can pick one up), never to platform admins crossing
// into a practice.
route("GET", "/api/drafts", (req, res) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const rows = db.prepare("SELECT id, label, progress, mobile, updated_at FROM wizard_drafts WHERE org_id = ? ORDER BY updated_at DESC").all(me.org_id);
  json(res, 200, rows);
});

route("GET", "/api/drafts/:id", (req, res, p) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const row = db.prepare("SELECT * FROM wizard_drafts WHERE id = ? AND org_id = ?").get(p.id, me.org_id);
  if (!row) return json(res, 404, { error: "Draft not found." });
  json(res, 200, { id: row.id, label: row.label, state: JSON.parse(row.state_json || "{}") });
});

route("POST", "/api/drafts", async (req, res, _p, body) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const r = db.prepare("INSERT INTO wizard_drafts (doctor_id, org_id, label, progress, mobile, state_json, form_id) VALUES (?,?,?,?,?,?,?)")
    .run(me.id, me.org_id, String(body.label || "").trim(), String(body.progress || "").trim(), String(body.mobile || "").trim(), JSON.stringify(body.state || {}), Number(body.formId) || null);
  json(res, 200, { id: Number(r.lastInsertRowid) });
});

route("PUT", "/api/drafts/:id", async (req, res, p, body) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const row = db.prepare("SELECT id FROM wizard_drafts WHERE id = ? AND org_id = ?").get(p.id, me.org_id);
  if (!row) return json(res, 404, { error: "Draft not found." });
  db.prepare("UPDATE wizard_drafts SET label = ?, progress = ?, mobile = ?, state_json = ?, updated_at = datetime('now') WHERE id = ?")
    .run(String(body.label || "").trim(), String(body.progress || "").trim(), String(body.mobile || "").trim(), JSON.stringify(body.state || {}), p.id);
  json(res, 200, { ok: true });
});

route("DELETE", "/api/drafts/:id", (req, res, p) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  db.prepare("DELETE FROM wizard_drafts WHERE id = ? AND org_id = ?").run(p.id, me.org_id);
  json(res, 200, { ok: true });
});

// ── visits with no medication prescribed ─────────────────────────
// What the guide needs — the private note and EMR text are added only for
// clinicians (see parseVisit).
function publicVisit(row) {
  const safe = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
  return {
    id: row.id, kind: "visit", signedBy: signerFor(row.doctor_id), diet: safe(row.diet_json, {}), goals: safe(row.goals_json, []),
    medicationWhy: row.medication_why || "", advice: row.advice || "", labTests: safe(row.lab_tests_json, []),
    suppList: safe(row.supplements_json, []), next_followup: row.next_followup, created_at: row.created_at,
  };
}
function parseVisit(row) {
  return { ...publicVisit(row), clinical_note: row.clinical_note || "", clinical_suggestion: row.clinical_suggestion || "" };
}
function latestVisitRow(patientId) {
  return db.prepare("SELECT * FROM visit_records WHERE patient_id = ? ORDER BY id DESC LIMIT 1").get(patientId);
}

route("POST", "/api/patients/:id/visits", async (req, res, p, body) => {
  const doc = requireClinician(req);
  if (!doc) return json(res, 403, NOT_CLINICIAN);
  if (!patientInOrg(p.id, doc)) return json(res, 404, NOT_IN_ORG);
  const followupDays = Number(body.followupDays) || 28;
  const r = db.prepare(`INSERT INTO visit_records
    (patient_id, doctor_id, clinical_note, clinical_suggestion, diet_json, goals_json, medication_why, advice, lab_tests_json, supplements_json, next_followup)
    VALUES (?,?,?,?,?,?,?,?,?,?,date('now', ?))`)
    .run(p.id, doc.id, String(body.clinicalNote || ""), String(body.clinicalSuggestion || ""), JSON.stringify(body.diet || {}),
      JSON.stringify(Array.isArray(body.goals) ? body.goals : []), String(body.medicationWhy || ""), String(body.advice || ""),
      JSON.stringify(body.labTests || []), JSON.stringify(body.suppList || []), `+${followupDays} days`);
  json(res, 200, { id: Number(r.lastInsertRowid) });
});

// ── shareable guide links ────────────────────────────────────────
// A doctor sends a patient a private link; it opens their current active
// guide as a web page with no sign-in, and can be reopened until it expires
// or is disabled. The token is 192 random bits, so it is the credential —
// hence noindex/no-store on everything served through it.
// Short private link codes: 10 characters from an alphabet without look-alikes
// (no 0/O, 1/l/I), about 58 bits, unguessable but tidy in a WhatsApp message.
const LINK_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
function linkCode() {
  let out = "";
  for (const b of crypto.randomBytes(10)) out += LINK_ALPHABET[b % LINK_ALPHABET.length];
  return out;
}
const GUIDE_LINK_DAYS = 90;
const NOINDEX = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

function activeGuideLink(patientId) {
  return db.prepare(`SELECT * FROM guide_links WHERE patient_id = ? AND revoked_at IS NULL
    AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`).get(patientId);
}
function guideLinkInfo(l) {
  return { token: l.token, expiresAt: l.expires_at, views: l.views, lastViewedAt: l.last_viewed_at, createdAt: l.created_at };
}

route("POST", "/api/patients/:id/guide-link", async (req, res, p, body) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const patient = patientInOrg(p.id, me);
  if (!patient) return json(res, 404, NOT_IN_ORG);
  if (!db.prepare("SELECT 1 AS x FROM plans WHERE patient_id = ? AND status = 'active'").get(p.id) && !latestVisitRow(p.id)) {
    return json(res, 400, { error: "This patient has no guide to share yet." });
  }
  // Regenerating retires every earlier link — the way to cut off a link that
  // went to the wrong person.
  if (body.renew) db.prepare("UPDATE guide_links SET revoked_at = datetime('now') WHERE patient_id = ? AND revoked_at IS NULL").run(p.id);
  let link = activeGuideLink(p.id);
  if (link) {
    // Sending again keeps the same link working and pushes its expiry out.
    db.prepare("UPDATE guide_links SET expires_at = datetime('now', ?) WHERE id = ?").run(`+${GUIDE_LINK_DAYS} days`, link.id);
  } else {
    db.prepare("INSERT INTO guide_links (token, patient_id, created_by, expires_at) VALUES (?,?,?,datetime('now', ?))")
      .run(linkCode(), p.id, me.id, `+${GUIDE_LINK_DAYS} days`);
  }
  link = activeGuideLink(p.id);
  json(res, 200, guideLinkInfo(link));
});

route("DELETE", "/api/patients/:id/guide-link", (req, res, p) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  if (!patientInOrg(p.id, me)) return json(res, 404, NOT_IN_ORG);
  db.prepare("UPDATE guide_links SET revoked_at = datetime('now') WHERE patient_id = ? AND revoked_at IS NULL").run(p.id);
  json(res, 200, { ok: true });
});

// Only what the guide page renders — never clinical notes, contact details,
// staff ids or anything else on the plan row.
function sharedPlan(row) {
  const p = parsePlan(row);
  return {
    id: p.id, category: p.category, title: p.title, medication: p.medication, dose: p.dose, quantity: p.quantity,
    route: p.route, frequency: p.frequency, phases: p.phases, instructions: p.instructions, warnings: p.warnings,
    diet: p.diet, blood_test: p.blood_test, supplements: p.supplements, labTests: p.labTests, suppList: p.suppList,
    next_followup: p.next_followup, created_at: p.created_at, updated_at: p.updated_at, status: p.status,
    signedBy: p.signedBy, revisedBy: p.revisedBy, doseOptions: p.doseOptions, guideInfo: p.guideInfo,
    needs_refill: !!p.needs_refill,
  };
}

// Public: the token is the credential. Expired, disabled and unknown links
// all answer identically so a link cannot be probed.
// What a patient's guide shows: their active programs, or, with none, the
// latest visit's health plan. Null when there's nothing to show.
function guidePayload(patient) {
  const rows = db.prepare("SELECT * FROM plans WHERE patient_id = ? AND status = 'active' ORDER BY created_at DESC, id DESC").all(patient.id);
  const visitRow = rows.length ? null : latestVisitRow(patient.id);
  if (!rows.length && !visitRow) return null;
  rows.sort((a, b) => (b.category === "glp1") - (a.category === "glp1"));
  const org = db.prepare("SELECT id, name, logo_version FROM organizations WHERE id = ?").get(patient.org_id);
  return {
    // Gender only decides whether pregnancy advice is shown.
    patient: { title: patient.title || "", name: patient.name, gender: patient.gender || "" },
    clinic: org ? { name: org.name, logoUrl: orgLogoUrl(org.id, org.logo_version) } : { name: "", logoUrl: "" },
    plans: rows.map(sharedPlan),
    visit: visitRow ? publicVisit(visitRow) : null,
  };
}

function guideLinkPatient(token) {
  const link = db.prepare("SELECT * FROM guide_links WHERE token = ? AND revoked_at IS NULL AND expires_at > datetime('now')").get(token);
  const patient = link && db.prepare("SELECT * FROM patients WHERE id = ? AND archived = 0").get(link.patient_id);
  return patient ? { link, patient } : null;
}

route("GET", "/api/guide/:token", (req, res, p) => {
  const found = guideLinkPatient(p.token);
  if (!found) return json(res, 404, { error: "This guide link is no longer available. Please ask your clinic to send you a new one." }, NOINDEX);
  const payload = guidePayload(found.patient);
  if (!payload) return json(res, 410, { error: "This guide is no longer active. Please contact your clinic." }, NOINDEX);
  db.prepare("UPDATE guide_links SET views = views + 1, last_viewed_at = datetime('now') WHERE id = ?").run(found.link.id);
  json(res, 200, payload, NOINDEX);
});

// The guide as a PDF file: the patient's own copy from their link, or one the
// doctor attaches to a message. It names the facility and carries no web
// address, so nothing in it leads back to the link.
function sendGuidePdf(res, patient, payload) {
  const logoRow = db.prepare("SELECT mime, data FROM org_logos WHERE org_id = ?").get(patient.org_id);
  const pdf = guidePdf(payload, { logo: logoRow && /png/i.test(logoRow.mime) ? Buffer.from(logoRow.data) : null });
  const who = `${patient.title ? patient.title + " " : ""}${patient.name || ""}`.trim();
  const name = `${payload.visit ? "Health plan" : "Treatment guide"} - ${who}`.replace(/[^\p{L}\p{N} ._-]/gu, "").trim() || "Treatment guide";
  const ascii = name.replace(/[^\x20-\x7E]/g, "").trim() || "Treatment guide";
  res.writeHead(200, {
    ...NOINDEX,
    "Content-Type": "application/pdf",
    "Content-Length": pdf.length,
    "Content-Disposition": `inline; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}.pdf`,
  });
  res.end(pdf);
}

route("GET", "/api/guide/:token/pdf", (req, res, p) => {
  const found = guideLinkPatient(p.token);
  if (!found) return json(res, 404, { error: "This guide link is no longer available. Please ask your clinic to send you a new one." }, NOINDEX);
  const payload = guidePayload(found.patient);
  if (!payload) return json(res, 410, { error: "This guide is no longer active. Please contact your clinic." }, NOINDEX);
  sendGuidePdf(res, found.patient, payload);
});

route("GET", "/api/patients/:id/guide-pdf", (req, res, p) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const patient = patientInOrg(p.id, me);
  if (!patient) return json(res, 404, NOT_IN_ORG);
  const payload = guidePayload(patient);
  if (!payload) return json(res, 400, { error: "This patient has no guide to share yet." });
  sendGuidePdf(res, patient, payload);
});

// Patient requests a refill through their guide link — no sign-in, the token
// is the credential. Never applies anything by itself; it only logs the
// request as 'pending' for the doctor to review and decide.
route("POST", "/api/guide/:token/plans/:id/refill-request", async (req, res, p, body) => {
  const link = db.prepare("SELECT * FROM guide_links WHERE token = ? AND revoked_at IS NULL AND expires_at > datetime('now')").get(p.token);
  if (!link) return json(res, 404, { error: "This guide link is no longer available. Please ask your clinic to send you a new one." }, NOINDEX);
  const plan = db.prepare("SELECT * FROM plans WHERE id = ? AND patient_id = ? AND status = 'active'").get(p.id, link.patient_id);
  if (!plan) return json(res, 404, { error: "This program is no longer active." }, NOINDEX);
  submitPatientRefillRequest(plan, body);
  json(res, 200, { ok: true }, NOINDEX);
});

// What a link-preview crawler (WhatsApp) should show for /g/<token>. It reads
// the page's HTML without running its script, so this is rendered into the
// <head> by the server — and deliberately carries no patient details.
function guidePageMeta(token) {
  const row = db.prepare(`SELECT o.id, o.name, o.logo_version FROM guide_links g
    JOIN patients p ON p.id = g.patient_id JOIN organizations o ON o.id = p.org_id
    WHERE g.token = ? AND g.revoked_at IS NULL AND g.expires_at > datetime('now')`).get(token);
  return row ? { clinic: row.name, logoUrl: orgLogoUrl(row.id, row.logo_version) } : null;
}

// ── dedicated refill link ──────────────────────────────────────────
// A separate link from the guide link — shareable on its own (e.g. a
// "time for your refill?" message) so the patient lands straight on the
// refill request form rather than the whole treatment guide.
function activeRefillLink(patientId) {
  return db.prepare(`SELECT * FROM refill_links WHERE patient_id = ? AND revoked_at IS NULL
    AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`).get(patientId);
}
function refillLinkInfo(l) {
  return { token: l.token, expiresAt: l.expires_at, views: l.views, lastViewedAt: l.last_viewed_at, createdAt: l.created_at };
}

route("POST", "/api/patients/:id/refill-link", async (req, res, p, body) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const patient = patientInOrg(p.id, me);
  if (!patient) return json(res, 404, NOT_IN_ORG);
  if (!db.prepare("SELECT 1 AS x FROM plans WHERE patient_id = ? AND status = 'active'").get(p.id)) {
    return json(res, 400, { error: "This patient has no active program to request a refill for yet." });
  }
  if (body.renew) db.prepare("UPDATE refill_links SET revoked_at = datetime('now') WHERE patient_id = ? AND revoked_at IS NULL").run(p.id);
  let link = activeRefillLink(p.id);
  if (link) {
    db.prepare("UPDATE refill_links SET expires_at = datetime('now', ?) WHERE id = ?").run(`+${GUIDE_LINK_DAYS} days`, link.id);
  } else {
    db.prepare("INSERT INTO refill_links (token, patient_id, created_by, expires_at) VALUES (?,?,?,datetime('now', ?))")
      .run(linkCode(), p.id, me.id, `+${GUIDE_LINK_DAYS} days`);
  }
  link = activeRefillLink(p.id);
  json(res, 200, refillLinkInfo(link));
});

route("DELETE", "/api/patients/:id/refill-link", (req, res, p) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  if (!patientInOrg(p.id, me)) return json(res, 404, NOT_IN_ORG);
  db.prepare("UPDATE refill_links SET revoked_at = datetime('now') WHERE patient_id = ? AND revoked_at IS NULL").run(p.id);
  json(res, 200, { ok: true });
});

// Only what the refill-request page needs — never clinical notes or contact
// details. Narrower than sharedPlan() since there's no guide content here.
function refillLinkPlan(row) {
  const p = parsePlan(row);
  return {
    id: p.id, category: p.category, medication: p.medication, dose: p.dose, route: p.route,
    frequency: p.frequency, quantity: p.quantity, doseOptions: p.doseOptions, needs_refill: !!p.needs_refill,
  };
}

// Public: the token is the credential. Expired, disabled and unknown links
// all answer identically so a link cannot be probed.
route("GET", "/api/refill/:token", (req, res, p) => {
  const unavailable = () => json(res, 404, { error: "This link is no longer available. Please ask your clinic to send you a new one." }, NOINDEX);
  const link = db.prepare("SELECT * FROM refill_links WHERE token = ? AND revoked_at IS NULL AND expires_at > datetime('now')").get(p.token);
  if (!link) return unavailable();
  const patient = db.prepare("SELECT * FROM patients WHERE id = ? AND archived = 0").get(link.patient_id);
  if (!patient) return unavailable();
  const rows = db.prepare("SELECT * FROM plans WHERE patient_id = ? AND status = 'active' ORDER BY created_at DESC, id DESC").all(patient.id);
  db.prepare("UPDATE refill_links SET views = views + 1, last_viewed_at = datetime('now') WHERE id = ?").run(link.id);
  const org = db.prepare("SELECT id, name, logo_version FROM organizations WHERE id = ?").get(patient.org_id);
  json(res, 200, {
    patient: { title: patient.title || "", name: patient.name },
    clinic: org ? { name: org.name, logoUrl: orgLogoUrl(org.id, org.logo_version) } : { name: "", logoUrl: "" },
    plans: rows.map(refillLinkPlan),
  }, NOINDEX);
});

// Patient requests a refill through their dedicated refill link — no sign-in,
// the token is the credential. Same as the guide-link version: only ever
// logs a 'pending' request for the doctor to review and decide.
route("POST", "/api/refill/:token/plans/:id/refill-request", async (req, res, p, body) => {
  const link = db.prepare("SELECT * FROM refill_links WHERE token = ? AND revoked_at IS NULL AND expires_at > datetime('now')").get(p.token);
  if (!link) return json(res, 404, { error: "This link is no longer available. Please ask your clinic to send you a new one." }, NOINDEX);
  const plan = db.prepare("SELECT * FROM plans WHERE id = ? AND patient_id = ? AND status = 'active'").get(p.id, link.patient_id);
  if (!plan) return json(res, 404, { error: "This program is no longer active." }, NOINDEX);
  submitPatientRefillRequest(plan, body);
  json(res, 200, { ok: true }, NOINDEX);
});

// What a link-preview crawler (WhatsApp) should show for /r/<token> — same
// idea as guidePageMeta, deliberately carrying no patient details.
function refillPageMeta(token) {
  const row = db.prepare(`SELECT o.id, o.name, o.logo_version FROM refill_links r
    JOIN patients p ON p.id = r.patient_id JOIN organizations o ON o.id = p.org_id
    WHERE r.token = ? AND r.revoked_at IS NULL AND r.expires_at > datetime('now')`).get(token);
  return row ? { clinic: row.name, logoUrl: orgLogoUrl(row.id, row.logo_version) } : null;
}

// ── patient information forms ────────────────────────────────────────
// For a patient who bought their medication before any consultation, or who
// couldn't join one. The team sends a private link, the patient confirms what
// the practice has and fills in the rest. Answers never prescribe anything:
// they wait for a doctor, who reviews them in a pre-filled consultation.
const FORM_LINK_DAYS = 30;
const FORM_MAX_LABS = 12;
const formClean = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);
const formJson = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const intakeOptions = (id) => (presets.INTAKE_QUESTIONS.find((q) => q.id === id) || {}).options || [];
const THYROID_ANSWERS = { no: "No", yes: "Yes", unsure: "Not sure" };
const PANCREAS_ANSWERS = { no: "No", pancreatitis: "Pancreatitis", gallbladder: "Gallbladder problems", both: "Both" };
const ALLERGY_SEVERITIES = ["Mild", "Moderate", "Severe / life-threatening"];

// Thyroid and pancreas questions only matter for a GLP-1 — or when no
// medication has been chosen yet and one may still be.
const formAsksGlp1Questions = (meds) => !meds.length || meds.some((m) => m.category === "glp1");

function cleanFormMeds(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 6).map((m) => ({
    templateId: Number(m && m.templateId) || null,
    medication: formClean(m && m.medication, 120),
    category: ["glp1", "peptide", "custom"].includes(m && m.category) ? m.category : "custom",
    route: formClean(m && m.route, 30),
    frequency: formClean(m && m.frequency, 60),
    dose: formClean(m && m.dose, 120),
    protocolKey: formClean(m && m.protocolKey, 80),
  })).filter((m) => m.medication);
}

// What the practice already knows, in the same shape the form answers in.
// Pregnancy and breastfeeding are deliberately never carried over: they change,
// and an old "No" must not be tapped through.
function formPrefill(p) {
  const i = p.intake || {};
  const list = (v) => (Array.isArray(v) ? v.filter((x) => x !== "Other") : []);
  const out = {
    name: p.name, title: p.title, mobile: p.mobile, email: p.email, dob: p.dob, gender: p.gender,
    heightCm: p.heightCm, weightKg: p.weightKg, medications: p.medications,
    conditionsGate: i.health_conditions__gate, conditions: list(i.health_conditions),
    conditionsOther: i.health_conditions__other, conditionsNotes: i.health_conditions__notes,
    allergiesGate: i.allergies__gate, allergyTypes: list(i.allergies),
    allergyDetails: i.allergies__notes, allergySeverity: i.allergies__severity,
    cancer: i.cancer_history, cancerNotes: i.cancer_history__notes,
    prevUse: i.previous_glp1, prevUseNotes: i.previous_glp1__notes,
    lastLabDate: i.last_lab_date, abnormalLabs: i.abnormal_labs,
  };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) delete out[k];
  }
  return out;
}

// One short row for the dashboard and the patient's chart.
function formListRow(f) {
  const prefill = formJson(f.prefill_json, {});
  return {
    id: f.id, token: f.token, reason: f.reason, status: f.status, name: f.label, mobile: f.mobile, email: f.email,
    title: prefill.title || "", patientId: f.patient_id, newPatient: !!f.new_patient,
    meds: formJson(f.meds_json, []), flags: formJson(f.flags_json, []), urgent: !!f.urgent,
    views: f.views, lastViewedAt: f.last_viewed_at, createdAt: f.created_at, expiresAt: f.expires_at,
    submittedAt: f.submitted_at, completedAt: f.completed_at, createdByName: f.created_by_name || "",
  };
}

function patientFormRows(orgId) {
  const q = `SELECT f.*, u.name AS created_by_name FROM patient_forms f LEFT JOIN users u ON u.id = f.created_by WHERE f.org_id = ?`;
  return {
    toReview: db.prepare(`${q} AND f.status = 'submitted' ORDER BY f.urgent DESC, f.submitted_at ASC LIMIT 50`).all(orgId).map(formListRow),
    waiting: db.prepare(`${q} AND f.status = 'sent' AND f.expires_at > datetime('now') ORDER BY f.created_at DESC LIMIT 50`).all(orgId).map(formListRow),
  };
}

// Checks a submission and returns it in a clean shape. The page checks the
// same things first; this is the check that counts, since anyone holding the
// link can post anything to it.
function readFormAnswers(form, body) {
  const meds = formJson(form.meds_json, []);
  const asksGlp1 = formAsksGlp1Questions(meds);
  const pick = (v, allowed) => (allowed.includes(v) ? v : "");
  const pickList = (v, allowed) => (Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : []);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const a = {
    name: formClean(body.name, 120),
    mobile: normMobile(formClean(body.mobile, 30)),
    email: formClean(body.email, 160).toLowerCase(),
    dob: parseDob(body.dob) || "",
    gender: pick(body.gender, ["Male", "Female", "Other"]),
    heightCm: num(body.heightCm),
    weightKg: num(body.weightKg),
    medConfirm: pick(body.medConfirm, ["yes", "no"]),
    medCorrection: formClean(body.medCorrection, 500),
    pregnancy: pick(body.pregnancy, ["no", "pregnant", "planning"]),
    breastfeeding: pick(body.breastfeeding, ["no", "yes"]),
    conditionsGate: body.conditionsGate === true ? true : body.conditionsGate === false ? false : null,
    conditions: pickList(body.conditions, intakeOptions("health_conditions")),
    conditionsOther: formClean(body.conditionsOther, 300),
    conditionsNotes: formClean(body.conditionsNotes, 1000),
    medsGate: body.medsGate === true ? true : body.medsGate === false ? false : null,
    medications: formClean(body.medications, 1000),
    allergiesGate: body.allergiesGate === true ? true : body.allergiesGate === false ? false : null,
    allergyTypes: pickList(body.allergyTypes, intakeOptions("allergies")),
    allergyDetails: formClean(body.allergyDetails, 1000),
    allergySeverity: pick(body.allergySeverity, ALLERGY_SEVERITIES),
    cancer: pick(body.cancer, intakeOptions("cancer_history")),
    cancerNotes: formClean(body.cancerNotes, 500),
    thyroid: pick(body.thyroid, Object.keys(THYROID_ANSWERS)),
    pancreas: pick(body.pancreas, Object.keys(PANCREAS_ANSWERS)),
    prevUse: pick(body.prevUse, ["No", "Yes"]),
    prevUseNotes: formClean(body.prevUseNotes, 500),
    lastLabDate: parseDob(body.lastLabDate) || "",
    abnormalLabs: (Array.isArray(body.abnormalLabs) ? body.abnormalLabs : []).slice(0, FORM_MAX_LABS)
      .map((l) => ({ name: formClean(l && l.name, 80), value: formClean(l && l.value, 80) }))
      .filter((l) => l.name || l.value),
    notes: formClean(body.notes, 2000),
    confirmed: body.confirmed === true,
  };
  a.age = a.dob ? ageFromDob(a.dob) : null;
  // Answers to questions that were hidden must not linger behind a changed choice.
  if (a.gender === "Male") { a.pregnancy = ""; a.breastfeeding = ""; }
  if (a.conditionsGate !== true) { a.conditions = []; a.conditionsOther = ""; a.conditionsNotes = ""; }
  if (a.medsGate !== true) a.medications = "";
  if (a.allergiesGate !== true) { a.allergyTypes = []; a.allergyDetails = ""; a.allergySeverity = ""; }
  if (a.cancer === "No") { a.cancerNotes = ""; a.thyroid = asksGlp1 ? "no" : ""; }
  if (!asksGlp1) { a.thyroid = ""; a.pancreas = ""; }
  if (a.prevUse !== "Yes") a.prevUseNotes = "";
  if (a.medConfirm !== "no") a.medCorrection = "";
  if (!a.lastLabDate) a.abnormalLabs = [];

  let problem = "";
  if (!a.name) problem = "Please enter your full name.";
  else if (a.mobile.replace(/\D/g, "").length < 7) problem = "Please enter a valid mobile number.";
  else if (a.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email)) problem = "Please check your email address.";
  else if (form.reason === "purchased" && meds.length && !a.medConfirm) problem = "Please confirm the medication you purchased.";
  else if (!a.dob) problem = "Please enter your date of birth.";
  else if (!a.gender) problem = "Please choose your gender.";
  else if (a.gender !== "Male" && (!a.pregnancy || !a.breastfeeding)) problem = "Please answer the pregnancy and breastfeeding questions.";
  else if (a.heightCm < 100 || a.heightCm > 250) problem = "Please enter your height in centimetres.";
  else if (a.weightKg < 25 || a.weightKg > 350) problem = "Please enter your weight in kilograms.";
  else if (a.conditionsGate === null) problem = "Please answer the question about chronic illnesses.";
  else if (a.conditionsGate && !a.conditions.length && !a.conditionsOther) problem = "Please tell us which chronic illnesses you have.";
  else if (a.medsGate === null) problem = "Please answer the question about current medications.";
  else if (a.medsGate && !a.medications) problem = "Please list the medications you take.";
  else if (a.allergiesGate === null) problem = "Please answer the question about allergies.";
  else if (a.allergiesGate && (!a.allergyTypes.length || !a.allergySeverity)) problem = "Please tell us the type of allergy and how severe it was.";
  else if (!a.cancer) problem = "Please answer the question about cancer history.";
  else if (asksGlp1 && !a.thyroid) problem = "Please answer the question about thyroid cancer or MEN 2.";
  else if (asksGlp1 && !a.pancreas) problem = "Please answer the question about pancreatitis and gallbladder problems.";
  else if (!a.prevUse) problem = "Please tell us whether you have used these medications before.";
  else if (body.lastLabDate && !a.lastLabDate) problem = "Please check the date of your last lab test.";
  else if (a.abnormalLabs.some((l) => !l.name)) problem = "Please add the name of each lab test.";
  else if (!a.confirmed) problem = "Please confirm that your answers are correct.";
  return { a, problem };
}

const formDMY = (iso) => iso.split("-").reverse().join("/");
const formLabsText = (labs) => labs.map((l) => [l.name, l.value].filter(Boolean).join(" ")).join("; ");

// What the doctor must look at. "urgent" means the patient has been told not
// to start until they have spoken; "review" means check it before publishing.
function formFlags(form, a) {
  const meds = formJson(form.meds_json, []);
  const hasGlp1 = meds.some((m) => m.category === "glp1");
  const flags = [];
  const urgent = (text) => flags.push({ level: "urgent", text });
  const review = (text) => flags.push({ level: "review", text });
  if (a.age !== null && a.age < 18) urgent(`Under 18 (age ${a.age})`);
  if (a.pregnancy === "pregnant") urgent("Reports being pregnant");
  if (a.pregnancy === "planning") urgent("Planning a pregnancy");
  if (a.breastfeeding === "yes") urgent("Reports breastfeeding");
  if (a.thyroid === "yes") urgent("Medullary thyroid cancer or MEN 2 (self or family)");
  else if (a.thyroid === "unsure") review("Not sure about medullary thyroid cancer or MEN 2");
  if (a.pancreas === "pancreatitis" || a.pancreas === "both") urgent("History of pancreatitis");
  if (a.pancreas === "gallbladder" || a.pancreas === "both") review("History of gallbladder problems");
  if (a.cancer && a.cancer !== "No" && a.thyroid !== "yes") review(`Cancer history: ${a.cancer}${a.cancerNotes ? ` (${a.cancerNotes})` : ""}`);
  if (a.allergySeverity === "Severe / life-threatening") review(`Severe allergic reaction: ${[...a.allergyTypes, a.allergyDetails].filter(Boolean).join(", ")}`);
  if (a.medConfirm === "no") review(`Says the medication on file is not what they purchased${a.medCorrection ? `: ${a.medCorrection}` : ""}`);
  if (a.abnormalLabs.length) review(`Reports abnormal lab results from ${formDMY(a.lastLabDate)}: ${formLabsText(a.abnormalLabs)}`);
  if (a.prevUse === "No") {
    for (const m of meds.filter((x) => x.category === "glp1")) {
      const ladder = doseOptionsFor(m.category, m.medication);
      if (ladder.length && m.dose && m.dose !== ladder[0]) review(`First time on this type of medication, but purchased ${m.medication} ${m.dose}. The starting dose is ${ladder[0]}`);
    }
  }
  if (hasGlp1) {
    const bmi = Math.round((a.weightKg / (a.heightCm / 100) ** 2) * 10) / 10;
    if (bmi < 27) review(`BMI ${bmi} is below the GLP-1 criteria`);
    else if (bmi < 30 && !a.conditionsGate) review(`BMI ${bmi} with no chronic illness reported (GLP-1 criteria need a weight-related condition below BMI 30)`);
  }
  if (form.patient_id && form.mobile && a.mobile !== form.mobile) review(`Gave a different mobile number: +${a.mobile} (file has +${form.mobile})`);
  return flags;
}

// The answers in the consultation's own format, so the pre-filled consultation
// reads exactly as if the doctor had taken them.
function formIntake(form, a) {
  const meds = formJson(form.meds_json, []);
  const intake = {
    health_conditions__gate: a.conditionsGate,
    health_conditions: [...a.conditions, ...(a.conditionsOther ? ["Other"] : [])],
    health_conditions__other: a.conditionsOther,
    health_conditions__notes: a.conditionsNotes,
    allergies__gate: a.allergiesGate,
    allergies: a.allergyTypes,
    allergies__notes: a.allergyDetails,
    allergies__severity: a.allergySeverity,
    cancer_history: a.cancer,
    cancer_history__notes: a.cancerNotes,
    previous_glp1: a.prevUse,
    previous_glp1__notes: a.prevUseNotes,
    additional_notes: a.notes,
  };
  if (a.gender !== "Male") {
    intake.is_pregnant = a.pregnancy === "pregnant" ? "Yes" : "No";
    intake.is_breastfeeding = a.breastfeeding === "yes" ? "Yes" : "No";
    intake.planning_pregnancy = a.pregnancy === "planning" ? "Yes" : "No";
  }
  if (a.thyroid) intake.thyroid_history = THYROID_ANSWERS[a.thyroid];
  if (a.pancreas) intake.pancreas_history = PANCREAS_ANSWERS[a.pancreas];
  if (a.lastLabDate) {
    intake.last_lab_date = a.lastLabDate;
    intake.abnormal_labs = a.abnormalLabs;
  }
  if (meds.some((m) => m.category === "glp1")) intake.health_goals = ["Weight loss"];
  return intake;
}

const formMedsText = (meds) => meds.map((m) => `${m.medication}${m.dose ? " " + m.dose : ""}`).join(", ");

// The whole form as one readable message for the doctor's Messages and the
// patient's file, identifying the patient by name, patient number and mobile.
function formSummaryText(form, a, flags, patientId) {
  const meds = formJson(form.meds_json, []);
  const bmi = Math.round((a.weightKg / (a.heightCm / 100) ** 2) * 10) / 10;
  const list = (items, other, notes) => [...items, other, notes].filter(Boolean).join(", ");
  const urgent = flags.filter((f) => f.level === "urgent");
  const review = flags.filter((f) => f.level === "review");
  const lines = [
    `Patient form — ${meds.length ? formMedsText(meds) : "no medication chosen yet"}`,
    `${a.name}${patientId ? ` · Patient no. ${patientId}` : ""} · Mobile +${a.mobile}${a.email ? ` · ${a.email}` : ""}`,
    form.reason === "purchased" ? "Purchased medication without a consultation." : "Could not join a consultation.",
  ];
  if (urgent.length) lines.push("", "URGENT, told not to start until you have spoken:", ...urgent.map((f) => `- ${f.text}`));
  if (review.length) lines.push("", "Please check:", ...review.map((f) => `- ${f.text}`));
  lines.push("",
    `Date of birth: ${a.dob.split("-").reverse().join("/")} (age ${a.age})`,
    `Gender: ${a.gender}`);
  if (a.gender !== "Male") {
    lines.push(`Pregnant: ${a.pregnancy === "pregnant" ? "Yes" : a.pregnancy === "planning" ? "No, planning a pregnancy" : "No"}`,
      `Breastfeeding: ${a.breastfeeding === "yes" ? "Yes" : "No"}`);
  }
  lines.push(`Height: ${a.heightCm} cm · Weight: ${a.weightKg} kg (BMI ${bmi})`,
    `Chronic illnesses: ${a.conditionsGate ? list(a.conditions, a.conditionsOther, a.conditionsNotes) : "None"}`,
    `Current medications: ${a.medsGate ? a.medications : "None"}`,
    `Allergies: ${a.allergiesGate ? `${list(a.allergyTypes, a.allergyDetails)} (${a.allergySeverity})` : "None"}`,
    `Cancer or tumour history: ${a.cancer}${a.cancerNotes ? ` (${a.cancerNotes})` : ""}`);
  if (a.thyroid) lines.push(`Medullary thyroid cancer or MEN 2: ${THYROID_ANSWERS[a.thyroid]}`);
  if (a.pancreas) lines.push(`Pancreatitis or gallbladder problems: ${PANCREAS_ANSWERS[a.pancreas]}`);
  lines.push(`Previous GLP-1 or peptide use: ${a.prevUse}${a.prevUseNotes ? ` (${a.prevUseNotes})` : ""}`);
  lines.push(`Last lab test: ${a.lastLabDate ? formDMY(a.lastLabDate) : "Not given"}`);
  if (a.lastLabDate) lines.push(`Abnormal results, as reported by the patient: ${a.abnormalLabs.length ? formLabsText(a.abnormalLabs) : "None listed"}`);
  if (a.notes) lines.push(`Note: ${a.notes}`);
  return lines.join("\n");
}

route("POST", "/api/patient-forms", async (req, res, _p, body) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const reason = body.reason === "missed" ? "missed" : "purchased";
  const meds = cleanFormMeds(body.meds);
  if (reason === "purchased" && !meds.length) return json(res, 400, { error: "Choose the medication the patient purchased." });
  const typed = body.patient || {};
  const name = formClean(typed.name, 120);
  const mobile = normMobile(formClean(typed.mobile, 30));
  const email = formClean(typed.email, 160).toLowerCase();
  if (!name) return json(res, 400, { error: "Add the patient's name first." });
  if (!mobile && !email) return json(res, 400, { error: "Add a mobile number or an email address." });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: "Check the email address." });

  // A known patient keeps their file; their record fills in anything not typed.
  let patient = null;
  if (body.patientId) {
    patient = patientInOrg(Number(body.patientId), me);
    if (!patient) return json(res, 404, NOT_IN_ORG);
  } else if (mobile) {
    const dup = db.prepare("SELECT id, org_id FROM patients WHERE mobile = ?").get(mobile);
    if (dup && dup.org_id !== me.org_id) return json(res, 409, { error: "That mobile number is already registered to another organisation." });
    if (dup) patient = patientInOrg(dup.id, me);
  }
  const known = patient ? formPrefill({
    name: patient.name, title: patient.title, mobile: patient.mobile, email: patient.email, dob: patient.dob, gender: patient.gender,
    heightCm: patient.height_cm, weightKg: patient.current_weight_kg || patient.start_weight_kg, medications: patient.medications,
    intake: formJson(patient.intake_json, {}),
  }) : {};
  const prefill = { ...known, ...formPrefill({ ...typed, name, mobile, email }) };

  // Sending again reuses the open link, so the earlier message keeps working.
  const open = db.prepare(`SELECT id FROM patient_forms WHERE org_id = ? AND status = 'sent' AND expires_at > datetime('now')
    AND ((patient_id IS NOT NULL AND patient_id = ?) OR (mobile <> '' AND mobile = ?) OR (email <> '' AND email = ?)) ORDER BY id DESC LIMIT 1`)
    .get(me.org_id, patient ? patient.id : -1, mobile, email);
  let id;
  if (open) {
    id = open.id;
    db.prepare(`UPDATE patient_forms SET patient_id = ?, reason = ?, mobile = ?, email = ?, label = ?, prefill_json = ?, meds_json = ?,
      expires_at = datetime('now', ?) WHERE id = ?`)
      .run(patient ? patient.id : null, reason, mobile, email, name, JSON.stringify(prefill), JSON.stringify(meds), `+${FORM_LINK_DAYS} days`, id);
  } else {
    const r = db.prepare(`INSERT INTO patient_forms (token, org_id, created_by, patient_id, reason, mobile, email, label, prefill_json, meds_json, expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now', ?))`)
      .run(linkCode(), me.org_id, me.id, patient ? patient.id : null, reason, mobile, email, name,
        JSON.stringify(prefill), JSON.stringify(meds), `+${FORM_LINK_DAYS} days`);
    id = Number(r.lastInsertRowid);
  }
  json(res, 200, formListRow(db.prepare("SELECT * FROM patient_forms WHERE id = ?").get(id)));
});

// Everything the doctor needs to open the review: the answers in the
// consultation's format, and whatever the patient's file already holds.
route("GET", "/api/patient-forms/:id", (req, res, p) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const f = db.prepare("SELECT * FROM patient_forms WHERE id = ? AND org_id = ?").get(p.id, me.org_id);
  if (!f) return json(res, 404, { error: "Form not found." });
  const answers = f.answers_json ? formJson(f.answers_json, null) : null;
  const patient = f.patient_id ? patientInOrg(f.patient_id, me) : null;
  const draft = db.prepare("SELECT id FROM wizard_drafts WHERE form_id = ? AND org_id = ? ORDER BY updated_at DESC LIMIT 1").get(f.id, me.org_id);
  json(res, 200, {
    ...formListRow(f),
    draftId: draft ? draft.id : null,
    answers,
    intake: answers ? formIntake(f, answers) : null,
    patient: patient ? {
      id: patient.id, startWeightKg: patient.start_weight_kg, maxWeightKg: patient.max_weight_kg, goalWeightKg: patient.goal_weight_kg,
      nationalId: patient.national_id, activityLevel: patient.activity_level, intake: formJson(patient.intake_json, {}),
    } : null,
  });
});

route("POST", "/api/patient-forms/:id/resend", (req, res, p) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const f = db.prepare("SELECT id FROM patient_forms WHERE id = ? AND org_id = ? AND status = 'sent'").get(p.id, me.org_id);
  if (!f) return json(res, 404, { error: "This form is no longer waiting for the patient." });
  db.prepare("UPDATE patient_forms SET expires_at = datetime('now', ?) WHERE id = ?").run(`+${FORM_LINK_DAYS} days`, f.id);
  json(res, 200, { ok: true });
});

route("POST", "/api/patient-forms/:id/complete", (req, res, p, body) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const f = db.prepare("SELECT id FROM patient_forms WHERE id = ? AND org_id = ? AND status = 'submitted'").get(p.id, me.org_id);
  if (!f) return json(res, 404, { error: "This form has already been dealt with." });
  // A form submitted without a file of its own lands on whichever patient the
  // doctor published it under.
  const patientId = body.patientId && patientInOrg(Number(body.patientId), me) ? Number(body.patientId) : null;
  db.prepare("UPDATE patient_forms SET status = 'completed', completed_at = datetime('now'), completed_by = ?, patient_id = COALESCE(patient_id, ?) WHERE id = ?")
    .run(me.id, patientId, f.id);
  json(res, 200, { ok: true });
});

// Cancels a link still out with the patient, or dismisses one the doctor won't
// take further. Anything already saved to a patient's file stays there.
route("DELETE", "/api/patient-forms/:id", (req, res, p) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  db.prepare("UPDATE patient_forms SET status = 'cancelled' WHERE id = ? AND org_id = ? AND status IN ('sent','submitted')").run(p.id, me.org_id);
  json(res, 200, { ok: true });
});

const formByToken = (token) => db.prepare("SELECT * FROM patient_forms WHERE token = ?").get(token);
const formLinkOpen = (f) => f && f.status === "sent" && !db.prepare("SELECT 1 AS x FROM patient_forms WHERE id = ? AND expires_at <= datetime('now')").get(f.id);

function formClinic(f) {
  const org = db.prepare("SELECT id, name, logo_version FROM organizations WHERE id = ?").get(f.org_id);
  return org ? { name: org.name, logoUrl: orgLogoUrl(org.id, org.logo_version) } : { name: "", logoUrl: "" };
}

// Public: the token is the credential, so unknown, expired and cancelled links
// all answer identically. Once submitted it says so and shows no details.
route("GET", "/api/form/:token", (req, res, p) => {
  const f = formByToken(p.token);
  if (f && (f.status === "submitted" || f.status === "completed")) {
    return json(res, 200, { status: "submitted", clinic: formClinic(f), wait: !!f.urgent }, NOINDEX);
  }
  if (!formLinkOpen(f)) return json(res, 404, { error: "This link is no longer available. Please ask your clinic to send you a new one." }, NOINDEX);
  db.prepare("UPDATE patient_forms SET views = views + 1, last_viewed_at = datetime('now') WHERE id = ?").run(f.id);
  const meds = formJson(f.meds_json, []).map((m) => ({
    medication: m.medication, dose: m.dose, category: m.category, route: m.route, frequency: m.frequency,
    startingDose: doseOptionsFor(m.category, m.medication)[0] || "",
  }));
  json(res, 200, {
    status: "open", reason: f.reason, clinic: formClinic(f), meds, prefill: formJson(f.prefill_json, {}),
    doctorName: signerFor(f.created_by).name || "",
    options: { conditions: intakeOptions("health_conditions"), allergyTypes: intakeOptions("allergies"), cancer: intakeOptions("cancer_history"), allergySeverities: ALLERGY_SEVERITIES },
  }, NOINDEX);
});

route("POST", "/api/form/:token", async (req, res, p, body) => {
  const f = formByToken(p.token);
  if (f && (f.status === "submitted" || f.status === "completed")) return json(res, 409, { error: "We already have your answers. Thank you." }, NOINDEX);
  if (!formLinkOpen(f)) return json(res, 404, { error: "This link is no longer available. Please ask your clinic to send you a new one." }, NOINDEX);
  const { a, problem } = readFormAnswers(f, body);
  if (problem) return json(res, 400, { error: problem }, NOINDEX);
  const flags = formFlags(f, a);
  const intake = formIntake(f, a);

  db.exec("BEGIN");
  try {
    let patientId = f.patient_id, isNew = 0;
    if (!patientId) {
      const dup = db.prepare("SELECT id, org_id FROM patients WHERE mobile = ?").get(a.mobile);
      if (!dup) {
        const r = db.prepare(`INSERT INTO patients
          (doctor_id, org_id, name, mobile, pin_hash, title, age, dob, gender, height_cm, start_weight_kg, current_weight_kg, activity_level, chronic_illnesses, medications, allergies, intake_json, email)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(f.created_by, f.org_id, a.name, a.mobile, hashSecret(generatePin()), formJson(f.prefill_json, {}).title || "", a.age, a.dob, a.gender,
            a.heightCm, a.weightKg, a.weightKg, "Sedentary",
            a.conditionsGate ? [...a.conditions, a.conditionsOther, a.conditionsNotes].filter(Boolean).join(", ") : "",
            a.medications,
            a.allergiesGate ? `${[...a.allergyTypes, a.allergyDetails].filter(Boolean).join(", ")}, severity: ${a.allergySeverity}` : "",
            JSON.stringify(intake), a.email);
        patientId = Number(r.lastInsertRowid);
        isNew = 1;
      } else if (dup.org_id === f.org_id && a.mobile === f.mobile) {
        patientId = dup.id;
      } else {
        // A number already on someone else's file may just be a typo, so the
        // answers are not attached to that file. The doctor sorts it out.
        flags.push({ level: "review", text: `Mobile +${a.mobile} is already on another record. Check it before publishing` });
      }
    }
    if (patientId && !isNew) {
      // A known patient's record only changes when the doctor publishes, but a
      // weight is an observation and goes in now, as it does with a refill.
      db.prepare("INSERT INTO checkins (patient_id, plan_id, date, weight_kg, symptoms_json, notes, flagged) VALUES (?,NULL,?,?,'{}',?,0)")
        .run(patientId, new Date().toISOString().slice(0, 10), a.weightKg, "Reported on the patient information form");
      db.prepare("UPDATE patients SET current_weight_kg = ? WHERE id = ?").run(a.weightKg, patientId);
    }
    if (patientId) {
      db.prepare("INSERT INTO messages (patient_id, sender, body) VALUES (?,?,?)").run(patientId, "patient", formSummaryText(f, a, flags, patientId));
    }
    db.prepare(`UPDATE patient_forms SET status = 'submitted', submitted_at = datetime('now'), answers_json = ?, flags_json = ?, urgent = ?,
      patient_id = ?, new_patient = ?, label = ?, prefill_json = ? WHERE id = ?`)
      .run(JSON.stringify(a), JSON.stringify(flags), flags.some((x) => x.level === "urgent") ? 1 : 0, patientId, isNew, a.name,
        JSON.stringify({ title: formJson(f.prefill_json, {}).title || "" }), f.id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  json(res, 200, { ok: true, wait: flags.some((x) => x.level === "urgent") }, NOINDEX);
});

// What a link-preview crawler should show for /f/<token>: the clinic only.
function formPageMeta(token) {
  const f = formByToken(token);
  if (!formLinkOpen(f)) return null;
  const c = formClinic(f);
  return { clinic: c.name, logoUrl: c.logoUrl };
}

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
    (doctor_id, org_id, name, mobile, pin_hash, title, age, gender, height_cm, start_weight_kg, activity_level,
     chronic_illnesses, medications, allergies, notes, intake_json, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
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
      const imported = db.prepare("SELECT id FROM patients WHERE intake_json LIKE '%\"imported\":true%' AND org_id = ?").all(user.org_id);
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
      const r = insPatient.run(doctorId, user.org_id, String(rec.name || "Unknown").trim() || "Unknown", m, null,
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

// ── AI-assisted intake quick fill ───────────────────────────────
// A doctor pastes a freeform note (a WhatsApp forward, an EMR export, a
// referral letter) and it becomes structured patient fields. The
// deterministic regex parser in public/doctor/app.js handles the clean,
// predictable case ("Ahmed Ali, 0501234567, 35y Male, 180cm, 95kg") well
// enough, but real pasted text is messier than that — a name buried after
// a clinic sign-off, weight given in lbs, a positional list with no units
// at all — which is exactly where a regex reaches its ceiling. This calls
// Claude to do the same extraction properly; the client falls back to the
// deterministic parser when this isn't configured or fails, so quick fill
// never regresses to broken, only to "as good as it always was."
//
// Requires ANTHROPIC_API_KEY in the environment. Without it this route
// answers 503 and the client silently uses its local parser instead.
function anthropicMessages(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-length": Buffer.byteLength(body),
      },
      timeout: 15000,
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Anthropic API request timed out")));
    req.write(body);
    req.end();
  });
}

// Forcing tool use (rather than asking for prose JSON and parsing it back
// out) is what makes this reliable — the response is a validated object
// matching this shape, never a stray sentence or markdown fence to strip.
const QUICKFILL_TOOL = {
  name: "extract_patient_intake",
  description: "Extract structured patient-intake fields from a doctor's freeform note. Omit any field the text doesn't actually state — never guess, infer, or invent a value.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The PATIENT's full name only — never the doctor's, clinic's, or anyone else mentioned in passing (a sign-off, a referring physician, a clinic name)." },
      title: { type: "string", description: "Mr, Mrs, Ms, Dr, etc. — only if the text actually gives the patient one." },
      mobile: { type: "string", description: "Digits only, no spaces, symbols or country-code plus sign." },
      email: { type: "string" },
      nationalId: { type: "string", description: "Emirates ID or passport number." },
      age: { type: "string", description: "Age in whole years, digits only." },
      gender: { type: "string", enum: ["Male", "Female"] },
      heightCm: { type: "string", description: "Height in centimetres. Convert from feet/inches if that's what's given." },
      weightKg: { type: "string", description: "Weight in kilograms. Convert from pounds/lbs if that's what's given." },
      conditionsNote: { type: "string", description: "Chronic illnesses actually mentioned, short comma-separated list (e.g. 'Diabetes, Hypertension')." },
      allergyNote: { type: "string", description: "Allergies actually mentioned, in short form." },
    },
    additionalProperties: false,
  },
};

route("POST", "/api/intake/quickfill", async (req, res, _p, body) => {
  if (!requireClinician(req)) return json(res, 403, NOT_CLINICIAN);
  const text = String(body.text || "").trim().slice(0, 4000);
  if (!text) return json(res, 400, { error: "Nothing to parse." });
  if (!process.env.ANTHROPIC_API_KEY) return json(res, 503, { error: "AI quick fill isn't configured on this server.", unconfigured: true });
  try {
    const { status, data } = await anthropicMessages({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: "You extract patient-intake fields from a doctor's pasted note for a telehealth consultation. Call extract_patient_intake exactly once with only the fields the text actually states. Never invent a value. The name field is always the PATIENT being registered for this consultation — not the doctor, the clinic, or anyone else the text happens to mention.",
      messages: [{ role: "user", content: text }],
      tools: [QUICKFILL_TOOL],
      tool_choice: { type: "tool", name: "extract_patient_intake" },
    });
    if (status !== 200) {
      console.error("Anthropic quickfill error", status, JSON.stringify(data).slice(0, 500));
      return json(res, 502, { error: "AI quick fill failed — used basic parsing instead." });
    }
    const toolUse = (data.content || []).find((b) => b.type === "tool_use");
    json(res, 200, { source: "ai", fields: (toolUse && toolUse.input) || {} });
  } catch (e) {
    console.error("Anthropic quickfill exception", e.message);
    json(res, 502, { error: "AI quick fill failed — used basic parsing instead." });
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
  const patient = body.patientId ? patientInOrg(body.patientId, doc) : null;
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
  const patient = patientInOrg(body.patientId, doc);
  if (!patient) return json(res, 404, NOT_IN_ORG);
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
  const me = getDoctor(req);
  if (!me) return json(res, 401, { error: "Not signed in." });
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(p.id);
  if (!plan) return json(res, 404, { error: "Plan not found." });
  const patient = patientInOrg(plan.patient_id, me);
  if (!patient) return json(res, 404, NOT_IN_ORG);
  json(res, 200, {
    plan: parsePlan(plan),
    patient: { ...patient, pin_hash: undefined, intake_json: undefined, intake: JSON.parse(patient.intake_json || "{}") },
  });
});

route("PATCH", "/api/plans/:id", async (req, res, p, body) => {
  const editor = requireClinician(req);
  if (!editor) return json(res, 403, NOT_CLINICIAN);
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(p.id);
  if (!plan) return json(res, 404, { error: "Plan not found." });
  if (!patientInOrg(plan.patient_id, editor)) return json(res, 404, NOT_IN_ORG);
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

// ── refills: a lightweight update logged against an existing program ─────
// Separate from a brand-new consultation: refilling only ever touches dose,
// quantity and next follow-up on the program that already exists, plus the
// patient's current weight. Every refill — doctor-entered or patient-
// requested — is logged in refill_requests so it shows as a dated update on
// the patient's chart, never as a second consultation.
function cleanMedicationChange(plan, mc) {
  const medication = String((mc && mc.medication) || "").trim();
  if (!medication || medication === plan.medication) return null;
  return {
    medication, category: ["glp1", "peptide", "custom"].includes(mc.category) ? mc.category : "custom",
    title: String(mc.title || medication), route: String(mc.route || plan.route), frequency: String(mc.frequency || plan.frequency),
    halfLifeHours: mc.halfLifeHours || null, phases: Array.isArray(mc.phases) ? mc.phases : [],
    instructions: String(mc.instructions || ""), warnings: String(mc.warnings || ""), diet: mc.diet && typeof mc.diet === "object" ? mc.diet : null,
  };
}

function applyRefillDecision(plan, editor, { dose, quantity, nextFollowup, change }) {
  const sets = ["needs_refill = 0", "updated_at = datetime('now')", "last_edited_by = ?", "last_edited_at = datetime('now')"];
  const vals = [editor.id];
  if (change) {
    // A new medication starts its own dosing cycle, so the first-dose date
    // that drives the portal's cycle tracker starts over too.
    sets.push("category = ?", "medication = ?", "title = ?", "route = ?", "frequency = ?", "half_life_hours = ?", "phases_json = ?", "instructions = ?", "warnings = ?", "first_dose_at = NULL");
    vals.push(change.category, change.medication, change.title, change.route, change.frequency, change.halfLifeHours, JSON.stringify(change.phases), change.instructions, change.warnings);
    if (change.diet) { sets.push("diet_json = ?"); vals.push(JSON.stringify(change.diet)); }
  }
  if (dose !== undefined && dose !== "") { sets.push("dose = ?"); vals.push(dose); }
  if (quantity !== undefined && quantity !== "" && quantity != null) { sets.push("quantity = ?"); vals.push(Number(quantity)); }
  if (nextFollowup !== undefined && nextFollowup !== "") { sets.push("next_followup = ?"); vals.push(nextFollowup); }
  vals.push(plan.id);
  db.prepare(`UPDATE plans SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

// A weight given with a refill is an observation, not a decision, so it goes
// straight into the patient's record: a dated weight entry (the same log
// check-ins write to, so it charts and counts as their latest weight) plus
// their current weight.
function logRefillWeight(plan, weightKg, note) {
  const kg = Number(weightKg);
  if (!kg || kg < 20 || kg > 400) return;
  db.prepare("INSERT INTO checkins (patient_id, plan_id, date, weight_kg, symptoms_json, notes, flagged) VALUES (?,?,?,?,'{}',?,0)")
    .run(plan.patient_id, plan.id, new Date().toISOString().slice(0, 10), kg, note);
  db.prepare("UPDATE patients SET current_weight_kg = ? WHERE id = ?").run(kg, plan.patient_id);
}

const SEVERITY_TEXT = {
  mild: "Mild — noticeable, but didn't disrupt their daily routine",
  moderate: "Moderate — disrupted daily activities (rest, time off or changes needed)",
  severe: "Severe — hard to tolerate, seriously affected daily life, or needed medical help",
};

function refillDoseText(plan, action, requestedDose) {
  const ladder = doseOptionsFor(plan.category, plan.medication);
  const i = ladder.indexOf(plan.dose);
  const step = (d) => (i === -1 ? null : ladder[i + d] || null);
  if (action === "same") return `Keep current dose${plan.dose ? ` (${plan.dose})` : ""}`;
  if (action === "increase") return `Increase dose${step(1) ? ` (next step ${step(1)})` : ""}`;
  if (action === "decrease") return `Lower dose${step(-1) ? ` (previous step ${step(-1)})` : ""}`;
  if (action === "custom") return `Switch to ${requestedDose || "a specific dose"}`;
  if (action === "talk") return "Wants to talk to the doctor before any dose change";
  return "";
}

// The refill request as one readable message — what lands in the doctor's
// Messages, identifying the patient by name, patient number and mobile.
function refillSummaryText(patient, plan, r) {
  const lines = [
    `Refill request — ${plan.medication}${plan.dose ? " " + plan.dose : ""}`,
    `${patient.name} · Patient no. ${patient.id} · Mobile +${patient.mobile}`,
    "",
  ];
  if (r.weight_kg) lines.push(`Weight: ${r.weight_kg} kg`);
  if (r.has_side_effects === "yes") lines.push(`Side effects: ${SEVERITY_TEXT[r.side_effect_severity] || "Yes (severity not given)"}`);
  else if (r.has_side_effects === "no") lines.push("Side effects: None");
  if (r.side_effects) lines.push(`Details: ${r.side_effects}`);
  if (r.results_felt) lines.push(`How it's working: ${r.results_felt}`);
  const dose = refillDoseText(plan, r.dose_action, r.requested_dose);
  if (dose) lines.push(`Next dose: ${dose}`);
  if (r.notes) lines.push(`Message: ${r.notes}`);
  return lines.join("\n");
}

// A patient's own report — submitted through the portal or a shareable link,
// with no sign-in beyond the link's token. It never changes the plan by
// itself: it's logged as 'pending' for the doctor to decide on. Their weight
// is recorded straight away, and the whole request arrives in the doctor's
// Messages as a summary.
function submitPatientRefillRequest(plan, body) {
  const hasSideEffects = ["yes", "no"].includes(body.hasSideEffects) ? body.hasSideEffects : "";
  const severity = hasSideEffects === "yes" && ["mild", "moderate", "severe"].includes(body.sideEffectSeverity) ? body.sideEffectSeverity : "";
  const r = {
    side_effects: String(body.sideEffects || "").trim().slice(0, 2000),
    weight_kg: body.weightKg ? Number(body.weightKg) : null,
    results_felt: String(body.resultsFelt || "").trim().slice(0, 2000),
    dose_action: String(body.doseAction || "").slice(0, 20),
    requested_dose: String(body.requestedDose || "").slice(0, 40),
    notes: String(body.notes || "").trim().slice(0, 2000),
    has_side_effects: hasSideEffects, side_effect_severity: severity,
  };
  db.prepare(`INSERT INTO refill_requests
    (plan_id, patient_id, source, status, side_effects, weight_kg, results_felt, dose_action, requested_dose, notes, prior_dose, prior_medication, has_side_effects, side_effect_severity)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(plan.id, plan.patient_id, "patient", "pending", r.side_effects, r.weight_kg, r.results_felt, r.dose_action,
      r.requested_dose, r.notes, plan.dose || "", plan.medication, r.has_side_effects, r.side_effect_severity);
  db.prepare("UPDATE plans SET needs_refill = 1, refill_requested_at = datetime('now') WHERE id = ?").run(plan.id);
  logRefillWeight(plan, r.weight_kg, `Reported with refill request (${plan.medication})`);
  const patient = db.prepare("SELECT id, name, mobile FROM patients WHERE id = ?").get(plan.patient_id);
  db.prepare("INSERT INTO messages (patient_id, sender, body) VALUES (?,?,?)")
    .run(plan.patient_id, "patient", refillSummaryText(patient, plan, r));
}

// Doctor records a refill in clinic — applies immediately, since the doctor
// is the one deciding right now (no separate review step needed).
route("POST", "/api/plans/:id/refill", async (req, res, p, body) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(p.id);
  if (!plan) return json(res, 404, { error: "Program not found." });
  if (!patientInOrg(plan.patient_id, me)) return json(res, 404, NOT_IN_ORG);
  const dose = body.dose !== undefined ? String(body.dose).trim() : plan.dose;
  const change = cleanMedicationChange(plan, body.medicationChange);
  const r = db.prepare(`INSERT INTO refill_requests
    (plan_id, patient_id, source, status, side_effects, weight_kg, results_felt, dose_action, requested_dose, notes, prior_dose, prior_medication, decided_medication, decided_dose, quantity, decided_by, decided_at)
    VALUES (?,?,'doctor','approved',?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
    .run(plan.id, plan.patient_id,
      String(body.sideEffects || "").slice(0, 2000), body.weightKg ? Number(body.weightKg) : null,
      String(body.resultsFelt || "").slice(0, 2000), String(body.doseAction || "").slice(0, 20),
      String(body.requestedDose || "").slice(0, 40), String(body.notes || "").slice(0, 2000),
      plan.dose || "", plan.medication, change ? change.medication : plan.medication, dose, body.quantity ? Number(body.quantity) : null, me.id);
  applyRefillDecision(plan, me, { dose, quantity: body.quantity, nextFollowup: body.nextFollowup, change });
  logRefillWeight(plan, body.weightKg, `Recorded at refill (${plan.medication})`);
  if (body.message && String(body.message).trim()) {
    db.prepare("INSERT INTO messages (patient_id, sender, body, sender_user_id) VALUES (?,?,?,?)")
      .run(plan.patient_id, "doctor", String(body.message).trim(), me.id);
  }
  json(res, 200, { id: Number(r.lastInsertRowid), ok: true });
});

// Doctor reviews a patient-submitted request — the final decision. Approving
// writes whatever dose/quantity/follow-up the doctor confirms (pre-filled
// client-side from what the patient asked for, but editable); declining just
// closes it out.
route("POST", "/api/refill-requests/:id/decide", async (req, res, p, body) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const reqRow = db.prepare("SELECT * FROM refill_requests WHERE id = ?").get(p.id);
  if (!reqRow) return json(res, 404, { error: "Request not found." });
  const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(reqRow.plan_id);
  if (!plan || !patientInOrg(plan.patient_id, me)) return json(res, 404, NOT_IN_ORG);
  if (reqRow.status !== "pending") return json(res, 400, { error: "This request was already reviewed." });
  const approve = body.decision === "approved";
  const dose = approve ? (body.dose !== undefined ? String(body.dose).trim() : plan.dose) : "";
  const change = approve ? cleanMedicationChange(plan, body.medicationChange) : null;
  db.prepare(`UPDATE refill_requests SET status = ?, decided_dose = ?, prior_medication = ?, decided_medication = ?, quantity = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?`)
    .run(approve ? "approved" : "declined", dose, plan.medication, change ? change.medication : plan.medication, body.quantity ? Number(body.quantity) : null, me.id, p.id);
  if (approve) applyRefillDecision(plan, me, { dose, quantity: body.quantity, nextFollowup: body.nextFollowup, change });
  else db.prepare("UPDATE plans SET needs_refill = 0 WHERE id = ?").run(plan.id);
  if (body.message && String(body.message).trim()) {
    db.prepare("INSERT INTO messages (patient_id, sender, body, sender_user_id) VALUES (?,?,?,?)")
      .run(plan.patient_id, "doctor", String(body.message).trim(), me.id);
  }
  json(res, 200, { ok: true });
});

// ── doctor: review & messages ────────────────────────────────────
route("POST", "/api/checkins/:id/review", (req, res, p) => {
  const me = requireClinician(req);
  if (!me) return json(res, 403, NOT_CLINICIAN);
  const c = db.prepare("SELECT patient_id FROM checkins WHERE id = ?").get(p.id);
  if (!c || !patientInOrg(c.patient_id, me)) return json(res, 404, NOT_IN_ORG);
  db.prepare("UPDATE checkins SET reviewed = 1 WHERE id = ?").run(p.id);
  json(res, 200, { ok: true });
});

route("POST", "/api/patients/:id/messages", async (req, res, p, body) => {
  const doc = requireClinician(req);
  if (!doc) return json(res, 403, NOT_CLINICIAN);
  if (!patientInOrg(p.id, doc)) return json(res, 404, NOT_IN_ORG);
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
  const visitRow = latestVisitRow(patient.id);
  json(res, 200, {
    patient: { ...patient, pin_hash: undefined },
    plans,
    visit: visitRow ? publicVisit(visitRow) : null,
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
  const checkins = db.prepare("SELECT * FROM checkins WHERE patient_id = ? ORDER BY date DESC, id DESC LIMIT 400").all(patient.id)
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

// Patient requests a refill from their own portal — side effects, current
// weight, (peptides) how it's working, and for GLP-1 programs a dose
// preference. Logged as 'pending'; the doctor makes the final call.
route("POST", "/api/portal/plans/:id/refill-request", async (req, res, p, body) => {
  const patient = getPatient(req);
  if (!patient) return json(res, 401, { error: "Not signed in." });
  const plan = db.prepare("SELECT * FROM plans WHERE id = ? AND patient_id = ? AND status = 'active'").get(p.id, patient.id);
  if (!plan) return json(res, 404, { error: "Program not found." });
  submitPatientRefillRequest(plan, body);
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
  const qs = new URL(req.url, "http://localhost").searchParams;
  req.query = Object.fromEntries(qs);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = pathname.match(r.rx);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = k === "token" ? m[i + 1] : Number(m[i + 1]); });
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

module.exports = { handleApi, guidePageMeta, refillPageMeta, formPageMeta };
