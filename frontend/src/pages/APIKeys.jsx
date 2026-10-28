import { useEffect, useState } from "react";
import { Ban, KeyRound, Pencil, Plus, RefreshCw } from "lucide-react";

import { api } from "../api/client.js";
import { useUi } from "../app-context.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { TableSkeleton } from "../components/Skeleton.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import TokenRevealModal from "../components/TokenRevealModal.jsx";
import VirtualKeyModal from "../components/VirtualKeyModal.jsx";
import { formatBudget, formatDateTime, formatUsd } from "../utils/format.js";

const PERIOD_LABELS = { daily: "harian", monthly: "bulanan" };

export default function APIKeys() {
  const { pushToast } = useUi();
  const [keys, setKeys] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  function handleSaved(saved, token) {
    setModal(null);
    if (token) setCreated({ virtualKey: saved, token });
    pushToast({
      tone: "success",
      title: token ? "Key dibuat" : "Key diperbarui",
      message: token ? `${saved.name} — salin token sekarang, hanya tampil sekali.` : saved.name,
    });
    setReloadKey((value) => value + 1);
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const updated = await api.revokeKey(revokeTarget.id);
      setKeys((current) =>
        current
          .map((key) => (key.id === updated.id ? updated : key))
          .sort((a, b) => Number(Boolean(a.revoked_at)) - Number(Boolean(b.revoked_at))),
      );
      pushToast({ tone: "success", title: "Key dicabut", message: `${updated.name} tidak bisa dipakai lagi.` });
      setRevokeTarget(null);
    } catch (err) {
      setRevokeTarget(null);
      pushToast({ tone: "error", title: "Gagal mencabut key", message: err.message });
    } finally {
      setRevoking(false);
    }
  }

  const activeCount = keys.filter((key) => !key.revoked_at && key.enabled).length;
  const revokedCount = keys.filter((key) => key.revoked_at).length;

  return (
    <div className="page">
      <PageHeader
        title="API Keys"
        description="Virtual key untuk klien. Server menyimpan hash SHA-256; token lengkap hanya tampil sekali saat dibuat. Key ini berbeda dari provider API key."
        meta={keys.length ? `${keys.length} key · ${activeCount} aktif · ${revokedCount} dicabut` : null}
        actions={
          <>
            <button
              type="button"
              className="btn small"
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={loading}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {loading ? "Memuat" : "Muat ulang"}
            </button>
            <button type="button" className="btn primary" onClick={() => setModal({ virtualKey: null })}>
              <Plus size={15} aria-hidden="true" />
              Create Key
            </button>
          </>
        }
      />

      {error ? (
        <ErrorState
          title="Gagal memuat virtual key"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      <section className="panel">
        {loading && keys.length === 0 ? (
          <TableSkeleton rows={4} columns={6} />
        ) : keys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="Belum ada virtual key"
            description="Buat key pertama untuk memberi akses ke gateway dengan batas model dan anggaran."
            action={
              <button type="button" className="btn primary" onClick={() => setModal({ virtualKey: null })}>
                <Plus size={15} aria-hidden="true" />
                Create Key
              </button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Prefix</th>
                  <th scope="col">Models</th>
                  <th scope="col">Budget</th>
                  <th scope="col">Rate limit</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created</th>
                  <th scope="col">Last used</th>
                  <th scope="col" className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const revoked = Boolean(key.revoked_at);
                  const visibleModels = key.allowed_models.slice(0, 2);
                  const hidden = key.allowed_models.length - visibleModels.length;
                  const limit = key.budget_limit_usd;
                  const spent = key.budget_spent_usd ?? 0;
                  const ratio = limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0;

                  return (
                    <tr key={key.id} className={revoked ? "row-muted" : ""}>
                      <td>
                        <div className="cell-strong">{key.name}</div>
                        <div className="cell-sub mono-sm">#{key.id}</div>
                      </td>
                      <td>
                        <code className="mono-sm" title="Hanya prefix yang ditampilkan">
                          {key.key_prefix}…
                        </code>
                      </td>
                      <td>
                        {key.allowed_models.length === 0 ? (
                          <StatusBadge tone="neutral" label="Semua model" dot={false} />
                        ) : (
                          <div className="chip-row">
                            {visibleModels.map((model) => (
                              <span key={model} className="chip" title={model}>
                                {model}
                              </span>
                            ))}
                            {hidden > 0 ? (
                              <span className="chip more" title={key.allowed_models.join(", ")}>
                                +{hidden}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="cell-strong">
                          {formatBudget(limit)}
                          {limit ? (
                            <span className="cell-sub"> / {PERIOD_LABELS[key.budget_period]}</span>
                          ) : null}
                        </div>
                        {limit ? (
                          <>
                            <div className="progress" aria-hidden="true">
                              <span
                                className={ratio >= 90 ? "warn" : ""}
                                style={{ width: `${ratio}%` }}
                              />
                            </div>
                            <div className="cell-sub">
                              {formatUsd(spent)} terpakai ({ratio}%)
                            </div>
                          </>
                        ) : (
                          <div className="cell-sub">{formatUsd(spent)} terpakai</div>
                        )}
                      </td>
                      <td>
                        {key.rate_limit_rpm === null || key.rate_limit_rpm === undefined ? (
                          <span className="cell-sub">Default</span>
                        ) : (
                          <span className="mono-sm">{key.rate_limit_rpm} / mnt</span>
                        )}
                      </td>
                      <td>
                        {revoked ? (
                          <StatusBadge tone="err" label="Revoked" />
                        ) : (
                          <StatusBadge tone={key.enabled ? "ok" : "neutral"} label={key.enabled ? "Active" : "Disabled"} />
                        )}
                      </td>
                      <td className="mono-sm">{formatDateTime(key.created_at)}</td>
                      <td className="mono-sm">{formatDateTime(key.last_used_at)}</td>
                      <td className="num">
                        {revoked ? (
                          <span className="cell-sub">—</span>
                        ) : (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn small"
                              onClick={() => setModal({ virtualKey: key })}
                            >
                              <Pencil size={14} aria-hidden="true" />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn small danger-ghost"
                              onClick={() => setRevokeTarget(key)}
                            >
                              <Ban size={14} aria-hidden="true" />
                              Revoke
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
          title="Revoke key ini?"
          message={`Key "${revokeTarget.name}" langsung dinonaktifkan dan tidak dapat diaktifkan kembali. Klien yang memakainya akan berhenti pada request berikutnya.`}
          confirmLabel="Revoke key"
          busy={revoking}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={handleRevoke}
        />
      ) : null}
    </div>
  );
}
