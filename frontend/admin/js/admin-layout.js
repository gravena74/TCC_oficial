import { escapeHtml } from "../../js/html.js";
import { adminLogout } from "./admin-api.js";

const NAV_ITEMS = [
  { key: "pacotes", href: "pacotes.html", icon: "inventory_2", label: "Pacotes dos Pets" },
  { key: "dashboard", href: "dashboard.html", icon: "today", label: "Agendamentos do Dia" },
  { key: "analise", href: "analise.html", icon: "monitoring", label: "Análise" },
  { key: "calendario", href: "calendario.html", icon: "calendar_month", label: "Calendário" },
  { key: "solicitacoes", href: "solicitacoes.html", icon: "fact_check", label: "Solicitações" },
];

export function renderAdminLayout(activeKey, adminName) {
  const sidebar = document.getElementById("adminSidebar");
  const topbar = document.getElementById("adminTopbar");
  const active = NAV_ITEMS.find((item) => item.key === activeKey);

  sidebar.innerHTML = `
    <div class="admin-logo">
      <span class="admin-logo__badge material-symbols-rounded" aria-hidden="true">pets</span>
      <div>
        <strong>Cafofo do Pet</strong>
        <span>Painel Admin</span>
      </div>
    </div>
    <nav class="admin-nav">
      ${NAV_ITEMS.map(
        (item) => `
        <a href="${item.href}" class="admin-nav__item ${item.key === activeKey ? "admin-nav__item--active" : ""}">
          <span class="material-symbols-rounded" aria-hidden="true">${item.icon}</span>
          <span>${item.label}</span>
        </a>`
      ).join("")}
    </nav>
    <button class="admin-nav__logout" id="adminLogoutBtn" type="button">
      <span class="material-symbols-rounded" aria-hidden="true">logout</span>
      <span>Sair</span>
    </button>
  `;

  topbar.innerHTML = `
    <button class="admin-menu-toggle" id="adminMenuToggle" type="button" aria-label="Abrir menu">
      <span class="material-symbols-rounded" aria-hidden="true">menu</span>
    </button>
    <div class="admin-topbar__title">
      <h1>${active ? active.label : ""}</h1>
    </div>
    <div class="spacer"></div>
    <div class="admin-topbar__profile">
      <span class="material-symbols-rounded" aria-hidden="true">account_circle</span>
      <span>${escapeHtml(adminName || "Administrador")}</span>
    </div>
  `;

  document.getElementById("adminLogoutBtn").addEventListener("click", adminLogout);
  document.getElementById("adminMenuToggle").addEventListener("click", () => {
    document.body.classList.toggle("admin-sidebar-open");
  });
}
