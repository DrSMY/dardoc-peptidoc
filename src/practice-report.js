// The practice report a Super admin downloads from the Patients page: one
// Excel workbook for the whole organisation, limited to a period. Sheets:
// Summary, Patients, Consultations & programs, Refills, Weights & check-ins.
// Dates and periods are in UAE time; timestamps are stored in UTC.
"use strict";
const { db } = require("./db");
const presets = require("./presets");
const { workbook, day } = require("./xlsx");

const UAE = 4 * 3600e3;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmtDay = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;

// The period a download covers. `sinceSql` is a UTC timestamp for comparing
// with created_at columns, `sinceDay` a UAE calendar date for date columns;
// both are null for "all".
function periodFor(range, now = new Date()) {
  const here = new Date(now.getTime() + UAE); // read with getUTC*: UAE wall clock
  const y = here.getUTCFullYear(), m = here.getUTCMonth(), d = here.getUTCDate();
  const today = new Date(Date.UTC(y, m, d));
  let start = null, title = "All time", file = `all time to ${fmtDay(today)}`;
  if (range === "month") {
    start = new Date(Date.UTC(y, m, 1));
    title = `This month (${fmtDay(start)} to ${fmtDay(today)})`;
    file = `${MONTHS[m]} ${y}`;
  } else if (range === "3m" || range === "6m") {
    const n = range === "3m" ? 3 : 6;
    const lastDay = new Date(Date.UTC(y, m - n + 1, 0)).getUTCDate(); // 31 May back 3 months is 28 Feb
    start = new Date(Date.UTC(y, m - n, Math.min(d, lastDay)));
    title = `Last ${n} months (${fmtDay(start)} to ${fmtDay(today)})`;
    file = `last ${n} months to ${fmtDay(today)}`;
  }
  return {
    title, file, today,
    sinceSql: start ? new Date(start.getTime() - UAE).toISOString().slice(0, 19).replace("T", " ") : null,
    sinceDay: start ? start.toISOString().slice(0, 10) : null,
  };
}

// A stored value as a calendar date cell: UTC timestamps move to UAE time,
// plain dates (YYYY-MM-DD) are kept as written.
function dateCell(v) {
  if (!v) return null;
  const s = String(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return day(Number(m[1]), Number(m[2]), Number(m[3]));
  const t = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
  if (isNaN(t)) return null;
  const here = new Date(t.getTime() + UAE);
  return day(here.getUTCFullYear(), here.getUTCMonth() + 1, here.getUTCDate());
}

const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const round1 = (v) => (v === null ? null : Math.round(v * 10) / 10);
const fullName = (r) => `${r.title ? r.title + " " : ""}${r.name || ""}`.trim();
const mobile = (v) => (v ? `+${v}` : "");
const CATEGORY = { glp1: "GLP-1", peptide: "Peptide", custom: "Other" };
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "");
const safeJson = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

const SEVERITY = { mild: "Mild", moderate: "Moderate", severe: "Severe" };
const DOSE_ACTION = { same: "Keep the same dose", increase: "Increase the dose", decrease: "Lower the dose", custom: "A specific dose", talk: "Talk to the doctor first" };
const FORM_ONLY = "SELECT patient_id FROM patient_forms WHERE status = 'submitted' AND new_patient = 1";

function practiceReport(org, range, user) {
  const period = periodFor(range);
  const since = period.sinceSql || "0001-01-01 00:00:00";
  const sinceDay = period.sinceDay || "0001-01-01";
  const orgId = org.id;
  const inOrg = "patient_id IN (SELECT id FROM patients WHERE org_id = ? AND archived = 0)";

  // ── Patients: registered in the period, or seen in it ──
  const patients = db.prepare(`
    SELECT p.*, u.name AS doctor_name,
      (SELECT weight_kg FROM checkins c WHERE c.patient_id = p.id AND c.weight_kg IS NOT NULL ORDER BY c.date DESC, c.id DESC LIMIT 1) AS last_weight,
      (SELECT COUNT(*) FROM checkins c WHERE c.patient_id = p.id) AS checkin_count,
      (SELECT COUNT(*) FROM dose_logs d WHERE d.patient_id = p.id) AS dose_count,
      (SELECT MAX(created_at) FROM plans pl WHERE pl.patient_id = p.id) AS last_program,
      (SELECT MAX(created_at) FROM visit_records v WHERE v.patient_id = p.id) AS last_visit,
      (SELECT MAX(COALESCE(decided_at, created_at)) FROM refill_requests r WHERE r.patient_id = p.id AND r.status = 'approved') AS last_refill,
      (SELECT MIN(next_followup) FROM plans pl WHERE pl.patient_id = p.id AND pl.status = 'active' AND pl.next_followup IS NOT NULL) AS next_followup,
      (SELECT next_followup FROM visit_records v WHERE v.patient_id = p.id ORDER BY v.id DESC LIMIT 1) AS visit_followup,
      (SELECT MAX(created_at) FROM (
         SELECT created_at FROM dose_logs WHERE patient_id = p.id
         UNION ALL SELECT created_at FROM checkins WHERE patient_id = p.id)) AS last_activity,
      (p.id IN (${FORM_ONLY})) AS form_only
    FROM patients p LEFT JOIN users u ON u.id = p.doctor_id
    WHERE p.org_id = ? AND p.archived = 0 AND (
      p.created_at >= ?
      OR EXISTS (SELECT 1 FROM plans pl WHERE pl.patient_id = p.id AND pl.created_at >= ?)
      OR EXISTS (SELECT 1 FROM visit_records v WHERE v.patient_id = p.id AND v.created_at >= ?)
      OR EXISTS (SELECT 1 FROM refill_requests r WHERE r.patient_id = p.id AND (r.created_at >= ? OR r.decided_at >= ?))
      OR EXISTS (SELECT 1 FROM checkins c WHERE c.patient_id = p.id AND c.date >= ?)
      OR EXISTS (SELECT 1 FROM dose_logs d WHERE d.patient_id = p.id AND d.created_at >= ?))
    ORDER BY p.created_at DESC, p.id DESC`).all(orgId, since, since, since, since, since, sinceDay, since);
  const activeByPatient = new Map();
  for (const r of db.prepare(`SELECT patient_id, medication, dose FROM plans WHERE status = 'active' AND ${inOrg} ORDER BY created_at DESC`).all(orgId)) {
    const list = activeByPatient.get(r.patient_id) || [];
    list.push(`${r.medication}${r.dose ? " " + r.dose : ""}`);
    activeByPatient.set(r.patient_id, list);
  }
  const patientRows = patients.map((p) => {
    const start = num(p.start_weight_kg);
    const current = num(p.last_weight) ?? num(p.current_weight_kg) ?? start;
    const change = start !== null && current !== null ? round1(current - start) : null;
    const active = activeByPatient.get(p.id) || [];
    const age = p.dob ? ageFrom(p.dob, period.today) : num(p.age);
    const lastConsult = [p.last_program, p.last_visit].filter(Boolean).sort().pop() || null;
    return [
      p.id, p.title || "", p.name, mobile(p.mobile), p.email || "", p.gender || "", age, dateCell(p.dob), num(p.height_cm),
      start, current, change, change !== null && start ? round1((change / start) * 100) : null, num(p.goal_weight_kg),
      presets.calcBMI(num(p.height_cm), current),
      p.chronic_illnesses || "", p.medications || "", p.allergies || "",
      active.join("; "), p.form_only ? "Form awaiting review" : active.length ? "Active program" : "No active program",
      dateCell(p.created_at), p.doctor_name || "", dateCell(lastConsult), dateCell(p.last_refill),
      dateCell(active.length ? p.next_followup : p.visit_followup), dateCell(p.last_activity), p.checkin_count, p.dose_count,
    ];
  });

  // ── Consultations & programs ──
  const plans = db.prepare(`
    SELECT pl.*, p.name, p.title AS p_title, p.mobile, u.name AS doctor_name
    FROM plans pl JOIN patients p ON p.id = pl.patient_id LEFT JOIN users u ON u.id = pl.doctor_id
    WHERE p.org_id = ? AND p.archived = 0 AND pl.created_at >= ? ORDER BY pl.created_at DESC, pl.id DESC`).all(orgId, since);
  const visits = db.prepare(`
    SELECT v.*, p.name, p.title AS p_title, p.mobile, u.name AS doctor_name
    FROM visit_records v JOIN patients p ON p.id = v.patient_id LEFT JOIN users u ON u.id = v.doctor_id
    WHERE p.org_id = ? AND p.archived = 0 AND v.created_at >= ? ORDER BY v.created_at DESC, v.id DESC`).all(orgId, since);
  const consultRows = [
    ...plans.map((pl) => {
      const first = (safeJson(pl.phases_json, []) || [])[0];
      return { at: pl.created_at, row: [dateCell(pl.created_at), pl.patient_id, fullName({ title: pl.p_title, name: pl.name }), mobile(pl.mobile), "Program",
        CATEGORY[pl.category] || cap(pl.category), pl.medication, (first && first.dose) || pl.dose || "", pl.dose || "", cap(pl.route), cap(pl.frequency),
        num(pl.quantity) ?? 1, cap(pl.status), pl.doctor_name || "", dateCell(pl.next_followup)] };
    }),
    ...visits.map((v) => ({ at: v.created_at, row: [dateCell(v.created_at), v.patient_id, fullName({ title: v.p_title, name: v.name }), mobile(v.mobile), "Visit, no medication",
      "", "", "", "", "", "", null, "", v.doctor_name || "", dateCell(v.next_followup)] })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))).map((x) => x.row);

  // ── Refills ──
  const refills = db.prepare(`
    SELECT r.*, p.name, p.title AS p_title, p.mobile, pl.medication AS plan_medication, u.name AS decided_by_name
    FROM refill_requests r JOIN patients p ON p.id = r.patient_id LEFT JOIN plans pl ON pl.id = r.plan_id LEFT JOIN users u ON u.id = r.decided_by
    WHERE p.org_id = ? AND p.archived = 0 AND (r.created_at >= ? OR r.decided_at >= ?) ORDER BY r.created_at DESC, r.id DESC`).all(orgId, since, since);
  const refillRows = refills.map((r) => {
    const before = r.prior_medication || r.plan_medication || "";
    const after = r.decided_medication || before;
    return [dateCell(r.created_at), r.patient_id, fullName({ title: r.p_title, name: r.name }), mobile(r.mobile), before,
      r.source === "patient" ? "Patient request" : "Recorded in clinic", r.status === "approved" ? "Approved" : r.status === "declined" ? "Declined" : "Awaiting review",
      num(r.weight_kg), r.has_side_effects === "yes" ? "Yes" : r.has_side_effects === "no" ? "No" : "", SEVERITY[r.side_effect_severity] || "", r.side_effects || "",
      r.results_felt || "", DOSE_ACTION[r.dose_action] ? `${DOSE_ACTION[r.dose_action]}${r.dose_action === "custom" && r.requested_dose ? `: ${r.requested_dose}` : ""}` : "",
      r.notes || "", r.prior_dose || "", r.decided_dose || "", after !== before ? after : "", num(r.quantity), r.decided_by_name || "", dateCell(r.decided_at)];
  });

  // ── Weights & check-ins ──
  const checkins = db.prepare(`
    SELECT c.*, p.name, p.title AS p_title FROM checkins c JOIN patients p ON p.id = c.patient_id
    WHERE p.org_id = ? AND p.archived = 0 AND c.date >= ? ORDER BY c.date DESC, c.id DESC`).all(orgId, sinceDay);
  const checkinRows = checkins.map((c) => {
    const s = safeJson(c.symptoms_json, {}) || {};
    return [dateCell(c.date), c.patient_id, fullName({ title: c.p_title, name: c.name }), num(c.weight_kg),
      ...presets.SYMPTOMS.map((sym) => s[sym.key] || ""), c.notes || "", c.flagged ? "Yes" : "", c.flagged ? (c.reviewed ? "Yes" : "No") : ""];
  });

  // ── Summary ──
  const count = (sql, ...args) => db.prepare(sql).get(...args).n;
  const newPatients = count(`SELECT COUNT(*) AS n FROM patients WHERE org_id = ? AND archived = 0 AND created_at >= ? AND id NOT IN (${FORM_ONLY})`, orgId, since);
  const approved = count(`SELECT COUNT(*) AS n FROM refill_requests WHERE status = 'approved' AND decided_at >= ? AND ${inOrg}`, since, orgId);
  const requested = count(`SELECT COUNT(*) AS n FROM refill_requests WHERE source = 'patient' AND created_at >= ? AND ${inOrg}`, since, orgId);
  const doses = count(`SELECT COUNT(*) AS n FROM dose_logs WHERE created_at >= ? AND ${inOrg}`, since, orgId);
  const activeNow = count(`SELECT COUNT(DISTINCT patient_id) AS n FROM plans WHERE status = 'active' AND ${inOrg}`, orgId);
  const byDoctor = db.prepare(`
    SELECT u.name,
      (SELECT COUNT(*) FROM patients WHERE doctor_id = u.id AND org_id = ? AND archived = 0 AND created_at >= ? AND id NOT IN (${FORM_ONLY})) AS patients,
      (SELECT COUNT(*) FROM plans pl WHERE pl.doctor_id = u.id AND pl.created_at >= ? AND pl.${inOrg}) AS programs,
      (SELECT COUNT(*) FROM refill_requests r WHERE r.decided_by = u.id AND r.status = 'approved' AND r.decided_at >= ? AND r.${inOrg}) AS refills
    FROM users u WHERE u.org_id = ? AND u.role IN ('doctor','superadmin') ORDER BY u.name`).all(orgId, since, since, orgId, since, orgId, orgId)
    .filter((r) => r.patients || r.programs || r.refills);
  const byMed = new Map();
  for (const pl of plans) byMed.set(pl.medication, (byMed.get(pl.medication) || 0) + 1);
  const b = (v) => ({ v, style: "bold" });
  const here = new Date(Date.now() + UAE);
  const summaryRows = [
    [{ v: "Practice report", style: "title" }],
    [],
    [b("Organisation"), org.name || ""],
    [b("Period"), period.title],
    [b("Created"), `${fmtDay(here)}, ${String(here.getUTCHours()).padStart(2, "0")}:${String(here.getUTCMinutes()).padStart(2, "0")} (UAE time)${user && user.name ? ` by ${user.name}` : ""}`],
    [],
    [b("In this period")],
    ["New patients registered", newPatients],
    ["Programs prescribed", plans.length],
    ["Visits with no medication", visits.length],
    ["Refills approved", approved],
    ["Refill requests from patients", requested],
    ["Weights and check-ins", checkins.length],
    ["Doses logged by patients", doses],
    [],
    [b("Right now")],
    ["Patients on an active program", activeNow],
    ["Patients listed in this report", patientRows.length],
    ...(byDoctor.length ? [[], [b("By doctor"), b("New patients"), b("Programs"), b("Refills approved")], ...byDoctor.map((r) => [r.name, r.patients, r.programs, r.refills])] : []),
    ...(byMed.size ? [[], [b("Programs by medication"), b("Programs")], ...[...byMed].sort((a, c) => c[1] - a[1]).map(([m, n]) => [m, n])] : []),
    [],
    ["Patients are listed when they were registered in the period, or had a program, visit, refill, weight, check-in or dose in it. Archived patients are left out."],
  ];

  const col = (header, width, wrap) => ({ header, width, wrap });
  const sheets = [
    { name: "Summary", header: false, columns: [{ width: 34 }, { width: 44 }, { width: 14 }, { width: 18 }], rows: summaryRows },
    { name: "Patients", rows: patientRows, columns: [
      col("Patient no.", 10), col("Title", 7), col("Name", 26), col("Mobile", 16), col("Email", 26), col("Gender", 9), col("Age", 6), col("Date of birth", 13), col("Height (cm)", 9),
      col("Starting weight (kg)", 11), col("Current weight (kg)", 11), col("Change (kg)", 9), col("Change (%)", 9), col("Goal weight (kg)", 10), col("BMI", 7),
      col("Chronic illnesses", 26, true), col("Current medications", 26, true), col("Allergies", 22, true),
      col("Active medication", 26, true), col("Status", 19), col("Registered on", 13), col("Registered by", 22), col("Last consultation", 13), col("Last refill", 13),
      col("Next follow-up", 13), col("Last activity", 13), col("Check-ins", 9), col("Doses logged", 9)] },
    { name: "Consultations & programs", rows: consultRows, columns: [
      col("Date", 13), col("Patient no.", 10), col("Patient", 26), col("Mobile", 16), col("Type", 19), col("Category", 10), col("Medication", 22), col("Starting dose", 14),
      col("Current dose", 14), col("Route", 12), col("Frequency", 14), col("Quantity", 9), col("Status", 11), col("Doctor", 22), col("Next follow-up", 13)] },
    { name: "Refills", rows: refillRows, columns: [
      col("Requested on", 13), col("Patient no.", 10), col("Patient", 26), col("Mobile", 16), col("Medication", 20), col("Source", 18), col("Status", 15), col("Weight (kg)", 9),
      col("Side effects", 9), col("Severity", 10), col("Side-effect details", 36, true), col("How it's working", 26, true), col("Patient asked for", 22), col("Patient's message", 30, true),
      col("Dose before", 12), col("Dose after", 12), col("Changed to", 16), col("Quantity", 9), col("Decided by", 22), col("Decided on", 13)] },
    { name: "Weights & check-ins", rows: checkinRows, columns: [
      col("Date", 13), col("Patient no.", 10), col("Patient", 26), col("Weight (kg)", 9),
      ...presets.SYMPTOMS.map((s) => col(s.label.split(" /")[0], 13)), col("Notes", 40, true), col("Flagged", 8), col("Reviewed", 9)] },
  ];
  return { buffer: workbook(sheets), fileName: `${org.name || "Practice"} - Practice report - ${period.file}.xlsx` };
}

function ageFrom(dob, today) {
  const m = String(dob).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  let age = today.getUTCFullYear() - Number(m[1]);
  if ((today.getUTCMonth() + 1) * 100 + today.getUTCDate() < Number(m[2]) * 100 + Number(m[3])) age--;
  return age;
}

module.exports = { practiceReport, periodFor };
