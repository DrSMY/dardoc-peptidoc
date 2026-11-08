// What a patient's guide says, separate from how it looks. The guide link page
// (/g/app.js) draws it as HTML and the server (src/guide-pdf.js) draws it as a
// PDF, so both read the same program the same way. Depends on guide.js and
// patient-guides.js; touches no page or network.
"use strict";

const ROUTE_LABEL = { injection: "Subcutaneous injection", oral: "Oral tablet", nasal: "Nasal spray", topical: "Applied to the skin" };
const ROUTE_NOUN = { injection: "injection", oral: "tablet", nasal: "spray", topical: "treatment" };
const DAY_TONES = ["#CBD9C0", "#A8C09A", "#7FA07A", "#5B8468", "#3C6957"];

// ── small text helpers ───────────────────────────────────────────────
const cap = (s) => { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); };
const firstNameOf = (patient) => String(patient.name || "").trim().split(/\s+/)[0] || "there";
const docInitials = (name) => String(name || "").replace(/^(dr|doctor)\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "Dr";
const toNumber = (v) => Number(String(v == null ? "" : v).replace(/,/g, ""));
const weeksText = (w) => `${w} week${w == 1 ? "" : "s"}`;

// "1.5 mg" → { num: "1.5", unit: "mg" }; anything after the unit is kept so
// "0.15 ml (15 units)" still reads in full.
function splitDose(dose) {
  const m = String(dose || "").trim().match(/^([\d.,]+)\s*([a-zA-Zµμ]+)?\s*(.*)$/);
  return m ? { num: m[1], unit: m[2] || "", rest: m[3] || "" } : { num: "", unit: "", rest: String(dose || "") };
}

// "2–3 L daily" → { value: "2–3", unit: "L", rest: "daily" }
function splitWater(water) {
  const m = String(water || "").trim().match(/^([\d.,]+(?:\s*[–-]\s*[\d.,]+)?)\s*(L|litres?|liters?|ml)\b\.?\s*(.*)$/i);
  return m ? { value: m[1].replace(/\s*-\s*/, "–"), unit: m[2].length > 2 ? "L" : m[2], rest: m[3] } : { value: String(water || ""), unit: "", rest: "" };
}

// ── prose from the master guide document ─────────────────────────────
// Bullets become lists, "1." lines numbered lists, and the emoji the document
// uses as decoration are dropped. Inline **bold** and links are left for the
// renderer.
const EMOJI_LEAD = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})[️‍\p{Extended_Pictographic}]*\s*/u;

function parseProse(text) {
  const blocks = [];
  let list = null;
  const add = (type, ck, item) => {
    if (!list || list.type !== type || list.ck !== ck) { list = { type, ck, items: [] }; blocks.push(list); }
    list.items.push(item);
  };
  for (const raw of String(text || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    let m;
    if (!line) { list = null; continue; }
    if (/\[insert [^\]]*\]/i.test(line)) continue; // an unfilled placeholder in the master document
    if ((m = line.match(/^(?:•\s*|[-–]\s+)(.+)$/u))) add("ul", false, m[1]);
    else if ((m = line.match(/^(?:✔️?|✓|☑️?)\s*(.+)$/u))) add("ul", true, m[1]);
    else if ((m = line.match(/^\d+[.)]\s+(.+)$/))) add("ol", false, m[1]);
    else { list = null; blocks.push({ type: "p", text: line.replace(EMOJI_LEAD, "") }); }
  }
  return blocks;
}

// "Nausea (most common): eat smaller meals" → ["Nausea (most common)", "eat smaller meals"]
function splitLabel(s) {
  const m = String(s).match(/^([^:]{2,48}):\s+(.+)$/);
  return m && !/https?$/i.test(m[1]) ? [m[1], m[2]] : null;
}

// "HOW WEGOVY PILL WORKS" → "How Wegovy Pill works"
function prettyHead(head, medication) {
  let h = cap(String(head || "").toLowerCase());
  if (medication) h = h.replace(new RegExp(String(medication).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), medication);
  return h.replace(/\bglp-1\b/gi, "GLP-1").replace(/\bbpc-157\b/gi, "BPC-157");
}

function bulletsOf(text) {
  return String(text || "").split("\n").map((l) => l.trim()).filter((l) => /^(?:•|[-–]\s|✔|✓)/u.test(l)).map((l) => l.replace(/^(?:•\s*|[-–]\s+|✔️?\s*|✓\s*)/u, ""));
}

// The master document's windows, sorted onto the page that answers them.
function sortSections(sections, isGlp1) {
  const s = { about: null, how: null, titration: null, glance: null, more: [], food: [], effects: null, urgent: null, notes: null, followup: null };
  for (const sec of sections || []) {
    const h = String(sec.head || "").toUpperCase();
    if (/^HOW TO (TAKE|INJECT|USE|APPLY)/.test(h)) s.how = sec;
    else if (/^HOW .*WORKS$|^HOW IT WORKS/.test(h)) s.about = sec;
    else if (/TITRATION|DOSING/.test(h)) s.titration = sec;
    else if (/AT A GLANCE/.test(h)) s.glance = sec;
    else if (/^NUTRITION/.test(h)) { if (!isGlp1) s.food.push(sec); }
    else if (/SUCCESS TIPS|LIFESTYLE/.test(h)) s.food.push(sec);
    else if (/SIDE EFFECTS/.test(h)) s.effects = sec;
    else if (/SEEK URGENT/.test(h)) s.urgent = sec;
    else if (/SAFETY NOTES/.test(h)) s.notes = sec;
    else if (/FOLLOW-UP/.test(h)) s.followup = sec;
    else s.more.push(sec);
  }
  return s;
}

// ── models ───────────────────────────────────────────────────────────
function planModel(plan, patient, clinic) {
  const signer = plan.signedBy || {};
  const isGlp1 = plan.category === "glp1";
  const d0 = plan.diet || {};
  const content = typeof guideContentFor === "function" ? guideContentFor(plan.medication, plan.route) : null;
  const std = sortSections(sectionsForPatient(content ? content.sections : [], patient), isGlp1);
  if (plan.category === "peptide" && typeof PEPTIDE_GENERAL_GUIDE !== "undefined") std.more.push(...sectionsForPatient(PEPTIDE_GENERAL_GUIDE, patient));
  return {
    kind: "plan", plan, patient, clinic, signer, isGlp1, std,
    doctor: signer.name || "your doctor",
    first: firstNameOf(patient),
    info: plan.guideInfo || {},
    diet: isGlp1 || d0.proteinMin || d0.calories ? dietPlanFor(d0) : null,
    phase: (plan.phases || [])[0] || null,
    doseOptions: Array.isArray(plan.doseOptions) ? plan.doseOptions.filter(Boolean) : [],
    appName: signer.appName || "",
    labs: Array.isArray(plan.labTests) ? plan.labTests : [],
    supps: Array.isArray(plan.suppList) ? plan.suppList : [],
    created: plan.created_at,
  };
}

function visitModel(visit, patient, clinic) {
  const signer = visit.signedBy || {};
  return {
    kind: "visit", visit, patient, clinic, signer, isGlp1: false,
    std: sortSections([], false),
    doctor: signer.name || "your doctor",
    first: firstNameOf(patient),
    info: {},
    diet: dietPlanFor(visit.diet),
    appName: signer.appName || "",
    labs: Array.isArray(visit.labTests) ? visit.labTests : [],
    supps: Array.isArray(visit.suppList) ? visit.suppList : [],
    goals: Array.isArray(visit.goals) ? visit.goals : [],
    created: visit.created_at,
  };
}

function tabsFor(m) {
  const t = ["overview"];
  if (m.kind === "plan") t.push("medication");
  if (m.diet || m.std.food.length || m.supps.length || (m.plan && m.plan.supplements)) t.push("food");
  if (m.kind === "plan") t.push("safety");
  t.push("followup");
  return t;
}

// ── shared wording and derived figures ───────────────────────────────
function heroLede(m) {
  if (m.kind === "visit") return `${m.first}, this is the plan we talked about, built around your goals and your own nutrition needs.`;
  return m.isGlp1
    ? `${m.first}, this is your daily plan for sustainable weight loss, good nutrition and habits that stay with you.`
    : `${m.first}, this is your plan for ${m.plan.medication}: how to take it, what to expect, and when to contact us.`;
}

// The follow-up window the text guide gives (three days either side), split
// so the dates can be set large: { range: "15–21 November", year: 2026 }.
function followWindow(next) {
  if (!next) return null;
  const base = new Date(String(next).includes("T") ? next : next + "T12:00:00");
  if (isNaN(base)) return null;
  const start = new Date(base.getTime() - 3 * 864e5), end = new Date(base.getTime() + 3 * 864e5);
  const month = (d, short) => d.toLocaleDateString("en-GB", { month: short ? "short" : "long" });
  const past = end.getTime() < Date.now();
  const range = start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${month(end)}`
    : `${start.getDate()} ${month(start, true)} – ${end.getDate()} ${month(end, true)}`;
  return { range, year: end.getFullYear(), past };
}

function nextFollowupOf(m) { return m.kind === "visit" ? m.visit.next_followup : m.plan.next_followup; }

function arrangeText(m) {
  if (m.kind === "visit") return "We'll review your progress together, and you're welcome to reach out sooner.";
  return m.appName ? `Arrange it through the ${m.appName}.` : "We'll be in touch to arrange it, or you're welcome to reach out.";
}

function proteinRange(d) {
  if (!d) return null;
  const min = toNumber(d.proteinMin), max = toNumber(d.proteinMax) || min;
  if (min) return { min, max };
  return d.proteinTarget ? { min: d.proteinTarget, max: d.proteinTarget } : null;
}
const rangeText = (r) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);

// "Until then, continue … and contact your doctor if needed."
function untilList(m) {
  const until = untilItems(m);
  return until.length === 2 ? until.join(" and ") : commaList(until, "and");
}
function untilItems(m) {
  const until = [];
  if (m.kind === "plan") {
    const p = m.plan;
    until.push(`continue ${p.medication}${p.dose ? " " + p.dose : ""}${p.frequency ? " " + guideFreqPhrase(p.frequency) : ""}`);
    const pr = proteinRange(m.diet);
    if (m.diet && pr) until.push(`aim for ${rangeText(pr)} g protein${toNumber(m.diet.calories) ? ` and approximately ${toNumber(m.diet.calories).toLocaleString("en-US")} kcal per day` : " a day"}`);
    if (m.isGlp1) until.push(`drink ${(m.diet && m.diet.water) || "2–3 L daily"}`);
  }
  until.push("track your progress", "contact your doctor if needed");
  return until;
}

function welcomeLines(m) {
  const t = m.patient.title ? m.patient.title + " " : "";
  return [
    `Dear ${t}${m.first},`,
    "Welcome to your treatment journey.",
    m.isGlp1
      ? "Our goal is sustainable weight loss while protecting your health, preserving muscle, improving nutrition, and building habits that can continue long term."
      : "Our goal is to support your recovery and long-term health through this treatment, guided by careful monitoring throughout.",
    "We're here to support you throughout your treatment — with messages, follow-ups, refills, and personalised guidance whenever you need them.",
  ];
}

function closingMessage(m) {
  return `${m.first}, remember that this is your journey, not a race. ${m.isGlp1
    ? "The medication is one part of the process. Our goal is safe weight loss, better health, muscle preservation, and habits you can maintain long term."
    : "The medication is one part of the process. Our goal is safe, steady progress and a full recovery you can build on."} Stay consistent, stay connected with us, and allow the process time to work. I look forward to seeing your progress.`;
}

// Steps from the master guide's "How to take it" window (its numbered
// lines), falling back to the doctor's own instruction lines.
function stepsFrom(m) {
  const lines = (m.std.how ? m.std.how.body : "").split("\n").map((l) => l.trim());
  const steps = [], before = [], after = [];
  for (const l of lines) {
    if (!l) continue;
    const n = l.match(/^\d+[.)]\s+(.+)$/);
    if (n) steps.push(n[1]);
    else (steps.length ? after : before).push(l);
  }
  if (steps.length) return { steps, before: before.join("\n"), after: after.join("\n") };
  const own = doctorInstructions(m).split("\n").map((l) => l.trim()).filter(Boolean);
  return { steps: own, before: "", after: "", fromDoctor: true };
}

function doctorInstructions(m) {
  const p = m.plan;
  if (!p.instructions) return "";
  // The generic "protein / hydration" reminder that ends GLP-1 instructions
  // is covered in full on the food page.
  return m.isGlp1
    ? String(p.instructions).split("\n").filter((l) => !/prioritise protein at every meal/i.test(l) && !/stay well hydrated/i.test(l)).join("\n").trim()
    : p.instructions;
}

// The approved doses, which one is current, and each future dose with its
// line from the master guide's schedule ("4mg" matches "Days 31–60: 4 mg").
function doseLadder(m) {
  const p = m.plan;
  const ladder = m.doseOptions;
  const loose = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
  const cur = ladder.findIndex((x) => loose(x) === loose(p.dose));
  const titrationLines = m.std.titration ? bulletsOf(m.std.titration.body) : [];
  const lineFor = (dose) => {
    const d = splitDose(dose);
    if (!d.num) return "";
    const num = d.num.replace(/\./g, "\\.");
    const re = new RegExp(`(^|[^\\d.])${num}\\s*${d.unit ? d.unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : ""}(?![\\d.a-z])`, "i");
    return titrationLines.find((l) => re.test(l)) || "";
  };
  const future = (cur >= 0 ? ladder.slice(cur + 1) : []).map((dose) => ({
    dose,
    line: lineFor(dose),
    note: `Your doctor moves you to ${dose} at a review, and only if your current dose is well tolerated. Keep taking ${p.dose || "your current dose"} until then.`,
  }));
  return { ladder, cur, future };
}

// Plate portions as the doctor wrote them, with the share of the circle each
// takes ("Less than 20%" draws a little under 20).
function plateParts(d) {
  const pct = (v, fb) => { const nums = String(v).match(/\d+/g); return nums ? nums.map(Number).reduce((a, b) => a + b, 0) / nums.length : fb; };
  const under = (v) => /less|under|below|</i.test(String(v));
  const parts = [
    { k: "protein", name: "Protein", value: d.plate.protein, detail: "Lean meat, fish, eggs, Greek yoghurt or lentils. Eat this first.", color: "#5F8F72" },
    { k: "fibre", name: "Fibre", value: d.plate.fibre, detail: "Vegetables and salad, filling about half the plate.", color: "#A9C09B" },
    { k: "carbs", name: "Carbs", value: d.plate.carbs, detail: "A small portion of whole grains or starchy food. Skip it if you're already full.", color: "#D8B88E" },
  ];
  parts.forEach((p, i) => { const v = pct(p.value, i === 2 ? 15 : 45); p.share = Math.max(5, under(p.value) ? v * 0.75 : v); });
  const total = parts.reduce((a, p) => a + p.share, 0);
  parts.forEach((p) => { p.fraction = p.share / total; });
  return parts;
}

// Urgent warning signs: the master guide's list, else the program's red flags.
function urgentFor(m) {
  const std = m.std.urgent ? bulletsOf(m.std.urgent.body) : [];
  const extra = m.std.urgent ? m.std.urgent.body.split("\n").map((l) => l.trim()).filter((l) => l && !/^(?:•|[-–]\s|✔)/u.test(l)).join("\n") : "";
  return { items: std.length ? std : (m.info.redFlags || []), extra };
}

const CUSTOMER_CARE = "For non-medical matters such as appointments, payments, deliveries, technical support, or general assistance, our Customer Care Team is available to help.";
