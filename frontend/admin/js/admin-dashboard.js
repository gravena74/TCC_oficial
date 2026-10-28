import { escapeHtml } from "../../js/html.js";
import { requireAdminAuth } from "./admin-auth.js";
import { renderAdminLayout } from "./admin-layout.js";
import { adminApi } from "./admin-api.js";
import { openAppointmentDetail, APPOINTMENT_STATUS_LABEL } from "./admin-appointment-detail.js";
import { formatCents, formatDateLong } from "../../js/format.js";

const admin = await requireAdminAuth();
if (admin) {
  renderAdminLayout("dashboard", admin.name || admin.username);
  init();
}

function renderStats(analytics) {
  const { totals } = analytics;
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

function renderToday(date, appointments) {
  document.getElementById("todayDateLabel").textContent = formatDateLong(date);
  document.getElementById("todayLoading").style.display = "none";

  if (appointments.length === 0) {
    document.getElementById("todayEmpty").style.display = "block";
    return;
  }

  document.getElementById("todayTableWrap").style.display = "block";
  document.getElementById("todayTableBody").innerHTML = appointments
    .map(
      (a) => `
      <tr data-id="${escapeHtml(a.id)}">
        <td><strong>${escapeHtml(a.time)}</strong></td>
        <td>
          <div class="admin-table__cell-main">
            <strong>${escapeHtml(a.client_name || "—")}</strong>
            <span>${escapeHtml(a.client_phone || "")}</span>
          </div>
        </td>
        <td>${escapeHtml(a.pet_name)}</td>
        <td>${escapeHtml(a.service_name)}</td>
        <td>${escapeHtml(formatCents(a.total_cents))}</td>
        <td><span class="admin-badge admin-badge--${escapeHtml(a.status)}">${escapeHtml(APPOINTMENT_STATUS_LABEL[a.status] || a.status)}</span></td>
      </tr>
    `
    )
    .join("");

  document.getElementById("todayTableBody").querySelectorAll("tr[data-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const appointment = appointments.find((a) => String(a.id) === row.dataset.id);
      if (appointment) openAppointmentDetail(appointment);
    });
  });
}

function renderPending(appointments) {
  document.getElementById("pendingLoading").style.display = "none";

  if (appointments.length === 0) {
    document.getElementById("pendingEmpty").style.display = "block";
    return;
  }

  document.getElementById("pendingTableWrap").style.display = "block";
  document.getElementById("pendingTableBody").innerHTML = appointments
    .slice(0, 6)
    .map(
      (a) => `
      <tr data-id="${escapeHtml(a.id)}">
        <td>
          <div class="admin-table__cell-main">
            <strong>${escapeHtml(a.client_name || "—")}</strong>
            <span>${escapeHtml(a.client_phone || "")}</span>
          </div>
        </td>
        <td>${escapeHtml(a.pet_name)}</td>
        <td>${escapeHtml(a.service_name)}</td>
        <td>${escapeHtml(formatDateLong(a.date))} às ${escapeHtml(a.time)}</td>
        <td>${escapeHtml(formatCents(a.total_cents))}</td>
        <td>
          <button type="button" class="admin-icon-btn admin-icon-btn--approve" data-action="agendado" title="Aceitar">
            <span class="material-symbols-rounded" aria-hidden="true">check</span>
          </button>
          <button type="button" class="admin-icon-btn admin-icon-btn--reject" data-action="recusado" title="Recusar">
            <span class="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </td>
      </tr>
    `
    )
    .join("");

  const tableBody = document.getElementById("pendingTableBody");

  tableBody.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const row = btn.closest("tr");
      btn.disabled = true;
      try {
        await adminApi.updateAppointmentStatus(row.dataset.id, btn.dataset.action);
        loadPending();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  });

  tableBody.querySelectorAll("tr[data-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const appointment = appointments.find((a) => String(a.id) === row.dataset.id);
      if (appointment) openAppointmentDetail(appointment, { onStatusChange: loadPending });
    });
  });
}

function loadPending() {
  document.getElementById("pendingLoading").style.display = "block";
  document.getElementById("pendingTableWrap").style.display = "none";
  document.getElementById("pendingEmpty").style.display = "none";
  adminApi.getPendingAppointments().then(({ appointments }) => renderPending(appointments));
}

function init() {
  adminApi.getTodayAppointments().then(({ date, appointments }) => renderToday(date, appointments));
  adminApi.getAnalytics().then((analytics) => renderStats(analytics));
  loadPending();
}
