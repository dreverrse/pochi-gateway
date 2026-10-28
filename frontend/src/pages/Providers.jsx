import { Fragment, useEffect, useState } from "react";
import {
  CheckCircle2,
  Pencil,
  PlugZap,
  Plus,
  RefreshCw,
  Server,
  TriangleAlert,
  X,
} from "lucide-react";

import { api } from "../api/client.js";
import ProviderModal from "../components/ProviderModal.jsx";

const ADAPTER_LABELS = {
  openai_compatible: "OpenAI compatible",
  inception: "Inception Labs",
};

export default function Providers() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [modal, setModal] = useState(null);
  const [testState, setTestState] = useState({});
  const [togglingId, setTogglingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    api
      .providers()
      .then((data) => {
        if (active) setProviders(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const enabledCount = providers.filter((provider) => provider.enabled).length;
  const secretCount = providers.filter((provider) => provider.has_secret).length;

  function handleSaved(saved, keyProvided) {
    setModal(null);
    setNotice(
      keyProvided
        ? `Provider "${saved.name}" disimpan dan API key dienkripsi.`
        : `Provider "${saved.name}" disimpan.`,
    );
    setReloadKey((value) => value + 1);
  }

  async function handleTest(provider) {
    setTestState((current) => ({
      ...current,
      [provider.id]: { loading: true, result: null },
    }));

    let result;
    try {
      result = await api.testProvider(provider.id);
    } catch (err) {
      result = { ok: false, message: err.message };
    }

    setTestState((current) => ({
      ...current,
      [provider.id]: { loading: false, result },
    }));
  }

  async function handleToggle(provider) {
    setTogglingId(provider.id);
    setActionError("");
    try {
      const updated = await api.updateProvider(provider.id, { enabled: !provider.enabled });
      setProviders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      setActionError(err.message);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Konfigurasi</p>
          <h2>Provider AI</h2>
          <p>
            Kelola endpoint provider dan API key. Key dienkripsi di server, tidak pernah
            dikirim kembali ke browser, dan tidak dicatat di log.
          </p>
        </div>
        <button type="button" className="button primary" onClick={() => setModal({ provider: null })}>
          <Plus size={16} aria-hidden="true" />
          Tambah provider
        </button>
      </section>

      {notice ? (
        <p className="notice success" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          {notice}
          <button type="button" className="notice-close" onClick={() => setNotice("")} aria-label="Tutup">
            <X size={14} />
          </button>
        </p>
      ) : null}

      {actionError ? (
        <p className="notice error" role="alert">
          <TriangleAlert size={16} aria-hidden="true" />
          {actionError}
          <button
            type="button"
            className="notice-close"
            onClick={() => setActionError("")}
            aria-label="Tutup"
          >
            <X size={14} />
          </button>
        </p>
      ) : null}

      {error ? (
        <section className="panel error-panel" role="alert">
          <TriangleAlert size={20} aria-hidden="true" />
          <div>
            <h2>Gagal memuat provider</h2>
            <p>{error}</p>
          </div>
          <button type="button" className="button" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={15} aria-hidden="true" />
            Coba lagi
          </button>
        </section>
      ) : null}

      <section className="panel providers-panel">
        <header className="panel-head">
          <div>
            <h2>Provider terdaftar</h2>
            <p>
              {providers.length} provider, {enabledCount} aktif, {secretCount} API key tersimpan
            </p>
          </div>
          <button
            type="button"
            className="button small"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {loading ? "Memuat..." : "Muat ulang"}
          </button>
        </header>

        {loading && providers.length === 0 ? (
          <div className="loading-panel">
            <span className="spinner" aria-hidden="true" />
            <p>Memuat provider...</p>
          </div>
        ) : providers.length === 0 ? (
          <div className="empty-provider">
            <Server size={24} aria-hidden="true" />
            <p>Belum ada provider. Tambahkan provider pertama untuk mulai menguji koneksi.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="provider-table">
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Base URL</th>
                  <th scope="col">API key</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="numeric">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => {
                  const test = testState[provider.id];
                  const meta = [];
                  if (test?.result?.status_code != null) meta.push(`HTTP ${test.result.status_code}`);
                  if (test?.result?.latency_ms != null) meta.push(`${test.result.latency_ms} ms`);
                  if (test?.result?.models_count != null) meta.push(`${test.result.models_count} model`);

                  return (
                    <Fragment key={provider.id}>
                      <tr>
                        <td>
                          <div className="provider-name">{provider.name}</div>
                          <div className="provider-meta">
                            <span className="adapter-tag">
                              {ADAPTER_LABELS[provider.adapter_type] ?? provider.adapter_type}
                            </span>
                            <span className="provider-id">#{provider.id}</span>
                          </div>
                        </td>
                        <td className="url-cell">
                          <code title={provider.base_url}>{provider.base_url}</code>
                        </td>
                        <td>
                          <span className={`chip ${provider.has_secret ? "ok" : "muted"}`}>
                            {provider.has_secret ? "Terenkripsi" : "Belum ada"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={`status-chip ${provider.enabled ? "on" : "off"}`}
                            onClick={() => handleToggle(provider)}
                            disabled={togglingId === provider.id}
                            aria-pressed={provider.enabled}
                            title="Klik untuk mengubah status"
                          >
                            <span className="status-dot" aria-hidden="true" />
                            {provider.enabled ? "Aktif" : "Nonaktif"}
                          </button>
                        </td>
                        <td className="actions-cell">
                          <div className="cell-actions">
                            <button
                              type="button"
                              className="button small"
                              onClick={() => handleTest(provider)}
                              disabled={Boolean(test?.loading)}
                            >
                              <PlugZap size={14} aria-hidden="true" />
                              {test?.loading ? "Menguji..." : "Tes"}
                            </button>
                            <button
                              type="button"
                              className="button small"
                              onClick={() => setModal({ provider })}
                            >
                              <Pencil size={14} aria-hidden="true" />
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>

                      {test?.result ? (
                        <tr className="test-row">
                          <td colSpan={5}>
                            <div className={`test-result ${test.result.ok ? "ok" : "fail"}`}>
                              {test.result.ok ? (
                                <CheckCircle2 size={15} aria-hidden="true" />
                              ) : (
                                <TriangleAlert size={15} aria-hidden="true" />
                              )}
                              <span>{test.result.message}</span>
                              {meta.length ? <span className="test-meta">{meta.join(" · ")}</span> : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal ? (
        <ProviderModal
          provider={modal.provider}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
