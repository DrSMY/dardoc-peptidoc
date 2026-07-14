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

module.exports = {
  GLP1_MEDICATIONS,
  PK_PHASES_WEEKLY,
  PK_PHASES_DAILY,
  SYMPTOMS,
  PEPTIDE_PROTOCOLS,
  ACTIVITY_LEVELS,
  calcBMI,
  bmiCategory,
  calcBMR,
};
