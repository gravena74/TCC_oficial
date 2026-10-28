import { escapeHtml } from "../../js/html.js";
import { resolveAssetUrl } from "../../js/api.js";
import { formatCents } from "../../js/format.js";
import { adminApi } from "./admin-api.js";
import { PAYMENT_LABELS } from "../../js/packages-format.js";

export const APPOINTMENT_STATUS_LABEL = {
  em_analise: "Em análise",
  agendado: "Agendado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  recusado: "Recusado",
};

const CHECKIN_LABEL = {
  leva_ao_pet_shop: "Dono leva o pet ao pet shop",
  busca_em_casa: "Buscar o pet na casa do dono",
};
const CHECKOUT_LABEL = {
  retira_no_pet_shop: "Dono retira o pet no pet shop",
  entrega_em_casa: "Entregar o pet na casa do dono",
};

const PET_BOOL_FIELDS = [
  ["pet_has_fleas_ticks", "Tem pulga ou carrapato?"],
  ["pet_has_allergy", "Tem alergia a lâmina ou produto?"],
  ["pet_allows_perfume", "Pode passar perfume?"],
  ["pet_been_to_petshop", "Já foi em pet shop?"],
  ["pet_is_aggressive", "É bravo?"],
  ["pet_has_fur_knots", "Tem nó nos pelos?"],
];

function boolLabel(value) {
  if (value === 1 || value === true) return "Sim";
  if (value === 0 || value === false) return "Não";
  return "—";
}

let dialog = null;

function ensureDialog() {
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.className = "admin-client-dialog";
  dialog.innerHTML = `
    <h3 class="dialog-title">Detalhes do agendamento</h3>
    <div id="adminAppointmentDetailBody" style="margin-top: 1rem;"></div>
    <div class="dialog-actions" id="adminAppointmentDetailActions" style="flex-direction: row; flex-wrap: wrap; margin-top: 1.5rem;"></div>
  `;
  document.body.appendChild(dialog);

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  return dialog;
}

export function openAppointmentDetail(appointment, { onStatusChange } = {}) {
  const dlg = ensureDialog();
  const body = dlg.querySelector("#adminAppointmentDetailBody");
  const actions = dlg.querySelector("#adminAppointmentDetailActions");

  const photo = appointment.pet_photo_url
    ? `<img src="${escapeHtml(resolveAssetUrl(appointment.pet_photo_url))}" alt="${escapeHtml(appointment.pet_name)}" style="width: 4rem; height: 4rem; border-radius: 0.75rem; object-fit: cover;">`
    : `<div style="width: 4rem; height: 4rem; border-radius: 0.75rem; background: var(--brand-100); display: flex; align-items: center; justify-content: center;">
        <span class="material-symbols-rounded" aria-hidden="true">pets</span>
      </div>`;

  const petBasics = [appointment.pet_breed || "Sem raça definida"];
  if (appointment.pet_age_years) petBasics.push(`${appointment.pet_age_years} anos`);
  if (appointment.pet_size) petBasics.push(appointment.pet_size);

  const hasAddress = appointment.address_street;
  const needsPickup = appointment.checkin_mode === "busca_em_casa" || appointment.checkout_mode === "entrega_em_casa";
  const addressHtml = hasAddress
    ? `
      <div class="card" style="margin-top: 0.75rem; padding: 1rem;">
        <p style="font-weight: 700;">Local de busca/entrega</p>
        <p style="font-size: 0.875rem; color: var(--muted); margin-top: 0.25rem;">
          ${escapeHtml(appointment.address_street)}, ${escapeHtml(appointment.address_number)} — ${escapeHtml(appointment.address_neighborhood)}<br>
          ${escapeHtml(appointment.address_city)}/${escapeHtml(appointment.address_state)} · CEP ${escapeHtml(appointment.address_cep)}
        </p>
      </div>
    `
    : needsPickup
      ? `<p style="margin-top: 0.75rem; color: var(--muted); font-size: 0.875rem;">Frete marcado, mas sem endereço cadastrado.</p>`
      : "";

  const pickupFeeRow =
    appointment.pickup_fee_cents > 0
      ? `
        <div style="display: flex; justify-content: space-between; padding: 0.375rem 0; border-top: 1px solid var(--brand-100);">
          <span style="color: var(--muted);">Taxa de busca/entrega</span>
          <strong>${escapeHtml(formatCents(appointment.pickup_fee_cents))}</strong>
        </div>
      `
      : "";

  const petQuestionsHtml = PET_BOOL_FIELDS.map(
    ([field, label]) => `
      <div style="display: flex; justify-content: space-between; gap: 1rem; padding: 0.375rem 0; border-top: 1px solid var(--brand-100);">
        <span style="color: var(--muted);">${label}</span>
        <strong>${boolLabel(appointment[field])}</strong>
      </div>
    `
  ).join("");

  body.innerHTML = `
    <div class="card" style="padding: 1rem;">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        ${photo}
        <div>
          <p style="font-weight: 700;">${escapeHtml(appointment.pet_name)}</p>
          <p style="font-size: 0.8125rem; color: var(--muted);">${escapeHtml(petBasics.join(" · "))}</p>
        </div>
      </div>
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--brand-100);">
        <p style="font-weight: 700;">${escapeHtml(appointment.client_name || "—")}</p>
        <p style="font-size: 0.8125rem; color: var(--muted);">${escapeHtml(appointment.client_phone || "")}</p>
      </div>
    </div>

    <div class="card" style="margin-top: 0.75rem; padding: 1rem;">
      <p style="font-weight: 700; margin-bottom: 0.25rem;">Perguntas do pet</p>
      ${petQuestionsHtml}
    </div>

    <div class="card" style="margin-top: 0.75rem; padding: 1rem;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <p style="font-weight: 700;">${escapeHtml(appointment.service_name)}</p>
        <span class="admin-badge admin-badge--${escapeHtml(appointment.status)}">${escapeHtml(APPOINTMENT_STATUS_LABEL[appointment.status] || appointment.status)}</span>
      </div>
      <p style="font-size: 0.8125rem; color: var(--muted); margin-top: 0.25rem;">
        ${new Date(`${appointment.date}T00:00:00`).toLocaleDateString("pt-BR")} às ${escapeHtml(appointment.time)}
      </p>
      <p style="font-size: 0.8125rem; margin-top: 0.5rem;">${escapeHtml(CHECKIN_LABEL[appointment.checkin_mode] || appointment.checkin_mode)}</p>
      <p style="font-size: 0.8125rem;">${escapeHtml(CHECKOUT_LABEL[appointment.checkout_mode] || appointment.checkout_mode)}</p>
    </div>

    ${addressHtml}

    <div class="card" style="margin-top: 0.75rem; padding: 1rem;">
      <p style="font-weight: 700; margin-bottom: 0.25rem;">Valor estimado</p>
      <div style="display: flex; justify-content: space-between; padding: 0.375rem 0;">
        <span style="color: var(--muted);">Serviço</span>
        <strong>${appointment.customer_package_id ? "Incluído no pacote" : escapeHtml(formatCents(appointment.service_price_cents))}</strong>
      </div>
      ${appointment.customer_package_id ? `<p class="text-muted-note">Um crédito do pacote deste pet. ${appointment.pickup_included ? "Busca incluída. " : ""}${appointment.delivery_included ? "Entrega incluída." : ""}</p>` : ""}
      ${pickupFeeRow}
      <p class="text-muted-note">${appointment.payment_method ? `Forma de pagamento prevista na loja: ${PAYMENT_LABELS[appointment.payment_method] || "Não informada"}` : appointment.customer_package_id && appointment.total_cents === 0 ? "Sem valor adicional previsto" : "Forma de pagamento não informada"}</p>
      <div style="display: flex; justify-content: space-between; padding: 0.5rem 0 0; border-top: 1px solid var(--brand-100); margin-top: 0.25rem;">
        <span style="font-weight: 700;">Total estimado</span>
        <strong>${escapeHtml(formatCents(appointment.total_cents))}</strong>
      </div>
    </div>
  `;

  const isPending = appointment.status === "em_analise";
  const approveBtn = isPending
    ? `<button type="button" class="btn-primary" id="adminAppointmentApproveBtn" style="flex: 1;">Aceitar</button>`
    : "";
  const rejectBtn = isPending
    ? `<button type="button" class="btn-danger" id="adminAppointmentRejectBtn" style="flex: 1;">Recusar</button>`
    : "";

  actions.innerHTML = `
    ${approveBtn}
    ${rejectBtn}
    ${appointment.status === "agendado" ? '<button type="button" class="btn-primary" id="adminAppointmentCompleteBtn" style="flex: 1;">Concluir atendimento</button>' : ""}
    ${["em_analise", "agendado"].includes(appointment.status) ? '<button type="button" class="btn-outline" id="adminAppointmentCancelBtn" style="flex: 1;">Cancelar agendamento</button>' : ""}
    <button type="button" class="btn-outline" id="adminAppointmentCloseBtn" style="flex: 1;">Fechar</button>
  `;

  actions.querySelector("#adminAppointmentCloseBtn").addEventListener("click", () => dlg.close());

  async function changeStatus(status, btn) {
    if (status === "cancelado" && !window.confirm("Cancelar este agendamento e liberar o crédito reservado, se houver?")) return;
    actions.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      await adminApi.updateAppointmentStatus(appointment.id, status);
      dlg.close();
      if (onStatusChange) onStatusChange();
      else window.location.reload();
    } catch (err) {
      alert(err.message);
      actions.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
  }

  const approveEl = actions.querySelector("#adminAppointmentApproveBtn");
  const rejectEl = actions.querySelector("#adminAppointmentRejectBtn");
  if (approveEl) approveEl.addEventListener("click", () => changeStatus("agendado", approveEl));
  if (rejectEl) rejectEl.addEventListener("click", () => changeStatus("recusado", rejectEl));
  const completeEl = actions.querySelector("#adminAppointmentCompleteBtn");
  const cancelEl = actions.querySelector("#adminAppointmentCancelBtn");
  if (completeEl) completeEl.addEventListener("click", () => changeStatus("concluido", completeEl));
  if (cancelEl) cancelEl.addEventListener("click", () => changeStatus("cancelado", cancelEl));

  dlg.showModal();
}
