// Clinical preset data ported from Consult-Buddy, glp1-doctor and glp1-patient.
// These seed the `templates` table and power the program builder.

const GLP1_MEDICATIONS = {
  "Mounjaro":    { generic: "tirzepatide",       route: "injection", frequency: "weekly", halfLifeHours: 120, doses: ["2.5mg", "5mg", "7.5mg", "10mg", "12.5mg", "15mg"] },
  "Wegovy":      { generic: "semaglutide",       route: "injection", frequency: "weekly", halfLifeHours: 168, doses: ["0.25mg", "0.5mg", "1mg", "1.7mg", "2.4mg"] },
  "Ozempic":     { generic: "semaglutide",       route: "injection", frequency: "weekly", halfLifeHours: 168, doses: ["0.25mg", "0.5mg", "1mg", "2mg"] },
  "Wegovy Pill": { generic: "oral semaglutide",  route: "oral",      frequency: "daily",  halfLifeHours: 168, doses: ["1.5mg", "4mg", "9mg", "25mg"] },
  "Rybelsus":    { generic: "oral semaglutide",  route: "oral",      frequency: "daily",  halfLifeHours: 168, doses: ["3mg", "7mg", "14mg"] },
  "Foundayo":    { generic: "semaglutide",       route: "injection", frequency: "weekly", halfLifeHours: 168, doses: ["0.8mg", "2.5mg", "5.5mg", "9mg", "14.5mg", "17.2mg"] },
};

// Weekly pharmacokinetic phases shown on the patient dashboard (injectables)
const PK_PHASES_WEEKLY = [
  { name: "Dose Taken",    color: "#1E4C4E", range: [0, 6],     desc: "Medication administered. Absorption is beginning under the skin." },
  { name: "Taking Effect", color: "#B98A1F", range: [6, 24],    desc: "Active absorption phase. You may begin to notice reduced hunger and appetite." },
  { name: "Peak Action",   color: "#C96A2B", range: [24, 48],   desc: "Peak blood concentration. Maximum appetite suppression and best results window." },
  { name: "Cruise",        color: "#2F6FAE", range: [48, 96],   desc: "Steady therapeutic level. Sustained effect — this is your sweet spot." },
  { name: "Winding Down",  color: "#6C4FB0", range: [96, 144],  desc: "Levels gradually declining. Appetite may begin to return slightly." },
  { name: "Pre-Dose",      color: "#54706F", range: [144, 168], desc: "Lowest level of the cycle. Prepare your next dose." },
];

// Daily phases (oral / daily-dosed programs)
const PK_PHASES_DAILY = [
  { name: "Dose Taken",  color: "#1E4C4E", range: [0, 1],   desc: "Dose taken. Absorption begins." },
  { name: "Absorbing",   color: "#B98A1F", range: [1, 4],   desc: "Medication absorbing. Follow your intake instructions." },
  { name: "Active",      color: "#C96A2B", range: [4, 12],  desc: "Active level building through the day." },
  { name: "Maintaining", color: "#2F6FAE", range: [12, 24], desc: "Sustained daily level until your next dose." },
];

// Check-in symptom dimensions (ported from glp1-patient check-in, generalised)
const SYMPTOMS = [
  { key: "hunger",       label: "Hunger / Appetite", options: ["Absent", "Low", "Moderate", "High"], alertOn: [] },
  { key: "nausea",       label: "Nausea",            options: ["None", "Mild", "Moderate", "Severe"], alertOn: ["Severe"] },
  { key: "vomiting",     label: "Vomiting",          options: ["None", "Once", "Few times", "Frequent"], alertOn: ["Few times", "Frequent"] },
  { key: "constipation", label: "Constipation",      options: ["None", "Mild", "Moderate", "Severe"], alertOn: ["Severe"] },
  { key: "diarrhea",     label: "Diarrhea",          options: ["None", "Mild", "Moderate", "Severe"], alertOn: ["Severe"] },
  { key: "fatigue",      label: "Fatigue / Energy",  options: ["Energetic", "Normal", "Tired", "Exhausted"], alertOn: ["Exhausted"] },
  { key: "dizziness",    label: "Dizziness",         options: ["None", "Mild", "Moderate", "Severe"], alertOn: ["Severe"] },
  { key: "injectionSite",label: "Dose-site / Local reaction", options: ["None", "Redness", "Swelling", "Painful"], alertOn: ["Painful"] },
  { key: "mood",         label: "Mood",              options: ["Great", "Good", "Low", "Very low"], alertOn: ["Very low"] },
  { key: "abdominalPain",label: "Abdominal pain",    options: ["None", "Mild", "Moderate", "Severe"], alertOn: ["Severe"] },
];

// Peptide protocol library (source of truth: Consult-Buddy NEW_PEPTIDE_PROTOCOL.xlsx export)
const PEPTIDE_PROTOCOLS = {
  "AOD-9604": [
    { strength: "1200mcg/ml - 5ml vial", doseAmount: "300 mcg", doseVolume: "0.25 ml (25 units)", time: "Once daily (Morning - empty stomach)", protocolType: "Preferred Protocol", route: "Subcutaneous injection", duration: "20 Days", cycle: "8-12 weeks cycle", summary: "AOD-9604 1200mcg/ml taken 25 units in the morning (Vial lasts 20 days)" },
    { strength: "1200mcg/ml - 5ml vial", doseAmount: "250 mcg", doseVolume: "0.20 ml (20 units) x 2", time: "Twice daily (Morning/Bedtime)", protocolType: "Alternative Protocol", route: "Subcutaneous injection", duration: "12.5 Days", cycle: "8-12 weeks cycle", summary: "AOD-9604 1200mcg/ml taken 20 units twice daily (Vial lasts 12.5 days)" },
  ],
  "Epitalon": [
    { strength: "10mg/vial - 5ml vial", doseAmount: "2000 mcg (2mg)", doseVolume: "1 ml (100 units)", time: "Every 3 days (Morning)", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "15 Days (5 doses)", cycle: "15 days total cycle", summary: "Epitalon 10mg/vial taken 100 units every 3 days (Vial lasts 15 days)" },
    { strength: "10mg/vial - 5ml vial", doseAmount: "1000 mcg (1mg) x 2", doseVolume: "0.5 ml (50 units) x 2", time: "Twice daily (AM/PM) every 3 days", protocolType: "Split-Dose Protocol", route: "Subcutaneous injection", duration: "15 Days (10 doses)", cycle: "15 days total cycle", summary: "Epitalon 10mg/vial taken 50 units twice daily every 3 days (Vial lasts 15 days)" },
    { strength: "10mg/vial - 5ml vial", doseAmount: "2000 mcg (2mg)", doseVolume: "1 ml (100 units)", time: "Once daily (Morning)", protocolType: "Intensive Protocol", route: "Subcutaneous injection", duration: "5 Days (5 doses)", cycle: "10 days total cycle", summary: "Epitalon 10mg/vial taken 100 units daily (Vial lasts 5 days)" },
  ],
  "BPC-157": [
    { strength: "2000mcg/ml - 5ml Vial", doseAmount: "300 mcg", doseVolume: "0.15 ml (15 units)", time: "Daily morning (empty stomach)", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "33 Days", cycle: "4-12 weeks", summary: "BPC-157 2000mcg/ml taken 15 units daily morning (Vial lasts 33 days)" },
  ],
  "CJC-1295": [
    { strength: "1000 mcg/ml - 5ml vial", doseAmount: "100 mcg", doseVolume: "0.1 ml (10 units)", time: "5 days ON / 2 days OFF (Bedtime)", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "10 Weeks", cycle: "8-10 weeks cycle", summary: "CJC-1295 taken 10 units bedtime (Vial lasts 10 weeks)" },
  ],
  "Ipamorelin": [
    { strength: "2000mcg/ml - 5ml Vial", doseAmount: "200 mcg", doseVolume: "0.1 ml (10 units)", time: "5 days ON / 2 days OFF (Evening)", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "10 Weeks", cycle: "3 months cycle", summary: "Ipamorelin taken 10 units evening (Vial lasts 10 weeks)" },
  ],
  "CJC/Ipamorelin Blend": [
    { strength: "1mg/2mg per ml - 5ml", doseAmount: "100mcg / 200mcg", doseVolume: "0.1 ml (10 units)", time: "5 days ON / 2 days OFF (Bedtime)", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "10 Weeks", cycle: "10 weeks cycle", summary: "CJC/Ipamorelin Blend taken 10 units bedtime (Vial lasts 10 weeks)" },
  ],
  "Sermorelin": [
    { strength: "2mg/vial (reconstituted)", doseAmount: "200-300 mcg", doseVolume: "0.2-0.3 ml (20-30 units)", time: "Nightly (Bedtime, empty stomach)", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "~7 Days", cycle: "3-6 months cycle", summary: "Sermorelin taken 20-30 units nightly (Vial lasts ~7 days)" },
  ],
  "Thymosin Alpha-1": [
    { strength: "3000mcg/ml - 5ml vial", doseAmount: "450 mcg", doseVolume: "0.15 ml (15 units)", time: "Once daily (Morning)", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "33 Days", cycle: "1 month cycle", summary: "Thymosin Alpha-1 taken 15 units daily (Vial lasts 33 days)" },
    { strength: "3000mcg/ml - 5ml vial", doseAmount: "1500 mcg (1.5mg)", doseVolume: "0.5 ml (50 units)", time: "Twice a week (Mon/Thu)", protocolType: "Preferred Protocol", route: "Subcutaneous injection", duration: "5 Weeks", cycle: "4-6 weeks cycle", summary: "Thymosin Alpha-1 taken 50 units twice a week (Vial lasts 5 weeks)" },
  ],
  "MOTS-C": [
    { strength: "10mg/ml - 5ml vial", doseAmount: "10 mg", doseVolume: "1 ml (100 units)", time: "Once weekly before exercise", protocolType: "Preferred (Greenfield)", route: "Subcutaneous injection", duration: "5 Weeks", cycle: "10 weeks per year", summary: "MOTS-C taken 100 units once weekly (Vial lasts 5 weeks)" },
    { strength: "10mg/ml - 5ml vial", doseAmount: "5 mg", doseVolume: "0.5 ml (50 units)", time: "3 times weekly before exercise", protocolType: "Alternative (Seed)", route: "Subcutaneous injection", duration: "3.3 Weeks", cycle: "4-6 weeks cycle", summary: "MOTS-C taken 50 units 3x weekly (Vial lasts 3.3 weeks)" },
  ],
  "DSIP": [
    { strength: "1000mcg/ml - 2ml vial", doseAmount: "100 mcg", doseVolume: "0.1 ml (10 units)", time: "Daily 3 hours before bed", protocolType: "Initial Protocol", route: "Subcutaneous injection", duration: "20 Days", cycle: "2-4 weeks", summary: "DSIP taken 10 units daily bedtime (Vial lasts 20 days)" },
    { strength: "1000mcg/ml - 2ml vial", doseAmount: "100 mcg", doseVolume: "0.1 ml (10 units)", time: "Every 3 days 3 hours before bed", protocolType: "Maintenance Protocol", route: "Subcutaneous injection", duration: "60 Days", cycle: "4-8 weeks maintenance", summary: "DSIP taken 10 units every 3 days (Vial lasts 60 days)" },
  ],
  "Thymosin Beta (TB-500)": [
    { strength: "3000mcg/ml - 5ml Vial", doseAmount: "750 mcg", doseVolume: "0.25 ml (25 units)", time: "Once daily", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "20 Days", cycle: "4-12 weeks", summary: "TB-500 taken 25 units daily (Vial lasts 20 days)" },
  ],
  "GHK-Cu": [
    { strength: "10mg/ml - 5ml vial", doseAmount: "2 mg", doseVolume: "0.2 ml (20 units)", time: "Once daily", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "25 Days", cycle: "6 weeks on/off", summary: "GHK-Cu taken 20 units daily (Vial lasts 25 days)" },
  ],
  "PT-141": [
    { strength: "10mg/ml - 2ml vial", doseAmount: "1-2 mg", doseVolume: "0.1-0.2 ml (10-20 units)", time: "On demand before activity", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "10-20 Doses", cycle: "Max twice a week", summary: "PT-141 taken 10-20 units as needed" },
  ],
  "Semax": [
    { strength: "1mg/ml - 5ml vial", doseAmount: "300 mcg", doseVolume: "0.3 ml (30 units)", time: "Twice weekly", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "8 Weeks", cycle: "4-6 weeks cycle", summary: "Semax taken 30 units twice weekly (Vial lasts 8 weeks)" },
  ],
  "Selank": [
    { strength: "1mg/ml - 5ml vial", doseAmount: "300 mcg", doseVolume: "0.3 ml (30 units)", time: "Twice weekly", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "8 Weeks", cycle: "4-6 weeks cycle", summary: "Selank taken 30 units twice weekly (Vial lasts 8 weeks)" },
  ],
  "Kisspeptin-10": [
    { strength: "100mcg/ml - 4ml vial", doseAmount: "10 mcg", doseVolume: "0.1 ml (10 units)", time: "Daily before bed", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "40 Days", cycle: "Max 40 days", summary: "Kisspeptin-10 taken 10 units daily before bed" },
  ],
  "KPV": [
    { strength: "2mg/ml - 4ml vial", doseAmount: "500 mcg", doseVolume: "0.25 ml (25 units)", time: "Once daily", protocolType: "Standard Protocol", route: "Subcutaneous injection", duration: "16 Days", cycle: "4-6 weeks cycle", summary: "KPV taken 25 units daily (Vial lasts 16 days)" },
  ],
  "BPC-157 Capsules": [
    { strength: "500 mcg Capsules", doseAmount: "500 mcg", doseVolume: "1 Capsule", time: "Daily morning (empty stomach)", protocolType: "Preferred Protocol", route: "Oral capsules", duration: "30 Days", cycle: "3 months+", summary: "BPC-157 Capsules 1 capsule daily" },
    { strength: "500 mcg Capsules", doseAmount: "1000 mcg", doseVolume: "2 Capsules", time: "Twice daily (or 2 once daily)", protocolType: "Alternative Protocol", route: "Oral capsules", duration: "15 Days", cycle: "4-8 weeks", summary: "BPC-157 Capsules 2 capsules daily" },
  ],
  "PT-141 Nasal": [
    { strength: "10mg in 15ml bottle", doseAmount: "", doseVolume: "1-2 pumps", time: "On demand before activity", protocolType: "Preferred Protocol", route: "Intranasal spray", duration: "~30-50 uses", cycle: "Max 3x weekly", summary: "PT-141 Nasal 1-2 pumps as needed" },
  ],
  "Semax Nasal": [
    { strength: "3mg/ml (10ml)", doseAmount: "", doseVolume: "2-3 sprays daily", time: "Once or twice daily", protocolType: "Cognitive Protocol", route: "Intranasal spray", duration: "~25-30 Days", cycle: "2-4 weeks cycle", summary: "Semax Nasal 2-3 sprays daily" },
  ],
  "Selank Nasal": [
    { strength: "3mg/ml (10ml)", doseAmount: "", doseVolume: "2-3 sprays daily", time: "Once or twice daily", protocolType: "Anxiolytic Protocol", route: "Intranasal spray", duration: "~25-30 Days", cycle: "2-4 weeks cycle", summary: "Selank Nasal 2-3 sprays daily" },
  ],
  "KPV + BPC-157": [
    { strength: "500mcg / 250mcg", doseAmount: "750 mcg Total", doseVolume: "1 Capsule", time: "Once daily (morning)", protocolType: "Preferred Protocol", route: "Oral capsules", duration: "30 Days", cycle: "6-8 weeks", summary: "KPV+BPC 1 capsule daily" },
  ],
  "Dihexa Capsules": [
    { strength: "10-20 mg", doseAmount: "10-20 mg", doseVolume: "1 Capsule", time: "Once daily", protocolType: "Cognitive Protocol", route: "Oral capsules", duration: "30 Days", cycle: "4-8 weeks", summary: "Dihexa 1 capsule daily" },
  ],
  "GHK-Cu Facial Serum": [
    { strength: "0.3% - 0.5% Serum", doseAmount: "", doseVolume: "Apply thin layer", time: "Daily at night", protocolType: "Skincare Protocol", route: "Topical serum", duration: "30-60 Days", cycle: "Continuous", summary: "GHK-Cu Serum applied nightly" },
  ],
  "GHK-Cu Scalp Foam": [
    { strength: "0.1% - 0.19% Foam", doseAmount: "", doseVolume: "Massage into scalp", time: "Daily at night", protocolType: "Hair Protocol", route: "Topical foam", duration: "30 Days", cycle: "Continuous", summary: "GHK-Cu Foam applied nightly" },
  ],
};

// ── Suggested peptides by primary health goal (ported concept from
// Consult-Buddy's peptide_program_matrix / LivePeptideSuggestions —
// its Supabase data sits behind authenticated RLS we don't have login
// for, so this mapping and the PEPTIDE_INFO reference below were
// authored from established peptide-therapy practice patterns).
const HEALTH_GOAL_PEPTIDES = {
  "Weight loss": [
    { name: "AOD-9604", priority: "Primary" },
    { name: "MOTS-C", priority: "Secondary" },
  ],
  "Healthy aging & longevity": [
    { name: "Epitalon", priority: "Primary" },
    { name: "BPC-157", priority: "Secondary" },
    { name: "Thymosin Beta (TB-500)", priority: "Secondary" },
    { name: "CJC-1295", priority: "Secondary" },
    { name: "Ipamorelin", priority: "Secondary" },
    { name: "Sermorelin", priority: "Secondary" },
    { name: "CJC/Ipamorelin Blend", priority: "Secondary" },
    { name: "MOTS-C", priority: "Secondary" },
    { name: "Thymosin Alpha-1", priority: "Secondary" },
    { name: "GHK-Cu", priority: "Secondary" },
  ],
  "Build muscle & recover better": [
    { name: "CJC-1295", priority: "Primary" },
    { name: "Ipamorelin", priority: "Primary" },
    { name: "CJC/Ipamorelin Blend", priority: "Secondary" },
    { name: "Sermorelin", priority: "Secondary" },
    { name: "BPC-157", priority: "Secondary" },
    { name: "Thymosin Beta (TB-500)", priority: "Secondary" },
    { name: "MOTS-C", priority: "Secondary" },
  ],
  "Heal injuries & reduce pain": [
    { name: "BPC-157", priority: "Primary" },
    { name: "Thymosin Beta (TB-500)", priority: "Primary" },
    { name: "KPV", priority: "Secondary" },
    { name: "GHK-Cu", priority: "Secondary" },
  ],
  "Improve metabolism & reduce belly fat": [
    { name: "AOD-9604", priority: "Primary" },
    { name: "MOTS-C", priority: "Primary" },
    { name: "CJC-1295", priority: "Secondary" },
    { name: "Ipamorelin", priority: "Secondary" },
  ],
  "Improve sleep & reset body clock": [
    { name: "DSIP", priority: "Primary" },
    { name: "Epitalon", priority: "Secondary" },
    { name: "Selank", priority: "Secondary" },
  ],
  "Cognitive function & mood enhancement": [
    { name: "Semax", priority: "Primary" },
    { name: "Selank", priority: "Primary" },
    { name: "Dihexa Capsules", priority: "Secondary" },
    { name: "Epitalon", priority: "Secondary" },
  ],
  "Sexual health": [
    { name: "PT-141", priority: "Primary" },
    { name: "PT-141 Nasal", priority: "Secondary" },
    { name: "Kisspeptin-10", priority: "Secondary" },
  ],
  "Immune function & inflammation": [
    { name: "Thymosin Alpha-1", priority: "Primary" },
    { name: "BPC-157", priority: "Secondary" },
    { name: "KPV", priority: "Secondary" },
    { name: "Thymosin Beta (TB-500)", priority: "Secondary" },
  ],
  "Gut health": [
    { name: "BPC-157", priority: "Primary" },
    { name: "KPV", priority: "Primary" },
    { name: "KPV + BPC-157", priority: "Secondary" },
    { name: "BPC-157 Capsules", priority: "Secondary" },
  ],
  "Skin & hair": [
    { name: "GHK-Cu", priority: "Primary" },
    { name: "GHK-Cu Facial Serum", priority: "Secondary" },
    { name: "GHK-Cu Scalp Foam", priority: "Secondary" },
  ],
};

// Clinical reference shown in the peptide detail panel — mirrors
// Consult-Buddy's peptide_protocols columns (howItWorks/targetBenefits/
// bestUseFor/dosageInstructions/administrationRoute/strengthVolume/
// treatmentDuration/contraindications/commonSideEffects/keyBloodTests/
// recommendedSupplements/possibleCombinations).
const PEPTIDE_INFO = {
  "AOD-9604": {
    categories: ["Weight Loss", "Metabolism"],
    howItWorks: "A modified fragment of human growth hormone (HGH 176-191) that stimulates lipolysis (fat breakdown) and inhibits lipogenesis (fat storage) without affecting blood sugar or growth-hormone-driven tissue growth.",
    targetBenefits: "Fat loss (especially visceral/abdominal), no impact on blood glucose or IGF-1",
    bestUseFor: "Patients wanting targeted fat loss support alongside diet/exercise, including as an adjunct to GLP-1 therapy",
    dosageInstructions: "300 mcg once daily on an empty stomach, or split 250 mcg twice daily",
    administrationRoute: "Subcutaneous injection",
    strengthVolume: "1200 mcg/ml, 5 ml vial",
    treatmentDuration: "8-12 week cycles",
    contraindications: "Pregnancy, breastfeeding, active malignancy",
    commonSideEffects: "Mild injection-site redness; rarely nausea",
    keyBloodTests: "Baseline lipid panel, fasting glucose",
    recommendedSupplements: "Omega-3, vitamin D3",
    possibleCombinations: "MOTS-C, CJC-1295/Ipamorelin",
  },
  "Epitalon": {
    categories: ["Longevity", "Sleep"],
    howItWorks: "Acts as a systemic \"resynchronizer\" by modulating the pineal-hypothalamic-pituitary axis: stimulates the pineal gland to normalize melatonin secretion, activates telomerase, and supports epigenetic DNA-methylation patterns associated with cellular youth.",
    targetBenefits: "Sleep regulation, circadian rhythm, experimental longevity/telomere support",
    bestUseFor: "Longevity-focused patients, disrupted circadian rhythm, general anti-aging protocols",
    dosageInstructions: "2000 mcg (2 mg) every 3 days in the morning",
    administrationRoute: "Subcutaneous injection",
    strengthVolume: "10 mg/vial, 5 ml vial",
    treatmentDuration: "Once every 6 months (15-day course)",
    contraindications: "Pregnancy, breastfeeding, active malignancy",
    commonSideEffects: "Headache, flushing",
    keyBloodTests: "None routinely required",
    recommendedSupplements: "Magnesium glycinate",
    possibleCombinations: "DSIP, Selank",
  },
  "BPC-157": {
    categories: ["Healing", "Gut Health", "Injury Recovery"],
    howItWorks: "A stable pentadecapeptide derived from a gastric protective protein; promotes angiogenesis and fibroblast migration, accelerating healing of muscle, tendon, ligament and gut-lining tissue.",
    targetBenefits: "Faster soft-tissue and gut-lining healing, reduced inflammation",
    bestUseFor: "Tendon/ligament injuries, post-surgical recovery, GI conditions (leaky gut, IBS-like symptoms)",
    dosageInstructions: "300 mcg once daily, empty stomach, ideally near the injury site",
    administrationRoute: "Subcutaneous injection (oral capsule form available for gut-focused use)",
    strengthVolume: "2000 mcg/ml, 5 ml vial",
    treatmentDuration: "4-12 week cycles",
    contraindications: "Active malignancy, pregnancy",
    commonSideEffects: "Mild injection-site irritation",
    keyBloodTests: "None routinely required",
    recommendedSupplements: "Collagen, vitamin C",
    possibleCombinations: "TB-500, KPV",
  },
  "Thymosin Beta (TB-500)": {
    categories: ["Healing", "Injury Recovery"],
    howItWorks: "A synthetic fragment of Thymosin Beta-4 that upregulates actin, promoting cell migration, new blood-vessel formation and reduced inflammation in injured tissue — complements BPC-157's localized action with systemic reach.",
    targetBenefits: "Systemic tissue repair, reduced inflammation, improved flexibility",
    bestUseFor: "Multi-site injuries, chronic tendinopathy, athletes in recovery",
    dosageInstructions: "750 mcg once daily",
    administrationRoute: "Subcutaneous injection",
    strengthVolume: "3000 mcg/ml, 5 ml vial",
    treatmentDuration: "4-12 week cycles",
    contraindications: "Active malignancy, pregnancy",
    commonSideEffects: "Mild fatigue, injection-site redness",
    keyBloodTests: "None routinely required",
    recommendedSupplements: "Omega-3",
    possibleCombinations: "BPC-157",
  },
  "CJC-1295": {
    categories: ["Growth Hormone", "Muscle & Recovery", "Longevity"],
    howItWorks: "A GHRH analog with a stabilized structure that extends its half-life, causing a steady, sustained rise in the body's own growth-hormone and IGF-1 pulses rather than an acute spike.",
    targetBenefits: "Improved recovery, lean muscle support, better sleep quality",
    bestUseFor: "Athletes and longevity patients seeking sustained GH elevation with fewer injections",
    dosageInstructions: "100 mcg at bedtime, 5 days on / 2 days off",
    administrationRoute: "Subcutaneous injection",
    strengthVolume: "1000 mcg/ml, 5 ml vial",
    treatmentDuration: "8-10 week cycles",
    contraindications: "Active malignancy, pregnancy, uncontrolled diabetes",
    commonSideEffects: "Water retention, mild flushing, injection-site redness",
    keyBloodTests: "IGF-1, fasting glucose",
    recommendedSupplements: "Magnesium/zinc (ZMA) at bedtime",
    possibleCombinations: "Ipamorelin (CJC/Ipamorelin Blend)",
  },
  "Ipamorelin": {
    categories: ["Growth Hormone", "Muscle & Recovery"],
    howItWorks: "A selective growth-hormone secretagogue (ghrelin-receptor agonist) that triggers a clean GH pulse from the pituitary without significantly raising cortisol or prolactin.",
    targetBenefits: "Muscle recovery, fat metabolism, sleep quality — minimal side-effect profile",
    bestUseFor: "Patients wanting GH support with the cleanest side-effect profile, often paired with CJC-1295",
    dosageInstructions: "200 mcg at bedtime, 5 days on / 2 days off",
    administrationRoute: "Subcutaneous injection",
    strengthVolume: "2000 mcg/ml, 5 ml vial",
    treatmentDuration: "8-10 week cycles",
    contraindications: "Active malignancy, pregnancy",
    commonSideEffects: "Mild flushing, headache",
    keyBloodTests: "IGF-1",
    recommendedSupplements: "Magnesium glycinate at bedtime",
    possibleCombinations: "CJC-1295",
  },
  "Sermorelin": {
    categories: ["Growth Hormone", "Longevity"],
    howItWorks: "A GHRH(1-29) analog — the shortest-acting GH secretagogue — that stimulates the pituitary's own natural GH pulse, mimicking the body's physiological release pattern most closely of the GH-axis peptides.",
    targetBenefits: "Gentle, physiologic GH support; improved sleep and recovery",
    bestUseFor: "Patients new to GH-axis peptides, or those preferring the mildest, most \"natural\" pulse profile",
    dosageInstructions: "200-300 mcg nightly at bedtime, empty stomach",
    administrationRoute: "Subcutaneous injection",
    strengthVolume: "2 mg/vial, reconstituted",
    treatmentDuration: "3-6 month cycles",
    contraindications: "Active malignancy, pregnancy",
    commonSideEffects: "Mild flushing, injection-site irritation",
    keyBloodTests: "IGF-1",
    recommendedSupplements: "Magnesium glycinate",
    possibleCombinations: "Ipamorelin",
  },
  "CJC/Ipamorelin Blend": {
    categories: ["Growth Hormone", "Muscle & Recovery", "Longevity"],
    howItWorks: "Combines CJC-1295's sustained GHRH stimulation with Ipamorelin's clean ghrelin-receptor pulse for a synergistic, higher-amplitude natural GH release than either peptide alone.",
    targetBenefits: "Enhanced recovery, sleep quality, body composition",
    bestUseFor: "Patients ready to combine both GH-axis mechanisms for a stronger effect",
    dosageInstructions: "100 mcg / 200 mcg combined dose at bedtime, 5 days on / 2 days off",
    administrationRoute: "Subcutaneous injection",
    strengthVolume: "1 mg/2 mg per ml, 5 ml vial",
    treatmentDuration: "10 week cycles",
    contraindications: "Active malignancy, pregnancy, uncontrolled diabetes",
    commonSideEffects: "Water retention, flushing",
    keyBloodTests: "IGF-1, fasting glucose",
    recommendedSupplements: "Magnesium glycinate at bedtime",
    possibleCombinations: "Standalone — already a combination protocol",
  },
  "MOTS-C": {
    categories: ["Metabolism", "Longevity", "Weight Loss"],
    howItWorks: "A mitochondrial-derived peptide that activates AMPK signaling, improving insulin sensitivity and mitochondrial energy metabolism — mimics some of the metabolic benefits of exercise at a cellular level.",
    targetBenefits: "Improved insulin sensitivity, metabolic flexibility, exercise capacity",
    bestUseFor: "Metabolic syndrome, insulin resistance, athletic performance support",
    dosageInstructions: "10 mg once weekly, ideally before exercise",
    administrationRoute: "Subcutaneous injection",
    strengthVolume: "10 mg/ml, 5 ml vial",
    treatmentDuration: "5 week cycles, up to 10 weeks per year",
    contraindications: "Pregnancy, active malignancy",
    commonSideEffects: "Mild injection-site irritation",
    keyBloodTests: "Fasting insulin, HbA1c",
    recommendedSupplements: "Berberine, alpha-lipoic acid",
    possibleCombinations: "AOD-9604",
  },
  "Thymosin Alpha-1": {
    categories: ["Immune Function", "Longevity"],
    howItWorks: "A thymic peptide that modulates T-cell maturation and function, helping balance an under- or over-active immune response and reduce chronic low-grade inflammation.",
    targetBenefits: "Immune modulation, reduced inflammation, faster recovery from illness",
    bestUseFor: "Frequent infections, autoimmune-leaning presentations, post-illness recovery",
    dosageInstructions: "450 mcg once daily, or 1500 mcg twice weekly",
    administrationRoute: "Subcutaneous injection",
    strengthVolume: "3000 mcg/ml, 5 ml vial",
    treatmentDuration: "4-6 week cycles",
    contraindications: "Organ-transplant recipients on immunosuppressants, active malignancy",
    commonSideEffects: "Mild injection-site redness",
    keyBloodTests: "CBC with differential",
    recommendedSupplements: "Vitamin D3, zinc",
    possibleCombinations: "BPC-157, KPV",
  },
  "GHK-Cu": {
    categories: ["Skin & Hair", "Healing", "Longevity"],
    howItWorks: "A naturally occurring copper-binding tripeptide that signals tissue remodeling — stimulates collagen/elastin synthesis, antioxidant enzyme activity and stem-cell activation in skin, hair follicles and connective tissue.",
    targetBenefits: "Skin firmness and repair, hair-follicle stimulation, wound healing, anti-inflammatory",
    bestUseFor: "Skin rejuvenation, hair thinning, general tissue-repair support",
    dosageInstructions: "2 mg once daily (injectable); topical serum/foam applied nightly for skin/scalp",
    administrationRoute: "Subcutaneous injection, or topical serum/foam",
    strengthVolume: "10 mg/ml, 5 ml vial (injectable)",
    treatmentDuration: "25 day cycles, 6 weeks on/off",
    contraindications: "Known copper sensitivity, pregnancy",
    commonSideEffects: "Mild injection-site irritation; topical use rarely causes redness",
    keyBloodTests: "Serum copper (if long-term use)",
    recommendedSupplements: "Vitamin C (supports collagen synthesis)",
    possibleCombinations: "BPC-157, TB-500",
  },
  "KPV": {
    categories: ["Gut Health", "Immune Function", "Healing"],
    howItWorks: "The C-terminal tripeptide fragment of alpha-MSH; exerts potent anti-inflammatory action by inhibiting NF-kB signaling, particularly effective in calming gut-lining and skin inflammation without immune suppression.",
    targetBenefits: "Reduced gut inflammation, calmer skin, general anti-inflammatory support",
    bestUseFor: "IBS/IBD-adjacent symptoms, inflammatory skin conditions",
    dosageInstructions: "500 mcg once daily",
    administrationRoute: "Subcutaneous injection (oral capsule form available)",
    strengthVolume: "2 mg/ml, 4 ml vial",
    treatmentDuration: "4-6 week cycles",
    contraindications: "Pregnancy, active malignancy",
    commonSideEffects: "Mild injection-site irritation",
    keyBloodTests: "None routinely required",
    recommendedSupplements: "L-glutamine, probiotics",
    possibleCombinations: "BPC-157",
  },
  "DSIP": {
    categories: ["Sleep", "Longevity"],
    howItWorks: "Delta sleep-inducing peptide crosses the blood-brain barrier to promote deep, slow-wave (delta) sleep and helps regulate cortisol and circadian stress response.",
    targetBenefits: "Deeper sleep, improved stress resilience, circadian regulation",
    bestUseFor: "Insomnia, disrupted sleep architecture, shift-work circadian disruption",
    dosageInstructions: "100 mcg, 3 hours before bed",
    administrationRoute: "Subcutaneous injection",
    strengthVolume: "1000 mcg/ml, 2 ml vial",
    treatmentDuration: "2-4 week initial cycle, then maintenance every 3 days",
    contraindications: "Pregnancy",
    commonSideEffects: "Mild drowsiness if timed too late",
    keyBloodTests: "None routinely required",
    recommendedSupplements: "Magnesium glycinate, L-theanine",
    possibleCombinations: "Epitalon, Selank",
  },
  "Selank": {
    categories: ["Cognitive & Mood", "Sleep"],
    howItWorks: "A synthetic analog of the immunomodulatory peptide tuftsin; increases BDNF and modulates GABA/serotonin activity, producing an anxiolytic effect without sedation or dependence.",
    targetBenefits: "Reduced anxiety, improved focus, better stress tolerance",
    bestUseFor: "Anxiety, mild cognitive fog, stress-related sleep disruption",
    dosageInstructions: "300 mcg twice weekly (nasal spray more common for daily use)",
    administrationRoute: "Subcutaneous injection or intranasal spray",
    strengthVolume: "1 mg/ml, 5 ml vial (injectable); 3 mg/ml nasal spray",
    treatmentDuration: "4-6 week cycles",
    contraindications: "Pregnancy",
    commonSideEffects: "Mild nasal irritation (spray form)",
    keyBloodTests: "None routinely required",
    recommendedSupplements: "L-theanine, magnesium",
    possibleCombinations: "Semax",
  },
  "Semax": {
    categories: ["Cognitive & Mood"],
    howItWorks: "A synthetic ACTH(4-10) fragment that boosts BDNF and dopamine/serotonin activity in the prefrontal cortex, enhancing focus, memory consolidation and mood without stimulant-like side effects.",
    targetBenefits: "Improved focus and memory, mood elevation, neuroprotection",
    bestUseFor: "Cognitive fog, focus/concentration support, mild mood enhancement",
    dosageInstructions: "300 mcg twice weekly (nasal spray more common for daily use)",
    administrationRoute: "Subcutaneous injection or intranasal spray",
    strengthVolume: "1 mg/ml, 5 ml vial (injectable); 3 mg/ml nasal spray",
    treatmentDuration: "8 week cycles",
    contraindications: "Pregnancy, seizure disorder (caution)",
    commonSideEffects: "Mild jitteriness at higher doses",
    keyBloodTests: "None routinely required",
    recommendedSupplements: "Omega-3, B-complex",
    possibleCombinations: "Selank",
  },
  "Dihexa Capsules": {
    categories: ["Cognitive & Mood"],
    howItWorks: "A small-molecule derivative of angiotensin IV that potently activates the HGF/c-Met neurotrophic pathway, promoting synaptogenesis and neuronal repair — among the most potent cognitive-enhancing compounds studied.",
    targetBenefits: "Synaptic growth, memory support, neuroprotection",
    bestUseFor: "Significant cognitive decline concerns, advanced longevity/cognitive protocols",
    dosageInstructions: "10-20 mg once daily",
    administrationRoute: "Oral capsule",
    strengthVolume: "10-20 mg capsules",
    treatmentDuration: "4-8 week cycles",
    contraindications: "Pregnancy, active malignancy (theoretical growth-factor concern)",
    commonSideEffects: "Mild headache",
    keyBloodTests: "None routinely required",
    recommendedSupplements: "Omega-3",
    possibleCombinations: "Semax, Selank",
  },
  "PT-141": {
    categories: ["Sexual Health"],
    howItWorks: "A melanocortin-receptor agonist that acts centrally on the hypothalamus to increase sexual desire and arousal, independent of the vascular mechanism used by PDE5 inhibitors like sildenafil.",
    targetBenefits: "Increased libido and arousal in both men and women",
    bestUseFor: "Low libido not responsive to vascular-based therapies, or as an adjunct",
    dosageInstructions: "1-2 mg as needed, 45 minutes before activity, max twice weekly",
    administrationRoute: "Subcutaneous injection (nasal spray form also available)",
    strengthVolume: "10 mg/ml, 2 ml vial",
    treatmentDuration: "As needed",
    contraindications: "Uncontrolled hypertension, cardiovascular disease",
    commonSideEffects: "Nausea, flushing, mild headache",
    keyBloodTests: "Blood pressure check before initiating",
    recommendedSupplements: "None specific",
    possibleCombinations: "Kisspeptin-10",
  },
  "PT-141 Nasal": {
    categories: ["Sexual Health"],
    howItWorks: "Same mechanism as injectable PT-141 (central melanocortin-receptor activation) delivered via nasal spray for needle-free convenience, with slightly lower/slower peak absorption.",
    targetBenefits: "Increased libido and arousal, needle-free option",
    bestUseFor: "Patients preferring a non-injectable route",
    dosageInstructions: "1-2 pumps as needed before activity, max 3x weekly",
    administrationRoute: "Intranasal spray",
    strengthVolume: "10 mg in 15 ml bottle",
    treatmentDuration: "As needed",
    contraindications: "Uncontrolled hypertension, cardiovascular disease",
    commonSideEffects: "Nasal irritation, mild flushing",
    keyBloodTests: "Blood pressure check before initiating",
    recommendedSupplements: "None specific",
    possibleCombinations: "None typical",
  },
  "Kisspeptin-10": {
    categories: ["Sexual Health", "Hormonal Health"],
    howItWorks: "A key upstream regulator of the hypothalamic-pituitary-gonadal axis; stimulates GnRH release, which in turn supports natural testosterone/estrogen production and libido.",
    targetBenefits: "Support for natural hormone production, libido",
    bestUseFor: "Patients seeking hormonal-axis support alongside sexual health goals",
    dosageInstructions: "10 mcg daily before bed",
    administrationRoute: "Subcutaneous injection",
    strengthVolume: "100 mcg/ml, 4 ml vial",
    treatmentDuration: "Maximum 40-day cycle",
    contraindications: "Hormone-sensitive cancers, pregnancy",
    commonSideEffects: "Mild flushing, injection-site irritation",
    keyBloodTests: "Testosterone/estradiol, LH/FSH",
    recommendedSupplements: "Zinc, vitamin D3",
    possibleCombinations: "PT-141",
  },
  "KPV + BPC-157": {
    categories: ["Gut Health", "Healing"],
    howItWorks: "Combines KPV's anti-inflammatory NF-kB inhibition with BPC-157's tissue-repair signaling for a synergistic gut-healing effect — commonly compounded together for GI-focused protocols.",
    targetBenefits: "Combined anti-inflammatory and healing support for the gut lining",
    bestUseFor: "IBS/IBD-adjacent symptoms alongside general gut-repair needs",
    dosageInstructions: "1 capsule (750 mcg total) once daily in the morning",
    administrationRoute: "Oral capsule",
    strengthVolume: "500 mcg / 250 mcg per capsule",
    treatmentDuration: "6-8 week cycles",
    contraindications: "Pregnancy, active malignancy",
    commonSideEffects: "None commonly reported",
    keyBloodTests: "None routinely required",
    recommendedSupplements: "L-glutamine, probiotics",
    possibleCombinations: "Standalone — already a combination protocol",
  },
  "BPC-157 Capsules": {
    categories: ["Gut Health", "Healing"],
    howItWorks: "Oral form of BPC-157 — survives gastric acid well due to its stable structure — providing localized healing signal directly to the gut lining as well as systemic tissue-repair benefit.",
    targetBenefits: "Gut-lining repair, systemic tissue healing, needle-free option",
    bestUseFor: "GI-focused healing goals, or patients who prefer oral over injectable",
    dosageInstructions: "1 capsule (500 mcg) daily, empty stomach",
    administrationRoute: "Oral capsule",
    strengthVolume: "500 mcg capsules",
    treatmentDuration: "30 day cycles, 3 months+ for chronic gut issues",
    contraindications: "Active malignancy, pregnancy",
    commonSideEffects: "None commonly reported",
    keyBloodTests: "None routinely required",
    recommendedSupplements: "Probiotics, L-glutamine",
    possibleCombinations: "KPV",
  },
  "GHK-Cu Facial Serum": {
    categories: ["Skin & Hair"],
    howItWorks: "Topical delivery of GHK-Cu directly to the skin, stimulating local collagen/elastin remodeling, antioxidant activity and mild skin-brightening without systemic exposure.",
    targetBenefits: "Firmer, more even-toned skin; reduced fine lines",
    bestUseFor: "Cosmetic skin-rejuvenation goals, low-risk entry point to peptide therapy",
    dosageInstructions: "Apply a thin layer nightly to clean skin",
    administrationRoute: "Topical serum",
    strengthVolume: "0.3-0.5% concentration serum",
    treatmentDuration: "30-60 days, continuous use",
    contraindications: "Known copper sensitivity",
    commonSideEffects: "Rare mild redness",
    keyBloodTests: "None required",
    recommendedSupplements: "Vitamin C serum (layer separately)",
    possibleCombinations: "GHK-Cu Scalp Foam",
  },
  "GHK-Cu Scalp Foam": {
    categories: ["Skin & Hair"],
    howItWorks: "Topical GHK-Cu formulated for scalp delivery, stimulating hair-follicle stem cells and local blood flow to support hair density and reduce shedding.",
    targetBenefits: "Reduced hair shedding, improved hair density over time",
    bestUseFor: "Early-stage thinning hair, adjunct to other hair-restoration therapy",
    dosageInstructions: "Massage into scalp nightly",
    administrationRoute: "Topical foam",
    strengthVolume: "0.1-0.19% concentration foam",
    treatmentDuration: "30 days, continuous use",
    contraindications: "Known copper sensitivity",
    commonSideEffects: "Rare mild scalp irritation",
    keyBloodTests: "None required",
    recommendedSupplements: "Biotin, saw palmetto",
    possibleCombinations: "GHK-Cu Facial Serum",
  },
};

const ACTIVITY_LEVELS = {
  "Sedentary":         { multiplier: 1.2,   desc: "Little or no exercise, desk job" },
  "Lightly Active":    { multiplier: 1.375, desc: "Light exercise or sports 1-3 days/week" },
  "Moderately Active": { multiplier: 1.55,  desc: "Moderate exercise or sports 3-5 days/week" },
  "Very Active":       { multiplier: 1.725, desc: "Hard exercise or sports 6-7 days/week" },
};

function calcBMI(heightCm, weightKg) {
  if (!heightCm || !weightKg) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

function bmiCategory(bmi) {
  if (bmi == null) return "";
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal weight";
  if (bmi < 30) return "Overweight";
  if (bmi < 35) return "Obesity Class I";
  if (bmi < 40) return "Obesity Class II";
  return "Obesity Class III";
}

// Mifflin-St Jeor
function calcBMR(weightKg, heightCm, age, gender) {
  if (!weightKg || !heightCm || !age) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === "Female" ? base - 161 : base + 5);
}

// ── Structured intake (ported from Consult-Buddy intakeQuestions.ts) ──────
// Drives the first step of the consultation exactly like Consult-Buddy:
// Identity / Demographics (hardcoded fields) → Clinical → Primary Health
// Objectives → Objective-Specific. `required: true` marks a question the
// doctor must answer before continuing (validated in the wizard).
// `conditionalOn.value` may be a string or an array of strings (OR match).
const INTAKE_SECTIONS = [
  "Clinical",
  "Primary Health Objectives",
  "Objective-Specific Questions",
];

// Goals that route the consultation to the weight-loss / GLP-1 workflow and
// reveal the activity-level & body-type questions.
const WEIGHT_LOSS_GOALS = ["Weight loss", "Improve metabolism & reduce belly fat"];

const INTAKE_QUESTIONS = [
  // Clinical
  { id: "health_conditions", section: "Clinical", question: "Chronic illnesses history", type: "multiselect", hasGate: true, gateLabel: "Any chronic illnesses?", hasOther: true, hasNotes: true, required: true, options: ["High blood pressure", "High cholesterol", "Prediabetes or diabetes", "Thyroid disorder", "Hormonal imbalance (e.g., low testosterone, PCOS)", "Autoimmune or inflammatory condition", "Chronic joint, muscle, or back pain", "Sleep disorder (insomnia, sleep apnea, etc.)", "Mental health condition (stress, anxiety, depression)"] },
  { id: "allergies", section: "Clinical", question: "Allergy history", type: "multiselect", hasGate: true, gateLabel: "Any known allergies?", hasOther: true, hasNotes: true, required: true, options: ["Medications", "Vitamins or supplements", "Food allergies", "Environmental allergies"] },
  { id: "is_pregnant", section: "Clinical", question: "Currently pregnant?", type: "select", options: ["No", "Yes"], conditionalOn: { questionId: "gender", value: "Female" }, required: true },
  { id: "is_breastfeeding", section: "Clinical", question: "Currently breastfeeding?", type: "select", options: ["No", "Yes"], conditionalOn: { questionId: "gender", value: "Female" }, required: true },
  { id: "cancer_history", section: "Clinical", question: "Have you or a close family member ever been diagnosed with cancer or any tumor/growth?", type: "select", options: ["No", "Yes - myself", "Yes - a family member", "Yes - both myself and a family member"], hasNotes: true },
  { id: "previous_glp1", section: "Clinical", question: "Previous history of GLP-1 medication use?", type: "select", options: ["No", "Yes"], hasNotes: true },

  // Primary Health Objectives
  { id: "health_goals", section: "Primary Health Objectives", question: "What are the main health goals? (Select all that apply)", type: "multiselect", hasOther: true, hasNotes: true, options: ["Weight loss", "Healthy aging & longevity", "Build muscle & recover better", "Heal injuries & reduce pain", "Improve metabolism & reduce belly fat", "Improve sleep & reset body clock", "Cognitive function & mood enhancement", "Sexual health", "Immune function & inflammation", "Gut health", "Skin & hair"] },

  // Objective-Specific — Weight loss / metabolism / fat loss (activity level
  // writes to patient.activityLevel directly — it feeds the TDEE calculation)
  { id: "activity_level", section: "Objective-Specific Questions", question: "Activity level", type: "select", options: ["Sedentary", "Lightly Active", "Moderately Active", "Very Active"], conditionalOn: { questionId: "health_goals", value: WEIGHT_LOSS_GOALS }, patientField: "activityLevel" },
  { id: "body_type", section: "Objective-Specific Questions", question: "Body type (select closest match)", type: "select", options: ["Lean", "Athletic", "Average", "Overweight", "Central/Abdominal fat dominant"], conditionalOn: { questionId: "health_goals", value: WEIGHT_LOSS_GOALS } },
  { id: "fat_storage", section: "Objective-Specific Questions", question: "Where does fat tend to store the most?", type: "select", options: ["Evenly", "Hips/thighs", "Abdomen/belly", "Mostly visceral/belly"], conditionalOn: { questionId: "health_goals", value: "Improve metabolism & reduce belly fat" } },
  { id: "fat_loss_struggle", section: "Objective-Specific Questions", question: "Struggled to lose fat despite diet or exercise?", type: "select", options: ["No", "Occasionally", "Yes", "Long-term struggle"], conditionalOn: { questionId: "health_goals", value: WEIGHT_LOSS_GOALS } },
  { id: "insulin_resistance", section: "Objective-Specific Questions", question: "Ever told you have insulin resistance, prediabetes, or metabolic syndrome?", type: "select", options: ["No", "Borderline", "Yes"], conditionalOn: { questionId: "health_goals", value: WEIGHT_LOSS_GOALS } },
  // Longevity
  { id: "energy_levels", section: "Objective-Specific Questions", question: "Overall energy levels?", type: "select", options: ["Very good", "Good", "Moderate", "Low"], conditionalOn: { questionId: "health_goals", value: "Healthy aging & longevity" } },
  { id: "recovery_decline", section: "Objective-Specific Questions", question: "Has recovery, resilience, or stamina declined?", type: "select", options: ["No", "Slightly", "Moderately", "Significantly"], conditionalOn: { questionId: "health_goals", value: "Healthy aging & longevity" } },
  { id: "inflammation", section: "Objective-Specific Questions", question: "Persistent inflammation, aches, or stiffness?", type: "select", options: ["No", "Occasionally", "Often", "Constantly"], conditionalOn: { questionId: "health_goals", value: "Healthy aging & longevity" } },
  // Build muscle
  { id: "muscle_plateau", section: "Objective-Specific Questions", question: "Have muscle gains or strength plateaued?", type: "select", options: ["No", "Slightly", "Yes", "Declining"], conditionalOn: { questionId: "health_goals", value: "Build muscle & recover better" } },
  { id: "workout_recovery", section: "Objective-Specific Questions", question: "Recovery after workouts?", type: "select", options: ["Very well", "Acceptable", "Poorly", "Need several days"], conditionalOn: { questionId: "health_goals", value: "Build muscle & recover better" } },
  // Heal injuries
  { id: "current_injury", section: "Objective-Specific Questions", question: "Current injury or chronic pain?", type: "select", options: ["No", "Mild", "Moderate", "Severe"], conditionalOn: { questionId: "health_goals", value: "Heal injuries & reduce pain" } },
  { id: "injury_type", section: "Objective-Specific Questions", question: "What best describes the issue?", type: "select", options: ["Muscle strain", "Tendon/ligament", "Joint pain", "Post-surgery", "Multiple areas"], conditionalOn: { questionId: "health_goals", value: "Heal injuries & reduce pain" } },
  { id: "injury_duration", section: "Objective-Specific Questions", question: "How long has the issue been present?", type: "select", options: ["<1 month", "1-3 months", "3-6 months", ">6 months"], conditionalOn: { questionId: "health_goals", value: "Heal injuries & reduce pain" } },
  // Sleep
  { id: "sleep_quality", section: "Objective-Specific Questions", question: "Sleep quality?", type: "select", options: ["Very good", "Good", "Poor", "Very poor"], conditionalOn: { questionId: "health_goals", value: "Improve sleep & reset body clock" } },
  { id: "sleep_issue", section: "Objective-Specific Questions", question: "Struggle more with falling asleep or staying asleep?", type: "select", options: ["Falling asleep", "Staying asleep", "Both", "Neither"], conditionalOn: { questionId: "health_goals", value: "Improve sleep & reset body clock" } },
  { id: "sleep_hours", section: "Objective-Specific Questions", question: "Average hours of sleep?", type: "select", options: ["<5", "5-6", "6-7", "7-8", ">8"], conditionalOn: { questionId: "health_goals", value: "Improve sleep & reset body clock" } },
  { id: "additional_notes", section: "Objective-Specific Questions", question: "Any additional notes or concerns for the doctor?", type: "text" },
];

// Weight-loss daily calorie target: TDEE minus a 500 kcal deficit, floored at 1200.
function weightLossCalories(tdee) {
  if (!tdee) return null;
  return Math.max(1200, Math.round(tdee) - 500);
}

module.exports = {
  GLP1_MEDICATIONS,
  PK_PHASES_WEEKLY,
  PK_PHASES_DAILY,
  SYMPTOMS,
  PEPTIDE_PROTOCOLS,
  HEALTH_GOAL_PEPTIDES,
  PEPTIDE_INFO,
  ACTIVITY_LEVELS,
  INTAKE_SECTIONS,
  INTAKE_QUESTIONS,
  WEIGHT_LOSS_GOALS,
  calcBMI,
  bmiCategory,
  calcBMR,
  weightLossCalories,
};
