import { useEffect, useState } from "react";
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";

import { api } from "../api/client.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import TokenRevealModal from "../components/TokenRevealModal.jsx";
import VirtualKeyModal from "../components/VirtualKeyModal.jsx";
import { formatBudget, formatDateTime } from "../utils/format.js";

const PERIOD_LABELS = {
  daily: "harian",
  monthly: "bulanan",
};

export default function APIKeys() {
  const [keys, setKeys] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [modal, setModal] = useState(null);
  const [created, setCreated] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    Promise.all([api.keys(), api.models()])
      .then(([keyData, modelData]) => {
        if (!active) return;
        setKeys(keyData);
        setModels(modelData);
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

  const activeCount = keys.filter((key) => !key.revoked_at && key.enabled).length;
  const revokedCount = keys.filter((key) => key.revoked_at).length;

  function handleSaved(saved, token) {
    setModal(null);
    setActionError("");
    setNotice(
      token
        ? `Key "${saved.name}" dibuat. Salin token yang ditampilkan sekarang.`
        : `Key "${saved.name}" diperbarui.`,
    );
    if (token) setCreated({ virtualKey: saved, token });
    setReloadKey((value) => value + 1);
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    setActionError("");
    try {
      const updated = await api.revokeKey(revokeTarget.id);
      setKeys((current) =>
        current
          .map((key) => (key.id === updated.id ? updated : key))
          .sort((a, b) => Number(Boolean(a.revoked_at)) - Number(Boolean(b.revoked_at))),
      );
      setNotice(`Key "${updated.name}" telah dicabut dan tidak dapat dipakai lagi.`);
      setRevokeTarget(null);
    } catch (err) {
      setRevokeTarget(null);
      setActionError(err.message);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Akses klien</p>
          <h2>Virtual API keys</h2>
          <p>
            Key ini dipakai aplikasi klien untuk memanggil gateway. Server hanya menyimpan
            hash token; token lengkap ditampilkan sekali saat key dibuat.
          </p>
        </div>
        <button type="button" className="button primary" onClick={() => setModal({ virtualKey: null })}>
          <Plus size={16} aria-hidden="true" />
          Buat key
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
            <h2>Gagal memuat virtual key</h2>
            <p>{error}</p>
          </div>
          <button type="button" className="button" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={15} aria-hidden="true" />
            Coba lagi
          </button>
        </section>
      ) : null}

      <section className="panel keys-panel">
        <header className="panel-head">
          <div>
            <h2>Key terdaftar</h2>
            <p>
              {keys.length} key, {activeCount} aktif, {revokedCount} dicabut
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

        {loading && keys.length === 0 ? (
          <div className="loading-panel">
            <span className="spinner" aria-hidden="true" />
            <p>Memuat virtual key...</p>
          </div>
        ) : keys.length === 0 ? (
          <div className="empty-provider">
            <KeyRound size={24} aria-hidden="true" />
            <p>Belum ada virtual key. Buat key pertama untuk memberi akses ke gateway.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="key-table">
              <thead>
                <tr>
                  <th scope="col">Nama</th>
                  <th scope="col">Prefix</th>
                  <th scope="col">Model</th>
                  <th scope="col">Anggaran</th>
                  <th scope="col">Status</th>
                  <th scope="col">Terakhir dipakai</th>
                  <th scope="col" className="numeric">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const revoked = Boolean(key.revoked_at);
                  const visibleModels = key.allowed_models.slice(0, 2);
                  const hiddenModels = key.allowed_models.length - visibleModels.length;

                  return (
                    <tr key={key.id} className={revoked ? "revoked-row" : ""}>
                      <td>
                        <div className="key-name">{key.name}</div>
                        <div className="provider-meta">
                          <span className="provider-id">#{key.id}</span>
                        </div>
                      </td>
                      <td>
                        <code className="key-prefix" title="Hanya prefix yang ditampilkan">
                          {key.key_prefix}…
                        </code>
                      </td>
                      <td>
                        {key.allowed_models.length === 0 ? (
                          <span className="chip muted">Semua model</span>
                        ) : (
                          <div className="model-chips">
                            {visibleModels.map((model) => (
                              <span key={model} className="model-chip" title={model}>
                                {model}
                              </span>
                            ))}
                            {hiddenModels > 0 ? (
                              <span
                                className="model-chip more"
                                title={key.allowed_models.join(", ")}
                              >
                                +{hiddenModels}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="budget-cell">
                          <strong>{formatBudget(key.budget_limit_usd)}</strong>
                          {key.budget_limit_usd !== null ? (
                            <span>/ {PERIOD_LABELS[key.budget_period] ?? key.budget_period}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {revoked ? (
                          <span className="status-chip revoked">
                            <span className="status-dot" aria-hidden="true" />
                            Dicabut
                          </span>
                        ) : (
                          <span className={`status-chip ${key.enabled ? "on" : "off"}`}>
                            <span className="status-dot" aria-hidden="true" />
                            {key.enabled ? "Aktif" : "Nonaktif"}
                          </span>
                        )}
                      </td>
                      <td className="time-cell">{formatDateTime(key.last_used_at)}</td>
                      <td className="actions-cell">
                        {revoked ? (
                          <span className="muted-text">—</span>
                        ) : (
                          <div className="cell-actions">
                            <button
                              type="button"
                              className="button small"
                              onClick={() => setModal({ virtualKey: key })}
                            >
                              <Pencil size={14} aria-hidden="true" />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="button small danger-ghost"
                              onClick={() => setRevokeTarget(key)}
                            >
                              <Ban size={14} aria-hidden="true" />
                              Cabut
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal ? (
        <VirtualKeyModal
          virtualKey={modal.virtualKey}
          models={models}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      ) : null}

      {created ? (
        <TokenRevealModal
          virtualKey={created.virtualKey}
          token={created.token}
          onClose={() => setCreated(null)}
        />
      ) : null}

      {revokeTarget ? (
        <ConfirmDialog
          title="Cabut virtual key?"
          message={`Key "${revokeTarget.name}" akan langsung dinonaktifkan dan tidak dapat dipakai lagi. Tindakan ini permanen.`}
          confirmLabel="Cabut key"
          busy={revoking}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={handleRevoke}
        />
      ) : null}
    </div>
  );
}
