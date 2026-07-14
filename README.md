# DarDoc · PeptiDoc

**One app for the whole treatment journey: consult → personalised guide → follow-up.**

A unified reinvention of three earlier projects ([Consult-Buddy](https://github.com/DrSMY/Consult-Buddy), [glp1-doctor](https://github.com/DrSMY/glp1-doctor), [glp1-patient](https://github.com/DrSMY/glp1-patient)) into a single zero-dependency Node.js + SQLite application with a **doctor side** and a **patient side** — no longer limited to GLP-1 medications.

## The workflow

1. **Doctor** runs a consultation (`/doctor`) — new or existing patient, vitals auto-compute BMI/BMR/calorie targets.
2. Picks a **program**: GLP-1 preset (Mounjaro, Wegovy, Ozempic, Rybelsus, Foundayo…), a peptide protocol (BPC-157, CJC/Ipamorelin, Thymosin…), or a **fully custom** medication with its own dose schedule/titration.
3. Reviews the auto-generated **patient guide** (instructions, warnings, nutrition targets, dose schedule, follow-up date) and publishes it.
4. Patient gets a WhatsApp message with the portal link + a **6-digit PIN** (mobile number = their ID).
5. **Patient** (`/portal`) sees their guide, logs doses (with injection-site rotation), submits daily check-ins (weight + 10 symptom dimensions), tracks their progress, and messages the doctor.
6. Severe symptoms **auto-flag an alert** on the doctor dashboard; the doctor also sees due follow-ups, activity, weight trends, and can adjust the dose remotely.

## Run it

```bash
node server.js          # http://localhost:4700
```

Requires Node.js ≥ 22.5 (uses the built-in `node:sqlite`). **No npm install needed — zero dependencies.**

- Landing page: `http://localhost:4700/`
- Doctor dashboard: `http://localhost:4700/doctor`
- Patient portal: `http://localhost:4700/portal`

First run seeds a doctor account — email `drsamimoha2018@gmail.com`, password `DarDoc@2026` (**change it in Settings after first login**), plus all built-in GLP-1 and peptide program templates. Override with env vars `ADMIN_EMAIL` / `ADMIN_PASSWORD` on first boot.

## Deploy (Render)

A [`render.yaml`](render.yaml) blueprint is included — one-click deploy:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/DrSMY/dardoc-peptidoc)

1. Click the button (or **New → Blueprint** in the Render dashboard and pick this repo).
2. Render reads `render.yaml`: a **Starter** web service + **1 GB persistent disk** mounted at `/data`, with `DATA_DIR=/data` so the SQLite database survives deploys.
3. When prompted, set **`ADMIN_PASSWORD`** (your doctor login; min 8 chars). `ADMIN_EMAIL` defaults to `drsamimoha2018@gmail.com`.
4. First boot seeds the admin + program templates and, because `IMPORT_SUPABASE=1`, imports the legacy GLP-1 patients — new portal PINs print to the deploy **Logs** (share via WhatsApp). The import is idempotent and safe on every deploy.

To also import Consult-Buddy consultations (behind Supabase auth), run once locally:
`CB_EMAIL=you@example.com CB_PASSWORD=… node scripts/import-supabase.js`

Manual setup instead of the blueprint: build command *(none)*, start command `node server.js`, add a persistent disk, and set `DATA_DIR` to its mount path.

## Stack

- **Server:** Node.js `node:http` + `node:sqlite` (WAL), scrypt-hashed passwords/PINs, cookie sessions. No dependencies.
- **Frontend:** vanilla JS SPAs (doctor + patient) with a shared design system (`public/theme.css`), inline SVG icons, dependency-free SVG charts.
- **Data:** `data/peptidoc.sqlite` (gitignored).

```
server.js            HTTP server + static routing
src/db.js            schema, seed, hashing
src/api.js           JSON API (doctor + portal)
src/presets.js       GLP-1 meds, peptide protocols, PK phases, symptoms
public/theme.css     design tokens + components
public/shared.js     api/icons/toast/charts helpers
public/guide.js      patient-guide renderer (shared)
public/index.html    landing (path selection)
public/doctor/       doctor SPA
public/portal/       patient SPA
```

> ⚠️ Clinical decision-support prototype. Not a certified medical device; not for emergency use.
