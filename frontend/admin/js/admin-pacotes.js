import { requireAdminAuth } from "./admin-auth.js";
import { renderAdminLayout } from "./admin-layout.js";
import { adminApi } from "./admin-api.js";
import { escapeHtml } from "../../js/html.js";
import { formatCents } from "../../js/format.js";
import { PACKAGE_STATUS_LABELS, dateLabel, lastValidDate, transportLabel } from "../../js/packages-format.js";

const admin = await requireAdminAuth();
if (admin) {
  renderAdminLayout("pacotes", admin.name || admin.username);
  init();
}

function init() {
  const el = (id) => document.getElementById(id);
  let options = { pets: [], plans: [], services: [] };
  const showError = (error) => { el("packageError").textContent = error.message; el("packageError").hidden = false; };

  function renderPets() {
    const previous = el("contractPet").value;
    const search = el("clientSearch").value.trim().toLocaleLowerCase("pt-BR");
    const pets = options.pets.filter((pet) => `${pet.client_name} ${pet.client_phone} ${pet.name}`.toLocaleLowerCase("pt-BR").includes(search));
    el("contractPet").innerHTML = '<option value="">Selecione...</option>' + pets.map((pet) => `<option value="${escapeHtml(pet.id)}">${escapeHtml(pet.client_name || pet.client_phone)} · ${escapeHtml(pet.name)} (${escapeHtml(pet.size || "porte não informado")})</option>`).join("");
    if (pets.some((pet) => pet.id === previous)) el("contractPet").value = previous;
    renderPlans();
  }

  function renderPlans() {
    const previous = el("contractPlan").value;
    const pet = options.pets.find((item) => item.id === el("contractPet").value);
    const plans = options.plans.filter((plan) => pet && plan.service_name.startsWith(`${pet.size} -`));
    el("contractPlan").innerHTML = '<option value="">Selecione...</option>' + plans.map((plan) => `<option value="${escapeHtml(plan.id)}">${escapeHtml(plan.name)} · ${formatCents(plan.price_cents)}</option>`).join("");
    if (plans.some((plan) => plan.id === previous)) el("contractPlan").value = previous;
    if (!plans.length) el("contractPlan").options[0].textContent = pet ? "Cadastre um plano para este porte" : "Selecione um pet primeiro...";
    updatePrice();
  }

  function updatePrice() {
    const plan = options.plans.find((item) => item.id === el("contractPlan").value);
    el("contractPrice").value = plan ? (plan.price_cents / 100).toFixed(2) : "";
  }

  async function loadOptions() {
    options = await adminApi.getPackageOptions();
    renderPets();
    el("planService").innerHTML = '<option value="">Selecione...</option>' + options.services.map((service) => `<option value="${escapeHtml(service.id)}">${escapeHtml(service.name)}</option>`).join("");
  }

  async function loadContracts() {
    el("packagesLoading").hidden = false;
    try {
      const { packages } = await adminApi.getPackages();
      el("packageList").innerHTML = packages.length ? packages.map((contract) => `
        <article class="card package-card">
          <div class="package-card__header"><h3>${escapeHtml(contract.name)}</h3><span class="status-badge">${PACKAGE_STATUS_LABELS[contract.effective_status]}</span></div>
          <p><strong>${escapeHtml(contract.pet_name)}</strong> · ${escapeHtml(contract.client_name || "Sem nome")} · ${escapeHtml(contract.client_phone)}</p>
          <p class="text-muted-note">${escapeHtml(contract.service_name)} · ${formatCents(contract.price_cents)} pelo pacote</p>
          <p>Realizados: ${contract.consumed} · Reservados: ${contract.reserved} · Não utilizados: ${contract.remaining}</p>
          <p>${contract.starts_on ? `Validade: ${dateLabel(contract.starts_on)} a ${lastValidDate(contract.expires_on)}` : "A validade começa quando você ativar o contrato."}</p>
          <p>${transportLabel(contract)} · Aviso para cancelar: ${contract.cancellation_notice_hours}h</p>
          ${contract.pet_deleted_at ? '<p class="form-error">Pet arquivado.</p>' : ""}
          ${contract.notes ? `<p class="text-muted-note">${escapeHtml(contract.notes)}</p>` : ""}
          ${contract.usages.length ? `<details><summary>Histórico dos banhos</summary>${contract.usages.map((usage) => `<p>${dateLabel(usage.date)} às ${escapeHtml(usage.time)} · ${escapeHtml(usage.appointment_status)} · crédito ${escapeHtml(usage.status)}</p>`).join("")}</details>` : ""}
          <div class="package-card__actions">
            ${contract.status === "rascunho" && !contract.pet_deleted_at ? `<button class="btn-primary" data-id="${escapeHtml(contract.id)}" data-status="ativo">Ativar por 30 dias</button>` : ""}
            ${contract.status !== "cancelado" ? `<button class="btn-outline" data-id="${escapeHtml(contract.id)}" data-status="cancelado" ${contract.reserved ? "disabled" : ""}>Cancelar contrato</button>` : ""}
          </div>
        </article>`).join("") : '<p class="admin-empty">Nenhum contrato cadastrado.</p>';
      el("packageList").querySelectorAll("button[data-status]").forEach((button) => button.addEventListener("click", async () => {
        const activating = button.dataset.status === "ativo";
        if (!window.confirm(activating ? "Ativar o contrato agora? A validade de 30 dias começa hoje." : "Cancelar este contrato? O histórico será preservado.")) return;
        button.disabled = true;
        el("packageError").hidden = true;
        try {
          await adminApi.updatePackageStatus(button.dataset.id, button.dataset.status);
          await loadContracts();
        } catch (error) { showError(error); button.disabled = false; }
      }));
    } catch (error) { showError(error); }
    finally { el("packagesLoading").hidden = true; }
  }

  el("clientSearch").addEventListener("input", renderPets);
  el("contractPet").addEventListener("change", renderPlans);
  el("contractPlan").addEventListener("change", updatePrice);
  el("refreshPackages").addEventListener("click", () => { el("packageError").hidden = true; loadContracts(); loadOptions().catch(showError); });
  el("contractForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    el("packageError").hidden = true;
    el("packageFeedback").hidden = true;
    el("createContractBtn").disabled = true;
    try {
      await adminApi.createPackage({ pet_id: el("contractPet").value, plan_id: el("contractPlan").value,
        price_cents: Math.round(Number(el("contractPrice").value) * 100),
        includes_pickup: el("includesPickup").checked, includes_delivery: el("includesDelivery").checked,
        cancellation_notice_hours: Number(el("contractNotice").value), notes: el("contractNotes").value.trim() });
      el("contractForm").reset();
      renderPets();
      el("packageFeedback").textContent = "Contrato cadastrado. Confira as condições e clique em Ativar por 30 dias.";
      el("packageFeedback").hidden = false;
      await loadContracts();
    } catch (error) { showError(error); }
    finally { el("createContractBtn").disabled = false; }
  });

  el("newPlanBtn").addEventListener("click", () => { el("planError").hidden = true; el("planDialog").showModal(); });
  el("closePlanBtn").addEventListener("click", () => el("planDialog").close());
  el("planForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    el("savePlanBtn").disabled = true;
    el("planError").hidden = true;
    try {
      await adminApi.createPackagePlan({ name: el("planName").value.trim(), service_id: el("planService").value,
        price_cents: Math.round(Number(el("planPrice").value) * 100) });
      el("planForm").reset();
      el("planDialog").close();
      await loadOptions();
    } catch (error) { el("planError").textContent = error.message; el("planError").hidden = false; }
    finally { el("savePlanBtn").disabled = false; }
  });
  loadOptions().catch(showError);
  loadContracts();
}
