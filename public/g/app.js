// Public patient guide page (/g/<token>) — the guide a doctor sends over
// WhatsApp. No sign-in: the unguessable token in the URL is the credential.
// It renders the same guide, with the same tap-to-expand sections, that the
// doctor sees on the patient's Guide tab.
"use strict";

// guide.js and shared.js read a global `S` for per-medication colours.
const S = { medColors: {} };
let activePlan = null; // tracked across picker-chip clicks, for the refill button

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
  activePlan = primary;
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
    <div id="g-active-guide">${renderOne(primary)}</div>
    <div style="margin-top:18px">
      <button class="btn btn-secondary btn-block" id="gp-refill" type="button"></button>
    </div>`;

  wireGuidePicker(root, plans, renderOne, primary.id);
  // Track which plan is active so the refill button always targets the one
  // the patient is currently reading, not always the first.
  root.querySelectorAll("[data-gpick]").forEach((b) => b.addEventListener("click", () => {
    activePlan = plans.find((pl) => pl.id === Number(b.dataset.gpick)) || activePlan;
    renderRefillButton();
  }));

  function renderRefillButton() {
    const btn = document.getElementById("gp-refill");
    if (!btn) return;
    if (activePlan.needs_refill) {
      btn.disabled = true;
      btn.innerHTML = `${icon("checkCircle", 15)} Refill request sent — awaiting your doctor`;
    } else {
      btn.disabled = false;
      btn.innerHTML = `${icon("syringe", 15)} Request a refill / update`;
    }
  }
  renderRefillButton();
  document.getElementById("gp-refill").addEventListener("click", () => {
    openRefillRequestModal(activePlan, async (payload) => {
      await api("POST", `/api/guide/${encodeURIComponent(token)}/plans/${activePlan.id}/refill-request`, payload);
      activePlan.needs_refill = true;
      renderRefillButton();
    });
  });

  const toggle = document.getElementById("gp-toggle");
  toggle.addEventListener("click", () => {
    const all = [...root.querySelectorAll("details.g-acc")];
    const open = all.some((d) => !d.open);
    all.forEach((d) => { d.open = open; });
    toggle.textContent = open ? "Collapse all" : "Expand all";
  });
  document.getElementById("gp-print").addEventListener("click", () => window.print());
})();
