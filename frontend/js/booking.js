// Estado do fluxo de agendamento, compartilhado entre páginas via sessionStorage
// (substitui o BookingContext do React, que vivia em memória durante a navegação da SPA).
const STORAGE_KEY = "cafofo_booking";

export const PET_ACTIVE_APPOINTMENT_ERROR = "Este pet já possui um agendamento em análise ou confirmado. Aguarde a conclusão, recusa ou cancelamento antes de agendar novamente.";

export function petHasActiveAppointment(appointments, petId) {
  return appointments.some((appointment) => appointment.pet_id === petId &&
    ["em_analise", "agendado"].includes(appointment.status));
}

const initialBooking = {
  pet: null,
  service: null,
  date: null,
  time: null,
  checkinMode: null,
  checkoutMode: null,
  address: null,
  customerPackageId: null,
  paymentMethod: null,
};

export function getBooking() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? { ...initialBooking, ...JSON.parse(raw) } : { ...initialBooking };
  } catch {
    return { ...initialBooking };
  }
}

export function updateBooking(partial) {
  const current = getBooking();
  const changedPet = partial.pet &&
    (partial.pet.id !== current.pet?.id || partial.pet.size !== current.pet?.size);
  // Toda escolha posterior deve ser refeita ao trocar o pet ou seu porte.
  const next = { ...(changedPet ? initialBooking : current), ...partial };
  if (partial.service && partial.service.id !== current.service?.id) next.paymentMethod = null;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resetBooking() {
  sessionStorage.removeItem(STORAGE_KEY);
}
