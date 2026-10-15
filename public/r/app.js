// Dedicated refill-request page (/r/<token>) — a separate shareable link
// from the full treatment guide (/g/<token>), so a patient can be sent
// straight to "request a refill" on its own. No sign-in: the unguessable
// token in the URL is the credential. The form itself (fields, choice cards,
// explanations) comes from guide.js, shared with the portal and guide link.
"use strict";

// guide.js and shared.js read a global `S` for per-medication colours.
const S = { medColors: {} };

(async function boot() {
  const root = document.getElementById("rp");
  const token = location.pathname.split("/").filter(Boolean)[1] || "";
  injectGuideCss();

  let clinic = null;
  let data;
  try {
    data = await api("GET", `/api/refill/${encodeURIComponent(token)}`);
  } catch (e) {
    root.innerHTML = stateHTML("alert", "This link isn't available", e.message || "Please ask your clinic to send you a new link.");
    return;
  }

  const { patient, plans } = data;
  clinic = data.clinic;
  const firstName = String(patient.name || "").trim().split(/\s+/)[0] || "there";
  document.title = `Request a refill${clinic.name ? " — " + clinic.name : ""}`;
  if (clinic.logoUrl) {
    const fav = document.createElement("link");
    fav.rel = "icon"; fav.href = clinic.logoUrl;
    document.head.appendChild(fav);
  }
  S.medColors = medColorMap(plans);

  function topHTML() {
    return `
    <header class="rp-top">
      ${clinic.logoUrl
        ? `<img class="rp-logo" src="${esc(clinic.logoUrl)}" alt="${esc(clinic.name || "Clinic logo")}">`
        : `<span class="rp-clinic">${esc(clinic.name || "Your clinic")}</span>`}
      <span class="rp-private">${icon("shield", 14)} Private link</span>
    </header>`;
  }

  function stateHTML(ico, title, text, small) {
    return `${clinic ? topHTML() : ""}
      <div class="rp-state">
        <div class="rp-state-ico">${icon(ico, 30)}</div>
        <h1>${esc(title)}</h1>
        <p>${esc(text)}</p>
        ${small ? `<p>${esc(small)}</p>` : ""}
      </div>`;
  }

  const doseLine = (p) => [p.dose, p.frequency].filter(Boolean).map(esc).join(" · ");

  if (!plans.length) {
    root.innerHTML = stateHTML("syringe", "Nothing to refill right now", "You don't have an active program at the moment. Please contact your clinic directly.");
    return;
  }

  function renderPicker() {
    root.innerHTML = `${topHTML()}
      <h1 class="rp-title">Request a refill</h1>
      <p class="rp-sub">Hi ${esc(firstName)}, which medication is this for?</p>
      <div class="rp-plans">
        ${plans.map((p) => `
          <button type="button" class="rp-plan" data-pick="${p.id}" style="--mc:${medColor(p)}">
            <span class="rp-med-ico">${medFormIcon(p, 22)}</span>
            <span class="rp-plan-info">
              <span class="rp-med-name">${esc(p.medication)}</span>
              <span class="rp-med-dose">${doseLine(p)}</span>
              ${p.needs_refill ? `<span class="rp-pending">${icon("checkCircle", 13)} Request already sent</span>` : ""}
            </span>
            ${icon("chevR", 18)}
          </button>`).join("")}
      </div>`;
    root.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
      const pl = plans.find((x) => x.id === Number(b.dataset.pick));
      if (pl) { renderForm(pl); window.scrollTo(0, 0); }
    }));
  }

  function renderForm(plan) {
    const medCard = `
      <div class="rp-med" style="--mc:${medColor(plan)}">
        <span class="rp-med-ico">${medFormIcon(plan, 22)}</span>
        <div><div class="rp-med-name">${esc(plan.medication)}</div><div class="rp-med-dose">${doseLine(plan)}</div></div>
        ${plans.length > 1 ? `<button type="button" class="rp-switch" id="rp-back">Change</button>` : ""}
      </div>`;

    if (plan.needs_refill) {
      root.innerHTML = `${topHTML()}${medCard}
        <div class="rp-state">
          <div class="rp-state-ico">${icon("checkCircle", 30)}</div>
          <h1>Request already sent</h1>
          <p>We've received your refill request for ${esc(plan.medication)}. Your doctor will review it and confirm your next step.</p>
        </div>`;
    } else {
      root.innerHTML = `${topHTML()}
        <h1 class="rp-title">Request a refill</h1>
        <p class="rp-sub">Hi ${esc(firstName)}, a few quick questions so your doctor can prepare your next refill. It takes about a minute.</p>
        ${medCard}
        <div class="rp-form rr-form">${refillRequestFieldsHTML(plan)}</div>
        <div class="rp-cta">
          <button class="btn btn-primary btn-block" id="rp-submit" type="button">Send request</button>
          <p>Your doctor reviews every request before anything changes.</p>
        </div>`;
    }

    const back = document.getElementById("rp-back");
    if (back) back.addEventListener("click", () => { renderPicker(); window.scrollTo(0, 0); });
    if (plan.needs_refill) return;

    wireRefillRequestFields(root);
    document.getElementById("rp-submit").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      if (!checkRefillRequestFields(root)) return;
      const payload = readRefillRequestFields(root);
      btn.disabled = true; btn.textContent = "Sending…";
      try {
        await api("POST", `/api/refill/${encodeURIComponent(token)}/plans/${plan.id}/refill-request`, payload);
        plan.needs_refill = true;
        root.innerHTML = stateHTML("checkCircle", "Request sent",
          `Thank you, ${firstName}. Your doctor will review your answers and confirm your next step with you.`,
          "You can close this page.");
        window.scrollTo(0, 0);
      } catch (ex) {
        btn.disabled = false; btn.textContent = "Send request";
        toast((ex && ex.message) || "Could not send your request", "bad");
      }
    });
  }

  if (plans.length === 1) renderForm(plans[0]);
  else renderPicker();
})();
