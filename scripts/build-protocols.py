#!/usr/bin/env python3
"""Generate src/protocols.js from the Peptide Protocol Guidebook workbook.

The guidebook is the prescriber's source of truth: 31 products, 66 dosing
variants, nine lab panels, the peptide-to-panel mapping, the cross-peptide
safety rules and the documented stacks. Re-run this whenever a new version
of the workbook lands rather than hand-editing the generated module:

    python3 scripts/build-protocols.py "<path to Guidebook vN.xlsx>"
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else (
    Path.home() / "Downloads/peptides protocol/Peptide Protocol Guidebook v2.xlsx")
OUT = Path(__file__).resolve().parent.parent / "src" / "protocols.js"

wb = openpyxl.load_workbook(SRC, data_only=True)


def rows(sheet):
    for r in wb[sheet].iter_rows(values_only=True):
        yield [("" if c is None else str(c).strip()) for c in r]


def cells(r):
    return [c for c in r if c]


# ── products ────────────────────────────────────────────────────────
FIELD_MAP = {
    "Indication": "indication", "Best used for": "bestUseFor",
    "How it works": "howItWorks", "Presentation": "presentationNote",
    "Route": "route", "Strength": "strength", "Containers": "containers",
    "Timing": "timing", "Cycling and breaks": "cycling",
    "Combines with": "combinesWith", "Supporting supplements": "supplements",
    "Blood panels": "panels", "Monitoring status": "monitoring",
    "Side effects": "sideEffects", "Cautions": "cautions",
    "Prescriber note": "prescriberNote", "NEEDS VERIFICATION": "needsVerification",
}
header = re.compile(r"^(P\d\d)\s+(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$")

products, cur, in_variants = [], None, False
for r in rows("PROTOCOL DETAIL"):
    cs = cells(r)
    if not cs:
        continue
    m = header.match(re.sub(r"\s{2,}", " ", " | ".join(cs)))
    if m:
        cur = {"ref": m.group(1), "name": m.group(2).strip(),
               "presentation": m.group(3).strip(), "category": m.group(4).strip(),
               "variants": []}
        products.append(cur)
        in_variants = False
        continue
    if not cur:
        continue
    if cs[0] == "PROTOCOL VARIANTS":
        in_variants = True
        continue
    if in_variants and cs[0] == "Variant":
        continue
    if in_variants and cs[0].lower().startswith("variant "):
        pad = cs + [""] * 9
        cur["variants"].append({
            "name": pad[0], "dose": pad[1], "delivered": pad[2],
            "frequency": pad[3], "course": pad[4], "doses": pad[5],
            "vials": pad[6], "pens": pad[7], "note": pad[8],
        })
        continue
    if len(cs) >= 2:
        in_variants = False
        key = FIELD_MAP.get(cs[0])
        if key:
            cur[key] = " ".join(cs[1:])

# ── lab panels + peptide→panel mapping ──────────────────────────────
panels, mapping, mode = [], {}, None
for r in rows("LAB MONITORING"):
    cs = cells(r)
    if not cs:
        continue
    if cs[0] == "PANEL CONTENTS":
        mode = "panels"; continue
    if cs[0] == "PEPTIDE TO PANEL MAPPING":
        mode = "map"; continue
    if cs[0] in ("Panel", "Ref", "LAB MONITORING"):
        continue
    if mode == "panels" and cs[0].startswith("Panel"):
        panels.append({
            "id": cs[0], "name": cs[1],
            "tests": [t.strip() for t in cs[2].split(";") if t.strip()],
            "price": cs[4] if len(cs) > 4 else "",
        })
    elif mode == "map" and re.match(r"^P\d\d$", cs[0]):
        mapping[cs[0]] = {"panels": cs[2], "status": cs[3] if len(cs) > 3 else ""}

for p in products:
    m = mapping.get(p["ref"])
    if m:
        p["panelRule"] = m["panels"]
        p["monitoring"] = m["status"] or p.get("monitoring", "")

# ── safety rules / stacking / benefits ──────────────────────────────
safety = []
for r in rows("SAFETY RULES"):
    cs = cells(r)
    if len(cs) >= 3 and cs[0] not in ("Rule type", "CROSS-PEPTIDE SAFETY RULES"):
        safety.append({"type": cs[0], "appliesTo": cs[1], "requirement": cs[2]})

stacks, prohibited = [], []
for r in rows("STACKING GUIDE"):
    cs = cells(r)
    if not cs or cs[0] in ("STACKING GUIDE", "Goal"):
        continue
    if cs[0].startswith("DO NOT COMBINE"):
        prohibited.append(" ".join(cs[1:]) if len(cs) > 1 else cs[0])
        continue
    if len(cs) >= 3:
        stacks.append({"goal": cs[0], "combination": cs[1], "achieves": cs[2],
                       "scheduling": cs[3] if len(cs) > 3 else ""})

goals, benefits = [], []
for r in rows("BENEFITS BY GOAL"):
    cs = cells(r)
    if not cs:
        continue
    if cs[0] == "#":
        goals = cs[2:]
        continue
    if cs[0].isdigit():
        row = [c for c in r][1:]
        name = row[0].strip()
        entry = {"peptide": name, "primary": [], "secondary": []}
        for i, g in enumerate(goals):
            v = (row[1 + i] or "").strip().lower() if 1 + i < len(row) else ""
            if v == "primary":
                entry["primary"].append(g)
            elif v == "secondary":
                entry["secondary"].append(g)
        benefits.append(entry)

banner = f"""// GENERATED FILE — do not edit by hand.
// Source: {Path(SRC).name}
// Regenerate with: python3 scripts/build-protocols.py "<guidebook.xlsx>"
//
// The prescriber's guidebook is the clinical source of truth for peptide
// protocols: every product, its approved dosing variants, the blood panels
// that must accompany it, and the cross-peptide safety rules.
"""


def block(name, value, comment=""):
    return f"\n{comment}const {name} = {json.dumps(value, indent=2, ensure_ascii=False)};\n"


out = banner
out += block("LAB_PANELS", panels,
             "// The nine blood panels, with the tests each one contains.\n")
out += block("PEPTIDE_PRODUCTS", products,
             "// One entry per product (P01–P31), with its dosing variants.\n")
out += block("PROTOCOL_SAFETY_RULES", safety,
             "// Cross-peptide rules: read before writing any protocol.\n")
out += block("PROTOCOL_STACKS", stacks, "// Documented combinations only.\n")
out += block("PROTOCOL_PROHIBITED", prohibited, "// Combinations that must never be written.\n")
out += block("PROTOCOL_BENEFITS", benefits, "// Primary/secondary peptide per patient goal.\n")
out += """
module.exports = {
  LAB_PANELS,
  PEPTIDE_PRODUCTS,
  PROTOCOL_SAFETY_RULES,
  PROTOCOL_STACKS,
  PROTOCOL_PROHIBITED,
  PROTOCOL_BENEFITS,
};
"""
OUT.write_text(out)
print(f"products={len(products)} variants={sum(len(p['variants']) for p in products)} "
      f"panels={len(panels)} safety={len(safety)} stacks={len(stacks)} "
      f"prohibited={len(prohibited)} benefits={len(benefits)}")
print(f"mandatory={sum(1 for p in products if p.get('monitoring','').upper().startswith('MANDATORY'))}")
print("wrote", OUT)
