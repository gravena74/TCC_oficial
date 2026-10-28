export const PAYMENT_LABELS = { pix: "Pix", dinheiro: "Dinheiro", cartao_debito: "Cartão de débito", cartao_credito: "Cartão de crédito" };
export const PACKAGE_STATUS_LABELS = { rascunho: "Aguardando ativação", ativo: "Ativo", esgotado: "Todos os créditos reservados ou usados", expirado: "Expirado", cancelado: "Cancelado" };

export function dateLabel(date) {
  if (!date) return "—";
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

export function lastValidDate(expires) {
  if (!expires) return "—";
  const value = new Date(`${expires}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return dateLabel(value.toISOString().slice(0, 10));
}

export function transportLabel(contract) {
  if (contract.includes_pickup && contract.includes_delivery) return "Busca e entrega incluídas";
  if (contract.includes_pickup) return "Busca incluída; entrega à parte";
  if (contract.includes_delivery) return "Entrega incluída; busca à parte";
  return "Busca e entrega à parte";
}

export function weekStart(date) {
  const value = new Date(`${date}T00:00:00Z`);
  const weekday = value.getUTCDay();
  value.setUTCDate(value.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return value.toISOString().slice(0, 10);
}

export function packageAllowsDate(contract, date) {
  return contract.effective_status === "ativo" && contract.remaining > 0 &&
    date >= contract.starts_on && date < contract.expires_on &&
    !contract.usages.some((usage) => ["reservado", "consumido"].includes(usage.status) && usage.week_start === weekStart(date));
}
