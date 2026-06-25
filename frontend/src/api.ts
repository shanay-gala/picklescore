// API client + auth helpers
import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
const API = `${BASE}/api`;

const TOKEN_KEY = "ps_token";
const USER_KEY = "ps_user";

export type AuthUser = {
  user_id: string;
  role: "admin" | "referee";
  name?: string;
  email?: string;
};

export async function saveAuth(token: string, user: AuthUser) {
  await storage.secureSet(TOKEN_KEY, token);
  await storage.setItem(USER_KEY, JSON.stringify(user));
}

export async function getToken(): Promise<string | null> {
  return storage.secureGet<string>(TOKEN_KEY, "" as any).then((v) => (v ? String(v) : null));
}

export async function getUser(): Promise<AuthUser | null> {
  const raw = await storage.getItem<string>(USER_KEY, "" as any);
  if (!raw) return null;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export async function clearAuth() {
  await storage.secureRemove(TOKEN_KEY);
  await storage.removeItem(USER_KEY);
}

async function request<T = any>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.auth !== false) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || res.statusText || "Request failed";
    throw new Error(typeof msg === "string" ? msg : "Request failed");
  }
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Auth
export async function adminLogin(email: string, password: string) {
  const data = await request<{ access_token: string; role: "admin"; user_id: string; name?: string }>(
    "/auth/admin/login",
    { method: "POST", body: JSON.stringify({ email, password }), auth: false },
  );
  await saveAuth(data.access_token, { user_id: data.user_id, role: "admin", name: data.name, email });
  return data;
}

export async function refereeLogin(pin: string) {
  const data = await request<{ access_token: string; role: "referee"; user_id: string; name?: string }>(
    "/auth/referee/login",
    { method: "POST", body: JSON.stringify({ pin }), auth: false },
  );
  await saveAuth(data.access_token, { user_id: data.user_id, role: "referee", name: data.name });
  return data;
}

// Teams / players / matches
export const api = {
  health: () => request("/health", { auth: false }),
  // teams
  listTeams: () => request<any[]>("/teams", { auth: false }),
  createTeam: (b: { name: string; captain_name?: string }) =>
    request("/teams", { method: "POST", body: JSON.stringify(b) }),
  updateTeam: (id: string, b: { name: string; captain_name?: string }) =>
    request(`/teams/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteTeam: (id: string) => request(`/teams/${id}`, { method: "DELETE" }),
  // players
  listPlayers: (teamId?: string) =>
    request<any[]>(`/players${teamId ? `?team_id=${teamId}` : ""}`, { auth: false }),
  createPlayer: (b: any) => request("/players", { method: "POST", body: JSON.stringify(b) }),
  updatePlayer: (id: string, b: any) =>
    request(`/players/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deletePlayer: (id: string) => request(`/players/${id}`, { method: "DELETE" }),
  // matches
  listMatches: (status?: string) =>
    request<any[]>(`/matches${status ? `?status_filter=${status}` : ""}`, { auth: false }),
  getMatch: (id: string) => request<any>(`/matches/${id}`, { auth: false }),
  createMatch: (b: any) => request("/matches", { method: "POST", body: JSON.stringify(b) }),
  updateMatch: (id: string, b: any) =>
    request(`/matches/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteMatch: (id: string) => request(`/matches/${id}`, { method: "DELETE" }),
  startMatch: (id: string) => request(`/matches/${id}/start`, { method: "POST" }),
  scorePoint: (id: string, side: "a" | "b") =>
    request(`/matches/${id}/score?side=${side}`, { method: "POST" }),
  undoPoint: (id: string) => request(`/matches/${id}/undo`, { method: "POST" }),
  finishMatch: (id: string) => request(`/matches/${id}/finish`, { method: "POST" }),
  leaderboard: () => request<any[]>("/leaderboard", { auth: false }),
  listReferees: () => request<any[]>("/referees"),
  createReferee: (b: { name: string; pin: string }) =>
    request("/referees", { method: "POST", body: JSON.stringify(b) }),
  deleteReferee: (id: string) => request(`/referees/${id}`, { method: "DELETE" }),
};

// WebSocket for live updates
export function buildWsUrl() {
  if (!BASE) return "";
  // Convert https:// to wss:// and http:// to ws://
  const wsBase = BASE.replace(/^http/, "ws");
  return `${wsBase}/api/ws`;
}
