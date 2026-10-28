import { API_BASE_URL, API_ORIGIN } from "./config.js";

const TOKEN_KEY = "cafofo_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// Encerra a sessão local por completo: remove o token e todo o estado de
// navegação guardado em sessionStorage (agendamento em andamento, contexto de
// último agendamento confirmado), pra não vazar pro próximo login no
// mesmo navegador/aparelho.
export function logout() {
  clearToken();
  sessionStorage.clear();
}

// Caminhos vindos da API (ex: foto do pet) voltam relativos ("/uploads/x.jpg"),
// servidos pelo backend — que pode estar em uma origem diferente da do
// frontend estático. Resolve para URL absoluta usando a origem da API.
export function resolveAssetUrl(url) {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `${API_ORIGIN}${url}`;
}

async function request(path, { method = "GET", body, isFormData = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isFormData && body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
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

export const api = {
  login: (phone, name) => request("/auth/login", { method: "POST", body: { phone, name } }),
  me: () => request("/auth/me"),
  updateMe: (payload) => request("/auth/me", { method: "PATCH", body: payload }),

  getPets: () => request("/pets"),
  getPet: (id) => request(`/pets/${id}`),
  createPet: (formData) => request("/pets", { method: "POST", body: formData, isFormData: true }),
  updatePet: (id, formData) => request(`/pets/${id}`, { method: "PUT", body: formData, isFormData: true }),
  deletePet: (id) => request(`/pets/${id}`, { method: "DELETE" }),

  getVaccines: (petId) => request(`/pets/${petId}/vaccines`),
  createVaccine: (petId, payload) =>
    request(`/pets/${petId}/vaccines`, { method: "POST", body: payload }),
  updateVaccine: (id, payload) => request(`/vaccines/${id}`, { method: "PATCH", body: payload }),
  deleteVaccine: (id) => request(`/vaccines/${id}`, { method: "DELETE" }),

  getServices: () => request("/services"),
  getSlots: (serviceId, date) => request(`/services/${serviceId}/slots?date=${date}`),

  getAddresses: () => request("/addresses"),
  createAddress: (address) => request("/addresses", { method: "POST", body: address }),

  getAppointments: () => request("/appointments"),
  getPackages: () => request("/packages"),
  estimateAppointment: (payload) => request("/appointments/estimate", { method: "POST", body: payload }),
  createAppointment: (payload) => request("/appointments", { method: "POST", body: payload }),
  cancelAppointment: (id) => request(`/appointments/${id}/cancel`, { method: "PATCH" }),
};
