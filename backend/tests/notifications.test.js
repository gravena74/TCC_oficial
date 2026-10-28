import test from "node:test";
import assert from "node:assert/strict";
import { appointmentNotification } from "../utils/notifications.js";
import { whatsappTransport } from "../services/whatsapp.js";

test("avisos distinguem aprovação, recusa e cancelamento sem confirmar pedidos recusados", () => {
  const appointment = { date: "2026-11-05", time: "14:30" };
  for (const status of ["agendado", "recusado", "cancelado"]) {
    const result = appointmentNotification(appointment, status, "Thor", "Pequeno - Banho");
    assert.match(result.message, /Thor: Pequeno - Banho em 05\/11\/2026 às 14:30/);
    assert.ok(result.title);
    if (status === "recusado") assert.doesNotMatch(result.message, /confirmou/);
  }
  assert.equal(appointmentNotification(appointment, "em_analise", "Thor", "Banho"), null);
  assert.equal(appointmentNotification(appointment, "concluido", "Thor", "Banho"), null);
});

test("canal WhatsApp desativado falha explicitamente sem simular envio", async () => {
  assert.equal(whatsappTransport.enabled, false);
  await assert.rejects(whatsappTransport.send({ message: "Teste" }), { code: "WHATSAPP_NOT_CONFIGURED" });
});
