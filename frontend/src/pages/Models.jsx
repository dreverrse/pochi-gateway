import { useEffect, useMemo, useState } from "react";
import { Boxes, History, Pencil, Plus, RefreshCw, Search, Star } from "lucide-react";

import { api } from "../api/client.js";
import { useUi } from "../app-context.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import ModelModal from "../components/ModelModal.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PriceHistoryModal from "../components/PriceHistoryModal.jsx";
import { TableSkeleton } from "../components/Skeleton.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { formatPrice } from "../utils/format.js";

export default function Models() {
  const { pushToast } = useUi();
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [historyModel, setHistoryModel] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    Promise.all([api.models(), api.providers()])
      .then(([modelData, providerData]) => {
        if (!active) return;
        setModels(modelData);
        setProviders(providerData);
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

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return models;
    return models.filter(
      (model) =>
        model.public_name.toLowerCase().includes(term) ||
        model.provider_model.toLowerCase().includes(term) ||
        model.provider_name.toLowerCase().includes(term),
    );
  }, [models, query]);

  async function patchModel(model, payload, successTitle) {
    setBusyId(model.id);
    try {
      const updated = await api.updateModel(model.id, payload);
      setModels((current) =>
        current.map((item) =>
          item.id === updated.id
            ? updated
            : updated.is_default
              ? { ...item, is_default: false }
              : item,
        ),
      );
      pushToast({ tone: "success", title: successTitle, message: updated.public_name });
    } catch (err) {
      pushToast({ tone: "error", title: "Gagal memperbarui model", message: err.message });
    } finally {
      setBusyId(null);
    }
  }

  function handleSaved(saved) {
    setModal(null);
    pushToast({ tone: "success", title: "Model tersimpan", message: saved.public_name });
    setReloadKey((value) => value + 1);
  }

  return (
    <div className="page">
      <PageHeader
        title="Models"
        description="Pemetaan nama model publik ke model provider. Harga dipakai untuk menghitung biaya request; nilai kosong ditampilkan sebagai Not configured."
        meta={
          models.length ? `${models.length} model · ${models.filter((m) => m.enabled).length} aktif` : null
        }
        actions={
          <>
            <label className="search-field inline">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari model"
                aria-label="Cari model"
              />
            </label>
            <button
              type="button"
              className="btn small"
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={loading}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {loading ? "Memuat" : "Muat ulang"}
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => setModal({ model: null })}
              disabled={!loading && providers.length === 0}
              title={providers.length === 0 ? "Tambahkan provider terlebih dahulu" : undefined}
            >
              <Plus size={15} aria-hidden="true" />
              Add Model
            </button>
          </>
        }
      />

      {error ? (
        <ErrorState
          title="Gagal memuat model"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      <section className="panel">
        {loading && models.length === 0 ? (
          <TableSkeleton rows={5} columns={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={models.length ? "Tidak ada model yang cocok" : "Belum ada model"}
            description={
              models.length
                ? "Ubah kata kunci pencarian."
                : providers.length === 0
                  ? "Tambahkan provider terlebih dahulu, lalu buat model gateway."
                  : "Tambahkan model pertama untuk mulai memakai gateway."
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Model ID</th>
                  <th scope="col">Provider</th>
                  <th scope="col" className="num">Pricing / 1M (in / out)</th>
                  <th scope="col">Availability</th>
                  <th scope="col">Streaming</th>
                  <th scope="col">Default</th>
                  <th scope="col" className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((model) => {
                  const provider = providers.find((item) => item.id === model.provider_id);
                  return (
                    <tr key={model.id}>
                      <td>
                        <div className="cell-strong">{model.public_name}</div>
                        <div className="cell-sub mono-sm">{model.provider_model}</div>
                      </td>
                      <td>
                        <div>{model.provider_name}</div>
                        <div className="cell-sub">
                          {provider?.has_secret ? "Key siap" : "Key belum ada"}
                        </div>
                      </td>
                      <td className="num">
                        {model.input_usd_per_million === null ||
                        model.input_usd_per_million === undefined ? (
                          <StatusBadge tone="neutral" label="Not configured" dot={false} />
                        ) : (
                          <span className="mono-sm">
                            {formatPrice(model.input_usd_per_million)} /{" "}
                            {formatPrice(model.output_usd_per_million)}
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`switch ${model.enabled ? "on" : ""}`}
                          onClick={() =>
                            patchModel(
                              model,
                              { enabled: !model.enabled },
                              model.enabled ? "Model dinonaktifkan" : "Model diaktifkan",
                            )
                          }
                          disabled={busyId === model.id}
                          aria-pressed={model.enabled}
                          aria-label={model.enabled ? "Nonaktifkan model" : "Aktifkan model"}
                        >
                          <span />
                        </button>
                        <span className="switch-label">{model.enabled ? "Active" : "Disabled"}</span>
                      </td>
                      <td>
                        <StatusBadge
                          tone={model.supports_streaming ? "ok" : "neutral"}
                          label={model.supports_streaming ? "SSE" : "Unknown"}
                        />
                      </td>
                      <td>
                        {model.is_default ? (
                          <StatusBadge tone="info" label="Default" />
                        ) : (
                          <button
                            type="button"
                            className="btn ghost tiny"
                            onClick={() =>
                              patchModel(model, { is_default: true }, "Model default diubah")
                            }
                            disabled={busyId === model.id}
                            title="Jadikan model default"
                          >
                            <Star size={13} aria-hidden="true" />
                            Set
                          </button>
                        )}
                      </td>
                      <td className="num">
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => setHistoryModel(model)}
                            title="Riwayat harga"
                          >
                            <History size={14} aria-hidden="true" />
                            Riwayat
                          </button>
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => setModal({ model })}
                          >
                            <Pencil size={14} aria-hidden="true" />
                            Edit
                          </button>
                        </div>
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
        <ModelModal
          model={modal.model}
          providers={providers}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      ) : null}

      {historyModel ? (
        <PriceHistoryModal model={historyModel} onClose={() => setHistoryModel(null)} />
      ) : null}
    </div>
  );
}
