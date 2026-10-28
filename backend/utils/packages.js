import { nowInShop, isValidDate } from "./time.js";

export const PAYMENT_METHODS = ["pix", "dinheiro", "cartao_debito", "cartao_credito"];
export const PACKAGE_QUANTITY = 4;
export const PACKAGE_VALIDITY_DAYS = 30;

export function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function weekStart(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}

export function packageError(contract, { userId, petId, serviceId, date }, usages, today = nowInShop().date) {
  if (!contract || contract.user_id !== userId || contract.pet_id !== petId) return "Pacote não encontrado para este pet.";
  if (contract.status !== "ativo") return "Este pacote ainda não está ativo ou foi cancelado.";
  if (contract.service_id !== serviceId) return "O serviço escolhido não está incluído neste pacote.";
  if (!isValidDate(date) || today < contract.starts_on || today >= contract.expires_on ||
      date < contract.starts_on || date >= contract.expires_on) return "Escolha um banho dentro da validade do pacote.";
  const occupied = usages.filter((usage) => ["reservado", "consumido"].includes(usage.status));
  if (occupied.length >= contract.quantity) return "Os quatro banhos deste pacote já foram utilizados ou reservados.";
  if (occupied.some((usage) => usage.week_start === weekStart(date))) return "Este pacote já tem um banho nesta semana (segunda a domingo).";
  return null;
}

export function estimate(servicePrice, checkin, checkout, contract = null) {
  const pickupRequested = checkin === "busca_em_casa";
  const deliveryRequested = checkout === "entrega_em_casa";
  const pickupIncluded = pickupRequested && Boolean(contract?.includes_pickup);
  const deliveryIncluded = deliveryRequested && Boolean(contract?.includes_delivery);
  const fee = (pickupRequested && !pickupIncluded) || (deliveryRequested && !deliveryIncluded) ? 1500 : 0;
  return {
    service_price_cents: servicePrice,
    package_covered_cents: contract ? servicePrice : 0,
    pickup_fee_cents: fee,
    total_cents: (contract ? 0 : servicePrice) + fee,
    pickup_included: pickupIncluded,
    delivery_included: deliveryIncluded,
    package_name: contract?.name || null,
    cancellation_notice_hours: contract?.cancellation_notice_hours ?? null,
  };
}

export function canCancelInAdvance(appointment, noticeHours, now = nowInShop()) {
  // Datas locais do mesmo fuso comparadas como componentes; não usa o fuso do host.
  const gap = Date.parse(`${appointment.date}T${appointment.time}:00Z`) - Date.parse(`${now.date}T${now.time}:00Z`);
  return gap >= noticeHours * 3600000 && gap > 0;
}

export async function getUsages(tx, packageId, lock = false) {
  return tx.all(`SELECT * FROM package_usages WHERE customer_package_id = ?${lock ? " FOR UPDATE" : ""}`, [packageId]);
}

export function describePackage(contract, usages, today = nowInShop().date) {
  const reserved = usages.filter((usage) => usage.status === "reservado").length;
  const consumed = usages.filter((usage) => usage.status === "consumido").length;
  const remaining = Math.max(0, contract.quantity - reserved - consumed);
  const effectiveStatus = contract.status === "ativo"
    ? (today >= contract.expires_on ? "expirado" : remaining === 0 ? "esgotado" : "ativo")
    : contract.status;
  return { ...contract, reserved, consumed, remaining, effective_status: effectiveStatus, usages };
}

// Todas as mutações seguem serviço -> pet -> contrato -> agendamento -> uso.
export async function lockAppointment(tx, id, userId = null) {
  const ref = await tx.get(`SELECT * FROM appointments WHERE id = ?${userId ? " AND user_id = ?" : ""}`, userId ? [id, userId] : [id]);
  if (!ref) return null;
  const service = await tx.get(`SELECT * FROM services WHERE id = ? FOR UPDATE`, [ref.service_id]);
  const pet = await tx.get(`SELECT * FROM pets WHERE id = ? FOR UPDATE`, [ref.pet_id]);
  const contract = ref.customer_package_id ? await tx.get(`SELECT * FROM customer_packages WHERE id = ? FOR UPDATE`, [ref.customer_package_id]) : null;
  const appointment = await tx.get(`SELECT * FROM appointments WHERE id = ? FOR UPDATE`, [id]);
  return { appointment, service, pet, contract };
}

export async function updatePackageUsage(tx, appointment, status) {
  if (!appointment.customer_package_id) return;
  const next = status === "concluido" ? "consumido" : ["cancelado", "recusado"].includes(status) ? "liberado" : "reservado";
  await tx.run(`UPDATE package_usages SET status = ? WHERE appointment_id = ? AND status = 'reservado'`, [next, appointment.id]);
}
