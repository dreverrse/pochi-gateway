import { useEffect, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";

import { api } from "../api/client.js";
import ModelModal from "../components/ModelModal.jsx";
import { formatPrice } from "../utils/format.js";

export default function Models() {
  const [models, setModels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [modal, setModal] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const enabledCount = models.filter((model) => model.enabled).length;

  function handleSaved(saved) {
    setModal(null);
    setActionError("");
    setNotice(`Model "${saved.public_name}" disimpan.`);
    setReloadKey((value) => value + 1);
  }

  async function handleToggle(model) {
    setTogglingId(model.id);
    setActionError("");
    try {
      const updated = await api.updateModel(model.id, { enabled: !model.enabled });
      setModels((current) =>
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
          <p className="eyebrow">Katalog</p>
          <h2>Model gateway</h2>
          <p>
            Petakan nama model publik ke model milik provider. Nama publik dipakai klien
            di `/v1`, sedangkan nama provider dikirim ke upstream. Harga per 1M token
            dipakai untuk menghitung biaya request gateway.
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => setModal({ model: null })}
          disabled={!loading && providers.length === 0}
          title={providers.length === 0 ? "Tambahkan provider terlebih dahulu" : undefined}
        >
          <Plus size={16} aria-hidden="true" />
          Tambah model
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
            <h2>Gagal memuat model</h2>
            <p>{error}</p>
          </div>
          <button type="button" className="button" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={15} aria-hidden="true" />
            Coba lagi
          </button>
        </section>
      ) : null}

      <section className="panel models-panel">
        <header className="panel-head">
          <div>
            <h2>Model terdaftar</h2>
            <p>
              {models.length} model, {enabledCount} aktif
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

        {loading && models.length === 0 ? (
          <div className="loading-panel">
            <span className="spinner" aria-hidden="true" />
            <p>Memuat model...</p>
          </div>
        ) : models.length === 0 ? (
          <div className="empty-provider">
            <Boxes size={24} aria-hidden="true" />
            <p>
              {providers.length === 0
                ? "Tambahkan provider terlebih dahulu, lalu buat model gateway."
                : "Belum ada model. Tambahkan model pertama untuk mulai memakai gateway."}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="model-table">
              <thead>
                <tr>
                  <th scope="col">Model publik</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Model provider</th>
                  <th scope="col">Harga / 1M</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="numeric">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => {
                  const provider = providers.find((item) => item.id === model.provider_id);
                  return (
                    <tr key={model.id}>
                      <td>
                        <div className="model-public-name">{model.public_name}</div>
                        <div className="provider-meta">
                          <span className="provider-id">#{model.id}</span>
                        </div>
                      </td>
                      <td>
                        <div className="model-provider">{model.provider_name}</div>
                        <div className="provider-meta">
                          <span className={`chip ${provider?.has_secret ? "ok" : "muted"}`}>
                            {provider?.has_secret ? "Key siap" : "Key belum ada"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <code className="model-upstream">{model.provider_model}</code>
                      </td>
                      <td>
                        {model.input_usd_per_million === null ||
                        model.input_usd_per_million === undefined ? (
                          <span className="muted-text">Belum diatur</span>
                        ) : (
                          <div className="model-price">
                            <span>
                              in <strong>{formatPrice(model.input_usd_per_million)}</strong>
                            </span>
                            <span>
                              out <strong>{formatPrice(model.output_usd_per_million)}</strong>
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`status-chip ${model.enabled ? "on" : "off"}`}
                          onClick={() => handleToggle(model)}
                          disabled={togglingId === model.id}
                          aria-pressed={model.enabled}
                          title="Klik untuk mengubah status"
                        >
                          <span className="status-dot" aria-hidden="true" />
                          {model.enabled ? "Aktif" : "Nonaktif"}
                        </button>
                      </td>
                      <td className="actions-cell">
                        <div className="cell-actions">
                          <button
                            type="button"
                            className="button small"
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
    </div>
  );
}
