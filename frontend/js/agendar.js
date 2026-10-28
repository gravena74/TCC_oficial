import { api, resolveAssetUrl } from "./api.js";
import { requireAuth } from "./guard.js";
import { getBooking, updateBooking, petHasActiveAppointment, PET_ACTIVE_APPOINTMENT_ERROR } from "./booking.js";
import { formatCents, toIsoDate } from "./format.js";
import { escapeHtml } from "./html.js";
import { packageAllowsDate, lastValidDate, transportLabel } from "./packages-format.js";

const SERVICE_ICONS = { Banho: "bathtub", Tosa: "content_cut" };

function displayServiceName(name) {
  return name.replace(/^(Pequeno|Médio|Grande)\s*-\s*/, "");
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const user = await requireAuth();
if (user) {
  const booking = getBooking();
  if (!booking.pet) {
    window.location.replace("pets.html");
  } else {
    document.getElementById("authLoading").style.display = "none";
    document.getElementById("screen").style.display = "flex";
    init(booking);
  }
}

function init(booking) {
  const serviceListEl = document.getElementById("serviceList");
  const calendarLabel = document.getElementById("calendarLabel");
  const calendarDaysEl = document.getElementById("calendarDays");
  const slotsSection = document.getElementById("slotsSection");
  const slotsLoading = document.getElementById("slotsLoading");
  const slotsGrid = document.getElementById("slotsGrid");
  const errorMsg = document.getElementById("errorMsg");
  const summaryLine = document.getElementById("summaryLine");
  const advanceBtn = document.getElementById("advanceBtn");
  const packageSelect = document.getElementById("packageSelect");
  const packageHint = document.getElementById("packageHint");

  let services = [];
  let packages = [];
  let selectedPackageId = booking.customerPackageId || null;
  let selectedService = booking.service || null;
  let viewMonth = (() => {
    const base = booking.date ? new Date(booking.date + "T00:00:00") : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  })();
  let selectedDate = booking.date || null;
  let selectedTime = booking.time || null;
  let slots = [];
  let loadingSlots = false;
  let slotsRequest = 0;

  function selectedPackage() {
    return packages.find((contract) => contract.id === selectedPackageId) || null;
  }

  function renderPackages() {
    const compatible = packages.filter((contract) => contract.pet_id === booking.pet.id &&
      contract.service_id === selectedService?.id && contract.effective_status === "ativo" && contract.remaining > 0);
    if (!compatible.some((contract) => contract.id === selectedPackageId)) selectedPackageId = null;
    packageSelect.innerHTML = '<option value="">Atendimento avulso</option>' + compatible.map((contract) =>
      `<option value="${escapeHtml(contract.id)}">${escapeHtml(contract.name)} · ${contract.remaining} banho(s) disponível(is)</option>`).join("");
    packageSelect.value = selectedPackageId || "";
    const contract = selectedPackage();
    packageHint.textContent = contract
      ? `Válido até ${lastValidDate(contract.expires_on)}. Um banho por semana, de segunda a domingo. ${transportLabel(contract)}. Cancelamento com ${contract.cancellation_notice_hours}h de antecedência.`
      : "Avulso: valor do serviço e frete, quando solicitado. Pacotes compatíveis aparecem nesta seleção.";
    if (contract && selectedDate && !packageAllowsDate(contract, selectedDate)) { selectedDate = null; selectedTime = null; }
  }

  packageSelect.addEventListener("change", () => {
    selectedPackageId = packageSelect.value || null;
    selectedTime = null;
    errorMsg.style.display = "none";
    renderPackages();
    renderCalendar();
    loadSlots();
    updateSummary();
  });

  // Resumo do pet
  document.getElementById("petSummary").style.display = "flex";
  document.getElementById("petSummaryPhoto").innerHTML = booking.pet.photo_url
    ? `<img src="${escapeHtml(resolveAssetUrl(booking.pet.photo_url))}" alt="${escapeHtml(booking.pet.name)}">`
    : `<span class="material-symbols-rounded" aria-hidden="true">pets</span>`;
  document.getElementById("petSummaryName").textContent = booking.pet.name;
  document.getElementById("petSummaryBreed").textContent = booking.pet.breed || "";

  function renderServices() {
    serviceListEl.innerHTML = "";
    for (const service of services) {
      const active = selectedService?.id === service.id;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `service-chip${active ? " service-chip--active" : ""}`;
      const displayName = displayServiceName(service.name);
      const iconName = displayName.includes("Tosa") ? SERVICE_ICONS.Tosa : SERVICE_ICONS.Banho;
      chip.innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">${iconName}</span> ${escapeHtml(displayName)}`;
      chip.addEventListener("click", () => {
        selectedService = service;
        selectedPackageId = null;
        selectedTime = null;
        renderServices();
        renderPackages();
        renderCalendar();
        loadSlots();
        updateSummary();
      });
      serviceListEl.appendChild(chip);
    }
  }

  function renderCalendar() {
    calendarLabel.textContent = `${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
    calendarDaysEl.innerHTML = "";
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = startOfToday();

    for (let i = 0; i < startWeekday; i++) {
      calendarDaysEl.appendChild(document.createElement("span"));
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const iso = toIsoDate(date);
      const isPast = date < today;
      const isSelected = selectedDate === iso;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `calendar-day${isSelected ? " calendar-day--selected" : ""}`;
      btn.textContent = String(day);
      const contract = selectedPackage();
      btn.disabled = !services.length || isPast || Boolean(contract && !packageAllowsDate(contract, iso));
      btn.addEventListener("click", () => {
        selectedDate = iso;
        selectedTime = null;
        renderCalendar();
        loadSlots();
        updateSummary();
      });
      calendarDaysEl.appendChild(btn);
    }
  }

  function renderSlots() {
    slotsGrid.innerHTML = "";
    for (const slot of slots) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `slot-btn${selectedTime === slot.time ? " slot-btn--selected" : ""}`;
      btn.textContent = slot.time;
      btn.disabled = !slot.available;
      btn.addEventListener("click", () => {
        selectedTime = slot.time;
        renderSlots();
        updateSummary();
      });
      slotsGrid.appendChild(btn);
    }
  }

  function loadSlots() {
    const request = ++slotsRequest;
    if (!selectedService || !selectedDate) {
      loadingSlots = false;
      slots = [];
      slotsSection.style.display = "none";
      return;
    }
    loadingSlots = true;
    updateSummary();
    slotsSection.style.display = "block";
    slotsLoading.style.display = "block";
    slotsGrid.innerHTML = "";
    api
      .getSlots(selectedService.id, selectedDate)
      .then(({ slots: res }) => {
        if (request !== slotsRequest) return;
        slots = res;
        // um horario escolhido antes pode ter passado/sido reservado nesse meio tempo
        if (selectedTime && !slots.some((s) => s.time === selectedTime && s.available)) {
          selectedTime = null;
          updateSummary();
        }
        renderSlots();
      })
      .catch((err) => {
        if (request !== slotsRequest) return;
        selectedTime = null;
        errorMsg.textContent = err.message;
        errorMsg.style.display = "block";
      })
      .finally(() => {
        if (request !== slotsRequest) return;
        loadingSlots = false;
        slotsLoading.style.display = "none";
        updateSummary();
      });
  }

  function updateSummary() {
    const contract = selectedPackage();
    const canAdvance = Boolean(services.some((s) => s.id === selectedService?.id) && selectedDate && selectedTime && !loadingSlots &&
      (!contract || packageAllowsDate(contract, selectedDate)));
    advanceBtn.disabled = !canAdvance;
    if (selectedService && selectedTime) {
      summaryLine.style.display = "block";
      summaryLine.textContent = `Resumo: ${displayServiceName(selectedService.name)} · ${selectedTime} · ${contract ? "Incluído no pacote" : formatCents(selectedService.price_cents)}`;
    } else {
      summaryLine.style.display = "none";
    }
  }

  document.getElementById("prevMonth").addEventListener("click", () => {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById("nextMonth").addEventListener("click", () => {
    viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  function blockBooking(message) {
    services = [];
    selectedService = null;
    selectedTime = null;
    slotsRequest++;
    loadingSlots = false;
    slotsSection.style.display = "none";
    packageSelect.disabled = true;
    renderServices();
    renderCalendar();
    errorMsg.textContent = message;
    errorMsg.style.display = "block";
    updateSummary();
  }

  advanceBtn.addEventListener("click", async () => {
    if (advanceBtn.disabled || !selectedService || !selectedDate || !selectedTime) return;
    advanceBtn.disabled = true;
    try {
      const { appointments } = await api.getAppointments();
      if (petHasActiveAppointment(appointments, booking.pet.id)) {
        blockBooking(PET_ACTIVE_APPOINTMENT_ERROR);
        return;
      }
      updateBooking({ service: selectedService, date: selectedDate, time: selectedTime, customerPackageId: selectedPackageId });
      window.location.href = "checkout.html";
    } catch (error) { blockBooking(error.message); }
  });

  Promise.all([api.getServices(), api.getPet(booking.pet.id), api.getPackages(), api.getAppointments()]).then(([{ services: res }, { pet }, packagesRes, { appointments }]) => {
    if (petHasActiveAppointment(appointments, pet.id)) throw new Error(PET_ACTIVE_APPOINTMENT_ERROR);
    const changed = pet.size !== booking.pet.size;
    booking.pet = pet;
    const petSize = pet.size;
    const bySize = petSize ? res.filter((s) => s.name.startsWith(`${petSize} -`)) : [];
    services = bySize;
    packages = packagesRes.packages;
    const requestedPackage = packages.find((contract) => contract.id === selectedPackageId && contract.pet_id === pet.id);
    if (requestedPackage) selectedService = services.find((service) => service.id === requestedPackage.service_id) || null;
    if (!services.length) {
      errorMsg.textContent = "Atualize o porte do pet na ficha antes de agendar.";
      errorMsg.style.display = "block";
    }
    const currentService = services.find((s) => s.id === selectedService?.id);
    if (changed || !currentService) {
      selectedService = null;
      selectedTime = null;
    } else {
      selectedService = currentService; // Preco atual, nao a copia antiga da sessao.
    }
    updateBooking({ pet });
    if (!selectedService && services.length) selectedService = services[0];
    renderServices();
    renderPackages();
    renderCalendar();
    if (selectedDate) loadSlots();
    updateSummary();
  }).catch((err) => blockBooking(err.message));

  async function checkCurrentPet() {
    try {
      const { appointments } = await api.getAppointments();
      if (petHasActiveAppointment(appointments, booking.pet.id)) blockBooking(PET_ACTIVE_APPOINTMENT_ERROR);
    } catch (error) { blockBooking(error.message); }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkCurrentPet(); });
  window.addEventListener("pageshow", (event) => { if (event.persisted) checkCurrentPet(); });

  renderCalendar();
  if (selectedDate) {
    slotsSection.style.display = "block";
  }
  updateSummary();
}
