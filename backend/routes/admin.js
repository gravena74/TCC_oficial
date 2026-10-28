import { Router } from "express";
import { db } from "../db/database.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { nowInShop, isPast, isValidDate, isValidMonth, isValidSlot } from "../utils/time.js";
import { APPOINTMENT_TRANSITIONS, serviceMatchesPet } from "../utils/appointments.js";
import { lockAppointment, updatePackageUsage } from "../utils/packages.js";
import { queueAppointmentWhatsApp } from "../utils/notifications.js";
import { whatsappTransport } from "../services/whatsapp.js";

const router = Router();
router.use(requireAdminAuth);

// Histórico técnico do canal externo, acessível somente ao administrador.
router.get("/notification-deliveries", asyncHandler(async (req, res) => {
  const deliveries = await db.all(
    `SELECT d.*, n.appointment_id, n.event_type, n.title, n.message
     FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
     ORDER BY d.created_at DESC, d.id DESC LIMIT 100`
  );
  res.set("Cache-Control", "no-store").json({ whatsapp_enabled: whatsappTransport.enabled, deliveries });
}));

const APPOINTMENT_STATUSES = ["em_analise", "agendado", "concluido", "cancelado", "recusado"];
// Estados que contam como negocio confirmado (usados nos graficos/estatisticas).
const CONFIRMED_STATUSES = "('agendado', 'concluido')";

// "Hoje" no fuso do pet shop: toISOString() e UTC, entao a partir das 21h
// (horario de Brasilia) o painel ja mostraria o dia seguinte.
function todayIso() {
  return nowInShop().date;
}

// Ultimos 12 meses no formato YYYY-MM, do mais antigo pro mais recente.
function last12Months() {
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

// Campos completos do pet, dono e endereco de busca/entrega, para o modal de
// detalhes do agendamento no painel admin.
const APPOINTMENT_DETAIL_SELECT = `
  a.*, u.name as client_name, u.phone as client_phone,
  p.name as pet_name, p.photo_url as pet_photo_url, p.breed as pet_breed,
  p.age_years as pet_age_years, p.size as pet_size,
  p.has_fleas_ticks as pet_has_fleas_ticks, p.has_allergy as pet_has_allergy,
  p.allows_perfume as pet_allows_perfume, p.been_to_petshop as pet_been_to_petshop,
  p.is_aggressive as pet_is_aggressive, p.has_fur_knots as pet_has_fur_knots,
  s.name as service_name,
  ad.street as address_street, ad.number as address_number,
  ad.neighborhood as address_neighborhood, ad.city as address_city,
  ad.state as address_state, ad.cep as address_cep
`;

// GET /api/admin/appointments/today
router.get("/appointments/today", asyncHandler(async (req, res) => {
  const date = todayIso();
  const appointments = await db.all(
    `SELECT ${APPOINTMENT_DETAIL_SELECT}
     FROM appointments a
     JOIN users u ON u.id = a.user_id
     JOIN pets p ON p.id = a.pet_id
     JOIN services s ON s.id = a.service_id
     LEFT JOIN addresses ad ON ad.id = a.address_id
     WHERE a.date = ? AND a.status NOT IN ('cancelado', 'recusado')
     ORDER BY a.time ASC`,
    [date]
  );
  res.json({ date, appointments });
}));

// GET /api/admin/appointments?date=YYYY-MM-DD
router.get("/appointments", asyncHandler(async (req, res) => {
  const date = req.query.date || todayIso();
  if (!isValidDate(date)) return res.status(400).json({ error: "Data invalida." });
  const appointments = await db.all(
    `SELECT ${APPOINTMENT_DETAIL_SELECT}
     FROM appointments a
     JOIN users u ON u.id = a.user_id
     JOIN pets p ON p.id = a.pet_id
     JOIN services s ON s.id = a.service_id
     LEFT JOIN addresses ad ON ad.id = a.address_id
     WHERE a.date = ? AND a.status NOT IN ('cancelado', 'recusado')
     ORDER BY a.time ASC`,
    [date]
  );
  res.json({ date, appointments });
}));

// GET /api/admin/appointments/calendar?month=YYYY-MM
router.get("/appointments/calendar", asyncHandler(async (req, res) => {
  const month = req.query.month === undefined ? todayIso().slice(0, 7) : req.query.month;
  if (!isValidMonth(month)) return res.status(400).json({ error: "Mes invalido (YYYY-MM)." });
  const rows = await db.all(
    `SELECT date, COUNT(*) as count
     FROM appointments
     WHERE date LIKE ? AND status NOT IN ('cancelado', 'recusado')
     GROUP BY date`,
    [`${month}-%`]
  );
  res.json({ month, days: rows });
}));

// GET /api/admin/appointments/pending  (agendamentos aguardando analise, para o dashboard)
router.get("/appointments/pending", asyncHandler(async (req, res) => {
  const appointments = await db.all(
    `SELECT ${APPOINTMENT_DETAIL_SELECT}
     FROM appointments a
     JOIN users u ON u.id = a.user_id
     JOIN pets p ON p.id = a.pet_id
     JOIN services s ON s.id = a.service_id
     LEFT JOIN addresses ad ON ad.id = a.address_id
     WHERE a.status = 'em_analise'
     ORDER BY a.date ASC, a.time ASC`
  );
  res.json({ appointments });
}));

// GET /api/admin/appointments/review  (tela de Solicitacoes: em analise, agendados e recusados)
router.get("/appointments/review", asyncHandler(async (req, res) => {
  const appointments = await db.all(
    `SELECT ${APPOINTMENT_DETAIL_SELECT}
     FROM appointments a
     JOIN users u ON u.id = a.user_id
     JOIN pets p ON p.id = a.pet_id
     JOIN services s ON s.id = a.service_id
     LEFT JOIN addresses ad ON ad.id = a.address_id
     WHERE a.status IN ('em_analise', 'agendado', 'recusado', 'concluido', 'cancelado')
     ORDER BY a.created_at DESC`
  );
  res.json({ appointments });
}));

// PATCH /api/admin/appointments/:id/status  { status }  (aprovar/recusar agendamento em analise)
router.patch("/appointments/:id/status", asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!APPOINTMENT_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Status invalido." });
  }

  // Ordem de travas igual a criacao: servico antes do agendamento/pet.
  const outcome = await db.transaction(async (tx) => {
    const locked = await lockAppointment(tx, req.params.id);
    if (!locked) return { status: 404, error: "Agendamento nao encontrado." };
    const { appointment: current, service, pet: lockedPet } = locked;
    if (current.status === status) return null;
    if (!APPOINTMENT_TRANSITIONS[current.status]?.includes(status)) {
      return { status: 409, error: "Esta transicao de status nao e permitida. Crie uma nova solicitacao para reagendar." };
    }
    if (status === "agendado") {
      if (!isValidDate(current.date) || !isValidSlot(current.time) || isPast(current.date, current.time)) {
        return { status: 409, error: "A data ou o horario desta solicitacao nao e mais valido." };
      }
      const pet = lockedPet;
      if (!pet || pet.deleted_at || !service || !serviceMatchesPet(service, pet)) {
        return { status: 409, error: "O pet ou o servico desta solicitacao precisa ser atualizado." };
      }
      const conflict = await tx.get(
        `SELECT id FROM appointments WHERE service_id = ? AND date = ? AND time = ? AND id <> ? AND status NOT IN ('cancelado', 'recusado') FOR UPDATE`,
        [current.service_id, current.date, current.time, current.id]
      );
      if (conflict) return { status: 409, error: "Este horario ja possui outra reserva." };
    }
    if (status === "concluido" && !isPast(current.date, current.time)) {
      return { status: 409, error: "O atendimento só pode ser concluído após o horário agendado." };
    }
    await tx.run(`UPDATE appointments SET status = ? WHERE id = ?`, [status, current.id]);
    await updatePackageUsage(tx, current, status);
    await queueAppointmentWhatsApp(tx, current, status, { pet: lockedPet, service });
    return null;
  });
  if (outcome) return res.status(outcome.status).json({ error: outcome.error });

  const appointment = await db.get(
    `SELECT ${APPOINTMENT_DETAIL_SELECT}
     FROM appointments a
     JOIN users u ON u.id = a.user_id
     JOIN pets p ON p.id = a.pet_id
     JOIN services s ON s.id = a.service_id
     LEFT JOIN addresses ad ON ad.id = a.address_id
     WHERE a.id = ?`,
    [req.params.id]
  );
  res.json({ appointment });
}));

// GET /api/admin/analytics
router.get("/analytics", asyncHandler(async (req, res) => {
  const months = last12Months();
  const sinceMonth = months[0];
  const sinceDate = `${sinceMonth}-01`;

  const [demandRows, revenueRows, pickupRows, clientsRows, totals, pending] = await Promise.all([
    db.all(
      `SELECT DATE_FORMAT(date, '%Y-%m') as month, COUNT(*) as count
       FROM appointments WHERE status IN ${CONFIRMED_STATUSES} AND date >= ?
       GROUP BY month`,
      [sinceDate]
    ),
    db.all(
      `SELECT month, SUM(total_cents) AS total_cents FROM (
         SELECT LEFT(date, 7) AS month, total_cents FROM appointments
         WHERE status IN ${CONFIRMED_STATUSES} AND date >= ?
         UNION ALL
         SELECT LEFT(starts_on, 7) AS month, price_cents AS total_cents FROM customer_packages
         WHERE activated_at IS NOT NULL AND starts_on >= ?
       ) estimates GROUP BY month`,
      [sinceDate, sinceDate]
    ),
    db.all(
      `SELECT DATE_FORMAT(date, '%Y-%m') as month,
              COALESCE(SUM(pickup_fee_cents),0) as total_cents,
              SUM(CASE WHEN checkin_mode = 'busca_em_casa' OR checkout_mode = 'entrega_em_casa' THEN 1 ELSE 0 END) as count
       FROM appointments WHERE status IN ${CONFIRMED_STATUSES} AND date >= ?
       GROUP BY month`,
      [sinceDate]
    ),
    db.all(
      `SELECT DATE_FORMAT(date, '%Y-%m') as month, COUNT(DISTINCT user_id) as count
       FROM appointments WHERE status IN ${CONFIRMED_STATUSES} AND date >= ?
       GROUP BY month`,
      [sinceDate]
    ),
    db.get(
      `SELECT COUNT(*) as appointments, COALESCE(SUM(total_cents),0) as revenue_cents,
              COUNT(DISTINCT user_id) as unique_clients
       FROM appointments WHERE status IN ${CONFIRMED_STATUSES} AND date >= ?`,
      [sinceDate]
    ),
    db.get(`SELECT COUNT(*) as c FROM appointments WHERE status = 'em_analise'`),
  ]);
  const packageTotals = await db.get(`SELECT COALESCE(SUM(price_cents), 0) AS total_cents
    FROM customer_packages WHERE activated_at IS NOT NULL AND starts_on >= ?`, [sinceDate]);

  const toMap = (rows, key) => Object.fromEntries(rows.map((r) => [r.month, r[key]]));
  const demandMap = toMap(demandRows, "count");
  const revenueMap = toMap(revenueRows, "total_cents");
  const pickupTotalMap = toMap(pickupRows, "total_cents");
  const pickupCountMap = toMap(pickupRows, "count");
  const clientsMap = toMap(clientsRows, "count");

  res.json({
    monthlyDemand: months.map((m) => ({ month: m, count: demandMap[m] || 0 })),
    monthlyRevenue: months.map((m) => ({ month: m, total_cents: revenueMap[m] || 0 })),
    monthlyPickupFee: months.map((m) => ({
      month: m,
      total_cents: pickupTotalMap[m] || 0,
      count: pickupCountMap[m] || 0,
    })),
    monthlyClients: months.map((m) => ({ month: m, count: clientsMap[m] || 0 })),
    totals: {
      appointments: totals.appointments,
      revenueCents: Number(totals.revenue_cents) + Number(packageTotals.total_cents),
      uniqueClients: totals.unique_clients,
      pendingAppointments: pending.c,
    },
  });
}));

export default router;
