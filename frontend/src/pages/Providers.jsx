import { useEffect, useState } from "react";
import { ChevronDown, Plus, RefreshCw, Server, Sparkles } from "lucide-react";

import { api } from "../api/client.js";
import { useUi } from "../app-context.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import ProviderCard from "../components/ProviderCard.jsx";
import ProviderModal from "../components/ProviderModal.jsx";
import { CardSkeletons } from "../components/Skeleton.jsx";
import { rangeParams } from "../utils/range.js";

export default function Providers({ openAddSignal = 0 }) {
  const { range, pushToast } = useUi();
  const [providers, setProviders] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [testState, setTestState] = useState({});
  const [togglingId, setTogglingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [showPresets, setShowPresets] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .providerTemplates()
      .then((rows) => {
        if (active) setTemplates(rows);
      })
      .catch(() => {
        if (active) setTemplates([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const params = rangeParams(range);

    Promise.all([api.providers(), api.providerStats(params)])
      .then(([providerData, statsData]) => {
        if (!active) return;
        setProviders(providerData);
        setStats(statsData);
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
  }, [range, reloadKey]);

  useEffect(() => {
    if (openAddSignal > 0) setModal({ provider: null });
  }, [openAddSignal]);

  function handleSaved(saved, keyProvided) {    setModal(null);
    pushToast({
      tone: "success",
      title: "Provider tersimpan",
      message: keyProvided
        ? `${saved.name} disimpan, API key dienkripsi di server.`
        : `${saved.name} diperbarui.`,
    });
    setReloadKey((value) => value + 1);
  }

  async function handleTest(provider) {
    setTestState((current) => ({ ...current, [provider.id]: { loading: true, result: null } }));
    let result;
    try {
      result = await api.testProvider(provider.id);
    } catch (err) {
      result = { ok: false, message: err.message };
    }
    setTestState((current) => ({ ...current, [provider.id]: { loading: false, result } }));
    if (!result.ok) {
      pushToast({ tone: "error", title: "Uji koneksi gagal", message: result.message });
    }
  }

  async function handleToggle(provider) {
    setTogglingId(provider.id);
    try {
      const updated = await api.updateProvider(provider.id, { enabled: !provider.enabled });
      setProviders((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      pushToast({
        tone: "success",
        title: updated.enabled ? "Provider diaktifkan" : "Provider dinonaktifkan",
        message: updated.name,
      });
    } catch (err) {
      pushToast({ tone: "error", title: "Gagal mengubah status", message: err.message });
    } finally {
      setTogglingId(null);
    }
  }

  const enabledCount = providers.filter((provider) => provider.enabled).length;
  const statsById = Object.fromEntries(stats.map((row) => [row.provider_id, row]));

  return (
    <div className="page">
      <PageHeader
        title="Providers"
        description="Endpoint upstream dan API key provider. Key dienkripsi di server dan tidak pernah dikirim kembali ke browser."
        meta={
          providers.length
            ? `${providers.length} provider · ${enabledCount} aktif · ${providers.filter((p) => p.has_secret).length} key tersimpan`
            : null
        }
        actions={
          <button
            type="button"
            className="btn small"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {loading ? "Memuat" : "Muat ulang"}
          </button>
        }
      />

      {templates.length ? (
        <section className="panel preset-panel">
          <header className="preset-head">
            <div className="preset-head-copy">
              <h2>
                <Sparkles size={15} aria-hidden="true" />
                Preset provider gratis
              </h2>
              <p>Klik salah satu, base URL terisi otomatis. API key kamu tempel sendiri di modal.</p>
            </div>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setShowPresets((value) => !value)}
              aria-expanded={showPresets}
            >
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={showPresets ? "flip" : ""}
              />
              {showPresets ? "Sembunyikan" : "Tampilkan"}
            </button>
          </header>

          {showPresets ? (
            <div className="preset-strip">
              {templates.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="preset-chip"
                  title={`${item.free_note}${item.key_url ? ` — ${item.key_url}` : ""}`}
                  onClick={() => setModal({ provider: null, template: item })}
                >
                  <span
                    className={`preset-dot ${item.category === "local" ? "local" : ""}`}
                    aria-hidden="true"
                  />
                  {item.name}
                  <Plus size={11} aria-hidden="true" className="preset-chip-plus" />
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <ErrorState
          title="Gagal memuat provider"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      {loading && providers.length === 0 ? <CardSkeletons count={3} /> : null}

      {!loading && !error && providers.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={Server}
            title="Belum ada provider"
            description="Tambahkan endpoint pertama, lalu uji koneksinya dari kartu provider."
            action={
              <button type="button" className="btn primary" onClick={() => setModal({ provider: null })}>
                <Plus size={15} aria-hidden="true" />
                Add Provider
              </button>
            }
          />
        </section>
      ) : null}

      {providers.length > 0 ? (
        <div className="provider-grid">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              stats={statsById[provider.id]}
              test={testState[provider.id]}
              onTest={handleTest}
              onEdit={(item) => setModal({ provider: item })}
              onToggle={handleToggle}
              toggling={togglingId === provider.id}
            />
          ))}
        </div>
      ) : null}

      <p className="field-note">
        Penghapusan provider belum didukung backend: model yang masih terhubung akan menahan
        penghapusan. Nonaktifkan provider agar request baru tidak dirutekan ke sana.
      </p>

      {modal ? (
        <ProviderModal
          provider={modal.provider}
          template={modal.template}
          templates={templates}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
