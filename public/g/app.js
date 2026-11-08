// Public patient guide page (/g/<token>) — the guide a doctor sends over
// WhatsApp. No sign-in: the unguessable token in the URL is the credential.
// The same published program the doctor sees, laid out as five short pages
// (overview, medication, food and habits, side effects and safety, follow-up)
// so a patient can find one thing quickly instead of scrolling one long
// document. Every figure and sentence comes from the program itself, the
// standard guide library (patient-guides.js) or the wording the text guide
// already uses (guide.js); nothing is invented here.
"use strict";

// guide.js and shared.js read a global `S` for per-medication colours.
const S = { medColors: {} };
const TOKEN = location.pathname.split("/").filter(Boolean)[1] || "";
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
const G = { data: null, model: null, tab: "overview", tabs: [], scene: null, io: null, focusNext: false };

const TAB_META = {
  overview: { label: "Overview", short: "Overview", icon: "home" },
  medication: { label: "Medication", short: "Medicine", icon: "pill" },
  food: { label: "Food & habits", short: "Food", icon: "utensils" },
  safety: { label: "Side effects & safety", short: "Safety", icon: "shield" },
  followup: { label: "Follow-up & support", short: "Follow-up", icon: "calendar" },
};
const ARROW = `<svg class="gp-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>`;

// A number that counts up when it scrolls into view. Screen readers and the
// printed page get the real figure; the animated copy is hidden from them.
function countNum(n) {
  const v = toNumber(n);
  if (!Number.isFinite(v) || v < 10 || !Number.isInteger(v)) return esc(String(n));
  const shown = v.toLocaleString("en-US");
  return `<span class="gp-count" data-to="${v}" aria-hidden="true">${REDUCED.matches ? shown : "0"}</span><span class="gp-sr">${shown}</span>`;
}

// ── prose from the master guide document ─────────────────────────────
// Bullets become real lists, "1." lines numbered lists, **bold** and links
// are kept, and the emoji the document uses as decoration are dropped.
function inline(s) {
  let h = esc(s);
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, url) => `<a href="${url}" target="_blank" rel="noopener">${t}</a>`);
  h = h.replace(/(^|[\s(])(https?:\/\/[^\s<)"]+)/g, (_, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>`);
  return h;
}

// "Nausea (most common): eat smaller meals" → the label in bold.
function labelled(s) {
  const l = splitLabel(s);
  return l ? `<strong>${inline(l[0])}:</strong> ${inline(l[1])}` : inline(s);
}

function prose(text) {
  return parseProse(text).map((b) => {
    if (b.type === "p") return `<p>${inline(b.text)}</p>`;
    const items = b.items.map((it) => `<li>${b.type === "ol" ? inline(it) : labelled(it)}</li>`).join("");
    return `<${b.type} class="gp-list${b.ck ? " gp-list-ck" : ""}">${items}</${b.type}>`;
  }).join("");
}

// ── shared pieces ────────────────────────────────────────────────────
const rangeHTML = (r) => (r.min === r.max ? countNum(r.min) : `${countNum(r.min)}–${countNum(r.max)}`);

// Clay-like glyphs for the daily essentials: plain geometry, lit from the
// same top-left as the 3D stage.
let artSeq = 0;
function art(kind) {
  const id = `gpa${++artSeq}`;
  const svg = {
    stack: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EFE6CF"/><stop offset="1" stop-color="#CDBB92"/></linearGradient></defs>
      ${[0, 1, 2].map((i) => { const y = 46 - i * 12, x = 32 + (i === 1 ? -2 : i === 2 ? 2 : 0);
        return `<ellipse cx="${x}" cy="${y + 4}" rx="20" ry="7.5" fill="#B9A57B"/><rect x="${x - 20}" y="${y - 1}" width="40" height="5" fill="#C8B68D"/><ellipse cx="${x}" cy="${y - 1}" rx="20" ry="7.5" fill="url(#${id})"/>`; }).join("")}`,
    rings: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#DCE6D2"/><stop offset="1" stop-color="#9DB394"/></linearGradient></defs>
      <circle cx="26" cy="27" r="14" fill="none" stroke="url(#${id})" stroke-width="8"/>
      <circle cx="39" cy="38" r="14" fill="none" stroke="#C9D7BF" stroke-width="8"/>
      <path d="M30.2 14.4 A14 14 0 0 1 39.6 23.6" fill="none" stroke="url(#${id})" stroke-width="8"/>`,
    drop: `<defs><radialGradient id="${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#CFE2D8"/><stop offset=".55" stop-color="#8FB5A4"/><stop offset="1" stop-color="#5E8F7E"/></radialGradient></defs>
      <ellipse cx="33" cy="33" rx="15" ry="20" transform="rotate(-18 33 33)" fill="url(#${id})"/>
      <ellipse cx="27" cy="23" rx="4" ry="6" transform="rotate(-18 27 23)" fill="#fff" opacity=".45"/>`,
    leaf: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C9DAB9"/><stop offset="1" stop-color="#7FA07A"/></linearGradient></defs>
      <path d="M14 50C14 26 30 12 52 12c0 24-14 38-38 38z" fill="url(#${id})"/><path d="M18 46 44 20" stroke="#EEF3E7" stroke-width="2.5" stroke-linecap="round"/>`,
  }[kind];
  return `<svg class="gp-art" viewBox="0 0 64 64" aria-hidden="true">${svg}</svg>`;
}

function stageHTML(m) {
  const tags = m.kind === "visit" ? "Care · Nourishment · Movement" : m.isGlp1 ? "Care · Nourishment · Hydration" : "Care · Recovery · Consistency";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return `
    <figure class="gp-stage">
      <div class="gp-stage-view">
        <canvas class="gp-stage-canvas" tabindex="0" role="img" aria-label="A slowly turning sculpture of a sphere held by two rings. ${coarse ? "Drag" : "Drag, or use the arrow keys,"} to turn it."></canvas>
        <figcaption class="gp-stage-top"><span>Everyday balance</span><span class="gp-stage-tags">${tags}</span></figcaption>
      </div>
      <div class="gp-stage-foot">
        <p class="gp-stage-hint">${coarse ? "Drag sideways to rotate" : "Drag or use arrow keys to rotate"}</p>
        <div class="gp-stage-btns">
          <button type="button" class="gp-chip-btn" data-scene="pause">Pause motion</button>
          <button type="button" class="gp-chip-btn" data-scene="reset">Reset view</button>
        </div>
      </div>
    </figure>`;
}

function accList(sections, medication) {
  if (!sections.length) return "";
  return `<div class="gp-acclist">${sections.map((s) => `
    <details class="gp-acc">
      <summary><span>${esc(prettyHead(s.head, medication))}</span><span class="gp-plus" aria-hidden="true"></span></summary>
      <div class="gp-acc-body gp-prose">${prose(s.body)}</div>
    </details>`).join("")}</div>`;
}

function pageHead(title, lede) {
  return `<header class="gp-head"><h1 tabindex="-1">${esc(title)}</h1><p class="gp-lede">${esc(lede)}</p></header>`;
}

function labsCard(m) {
  if (m.labs.length) {
    return `
    <article class="gp-card">
      <h2>Lab tests to complete</h2>
      <ul class="gp-labs">${m.labs.map((l) => `
        <li>
          <div class="gp-lab-top"><b>${esc(l.name)}</b>
            <span class="gp-tag ${l.required ? "gp-tag-req" : ""}">${l.required ? "Required" : "Recommended"}</span>
            ${l.fasting ? `<span class="gp-tag">Fasting</span>` : ""}
          </div>
          ${l.detail ? `<p>${esc(l.detail)}</p>` : ""}
          ${l.link ? `<a class="gp-link" href="${esc(l.link)}" target="_blank" rel="noopener">Book this test ${ARROW}</a>` : ""}
        </li>`).join("")}</ul>
    </article>`;
  }
  const bt = m.plan && m.plan.blood_test;
  if (bt && bt !== "none") {
    return `<article class="gp-card"><h2>Blood test ${bt === "required" ? "required" : "recommended"}</h2><p>Please complete your blood test as advised by your doctor.</p></article>`;
  }
  return "";
}

function suppCard(m) {
  if (m.supps.length) {
    return `
    <article class="gp-card">
      <h2>Recommended supplements</h2>
      <ul class="gp-rows">${m.supps.map((s) => `<li><b>${esc(s.name)}</b>${s.dose ? ` <span class="gp-muted">· ${esc(s.dose)}</span>` : ""}${s.benefit ? `<p>${esc(s.benefit)}</p>` : ""}</li>`).join("")}</ul>
    </article>`;
  }
  return m.plan && m.plan.supplements ? `<article class="gp-card"><h2>Supplements</h2><div class="gp-prose">${prose(m.plan.supplements)}</div></article>` : "";
}

function signatureHTML(m, lead) {
  const s = m.signer;
  const revised = m.plan && m.plan.revisedBy
    ? `<p class="gp-revised">Revised by ${esc(m.plan.revisedBy.name)}${m.plan.revisedBy.credentials ? `, ${esc(m.plan.revisedBy.credentials)}` : ""}${m.plan.updated_at ? ` on ${esc(fmtDate(m.plan.updated_at))}` : ""}</p>` : "";
  return `
    <div class="gp-sign">
      ${lead ? `<span class="gp-muted">${esc(lead)}</span>` : ""}
      <b>${esc(m.doctor)}</b>
      ${s.credentials ? `<span>${esc(s.credentials)}</span>` : ""}
      ${s.signature ? `<span>${esc(s.signature).replace(/\n/g, "<br>")}</span>` : ""}
      ${s.clinic ? `<span>${esc(s.clinic)}</span>` : ""}
    </div>${revised}`;
}

// ── overview ─────────────────────────────────────────────────────────
function treatmentCard(m) {
  const p = m.plan, d = splitDose(p.dose);
  const meta = [cap(guideFreqPhrase(p.frequency)), ROUTE_LABEL[p.route] || cap(p.route)].filter(Boolean).join(" · ");
  const lines = [];
  if (m.phase && m.phase.weeks) lines.push(`Current duration: ${esc(String(m.phase.weeks))} week${m.phase.weeks == 1 ? "" : "s"}`);
  if (p.quantity > 1) lines.push(`Quantity dispensed: ${esc(String(p.quantity))}`);
  return `
    <article class="gp-rx">
      <p class="gp-rx-status"><span class="gp-live" aria-hidden="true"></span>Your current treatment</p>
      <div class="gp-rx-main">
        <div>
          <h2 class="gp-rx-name">${esc(p.medication)}</h2>
          <p class="gp-rx-meta">${esc(meta)}</p>
        </div>
        ${p.dose ? `<p class="gp-rx-dose">${d.num ? `<span class="gp-rx-num">${esc(d.num)}</span>${d.unit ? `<span class="gp-rx-unit">${esc(d.unit)}</span>` : ""}` : `<span class="gp-rx-word">${esc(p.dose)}</span>`}</p>` : ""}
      </div>
      ${d.num && d.rest ? `<p class="gp-rx-line">Dose: ${esc(p.dose)}</p>` : ""}
      ${lines.map((l) => `<p class="gp-rx-line">${l}</p>`).join("")}
      <p class="gp-rx-foot">Continue this dose unless your doctor advises otherwise.</p>
    </article>`;
}

function goalsCard(m) {
  return `
    <article class="gp-rx">
      <h2 class="gp-rx-name">Your goals</h2>
      ${m.goals.length ? `<ul class="gp-chips">${m.goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : `<p class="gp-rx-meta">Your doctor will go through your goals with you at your next visit.</p>`}
      <p class="gp-rx-foot">Your plan is built around these goals and your own nutrition needs.</p>
    </article>`;
}

function essentialsHTML(m) {
  const d = m.diet;
  if (d) {
    const cards = [];
    const kcal = toNumber(d.calories);
    if (kcal) cards.push({ label: "Daily calories", value: countNum(kcal), unit: "kcal", note: "Approximately, per day", art: "stack" });
    const pr = proteinRange(d);
    if (pr) cards.push({ label: "Protein", value: rangeHTML(pr), unit: "g", note: "Include with every meal", art: "rings" });
    const w = splitWater(d.water);
    cards.push({ label: "Water", value: esc(w.value), unit: w.unit, note: `${w.rest ? cap(w.rest) + ", unless" : "Unless"} advised otherwise`, art: "drop" });
    if (cards.length < 3) cards.push({ label: "Fibre", value: "25–35", unit: "g", note: "A day, from vegetables, fruit and whole grains", art: "leaf" });
    return `
      <section class="gp-sec" aria-labelledby="gp-ess-h">
        <div class="gp-sec-head"><h2 id="gp-ess-h">Your daily essentials</h2><a class="gp-link" href="#food" data-tab-link>Explore food &amp; habits ${ARROW}</a></div>
        <div class="gp-ess" data-anim="count">${cards.map((c) => `
          <article class="gp-ess-card">
            <h3>${esc(c.label)}</h3>
            <p class="gp-ess-val">${c.value}${c.unit ? `<span>${esc(c.unit)}</span>` : ""}</p>
            <p class="gp-ess-note">${esc(c.note)}</p>
            ${art(c.art)}
          </article>`).join("")}</div>
      </section>`;
  }
  const glance = m.std.glance ? bulletsOf(m.std.glance.body) : [];
  if (!glance.length) return "";
  return `
    <section class="gp-sec" aria-labelledby="gp-ess-h">
      <div class="gp-sec-head"><h2 id="gp-ess-h">Your protocol at a glance</h2><a class="gp-link" href="#medication" data-tab-link>Your medication routine ${ARROW}</a></div>
      <div class="gp-ess gp-ess-text">${glance.map((g) => {
        const mm = g.match(/^([^:]{2,28}):\s+(.+)$/);
        return `<article class="gp-ess-card"><h3>${esc(mm ? mm[1] : "Note")}</h3><p class="gp-ess-txt">${inline(mm ? mm[2] : g)}</p></article>`;
      }).join("")}</div>
    </section>`;
}

function nextCard(m) {
  const next = m.kind === "visit" ? m.visit.next_followup : m.plan.next_followup;
  const w = followWindow(next);
  const how = m.appName ? `Arrange your review through the ${esc(m.appName)}.` : "We'll be in touch to arrange it, or you're welcome to reach out.";
  return `
    <article class="gp-next">
      <svg class="gp-next-rings" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="96"/><circle cx="100" cy="100" r="70"/><circle cx="100" cy="100" r="44"/></svg>
      <h2 class="gp-next-label">${m.kind === "visit" ? "Next follow-up" : "Next follow-up &amp; refill"}</h2>
      <p class="gp-next-date">${w ? (w.past ? "Due now" : `${esc(w.range)} <span>${w.year}</span>`) : "To be arranged"}</p>
      <p class="gp-next-text">${w && w.past ? "Your follow-up is due. Please get in touch so we can arrange it." : how}</p>
      <div class="gp-next-actions">
        ${m.kind === "plan" ? `<button type="button" class="gp-btn gp-btn-light" data-refill></button>` : ""}
        <a class="gp-link gp-link-light" href="#followup" data-tab-link>View your next steps ${ARROW}</a>
      </div>
    </article>`;
}

function welcomeCard(m) {
  if (m.kind === "visit") {
    const v = m.visit;
    const body = v.advice || "Here is the plan we talked about. It's built around your goals and your own nutrition needs.";
    return `
      <article class="gp-welcome">
        <span class="gp-avatar" aria-hidden="true">${esc(docInitials(m.doctor))}</span>
        <div class="gp-welcome-body">
          <p class="gp-from">From ${esc(m.doctor)}</p>
          <h2>${v.advice ? "Advice from your doctor" : "Your health plan"}</h2>
          <div class="gp-prose">${prose(body)}</div>
          ${v.medicationWhy ? `<details class="gp-more"><summary>How medication could help <span class="gp-plus" aria-hidden="true"></span></summary><div class="gp-acc-body gp-prose">${prose(v.medicationWhy)}</div></details>` : ""}
        </div>
      </article>`;
  }
  return `
    <article class="gp-welcome">
      <span class="gp-avatar" aria-hidden="true">${esc(docInitials(m.doctor))}</span>
      <div class="gp-welcome-body">
        <p class="gp-from">From ${esc(m.doctor)}</p>
        <h2>Your journey, not a race.</h2>
        <p>${m.isGlp1 ? "We're here to support your health, preserve muscle, and build habits you can maintain." : "We're here to support your recovery, with careful monitoring throughout."}</p>
        <details class="gp-more">
          <summary>Read your doctor's welcome <span class="gp-plus" aria-hidden="true"></span></summary>
          <div class="gp-acc-body gp-prose">${welcomeLines(m).map((l) => `<p>${esc(l)}</p>`).join("")}<p class="gp-sign-inline">${esc(m.doctor)}</p></div>
        </details>
      </div>
    </article>`;
}

function overviewPanel(m) {
  const visit = m.kind === "visit";
  const lede = heroLede(m);
  return `
    <section class="gp-hero">
      <div class="gp-hero-copy">
        <h1 class="gp-display" tabindex="-1"><span class="gp-line"><span style="--d:0">${visit ? "Your health." : "Your care."}</span></span><span class="gp-line"><span style="--d:1">In balance.</span></span></h1>
        <p class="gp-hero-lede">${esc(lede)}</p>
        ${visit ? goalsCard(m) : treatmentCard(m)}
        <div class="gp-cta">
          ${visit
            ? `<a class="gp-btn gp-btn-dark" href="#food" data-tab-link>Your food plan ${ARROW}</a><a class="gp-link" href="#followup" data-tab-link>Follow-up &amp; support</a>`
            : `<a class="gp-btn gp-btn-dark" href="#medication" data-tab-link>Your medication routine ${ARROW}</a><a class="gp-link" href="#safety" data-tab-link>Side effects &amp; safety</a>`}
        </div>
      </div>
      ${stageHTML(m)}
    </section>
    ${essentialsHTML(m)}
    <div class="gp-pair">${nextCard(m)}${welcomeCard(m)}</div>
    ${m.isGlp1 ? `<p class="gp-foot-note">A smaller appetite still needs good nutrition. Keep protein, vitamins, minerals, fibre, and fluids part of your day.</p>` : ""}`;
}

// ── medication ───────────────────────────────────────────────────────
function medicationPanel(m) {
  const p = m.plan;
  const noun = ROUTE_NOUN[p.route] || "medication";
  const st = stepsFrom(m);
  const docText = st.fromDoctor ? "" : doctorInstructions(m);
  const many = st.steps.length > 4;
  const label = [`Current prescription`, m.phase && m.phase.weeks ? weeksText(m.phase.weeks) : ""].filter(Boolean).join(" · ");
  const about = m.std.about ? prose(m.std.about.body) : m.info.howItWorks ? `<p>${esc(m.info.howItWorks)}</p>` : "";
  const { ladder, cur, future } = doseLadder(m);
  const more = [m.std.titration, ...m.std.more].filter(Boolean);
  return `
    ${pageHead("Your medication", `How to take your current ${noun}, and what the dose strengths in your program mean.`)}
    <article class="gp-card gp-card-tint gp-rxcard">
      <p class="gp-label">${esc(label)}</p>
      <h2 class="gp-rxcard-title">${esc(p.medication)}${p.dose ? ` ${esc(p.dose)}` : ""}${p.frequency ? ` · ${esc(guideFreqPhrase(p.frequency))}` : ""}</h2>
      ${st.before ? `<div class="gp-prose gp-rxcard-intro">${prose(st.before)}</div>` : ""}
      ${st.steps.length ? `<ol class="gp-steps${many ? " gp-steps-many" : ""}">${st.steps.map((s, i) => `
        <li><span class="gp-step-n">${String(i + 1).padStart(2, "0")}</span><p>${inline(s)}</p></li>`).join("")}</ol>` : ""}
      <div class="gp-rxcard-foot gp-prose">
        <p>Continue this dose unless advised otherwise.</p>
        ${st.after ? prose(st.after) : ""}
      </div>
      ${docText ? `<div class="gp-docnote"><h3>Instructions from your doctor</h3><div class="gp-prose">${prose(docText)}</div></div>` : ""}
    </article>
    ${about || ladder.length || m.info.videoLink ? `
    <article class="gp-card">
      <h2>About ${esc(p.medication)}</h2>
      ${about ? `<div class="gp-prose gp-measure">${about}</div>` : ""}
      ${ladder.length ? `
        <h3 class="gp-sub">Approved dose strengths</h3>
        <ol class="gp-ladder" data-anim="ladder">${ladder.map((dose, i) => `
          <li class="${i === cur ? "on" : i < cur ? "past" : ""}" style="--i:${i}">${esc(dose)}${i === cur ? " · current" : ""}</li>`).join("")}</ol>
        <p class="gp-small">Your doctor may adjust this at your next review.</p>` : ""}
      ${m.info.videoLink ? `<a class="gp-link gp-video" href="${esc(m.info.videoLink)}" target="_blank" rel="noopener">Watch how ${esc(p.medication)} works and how to take it ${ARROW}</a>` : ""}
    </article>` : ""}
    ${future.length ? `
    <div class="gp-grid2">${future.map(({ dose, line, note }) => {
      const d = splitDose(dose);
      return `
      <details class="gp-dose">
        <summary>
          <span class="gp-dose-val">${esc(d.num || dose)}${d.num && d.unit ? `<small>${esc(d.unit)}</small>` : ""}</span>
          <span class="gp-dose-txt"><b>${esc(p.medication)}</b><span>Future dose · only if prescribed</span></span>
          <span class="gp-plus" aria-hidden="true"></span>
        </summary>
        <div class="gp-acc-body gp-prose">
          ${line ? `<p>${labelled(line)}</p>` : ""}
          <p>${esc(note)}</p>
        </div>
      </details>`;
    }).join("")}</div>` : ""}
    ${more.length ? `<section class="gp-sec"><div class="gp-sec-head"><h2>More about ${esc(p.medication)}</h2></div>${accList(more, p.medication)}</section>` : ""}`;
}

// ── food & habits ────────────────────────────────────────────────────
function plateCard(d) {
  const parts = plateParts(d);
  const C = 2 * Math.PI * 70, gap = 3;
  let start = 0;
  const segs = parts.map((p, i) => {
    const len = Math.max(1, p.fraction * C - gap);
    const rot = -90 + (start / C) * 360;
    start += p.fraction * C;
    return `<g transform="rotate(${rot.toFixed(2)} 100 100)"><circle class="gp-seg" data-k="${p.k}" cx="100" cy="100" r="70" stroke="${p.color}" style="--len:${len.toFixed(1)};--i:${i}" stroke-dasharray="${len.toFixed(1)} ${C.toFixed(1)}"/></g>`;
  }).join("");
  return `
    <article class="gp-card gp-plate" data-anim="plate">
      <h2>Build a simple plate</h2>
      <p class="gp-small-lead">Use this as your guide for every main meal. These are portions of your plate, not calorie percentages.</p>
      <div class="gp-plate-body">
        <ul class="gp-plate-legend">${parts.map((p) => `
          <li><button type="button" data-seg="${p.k}" aria-pressed="false" data-value="${esc(p.value)}" data-name="${esc(p.name)}">
            <span class="gp-sw" style="background:${p.color}" aria-hidden="true"></span>
            <span><b>${esc(p.value)} ${esc(p.name.toLowerCase())}</b><span>${esc(p.detail)}</span></span>
          </button></li>`).join("")}</ul>
        <div class="gp-donut">
          <svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="70" class="gp-donut-track"/>${segs}<circle cx="100" cy="100" r="50" class="gp-donut-hub"/></svg>
          <p class="gp-donut-center" aria-live="polite"><b>Your plate</b><span>Tap a portion</span></p>
        </div>
      </div>
    </article>`;
}

function dayCard(d) {
  const total = dietExampleDayTotal(d);
  const withProtein = d.meals.filter((x) => Number(x.proteinG) > 0);
  return `
    <article class="gp-card gp-span2 gp-day" ${withProtein.length ? `data-anim="bar"` : ""}>
      <div class="gp-day-head">
        <div><h2>An example day</h2><p class="gp-small-lead">This is one way your day could look. Swap in foods you enjoy, keeping the portions similar.</p></div>
        ${total ? `<p class="gp-day-total"><b>${countNum(total)} g</b><span>protein across the day</span></p>` : ""}
      </div>
      ${withProtein.length ? `<div class="gp-daybar" aria-hidden="true">${d.meals.map((x, i) => Number(x.proteinG) > 0 ? `<span data-k="m${i}" style="flex:${Number(x.proteinG)} 1 0;background:${DAY_TONES[i % DAY_TONES.length]};--i:${i}"></span>` : "").join("")}</div>` : ""}
      <ol class="gp-meals">${d.meals.map((x, i) => `
        <li data-k="m${i}" tabindex="0">
          <span class="gp-meal-dot" style="background:${DAY_TONES[i % DAY_TONES.length]}" aria-hidden="true"></span>
          <b class="gp-meal-name">${esc(x.name)}</b>
          <div class="gp-meal-items gp-prose">${prose(x.items)}</div>
          ${x.proteinG ? `<span class="gp-pill">${esc(x.proteinG)} g protein</span>` : ""}
        </li>`).join("")}</ol>
      <p class="gp-swaps"><b>Protein swaps.</b> Each of these gives about 25 g of protein:</p>
      <ul class="gp-chips gp-chips-soft">${DIET_PROTEIN_SWAPS.split(" · ").map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    </article>`;
}

function foodPanel(m) {
  const d = m.diet;
  const med = m.kind === "plan" ? m.plan.medication : "";
  if (!d) {
    return `
      ${pageHead("Food & everyday habits", "Small, steady habits that support your treatment.")}
      ${m.std.food.map((s) => `<article class="gp-card"><h2>${esc(prettyHead(s.head, med))}</h2><div class="gp-prose gp-measure">${prose(s.body)}</div></article>`).join("")}
      ${suppCard(m)}`;
  }
  const pr = proteinRange(d);
  const w = splitWater(d.water);
  const kcal = toNumber(d.calories);
  const cells = [
    kcal ? `<div><p class="gp-target-val">~${countNum(kcal)}</p><p>calories</p></div>` : "",
    pr ? `<div><p class="gp-target-val">${rangeHTML(pr)} g</p><p>protein</p></div>` : "",
    `<div><p class="gp-target-val">${esc(w.value)}${w.unit ? ` ${esc(w.unit)}` : ""}</p><p>water${w.rest ? ` ${esc(w.rest)}` : ""}, unless advised otherwise</p></div>`,
    `<div><p class="gp-target-val">25–35 g</p><p>fibre a day</p></div>`,
  ].filter(Boolean);
  const groups = DIET_FOOD_GROUPS.slice(0, 4);
  const limit = DIET_FOOD_GROUPS[4];
  return `
    ${pageHead("Food & everyday habits", "Eat enough to nourish your body, even as your appetite changes.")}
    <article class="gp-card gp-card-tint" data-anim="count">
      <h2>Your daily targets</h2>
      <div class="gp-targets">${cells.join("")}</div>
      <p class="gp-measure">${med ? `${esc(med)} reduces appetite, but your body` : "Your body"} still needs adequate protein, vitamins, minerals, fibre, and fluids.</p>
      ${d.note ? `<div class="gp-docnote"><h3>A note from your doctor</h3><div class="gp-prose">${prose(d.note)}</div></div>` : ""}
    </article>
    <div class="gp-grid2">
      <article class="gp-card">
        <h2>Prioritise protein</h2>
        <p>Protein helps preserve muscle and keeps you fuller for longer. Include it with every meal.</p>
        ${pr ? `<p><b>Aim for ${esc(dietProteinRangeText(d, "grams") || rangeText(pr) + " grams")} of protein a day.</b> ${esc(dietProteinBasisText(d))}${dietExampleDayTotal(d) ? ` The example day below gives about ${dietExampleDayTotal(d)} g.` : ""}</p>` : `<p>Your doctor will confirm your daily protein with you.</p>`}
        <p>Choose ${esc(lcFirst(groups[0].foods.replace(/\.$/, "")))}.</p>
      </article>
      ${plateCard(d)}
      ${dayCard(d)}
      <article class="gp-card">
        <h2>If your appetite is low</h2>
        <ul class="gp-list">
          <li><b>Protein first.</b> Start each meal with your protein, in case you fill up quickly.</li>
          <li><b>Don't skip meals.</b> If your appetite is low, have a smaller portion and keep the protein.</li>
          <li><b>Small portions, eaten slowly.</b> Stop when you're comfortably full.</li>
        </ul>
      </article>
      <article class="gp-card">
        <h2>What to limit</h2>
        <p>${esc(limit.foods)}</p>
        <p><b>Go easy on greasy and fried food.</b> ${med ? "It can make nausea worse." : "It adds calories without much nutrition."}</p>
      </article>
      <article class="gp-card gp-span2">
        <h2>High-value foods</h2>
        <p class="gp-measure">High-value foods give your body the most nutrition for the fewest calories.${med ? ` Because ${esc(med)} lowers your appetite, you'll eat less, so every meal needs to count.` : " When you are eating less, every meal needs to count."}</p>
        <ul class="gp-foods">${groups.map((g) => `<li><b>${esc(g.name)}</b><p>${esc(g.foods)}</p></li>`).join("")}</ul>
        <p class="gp-small gp-measure">${esc(DIET_WHY_TEXT)}</p>
      </article>
    </div>
    <article class="gp-card gp-card-beige">
      <h2>Hydration, fibre &amp; movement</h2>
      <div class="gp-habits">
        <div><h3>Water</h3><p>Sip water through the day: ${esc(d.water)}, unless advised otherwise. Avoid sugary drinks.</p></div>
        <div><h3>Fibre</h3><p>25–35 g a day from vegetables, fruit, lentils and whole grains keeps digestion moving and keeps you full for longer.</p></div>
        <div><h3>Movement</h3><p>Walk regularly and do strength exercises 2–3 times a week to protect your muscle.</p></div>
      </div>
    </article>
    ${suppCard(m)}
    ${m.std.food.length ? `<section class="gp-sec"><div class="gp-sec-head"><h2>More guidance</h2></div>${accList(m.std.food, med)}</section>` : ""}`;
}

// ── side effects & safety ────────────────────────────────────────────
function safetyPanel(m) {
  const p = m.plan, info = m.info;
  const reasons = m.isGlp1 ? GLP1_MESSAGE_REASONS : PEPTIDE_MESSAGE_REASONS;
  const { items: urgent, extra: urgentExtra } = urgentFor(m);
  const warnings = String(p.warnings || "").trim();
  return `
    ${pageHead("Side effects & when to seek help", "Keep this section easy to find if you feel unwell.")}
    <div class="gp-grid2">
      <article class="gp-card">
        <h2>Common side effects</h2>
        ${info.commonSideEffects ? `<p>Common effects include ${esc(lcFirst(info.commonSideEffects.replace(/\.$/, "")))}.</p>` : ""}
        ${m.std.effects ? `<div class="gp-prose">${prose(m.std.effects.body)}</div>` : m.isGlp1 ? `<p>If nauseated, eat smaller meals, avoid greasy or heavy foods, eat slowly, and maintain hydration.</p>` : ""}
        <p>Message your doctor if symptoms persist or interfere with normal ${m.isGlp1 ? "eating or drinking" : "daily activity"}.</p>
      </article>
      <article class="gp-card gp-card-beige">
        <h2>Message your doctor</h2>
        <p>Contact ${esc(m.doctor)} for ${esc(commaList(reasons, "or"))}.</p>
        <p>${m.appName ? `If you have the ${esc(m.appName)}, you can message us there.` : "You're welcome to message your doctor directly with any questions."}</p>
      </article>
    </div>
    ${urgent.length ? `
    <article class="gp-card gp-card-rose">
      <h2>Seek urgent medical attention</h2>
      <p>Get urgent medical help for any of the following:</p>
      <ul class="gp-list gp-list-alert">${urgent.map((u) => `<li>${inline(u)}</li>`).join("")}</ul>
      ${urgentExtra ? `<div class="gp-prose">${prose(urgentExtra)}</div>` : ""}
      <p class="gp-rose-foot">If you need urgent medical help, contact your nearest emergency service.</p>
    </article>` : ""}
    ${m.std.notes || warnings ? `
    <div class="gp-grid2">
      ${m.std.notes ? `<article class="gp-card"><h2>Important safety notes</h2><div class="gp-prose">${prose(m.std.notes.body)}</div></article>` : ""}
      ${warnings ? `<article class="gp-card"><h2>From your doctor</h2><div class="gp-prose">${prose(warnings)}</div></article>` : ""}
    </div>` : ""}`;
}

// ── follow-up & support ──────────────────────────────────────────────
function timelineHTML(text) {
  const out = [];
  let items = [];
  const flush = () => { if (items.length) { out.push(`<ol class="gp-timeline">${items.join("")}</ol>`); items = []; } };
  for (const raw of String(text || "").split("\n")) {
    const l = raw.trim();
    if (!l) { flush(); continue; }
    if (/\[insert [^\]]*\]/i.test(l)) continue; // an unfilled placeholder in the master document
    const b = l.match(/^(?:•\s*|[-–]\s+)(.+)$/u);
    if (b) {
      const mm = b[1].match(/^([^:]{2,40}):\s+(.+)$/);
      items.push(`<li>${mm ? `<b>${inline(mm[1])}</b><span>${inline(mm[2])}</span>` : `<span>${inline(b[1])}</span>`}</li>`);
    } else { flush(); out.push(`<p>${inline(l.replace(EMOJI_LEAD, ""))}</p>`); }
  }
  flush();
  return out.join("");
}

function followupPanel(m) {
  const visit = m.kind === "visit";
  const w = followWindow(nextFollowupOf(m));
  const care = CUSTOMER_CARE;
  const connect = m.appName ? `
    <div class="gp-grid2">
      <article class="gp-card"><h2>If you have the app</h2><p>With the ${esc(m.appName)} installed and subscribed, you can access everything — messaging, follow-ups, refills, and progress tracking — right there in the app.</p></article>
      <article class="gp-card"><h2>If you don't have the app</h2><p>Don't worry — we'll send you a link whenever you need to book or purchase something, and you can rebook at any time.</p><p>${esc(care)}</p></article>
    </div>` : `
    <article class="gp-card">
      <h2>Staying connected with us</h2>
      <p class="gp-measure">You're welcome to message your doctor directly with any questions, request a follow-up or refill, and share how you're progressing. Whenever you need to book or purchase something, we'll send you a link — you can arrange this whenever suits you.</p>
      <p class="gp-measure">${esc(care)}</p>
    </article>`;
  return `
    ${pageHead("Follow-up & support", visit ? "Stay connected through your next check-in." : "Stay connected through your next check-in and refill.")}
    <article class="gp-card gp-card-tint gp-fu">
      <p class="gp-label">${visit ? "Next follow-up" : "Next follow-up &amp; medication refill"}</p>
      <h2 class="gp-fu-date">${w ? (w.past ? "Due now" : `${esc(w.range)} ${w.year}`) : "To be arranged"}</h2>
      <p class="gp-measure">${w && w.past ? "Your follow-up is due. Please get in touch so we can arrange it." : esc(arrangeText(m))} Until then, ${esc(untilList(m))}.</p>
      ${visit ? "" : `<div class="gp-fu-actions"><button type="button" class="gp-btn gp-btn-dark" data-refill></button><p class="gp-small">Tell us how you're getting on. Your doctor reviews every request before anything changes.</p></div>`}
    </article>
    ${labsCard(m)}
    ${connect}
    ${m.std.followup ? `<article class="gp-card"><h2>Your follow-up plan</h2><div class="gp-prose gp-measure">${timelineHTML(m.std.followup.body)}</div></article>` : ""}
    <article class="gp-card gp-card-beige gp-letter">
      ${visit
        ? `<h2>Prepared and signed by</h2>`
        : `<h2>A message from your doctor</h2>
          <p class="gp-measure">${esc(closingMessage(m))}</p>`}
      ${signatureHTML(m, "")}
    </article>`;
}

// ── page shell ───────────────────────────────────────────────────────
function shellHTML(m) {
  const tabs = tabsFor(m);
  G.tabs = tabs;
  const logo = m.signer.logoUrl || (m.clinic && m.clinic.logoUrl) || "";
  const clinicName = m.signer.clinic || (m.clinic && m.clinic.name) || "";
  const who = `${m.patient.title ? m.patient.title + " " : ""}${m.patient.name || ""}`.trim();
  const plans = G.data.plans || [];
  const pdfUrl = `/api/guide/${encodeURIComponent(TOKEN)}/pdf`;
  const panels = {
    overview: () => overviewPanel(m),
    medication: () => medicationPanel(m),
    food: () => foodPanel(m),
    safety: () => safetyPanel(m),
    followup: () => followupPanel(m),
  };
  const switcher = m.kind === "plan" && plans.length > 1 ? `
    <div class="gp-wrap gp-plans" role="group" aria-label="Your medications">
      <span class="gp-plans-label">${plans.length} medications in your program</span>
      ${plans.map((pl) => { const on = pl.id === m.plan.id; return `<button type="button" class="gp-plan${on ? " on" : ""}" data-plan="${pl.id}" aria-pressed="${on}" style="--mc:${medColor(pl)}"><span class="gp-plan-dot" aria-hidden="true"></span>${esc(pl.medication)}${pl.dose ? ` · ${esc(pl.dose)}` : ""}</button>`; }).join("")}
    </div>` : "";
  return `
    <header class="gp-top"><div class="gp-wrap gp-top-in">
      <a class="gp-brand" href="#overview" data-tab-link>
        ${logo ? `<img class="gp-logo" src="${esc(logo)}" alt="${esc(clinicName || "Clinic")}" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ""}
        <span class="gp-wordmark"${logo ? " hidden" : ""}>${esc(clinicName || "Your clinic")}</span>
        <span class="gp-brand-sub">${m.kind === "visit" ? "Personal health plan" : "Personal treatment guide"}</span>
      </a>
      <p class="gp-who"><b>${esc(who)}</b><span>Care from ${esc(m.doctor)}</span></p>
    </div></header>
    <nav class="gp-nav" aria-label="Guide sections"><div class="gp-wrap gp-nav-in">
      <div class="gp-tabs-scroll"><div class="gp-tabs">
        ${tabs.map((t) => `<a class="gp-tab" href="#${t}" data-tab="${t}" data-tab-link>${esc(TAB_META[t].label)}</a>`).join("")}
        <div class="gp-tabs-hl" aria-hidden="true">${tabs.map((t) => `<span class="gp-tab">${esc(TAB_META[t].label)}</span>`).join("")}</div>
      </div></div>
      <a class="gp-print" href="${pdfUrl}" download aria-label="Save as PDF">${icon("file", 16)}<span>Save as PDF</span></a>
    </div></nav>
    ${switcher}
    <main class="gp-main gp-wrap" id="gp-main">
      ${tabs.map((t) => `<section class="gp-panel gp-panel-${t}" data-panel="${t}" aria-label="${esc(TAB_META[t].label)}" hidden>${panels[t]()}</section>`).join("")}
    </main>
    <footer class="gp-foot"><div class="gp-wrap gp-foot-in">
      <div class="gp-foot-brand"><b>${esc(clinicName || "Your clinic")}</b><span>Issued ${esc(fmtDate(m.created))}</span></div>
      <p>If you have any questions about your ${m.kind === "visit" ? "plan" : "treatment"}, please contact ${esc(clinicName || m.doctor)} directly. If you need urgent medical help, contact your nearest emergency service.</p>
      <a class="gp-chip-btn" href="${pdfUrl}" download>${icon("file", 15)} Save as PDF</a>
    </div></footer>
    <nav class="gp-bnav" aria-label="Guide sections">
      ${tabs.map((t) => `<a href="#${t}" data-tab="${t}" data-tab-link><span class="gp-bn-ico">${icon(TAB_META[t].icon, 21)}</span><span>${esc(TAB_META[t].short)}</span></a>`).join("")}
    </nav>`;
}

// ── behaviour ────────────────────────────────────────────────────────
function tabFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  return G.tabs.includes(h) ? h : "overview";
}

// The active tab is a pine pill: a second copy of the labels in white,
// clipped to the active tab's box, so the highlight slides between tabs and
// the text colour changes exactly where the pill is.
function moveHighlight() {
  const tabs = document.querySelector(".gp-tabs");
  const on = tabs && tabs.querySelector(".gp-tab.on");
  const hl = tabs && tabs.querySelector(".gp-tabs-hl");
  if (!on || !hl || !tabs.clientWidth) return; // hidden on phones: placed on the next resize
  const W = tabs.clientWidth, H = tabs.clientHeight;
  hl.style.clipPath = `inset(${on.offsetTop}px ${W - on.offsetLeft - on.offsetWidth}px ${H - on.offsetTop - on.offsetHeight}px ${on.offsetLeft}px round 999px)`;
  const scroller = tabs.parentElement;
  if (scroller.scrollWidth > scroller.clientWidth) {
    scroller.scrollTo({ left: on.offsetLeft - (scroller.clientWidth - on.offsetWidth) / 2, behavior: REDUCED.matches ? "auto" : "smooth" });
  }
}

function setTab(id, opts = {}) {
  G.tab = id;
  document.querySelectorAll(".gp-panel").forEach((p) => { p.hidden = p.dataset.panel !== id; });
  document.querySelectorAll("[data-tab]").forEach((a) => {
    const on = a.dataset.tab === id;
    a.classList.toggle("on", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  moveHighlight();
  const panel = document.querySelector(`.gp-panel[data-panel="${id}"]`);
  if (!panel) return;
  panel.classList.remove("gp-enter");
  void panel.offsetWidth;
  panel.classList.add("gp-enter");
  if (!opts.initial) {
    const main = document.getElementById("gp-main");
    const nav = document.querySelector(".gp-nav");
    const offset = nav && getComputedStyle(nav).display !== "none" ? nav.offsetHeight : 0;
    const top = main.getBoundingClientRect().top + window.scrollY - offset - 8;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "auto" });
  }
  if (G.focusNext) {
    G.focusNext = false;
    const h = panel.querySelector("h1");
    if (h) h.focus({ preventScroll: true });
  }
}

function countUp(el) {
  const to = Number(el.dataset.to);
  const t0 = performance.now(), dur = 1200;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = k >= 1 ? 1 : 1 - Math.pow(2, -10 * k);
    el.textContent = Math.round(to * e).toLocaleString("en-US");
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function runAnim(el) {
  el.classList.remove("gp-pre");
  el.querySelectorAll(".gp-count").forEach(countUp);
}

// Data pieces draw themselves the first time they come into view. Under
// reduced motion, and for printing, they are simply shown finished.
function armAnimations(root) {
  if (G.io) G.io.disconnect();
  const els = [...root.querySelectorAll("[data-anim]")];
  if (REDUCED.matches || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.querySelectorAll(".gp-count").forEach((c) => { c.textContent = Number(c.dataset.to).toLocaleString("en-US"); }));
    return;
  }
  els.forEach((el) => el.classList.add("gp-pre"));
  G.io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      G.io.unobserve(en.target);
      runAnim(en.target);
    });
  }, { threshold: 0, rootMargin: "0px 0px -14% 0px" });
  els.forEach((el) => G.io.observe(el));
}

function finishAnimations() {
  document.querySelectorAll(".gp-pre").forEach((el) => el.classList.remove("gp-pre"));
  document.querySelectorAll(".gp-count").forEach((c) => { c.textContent = Number(c.dataset.to).toLocaleString("en-US"); });
}

// Printing the page itself (Ctrl+P) carries every section in full, so closed
// sections open for the print and close again afterwards. Save as PDF doesn't
// print: it downloads the PDF the server builds, with no web address in it.
let printOpened = [];
function beforePrint() {
  finishAnimations();
  const closed = [...document.querySelectorAll(".gp-root details:not([open])")];
  closed.forEach((d) => { d.open = true; });
  printOpened.push(...closed);
}
function afterPrint() {
  printOpened.forEach((d) => { d.open = false; });
  printOpened = [];
}

// Plate: hovering, focusing or tapping a portion lights up its share of the
// plate and names it in the middle; tapping again lets go.
function wirePlate(root) {
  root.querySelectorAll(".gp-plate").forEach((plate) => {
    const rows = [...plate.querySelectorAll("[data-seg]")];
    const segs = [...plate.querySelectorAll(".gp-seg")];
    const center = plate.querySelector(".gp-donut-center");
    let locked = null;
    const show = (k) => {
      plate.classList.toggle("gp-focus", !!k);
      segs.forEach((s) => s.classList.toggle("on", s.dataset.k === k));
      rows.forEach((r) => { r.classList.toggle("on", r.dataset.seg === k); r.setAttribute("aria-pressed", String(r.dataset.seg === locked)); });
      const row = rows.find((r) => r.dataset.seg === k);
      center.innerHTML = row ? `<b>${esc(row.dataset.value)}</b><span>${esc(row.dataset.name)}</span>` : `<b>Your plate</b><span>Tap a portion</span>`;
    };
    const hover = (k) => (e) => { if (e.pointerType === "mouse") show(k); };
    const leave = (e) => { if (e.pointerType === "mouse") show(locked); };
    rows.forEach((r) => {
      r.addEventListener("pointerenter", hover(r.dataset.seg));
      r.addEventListener("pointerleave", leave);
      r.addEventListener("click", () => { locked = locked === r.dataset.seg ? null : r.dataset.seg; show(locked); });
    });
    segs.forEach((s) => {
      s.addEventListener("pointerenter", hover(s.dataset.k));
      s.addEventListener("pointerleave", leave);
      s.addEventListener("click", () => { locked = locked === s.dataset.k ? null : s.dataset.k; show(locked); });
    });
  });
}

// Example day: a meal and its slice of the day's protein light up together.
function wireDay(root) {
  root.querySelectorAll(".gp-day").forEach((day) => {
    const bits = [...day.querySelectorAll("[data-k]")];
    const show = (k) => { day.classList.toggle("gp-focus", k != null); bits.forEach((b) => b.classList.toggle("on", b.dataset.k === k)); };
    day.querySelectorAll(".gp-meals > li").forEach((li) => {
      li.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(li.dataset.k); });
      li.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") show(null); });
      li.addEventListener("focus", () => show(li.dataset.k));
      li.addEventListener("blur", () => show(null));
    });
  });
}

function paintRefill() {
  const plan = G.model && G.model.plan;
  if (!plan) return;
  document.querySelectorAll("[data-refill]").forEach((b) => {
    const compact = b.classList.contains("gp-btn-light");
    if (plan.needs_refill) {
      b.disabled = true;
      b.innerHTML = `${icon("checkCircle", 17)} ${compact ? "Refill request sent" : "Refill request sent — awaiting your doctor"}`;
    } else {
      b.disabled = false;
      b.innerHTML = compact ? "Request a refill" : "Request a refill or update";
    }
  });
}

function wire(root) {
  root.querySelectorAll("[data-tab-link]").forEach((a) => a.addEventListener("click", () => { G.focusNext = true; }));
  root.querySelectorAll("[data-plan]").forEach((b) => b.addEventListener("click", () => {
    const plan = (G.data.plans || []).find((pl) => pl.id === Number(b.dataset.plan));
    if (!plan || plan.id === G.model.plan.id) return;
    G.model = planModel(plan, G.data.patient, G.data.clinic);
    render(root);
    setTab(G.tabs.includes(G.tab) ? G.tab : "overview", { initial: true });
  }));
  root.querySelectorAll("[data-refill]").forEach((b) => b.addEventListener("click", () => {
    const plan = G.model.plan;
    openRefillRequestModal(plan, async (payload) => {
      await api("POST", `/api/guide/${encodeURIComponent(TOKEN)}/plans/${plan.id}/refill-request`, payload);
      plan.needs_refill = true;
      paintRefill();
    });
  }));
  paintRefill();
  wirePlate(root);
  wireDay(root);
  armAnimations(root);
  const stage = root.querySelector(".gp-stage");
  if (stage && typeof GuideScene !== "undefined") G.scene = GuideScene.mount(stage);
}

function render(root) {
  if (G.scene) { G.scene.destroy(); G.scene = null; }
  root.innerHTML = shellHTML(G.model);
  document.body.classList.toggle("gp-has-plans", !!root.querySelector(".gp-plans"));
  wire(root);
}

function showState(root, title, text) {
  root.innerHTML = `
    <main class="gp-state">
      <span class="gp-state-ico">${icon("alert", 28)}</span>
      <h1>${esc(title)}</h1>
      <p>${esc(text)}</p>
    </main>`;
}

(async function boot() {
  const root = document.getElementById("gp");
  injectGuideCss(); // the refill sheet's styles
  let data;
  try {
    data = await api("GET", `/api/guide/${encodeURIComponent(TOKEN)}`);
  } catch (e) {
    return showState(root, "This guide isn't available", e.message || "Please ask your clinic to send you a new link.");
  }
  G.data = data;
  const { patient, clinic, plans, visit } = data;
  document.title = `Your ${visit ? "health plan" : "treatment guide"}${clinic.name ? " — " + clinic.name : ""}`;
  if (clinic.logoUrl) {
    const fav = document.createElement("link");
    fav.rel = "icon"; fav.href = clinic.logoUrl;
    document.head.appendChild(fav);
  }
  if (visit) G.model = visitModel(visit, patient, clinic);
  else {
    S.medColors = medColorMap(plans);
    G.model = planModel(plans[0], patient, clinic);
  }
  render(root);
  setTab(tabFromHash(), { initial: true });
  window.addEventListener("hashchange", () => setTab(tabFromHash()));
  window.addEventListener("resize", () => moveHighlight());
  window.addEventListener("beforeprint", beforePrint);
  window.addEventListener("afterprint", afterPrint);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveHighlight);
})();
