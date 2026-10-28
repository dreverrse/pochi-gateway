import { useCallback, useEffect, useRef, useState } from "react";

import { api, chatCompletion } from "../api/client.js";
import ErrorState from "../components/ErrorState.jsx";
import ChatComposer from "../components/chat/ChatComposer.jsx";
import ChatHeader from "../components/chat/ChatHeader.jsx";
import ChatSettings from "../components/chat/ChatSettings.jsx";
import ChatSidebar from "../components/chat/ChatSidebar.jsx";
import EmptyChatState from "../components/chat/EmptyChatState.jsx";
import MessageList from "../components/chat/MessageList.jsx";

const COLLAPSE_KEY = "pochi_chat_side_collapsed";
const DEFAULT_SETTINGS = { temperature: null, maxTokens: null, systemPrompt: "", streaming: true };

function serverStamp() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function buildHistory(list) {
  return list
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        message.content &&
        message.status !== "error",
    )
    .slice(-30)
    .map((message) => ({ role: message.role, content: message.content }));
}

function settingsFromConversation(row) {
  return {
    temperature: row.temperature ?? null,
    maxTokens: row.max_tokens ?? null,
    systemPrompt: row.system_prompt ?? "",
    streaming: true,
  };
}

export default function Chat({ apiStatus }) {
  const [models, setModels] = useState([]);
  const [modelId, setModelId] = useState("");
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState("");
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const abortRef = useRef(null);
  const bufferRef = useRef("");
  const rafRef = useRef(0);
  const listRef = useRef(null);
  const bootedRef = useRef(false);
  const settingsTimer = useRef(0);
  const settingsSkipRef = useRef(true);
  const conversationRef = useRef(null);
  const modelRef = useRef("");
  const streamingRef = useRef(false);
  const requestSeq = useRef(0);

  conversationRef.current = conversationId;
  modelRef.current = modelId;
  streamingRef.current = streaming;

  const loadConversations = useCallback(async (term = "") => {
    try {
      const rows = await api.conversations(term.trim());
      setConversations(rows);
      return rows;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoadError("");
    api
      .models()
      .then((rows) => {
        if (!active) return;
        const enabled = rows.filter((row) => row.enabled);
        setModels(enabled);
        setModelId((current) => current || enabled[0]?.public_name || "");
      })
      .catch((err) => {
        if (active) setLoadError(err.message);
      });

    loadConversations("").then((rows) => {
      if (!active || bootedRef.current) return;
      bootedRef.current = true;
      const first = rows[0];
      if (first) openConversation(first.id);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      loadConversations("");
      return undefined;
    }
    const timer = window.setTimeout(() => loadConversations(search), 280);
    return () => window.clearTimeout(timer);
  }, [search, loadConversations]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // localStorage bisa diblokir; abaikan.
    }
  }, [collapsed]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 220;
    if (nearBottom) node.scrollTop = node.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    if (settingsSkipRef.current) {
      settingsSkipRef.current = false;
      return undefined;
    }
    const cid = conversationRef.current;
    if (!cid) return undefined;
    window.clearTimeout(settingsTimer.current);
    settingsTimer.current = window.setTimeout(async () => {
      setSavingSettings(true);
      try {
        const updated = await api.updateConversation(cid, {
          system_prompt: settings.systemPrompt,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
        });
        setConversations((current) =>
          current.map((item) => (item.id === cid ? { ...item, ...updated } : item)),
        );
      } catch (err) {
        setError(err.message);
      } finally {
        setSavingSettings(false);
      }
    }, 650);
    return () => window.clearTimeout(settingsTimer.current);
  }, [settings.systemPrompt, settings.temperature, settings.maxTokens]);

  function applyConversation(row) {
    setConversationId(row.id);
    setMessages(row.messages ?? []);
    setSettings(settingsFromConversation(row));
    settingsSkipRef.current = true;
    if (row.model) setModelId(row.model);
    setDraft("");
    setError("");
  }

  async function openConversation(id) {
    setHistoryOpen(false);
    if (streamingRef.current) return;
    try {
      const row = await api.conversation(id);
      applyConversation(row);
    } catch (err) {
      setError(err.message);
    }
  }

  function newConversation() {
    requestSeq.current += 1;
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setError("");
    setHistoryOpen(false);
  }

  function patchSettings(patch) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function handleModelChange(next) {
    setModelId(next);
    const cid = conversationRef.current;
    if (!cid) return;
    api
      .updateConversation(cid, { model: next })
      .then((updated) =>
        setConversations((current) =>
          current.map((item) => (item.id === cid ? { ...item, ...updated } : item)),
        ),
      )
      .catch((err) => setError(err.message));
  }

  async function handleRename(id, title) {
    try {
      const updated = await api.updateConversation(id, { title });
      setConversations((current) =>
        current.map((item) => (item.id === id ? { ...item, ...updated } : item)),
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteConversation(id);
      setConversations((current) => current.filter((item) => item.id !== id));
      if (conversationRef.current === id) newConversation();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTogglePin(item) {
    try {
      const updated = await api.updateConversation(item.id, { pinned: !item.pinned });
      setConversations((current) => {
        const next = current.map((row) => (row.id === item.id ? { ...row, ...updated } : row));
        return next.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return String(b.updated_at).localeCompare(String(a.updated_at));
        });
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleClear() {
    if (!conversationRef.current) return;
    try {
      const detail = await api.clearConversation(conversationRef.current);
      setMessages(detail.messages ?? []);
      setError("");
      setConversations((current) =>
        current.map((item) =>
          item.id === detail.id ? { ...item, ...detail, message_count: 0 } : item,
        ),
      );
    } catch (err) {
      setError(err.message);
    }
  }

  function stopGeneration() {
    const cid = conversationRef.current;
    if (cid) {
      // Minta server berhenti dulu; abort fetch hanya menutup koneksi browser.
      api.stopChat(cid).catch(() => {});
    }
    abortRef.current?.abort();
  }

  function pushDelta(_delta, full) {
    bufferRef.current = full;
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      const text = bufferRef.current;
      setMessages((current) => {
        if (!current.length) return current;
        const next = current.slice();
        const last = next[next.length - 1];
        if (!last || last.role !== "assistant") return current;
        next[next.length - 1] = { ...last, content: text };
        return next;
      });
    });
  }

  async function refreshConversation(id, { delay = 0, waitForReply = false, seq = null } = {}) {
    // Setelah Stop, server baru menulis baris asisten ketika mendeteksi klien
    // pergi. Coba beberapa kali, dan jangan timpa bubble "dihentikan" lokal
    // dengan riwayat yang belum punya balasan.
    const backoff = waitForReply ? [0, 700, 2000, 4500] : [0];
    let latest = null;

    for (let index = 0; index < backoff.length; index += 1) {
      const wait = delay + backoff[index];
      if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
      try {
        const row = await api.conversation(id);
        if (conversationRef.current !== id) return;
        if (seq !== null && seq !== requestSeq.current) return;
        latest = row;
        // Judul & metadata ikut diperbarui walau balasan belum ditulis server.
        setConversations((current) =>
          current.map((item) =>
            item.id === id ? { ...item, ...row, messages: undefined } : item,
          ),
        );
        const list = row.messages ?? [];
        const tail = list[list.length - 1];
        if (!waitForReply || (tail && tail.role === "assistant")) break;
      } catch {
        // Biarkan pesan lokal tetap tampil; error jaringan sudah ditangani di tempat lain.
        return;
      }
    }

    if (!latest) return;
    if (seq !== null && seq !== requestSeq.current) return;
    const list = latest.messages ?? [];
    const tail = list[list.length - 1];
    if (waitForReply && !(tail && tail.role === "assistant")) return;

    setMessages(list);
  }

  async function ensureConversation() {
    if (conversationRef.current) return conversationRef.current;
    const created = await api.createConversation({
      model: modelRef.current,
      system_prompt: settings.systemPrompt,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
    });
    const row = { ...created, messages: undefined };
    setConversationId(created.id);
    setConversations((current) => [row, ...current]);
    return created.id;
  }

  async function streamRequest({ cid, history, userMessage }) {
    requestSeq.current += 1;
    const seq = requestSeq.current;
    const controller = new AbortController();
    abortRef.current = controller;
    bufferRef.current = "";
    setStreaming(true);
    setError("");

    const payload = settings.systemPrompt.trim()
      ? [{ role: "system", content: settings.systemPrompt.trim() }, ...history]
      : history;

    let aborted = false;
    try {
      await chatCompletion({
        model: modelRef.current,
        messages: payload,
        conversationId: cid,
        userMessage,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        stream: settings.streaming,
        signal: controller.signal,
        onDelta: pushDelta,
      });
    } catch (err) {
      if (err.name === "AbortError") {
        aborted = true;
        setMessages((current) => {
          if (!current.length) return current;
          const next = current.slice();
          const last = next[next.length - 1];
          if (!last || last.role !== "assistant") return current;
          next[next.length - 1] = { ...last, status: "stopped" };
          return next;
        });
      } else {
        setError(err.message);
      }
    } finally {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      abortRef.current = null;
      setStreaming(false);
      await refreshConversation(cid, { delay: 300, waitForReply: aborted, seq });
      loadConversations(search);
    }
  }

  async function send(raw) {
    const content = String(raw ?? "").trim();
    if (!content || streamingRef.current) return;
    requestSeq.current += 1;
    if (!modelRef.current) {
      setError("Belum ada model aktif. Tambahkan model di halaman Models.");
      return;
    }

    const history = buildHistory(messages);
    const cid = await ensureConversation().catch((err) => {
      setError(err.message);
      return null;
    });
    if (!cid) return;

    const stamp = serverStamp();
    setDraft("");
    setError("");
    setMessages((current) => [
      ...current,
      { id: `local-u-${Date.now()}`, role: "user", content, status: "complete", created_at: stamp },
      {
        id: `local-a-${Date.now()}`,
        role: "assistant",
        content: "",
        status: "streaming",
        model: modelRef.current,
        created_at: stamp,
      },
    ]);
    history.push({ role: "user", content });
    await streamRequest({ cid, history, userMessage: content });
  }

  async function regenerate(message) {
    if (streamingRef.current || !conversationRef.current) return;
    requestSeq.current += 1;
    const cid = conversationRef.current;
    const lastUser = [...messages].reverse().find((item) => item.role === "user");
    if (!lastUser) return;

    if (typeof message.id === "number") {
      try {
        await api.deleteConversationMessage(cid, message.id);
      } catch (err) {
        setError(err.message);
        return;
      }
    }

    const trimmed = messages.filter((item) => item.id !== message.id);
    const history = buildHistory(trimmed);
    setMessages([
      ...trimmed,
      {
        id: `local-a-${Date.now()}`,
        role: "assistant",
        content: "",
        status: "streaming",
        model: modelRef.current,
        created_at: serverStamp(),
      },
    ]);
    await streamRequest({ cid, history, userMessage: null });
  }

  const activeConversation = conversations.find((item) => item.id === conversationId) ?? null;
  const title = activeConversation?.title ?? "Chat baru";

  if (loadError) {
    return (
      <div className="page page-chat">
        <ErrorState title="Gagal memuat chat" message={loadError} />
      </div>
    );
  }

  return (
    <div className="page page-chat">
      <div className={`cw ${collapsed ? "is-side-collapsed" : ""}`}>
        <ChatSidebar
          conversations={conversations}
          activeId={conversationId}
          search={search}
          onSearch={setSearch}
          onNew={newConversation}
          onOpen={openConversation}
          onRename={handleRename}
          onDelete={handleDelete}
          onTogglePin={handleTogglePin}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          mobileOpen={historyOpen}
          onCloseMobile={() => setHistoryOpen(false)}
          apiStatus={apiStatus}
        />
        {historyOpen ? (
          <button
            type="button"
            className="cw-side-backdrop"
            onClick={() => setHistoryOpen(false)}
            aria-label="Tutup riwayat"
          />
        ) : null}

        <section className="cw-main">
          <ChatHeader
            title={title}
            onOpenHistory={() => setHistoryOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onClear={handleClear}
            apiStatus={apiStatus}
            streaming={streaming}
            hasConversation={Boolean(conversationId)}
          />

          <div className="cw-body">
            {messages.length === 0 ? (
              <EmptyChatState onPrompt={send} modelReady={Boolean(modelId)} />
            ) : (
              <MessageList
                messages={messages}
                streaming={streaming}
                onRegenerate={regenerate}
                listRef={listRef}
              />
            )}
          </div>

          {error ? (
            <div className="cw-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => setError("")} aria-label="Tutup pesan error">
                Tutup
              </button>
            </div>
          ) : null}

          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSend={() => send(draft)}
            onStop={stopGeneration}
            streaming={streaming}
            disabled={!modelId || models.length === 0}
            placeholder={
              modelId
                ? "Tanya Pochi apa saja…"
                : "Tambahkan model aktif dulu di halaman Models"
            }
            models={models}
            modelId={modelId}
            onModelChange={handleModelChange}
          />

          <ChatSettings
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            models={models}
            modelId={modelId}
            onModelChange={handleModelChange}
            settings={settings}
            onChange={patchSettings}
            onClear={() => {
              handleClear();
              setSettingsOpen(false);
            }}
            hasConversation={Boolean(conversationId)}
            saving={savingSettings}
          />
        </section>
      </div>
    </div>
  );
}
