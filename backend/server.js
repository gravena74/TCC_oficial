import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import authRoutes from "./routes/auth.js";
import petsRoutes from "./routes/pets.js";
import vaccinesRoutes from "./routes/vaccines.js";
import servicesRoutes from "./routes/services.js";
import addressesRoutes from "./routes/addresses.js";
import appointmentsRoutes from "./routes/appointments.js";
import adminAuthRoutes from "./routes/adminAuth.js";
import adminRoutes from "./routes/admin.js";
import { customerPackageRoutes, adminPackageRoutes } from "./routes/packages.js";
import { initDatabase } from "./db/database.js";
import { seed } from "./db/seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// garante que as tabelas e os servicos padrao existam no banco (MySQL/Aiven)
await initDatabase();
await seed();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsDir));

app.get("/api/health", (req, res) => res.json({ ok: true, service: "cafofo-do-pet-api" }));

app.use("/api/auth", authRoutes);
app.use("/api/pets", petsRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/addresses", addressesRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/packages", customerPackageRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin/packages", adminPackageRoutes);
app.use("/api/admin", adminRoutes);
// Fica por ultimo: usa o prefixo generico "/api" (rotas aninhadas de
// pets/:petId/vaccines e vaccines/:id) e aplica requireAuth a tudo que
// receber, entao precisa vir depois de qualquer rota mais especifica —
// caso contrario intercepta (e bloqueia com 401) todo o resto da API.
app.use("/api", vaccinesRoutes);

app.use((req, res) => res.status(404).json({ error: "Rota nao encontrada." }));

app.use((err, req, res, next) => {
  // Erros de validacao (ex: upload que nao e imagem, arquivo grande demais no
  // multer) sao culpa da requisicao: 400. O resto e erro interno: 500.
  const status = err.status || (err.name === "MulterError" ? 400 : 500);
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || "Erro interno do servidor." });
});

const PORT = process.env.PORT_SERVER || process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`Cafofo do Pet API rodando em http://localhost:${PORT}`);
});
