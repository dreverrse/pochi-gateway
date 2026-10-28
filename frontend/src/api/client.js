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

function windowQuery({ days, hours }) {
  const params = new URLSearchParams();
  if (hours) {
    params.set("hours", String(hours));
  } else {
    params.set("days", String(days ?? 14));
  }
  return params;
}

function logQuery({ days, hours, status = "all", model = "", keyId = "", providerId = "", search = "" }) {
  const params = windowQuery({ days, hours });
  params.set("status", status);
  if (model) params.set("model", model);
  if (keyId) params.set("key_id", String(keyId));
  if (providerId) params.set("provider_id", String(providerId));
  if (search) params.set("search", search);
  return params;
}

export const api = {
  health: () => request("/health", { auth: false }),
  login: (token) => request("/api/v1/admin/login", { method: "POST", body: { token }, auth: false }),
  summary: (range) => request(`/api/v1/admin/summary?${windowQuery(range)}`),
  timeseries: (range) => request(`/api/v1/admin/usage/timeseries?${windowQuery(range)}`),
  analytics: ({ status = "all", providerId = "", model = "", keyId = "", ...range } = {}) => {
    const params = windowQuery(range);
    params.set("status", status);
    if (providerId) params.set("provider_id", String(providerId));
    if (model) params.set("model", model);
    if (keyId) params.set("key_id", String(keyId));
    return request(`/api/v1/admin/analytics?${params}`);
  },
  providerStats: (range) => request(`/api/v1/admin/providers/stats?${windowQuery(range)}`),
  settings: () => request("/api/v1/admin/settings"),
  usageLogs: ({ page = 1, pageSize = 25, ...filters } = {}) => {
    const params = logQuery(filters);
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    return request(`/api/v1/admin/usage/logs?${params}`);
  },
  providerTemplates: () => request("/api/v1/admin/provider-templates"),
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
  conversations: (search = "") => {
    const suffix = search ? `?search=${encodeURIComponent(search)}` : "";
    return request(`/api/v1/admin/conversations${suffix}`);
  },
  conversation: (conversationId) => request(`/api/v1/admin/conversations/${conversationId}`),
  createConversation: (payload) =>
    request("/api/v1/admin/conversations", { method: "POST", body: payload }),
  updateConversation: (conversationId, payload) =>
    request(`/api/v1/admin/conversations/${conversationId}`, { method: "PATCH", body: payload }),
  deleteConversation: (conversationId) =>
    request(`/api/v1/admin/conversations/${conversationId}`, { method: "DELETE" }),
  clearConversation: (conversationId) =>
    request(`/api/v1/admin/conversations/${conversationId}/clear`, { method: "POST" }),
  stopChat: (conversationId) =>
    request(`/api/v1/admin/conversations/${conversationId}/stop`, { method: "POST" }),
  deleteConversationMessage: (conversationId, messageId) =>
    request(`/api/v1/admin/conversations/${conversationId}/messages/${messageId}`, {
      method: "DELETE",
    }),
  workflows: () => request("/api/v1/admin/workflows"),  workflow: (workflowId) => request(`/api/v1/admin/workflows/${workflowId}`),
  createWorkflow: (payload) =>
    request("/api/v1/admin/workflows", { method: "POST", body: payload }),
  updateWorkflow: (workflowId, payload) =>
    request(`/api/v1/admin/workflows/${workflowId}`, { method: "PATCH", body: payload }),
  deleteWorkflow: (workflowId) =>
    request(`/api/v1/admin/workflows/${workflowId}`, { method: "DELETE" }),
  runWorkflow: (workflowId, input) =>
    request(`/api/v1/admin/workflows/${workflowId}/run`, {
      method: "POST",
      body: { input: input ?? {} },
    }),
  workflowRuns: (workflowId) =>
    request(`/api/v1/admin/workflows/${workflowId}/runs`),
  workflowRun: (runId) => request(`/api/v1/admin/workflows/runs/${runId}`),
  priceHistory: (providerModel) =>
    request(
      `/api/v1/admin/prices/history?provider_model=${encodeURIComponent(providerModel)}`,
    ),
  exportUsage: (filters = {}) => {
    const params = logQuery(filters);
    params.set("format", filters.format ?? "csv");
    const token = getAdminToken();
    const headers = { Accept: "application/octet-stream" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}/api/v1/admin/usage/export?${params}`, { headers });
  },
};


const CHAT_IDLE_TIMEOUT_MS = 120000;

export async function chatCompletion({
  model,
  messages,
  conversationId = null,
  userMessage = null,
  temperature = null,
  maxTokens = null,
  stream = true,
  signal,
  onDelta,
  onMeta,
}) {
  const token = getAdminToken();
  const body = { model, messages, stream };
  if (conversationId) body.conversation_id = conversationId;
  if (userMessage) body.user_message = userMessage;
  if (temperature !== null && temperature !== undefined) body.temperature = temperature;
  if (maxTokens) body.max_tokens = maxTokens;

  const response = await fetch(`${API_BASE}/api/v1/admin/chat`, {
    method: "POST",
    headers: {
      Accept: stream ? "text/event-stream" : "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let detail = `Chat gagal (${response.status})`;
    try {
      const payload = await response.json();
      detail = payload?.error?.message ?? payload?.detail ?? detail;
    } catch {
      // Body bukan JSON.
    }
    if (response.status === 401) {
      clearAdminToken();
      window.dispatchEvent(new Event("pochi:unauthorized"));
    }
    throw new Error(detail);
  }

  if (!stream) {
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content ?? "";
    if (payload?.usage) onMeta?.(payload.usage);
    onDelta?.(content, content);
    return content;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let timedOut = false;

  // Watchdog: kalau gateway berhenti mengirim byte, batalkan supaya UI tidak
  // menggantung selamanya. Reset setiap chunk masuk.
  let watchdog = window.setTimeout(() => {
    timedOut = true;
    reader.cancel().catch(() => {});
  }, CHAT_IDLE_TIMEOUT_MS);

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(() => {
        timedOut = true;
        reader.cancel().catch(() => {});
      }, CHAT_IDLE_TIMEOUT_MS);
      buffer += decoder.decode(value, { stream: true });

      let index = buffer.indexOf("\n\n");
      while (index !== -1) {
        const chunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const event = JSON.parse(data);
            const delta = event?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              content += delta;
              onDelta?.(delta, content);
            }
            if (event?.usage) onMeta?.(event.usage);
          } catch {
            // Abaikan baris yang tidak bisa diparse.
          }
        }
        index = buffer.indexOf("\n\n");
      }
    }
  } finally {
    window.clearTimeout(watchdog);
  }

  if (timedOut) {
    throw new Error("Gateway tidak merespons selama 2 menit. Coba lagi atau tekan Stop.");
  }

  return content;
}
