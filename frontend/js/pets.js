import { api, resolveAssetUrl } from "./api.js";
import { requireAuth } from "./guard.js";
import { updateBooking, petHasActiveAppointment, PET_ACTIVE_APPOINTMENT_ERROR } from "./booking.js";
import { escapeHtml } from "./html.js";

const isManageMode = new URLSearchParams(window.location.search).get("mode") === "manage";

const user = await requireAuth();
if (user) {
  document.getElementById("authLoading").style.display = "none";
  document.getElementById("screen").style.display = "flex";
  init();
}

function init() {
  const listEl = document.getElementById("petList");
  const loadingMsg = document.getElementById("loadingMsg");
  const errorMsg = document.getElementById("errorMsg");
  const emptyState = document.getElementById("emptyState");
  const advanceBar = document.getElementById("advanceBar");
  const advanceBtn = document.getElementById("advanceBtn");

  if (isManageMode) {
    document.getElementById("screenTitle").textContent = "Meus Pets";
    document.title = "Meus Pets — Cafofo do Pet";
    advanceBar.style.display = "none";
    document.getElementById("newPetLink").href = "pets-novo.html?from=manage";
    // Modo agendamento já usa o rodapé fixo pro botão "Avançar" — o nav só
    // aparece no modo gerenciar, pra não sobrepor os dois.
    document.getElementById("bottomNav").style.display = "flex";
  }

  let pets = [];
  let appointmentsByPet = {};
  let selectedId = null;

  function loadData() {
    selectedId = null;
    advanceBtn.disabled = true;
    loadingMsg.style.display = "block";
    errorMsg.style.display = "none";
    listEl.innerHTML = "";
    return Promise.all([api.getPets(), api.getAppointments()])
      .then(([petsRes, apptsRes]) => {
        pets = petsRes.pets;
        appointmentsByPet = {};
        for (const appt of apptsRes.appointments) {
          if (appt.status !== "agendado" && appt.status !== "em_analise") continue;
          if (!appointmentsByPet[appt.pet_id]) appointmentsByPet[appt.pet_id] = appt;
        }
        render();
      })
      .catch((err) => {
        errorMsg.textContent = err.message;
        errorMsg.style.display = "block";
      })
      .finally(() => {
        loadingMsg.style.display = "none";
      });
  }

  function render() {
    emptyState.style.display = pets.length === 0 ? "flex" : "none";
    listEl.innerHTML = "";

    for (const pet of pets) {
      const appointment = appointmentsByPet[pet.id];
      const isBooked = Boolean(appointment);
      const active = selectedId === pet.id;

      const card = document.createElement("div");
      card.className = `card pet-card${isBooked && !isManageMode ? " pet-card--booked" : ""}${active ? " pet-card--selected" : ""}`;

      const photo = pet.photo_url
        ? `<img src="${escapeHtml(resolveAssetUrl(pet.photo_url))}" alt="${escapeHtml(pet.name)}">`
        : `<span class="material-symbols-rounded" aria-hidden="true">pets</span>`;

      card.innerHTML = `
        <button type="button" class="pet-card__select" ${isBooked && !isManageMode ? "disabled" : ""}>
          <div class="pet-card__photo">${photo}</div>
          <div class="pet-card__info">
            <p class="pet-card__name">${escapeHtml(pet.name)}</p>
            <p class="pet-card__meta">${escapeHtml(pet.breed || "Sem raça definida")}${pet.age_years ? ` · ${escapeHtml(pet.age_years)} anos` : ""}</p>
            ${
              isBooked
                ? `<span class="pet-card__tag">${
                    appointment.status === "em_analise" ? "Agendado · aguardando análise" : "Agendado · confirmado"
                  }</span>`
                : ""
            }
            ${isBooked ? '<p class="pet-card__meta">Novo agendamento bloqueado enquanto este atendimento estiver em andamento.</p>' : ""}
          </div>
          ${
            isManageMode
              ? `<span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>`
              : `<span class="pet-card__check"><span class="material-symbols-rounded" aria-hidden="true">${isBooked ? "lock" : "check"}</span></span>`
          }
        </button>
      `;

      if (isManageMode) {
        card.querySelector(".pet-card__select").addEventListener("click", () => {
          window.location.href = `pet-detalhe.html?id=${pet.id}`;
        });
      } else {
        card.querySelector(".pet-card__select").addEventListener("click", () => {
          if (appointmentsByPet[pet.id]) return;
          selectedId = pet.id;
          advanceBtn.disabled = false;
          render();
        });
      }

      listEl.appendChild(card);
    }
  }

  advanceBtn.addEventListener("click", async () => {
    if (advanceBtn.disabled) return;
    const pet = pets.find((p) => p.id === selectedId);
    if (!pet || appointmentsByPet[pet.id]) return;
    advanceBtn.disabled = true;
    try {
      const { appointments } = await api.getAppointments();
      if (petHasActiveAppointment(appointments, pet.id)) {
        await loadData();
        errorMsg.textContent = PET_ACTIVE_APPOINTMENT_ERROR;
        errorMsg.style.display = "block";
        return;
      }
      updateBooking({ pet });
      window.location.href = "agendar.html";
    } catch (error) {
      errorMsg.textContent = error.message;
      errorMsg.style.display = "block";
      advanceBtn.disabled = false;
    }
  });

  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadData(); });
  window.addEventListener("pageshow", (event) => { if (event.persisted) loadData(); });
  loadData();
}
