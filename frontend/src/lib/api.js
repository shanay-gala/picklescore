import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const TOKEN_KEY = "picklewave.token";
const ROLE_KEY = "picklewave.role";
const NAME_KEY = "picklewave.name";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function getRole() {
  return localStorage.getItem(ROLE_KEY);
}
export function getName() {
  return localStorage.getItem(NAME_KEY);
}
export function setAuth({ access_token, role, name }) {
  localStorage.setItem(TOKEN_KEY, access_token);
  localStorage.setItem(ROLE_KEY, role);
  if (name) localStorage.setItem(NAME_KEY, name);
}
export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(NAME_KEY);
}

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const t = getToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      // Only clear on auth-only routes
      // Do not force navigation here; components will decide
    }
    return Promise.reject(err);
  }
);

export const endpoints = {
  tournamentStatus: () => api.get("/tournament/status").then((r) => r.data),
  fixtures: () => api.get("/fixtures").then((r) => r.data),
  fixture: (id) => api.get(`/fixtures/${id}`).then((r) => r.data),
  teams: () => api.get("/teams").then((r) => r.data),
  leaderboard: () => api.get("/leaderboard").then((r) => r.data),

  refereeLogin: (pin) =>
    api.post("/auth/referee/login", { pin }).then((r) => r.data),

  createFixture: (payload) => api.post("/fixtures", payload).then((r) => r.data),
  deleteFixture: (id) => api.delete(`/fixtures/${id}`).then((r) => r.data),
  startFixture: (id) => api.post(`/fixtures/${id}/start`).then((r) => r.data),
  completeFixture: (id) => api.post(`/fixtures/${id}/complete`).then((r) => r.data),
  startRound: (fid, rn) =>
    api.post(`/fixtures/${fid}/rounds/${rn}/start`).then((r) => r.data),
  completeRound: (fid, rn) =>
    api.post(`/fixtures/${fid}/rounds/${rn}/complete`).then((r) => r.data),

  match: (id) => api.get(`/matches/${id}`).then((r) => r.data),
  updateMatch: (id, body) => api.put(`/matches/${id}`, body).then((r) => r.data),
  startMatch: (id) => api.post(`/matches/${id}/start`).then((r) => r.data),
  pauseMatch: (id) => api.post(`/matches/${id}/pause`).then((r) => r.data),
  resumeMatch: (id) => api.post(`/matches/${id}/resume`).then((r) => r.data),
  score: (id, side) =>
    api.post(`/matches/${id}/score`, null, { params: { side } }).then((r) => r.data),
  undo: (id) => api.post(`/matches/${id}/undo`).then((r) => r.data),
  finishMatch: (id) => api.post(`/matches/${id}/finish`).then((r) => r.data),
};

export function wsUrl() {
  const u = new URL(BACKEND_URL);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}/api/ws`;
}
