import { clearAdminToken, getAdminToken } from "../auth.js";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && auth) {
    clearAdminToken();
    window.dispatchEvent(new Event("pochi:unauthorized"));
  }

  if (!response.ok) {
    let detail = `Request gagal (${response.status})`;
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") {
        detail = payload.detail;
      } else if (Array.isArray(payload.detail)) {
        const messages = payload.detail.map((item) => item.msg).filter(Boolean);
        if (messages.length) detail = messages.join(", ");
      }
    } catch {
      // Response tanpa JSON.
    }
    throw new Error(detail);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  health: () => request("/health", { auth: false }),
  login: (token) => request("/api/v1/admin/login", { method: "POST", body: { token }, auth: false }),
  summary: (days = 14) => request(`/api/v1/admin/summary?days=${days}`),
  timeseries: (days = 14) => request(`/api/v1/admin/usage/timeseries?days=${days}`),
  usageLogs: ({ days = 14, status = "all", model = "", keyId = "", page = 1, pageSize = 25 }) => {
    const params = new URLSearchParams({
      days: String(days),
      status,
      page: String(page),
      page_size: String(pageSize),
    });
    if (model) params.set("model", model);
    if (keyId) params.set("key_id", String(keyId));
    return request(`/api/v1/admin/usage/logs?${params}`);
  },
  providers: () => request("/api/v1/admin/providers"),
  createProvider: (payload) => request("/api/v1/admin/providers", { method: "POST", body: payload }),
  updateProvider: (providerId, payload) =>
    request(`/api/v1/admin/providers/${providerId}`, { method: "PATCH", body: payload }),
  testProvider: (providerId) =>
    request(`/api/v1/admin/providers/${providerId}/test`, { method: "POST" }),
  models: () => request("/api/v1/admin/models"),
  createModel: (payload) => request("/api/v1/admin/models", { method: "POST", body: payload }),
  updateModel: (modelId, payload) =>
    request(`/api/v1/admin/models/${modelId}`, { method: "PATCH", body: payload }),
  keys: () => request("/api/v1/admin/keys"),
  createKey: (payload) => request("/api/v1/admin/keys", { method: "POST", body: payload }),
  updateKey: (keyId, payload) =>
    request(`/api/v1/admin/keys/${keyId}`, { method: "PATCH", body: payload }),
  revokeKey: (keyId) =>
    request(`/api/v1/admin/keys/${keyId}/revoke`, { method: "POST" }),
  priceHistory: (providerModel) =>
    request(
      `/api/v1/admin/prices/history?provider_model=${encodeURIComponent(providerModel)}`,
    ),
  exportUsage: ({ format = "csv", days = 14, status = "all", model = "", keyId = "" } = {}) => {
    const params = new URLSearchParams({
      format,
      days: String(days),
      status,
    });
    if (model) params.set("model", model);
    if (keyId) params.set("key_id", String(keyId));
    const token = getAdminToken();
    const headers = { Accept: "application/octet-stream" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}/api/v1/admin/usage/export?${params}`, { headers });
  },
};
