import { requireAdminAuth } from "./admin-auth.js";
import { renderAdminLayout } from "./admin-layout.js";
import { adminApi } from "./admin-api.js";
import { formatCents } from "../../js/format.js";

const admin = await requireAdminAuth();
if (admin) {
  renderAdminLayout("analise", admin.name || admin.username);
  init();
}

function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

const BRAND = {
  green: "#2E9E5B",
  greenSoft: "rgba(46, 158, 91, 0.15)",
  teal: "#1D6E73",
  tealSoft: "rgba(29, 110, 115, 0.15)",
  amber: "#B85F1E",
  amberSoft: "rgba(184, 95, 30, 0.15)",
  purple: "#4C3F9E",
  purpleSoft: "rgba(76, 63, 158, 0.15)",
};

function baseOptions(extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, grid: { color: "#F0FAF3" } },
    },
    ...extra,
  };
}

function renderStats(totals) {
  document.getElementById("statsGrid").innerHTML = `
    <div class="admin-stat-card admin-stat-card--a">
      <span class="admin-stat-card__icon material-symbols-rounded" aria-hidden="true">event_available</span>
      <span class="admin-stat-card__value">${totals.appointments}</span>
      <span class="admin-stat-card__label">Agendamentos (12 meses)</span>
    </div>
    <div class="admin-stat-card admin-stat-card--b">
      <span class="admin-stat-card__icon material-symbols-rounded" aria-hidden="true">payments</span>
      <span class="admin-stat-card__value">${formatCents(totals.revenueCents)}</span>
      <span class="admin-stat-card__label">Valores estimados (12 meses)</span>
    </div>
    <div class="admin-stat-card admin-stat-card--c">
      <span class="admin-stat-card__icon material-symbols-rounded" aria-hidden="true">group</span>
      <span class="admin-stat-card__value">${totals.uniqueClients}</span>
      <span class="admin-stat-card__label">Clientes ativos</span>
    </div>
    <div class="admin-stat-card admin-stat-card--d">
      <span class="admin-stat-card__icon material-symbols-rounded" aria-hidden="true">hourglass_top</span>
      <span class="admin-stat-card__value">${totals.pendingAppointments}</span>
      <span class="admin-stat-card__label">Agendamentos em análise</span>
    </div>
  `;
}

function init() {
  adminApi.getAnalytics().then((analytics) => {
    renderStats(analytics.totals);

    const labels = analytics.monthlyDemand.map((r) => monthLabel(r.month));

    new Chart(document.getElementById("demandChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Agendamentos",
            data: analytics.monthlyDemand.map((r) => r.count),
            backgroundColor: BRAND.green,
            borderRadius: 6,
            maxBarThickness: 28,
          },
        ],
      },
      options: baseOptions(),
    });

    new Chart(document.getElementById("revenueChart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Valores estimados",
            data: analytics.monthlyRevenue.map((r) => r.total_cents / 100),
            borderColor: BRAND.teal,
            backgroundColor: BRAND.tealSoft,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
          },
        ],
      },
      options: baseOptions({
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => formatCents(ctx.parsed.y * 100),
            },
          },
        },
      }),
    });

    new Chart(document.getElementById("pickupChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Nº de fretes",
            data: analytics.monthlyPickupFee.map((r) => r.count),
            backgroundColor: BRAND.amber,
            borderRadius: 6,
            maxBarThickness: 28,
          },
        ],
      },
      options: baseOptions(),
    });

    new Chart(document.getElementById("clientsChart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Clientes únicos",
            data: analytics.monthlyClients.map((r) => r.count),
            borderColor: BRAND.purple,
            backgroundColor: BRAND.purpleSoft,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
          },
        ],
      },
      options: baseOptions(),
    });
  });
}
