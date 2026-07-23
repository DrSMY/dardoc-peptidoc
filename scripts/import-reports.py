#!/usr/bin/env python3
"""
One-off importer for the DarDoc Peptide + Weight-Loss consultation exports.

Reads the two .xlsx reports, groups rows into one patient per identity
(mobile, else name) — merging demographics and collecting every consult as a
COMPLETED ("previous history") plan — then posts them to the app's
superadmin-only /api/admin/import-history endpoint over HTTPS.

No patient data is written to disk or git; it only travels to the target DB.

Usage:
  python3 scripts/import-reports.py <base_url> <superadmin_password> \\
      <peptide.xlsx> <weightloss.xlsx>
"""
import sys, re, json, http.cookiejar, urllib.request, urllib.parse
import openpyxl

SUPERADMIN_EMAIL = "drsamimoha2018@gmail.com"

def cell(v):
    if v is None:
        return ""
    return str(v).strip()

def to_date(d, t=""):
    d = cell(d)
    if not d:
        return None
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", d)
    if m:
        mo, da, yr = m.groups()
        iso = f"{yr}-{int(mo):02d}-{int(da):02d}"
    else:
        iso = d[:10]
    tt = cell(t)
    return f"{iso} {tt}:00" if re.match(r"^\d{1,2}:\d{2}$", tt) else f"{iso} 00:00:00"

def split_dose(med):
    """'Mounjaro 2.5mg' -> ('Mounjaro', '2.5mg')"""
    m = re.search(r"([\d.]+\s*(?:mg|mcg|ml|units|iu))\b", med, re.I)
    if m:
        dose = m.group(1).replace(" ", "")
        name = (med[:m.start()] + med[m.end():]).strip(" -,")
        return name or med, dose
    return med, ""

def route_freq(name):
    n = name.lower()
    oral = any(k in n for k in ["rybelsus", "pill", "oral", "foundayo"])
    return ("oral" if oral else "injection",
            "daily" if oral else "weekly")

# split "A: xx; B: yy" keyed lists from the peptide sheet
def keyed(text):
    out = {}
    for part in re.split(r";\s*", cell(text)):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip()] = v.strip()
    return out

def identity(name, mobile):
    mob = re.sub(r"[^\d]", "", cell(mobile))
    return ("m:" + mob) if mob else ("n:" + cell(name).lower())

def load(path):
    return list(openpyxl.load_workbook(path, read_only=True).active.iter_rows(min_row=2, values_only=True))

def merge_field(patient, key, value):
    if value and not patient.get(key):
        patient[key] = value

def get_patient(groups, name, mobile, source, extras):
    key = identity(name, mobile)
    if key not in groups:
        groups[key] = {
            "name": cell(name) or "Unknown", "mobile": cell(mobile),
            "age": None, "gender": "", "heightCm": None, "weightKg": None,
            "activityLevel": "", "chronicIllnesses": "", "medications": "",
            "allergies": "", "notes": "", "plans": [],
            "intake": {"sources": [], "bookings": []},
        }
    p = groups[key]
    if source not in p["intake"]["sources"]:
        p["intake"]["sources"].append(source)
    return p

def main():
    base, password, pep_path, wl_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    groups = {}

    # ---- Weight-Loss report ----
    for r in load(wl_path):
        name, mobile = cell(r[2]), cell(r[3])
        if not name:
            continue
        p = get_patient(groups, name, mobile, "weightloss", None)
        if r[6]: merge_field(p, "age", int(r[6]) if str(r[6]).isdigit() else None)
        merge_field(p, "gender", cell(r[7]))
        if r[8]:
            try: merge_field(p, "heightCm", float(r[8]))
            except: pass
        if r[9]:
            try: merge_field(p, "weightKg", float(r[9]))
            except: pass
        merge_field(p, "chronicIllnesses", cell(r[15]))
        merge_field(p, "medications", cell(r[16]))
        merge_field(p, "allergies", ", ".join(x for x in [cell(r[17]), cell(r[18])] if x))
        merge_field(p, "notes", cell(r[21]))
        for k, col in [("bmi", 10), ("bmiCategory", 11), ("bmr", 12),
                       ("maintenanceCalories", 13), ("weightLossCalories", 14)]:
            if cell(r[col]): p["intake"].setdefault(k, cell(r[col]))
        p["intake"]["bookings"].append({"src": "weightloss", "id": cell(r[0]),
                                         "date": cell(r[4]), "status": cell(r[5])})
        med = cell(r[19])
        if med:
            mname, dose = split_dose(med)
            route, freq = route_freq(mname)
            bt = cell(r[20]).lower()
            p["plans"].append({
                "category": "glp1", "title": med, "medication": mname, "dose": dose,
                "route": route, "frequency": freq,
                "bloodTest": "required" if "required" in bt else ("recommended" if "recommend" in bt else "none"),
                "instructions": "\n\n".join(x for x in [cell(r[21]), cell(r[22])] if x),
                "clinicalNote": cell(r[23]), "emr": cell(r[25]),
                "nextFollowup": to_date(r[24])[:10] if to_date(r[24]) else None,
                "createdAt": to_date(r[4], r[1]),
            })

    # ---- Peptide report ----
    for r in load(pep_path):
        name, mobile = cell(r[1]), cell(r[2])
        if not name:
            continue
        p = get_patient(groups, name, mobile, "peptide", None)
        if r[5]: merge_field(p, "age", int(r[5]) if str(r[5]).isdigit() else None)
        merge_field(p, "gender", cell(r[6]))
        if r[7]:
            try: merge_field(p, "heightCm", float(r[7]))
            except: pass
        if r[8]:
            try: merge_field(p, "weightKg", float(r[8]))
            except: pass
        merge_field(p, "activityLevel", cell(r[10]))
        merge_field(p, "chronicIllnesses", cell(r[13]))
        merge_field(p, "allergies", cell(r[14]))
        merge_field(p, "notes", cell(r[18]))
        for k, col in [("bodyShape", 9), ("healthGoals", 11), ("cancerHistory", 15),
                       ("pregnant", 16), ("breastfeeding", 17), ("safetyFlags", 30)]:
            if cell(r[col]): p["intake"].setdefault(k, cell(r[col]))
        p["intake"]["bookings"].append({"src": "peptide", "date": cell(r[3]), "status": cell(r[4])})
        peptides = [x.strip() for x in cell(r[19]).split(",") if x.strip()]
        if peptides:
            doses, freqs, routes, durs = keyed(r[20]), keyed(r[21]), keyed(r[22]), keyed(r[24])
            guide, emr = cell(r[33]), "\n\n".join(x for x in [cell(r[31]), cell(r[32])] if x)
            supp = cell(r[25])
            req, rec = cell(r[26]), cell(r[27])
            bt = "required" if req else ("recommended" if rec else "none")
            for pep in peptides:
                dtxt = doses.get(pep, "")
                dm = re.search(r"([\d.]+\s*(?:mg|mcg|ml|units|iu))", dtxt, re.I)
                rt = routes.get(pep, "").lower()
                p["plans"].append({
                    "category": "peptide", "title": (pep + (" · " + dtxt if dtxt else "")),
                    "medication": pep, "dose": dm.group(1).replace(" ", "") if dm else "",
                    "route": "oral" if ("oral" in rt or "capsule" in rt) else ("nasal" if "nasal" in rt else "injection"),
                    "frequency": freqs.get(pep, ""),
                    "bloodTest": bt, "instructions": durs.get(pep, ""),
                    "supplements": supp, "clinicalNote": guide, "emr": emr,
                    "createdAt": to_date(r[3], r[0]),
                })

    records = list(groups.values())
    plan_ct = sum(len(p["plans"]) for p in records)
    print(f"Prepared {len(records)} patients, {plan_ct} history plans.")

    # ---- authenticate + post ----
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    def post(path, payload):
        req = urllib.request.Request(base + path, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        with opener.open(req, timeout=120) as resp:
            return json.loads(resp.read().decode())

    login = post("/api/auth/login", {"email": SUPERADMIN_EMAIL, "password": password})
    print("Logged in as:", login.get("name"), "/", login.get("role"))

    # Batch to stay under the server's 1MB body limit (guides/EMR are large).
    # First batch clears prior imports (replace); the rest append.
    BATCH = 25
    totals = {"removed": 0, "patientsAdded": 0, "plansAdded": 0}
    for i in range(0, len(records), BATCH):
        chunk = records[i:i + BATCH]
        res = post("/api/admin/import-history", {"records": chunk, "replace": i == 0})
        for k in totals:
            totals[k] += res.get(k, 0)
        print(f"  batch {i//BATCH + 1}: +{res.get('patientsAdded',0)} patients, "
              f"+{res.get('plansAdded',0)} plans")
    print("Import complete:", json.dumps(totals))

if __name__ == "__main__":
    main()
