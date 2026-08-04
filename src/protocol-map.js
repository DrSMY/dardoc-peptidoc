// Bridges the app's medication names to the guidebook's product records, and
// turns the guidebook's prose rules into decisions the consultation workflow
// can act on: which blood panels this prescription needs, which are mandatory
// rather than optional, and which cross-peptide safety rules have fired.
//
// Hand-authored on purpose — src/protocols.js is regenerated from the
// workbook and must never carry app-specific mapping.
"use strict";

const {
  LAB_PANELS, PEPTIDE_PRODUCTS, PROTOCOL_SAFETY_RULES, PROTOCOL_PROHIBITED,
} = require("./protocols.js");

// App medication name → guidebook ref. Where one app name covers both an
// injection and a nasal/oral form, the plan's route decides.
const PROTOCOL_ALIASES = {
  "BPC-157": { injection: "P01" },
  "BPC-157 Capsules": { any: "P02" },
  "Epitalon": { any: "P03" },
  "CJC-1295": { any: "P04" },
  "Ipamorelin": { any: "P05" },
  "Sermorelin": { any: "P06" },
  "Thymosin Alpha-1": { any: "P07" },
  "Thymosin Beta-4": { any: "P08" },
  "PT-141 Nasal": { any: "P09" },
  "PT-141": { nasal: "P09", any: "P10" },
  "CJC/Ipamorelin Blend": { any: "P11" },
  "GHK-Cu": { topical: "P13", any: "P12" },
  "GHK-Cu Facial Serum": { any: "P13" },
  "GHK-Cu Scalp Foam": { any: "P14" },
  "MOTS-C": { any: "P15" },
  "AOD-9604": { any: "P16" },
  "Kisspeptin-10": { any: "P17" },
  "Dihexa Capsules": { any: "P18" },
  "DSIP": { any: "P20" },
  "Semax": { nasal: "P21", any: "P22" },
  "Selank": { nasal: "P23", any: "P24" },
  "KPV": { oral: "P25", any: "P26" },
  "KPV + BPC-157": { any: "P27" },
  "Tesamorelin": { any: "P29" },
  "LR3-IGF1": { any: "P30" },
  "SS-31": { any: "P31" },
};

// Supplements this practice adds on top of the guidebook's own list. Kept
// here rather than in the generated protocols module so regenerating from a
// new guidebook never drops them.
const PRACTICE_SUPPLEMENTS = {
  P12: [{ name: "GS1 Decoded", dose: "1 per day mixed with water daily" }], // GHK-Cu injection
  P13: [{ name: "GS1 Decoded", dose: "1 per day mixed with water daily" }], // GHK-Cu facial serum
  P14: [{ name: "GS1 Decoded", dose: "1 per day mixed with water daily" }], // GHK-Cu scalp foam
};

const BY_REF = Object.fromEntries(PEPTIDE_PRODUCTS.map((p) => [p.ref, p]));
const PANEL_BY_ID = Object.fromEntries(LAB_PANELS.map((p) => [p.id, p]));

function routeKey(route) {
  const r = String(route || "").toLowerCase();
  if (r.includes("nasal") || r.includes("spray")) return "nasal";
  if (r.includes("oral") || r.includes("capsule")) return "oral";
  if (r.includes("topical") || r.includes("skin") || r.includes("scalp")) return "topical";
  return "injection";
}

// The guidebook record for a prescribed medication, or null when the
// medication is not a peptide in the guidebook (e.g. a GLP-1).
function matchProtocol(medication, route) {
  const alias = PROTOCOL_ALIASES[medication];
  if (!alias) return null;
  const ref = alias[routeKey(route)] || alias.any;
  return ref ? BY_REF[ref] || null : null;
}

// Turns a panel rule such as
//   "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated."
// into concrete panels for this patient. Age-gated panels resolve against the
// patient's age; "if clinically indicated" panels are offered but left for the
// doctor to opt into rather than pre-selected.
function panelsForProduct(product, patient) {
  const rule = String(product && product.panelRule || "");
  const age = Number(patient && patient.age) || null;
  const mandatory = /^MANDATORY/i.test(String(product && product.monitoring || ""));
  const out = [];
  const seen = new Set();
  const push = (id, why, suggested) => {
    const panel = PANEL_BY_ID[id];
    if (!panel || seen.has(id)) return;
    seen.add(id);
    out.push({
      id, name: panel.name, tests: panel.tests,
      required: suggested && mandatory,
      suggested,
      why,
    });
  };

  for (const sentence of rule.split(".")) {
    const s = sentence.trim();
    if (!s) continue;
    const ids = (s.match(/Panel\s+\d+[AB]?/gi) || []).map((m) => m.replace(/\s+/, " ").trim());
    if (!ids.length) continue;
    const overAge = s.match(/if over (\d+)/i);
    const clinical = /clinically indicated/i.test(s);
    for (const id of ids) {
      if (overAge) {
        const cut = Number(overAge[1]);
        // Only add the age-gated panel when the patient is actually older;
        // when age is unknown, offer it rather than assume.
        if (age && age > cut) push(id, `Patient is over ${cut}`, true);
        else if (!age) push(id, `Add if over ${cut} — age not recorded`, false);
      } else if (clinical) {
        push(id, "If clinically indicated", false);
      } else {
        push(id, product.name, true);
      }
    }
  }
  return out;
}

// Cross-peptide rules that have fired for this prescription. `blocking` marks
// the ones a prescription must not be published with.
function protocolSafetyFindings(cart, patient) {
  const named = cart.map((c) => ({
    item: c,
    product: matchProtocol(c.medication, c.route),
    label: c.medication,
  }));
  const has = (frag) => named.some((n) => n.label.toLowerCase().includes(frag));
  const history = [
    patient && patient.chronic_illnesses, patient && patient.chronicIllnesses,
    patient && patient.notes, patient && patient.medications,
  ].filter(Boolean).join(" ").toLowerCase();

  const findings = [];
  const add = (level, title, detail) => findings.push({ level, title, detail });

  // Hard incompatibility — the guidebook prohibits this pairing outright.
  if (has("ss-31") && has("mots-c")) {
    add("blocking", "SS-31 and MOTS-C must not be combined",
      PROTOCOL_PROHIBITED[0] || "Explicitly prohibited in the source protocol for SS-31.");
  }

  if (has("lr3")) {
    if (/cancer|malignan|tumour|tumor/.test(history)) {
      add("blocking", "LR3-IGF-1 is contraindicated with a cancer history",
        "Screen before prescribing — the guidebook contraindicates LR3-IGF-1 where there is a history of cancer.");
    }
    if (/diabet/.test(history)) {
      add("blocking", "LR3-IGF-1 is contraindicated with diabetes",
        "Screen before prescribing — the guidebook contraindicates LR3-IGF-1 in diabetes.");
    }
    add("warning", "LR3-IGF-1 hypoglycaemia and eligibility checks",
      "Never administer fasted; post-injection carbohydrate and protein are required. Banned in competitive sport — confirm the patient is not a tested athlete.");
  }

  const SECRETAGOGUES = ["cjc-1295", "ipamorelin", "sermorelin", "tesamorelin", "lr3"];
  const secretagogues = named.filter((n) => SECRETAGOGUES.some((s) => n.label.toLowerCase().includes(s)));
  if (secretagogues.length) {
    add("warning", "GH secretagogue — glycaemic monitoring is mandatory",
      "May reduce insulin sensitivity. Fasting glucose and HbA1c are mandatory at baseline and on review.");
  }
  if (has("lr3") && secretagogues.length > 1) {
    add("warning", "Combined IGF-1 load",
      "Stacking LR3-IGF-1 with a GH secretagogue amplifies total IGF-1 exposure. Monitor IGF-1 closely.");
  }
  if (has("pt-141")) {
    add("warning", "PT-141 raises blood pressure transiently",
      "Check blood pressure before use; avoid in uncontrolled hypertension.");
  }
  if (has("ghk-cu") && routeKey(named.find((n) => n.label.toLowerCase().includes("ghk-cu")).item.route) === "injection") {
    add("info", "Monitor copper and zinc on repeated GHK-Cu courses",
      "Panel 7 (copper and zinc) on extended or repeated courses.");
  }
  if (has("aod-9604") && cart.some((c) => c.category === "glp1")) {
    add("warning", "AOD-9604 with a GLP-1",
      "Avoid combining purely for fat loss unless clearly justified.");
  }

  // Course-length and break rules for whatever is actually prescribed.
  for (const n of named) {
    if (!n.product) continue;
    const cyc = n.product.cycling;
    if (cyc) add("info", `${n.product.name} — cycling and breaks`, cyc);
  }

  const EXPERIMENTAL = ["dihexa", "dsip", "semax", "selank", "thymosin beta-4", "mots-c", "ss-31", "lr3"];
  const investigational = named.filter((n) => EXPERIMENTAL.some((e) => n.label.toLowerCase().includes(e)));
  if (investigational.length) {
    add("info", "Investigational for the listed indications",
      `${investigational.map((n) => n.label).join(", ")} — document informed consent.`);
  }
  return findings;
}

module.exports = {
  PROTOCOL_ALIASES,
  PRACTICE_SUPPLEMENTS,
  matchProtocol,
  panelsForProduct,
  protocolSafetyFindings,
  LAB_PANELS,
};
