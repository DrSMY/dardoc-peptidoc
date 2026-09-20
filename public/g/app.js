// Public patient guide page (/g/<token>) — the guide a doctor sends over
// WhatsApp. No sign-in: the unguessable token in the URL is the credential.
// It renders the same guide, with the same tap-to-expand sections, that the
// doctor sees on the patient's Guide tab.
"use strict";

// guide.js and shared.js read a global `S` for per-medication colours.
const S = { medColors: {} };

(async function boot() {
  const root = document.getElementById("gp");
  const token = location.pathname.split("/").filter(Boolean)[1] || "";
  injectGuideCss();

  const showState = (ico, title, text) => {
    root.innerHTML = `<div class="gp-state">${icon(ico, 40)}<h1>${esc(title)}</h1><p>${esc(text)}</p></div>`;
  };

  let data;
  try {
    data = await api("GET", `/api/guide/${encodeURIComponent(token)}`);
  } catch (e) {
    return showState("alert", "This guide isn't available", e.message || "Please ask your clinic to send you a new link.");
  }

  const { patient, clinic, plans } = data;
  document.title = `Your treatment guide${clinic.name ? " — " + clinic.name : ""}`;
  if (clinic.logoUrl) {
    const fav = document.createElement("link");
    fav.rel = "icon"; fav.href = clinic.logoUrl;
    document.head.appendChild(fav);
  }

  S.medColors = medColorMap(plans);
  const primary = plans[0];
  const renderOne = (plan) => buildGuide(plan, patient, plan.signedBy && plan.signedBy.name, { shared: true });

  root.innerHTML = `
    <div class="gp-bar">
      <div class="gp-bar-l">${plans.length > 1 ? `${plans.length} medications in your program` : "Tap any section to read more"}</div>
      <div class="gp-bar-r">
        <button class="btn btn-secondary btn-sm" id="gp-toggle" type="button">Expand all</button>
        <button class="btn btn-secondary btn-sm" id="gp-print" type="button">${icon("printer", 15)} Save as PDF</button>
      </div>
    </div>
    ${guidePickerHTML(plans, primary.id)}
    <div id="g-active-guide">${renderOne(primary)}</div>`;

  wireGuidePicker(root, plans, renderOne, primary.id);

  const toggle = document.getElementById("gp-toggle");
  toggle.addEventListener("click", () => {
    const all = [...root.querySelectorAll("details.g-acc")];
    const open = all.some((d) => !d.open);
    all.forEach((d) => { d.open = open; });
    toggle.textContent = open ? "Collapse all" : "Expand all";
  });
  document.getElementById("gp-print").addEventListener("click", () => window.print());
})();
