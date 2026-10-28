export const APPOINTMENT_TRANSITIONS = {
  em_analise: ["agendado", "recusado", "cancelado"],
  agendado: ["concluido", "cancelado"],
  concluido: [],
  cancelado: [],
  recusado: [],
};

export const PET_ACTIVE_APPOINTMENT_ERROR = "Este pet já possui um agendamento em análise ou confirmado. Aguarde a conclusão, recusa ou cancelamento antes de agendar novamente.";

export function getActivePetAppointment(database, petId, lock = false) {
  return database.get(
    `SELECT id FROM appointments WHERE pet_id = ? AND status IN ('em_analise', 'agendado') LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [petId]
  );
}

export function serviceMatchesPet(service, pet) {
  return ["Pequeno", "Médio", "Grande"].includes(pet.size) &&
    service.name.startsWith(`${pet.size} -`);
}
