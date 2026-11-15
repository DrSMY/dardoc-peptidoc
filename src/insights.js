// Clinical insights for the Super admin's dashboard: average BMI over time,
// who the patients are, how treatment is going, side effects, and the doses
// patients are on now. Everything is worked out for one organisation and one
// trailing period. Days are UAE calendar days; timestamps are stored in UTC.
"use strict";
const { db } = require("./db");
const presets = require("./presets");
const { DEMO_MOBILES } = require("./demo-patient");

const UAE = 4 * 3600e3;
const DAY = 86400e3;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FORM_ONLY = "SELECT patient_id FROM patient_forms WHERE status = 'submitted' AND new_patient = 1";

// range → how many days back it reaches (today included), and how the trend is cut.
const RANGES = {
  week: { days: 7, step: "day", label: "Last 7 days" },
  month: { days: 30, step: "week", label: "Last 30 days" },
  "3m": { days: 90, step: "week", label: "Last 3 months" },
  "6m": { days: 180, step: "month", label: "Last 6 months" },
  all: { days: null, step: "month", label: "All time" },
};
const MAX_TREND_MONTHS = 24;
// A later weight only counts as a result once treatment has had a week to act.
const FOLLOW_UP_DAYS = 7;

// ── days ─────────────────────────────────────────────────────────
// A stored value as a UAE calendar day number (days since 1970). Plain dates
// are kept as written; timestamps are UTC and move to UAE time first.
function dayOf(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // imported bookings: M/D/YYYY
  if (m) return Date.UTC(+m[3], +m[1] - 1, +m[2]) / DAY;
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
  return Number.isFinite(t) ? Math.floor((t + UAE) / DAY) : null;
}
const dateOf = (day) => new Date(day * DAY);
const isoDay = (day) => dateOf(day).toISOString().slice(0, 10);
const shortDay = (day) => `${dateOf(day).getUTCDate()} ${MONTHS[dateOf(day).getUTCMonth()]}`;

// ── small maths ──────────────────────────────────────────────────
const round1 = (n) => Math.round(n * 10) / 10;
const mean = (list) => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : null);
const mean1 = (list) => (list.length ? round1(mean(list)) : null);
const pct = (n, of) => (of ? Math.round((n / of) * 100) : 0);
const plausibleHeight = (cm) => cm >= 100 && cm <= 230;
const plausibleWeight = (kg) => kg >= 30 && kg <= 350;

function bmiOf(patient, kg) {
  if (!plausibleHeight(patient.height_cm) || !plausibleWeight(kg)) return null;
  return presets.calcBMI(patient.height_cm, kg);
}

function parseJson(text, fallback) {
  try { const v = JSON.parse(text || ""); return v == null ? fallback : v; } catch { return fallback; }
}

// ── health conditions ────────────────────────────────────────────
// Conditions are free text on older files and a checklist on newer ones, so
// both are read into the same named groups.
const CONDITION_GROUPS = [
  ["High blood pressure", /hyp?ers?tens|blood pressure|\bhtn\b/],
  ["Diabetes or prediabetes", /diabet|\bt2dm\b|\bdm\b|sugar/],
  ["Insulin resistance", /insulin resist/],
  ["High cholesterol", /cholest|lipid|triglycer/],
  ["PCOS", /pco[sd]|polycystic/],
  ["Hormonal imbalance", /hormon|testosterone|menopaus/],
  ["Thyroid disorder", /thyro|hashimoto/],
  ["Liver condition", /liver|nafld|masld|steatosis|gilbert/],
  ["Mental health condition", /mental|anxiety|depress|stress|bipolar|eating disorder/],
  ["Joint, muscle or back pain", /joint|back pain|arthrit|muscle|sciatica|fibromyalg|chronic pain/],
  ["Autoimmune or inflammatory", /autoimmun|inflammatory|colitis|crohn|chron'?s|psoria|lupus|rheumat|myasthenia/],
  ["Sleep disorder", /sleep|insomnia|apn[oe]+a/],
  ["Asthma or lung condition", /asthma|copd|bronch/],
  ["Heart or circulation", /cardio|heart|coronary|arrhythm/],
  ["Reflux or gut condition", /gerd|reflux|gastritis|\bibs\b|irritable bowel/],
  ["Kidney condition", /kidney|\brenal/],
  ["Anaemia or blood condition", /an[ae]+mia|thalass|g6pd/],
  ["Migraine", /migraine/],
];
// Wording that says there is nothing, or that isn't a condition at all.
const NO_CONDITION = /^(none( reported)?|no|nil|nothing|n\/?a|not applicable|healthy|well controlled|chronic|other|-+)$|^no\b.*(condition|illness|disease)/;

// → null when nothing was recorded, else { groups: [labels], other: bool }
function conditionsOf(patient, intake) {
  const parts = [];
  if (patient.chronic_illnesses) parts.push(String(patient.chronic_illnesses));
  if (Array.isArray(intake.health_conditions)) parts.push(...intake.health_conditions.map(String));
  if (intake.health_conditions__other) parts.push(String(intake.health_conditions__other));
  // The checklist lists examples in brackets, e.g. "Hormonal imbalance (e.g., low testosterone, PCOS)".
  const text = parts.join(", ").toLowerCase().replace(/\([^)]*\)/g, " ");
  const gate = intake.health_conditions__gate;
  const answered = text.trim() !== "" || gate === 0 || gate === 1 || gate === false || gate === true;
  if (!answered) return null;
  const groups = CONDITION_GROUPS.filter(([, re]) => re.test(text)).map(([label]) => label);
  const leftovers = text.split(/[,;\n]+/).map((s) => s.replace(/[.\s]+$/, "").trim()).filter((s) => s && !NO_CONDITION.test(s))
    .filter((s) => !CONDITION_GROUPS.some(([, re]) => re.test(s)));
  return { groups, other: leftovers.length > 0 };
}

// ── side effects ─────────────────────────────────────────────────
// Check-in answers that mean "nothing to report" for each symptom.
const FINE = new Set(["None", "Normal", "Energetic", "Great", "Good", "Absent", ""]);
// Appetite is the treatment working, not a side effect.
const SYMPTOMS = presets.SYMPTOMS.filter((s) => s.key !== "hunger").map((s) => ({
  key: s.key,
  label: s.label.split(" /")[0].trim(),
  levels: s.options.filter((o) => !FINE.has(o)),
}));
// The free text a patient writes on a refill request, read for the same symptoms.
const SYMPTOM_WORDS = [
  ["Nausea", /nause|queasy|sick to/],
  ["Vomiting", /vomit|throwing up|threw up/],
  ["Constipation", /constipat/],
  ["Diarrhea", /diarrh?o?ea|loose stool/],
  ["Fatigue", /fatigue|tired|exhaust|low energy|weak/],
  ["Dizziness", /dizz|light.?headed/],
  ["Dose-site", /injection site|redness|swelling at|bruis/],
  ["Mood", /mood|anxious|irritab/],
  ["Abdominal pain", /abdominal|stomach (pain|ache|cramp)|cramp|tummy/],
  ["Headache", /headache|migraine/],
  ["Heartburn or reflux", /heartburn|reflux|acid|burp|belch/],
  ["Bloating", /bloat|gas\b/],
  ["Hair loss", /hair (loss|fall)|shedding/],
];
const SEVERITY_ORDER = ["mild", "moderate", "severe"];

// A check-in's symptoms → { labels, severity } (severity is the worst one).
function checkinEffects(symptoms) {
  const labels = [];
  let worst = -1;
  for (const s of SYMPTOMS) {
    const at = s.levels.indexOf(symptoms[s.key]);
    if (at < 0) continue;
    labels.push(s.label);
    // first level is mild, the last is severe, anything between is moderate
    const level = at === 0 ? 0 : at === s.levels.length - 1 ? 2 : 1;
    if (level > worst) worst = level;
  }
  return { labels, severity: worst < 0 ? "" : SEVERITY_ORDER[worst] };
}

function wordsToSymptoms(text) {
  const t = String(text || "").toLowerCase();
  return t ? SYMPTOM_WORDS.filter(([, re]) => re.test(t)).map(([label]) => label) : [];
}

// ── medication and dose names ────────────────────────────────────
const medName = (s) => String(s || "").trim().replace(/\s+/g, " ") || "Not named";
const medKey = (s) => medName(s).toLowerCase();
// "0.25mg" and "0.25 mg" are one dose.
const doseName = (s) => String(s || "").trim().replace(/\s+/g, " ").replace(/(\d)(mg|mcg|ml|iu|units?)\b/gi, "$1 $2") || "Dose not set";
const doseNumber = (s) => { const m = String(s).match(/\d+(\.\d+)?/); return m ? Number(m[0]) : Infinity; };

// ── trend buckets ────────────────────────────────────────────────
function trendBuckets(step, since, today) {
  const buckets = [];
  if (step === "day") {
    for (let d = since; d <= today; d++) buckets.push({ from: d, to: d, label: shortDay(d) });
  } else if (step === "week") {
    for (let to = today; to >= since; to -= 7) buckets.unshift({ from: Math.max(since, to - 6), to });
    // a first week of only a few days joins the week after it
    if (buckets.length > 1 && buckets[0].to - buckets[0].from < 3) { buckets[1].from = buckets[0].from; buckets.shift(); }
    for (const b of buckets) b.label = shortDay(b.from);
  } else {
    let d = dateOf(since);
    let y = d.getUTCFullYear(), m = d.getUTCMonth();
    const end = dateOf(today), ey = end.getUTCFullYear(), em = end.getUTCMonth();
    const severalYears = y !== ey;
    while (y < ey || (y === ey && m <= em)) {
      const first = Date.UTC(y, m, 1) / DAY, last = Date.UTC(y, m + 1, 0) / DAY;
      buckets.push({ from: Math.max(since, first), to: Math.min(today, last), label: severalYears ? `${MONTHS[m]} ${String(y).slice(2)}` : MONTHS[m] });
      if (++m > 11) { m = 0; y++; }
    }
  }
  for (const b of buckets) b.title = b.from === b.to ? shortDay(b.from) : `${shortDay(b.from)} to ${shortDay(b.to)}`;
  return buckets;
}

// ── the report ───────────────────────────────────────────────────
function clinicalInsights(orgId, range, now = new Date()) {
  const key = RANGES[range] ? range : "all";
  const spec = RANGES[key];
  const today = Math.floor((now.getTime() + UAE) / DAY);

  const demo = DEMO_MOBILES.map(() => "?").join(",");
  const people = db.prepare(`
    SELECT id, created_at, age, dob, gender, height_cm, start_weight_kg, current_weight_kg, chronic_illnesses, intake_json
    FROM patients WHERE org_id = ? AND archived = 0 AND id NOT IN (${FORM_ONLY}) AND mobile NOT IN (${demo})`).all(orgId, ...DEMO_MOBILES);
  const byId = new Map();
  for (const p of people) {
    p.intake = parseJson(p.intake_json, {});
    p.days = [];          // every day the practice saw or heard from them
    p.weights = [];       // dated weights after the starting one
    p.plans = [];
    byId.set(p.id, p);
  }
  const mine = "patient_id IN (SELECT id FROM patients WHERE org_id = ?)";
  const plans = db.prepare(`SELECT id, patient_id, category, medication, dose, status, created_at FROM plans WHERE ${mine} ORDER BY created_at, id`).all(orgId);
  const planById = new Map();
  for (const pl of plans) {
    const p = byId.get(pl.patient_id);
    if (!p) continue;
    pl.day = dayOf(pl.created_at);
    p.plans.push(pl);
    planById.set(pl.id, pl);
    if (pl.day != null) p.days.push(pl.day);
  }
  const checkins = db.prepare(`SELECT patient_id, plan_id, date, weight_kg, symptoms_json FROM checkins WHERE ${mine}`).all(orgId);
  for (const c of checkins) {
    const p = byId.get(c.patient_id);
    c.day = dayOf(c.date);
    if (!p || c.day == null) continue;
    p.days.push(c.day);
    if (plausibleWeight(c.weight_kg)) p.weights.push({ day: c.day, kg: c.weight_kg });
  }
  const refills = db.prepare(`SELECT patient_id, plan_id, weight_kg, has_side_effects, side_effect_severity, side_effects, created_at FROM refill_requests WHERE ${mine}`).all(orgId);
  for (const r of refills) {
    const p = byId.get(r.patient_id);
    r.day = dayOf(r.created_at);
    if (!p || r.day == null) continue;
    p.days.push(r.day);
    if (plausibleWeight(r.weight_kg)) p.weights.push({ day: r.day, kg: r.weight_kg });
  }
  for (const v of db.prepare(`SELECT patient_id, created_at FROM visit_records WHERE ${mine}`).all(orgId)) {
    const p = byId.get(v.patient_id), d = dayOf(v.created_at);
    if (p && d != null) p.days.push(d);
  }
  for (const p of people) {
    // An imported file was created on the day of the import, so its real
    // consultation dates are the bookings it came with.
    const created = dayOf(p.created_at);
    if (p.intake.imported) {
      for (const b of Array.isArray(p.intake.bookings) ? p.intake.bookings : []) {
        const d = dayOf(b && b.date);
        if (d != null && d <= today) p.days.push(d);
      }
    } else if (created != null) p.days.push(created);
    if (!p.days.length && created != null) p.days.push(created);
    p.days.sort((a, b) => a - b);
    p.weights.sort((a, b) => a.day - b.day);
    p.firstDay = p.days.length ? p.days[0] : today;
    p.startKg = plausibleWeight(p.start_weight_kg) ? p.start_weight_kg : null;
    const lastDated = p.weights.length ? p.weights[p.weights.length - 1].kg : null;
    p.latestKg = plausibleWeight(p.current_weight_kg) ? p.current_weight_kg : lastDated != null ? lastDated : p.startKg;
    if (p.startKg == null && p.weights.length) p.startKg = p.weights[0].kg;
  }

  const firstEver = people.length ? Math.min(...people.map((p) => p.firstDay)) : today;
  const since = spec.days ? today - spec.days + 1 : firstEver;
  const seenBetween = (p, from, to) => p.days.some((d) => d >= from && d <= to);
  const cohort = spec.days ? people.filter((p) => seenBetween(p, since, today)) : people;

  // Weight on file at the end of a given day.
  const weightAt = (p, day) => {
    if (day >= today) return p.latestKg;
    let kg = p.startKg;
    for (const w of p.weights) { if (w.day <= day) kg = w.kg; else break; }
    return kg;
  };

  // ── BMI ──
  const measured = cohort.map((p) => ({ p, bmi: bmiOf(p, p.latestKg) })).filter((x) => x.bmi != null);
  const bmiAverage = mean1(measured.map((x) => x.bmi));
  const CATS = ["Underweight", "Normal weight", "Overweight", "Obesity Class I", "Obesity Class II", "Obesity Class III"];
  const categories = CATS.map((label) => ({ label, n: measured.filter((x) => presets.bmiCategory(x.bmi) === label).length }));
  const trendFrom = spec.days ? since : Math.max(firstEver, Date.UTC(dateOf(today).getUTCFullYear(), dateOf(today).getUTCMonth() - MAX_TREND_MONTHS + 1, 1) / DAY);
  const trend = trendBuckets(spec.step, trendFrom, today).map((b) => {
    const values = people.filter((p) => seenBetween(p, b.from, b.to)).map((p) => bmiOf(p, weightAt(p, b.to))).filter((v) => v != null);
    return { label: b.label, title: b.title, average: mean1(values), patients: values.length };
  });

  // ── who the patients are ──
  const ageOf = (p) => {
    const born = dayOf(p.dob);
    const a = born != null ? Math.floor((today - born) / 365.25) : Number(p.age);
    return a >= 10 && a <= 110 ? a : null;
  };
  const ages = cohort.map(ageOf).filter((a) => a != null);
  const BANDS = [["Under 30", 0, 29], ["30 to 39", 30, 39], ["40 to 49", 40, 49], ["50 to 59", 50, 59], ["60 and over", 60, 200]];
  const gender = ["Female", "Male"].map((label) => {
    const group = cohort.filter((p) => p.gender === label);
    return { label, n: group.length, bmi: mean1(group.map((p) => bmiOf(p, p.latestKg)).filter((v) => v != null)) };
  });
  const conditionCount = new Map();
  let answered = 0, noCondition = 0, otherCondition = 0;
  for (const p of cohort) {
    const c = conditionsOf(p, p.intake);
    if (!c) continue;
    answered++;
    if (!c.groups.length && !c.other) noCondition++;
    if (c.other) otherCondition++;
    for (const g of c.groups) conditionCount.set(g, (conditionCount.get(g) || 0) + 1);
  }
  const conditionRows = [...conditionCount].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

  // ── weight results: patients on a weight-loss (GLP-1) program ──
  const glp1Plan = (p) => {
    const list = p.plans.filter((pl) => pl.category === "glp1");
    return list.find((pl) => pl.status === "active") || list[list.length - 1] || null;
  };
  const onGlp1 = cohort.map((p) => ({ p, plan: glp1Plan(p) })).filter((x) => x.plan);
  const followed = [];
  for (const { p, plan } of onGlp1) {
    if (p.startKg == null || p.latestKg == null) continue;
    const later = p.weights.filter((w) => w.day >= p.firstDay + FOLLOW_UP_DAYS);
    const changed = Math.abs(p.latestKg - p.startKg) > 0.05;
    if (!later.length && !changed) continue;
    const kg = p.latestKg - p.startKg;
    followed.push({
      p, medication: medName(plan.medication), kg, pct: (kg / p.startKg) * 100,
      weeks: later.length ? (later[later.length - 1].day - p.firstDay) / 7 : null,
      bmiStart: bmiOf(p, p.startKg), bmiNow: bmiOf(p, p.latestKg),
    });
  }
  const summarise = (list) => ({
    patients: list.length,
    avgKg: mean1(list.map((x) => x.kg)),
    avgPct: mean1(list.map((x) => x.pct)),
    lost5: list.filter((x) => x.pct <= -5).length,
    lost10: list.filter((x) => x.pct <= -10).length,
  });
  const withBmi = followed.filter((x) => x.bmiStart != null && x.bmiNow != null);
  const medGroups = new Map();
  for (const x of followed) {
    const k = medKey(x.medication);
    if (!medGroups.has(k)) medGroups.set(k, { medication: x.medication, list: [] });
    medGroups.get(k).list.push(x);
  }
  const results = {
    eligible: onGlp1.length,
    ...summarise(followed),
    avgWeeks: mean1(followed.map((x) => x.weeks).filter((w) => w != null)),
    bmiPatients: withBmi.length,
    bmiStart: mean1(withBmi.map((x) => x.bmiStart)),
    bmiNow: mean1(withBmi.map((x) => x.bmiNow)),
    byMedication: [...medGroups.values()].map((g) => ({ medication: g.medication, ...summarise(g.list) }))
      .sort((a, b) => b.patients - a.patients || a.medication.localeCompare(b.medication)),
  };

  // ── side effects, from refill requests and symptom check-ins ──
  const mainPlan = (p) => p.plans.find((pl) => pl.status === "active") || p.plans[p.plans.length - 1] || null;
  const medicationFor = (p, planId) => medName((planById.get(planId) || mainPlan(p) || {}).medication);
  const inPeriod = (day) => day != null && day >= since && day <= today;
  const reports = [];
  for (const r of refills) {
    const p = byId.get(r.patient_id);
    if (!p || !inPeriod(r.day) || !["yes", "no"].includes(r.has_side_effects)) continue;
    const has = r.has_side_effects === "yes";
    reports.push({
      patient: p.id, medication: medicationFor(p, r.plan_id), has,
      severity: has && SEVERITY_ORDER.includes(r.side_effect_severity) ? r.side_effect_severity : "",
      labels: has ? wordsToSymptoms(r.side_effects) : [],
    });
  }
  for (const c of checkins) {
    const p = byId.get(c.patient_id);
    if (!p || !inPeriod(c.day)) continue;
    const symptoms = parseJson(c.symptoms_json, {});
    if (!symptoms || typeof symptoms !== "object" || !Object.keys(symptoms).length) continue; // a weight-only entry
    const fx = checkinEffects(symptoms);
    reports.push({ patient: p.id, medication: medicationFor(p, c.plan_id), has: fx.labels.length > 0, severity: fx.severity, labels: fx.labels });
  }
  const affected = reports.filter((r) => r.has);
  const symptomCount = new Map();
  for (const r of affected) for (const l of new Set(r.labels)) symptomCount.set(l, (symptomCount.get(l) || 0) + 1);
  const medReports = new Map();
  for (const r of reports) {
    const k = medKey(r.medication);
    if (!medReports.has(k)) medReports.set(k, { medication: r.medication, reports: 0, withEffects: 0 });
    const row = medReports.get(k);
    row.reports++;
    if (r.has) row.withEffects++;
  }
  const safety = {
    reports: reports.length,
    withEffects: affected.length,
    rate: pct(affected.length, reports.length),
    patients: new Set(reports.map((r) => r.patient)).size,
    patientsAffected: new Set(affected.map((r) => r.patient)).size,
    severity: {
      mild: affected.filter((r) => r.severity === "mild").length,
      moderate: affected.filter((r) => r.severity === "moderate").length,
      severe: affected.filter((r) => r.severity === "severe").length,
      notGiven: affected.filter((r) => !r.severity).length,
    },
    common: [...symptomCount].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, 8),
    byMedication: [...medReports.values()].map((m) => ({ ...m, rate: pct(m.withEffects, m.reports) }))
      .sort((a, b) => b.reports - a.reports || a.medication.localeCompare(b.medication)).slice(0, 10),
  };

  // ── doses patients are on today (not tied to the period) ──
  const doseGroups = new Map();
  for (const p of people) {
    for (const pl of p.plans) {
      if (pl.status !== "active") continue;
      const k = medKey(pl.medication);
      if (!doseGroups.has(k)) doseGroups.set(k, { medication: medName(pl.medication), category: pl.category, patients: new Set(), doses: new Map() });
      const g = doseGroups.get(k);
      g.patients.add(p.id);
      const dose = doseName(pl.dose), dk = dose.toLowerCase();
      if (!g.doses.has(dk)) g.doses.set(dk, { dose, patients: new Set() });
      g.doses.get(dk).patients.add(p.id);
    }
  }
  const doses = [...doseGroups.values()].map((g) => ({
    medication: g.medication, category: g.category, patients: g.patients.size,
    doses: [...g.doses.values()].map((d) => ({ dose: d.dose, n: d.patients.size }))
      .sort((a, b) => doseNumber(a.dose) - doseNumber(b.dose) || a.dose.localeCompare(b.dose)),
  })).sort((a, b) => b.patients - a.patients || a.medication.localeCompare(b.medication));

  return {
    range: key,
    period: { label: spec.label, since: spec.days ? isoDay(since) : null, until: isoDay(today) },
    patients: cohort.length,
    patientsTotal: people.length,
    bmi: {
      average: bmiAverage,
      category: bmiAverage == null ? "" : presets.bmiCategory(bmiAverage),
      patients: measured.length,
      startAverage: mean1(measured.map((x) => bmiOf(x.p, x.p.startKg)).filter((v) => v != null)),
      categories,
      step: spec.step,
      trend,
    },
    profile: {
      age: {
        average: mean1(ages), patients: ages.length,
        bands: BANDS.map(([label, lo, hi]) => ({ label, n: ages.filter((a) => a >= lo && a <= hi).length })),
      },
      gender,
      genderUnknown: cohort.length - gender.reduce((s, g) => s + g.n, 0),
      conditions: { patients: answered, none: noCondition, other: otherCondition, rows: conditionRows.slice(0, 10) },
    },
    results,
    safety,
    doses,
  };
}

module.exports = { clinicalInsights, INSIGHT_RANGES: Object.keys(RANGES) };
