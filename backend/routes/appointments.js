import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db/database.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { isPast, isValidDate, isValidSlot } from "../utils/time.js";
import { serviceMatchesPet, getActivePetAppointment, PET_ACTIVE_APPOINTMENT_ERROR } from "../utils/appointments.js";
import { queueAppointmentWhatsApp } from "../utils/notifications.js";
import { PAYMENT_METHODS, packageError, estimate, getUsages, weekStart, lockAppointment,
  updatePackageUsage, canCancelInAdvance } from "../utils/packages.js";

const router = Router();
router.use(requireAuth);

function selectionError(body) {
  if (![body.pet_id, body.service_id].every((value) => typeof value === "string" && value) ||
      !isValidDate(body.date) || !isValidSlot(body.time)) return "Informe pet, serviço, data e horário válidos.";
  if (!["leva_ao_pet_shop", "busca_em_casa"].includes(body.checkin_mode) ||
      !["retira_no_pet_shop", "entrega_em_casa"].includes(body.checkout_mode)) return "Opções de transporte inválidas.";
  if (body.customer_package_id != null && (typeof body.customer_package_id !== "string" || !body.customer_package_id)) return "Pacote inválido.";
  if (isPast(body.date, body.time)) return "Este horário já passou. Escolha outro.";
  return null;
}

// Consulta a estimativa atual sem reservar horário ou crédito.
router.post("/estimate", asyncHandler(async (req, res) => {
  const error = selectionError(req.body);
  if (error) return res.status(400).json({ error });
  const { pet_id, service_id, date, time, customer_package_id } = req.body;
  const service = await db.get(`SELECT * FROM services WHERE id = ?`, [service_id]);
  const pet = await db.get(`SELECT * FROM pets WHERE id = ? AND user_id = ? AND deleted_at IS NULL`, [pet_id, req.userId]);
  if (!service || !pet) return res.status(404).json({ error: "Pet ou serviço não encontrado." });
  if (!serviceMatchesPet(service, pet)) return res.status(400).json({ error: "Escolha um serviço compatível com o porte do pet." });
  if (await getActivePetAppointment(db, pet_id)) {
    return res.status(409).json({ error: PET_ACTIVE_APPOINTMENT_ERROR, code: "PET_HAS_ACTIVE_APPOINTMENT" });
  }
  let contract = null;
  if (customer_package_id) {
    contract = await db.get(`SELECT * FROM customer_packages WHERE id = ? AND user_id = ?`, [customer_package_id, req.userId]);
    const usages = contract ? await getUsages(db, contract.id) : [];
    const packageIssue = packageError(contract, { userId: req.userId, petId: pet_id, serviceId: service_id, date }, usages);
    if (packageIssue) return res.status(409).json({ error: packageIssue });
  }
  const conflict = await db.get(`SELECT id FROM appointments WHERE (service_id = ? OR pet_id = ?) AND date = ? AND time = ? AND status NOT IN ('cancelado', 'recusado')`, [service_id, pet_id, date, time]);
  if (conflict) return res.status(409).json({ error: "Este horário já está reservado. Escolha outro." });
  res.json({ estimate: estimate(service.price_cents, req.body.checkin_mode, req.body.checkout_mode, contract) });
}));

// GET /api/appointments  -> lista os agendamentos do usuario, com dados do pet e servico
router.get("/", asyncHandler(async (req, res) => {
  const rows = await db.all(
    `SELECT a.*, p.name as pet_name, p.photo_url as pet_photo, s.name as service_name
     FROM appointments a
     JOIN pets p ON p.id = a.pet_id
     JOIN services s ON s.id = a.service_id
     WHERE a.user_id = ?
     ORDER BY a.date DESC, a.time DESC`,
    [req.userId]
  );
  res.json({ appointments: rows });
}));

// POST /api/appointments
// { pet_id, service_id, date, time, checkin_mode, checkout_mode, address_id?, customer_package_id?, payment_method? }
router.post("/", asyncHandler(async (req, res) => {
  const { pet_id, service_id, date, time, checkin_mode, checkout_mode, address_id, customer_package_id, payment_method } = req.body;
  const error = selectionError(req.body);
  if (error) return res.status(400).json({ error });
  if (payment_method != null && !PAYMENT_METHODS.includes(payment_method)) return res.status(400).json({ error: "Forma de pagamento inválida." });

  const needsTransport = checkin_mode === "busca_em_casa" || checkout_mode === "entrega_em_casa";
  if (needsTransport) {
    if (typeof address_id !== "string" || !address_id) {
      return res.status(400).json({ error: "Informe o endereco para busca/entrega." });
    }
    const address = await db.get(`SELECT id FROM addresses WHERE id = ? AND user_id = ?`, [address_id, req.userId]);
    if (!address) return res.status(404).json({ error: "Endereco nao encontrado." });
  }

  // Verificacao de conflito e INSERT na mesma transacao, com a linha do servico
  // travada (FOR UPDATE): requisicoes simultaneas para o mesmo servico esperam
  // umas pelas outras, entao so a primeira consegue o horario.
  const id = uuid();
  const outcome = await db.transaction(async (tx) => {
    const service = await tx.get(`SELECT * FROM services WHERE id = ? FOR UPDATE`, [service_id]);
    if (!service) return { status: 404, error: "Servico nao encontrado." };

    // A trava do pet serializa novas reservas, inclusive para serviços/dias distintos.
    const pet = await tx.get(`SELECT * FROM pets WHERE id = ? AND user_id = ? AND deleted_at IS NULL FOR UPDATE`, [pet_id, req.userId]);
    if (!pet) return { status: 404, error: "Pet nao encontrado." };
    if (!serviceMatchesPet(service, pet)) {
      return { status: 400, error: "Escolha um servico compativel com o porte atual do pet." };
    }
    // Leitura atual após obter a trava: enxerga a criação que uma outra aba acabou de confirmar.
    if (await getActivePetAppointment(tx, pet_id, true)) {
      return { status: 409, error: PET_ACTIVE_APPOINTMENT_ERROR, code: "PET_HAS_ACTIVE_APPOINTMENT" };
    }

    let contract = null;
    if (customer_package_id) {
      contract = await tx.get(`SELECT * FROM customer_packages WHERE id = ? AND user_id = ? FOR UPDATE`, [customer_package_id, req.userId]);
      const usages = contract ? await getUsages(tx, contract.id, true) : [];
      const packageIssue = packageError(contract, { userId: req.userId, petId: pet_id, serviceId: service_id, date }, usages);
      if (packageIssue) return { status: 409, error: packageIssue };
    }

    const conflict = await tx.get(
      `SELECT id FROM appointments WHERE (service_id = ? OR pet_id = ?) AND date = ? AND time = ? AND status NOT IN ('cancelado', 'recusado') FOR UPDATE`,
      [service_id, pet_id, date, time]
    );
    if (conflict) return { status: 409, error: "Este horario acabou de ser reservado. Escolha outro." };

    const quote = estimate(service.price_cents, checkin_mode, checkout_mode, contract);
    if (quote.total_cents > 0 && !PAYMENT_METHODS.includes(payment_method)) {
      return { status: 400, error: "Escolha a forma de pagamento que pretende usar na loja." };
    }

    // Todo agendamento novo entra "em analise": o pet shop precisa conferir os
    // dados do dono/pet antes de confirmar (vira "agendado") ou recusar.
    await tx.run(
      `INSERT INTO appointments
        (id, user_id, pet_id, service_id, address_id, date, time, checkin_mode, checkout_mode,
         status, service_price_cents, pickup_fee_cents, total_cents, customer_package_id,
         package_covered_cents, payment_method, pickup_included, delivery_included)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'em_analise', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.userId, pet_id, service_id, needsTransport ? address_id : null, date, time, checkin_mode, checkout_mode,
       quote.service_price_cents, quote.pickup_fee_cents, quote.total_cents, contract?.id || null,
       quote.package_covered_cents, quote.total_cents > 0 ? payment_method : null,
       quote.pickup_included ? 1 : 0, quote.delivery_included ? 1 : 0]
    );
    if (contract) await tx.run(`INSERT INTO package_usages (id, customer_package_id, appointment_id, week_start) VALUES (?, ?, ?, ?)`,
      [uuid(), contract.id, id, weekStart(date)]);
    return null;
  });
  if (outcome) return res.status(outcome.status).json({ error: outcome.error, ...(outcome.code ? { code: outcome.code } : {}) });

  const appointment = await db.get(
    `SELECT a.*, p.name as pet_name, s.name as service_name
     FROM appointments a JOIN pets p ON p.id = a.pet_id JOIN services s ON s.id = a.service_id
     WHERE a.id = ?`,
    [id]
  );

  res.status(201).json({ appointment });
}));

// PATCH /api/appointments/:id/cancel
router.patch("/:id/cancel", asyncHandler(async (req, res) => {
  const outcome = await db.transaction(async (tx) => {
    const locked = await lockAppointment(tx, req.params.id, req.userId);
    if (!locked) return { status: 404, error: "Agendamento nao encontrado." };
    const { appointment, contract } = locked;
    if (appointment.status === "cancelado") return null;
    if (!["em_analise", "agendado"].includes(appointment.status)) {
      return { status: 409, error: "Este agendamento nao pode ser cancelado." };
    }
    if (contract && !canCancelInAdvance(appointment, contract.cancellation_notice_hours)) {
      return { status: 409, error: `O pacote exige aviso com ${contract.cancellation_notice_hours} horas de antecedência. Entre em contato com o pet shop para resolver o cancelamento.` };
    }
    await tx.run(`UPDATE appointments SET status = 'cancelado' WHERE id = ?`, [req.params.id]);
    await updatePackageUsage(tx, appointment, "cancelado");
    await queueAppointmentWhatsApp(tx, appointment, "cancelado", locked);
    return null;
  });
  if (outcome) return res.status(outcome.status).json({ error: outcome.error });
  res.json({ ok: true });
}));

export default router;
