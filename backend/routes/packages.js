import { Router } from "express";
import { v4 as uuid } from "uuid";
import { db } from "../db/database.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { serviceMatchesPet } from "../utils/appointments.js";
import { nowInShop } from "../utils/time.js";
import { addDays, describePackage, getUsages, PACKAGE_QUANTITY, PACKAGE_VALIDITY_DAYS } from "../utils/packages.js";

export const customerPackageRoutes = Router();
export const adminPackageRoutes = Router();
customerPackageRoutes.use(requireAuth);
adminPackageRoutes.use(requireAdminAuth);

async function listPackages(userId = null) {
  const contracts = await db.all(`SELECT cp.*, p.name AS pet_name, p.deleted_at AS pet_deleted_at,
    u.name AS client_name, u.phone AS client_phone, s.name AS service_name
    FROM customer_packages cp JOIN pets p ON p.id = cp.pet_id
    JOIN users u ON u.id = cp.user_id JOIN services s ON s.id = cp.service_id
    ${userId ? "WHERE cp.user_id = ?" : ""} ORDER BY cp.created_at DESC`, userId ? [userId] : []);
  const usages = await db.all(`SELECT pu.*, a.date, a.time, a.status AS appointment_status
    FROM package_usages pu JOIN appointments a ON a.id = pu.appointment_id
    ${userId ? "WHERE a.user_id = ?" : ""} ORDER BY a.date, a.time`, userId ? [userId] : []);
  return contracts.map((contract) => describePackage(contract, usages.filter((usage) => usage.customer_package_id === contract.id)));
}

customerPackageRoutes.get("/", asyncHandler(async (req, res) => {
  res.json({ packages: await listPackages(req.userId) });
}));

adminPackageRoutes.get("/", asyncHandler(async (req, res) => {
  res.json({ packages: await listPackages() });
}));

adminPackageRoutes.get("/options", asyncHandler(async (req, res) => {
  const [pets, plans, services] = await Promise.all([
    db.all(`SELECT p.id, p.name, p.size, p.user_id, u.name AS client_name, u.phone AS client_phone
      FROM pets p JOIN users u ON u.id = p.user_id WHERE p.deleted_at IS NULL ORDER BY u.name, p.name`),
    db.all(`SELECT pp.*, s.name AS service_name FROM package_plans pp JOIN services s ON s.id = pp.service_id ORDER BY pp.name`),
    db.all(`SELECT * FROM services ORDER BY name`),
  ]);
  res.json({ pets, plans, services: services.filter((service) => service.name.includes("Banho")) });
}));

adminPackageRoutes.post("/plans", asyncHandler(async (req, res) => {
  const { name, service_id, price_cents } = req.body;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 255 ||
      typeof service_id !== "string" || !Number.isSafeInteger(price_cents) || price_cents <= 0 || price_cents > 100000000) {
    return res.status(400).json({ error: "Informe nome, serviço e valor válido para o plano." });
  }
  const service = await db.get(`SELECT * FROM services WHERE id = ?`, [service_id]);
  if (!service || !service.name.includes("Banho")) return res.status(400).json({ error: "Escolha um serviço de banho." });
  const id = uuid();
  await db.run(`INSERT INTO package_plans (id, name, service_id, price_cents, quantity, validity_days) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name.trim(), service_id, price_cents, PACKAGE_QUANTITY, PACKAGE_VALIDITY_DAYS]);
  res.status(201).json({ plan: await db.get(`SELECT * FROM package_plans WHERE id = ?`, [id]) });
}));

adminPackageRoutes.post("/", asyncHandler(async (req, res) => {
  const { pet_id, plan_id, price_cents, includes_pickup = false, includes_delivery = false,
    cancellation_notice_hours = 24, notes = "" } = req.body;
  if (typeof pet_id !== "string" || typeof plan_id !== "string" || !Number.isSafeInteger(price_cents) ||
      price_cents <= 0 || price_cents > 100000000 || typeof includes_pickup !== "boolean" ||
      typeof includes_delivery !== "boolean" || !Number.isInteger(cancellation_notice_hours) ||
      cancellation_notice_hours < 0 || cancellation_notice_hours > 168 || typeof notes !== "string" || notes.length > 2000) {
    return res.status(400).json({ error: "Confira pet, plano, valor, transporte e antecedência (0 a 168 horas)." });
  }
  const id = uuid();
  const outcome = await db.transaction(async (tx) => {
    const plan = await tx.get(`SELECT * FROM package_plans WHERE id = ?`, [plan_id]);
    if (!plan) return { status: 404, error: "Plano não encontrado." };
    const service = await tx.get(`SELECT * FROM services WHERE id = ? FOR UPDATE`, [plan.service_id]);
    const pet = await tx.get(`SELECT * FROM pets WHERE id = ? AND deleted_at IS NULL FOR UPDATE`, [pet_id]);
    if (!pet) return { status: 404, error: "Pet não encontrado." };
    if (!serviceMatchesPet(service, pet)) return { status: 400, error: "Escolha um plano compatível com o porte do pet." };
    await tx.run(`INSERT INTO customer_packages
      (id, plan_id, user_id, pet_id, service_id, name, price_cents, quantity, validity_days,
       includes_pickup, includes_delivery, cancellation_notice_hours, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, plan.id, pet.user_id, pet.id, service.id, plan.name, price_cents, PACKAGE_QUANTITY,
        PACKAGE_VALIDITY_DAYS, includes_pickup ? 1 : 0, includes_delivery ? 1 : 0, cancellation_notice_hours, notes.trim(), req.adminId]);
    return null;
  });
  if (outcome) return res.status(outcome.status).json({ error: outcome.error });
  res.status(201).json({ package: await db.get(`SELECT * FROM customer_packages WHERE id = ?`, [id]) });
}));

adminPackageRoutes.patch("/:id/status", asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["ativo", "cancelado"].includes(status)) return res.status(400).json({ error: "Situação inválida." });
  const outcome = await db.transaction(async (tx) => {
    const ref = await tx.get(`SELECT * FROM customer_packages WHERE id = ?`, [req.params.id]);
    if (!ref) return { status: 404, error: "Contrato não encontrado." };
    const service = await tx.get(`SELECT * FROM services WHERE id = ? FOR UPDATE`, [ref.service_id]);
    const pet = await tx.get(`SELECT * FROM pets WHERE id = ? FOR UPDATE`, [ref.pet_id]);
    const contract = await tx.get(`SELECT * FROM customer_packages WHERE id = ? FOR UPDATE`, [ref.id]);
    if (contract.status === status) return null; // Repetir ativação não renova a validade.
    if (contract.status === "cancelado" || (status === "ativo" && contract.status !== "rascunho")) {
      return { status: 409, error: "Crie um novo contrato para renovar o pacote." };
    }
    if (status === "ativo") {
      if (!pet || pet.deleted_at || !serviceMatchesPet(service, pet)) return { status: 409, error: "O pet ou seu porte precisa ser atualizado antes da ativação." };
      const now = nowInShop();
      const expires = addDays(now.date, contract.validity_days);
      const overlap = await tx.get(`SELECT id FROM customer_packages WHERE pet_id = ? AND id <> ?
        AND status = 'ativo' AND starts_on < ? AND expires_on > ? FOR UPDATE`, [pet.id, contract.id, expires, now.date]);
      if (overlap) return { status: 409, error: "Este pet já possui um pacote ativo neste período." };
      await tx.run(`UPDATE customer_packages SET status = 'ativo', starts_on = ?, expires_on = ?, activated_at = ? WHERE id = ?`,
        [now.date, expires, `${now.date} ${now.time}:00`, contract.id]);
    } else {
      const usages = await getUsages(tx, contract.id, true);
      if (usages.some((usage) => usage.status === "reservado")) return { status: 409, error: "Resolva os agendamentos reservados antes de cancelar o contrato." };
      await tx.run(`UPDATE customer_packages SET status = 'cancelado' WHERE id = ?`, [contract.id]);
    }
    return null;
  });
  if (outcome) return res.status(outcome.status).json({ error: outcome.error });
  res.json({ package: await db.get(`SELECT * FROM customer_packages WHERE id = ?`, [req.params.id]) });
}));
