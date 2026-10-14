// Dedicated refill-request page (/r/<token>) — a separate shareable link
// from the full treatment guide (/g/<token>), so a patient can be sent
// straight to "request a refill" on its own. No sign-in: the unguessable
// token in the URL is the credential. Mirrors g/app.js's branded shell but
// renders the refill form (from guide.js) instead of the full guide.
"use strict";

// guide.js and shared.js read a global `S` for per-medication colours.
const S = { medColors: {} };

(async function boot() {
  const root = document.getElementById("rp");
  const token = location.pathname.split("/").filter(Boolean)[1] || "";

  const showState = (ico, title, text) => {
    root.innerHTML = `<div class="rp-state">${icon(ico, 40)}<h1>${esc(title)}</h1><p>${esc(text)}</p></div>`;
  };

  let data;
  try {
    data = await api("GET", `/api/refill/${encodeURIComponent(token)}`);
  } catch (e) {
    return showState("alert", "This link isn't available", e.message || "Please ask your clinic to send you a new link.");
  }

  const { patient, clinic, plans } = data;
  document.title = `Request a refill${clinic.name ? " — " + clinic.name : ""}`;
  if (clinic.logoUrl) {
    const fav = document.createElement("link");
    fav.rel = "icon"; fav.href = clinic.logoUrl;
    document.head.appendChild(fav);
  }
  S.medColors = medColorMap(plans);

  const headerHTML = () => `
    <div class="guide" style="margin-bottom:16px">
      <div class="g-head">
        <div class="g-brand">
          ${clinic.logoUrl
            ? `<span class="g-logo-chip"><img src="${esc(clinic.logoUrl)}" alt="${esc(clinic.name || "Clinic logo")}"></span>`
            : `<span class="g-logo">${icon("syringe", 20)}</span>`}
          <div>
            <div class="g-brand-name">${esc(clinic.name || "Your clinic")}</div>
            <div class="g-brand-sub">Refill request</div>
          </div>
        </div>
      </div>
    </div>`;

  if (!plans.length) {
    root.innerHTML = headerHTML() + `
      <div class="rp-state">${icon("syringe", 40)}<h1>Nothing to refill right now</h1><p>You don't have an active program at the moment. Please contact your clinic directly.</p></div>`;
    return;
  }

  function renderPicker() {
    const firstName = String(patient.name || "").trim().split(/\s+/)[0] || "there";
    root.innerHTML = headerHTML() + `
      <p class="rp-intro">Hi ${esc(firstName)}, which medication would you like to request a refill for?</p>
      <div class="rp-plancards">
        ${plans.map((p) => `
          <button type="button" class="rp-plancard" data-pick="${p.id}" style="--mc:${medColor(p)}">
            <span class="rp-plancard-ico">${medFormIcon(p, 22)}</span>
            <span class="rp-plancard-info">
              <span class="rp-plancard-name">${esc(p.medication)}</span>
              <span class="rp-plancard-dose">${esc(p.dose || "")}${p.dose && p.frequency ? " · " : ""}${esc(p.frequency || "")}</span>
            </span>
            ${icon("chevR", 18)}
          </button>`).join("")}
      </div>`;
    root.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
      const pl = plans.find((x) => x.id === Number(b.dataset.pick));
      if (pl) renderForm(pl);
    }));
  }

  function renderForm(plan) {
    root.innerHTML = headerHTML() +
      (plans.length > 1 ? `<button type="button" class="linklike rp-back" id="rp-back">${icon("back", 14)} Choose a different medication</button>` : "") +
      `<div class="card card-pad">
        <div class="rp-card-head">
          <span class="rp-plancard-ico" style="--mc:${medColor(plan)}">${medFormIcon(plan, 22)}</span>
          <div>
            <div class="rp-card-med">${esc(plan.medication)}</div>
            <div class="rp-card-dose">${esc(plan.dose || "")}${plan.dose && plan.frequency ? " · " : ""}${esc(plan.frequency || "")}</div>
          </div>
        </div>
        ${plan.needs_refill ? `
        <div class="g-callout g-teal" style="margin-top:14px">${icon("checkCircle", 18)}<div>You already have a refill request in for this medication — your doctor will confirm the next step.</div></div>`
        : `
        <div style="margin-top:16px">${refillRequestFieldsHTML(plan)}</div>
        <button class="btn btn-primary btn-block" id="rp-submit" type="button" style="margin-top:4px">Send request</button>
        <p class="hint" style="margin-top:10px;text-align:center">Your doctor will review this and confirm the next step.</p>`}
      </div>`;

    const backBtn = document.getElementById("rp-back");
    if (backBtn) backBtn.addEventListener("click", renderPicker);
    if (plan.needs_refill) return;

    wireRefillRequestFields(root);
    document.getElementById("rp-submit").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const payload = readRefillRequestFields(root);
      btn.disabled = true; btn.textContent = "Sending…";
      try {
        await api("POST", `/api/refill/${encodeURIComponent(token)}/plans/${plan.id}/refill-request`, payload);
        root.innerHTML = headerHTML() + `
          <div class="rp-state">${icon("checkCircle", 40)}<h1>Request sent</h1><p>Your doctor will review this and confirm the next step. You're welcome to close this page.</p></div>`;
      } catch (ex) {
        btn.disabled = false; btn.textContent = "Send request";
        toast((ex && ex.message) || "Could not send your request", "bad");
      }
    });
  }

  if (plans.length === 1) renderForm(plans[0]);
  else renderPicker();
})();
