import test from "node:test";
import assert from "node:assert/strict";
import { addDays, weekStart, packageError, estimate, canCancelInAdvance, describePackage } from "../utils/packages.js";

const contract = { id: "package", user_id: "owner", pet_id: "pet", service_id: "bath", status: "ativo",
  quantity: 4, starts_on: "2026-10-13", expires_on: "2026-11-12", includes_pickup: 1, includes_delivery: 0 };
const selection = { userId: "owner", petId: "pet", serviceId: "bath", date: "2026-10-15" };
const check = (value = contract, choice = selection, usages = []) => packageError(value, choice, usages, "2026-10-13");

test("validade cobre 30 dias e semana começa segunda, inclusive na virada do ano", () => {
  assert.equal(addDays("2026-10-13", 30), "2026-11-12");
  assert.equal(addDays("2028-02-01", 30), "2028-03-02");
  assert.equal(weekStart("2027-01-03"), "2026-12-28");
  assert.equal(weekStart("2027-01-04"), "2027-01-04");
});

test("contrato exige dono, pet, serviço, ativação e data na validade", () => {
  assert.equal(check(), null);
  for (const choice of [{ userId: "other" }, { petId: "other" }, { serviceId: "other" }, { date: "2026-10-12" }, { date: "2026-11-12" }]) {
    assert.ok(check(contract, { ...selection, ...choice }));
  }
  assert.ok(check({ ...contract, status: "rascunho" }));
  assert.ok(check({ ...contract, status: "cancelado" }));
  assert.ok(packageError(contract, selection, [], "2026-11-12"));
});

test("reserva e consumo ocupam crédito e semana; crédito liberado pode ser reagendado", () => {
  const usage = { status: "reservado", week_start: "2026-10-12" };
  assert.ok(check(contract, selection, [usage]));
  assert.ok(check(contract, selection, [{ ...usage, status: "consumido" }]));
  assert.equal(check(contract, selection, [{ ...usage, status: "liberado" }]), null);
  assert.ok(check(contract, selection, Array.from({ length: 4 }, () => ({ status: "reservado", week_start: "2026-10-05" }))));
});

test("frete continua por agendamento e só é isento para os trajetos cobertos", () => {
  assert.equal(estimate(5500, "leva_ao_pet_shop", "retira_no_pet_shop").total_cents, 5500);
  assert.equal(estimate(5500, "busca_em_casa", "entrega_em_casa").total_cents, 7000);
  assert.equal(estimate(5500, "busca_em_casa", "retira_no_pet_shop", contract).total_cents, 0);
  assert.equal(estimate(5500, "busca_em_casa", "entrega_em_casa", contract).total_cents, 1500);
  assert.equal(estimate(5500, "busca_em_casa", "entrega_em_casa", { ...contract, includes_delivery: 1 }).total_cents, 0);
});

test("cancelamento aceita exatamente 24h e bloqueia depois do limite, sem depender do fuso do host", () => {
  const appointment = { date: "2026-10-15", time: "08:00" };
  assert.equal(canCancelInAdvance(appointment, 24, { date: "2026-10-14", time: "08:00" }), true);
  assert.equal(canCancelInAdvance(appointment, 24, { date: "2026-10-14", time: "08:01" }), false);
  assert.equal(canCancelInAdvance(appointment, 0, { date: "2026-10-15", time: "08:00" }), false);
});

test("saldo diferencia reservas, consumo e vencimento sem apagar histórico", () => {
  const usages = [{ status: "reservado" }, { status: "consumido" }, { status: "liberado" }];
  const active = describePackage(contract, usages, "2026-10-14");
  assert.deepEqual([active.reserved, active.consumed, active.remaining], [1, 1, 2]);
  assert.equal(describePackage(contract, usages, "2026-11-12").effective_status, "expirado");
  assert.equal(describePackage(contract, Array(4).fill({ status: "reservado" }), "2026-10-14").effective_status, "esgotado");
});
