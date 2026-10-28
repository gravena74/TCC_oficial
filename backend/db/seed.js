import "dotenv/config";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import { db } from "./database.js";

const services = [
  // Porte pequeno
  { name: "Pequeno - Banho", description: "Banho completo com produtos hipoalergenicos", price_cents: 5500, duration_min: 60, icon: "bath" },
  { name: "Pequeno - Banho + Hidratação", description: "Banho completo com hidratação", price_cents: 7000, duration_min: 75, icon: "bath" },
  { name: "Pequeno - Banho + Tosa + Hidratação", description: "Banho, tosa e hidratação completos", price_cents: 10000, duration_min: 120, icon: "scissors" },
  { name: "Pequeno - Banho e Tosa", description: "Banho completo com tosa higienica ou na tesoura", price_cents: 8500, duration_min: 90, icon: "scissors" },

  // Porte medio
  { name: "Médio - Banho", description: "Banho completo com produtos hipoalergenicos", price_cents: 7000, duration_min: 75, icon: "bath" },
  { name: "Médio - Banho + Hidratação", description: "Banho completo com hidratação", price_cents: 9500, duration_min: 90, icon: "bath" },
  { name: "Médio - Banho + Hidratação + Tosa", description: "Banho, hidratação e tosa completos", price_cents: 12000, duration_min: 135, icon: "scissors" },
  { name: "Médio - Banho e Tosa", description: "Banho completo com tosa higienica ou na tesoura", price_cents: 12000, duration_min: 120, icon: "scissors" },

  // Porte grande
  { name: "Grande - Banho + Tosa Higiênica", description: "A partir de - Banho completo com tosa higienica", price_cents: 18000, duration_min: 120, icon: "bath" },
  { name: "Grande - Banho e Tosa", description: "Banho completo com tosa higienica ou na tesoura", price_cents: 25000, duration_min: 150, icon: "scissors" },
];

// Credenciais padrao do admin em desenvolvimento. Troque a senha em producao
// (ou defina ADMIN_DEFAULT_PASSWORD no .env antes do primeiro start).
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || "admin123";

export async function seed() {
  const existing = await db.get(`SELECT COUNT(*) as c FROM services`);
  if (existing.c > 0) {
    console.log("Seed: servicos ja existem, nada a fazer.");
  } else {
    for (const s of services) {
      await db.run(
        `INSERT INTO services (id, name, description, price_cents, duration_min, icon) VALUES (?, ?, ?, ?, ?, ?)`,
        [uuid(), s.name, s.description, s.price_cents, s.duration_min, s.icon]
      );
    }
    console.log(`Seed: ${services.length} servicos inseridos.`);
  }

  // Templates iniciais sem desconto presumido; o administrador informa o valor combinado.
  const bathServices = await db.all(`SELECT * FROM services WHERE name LIKE '%Banho%'`);
  for (const service of bathServices) {
    const plan = await db.get(`SELECT id FROM package_plans WHERE service_id = ?`, [service.id]);
    if (!plan) await db.run(`INSERT INTO package_plans (id, name, service_id, price_cents) VALUES (?, ?, ?, ?)`,
      [uuid(), `4 banhos — ${service.name}`, service.id, service.price_cents * 4]);
  }

  const existingAdmin = await db.get(`SELECT COUNT(*) as c FROM admins`);
  if (existingAdmin.c > 0) {
    console.log("Seed: admin ja existe, nada a fazer.");
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  await db.run(
    `INSERT INTO admins (id, username, password_hash, name) VALUES (?, ?, ?, ?)`,
    [uuid(), DEFAULT_ADMIN_USERNAME, passwordHash, "Administrador"]
  );
  console.log(`Seed: admin padrao criado (usuario: ${DEFAULT_ADMIN_USERNAME}).`);
}

// Permite rodar `npm run seed` diretamente, alem de ser importado pelo server.js
if (process.argv[1] && process.argv[1].endsWith("seed.js")) {
  const { initDatabase } = await import("./database.js");
  await initDatabase();
  await seed();
  process.exit(0);
}
