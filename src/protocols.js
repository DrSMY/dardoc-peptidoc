// GENERATED FILE — do not edit by hand.
// Source: Peptide Protocol Guidebook v2.xlsx
// Regenerate with: python3 scripts/build-protocols.py "<guidebook.xlsx>"
//
// The prescriber's guidebook is the clinical source of truth for peptide
// protocols: every product, its approved dosing variants, the blood panels
// that must accompany it, and the cross-peptide safety rules.

// The nine blood panels, with the tests each one contains.
const LAB_PANELS = [
  {
    "id": "Panel 1",
    "name": "Basic Safety",
    "tests": [
      "Complete Blood Count (CBC)",
      "Glycated Haemoglobin (HbA1c)",
      "Fasting Blood Sugar / Glucose",
      "Blood Urea Nitrogen (BUN)",
      "Creatinine in Serum",
      "Estimated GFR (eGFR)",
      "Sodium (Na) in Serum",
      "Potassium (K) in Serum",
      "Albumin",
      "Alanine Aminotransferase (ALT)",
      "Aspartate Aminotransferase (AST)",
      "Alkaline Phosphatase",
      "Gamma Glutamyl Transferase (GGT)",
      "Bilirubin (Total)",
      "Thyroid Stimulating Hormone (TSH)",
      "C-Reactive Protein (CRP) quantitative",
      "Vitamin D (25-hydroxycholecalciferol)"
    ],
    "price": "900"
  },
  {
    "id": "Panel 2",
    "name": "GH / IGF-1 Axis",
    "tests": [
      "Insulin-like Growth Factor (IGF-1)"
    ],
    "price": "156"
  },
  {
    "id": "Panel 3",
    "name": "Metabolic / Insulin Resistance",
    "tests": [
      "Insulin Level",
      "C-Reactive Protein (CRP) High Sensitivity"
    ],
    "price": "307"
  },
  {
    "id": "Panel 4",
    "name": "Sex Hormone / Fertility",
    "tests": [
      "Testosterone - Total",
      "Testosterone - Free",
      "Luteinizing Hormone (LH)",
      "Follicle Stimulating Hormone (FSH)",
      "Estrogen",
      "Prolactin"
    ],
    "price": "649"
  },
  {
    "id": "Panel 5",
    "name": "Cardiovascular Safety",
    "tests": [
      "Lipid Profile (Cholesterol, LDL, HDL, Triglycerides)",
      "C-Reactive Protein (CRP) High Sensitivity",
      "Apolipoprotein B"
    ],
    "price": "433"
  },
  {
    "id": "Panel 6",
    "name": "Immune / Inflammation",
    "tests": [
      "C-Reactive Protein (CRP) High Sensitivity",
      "Erythrocyte Sedimentation Rate (ESR)"
    ],
    "price": "208"
  },
  {
    "id": "Panel 7",
    "name": "Copper Monitoring",
    "tests": [
      "Copper Serum",
      "Zinc in Serum"
    ],
    "price": "327"
  },
  {
    "id": "Panel 8A",
    "name": "Cortisol + SHBG",
    "tests": [
      "Cortisol in Serum (AM)",
      "Sex Hormone Binding Globulin (SHBG)"
    ],
    "price": "276"
  },
  {
    "id": "Panel 8B",
    "name": "SHBG only",
    "tests": [
      "Sex Hormone Binding Globulin (SHBG)"
    ],
    "price": "138"
  }
];

// One entry per product (P01–P31), with its dosing variants.
const PEPTIDE_PRODUCTS = [
  {
    "ref": "P01",
    "name": "BPC-157",
    "presentation": "Injection",
    "category": "Tissue Repair / Gut Health / Inflammation Control",
    "variants": [
      {
        "name": "Variant 1 - 4 week course",
        "dose": "0.15 ml = 15 units",
        "delivered": "300 mcg per injection",
        "frequency": "Once daily",
        "course": "4 weeks (28 days)",
        "doses": "28 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": ""
      },
      {
        "name": "Variant 2 - 6 week course",
        "dose": "0.15 ml = 15 units",
        "delivered": "300 mcg per injection",
        "frequency": "Once daily",
        "course": "6 weeks (42 days)",
        "doses": "42 injections",
        "vials": "2 vials",
        "pens": "3 pens",
        "note": ""
      },
      {
        "name": "Variant 3 - 12 week course",
        "dose": "0.15 ml = 15 units",
        "delivered": "300 mcg per injection",
        "frequency": "Once daily",
        "course": "12 weeks (84 days)",
        "doses": "84 injections",
        "vials": "3 vials",
        "pens": "5 pens",
        "note": "Upper end of the accepted range, for chronic injury."
      }
    ],
    "indication": "Soft-tissue repair, tendon and ligament recovery, gut healing",
    "bestUseFor": "Musculoskeletal recovery (tendon, ligament, muscle strain) and post-injury tissue support",
    "howItWorks": "Promotes local repair signalling and angiogenesis at the site of injury; supports fibroblast migration and growth-factor receptor expression.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "2000 mcg/ml",
    "containers": "Vial 5 ml (10,000 mcg) or Pen 3 ml (6000 mcg)",
    "timing": "Same time each day, on an empty stomach.",
    "cycling": "Choose the variant by indication: acute injury at the shorter end, chronic tendinopathy at the longer end. Reassess before repeating.",
    "combinesWith": "TB-4 - synergistic tissue repair (BPC supports local healing and angiogenesis, TB-4 supports cell migration and regeneration). GHK-Cu injection - enhances repair signalling and collagen synthesis.",
    "supplements": "Collagen peptides 10-20 g/day; Vitamin C 500-1000 mg/day; Zinc 15-30 mg/day; Omega-3",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "Nausea; injection-site reaction",
    "cautions": "No known systemic hormonal or metabolic impact. Routine labs not mandatory.",
    "prescriberNote": "Timing is not morning- or night-specific. Take it at a consistent time each day on an empty stomach.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P02",
    "name": "BPC-157",
    "presentation": "Oral capsules",
    "category": "Gut Health / Inflammation Control",
    "variants": [
      {
        "name": "Variant 1 - one capsule daily",
        "dose": "1 capsule",
        "delivered": "500 mcg per day",
        "frequency": "Once daily",
        "course": "30 days",
        "doses": "30 capsules",
        "vials": "1 bottle",
        "pens": "n/a",
        "note": ""
      },
      {
        "name": "Variant 1 - one capsule daily",
        "dose": "1 capsule",
        "delivered": "500 mcg per day",
        "frequency": "Once daily",
        "course": "12 weeks (84 days)",
        "doses": "84 capsules",
        "vials": "3 bottles",
        "pens": "n/a",
        "note": ""
      },
      {
        "name": "Variant 2 - two capsules daily",
        "dose": "2 capsules",
        "delivered": "1000 mcg per day",
        "frequency": "Twice daily",
        "course": "30 days",
        "doses": "60 capsules",
        "vials": "2 bottles",
        "pens": "n/a",
        "note": ""
      },
      {
        "name": "Variant 2 - two capsules daily",
        "dose": "2 capsules",
        "delivered": "1000 mcg per day",
        "frequency": "Twice daily",
        "course": "12 weeks (84 days)",
        "doses": "168 capsules",
        "vials": "6 bottles",
        "pens": "n/a",
        "note": ""
      }
    ],
    "indication": "Gastrointestinal support, gut lining repair",
    "bestUseFor": "Gut lining support (IBS-like symptoms, gastritis adjunct), GI recovery",
    "howItWorks": "Acts locally on gastric mucosa and intestinal repair signalling; minimal systemic absorption.",
    "presentationNote": "Oral capsules, 30 per bottle",
    "route": "Oral",
    "strength": "500 mcg per capsule",
    "containers": "Bottle of 30 capsules (15,000 mcg)",
    "timing": "Consistent daily time",
    "cycling": "Well tolerated for extended use. Repeat as clinically needed.",
    "combinesWith": "KPV capsules - combined gut mucosal repair plus anti-inflammatory action",
    "supplements": "L-Glutamine 5-10 g/day; Zinc carnosine; Multi-strain probiotics",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "GI discomfort, bloating",
    "cautions": "Local GI action; no routine monitoring required.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P03",
    "name": "Epitalon",
    "presentation": "Injection",
    "category": "Sleep & Circadian / Hormonal Optimization",
    "variants": [
      {
        "name": "Variant 1 - every third day (approved protocol)",
        "dose": "1.0 ml = 100 units",
        "delivered": "10 mg per injection",
        "frequency": "Every 3 days",
        "course": "15 days, total course dose 50 mg",
        "doses": "5 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": "Repeat every 6 months."
      },
      {
        "name": "Variant 2 - 10 day intensive",
        "dose": "1.0 ml = 100 units",
        "delivered": "10 mg per injection",
        "frequency": "Once daily",
        "course": "10 days, total course dose 100 mg",
        "doses": "10 injections",
        "vials": "2 vials",
        "pens": "4 pens",
        "note": "Do not repeat except after one year."
      }
    ],
    "indication": "Sleep regulation, circadian rhythm, experimental longevity",
    "bestUseFor": "Supports longevity primarily by improving circadian rhythm and pineal signalling, which indirectly benefits hormonal balance, immune function and cellular repair.",
    "howItWorks": "Influences pineal signalling and circadian gene expression.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "10 mg/ml",
    "containers": "Vial 5 ml (50 mg) or Pen 3 ml (30 mg)",
    "timing": "No specific time of day specified",
    "cycling": "Both variants are approved. Variant 1 is the standard 6-monthly course; Variant 2 is a once-yearly intensive.",
    "combinesWith": "DSIP - circadian rhythm plus sleep quality. Sermorelin (low dose) - sleep and circadian optimisation plus physiologic GH pulsatility (advanced users only).",
    "supplements": "Melatonin 0.3-1 mg if needed; Magnesium glycinate or threonate; Glycine 3 g at night; Vitamin D",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "Headache, flushing",
    "cautions": "Baseline CMP and fasting glucose for general metabolic safety.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P04",
    "name": "CJC-1295",
    "presentation": "Injection",
    "category": "Hormonal Optimization / Tissue Repair",
    "variants": [
      {
        "name": "Variant 1 - 8 week course",
        "dose": "0.1 ml = 10 units",
        "delivered": "100 mcg per injection",
        "frequency": "5 days on, 2 days off",
        "course": "8 weeks (40 injections)",
        "doses": "40 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": ""
      },
      {
        "name": "Variant 2 - 10 week course",
        "dose": "0.1 ml = 10 units",
        "delivered": "100 mcg per injection",
        "frequency": "5 days on, 2 days off",
        "course": "10 weeks (50 injections)",
        "doses": "50 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": "Maximum course length."
      }
    ],
    "indication": "Growth hormone stimulation, body composition",
    "bestUseFor": "Growth hormone stimulation for body composition and recovery support",
    "howItWorks": "Stimulates pituitary GH release via GHRH receptors.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "1000 mcg/ml",
    "containers": "Vial 5 ml (5000 mcg) or Pen 3 ml (3000 mcg)",
    "timing": "Evening preferred, on an empty stomach",
    "cycling": "8-10 weeks maximum, then repeat after 6 months if needed. Longer breaks are preferable to longer courses.",
    "combinesWith": "Ipamorelin - classic synergistic GH stimulation via GHRH plus ghrelin pathways",
    "supplements": "L-Arginine or L-Citrulline; Zinc and Magnesium (ZMA); protein 1.6-2.0 g/kg",
    "panels": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated.",
    "monitoring": "MANDATORY",
    "sideEffects": "Flushing, palpitations",
    "cautions": "IGF-1 at baseline to establish GH-axis status. Fasting glucose and HbA1c because GH may reduce insulin sensitivity.",
    "prescriberNote": "Dose is 0.1 ml (10 units). The PRICE LIST 'standard dosage 1.0 ml' entry is an error; 0.1 ml is what reconciles the 5 ml vial with 50 injections.",
    "panelRule": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated."
  },
  {
    "ref": "P05",
    "name": "Ipamorelin",
    "presentation": "Injection",
    "category": "Hormonal Optimization / Sleep & Circadian",
    "variants": [
      {
        "name": "Variant 1 - 8 week course",
        "dose": "0.1 ml = 10 units",
        "delivered": "200 mcg per injection",
        "frequency": "5 days per week",
        "course": "8 weeks (40 injections)",
        "doses": "40 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": ""
      },
      {
        "name": "Variant 2 - 10 week course",
        "dose": "0.1 ml = 10 units",
        "delivered": "200 mcg per injection",
        "frequency": "5 days per week",
        "course": "10 weeks (50 injections)",
        "doses": "50 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": ""
      }
    ],
    "indication": "GH stimulation, recovery, sleep quality",
    "bestUseFor": "Recovery and sleep support via gentle GH stimulation",
    "howItWorks": "Ghrelin-mimetic that triggers GH release without a cortisol or prolactin rise.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "2000 mcg/ml",
    "containers": "Vial 5 ml (10,000 mcg) or Pen 3 ml (6000 mcg)",
    "timing": "Preferably in the evening",
    "cycling": "At least a 3-month break is required between courses. Considerably safer profile than CJC-1295.",
    "combinesWith": "CJC-1295 - improves GH amplitude without raising cortisol or prolactin",
    "supplements": "L-Arginine or L-Citrulline; Zinc and Magnesium (ZMA); protein 1.6-2.0 g/kg",
    "panels": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated.",
    "monitoring": "MANDATORY",
    "sideEffects": "Headache, fatigue",
    "cautions": "Monitor IGF-1 for GH response and fasting glucose for metabolic safety.",
    "prescriberNote": "Dose is 0.1 ml (10 units). The PRICE LIST 'standard dosage 1.0 ml' entry is an error.",
    "needsVerification": "1. PROTOCOLS MASTER states the required break (3 months) but never states the course length. The 8-10 week variants shown here are aligned with CJC-1295. Confirm this is intended.",
    "panelRule": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated."
  },
  {
    "ref": "P06",
    "name": "Sermorelin",
    "presentation": "Injection",
    "category": "Hormonal Optimization",
    "variants": [
      {
        "name": "Variant 1 - low dose",
        "dose": "0.2 ml = 20 units",
        "delivered": "200 mcg per injection",
        "frequency": "Once daily at bedtime",
        "course": "30 days",
        "doses": "30 injections",
        "vials": "2 vials",
        "pens": "2 pens",
        "note": ""
      },
      {
        "name": "Variant 1 - low dose",
        "dose": "0.2 ml = 20 units",
        "delivered": "200 mcg per injection",
        "frequency": "Once daily at bedtime",
        "course": "8 weeks (56 days)",
        "doses": "56 injections",
        "vials": "3 vials",
        "pens": "4 pens",
        "note": ""
      },
      {
        "name": "Variant 2 - high dose",
        "dose": "0.4 ml = 40 units",
        "delivered": "400 mcg per injection",
        "frequency": "Once daily at bedtime",
        "course": "30 days",
        "doses": "30 injections",
        "vials": "3 vials",
        "pens": "5 pens",
        "note": ""
      },
      {
        "name": "Variant 2 - high dose",
        "dose": "0.4 ml = 40 units",
        "delivered": "400 mcg per injection",
        "frequency": "Once daily at bedtime",
        "course": "8 weeks (56 days)",
        "doses": "56 injections",
        "vials": "5 vials",
        "pens": "8 pens",
        "note": ""
      }
    ],
    "indication": "Endogenous GH support, age-related GH decline",
    "bestUseFor": "Age-related GH decline support with physiologic GH pulsatility",
    "howItWorks": "Promotes physiologic, pulsatile GH release from the pituitary.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "1000 mcg/ml",
    "containers": "Vial 5 ml (5000 mcg) or Pen 3 ml (3000 mcg)",
    "timing": "At bedtime. Rotate injection site.",
    "cycling": "Can be used as an alternative to CJC-1295 / Ipamorelin, and the three may be rotated.",
    "combinesWith": "Ipamorelin - more physiologic GH pulsatility than Sermorelin alone",
    "supplements": "L-Arginine or L-Citrulline; Zinc and Magnesium (ZMA); protein 1.6-2.0 g/kg",
    "panels": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated.",
    "monitoring": "MANDATORY",
    "sideEffects": "Injection-site irritation",
    "cautions": "IGF-1 at baseline and for monitoring. TSH, as GH interacts with the thyroid axis.",
    "prescriberNote": "Strength is 1000 mcg/ml, confirmed by the prescriber. The '10000 mcg/ml' figure in PROTOCOLS MASTER and PRICE LIST is an error and should be corrected in both.",
    "needsVerification": "1. Course length is not stated in the source. The 30-day and 8-week columns are provided so a dispensing quantity can be read off once the course is set.",
    "panelRule": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated."
  },
  {
    "ref": "P07",
    "name": "Thymosin Alpha-1",
    "presentation": "Injection",
    "category": "Immune Resilience / Inflammation Control",
    "variants": [
      {
        "name": "Variant 1 - daily",
        "dose": "0.15 ml = 15 units",
        "delivered": "450 mcg per injection",
        "frequency": "Once daily",
        "course": "One month (30 days)",
        "doses": "30 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": "Into the belly fat area."
      },
      {
        "name": "Variant 2 - twice weekly",
        "dose": "0.6 ml = 60 units",
        "delivered": "1800 mcg per injection",
        "frequency": "Twice per week",
        "course": "4 weeks (8 injections)",
        "doses": "8 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": "Into the belly fat area. 60 units = 0.6 ml on a U-100 syringe."
      },
      {
        "name": "Variant 2 - twice weekly",
        "dose": "0.6 ml = 60 units",
        "delivered": "1800 mcg per injection",
        "frequency": "Twice per week",
        "course": "6 weeks (12 injections)",
        "doses": "12 injections",
        "vials": "2 vials",
        "pens": "3 pens",
        "note": "Into the belly fat area. 60 units = 0.6 ml on a U-100 syringe."
      }
    ],
    "indication": "Immune modulation, immune resilience",
    "bestUseFor": "Immune modulation and resilience; adjunct in recurrent infections",
    "howItWorks": "Enhances T-cell function and immune signalling.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "3000 mcg/ml",
    "containers": "Vial 5 ml (15,000 mcg) or Pen 3 ml (9000 mcg)",
    "timing": "Into the belly fat area",
    "cycling": "Repeat if needed after evaluation by the physician.",
    "combinesWith": "No specific combination documented",
    "supplements": "Vitamin D; Zinc; Vitamin C; Selenium",
    "panels": "Panel 1 + Panel 6",
    "monitoring": "Optional",
    "sideEffects": "Injection-site reaction, mild fatigue",
    "cautions": "CBC for baseline immune status; CRP as a systemic inflammation marker.",
    "prescriberNote": "60 units is 0.6 ml. The '(0.55 ml)' annotation in the Fusion Protocol is an error and should be corrected there.",
    "panelRule": "Panel 1 + Panel 6"
  },
  {
    "ref": "P08",
    "name": "TB-4 (Thymosin Beta-4)",
    "presentation": "Injection",
    "category": "Tissue Repair / Inflammation Control",
    "variants": [
      {
        "name": "Variant 1 - 4 week course",
        "dose": "0.25 ml = 25 units",
        "delivered": "750 mcg per injection",
        "frequency": "Once daily",
        "course": "4 weeks (28 days)",
        "doses": "28 injections",
        "vials": "2 vials",
        "pens": "3 pens",
        "note": ""
      },
      {
        "name": "Variant 2 - 6 week course",
        "dose": "0.25 ml = 25 units",
        "delivered": "750 mcg per injection",
        "frequency": "Once daily",
        "course": "6 weeks (42 days)",
        "doses": "42 injections",
        "vials": "3 vials",
        "pens": "4 pens",
        "note": ""
      },
      {
        "name": "Variant 3 - 12 week course",
        "dose": "0.25 ml = 25 units",
        "delivered": "750 mcg per injection",
        "frequency": "Once daily",
        "course": "12 weeks (84 days)",
        "doses": "84 injections",
        "vials": "5 vials",
        "pens": "7 pens",
        "note": "Upper end of the accepted range."
      }
    ],
    "indication": "Tissue repair, injury recovery (experimental)",
    "bestUseFor": "Soft-tissue repair and injury recovery (experimental use)",
    "howItWorks": "Regulates actin dynamics, cell migration and angiogenesis.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "3000 mcg/ml",
    "containers": "Vial 5 ml (15,000 mcg) or Pen 3 ml (9000 mcg)",
    "timing": "No specific time of day specified",
    "cycling": "4-12 weeks depending on acute versus chronic injury.",
    "combinesWith": "BPC-157 - the most common injury-recovery stack: cell migration plus local repair",
    "supplements": "Omega-3 fatty acids; Vitamin D; Magnesium",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "Fatigue, headache",
    "cautions": "Investigational use; no known hormonal effect.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P09",
    "name": "PT-141 (Bremelanotide)",
    "presentation": "Nasal spray",
    "category": "Sexual Vitality",
    "variants": [
      {
        "name": "Variant 1 - one pump per nostril",
        "dose": "2 pumps (1 per nostril) = 0.3 ml",
        "delivered": "200 mcg per use",
        "frequency": "As needed before sexual activity, up to 2-3 times per day",
        "course": "50 uses",
        "doses": "100 pumps",
        "vials": "1 bottle",
        "pens": "n/a",
        "note": "On demand. One bottle covers 50 uses."
      },
      {
        "name": "Variant 2 - two pumps per nostril",
        "dose": "4 pumps (2 per nostril) = 0.6 ml",
        "delivered": "400 mcg per use",
        "frequency": "As needed before sexual activity, up to 2-3 times per day",
        "course": "25 uses",
        "doses": "100 pumps",
        "vials": "1 bottle",
        "pens": "n/a",
        "note": "On demand. One bottle covers 25 uses."
      }
    ],
    "indication": "Sexual desire and arousal",
    "bestUseFor": "Low sexual desire or arousal in men and women, on-demand use",
    "howItWorks": "Activates CNS melanocortin receptors. Non-hormonal, acts centrally rather than on blood flow.",
    "presentationNote": "Nasal spray bottle",
    "route": "Intranasal",
    "strength": "10 mg in 15 ml (0.67 mg/ml). Each pump delivers 0.15 ml = 100 mcg.",
    "containers": "Bottle 15 ml = 100 pumps",
    "timing": "Before sexual activity",
    "cycling": "On-demand use only. No cycling required.",
    "combinesWith": "Can be combined with Oxytocin to improve outcomes",
    "supplements": "L-Citrulline or L-Arginine; Zinc; Ashwagandha if stress-related libido suppression",
    "panels": "Blood pressure check (clinical, not lab)",
    "monitoring": "Optional",
    "sideEffects": "Nausea, flushing",
    "cautions": "Cardiovascular safety: check blood pressure before use. Avoid in uncontrolled hypertension.",
    "prescriberNote": "Pump volume 0.15 ml, confirmed by the prescriber. Dispensing is by bottle; one bottle covers 25-50 uses depending on the variant.",
    "panelRule": "Blood pressure check (clinical, not lab)"
  },
  {
    "ref": "P10",
    "name": "PT-141 (Bremelanotide)",
    "presentation": "Injection",
    "category": "Sexual Vitality",
    "variants": [
      {
        "name": "Variant 1 - starting dose (men)",
        "dose": "0.1 ml = 10 units",
        "delivered": "1 mg per injection",
        "frequency": "As needed, maximum twice per week",
        "course": "10 on-demand doses",
        "doses": "10 injections",
        "vials": "1 vial",
        "pens": "1 pen",
        "note": "Men start here and titrate up. Do not exceed 0.2 ml."
      },
      {
        "name": "Variant 1 - starting dose (men)",
        "dose": "0.1 ml = 10 units",
        "delivered": "1 mg per injection",
        "frequency": "As needed, maximum twice per week",
        "course": "20 on-demand doses",
        "doses": "20 injections",
        "vials": "1 vial",
        "pens": "1 pen",
        "note": "Men start here and titrate up. Do not exceed 0.2 ml."
      },
      {
        "name": "Variant 2 - standard dose",
        "dose": "0.2 ml = 20 units",
        "delivered": "2 mg per injection",
        "frequency": "As needed, maximum twice per week",
        "course": "10 on-demand doses",
        "doses": "10 injections",
        "vials": "1 vial",
        "pens": "1 pen",
        "note": "Standard dose for women; maximum dose for men."
      },
      {
        "name": "Variant 2 - standard dose",
        "dose": "0.2 ml = 20 units",
        "delivered": "2 mg per injection",
        "frequency": "As needed, maximum twice per week",
        "course": "20 on-demand doses",
        "doses": "20 injections",
        "vials": "2 vials",
        "pens": "2 pens",
        "note": "Standard dose for women; maximum dose for men."
      }
    ],
    "indication": "Sexual desire, erectile response",
    "bestUseFor": "Erectile response and libido support; central and non-hormonal",
    "howItWorks": "Central melanocortin receptor activation.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "10 mg/ml",
    "containers": "Vial 2 ml (20 mg) or Pen 2 ml (20 mg)",
    "timing": "30 minutes to 6 hours before sexual activity",
    "cycling": "On demand. Do not exceed twice weekly.",
    "combinesWith": "No specific combination documented",
    "supplements": "L-Citrulline or L-Arginine; Zinc; Ashwagandha if stress-related libido suppression",
    "panels": "Panel 1 + Panel 4. Add Panel 5 if over 40. Panel 8B if clinically indicated.",
    "monitoring": "Optional",
    "sideEffects": "Nausea, transient rise in blood pressure",
    "cautions": "Transient blood pressure rise. Screen cardiovascular risk.",
    "panelRule": "Panel 1 + Panel 4. Add Panel 5 if over 40. Panel 8B if clinically indicated."
  },
  {
    "ref": "P11",
    "name": "CJC-1295 / Ipamorelin",
    "presentation": "Blend injection",
    "category": "Hormonal Optimization / Metabolic Health",
    "variants": [
      {
        "name": "Variant 1 - 8 week course",
        "dose": "0.1 ml = 10 units",
        "delivered": "100 mcg CJC-1295 + 200 mcg Ipamorelin",
        "frequency": "5 of 7 nights per week",
        "course": "8 weeks (40 injections)",
        "doses": "40 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": ""
      },
      {
        "name": "Variant 2 - 10 week course",
        "dose": "0.1 ml = 10 units",
        "delivered": "100 mcg CJC-1295 + 200 mcg Ipamorelin",
        "frequency": "5 of 7 nights per week",
        "course": "10 weeks (50 injections)",
        "doses": "50 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": ""
      }
    ],
    "indication": "GH stimulation, body composition",
    "bestUseFor": "Enhanced GH stimulation for body composition and recovery",
    "howItWorks": "Dual GH stimulation through both the GHRH and ghrelin pathways.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "1000 mcg/ml CJC-1295 + 2000 mcg/ml Ipamorelin",
    "containers": "Vial 5 ml or Pen 3 ml",
    "timing": "Before bedtime, on an empty stomach",
    "cycling": "8-10 weeks maximum, repeat after 6 months if needed.",
    "combinesWith": "AOD-9604 - GH support plus fat-loss signalling in metabolic programmes",
    "supplements": "L-Arginine or L-Citrulline; Zinc and Magnesium (ZMA); protein 1.6-2.0 g/kg",
    "panels": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated.",
    "monitoring": "MANDATORY",
    "sideEffects": "Water retention, headache",
    "cautions": "IGF-1 for GH monitoring; fasting glucose and HbA1c for insulin sensitivity.",
    "panelRule": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated."
  },
  {
    "ref": "P12",
    "name": "GHK-Cu",
    "presentation": "Injection",
    "category": "Skin & Aesthetic Aging / Tissue Repair",
    "variants": [
      {
        "name": "Variant 1 - 1 mg",
        "dose": "0.1 ml = 10 units",
        "delivered": "1 mg per injection",
        "frequency": "Once daily",
        "course": "6 weeks (42 days)",
        "doses": "42 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": ""
      },
      {
        "name": "Variant 2 - 1.5 mg",
        "dose": "0.15 ml = 15 units",
        "delivered": "1.5 mg per injection",
        "frequency": "Once daily",
        "course": "6 weeks (42 days)",
        "doses": "42 injections",
        "vials": "2 vials",
        "pens": "3 pens",
        "note": ""
      },
      {
        "name": "Variant 3 - 2 mg",
        "dose": "0.2 ml = 20 units",
        "delivered": "2 mg per injection",
        "frequency": "Once daily",
        "course": "6 weeks (42 days)",
        "doses": "42 injections",
        "vials": "2 vials",
        "pens": "3 pens",
        "note": ""
      }
    ],
    "indication": "Tissue repair signalling, skin and hair support",
    "bestUseFor": "Tissue repair signalling, skin and hair support (advanced protocols)",
    "howItWorks": "Activates collagen and repair gene expression; copper-peptide complex supporting fibroblast activity.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "10 mg/ml",
    "containers": "Vial 5 ml (50 mg) or Pen 3 ml (30 mg)",
    "timing": "No specific time of day specified",
    "cycling": "6 weeks on, then a 4-6 week break before repeating.",
    "combinesWith": "BPC-157 - repair plus collagen and skin signalling; useful post-procedure",
    "supplements": "Collagen peptides; Vitamin C; Biotin if deficient; Silica",
    "panels": "Panel 1 + Panel 7 (copper monitoring)",
    "monitoring": "Optional",
    "sideEffects": "Injection-site irritation",
    "cautions": "Copper-containing. Monitor serum copper and zinc (Panel 7) on extended or repeated courses.",
    "panelRule": "Panel 1 + Panel 7 (copper monitoring)"
  },
  {
    "ref": "P13",
    "name": "GHK-Cu",
    "presentation": "Facial serum",
    "category": "Skin & Aesthetic Aging",
    "variants": [
      {
        "name": "Variant 1 - nightly",
        "dose": "Apply as directed",
        "delivered": "Topical, not dose-calculated",
        "frequency": "Once daily at night",
        "course": "One month",
        "doses": "-",
        "vials": "1 bottle",
        "pens": "n/a",
        "note": "One bottle covers 25-30 nightly applications."
      }
    ],
    "indication": "Skin regeneration, collagen stimulation",
    "bestUseFor": "Skin rejuvenation, collagen support, post-procedure care",
    "howItWorks": "Enhances fibroblast activity locally.",
    "presentationNote": "Topical facial serum",
    "route": "Topical (face)",
    "strength": "0.3% GHK-Cu serum with hyaluronic acid 2% and dexpanthenol 0.5%",
    "containers": "Serum bottle",
    "timing": "At night",
    "cycling": "No cycling required for topical cosmetic use.",
    "combinesWith": "No specific combination documented",
    "supplements": "Collagen peptides; Vitamin C; Biotin if deficient; Silica",
    "panels": "None required",
    "monitoring": "Not required",
    "sideEffects": "Local skin irritation",
    "cautions": "Topical only. Avoid broken skin and the eye area.",
    "prescriberNote": "Formulation per the Fusion Protocol: 0.3% serum with HY (hyaluronic acid) 2% and dexpanthenol 0.5%. The 'Peacelake brand 0.5%' wording in PROTOCOLS MASTER should be corrected to match.",
    "panelRule": "None required"
  },
  {
    "ref": "P14",
    "name": "GHK-Cu",
    "presentation": "Scalp foam",
    "category": "Skin & Aesthetic Aging",
    "variants": [
      {
        "name": "Variant 1 - nightly",
        "dose": "Apply with gentle massage",
        "delivered": "Topical, not dose-calculated",
        "frequency": "Once daily at night",
        "course": "One month",
        "doses": "-",
        "vials": "1 bottle",
        "pens": "n/a",
        "note": "One bottle covers 25-30 nightly applications."
      }
    ],
    "indication": "Hair follicle support, scalp health",
    "bestUseFor": "Hair thinning support, scalp health",
    "howItWorks": "Supports follicle signalling and scalp repair.",
    "presentationNote": "Topical scalp foam",
    "route": "Topical (scalp)",
    "strength": "0.1-0.15% scalp foam",
    "containers": "Foam bottle",
    "timing": "At night, massaged into the scalp",
    "cycling": "No cycling required for topical cosmetic use.",
    "combinesWith": "No specific combination documented",
    "supplements": "Collagen peptides; Vitamin C; Biotin if deficient; Silica",
    "panels": "None required",
    "monitoring": "Not required",
    "sideEffects": "Scalp irritation",
    "cautions": "Topical only.",
    "prescriberNote": "Strength and dosing per the Fusion Protocol: 0.1-0.15% foam applied nightly with gentle massage. The '0.1-0.19%' range in PROTOCOLS MASTER and PRICE LIST should be corrected to match.",
    "panelRule": "None required"
  },
  {
    "ref": "P15",
    "name": "MOTS-C",
    "presentation": "Injection",
    "category": "Mitochondrial Health / Metabolic Health",
    "variants": [
      {
        "name": "Variant 1 - Greenfield (preferred)",
        "dose": "1.0 ml = 100 units",
        "delivered": "10 mg per injection",
        "frequency": "Once weekly before exercise",
        "course": "10 weeks (10 injections)",
        "doses": "10 injections",
        "vials": "2 vials",
        "pens": "4 pens",
        "note": "Athletes and highly active patients. Maximum 10 weeks per year."
      },
      {
        "name": "Variant 2 - Seeds",
        "dose": "0.5 ml = 50 units",
        "delivered": "5 mg per injection",
        "frequency": "3 times weekly, then once weekly",
        "course": "4 weeks + 4 week maintenance (16 injections)",
        "doses": "16 injections",
        "vials": "2 vials",
        "pens": "3 pens",
        "note": "Metabolic syndrome and insulin resistance."
      },
      {
        "name": "Variant 2 - Seeds",
        "dose": "0.5 ml = 50 units",
        "delivered": "5 mg per injection",
        "frequency": "3 times weekly, then once weekly",
        "course": "6 weeks + 4 week maintenance (22 injections)",
        "doses": "22 injections",
        "vials": "3 vials",
        "pens": "4 pens",
        "note": "Metabolic syndrome and insulin resistance."
      },
      {
        "name": "Variant 3 - Kominiarek",
        "dose": "1.0 ml = 100 units",
        "delivered": "10 mg per injection",
        "frequency": "Once weekly",
        "course": "4 weeks (4 injections)",
        "doses": "4 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": "First-time or conservative use. May be repeated once more within the same year."
      }
    ],
    "indication": "Metabolic flexibility, insulin sensitivity",
    "bestUseFor": "Variant 1: athletes and highly active. Variant 2: metabolic syndrome and insulin resistance. Variant 3: first-time or conservative use.",
    "howItWorks": "Mitochondrial-derived peptide that improves cellular energy use and metabolic flexibility.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "10 mg/ml",
    "containers": "Vial 5 ml (50 mg) or Pen 3 ml (30 mg)",
    "timing": "Variant 1 is taken before exercise",
    "cycling": "No more than 1-2 cycles per year. Minimum 3-6 month break between cycles.",
    "combinesWith": "AOD-9604 - metabolic flexibility plus fat metabolism. CJC/Ipamorelin (advanced). DO NOT stack with SS-31.",
    "supplements": "Alpha-lipoic acid; Berberine if insulin resistance present; Magnesium; Omega-3",
    "panels": "Panel 1 + Panel 3. Add Panel 5 if over 40.",
    "monitoring": "MANDATORY",
    "sideEffects": "Not documented in source",
    "cautions": "Do not stack with SS-31.",
    "needsVerification": "1. Side effect profile is blank in the source for MOTS-C and needs to be completed.",
    "panelRule": "Panel 1 + Panel 3. Add Panel 5 if over 40."
  },
  {
    "ref": "P16",
    "name": "AOD-9604",
    "presentation": "Injection",
    "category": "Metabolic Health",
    "variants": [
      {
        "name": "Variant 1 - standard, once daily",
        "dose": "0.25 ml = 25 units",
        "delivered": "300 mcg per injection",
        "frequency": "Once daily, morning before food and before cardio",
        "course": "8 weeks (56 days)",
        "doses": "56 injections",
        "vials": "3 vials",
        "pens": "Not available",
        "note": "Standard variant. One vial covers 20 days."
      },
      {
        "name": "Variant 1 - standard, once daily",
        "dose": "0.25 ml = 25 units",
        "delivered": "300 mcg per injection",
        "frequency": "Once daily, morning before food and before cardio",
        "course": "12 weeks (84 days)",
        "doses": "84 injections",
        "vials": "5 vials",
        "pens": "Not available",
        "note": "Standard variant. One vial covers 20 days."
      },
      {
        "name": "Variant 1 - standard, once daily",
        "dose": "0.25 ml = 25 units",
        "delivered": "300 mcg per injection",
        "frequency": "Once daily, morning before food and before cardio",
        "course": "16 weeks (112 days)",
        "doses": "112 injections",
        "vials": "6 vials",
        "pens": "Not available",
        "note": "Standard variant. One vial covers 20 days."
      },
      {
        "name": "Variant 2 - twice daily",
        "dose": "0.2 ml = 20 units",
        "delivered": "240 mcg per injection",
        "frequency": "Twice daily, morning on an empty stomach and before bed 1-4 hours after a meal",
        "course": "8 weeks (112 injections)",
        "doses": "112 injections",
        "vials": "5 vials",
        "pens": "Not available",
        "note": "One vial covers 12 days at this schedule."
      },
      {
        "name": "Variant 2 - twice daily",
        "dose": "0.2 ml = 20 units",
        "delivered": "240 mcg per injection",
        "frequency": "Twice daily, morning on an empty stomach and before bed 1-4 hours after a meal",
        "course": "12 weeks (168 injections)",
        "doses": "168 injections",
        "vials": "7 vials",
        "pens": "Not available",
        "note": "One vial covers 12 days at this schedule."
      }
    ],
    "indication": "Fat-loss support (adjunct), metabolic support (experimental)",
    "bestUseFor": "Fat-loss support as an adjunct to lifestyle and medical weight programmes. Best for athletes and active individuals targeting visceral or stubborn fat.",
    "howItWorks": "Fragment of human growth hormone designed to stimulate fat breakdown (lipolysis) and reduce fat storage (lipogenesis) with minimal GH / IGF-1 activity.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "1200 mcg/ml",
    "containers": "Vial 5 ml (6000 mcg). Pen not listed in PRICE LIST.",
    "timing": "Variant 1 morning before food and cardio. Variant 2 morning fasted plus before bed.",
    "cycling": "Break 4-8 weeks before repeating.",
    "combinesWith": "CJC/Ipamorelin - fat metabolism plus GH-mediated recovery. MOTS-C - metabolic flexibility. Avoid combining with GLP-1 purely for fat loss unless clearly justified.",
    "supplements": "High-quality protein; Omega-3; Green tea extract (EGCG); L-Carnitine",
    "panels": "Panel 1 + Panel 3",
    "monitoring": "MANDATORY",
    "sideEffects": "Headache, nausea; injection-site reaction",
    "cautions": "Fasting glucose and HbA1c for baseline metabolic status; lipid profile as a cardiometabolic baseline.",
    "prescriberNote": "Variant 2 at 20 units delivers 240 mcg, not the 250 mcg stated in the source. To deliver exactly 250 mcg the volume would be 0.208 ml.",
    "needsVerification": "1. A pen is priced for AOD-9604 on the F1 supplier sheet but there is no pen row in the PRICE LIST, so pen quantities cannot be calculated. Add the pen volume to the PRICE LIST.",
    "panelRule": "Panel 1 + Panel 3"
  },
  {
    "ref": "P17",
    "name": "Kisspeptin-10 Acetate",
    "presentation": "Injection",
    "category": "Hormonal Optimization / Sexual Vitality",
    "variants": [
      {
        "name": "Variant 1 - 30 day course",
        "dose": "0.1 ml = 10 units",
        "delivered": "10 mcg per injection",
        "frequency": "Once daily before bed",
        "course": "30 days",
        "doses": "30 injections",
        "vials": "1 vial",
        "pens": "Not available",
        "note": ""
      },
      {
        "name": "Variant 2 - 40 day course (maximum)",
        "dose": "0.1 ml = 10 units",
        "delivered": "10 mcg per injection",
        "frequency": "Once daily before bed",
        "course": "40 days",
        "doses": "40 injections",
        "vials": "1 vial",
        "pens": "Not available",
        "note": "40 days is the maximum continuous daily use and empties one vial exactly."
      }
    ],
    "indication": "Fertility support (ovulation induction support); libido and sexual function via HPG-axis signalling",
    "bestUseFor": "Fertility and reproductive hormone signalling support in selected cases",
    "howItWorks": "Stimulates GnRH release, which increases LH and FSH, supporting ovulatory and sex-hormone signalling.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "100 mcg/ml",
    "containers": "Vial 4 ml (400 mcg). Pen not listed in PRICE LIST.",
    "timing": "Before bed",
    "cycling": "Break of at least 4-8 weeks before repeating.",
    "combinesWith": "No specific combination documented",
    "supplements": "Vitamin D; Zinc; Folate (women); Omega-3",
    "panels": "Panel 1 + Panel 4. Add Panel 5 if over 40.",
    "monitoring": "MANDATORY",
    "sideEffects": "Headache, flushing; possible transient hormone fluctuations",
    "cautions": "LH, FSH, oestradiol and progesterone to assess cycle and ovulation status.",
    "prescriberNote": "Strength 100 mcg/ml in a 4 ml vial, per PROTOCOLS MASTER and confirmed by the prescriber. The '1000 mcg/ml in 5 ml' figure in the Fusion Protocol is an error and should be corrected there.",
    "panelRule": "Panel 1 + Panel 4. Add Panel 5 if over 40."
  },
  {
    "ref": "P18",
    "name": "Dihexa",
    "presentation": "2.5 mg capsules",
    "category": "Cognitive Performance",
    "variants": [
      {
        "name": "Variant 1 - one capsule daily",
        "dose": "1 capsule",
        "delivered": "2.5 mg per day",
        "frequency": "Once daily",
        "course": "45 days (maximum)",
        "doses": "45 capsules",
        "vials": "2 bottles",
        "pens": "n/a",
        "note": ""
      },
      {
        "name": "Variant 2 - two capsules daily",
        "dose": "2 capsules",
        "delivered": "5 mg per day",
        "frequency": "Twice daily",
        "course": "45 days (maximum)",
        "doses": "90 capsules",
        "vials": "3 bottles",
        "pens": "n/a",
        "note": ""
      }
    ],
    "indication": "Cognitive support and memory (experimental)",
    "bestUseFor": "Cognitive support and memory, experimental, low starting dose",
    "howItWorks": "HGF / c-Met pathway-linked synaptogenesis signalling (investigational).",
    "presentationNote": "Oral capsules, 30 per bottle",
    "route": "Oral",
    "strength": "2.5 mg per capsule",
    "containers": "Bottle of 30 capsules",
    "timing": "No specific time of day specified",
    "cycling": "Maximum 45 days per course. Reassess before repeating.",
    "combinesWith": "No specific combination documented",
    "supplements": "Omega-3 (DHA); Choline (citicoline or alpha-GPC); B-complex vitamins",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "Headache, nausea; jitteriness or insomnia in some users",
    "cautions": "Baseline CMP is reasonable for general safety with a new neuroactive agent.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P19",
    "name": "Dihexa",
    "presentation": "20 mg capsules",
    "category": "Cognitive Performance",
    "variants": [
      {
        "name": "Variant 1 - one capsule daily",
        "dose": "1 capsule",
        "delivered": "20 mg per day",
        "frequency": "Once daily",
        "course": "45 days (maximum)",
        "doses": "45 capsules",
        "vials": "2 bottles",
        "pens": "n/a",
        "note": "Experienced users only."
      }
    ],
    "indication": "Advanced cognitive support (experimental)",
    "bestUseFor": "Advanced cognitive support, experienced users only, experimental",
    "howItWorks": "Same investigational neurotrophic signalling as the 2.5 mg strength.",
    "presentationNote": "Oral capsules, 30 per bottle",
    "route": "Oral",
    "strength": "20 mg per capsule",
    "containers": "Bottle of 30 capsules",
    "timing": "No specific time of day specified",
    "cycling": "Maximum 45 days per course. Experienced users only.",
    "combinesWith": "No specific combination documented",
    "supplements": "Omega-3 (DHA); Choline (citicoline or alpha-GPC); B-complex vitamins",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "Headache, nausea; insomnia or anxiety possible",
    "cautions": "Consider CMP for baseline safety.",
    "needsVerification": "1. The step from the 2.5 mg strength to 20 mg is an 8x increase with no documented titration pathway between the two. Define the escalation criteria.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P20",
    "name": "DSIP (Delta Sleep-Inducing Peptide)",
    "presentation": "Injection",
    "category": "Sleep & Circadian",
    "variants": [
      {
        "name": "Variant 1 - daily initiation",
        "dose": "0.1 ml = 10 units",
        "delivered": "100 mcg per injection",
        "frequency": "Once daily at night",
        "course": "2 weeks (14 days)",
        "doses": "14 injections",
        "vials": "1 vial",
        "pens": "1 pen",
        "note": "Maximum 30 days of continuous daily use."
      },
      {
        "name": "Variant 1 - daily initiation",
        "dose": "0.1 ml = 10 units",
        "delivered": "100 mcg per injection",
        "frequency": "Once daily at night",
        "course": "30 days (maximum daily use)",
        "doses": "30 injections",
        "vials": "2 vials",
        "pens": "2 pens",
        "note": "Maximum 30 days of continuous daily use."
      },
      {
        "name": "Variant 2 - every third day maintenance",
        "dose": "0.1 ml = 10 units",
        "delivered": "100 mcg per injection",
        "frequency": "Every 3 days",
        "course": "4 weeks (10 injections)",
        "doses": "10 injections",
        "vials": "1 vial",
        "pens": "1 pen",
        "note": ""
      },
      {
        "name": "Variant 2 - every third day maintenance",
        "dose": "0.1 ml = 10 units",
        "delivered": "100 mcg per injection",
        "frequency": "Every 3 days",
        "course": "8 weeks (19 injections)",
        "doses": "19 injections",
        "vials": "1 vial",
        "pens": "1 pen",
        "note": ""
      },
      {
        "name": "Variant 3 - weekly maintenance",
        "dose": "0.1 ml = 10 units",
        "delivered": "100 mcg per injection",
        "frequency": "1-2 times weekly",
        "course": "8 weeks at 2x weekly (16 injections)",
        "doses": "16 injections",
        "vials": "1 vial",
        "pens": "1 pen",
        "note": ""
      },
      {
        "name": "Variant 4 - reduced dose once stable",
        "dose": "0.05 ml = 5 units",
        "delivered": "50 mcg per injection",
        "frequency": "Once daily at night",
        "course": "30 days",
        "doses": "30 injections",
        "vials": "1 vial",
        "pens": "1 pen",
        "note": "Step down to this once the patient has stabilised."
      }
    ],
    "indication": "Sleep initiation and quality support (experimental)",
    "bestUseFor": "Sleep initiation and sleep quality support",
    "howItWorks": "Modulates sleep-related neuropeptide signalling. Mechanism in humans is not fully established.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "1000 mcg/ml",
    "containers": "Vial 2 ml (2000 mcg) or Pen 2 ml (2000 mcg)",
    "timing": "At night, 3 hours before bedtime",
    "cycling": "Move from Variant 1 to Variant 2 or 3 for maintenance, for a further 4-8 weeks if needed.",
    "combinesWith": "Epitalon - sleep initiation plus circadian rhythm alignment",
    "supplements": "Magnesium glycinate; L-theanine; Glycine",
    "panels": "Panel 1. Panel 8A if clinically indicated.",
    "monitoring": "Optional",
    "sideEffects": "Drowsiness, vivid dreams; headache",
    "cautions": "Consider TSH if the sleep complaint suggests thyroid disturbance.",
    "needsVerification": "1. Duration conflict remains open: PROTOCOLS MASTER says maximum 30 days continuous daily use; Fusion Protocol says 'do not give more than 40 days'. 30 days is used here. Confirm.",
    "panelRule": "Panel 1. Panel 8A if clinically indicated."
  },
  {
    "ref": "P21",
    "name": "Semax",
    "presentation": "Nasal spray",
    "category": "Cognitive Performance / Stress Resilience",
    "variants": [
      {
        "name": "Variant 1 - one puff per nostril",
        "dose": "2 pumps (1 per nostril) = 0.3 ml",
        "delivered": "900 mcg per day",
        "frequency": "Once daily at night",
        "course": "One month (30 days) = 60 pumps",
        "doses": "60 pumps",
        "vials": "1 bottle",
        "pens": "n/a",
        "note": "One bottle provides 33 days at this dose."
      },
      {
        "name": "Variant 2 - two puffs per nostril",
        "dose": "4 pumps (2 per nostril) = 0.6 ml",
        "delivered": "1800 mcg per day",
        "frequency": "Once daily at night",
        "course": "One month (30 days) = 120 pumps",
        "doses": "120 pumps",
        "vials": "2 bottles",
        "pens": "n/a",
        "note": "One bottle provides 16 days at this dose."
      }
    ],
    "indication": "Cognitive performance, focus, stress resilience (experimental)",
    "bestUseFor": "Focus, cognitive performance and stress resilience",
    "howItWorks": "Nootropic peptide influencing neurotrophic and neurotransmitter pathways (investigational).",
    "presentationNote": "Nasal spray bottle",
    "route": "Intranasal",
    "strength": "3 mg/ml. Each pump delivers 0.15 ml = 450 mcg.",
    "containers": "Bottle 10 ml = 66 pumps",
    "timing": "At night",
    "cycling": "Maximum one month of continuous use.",
    "combinesWith": "Selank - focus plus anxiety modulation for neurocognitive balance",
    "supplements": "Omega-3 (DHA-rich); B-complex vitamins; Rhodiola (low dose)",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "Nasal irritation, headache; agitation in sensitive users",
    "cautions": "Night-time dosing is intentional for this protocol.",
    "prescriberNote": "Pump volume 0.15 ml, confirmed by the prescriber. This supersedes the '0.1 ml per puff' figure in PROTOCOLS MASTER, which should be corrected there.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P22",
    "name": "Semax",
    "presentation": "Injection",
    "category": "Cognitive Performance",
    "variants": [
      {
        "name": "Variant 1 - 4 week course",
        "dose": "0.3 ml = 30 units",
        "delivered": "300 mcg per injection",
        "frequency": "Twice weekly at night",
        "course": "4 weeks (8 injections)",
        "doses": "8 injections",
        "vials": "1 vial",
        "pens": "1 pen",
        "note": ""
      },
      {
        "name": "Variant 2 - 6 week course",
        "dose": "0.3 ml = 30 units",
        "delivered": "300 mcg per injection",
        "frequency": "Twice weekly at night",
        "course": "6 weeks (12 injections)",
        "doses": "12 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": ""
      }
    ],
    "indication": "Mild cognitive and focus support",
    "bestUseFor": "Mild cognitive and focus support",
    "howItWorks": "Same investigational neurotrophic and neurotransmitter signalling as the nasal route.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "1 mg/ml",
    "containers": "Vial 5 ml (5 mg) or Pen 3 ml (3 mg)",
    "timing": "At night",
    "cycling": "4-6 weeks per course.",
    "combinesWith": "Selank injection - calm focus plus cognitive performance",
    "supplements": "Omega-3 (DHA-rich); B-complex vitamins; Rhodiola (low dose)",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "Headache; injection-site irritation",
    "cautions": "None specified in source",
    "prescriberNote": "Dose is 0.3 ml (30 units). The '0.1 ml' figures in PROTOCOLS MASTER and PRICE LIST are errors and should be corrected in both.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P23",
    "name": "Selank",
    "presentation": "Nasal spray",
    "category": "Stress Resilience / Cognitive Performance",
    "variants": [
      {
        "name": "Variant 1 - one puff per nostril",
        "dose": "2 pumps (1 per nostril) = 0.3 ml",
        "delivered": "900 mcg per day",
        "frequency": "Once daily at night",
        "course": "45 days (maximum) = 90 pumps",
        "doses": "90 pumps",
        "vials": "2 bottles",
        "pens": "n/a",
        "note": "One bottle provides 33 days at this dose."
      },
      {
        "name": "Variant 2 - two puffs per nostril",
        "dose": "4 pumps (2 per nostril) = 0.6 ml",
        "delivered": "1800 mcg per day",
        "frequency": "Once daily at night",
        "course": "45 days (maximum) = 180 pumps",
        "doses": "180 pumps",
        "vials": "3 bottles",
        "pens": "n/a",
        "note": "One bottle provides 16 days at this dose."
      }
    ],
    "indication": "Anxiety and stress modulation, calm focus (experimental)",
    "bestUseFor": "Anxiety and stress modulation, calm focus",
    "howItWorks": "Modulates GABAergic and anxiolytic signalling (investigational).",
    "presentationNote": "Nasal spray bottle",
    "route": "Intranasal",
    "strength": "3 mg/ml. Each pump delivers 0.15 ml = 450 mcg.",
    "containers": "Bottle 10 ml = 66 pumps",
    "timing": "At night",
    "cycling": "Maximum 45 days per course.",
    "combinesWith": "Semax - calm focus plus cognitive performance",
    "supplements": "Magnesium threonate or glycinate; L-theanine; Ashwagandha",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "Drowsiness, nasal irritation",
    "cautions": "None specified in source",
    "prescriberNote": "Pump volume 0.15 ml, confirmed by the prescriber.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P24",
    "name": "Selank",
    "presentation": "Injection",
    "category": "Stress Resilience",
    "variants": [
      {
        "name": "Variant 1 - 4 week course",
        "dose": "0.3 ml = 30 units",
        "delivered": "300 mcg per injection",
        "frequency": "Twice weekly at night",
        "course": "4 weeks (8 injections)",
        "doses": "8 injections",
        "vials": "1 vial",
        "pens": "1 pen",
        "note": ""
      },
      {
        "name": "Variant 2 - 6 week course",
        "dose": "0.3 ml = 30 units",
        "delivered": "300 mcg per injection",
        "frequency": "Twice weekly at night",
        "course": "6 weeks (12 injections)",
        "doses": "12 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": ""
      }
    ],
    "indication": "Mild anxiolytic and emotional balance support",
    "bestUseFor": "Mild anxiolytic and emotional balance support",
    "howItWorks": "Same GABAergic and anxiolytic modulation as the nasal route.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "1 mg/ml",
    "containers": "Vial 5 ml (5 mg) or Pen 3 ml (3 mg)",
    "timing": "At night",
    "cycling": "4-6 weeks per course, to a maximum of 45 days.",
    "combinesWith": "Semax injection - calm focus plus cognitive performance",
    "supplements": "Magnesium threonate or glycinate; L-theanine; Ashwagandha",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "Drowsiness; injection-site irritation",
    "cautions": "None specified in source",
    "prescriberNote": "Dose is 0.3 ml (30 units). The '0.1 ml' figures in PROTOCOLS MASTER and PRICE LIST are errors and should be corrected in both.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P25",
    "name": "KPV",
    "presentation": "Oral capsules",
    "category": "Gut Health / Inflammation Control",
    "variants": [
      {
        "name": "Variant 1 - one capsule daily",
        "dose": "1 capsule",
        "delivered": "500 mcg per day",
        "frequency": "Once daily",
        "course": "8 weeks (56 days)",
        "doses": "56 capsules",
        "vials": "2 bottles",
        "pens": "n/a",
        "note": ""
      },
      {
        "name": "Variant 1 - one capsule daily",
        "dose": "1 capsule",
        "delivered": "500 mcg per day",
        "frequency": "Once daily",
        "course": "12 weeks (84 days)",
        "doses": "84 capsules",
        "vials": "3 bottles",
        "pens": "n/a",
        "note": ""
      },
      {
        "name": "Variant 2 - two capsules daily",
        "dose": "2 capsules",
        "delivered": "1000 mcg per day",
        "frequency": "Twice daily",
        "course": "8 weeks (112 capsules)",
        "doses": "112 capsules",
        "vials": "4 bottles",
        "pens": "n/a",
        "note": ""
      },
      {
        "name": "Variant 2 - two capsules daily",
        "dose": "2 capsules",
        "delivered": "1000 mcg per day",
        "frequency": "Twice daily",
        "course": "12 weeks (168 capsules)",
        "doses": "168 capsules",
        "vials": "6 bottles",
        "pens": "n/a",
        "note": ""
      }
    ],
    "indication": "Gut inflammation support (IBS-like symptoms adjunct); skin inflammation support (experimental)",
    "bestUseFor": "Gut inflammation support, IBS-like symptoms adjunct",
    "howItWorks": "Tripeptide derived from alpha-MSH; anti-inflammatory signalling in gut and immune pathways.",
    "presentationNote": "Oral capsules, 30 per bottle",
    "route": "Oral",
    "strength": "500 mcg per capsule",
    "containers": "Bottle of 30 capsules",
    "timing": "No specific time of day specified",
    "cycling": "Up to 12 weeks per course.",
    "combinesWith": "BPC-157 capsules - gut inflammation control plus mucosal repair",
    "supplements": "Bioavailable curcumin; Omega-3; Glutamine; Probiotics",
    "panels": "Panel 1. CRP optional as a baseline inflammation marker.",
    "monitoring": "Optional",
    "sideEffects": "GI discomfort (rare), headache",
    "cautions": "None specified in source",
    "prescriberNote": "Strength is 500 mcg per capsule, not mg.",
    "panelRule": "Panel 1. CRP optional as a baseline inflammation marker."
  },
  {
    "ref": "P26",
    "name": "KPV",
    "presentation": "Injection",
    "category": "Inflammation Control",
    "variants": [
      {
        "name": "Variant 1 - low dose",
        "dose": "0.1 ml = 10 units",
        "delivered": "200 mcg per injection",
        "frequency": "Once daily",
        "course": "4 weeks (28 days)",
        "doses": "28 injections",
        "vials": "1 vial",
        "pens": "Not available",
        "note": ""
      },
      {
        "name": "Variant 1 - low dose",
        "dose": "0.1 ml = 10 units",
        "delivered": "200 mcg per injection",
        "frequency": "Once daily",
        "course": "6 weeks (42 days)",
        "doses": "42 injections",
        "vials": "2 vials",
        "pens": "Not available",
        "note": ""
      },
      {
        "name": "Variant 2 - high dose",
        "dose": "0.25 ml = 25 units",
        "delivered": "500 mcg per injection",
        "frequency": "Once daily",
        "course": "4 weeks (28 days)",
        "doses": "28 injections",
        "vials": "2 vials",
        "pens": "Not available",
        "note": ""
      },
      {
        "name": "Variant 2 - high dose",
        "dose": "0.25 ml = 25 units",
        "delivered": "500 mcg per injection",
        "frequency": "Once daily",
        "course": "6 weeks (42 days)",
        "doses": "42 injections",
        "vials": "3 vials",
        "pens": "Not available",
        "note": ""
      }
    ],
    "indication": "Stronger anti-inflammatory support (gut, skin, immune adjunct; experimental)",
    "bestUseFor": "Systemic anti-inflammatory support (experimental)",
    "howItWorks": "Anti-inflammatory signalling; may reduce inflammatory mediators.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "2 mg/ml",
    "containers": "Vial 4 ml (8 mg). Pen listed in PRICE LIST but with no volume.",
    "timing": "No specific time of day specified",
    "cycling": "Break of 4-6 weeks before repeating.",
    "combinesWith": "No specific combination documented for the injectable form",
    "supplements": "Bioavailable curcumin; Omega-3; Glutamine; Probiotics",
    "panels": "Panel 1. CBC and CRP optional if used for inflammatory complaints.",
    "monitoring": "Optional",
    "sideEffects": "Injection-site irritation; fatigue occasionally",
    "cautions": "None specified in source",
    "needsVerification": "1. The PRICE LIST has a KPV injection pen row but the size, dose and dose-count cells are all blank, so pen quantities cannot be calculated. Complete that row.",
    "panelRule": "Panel 1. CBC and CRP optional if used for inflammatory complaints."
  },
  {
    "ref": "P27",
    "name": "KPV + BPC-157",
    "presentation": "Capsules 500 / 250 mcg",
    "category": "Gut Health / Inflammation Control",
    "variants": [
      {
        "name": "Variant 1 - one capsule daily",
        "dose": "1 capsule",
        "delivered": "500 mcg KPV + 250 mcg BPC-157 per day",
        "frequency": "Once daily",
        "course": "8 weeks (56 days)",
        "doses": "56 capsules",
        "vials": "2 bottles",
        "pens": "n/a",
        "note": ""
      },
      {
        "name": "Variant 2 - two capsules daily",
        "dose": "2 capsules",
        "delivered": "1000 mcg KPV + 500 mcg BPC-157 per day",
        "frequency": "Twice daily",
        "course": "8 weeks (112 capsules)",
        "doses": "112 capsules",
        "vials": "4 bottles",
        "pens": "n/a",
        "note": ""
      }
    ],
    "indication": "Combined gut lining repair plus anti-inflammatory support",
    "bestUseFor": "Combined gut repair and anti-inflammatory support",
    "howItWorks": "KPV reduces inflammatory signalling; BPC-157 supports mucosal repair pathways.",
    "presentationNote": "Oral capsules, 30 per bottle",
    "route": "Oral",
    "strength": "500 mcg KPV + 250 mcg BPC-157 per capsule",
    "containers": "Bottle of 30 capsules",
    "timing": "No specific time of day specified",
    "cycling": "8 weeks per course.",
    "combinesWith": "Standalone combination product",
    "supplements": "L-Glutamine; Zinc carnosine; Omega-3",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "GI upset, bloating",
    "cautions": "None specified in source",
    "prescriberNote": "All strengths are mcg, not mg.",
    "needsVerification": "1. KPV content conflict: PROTOCOLS MASTER states 500 mcg KPV, the PRICE LIST states 250 mcg for the same SKU. Confirm which is correct and align both sheets.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P28",
    "name": "KPV + BPC-157",
    "presentation": "Capsules 500 / 500 mcg",
    "category": "Gut Health / Inflammation Control",
    "variants": [
      {
        "name": "Variant 1 - one capsule daily",
        "dose": "1 capsule",
        "delivered": "500 mcg KPV + 500 mcg BPC-157 per day",
        "frequency": "Once daily",
        "course": "8 weeks (56 days)",
        "doses": "56 capsules",
        "vials": "2 bottles",
        "pens": "n/a",
        "note": ""
      },
      {
        "name": "Variant 2 - two capsules daily",
        "dose": "2 capsules",
        "delivered": "1000 mcg KPV + 1000 mcg BPC-157 per day",
        "frequency": "Twice daily",
        "course": "8 weeks (112 capsules)",
        "doses": "112 capsules",
        "vials": "4 bottles",
        "pens": "n/a",
        "note": ""
      }
    ],
    "indication": "Combined gut lining repair plus anti-inflammatory support",
    "bestUseFor": "Higher-strength combined gut repair and anti-inflammatory support",
    "howItWorks": "KPV reduces inflammatory signalling; BPC-157 supports mucosal repair pathways.",
    "presentationNote": "Oral capsules, 30 per bottle",
    "route": "Oral",
    "strength": "500 mcg KPV + 500 mcg BPC-157 per capsule",
    "containers": "Bottle of 30 capsules",
    "timing": "No specific time of day specified",
    "cycling": "8 weeks per course.",
    "combinesWith": "Standalone combination product",
    "supplements": "L-Glutamine; Zinc carnosine; Omega-3",
    "panels": "Panel 1",
    "monitoring": "Optional",
    "sideEffects": "GI upset, bloating",
    "cautions": "None specified in source",
    "prescriberNote": "Strength is 500 mcg KPV, not 500 mg. The 'mg' in PROTOCOLS MASTER and the PRICE LIST is a typo and should be corrected in both.",
    "panelRule": "Panel 1"
  },
  {
    "ref": "P29",
    "name": "Tesamorelin",
    "presentation": "Injection",
    "category": "Metabolic Health / Hormonal Optimization",
    "variants": [
      {
        "name": "Variant 1 - full 8 week protocol with 2 week run-in",
        "dose": "0.05 ml = 5 units for 14 days, then 0.1 ml = 10 units",
        "delivered": "0.5 mg then 1 mg per injection",
        "frequency": "Once daily",
        "course": "8 weeks (56 days)",
        "doses": "56 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": "Start low for the first two weeks, then hold at 10 units."
      },
      {
        "name": "Variant 2 - full dose throughout",
        "dose": "0.1 ml = 10 units",
        "delivered": "1 mg per injection",
        "frequency": "Once daily",
        "course": "8 weeks (56 days)",
        "doses": "56 injections",
        "vials": "1 vial",
        "pens": "2 pens",
        "note": "For patients already established on Tesamorelin."
      }
    ],
    "indication": "Visceral (belly) fat reduction, improved body composition and lipid profile, lean-mass preservation, tissue repair, potential cognitive support",
    "bestUseFor": "Reducing visceral adipose tissue and abdominal or metabolic fat; body recomposition in adults with GH-axis decline",
    "howItWorks": "GHRH analogue that binds pituitary GHRH receptors to stimulate natural, pulsatile growth-hormone release, raising IGF-1 within the physiologic range while preserving somatostatin feedback.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "10 mg/ml",
    "containers": "Vial 6 ml (60 mg) or Pen 3 ml (30 mg)",
    "timing": "On an empty stomach, 3 hours with no carbohydrate. Preferably in the evening.",
    "cycling": "8 weeks per protocol, then reassess and cycle with breaks. Fat and IGF-1 effects reverse after discontinuation.",
    "combinesWith": "Ipamorelin or CJC-1295 - GH-secretagogue synergy, commonly paired in body-composition protocols",
    "supplements": "Controlled-carbohydrate diet; Vitamin D; Omega-3; adequate protein",
    "panels": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated.",
    "monitoring": "MANDATORY",
    "sideEffects": "Injection-site redness, arthralgia, mild fluid retention or oedema, transient rise in blood glucose",
    "cautions": "IGF-1 to confirm response and avoid supraphysiologic levels. Fasting glucose and HbA1c.",
    "prescriberNote": "The 1 mg daily dose is intentional and is a deliberate conservative protocol. Lab panel matches CJC-1295.",
    "panelRule": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated."
  },
  {
    "ref": "P30",
    "name": "LR3-IGF-1",
    "presentation": "Injection",
    "category": "Muscle Growth (performance context)",
    "variants": [
      {
        "name": "Variant 1 - 4 week cycle",
        "dose": "0.2 ml = 20 units for 7 days, then 0.4 ml = 40 units",
        "delivered": "20 mcg then 40 mcg per injection",
        "frequency": "Once daily",
        "course": "4 weeks (28 days)",
        "doses": "28 injections",
        "vials": "2 vials",
        "pens": "4 pens",
        "note": "Never administer fasted. Ideally post-workout."
      },
      {
        "name": "Variant 2 - 6 week cycle",
        "dose": "0.2 ml = 20 units for 7 days, then 0.4 ml = 40 units",
        "delivered": "20 mcg then 40 mcg per injection",
        "frequency": "Once daily",
        "course": "6 weeks (42 days)",
        "doses": "42 injections",
        "vials": "4 vials",
        "pens": "6 pens",
        "note": "Never administer fasted. Ideally post-workout."
      },
      {
        "name": "Variant 3 - 30 day cycle",
        "dose": "0.2 ml = 20 units for 7 days, then 0.4 ml = 40 units",
        "delivered": "20 mcg then 40 mcg per injection",
        "frequency": "Once daily",
        "course": "30 days",
        "doses": "30 injections",
        "vials": "3 vials",
        "pens": "4 pens",
        "note": "Never administer fasted. Ideally post-workout."
      }
    ],
    "indication": "Muscle hypertrophy and hyperplasia, accelerated recovery, nutrient partitioning, skin and connective-tissue regeneration",
    "bestUseFor": "Muscle growth and recovery / body recomposition. Experimental, performance context. BANNED IN SPORT.",
    "howItWorks": "Long-R3 analogue of IGF-1 (83 amino acids) with reduced IGFBP binding and a 20-30 hour half-life. Activates the IGF-1 receptor, driving PI3K/Akt and MAPK/ERK, and stimulates muscle satellite cells.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "100 mcg/ml",
    "containers": "Vial 5 ml (500 mcg) or Pen 3 ml (300 mcg)",
    "timing": "Ideally post-workout. NEVER fasted - hypoglycaemia risk.",
    "cycling": "Continuous use desensitises IGF-1 receptors. Off-cycle must equal the on-cycle.",
    "combinesWith": "GH secretagogues (CJC-1295 / Ipamorelin) are used in some protocols. CAUTION: this amplifies total IGF-1 exposure.",
    "supplements": "Post-injection carbohydrate and protein to prevent hypoglycaemia. Avoid fasted use.",
    "panels": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated.",
    "monitoring": "MANDATORY",
    "sideEffects": "Hypoglycaemia (most important), water retention or oedema, joint pain, injection-site reaction, fatigue; mitogenic and organ-growth risk with chronic high doses",
    "cautions": "CONTRAINDICATED with a history of cancer or diabetes. Never administer fasted. Banned in competitive sport.",
    "prescriberNote": "Multiple containers are required for every variant because the dose escalates after week one. Lab panel matches CJC-1295.",
    "needsVerification": "1. The PRICE LIST records the LR3-IGF-1 pen as 5 ml but also as 11 doses. 11 doses is only consistent with a 3 ml pen. A 3 ml pen is used here. Confirm the pen volume.",
    "panelRule": "Panel 1 + Panel 2. Add Panel 5 if over 40. Panel 8A if clinically indicated."
  },
  {
    "ref": "P31",
    "name": "SS-31 (Elamipretide)",
    "presentation": "Injection",
    "category": "Mitochondrial Health",
    "variants": [
      {
        "name": "Variant 1 - minimum dose",
        "dose": "0.05 ml = 5 units",
        "delivered": "4 mg per injection",
        "frequency": "Once daily in the evening",
        "course": "8 weeks (56 days)",
        "doses": "56 injections",
        "vials": "1 vial",
        "pens": "1 pen",
        "note": ""
      },
      {
        "name": "Variant 1 - minimum dose",
        "dose": "0.05 ml = 5 units",
        "delivered": "4 mg per injection",
        "frequency": "Once daily in the evening",
        "course": "12 weeks (84 days)",
        "doses": "84 injections",
        "vials": "2 vials",
        "pens": "2 pens",
        "note": ""
      },
      {
        "name": "Variant 2 - maximum dose",
        "dose": "0.1 ml = 10 units",
        "delivered": "8 mg per injection",
        "frequency": "Once daily in the evening",
        "course": "8 weeks (56 days)",
        "doses": "56 injections",
        "vials": "2 vials",
        "pens": "2 pens",
        "note": ""
      },
      {
        "name": "Variant 2 - maximum dose",
        "dose": "0.1 ml = 10 units",
        "delivered": "8 mg per injection",
        "frequency": "Once daily in the evening",
        "course": "12 weeks (84 days)",
        "doses": "84 injections",
        "vials": "3 vials",
        "pens": "3 pens",
        "note": ""
      }
    ],
    "indication": "Improved mitochondrial energy (ATP) output, reduced oxidative stress, better stamina and recovery, cellular and cardiovascular support",
    "bestUseFor": "Mitochondrial support and cellular energy: fatigue, recovery, longevity and age-related bioenergetic decline (investigational)",
    "howItWorks": "Mitochondria-targeted tetrapeptide (Szeto-Schiller) that selectively binds cardiolipin on the inner mitochondrial membrane, stabilising cristae, improving electron transport and ATP production while lowering reactive oxygen species.",
    "presentationNote": "Rx-grade injectable",
    "route": "Subcutaneous injection",
    "strength": "80 mg/ml",
    "containers": "Vial 3.5 ml (280 mg) or Pen 3 ml (240 mg)",
    "timing": "Preferably in the evening",
    "cycling": "Up to 12 weeks per protocol, then cycle with breaks.",
    "combinesWith": "NAD+ and CoQ10 support. DO NOT STACK WITH MOTS-C.",
    "supplements": "CoQ10 / ubiquinol; NAD+ precursors (NMN or NR); Magnesium; B-vitamins; Alpha-lipoic acid",
    "panels": "Panel 1 + Panel 3. Add Panel 5 if over 40.",
    "monitoring": "MANDATORY",
    "sideEffects": "Injection-site reactions (redness, irritation); generally well tolerated",
    "cautions": "Do not stack with MOTS-C. Barth-syndrome dosing of 40 mg does not apply to longevity protocols.",
    "prescriberNote": "Lab panel matches MOTS-C.",
    "panelRule": "Panel 1 + Panel 3. Add Panel 5 if over 40."
  }
];

// Cross-peptide rules: read before writing any protocol.
const PROTOCOL_SAFETY_RULES = [
  {
    "type": "Hard incompatibility",
    "appliesTo": "SS-31 and MOTS-C",
    "requirement": "Do not stack. Explicitly stated in the source protocol for SS-31."
  },
  {
    "type": "Contraindication",
    "appliesTo": "LR3-IGF-1",
    "requirement": "Contraindicated with a history of cancer or diabetes. Screen before prescribing."
  },
  {
    "type": "Hypoglycaemia risk",
    "appliesTo": "LR3-IGF-1",
    "requirement": "Never administer fasted. Post-injection carbohydrate and protein are required."
  },
  {
    "type": "Sport eligibility",
    "appliesTo": "LR3-IGF-1",
    "requirement": "Banned in competitive sport. Confirm the patient is not a tested athlete."
  },
  {
    "type": "Combined IGF-1 load",
    "appliesTo": "LR3-IGF-1 + any GH secretagogue",
    "requirement": "Stacking with CJC-1295 or Ipamorelin amplifies total IGF-1 exposure. Monitor IGF-1 closely."
  },
  {
    "type": "Glycaemic effect",
    "appliesTo": "All GH secretagogues (CJC-1295, Ipamorelin, Sermorelin, CJC/Ipamorelin blend, Tesamorelin, LR3-IGF-1)",
    "requirement": "May reduce insulin sensitivity. Fasting glucose and HbA1c are mandatory at baseline and on review."
  },
  {
    "type": "Mandatory break",
    "appliesTo": "Ipamorelin",
    "requirement": "At least a 3-month break is required between courses."
  },
  {
    "type": "Mandatory break",
    "appliesTo": "CJC-1295 and CJC/Ipamorelin blend",
    "requirement": "8-10 weeks maximum, then a 6-month interval before repeating."
  },
  {
    "type": "Annual cap",
    "appliesTo": "MOTS-C",
    "requirement": "No more than 1-2 cycles per year, with a minimum 3-6 month break between cycles."
  },
  {
    "type": "Maximum daily use",
    "appliesTo": "Kisspeptin-10",
    "requirement": "30-40 days of continuous daily use, then a 4-8 week break."
  },
  {
    "type": "Maximum daily use",
    "appliesTo": "DSIP",
    "requirement": "30 days of continuous daily use, then step down to intermittent maintenance."
  },
  {
    "type": "Maximum course",
    "appliesTo": "Dihexa (both strengths) and Selank",
    "requirement": "45 days maximum per course."
  },
  {
    "type": "Maximum course",
    "appliesTo": "Semax nasal",
    "requirement": "One month maximum per course."
  },
  {
    "type": "Copper load",
    "appliesTo": "GHK-Cu injection",
    "requirement": "Monitor serum copper and zinc (Panel 7) on extended or repeated courses."
  },
  {
    "type": "Cardiovascular",
    "appliesTo": "PT-141 (both routes)",
    "requirement": "Causes a transient rise in blood pressure. Check BP before use; avoid in uncontrolled hypertension."
  },
  {
    "type": "Weight-loss stacking",
    "appliesTo": "AOD-9604 + GLP-1",
    "requirement": "Avoid combining purely for fat loss unless clearly justified."
  },
  {
    "type": "Experimental status",
    "appliesTo": "Dihexa, DSIP, Semax, Selank, TB-4, MOTS-C, SS-31, LR3-IGF-1",
    "requirement": "All are investigational for the listed indications. Document informed consent."
  }
];

// Documented combinations only.
const PROTOCOL_STACKS = [
  {
    "goal": "Injury and tissue repair",
    "combination": "BPC-157 + TB-4",
    "achieves": "BPC supports local healing and angiogenesis; TB-4 supports cell migration and regeneration.",
    "scheduling": "Both are 4-12 week protocols. Align start dates and match the variant lengths."
  },
  {
    "goal": "Post-procedure skin",
    "combination": "BPC-157 + GHK-Cu injection",
    "achieves": "Repair signalling plus collagen and skin signalling.",
    "scheduling": "GHK-Cu runs 6 weeks on, 4-6 weeks off."
  },
  {
    "goal": "GH axis, standard",
    "combination": "CJC-1295 + Ipamorelin",
    "achieves": "GHRH plus ghrelin pathway synergy. Raises GH amplitude without raising cortisol or prolactin.",
    "scheduling": "Available as a pre-mixed blend vial or pen (P11). 8-10 weeks maximum."
  },
  {
    "goal": "GH axis, physiologic",
    "combination": "Sermorelin + Ipamorelin",
    "achieves": "More physiologic GH pulsatility than Sermorelin alone.",
    "scheduling": "Sermorelin is 1000 mcg/ml."
  },
  {
    "goal": "Body composition",
    "combination": "CJC/Ipamorelin + AOD-9604",
    "achieves": "GH-mediated recovery plus fat-loss signalling.",
    "scheduling": "Both require mandatory metabolic panels."
  },
  {
    "goal": "Metabolic",
    "combination": "MOTS-C + AOD-9604",
    "achieves": "Metabolic flexibility plus fat metabolism.",
    "scheduling": "Do not add SS-31 to any MOTS-C protocol."
  },
  {
    "goal": "Sleep and circadian",
    "combination": "Epitalon + DSIP",
    "achieves": "Circadian alignment plus sleep initiation.",
    "scheduling": "Epitalon Variant 1 is every 3 days; DSIP starts daily then steps down."
  },
  {
    "goal": "Gut",
    "combination": "BPC-157 capsules + KPV capsules",
    "achieves": "Mucosal repair plus anti-inflammatory action.",
    "scheduling": "Also available as a single combination capsule (P27, P28)."
  },
  {
    "goal": "Neurocognitive",
    "combination": "Semax + Selank",
    "achieves": "Focus and cognitive performance balanced against anxiety modulation.",
    "scheduling": "Both are night-time doses. Match routes: nasal with nasal, injection with injection."
  },
  {
    "goal": "Body recomposition, advanced",
    "combination": "Tesamorelin + Ipamorelin or CJC-1295",
    "achieves": "GH-secretagogue synergy for visceral fat reduction.",
    "scheduling": "Mandatory IGF-1 and glycaemic monitoring."
  },
  {
    "goal": "Glow Stack (pens)",
    "combination": "BPC-157 + TB-4 + GHK-Cu",
    "achieves": "Combined tissue repair, regeneration and skin collagen support.",
    "scheduling": "Supplied as 3 pens of 3 ml. Listed on the PRICE LIST."
  },
  {
    "goal": "Wolverine Stack (pens)",
    "combination": "BPC-157 + TB-4",
    "achieves": "Core injury-recovery pairing.",
    "scheduling": "Supplied as 2 pens of 3 ml. Listed on the PRICE LIST."
  }
];

// Combinations that must never be written.
const PROTOCOL_PROHIBITED = [
  "SS-31 + MOTS-C. Explicitly prohibited in the source protocol for SS-31."
];

// Primary/secondary peptide per patient goal.
const PROTOCOL_BENEFITS = [
  {
    "peptide": "BPC-157 (Injection)",
    "primary": [
      "Heal Injuries & Reduce Pain"
    ],
    "secondary": [
      "Healthy Aging & Longevity",
      "Build Muscle & Recover Better",
      "Immune Function & Inflammation",
      "Gut Health",
      "Skin & Hair"
    ]
  },
  {
    "peptide": "TB-4",
    "primary": [
      "Heal Injuries & Reduce Pain",
      "Gut Health"
    ],
    "secondary": [
      "Healthy Aging & Longevity",
      "Build Muscle & Recover Better",
      "Immune Function & Inflammation"
    ]
  },
  {
    "peptide": "Epitalon",
    "primary": [
      "Healthy Aging & Longevity",
      "Sleep Circadian"
    ],
    "secondary": []
  },
  {
    "peptide": "CJC-1295",
    "primary": [
      "Build Muscle & Recover Better"
    ],
    "secondary": [
      "Healthy Aging & Longevity",
      "Heal Injuries & Reduce Pain",
      "Improve Metabolism & Reduce Belly Fat",
      "Sleep Circadian"
    ]
  },
  {
    "peptide": "Ipamorelin",
    "primary": [
      "Build Muscle & Recover Better"
    ],
    "secondary": [
      "Healthy Aging & Longevity",
      "Heal Injuries & Reduce Pain",
      "Improve Metabolism & Reduce Belly Fat",
      "Sleep Circadian"
    ]
  },
  {
    "peptide": "Sermorelin",
    "primary": [
      "Build Muscle & Recover Better"
    ],
    "secondary": [
      "Healthy Aging & Longevity",
      "Heal Injuries & Reduce Pain",
      "Sleep Circadian"
    ]
  },
  {
    "peptide": "CJC + Ipamorelin",
    "primary": [
      "Build Muscle & Recover Better"
    ],
    "secondary": [
      "Healthy Aging & Longevity",
      "Heal Injuries & Reduce Pain",
      "Improve Metabolism & Reduce Belly Fat",
      "Sleep Circadian"
    ]
  },
  {
    "peptide": "MOTS-C",
    "primary": [
      "Improve Metabolism & Reduce Belly Fat"
    ],
    "secondary": [
      "Healthy Aging & Longevity",
      "Build Muscle & Recover Better"
    ]
  },
  {
    "peptide": "Tesamorelin",
    "primary": [
      "Build Muscle & Recover Better"
    ],
    "secondary": []
  },
  {
    "peptide": "LR3-IGF1",
    "primary": [
      "Build Muscle & Recover Better"
    ],
    "secondary": []
  },
  {
    "peptide": "SS-31",
    "primary": [
      "Improve Metabolism & Reduce Belly Fat"
    ],
    "secondary": []
  },
  {
    "peptide": "AOD-9604",
    "primary": [
      "Improve Metabolism & Reduce Belly Fat"
    ],
    "secondary": []
  },
  {
    "peptide": "PT-141",
    "primary": [
      "Sexual Health"
    ],
    "secondary": [
      "Cognitive Function Mood Enhancement"
    ]
  },
  {
    "peptide": "Kisspeptin-10",
    "primary": [],
    "secondary": [
      "Sexual Health"
    ]
  },
  {
    "peptide": "Thymosin Alpha-1",
    "primary": [
      "Immune Function & Inflammation"
    ],
    "secondary": [
      "Healthy Aging & Longevity"
    ]
  },
  {
    "peptide": "KPV",
    "primary": [
      "Gut Health"
    ],
    "secondary": [
      "Immune Function & Inflammation"
    ]
  },
  {
    "peptide": "KPV + BPC-157",
    "primary": [
      "Gut Health"
    ],
    "secondary": [
      "Immune Function & Inflammation"
    ]
  },
  {
    "peptide": "GHK-Cu (Injection)",
    "primary": [
      "Skin & Hair"
    ],
    "secondary": [
      "Healthy Aging & Longevity",
      "Build Muscle & Recover Better",
      "Heal Injuries & Reduce Pain"
    ]
  },
  {
    "peptide": "GHK-Cu (Topical / Scalp)",
    "primary": [
      "Skin & Hair"
    ],
    "secondary": []
  },
  {
    "peptide": "DSIP",
    "primary": [
      "Sleep Circadian"
    ],
    "secondary": []
  },
  {
    "peptide": "Semax",
    "primary": [
      "Cognitive Function Mood Enhancement"
    ],
    "secondary": [
      "Sleep Circadian"
    ]
  },
  {
    "peptide": "Selank",
    "primary": [],
    "secondary": [
      "Sleep Circadian",
      "Cognitive Function Mood Enhancement"
    ]
  },
  {
    "peptide": "Dihexa",
    "primary": [
      "Cognitive Function Mood Enhancement"
    ],
    "secondary": []
  }
];

module.exports = {
  LAB_PANELS,
  PEPTIDE_PRODUCTS,
  PROTOCOL_SAFETY_RULES,
  PROTOCOL_STACKS,
  PROTOCOL_PROHIBITED,
  PROTOCOL_BENEFITS,
};
