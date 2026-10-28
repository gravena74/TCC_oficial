import { api, resolveAssetUrl } from "./api.js";
import { requireAuth } from "./guard.js";
import { formatCents, formatDateLong } from "./format.js";
import { escapeHtml } from "./html.js";
import { PAYMENT_LABELS } from "./packages-format.js";

const STATUS_LABEL = {
  em_analise: { text: "Em análise", className: "status-badge--em_analise" },
  agendado: { text: "Agendado", className: "status-badge--agendado" },
  concluido: { text: "Concluído", className: "status-badge--concluido" },
  cancelado: { text: "Cancelado", className: "status-badge--cancelado" },
  recusado: { text: "Recusado", className: "status-badge--recusado" },
};

const CANCELABLE_STATUSES = ["agendado", "em_analise"];

const user = await requireAuth();
if (user) {
  document.getElementById("authLoading").style.display = "none";
  document.getElementById("screen").style.display = "flex";
  init();
}

function init() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("justBooked")) {
    document.getElementById("justBookedBanner").style.display = "block";
  }

  const loadingMsg = document.getElementById("loadingMsg");
  const emptyState = document.getElementById("emptyState");
  const listEl = document.getElementById("appointmentList");

  function load() {
    document.getElementById("appointmentError").hidden = true;
    loadingMsg.style.display = "block";
    api
      .getAppointments()
      .then(({ appointments }) => render(appointments))
      .catch((error) => { const errorEl = document.getElementById("appointmentError"); errorEl.textContent = error.message; errorEl.hidden = false; })
      .finally(() => {
        loadingMsg.style.display = "none";
      });
  }

  function render(appointments) {
    emptyState.style.display = appointments.length === 0 ? "flex" : "none";
    listEl.innerHTML = "";

    for (const a of appointments) {
      const status = STATUS_LABEL[a.status] || STATUS_LABEL.agendado;
      const photo = a.pet_photo
        ? `<img src="${escapeHtml(resolveAssetUrl(a.pet_photo))}" alt="${escapeHtml(a.pet_name)}">`
        : `<span class="material-symbols-rounded" aria-hidden="true">pets</span>`;

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="appointment-card__top">
          <div class="appointment-card__pet">
            <div class="appointment-card__photo">${photo}</div>
            <div>
              <p class="appointment-card__name">${escapeHtml(a.pet_name)}</p>
              <p class="appointment-card__meta">${escapeHtml(a.service_name)} · ${formatDateLong(a.date)} às ${escapeHtml(a.time)}</p>
              <p class="appointment-card__meta">${a.customer_package_id ? "Banho incluído no pacote · " : ""}${a.payment_method ? `Pagamento na loja: ${PAYMENT_LABELS[a.payment_method]}` : a.customer_package_id && a.total_cents === 0 ? "Sem valor adicional previsto" : ""}</p>
            </div>
          </div>
          <span class="status-badge ${status.className}">${status.text}</span>
        </div>
        <div class="appointment-card__bottom">
          <span class="appointment-card__price">Estimativa: ${formatCents(a.total_cents)}</span>
          ${CANCELABLE_STATUSES.includes(a.status) ? `<button type="button" class="btn-link" style="font-size: 0.75rem;">Cancelar</button>` : ""}
        </div>
      `;

      if (CANCELABLE_STATUSES.includes(a.status)) {
        card.querySelector(".btn-link").addEventListener("click", async (event) => {
          const button = event.currentTarget;
          if (!window.confirm("Cancelar este agendamento? Se houver crédito de pacote reservado, ele será liberado dentro da validade.")) return;
          button.disabled = true;
          try { await api.cancelAppointment(a.id); load(); }
          catch (error) { alert(error.message); button.disabled = false; }
        });
      }

      listEl.appendChild(card);
    }
  }

  load();
}
