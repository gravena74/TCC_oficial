import { API_BASE_URL } from "../../js/config.js";

const TOKEN_KEY = "cafofo_admin_token";

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function adminLogout() {
  clearAdminToken();
  window.location.replace("login.html");
}

async function request(path, { method = "GET", body } = {}) {
  const headers = {};
  const token = getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE_URL}/admin${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // resposta sem corpo JSON
  }

  if (!res.ok) {
    throw new Error(data?.error || "Algo deu errado. Tente novamente.");
  }
  return data;
}

export const adminApi = {
  login: (username, password) =>
    request("/auth/login", { method: "POST", body: { username, password } }),
  me: () => request("/auth/me"),

  getTodayAppointments: () => request("/appointments/today"),
  getAppointmentsByDate: (date) => request(`/appointments?date=${date}`),
  getCalendarMonth: (month) => request(`/appointments/calendar?month=${month}`),
  getPendingAppointments: () => request("/appointments/pending"),
  getReviewAppointments: () => request("/appointments/review"),
  updateAppointmentStatus: (id, status) =>
    request(`/appointments/${id}/status`, { method: "PATCH", body: { status } }),

  getAnalytics: () => request("/analytics"),
  getPackages: () => request("/packages"),
  getPackageOptions: () => request("/packages/options"),
  createPackagePlan: (body) => request("/packages/plans", { method: "POST", body }),
  createPackage: (body) => request("/packages", { method: "POST", body }),
  updatePackageStatus: (id, status) => request(`/packages/${id}/status`, { method: "PATCH", body: { status } }),
};
