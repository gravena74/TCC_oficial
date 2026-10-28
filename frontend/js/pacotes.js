import { api } from "./api.js";
import { requireAuth } from "./guard.js";
import { updateBooking, petHasActiveAppointment, PET_ACTIVE_APPOINTMENT_ERROR } from "./booking.js";
import { escapeHtml } from "./html.js";
import { formatCents } from "./format.js";
import { PACKAGE_STATUS_LABELS, dateLabel, lastValidDate, transportLabel } from "./packages-format.js";

const user = await requireAuth();
if (user) {
  document.getElementById("authLoading").style.display = "none";
  document.getElementById("screen").style.display = "flex";
  load();
}

async function load() {
  const errorEl = document.getElementById("packageError");
  try {
    const [{ packages }, { appointments }] = await Promise.all([api.getPackages(), api.getAppointments()]);
    const list = document.getElementById("packageList");
    const usageLabels = { reservado: "Crédito reservado", consumido: "Banho realizado", liberado: "Crédito liberado" };
    list.innerHTML = packages.length ? packages.map((contract) => `
      <article class="card package-card">
        <div class="package-card__header"><h2>${escapeHtml(contract.name)}</h2><span class="status-badge">${PACKAGE_STATUS_LABELS[contract.effective_status]}</span></div>
        <p><strong>${escapeHtml(contract.pet_name)}</strong> · ${escapeHtml(contract.service_name)}</p>
        <p class="text-muted-note">Valor combinado na loja: ${formatCents(contract.price_cents)} pelo pacote</p>
        <p>Realizados: ${contract.consumed} · Reservados: ${contract.reserved} · Não utilizados: ${contract.remaining}</p>
        <p>${contract.starts_on ? `Válido de ${dateLabel(contract.starts_on)} até ${lastValidDate(contract.expires_on)}` : "A validade começa após a ativação pelo pet shop."}</p>
        <p>${transportLabel(contract)}</p>
        <p class="text-muted-note">Um banho por semana (segunda a domingo). Avise com ${contract.cancellation_notice_hours}h de antecedência para cancelar pelo aplicativo.</p>
        ${contract.notes ? `<p class="text-muted-note">${escapeHtml(contract.notes)}</p>` : ""}
        ${contract.effective_status === "expirado" ? '<p class="text-muted-note">Os créditos restantes não estão disponíveis após o vencimento.</p>' : ""}
        ${contract.usages.length ? `<details><summary>Histórico dos banhos</summary>${contract.usages.map((usage) => `<p>${dateLabel(usage.date)} às ${escapeHtml(usage.time)} · ${usageLabels[usage.status]}</p>`).join("")}</details>` : ""}
        ${contract.effective_status === "ativo" && !contract.pet_deleted_at ? `<button type="button" class="btn-primary" data-package="${escapeHtml(contract.id)}" ${petHasActiveAppointment(appointments, contract.pet_id) ? "disabled" : ""}>${petHasActiveAppointment(appointments, contract.pet_id) ? "Pet com agendamento em andamento" : "Agendar com este pacote"}</button>` : ""}
      </article>`).join("") : '<div class="empty-state"><p class="empty-state__title">Você ainda não tem pacotes.</p><p class="empty-state__subtitle">Converse com o pet shop para contratar um pacote para seu pet.</p></div>';
    list.querySelectorAll("button[data-package]").forEach((button) => button.addEventListener("click", async () => {
      const contract = packages.find((item) => item.id === button.dataset.package);
      button.disabled = true;
      errorEl.hidden = true;
      try {
        const [{ pet }, { appointments: latestAppointments }] = await Promise.all([api.getPet(contract.pet_id), api.getAppointments()]);
        if (petHasActiveAppointment(latestAppointments, pet.id)) { await load(); throw new Error(PET_ACTIVE_APPOINTMENT_ERROR); }
        updateBooking({ pet, service: null, date: null, time: null, customerPackageId: contract.id, paymentMethod: null });
        window.location.href = "agendar.html";
      } catch (error) { errorEl.textContent = error.message; errorEl.hidden = false; button.disabled = false; }
    }));
  } catch (error) { errorEl.textContent = error.message; errorEl.hidden = false; }
  finally { document.getElementById("packagesLoading").hidden = true; }
}

document.addEventListener("visibilitychange", () => { if (user && !document.hidden) load(); });
window.addEventListener("pageshow", (event) => { if (user && event.persisted) load(); });
