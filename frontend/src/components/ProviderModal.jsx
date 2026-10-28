import { useEffect, useState } from "react";
import { ExternalLink, KeyRound, Sparkles, X } from "lucide-react";

import { api } from "../api/client.js";

const ADAPTERS = [
  { value: "openai_compatible", label: "OpenAI compatible" },
  { value: "inception", label: "Inception Labs" },
];

export default function ProviderModal({ provider, template, templates, onClose, onSaved }) {
  const editing = Boolean(provider);
  const [preset, setPreset] = useState(!editing ? template ?? null : null);
  const [form, setForm] = useState({
    name: provider?.name ?? preset?.name ?? "",
    base_url: provider?.base_url ?? preset?.base_url ?? "",
    adapter_type: provider?.adapter_type ?? preset?.adapter_type ?? "openai_compatible",
    enabled: provider?.enabled ?? true,
    api_key: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !submitting) onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, submitting]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyTemplate(next) {
    setPreset(next);
    if (!next) return;
    setForm((current) => ({
      ...current,
      name: next.name,
      base_url: next.base_url,
      adapter_type: next.adapter_type,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const apiKey = form.api_key.trim();
    const payload = {
      name: form.name.trim(),
      base_url: form.base_url.trim(),
      adapter_type: form.adapter_type,
      enabled: form.enabled,
    };
    if (apiKey) payload.api_key = apiKey;

    try {
      const saved = editing
        ? await api.updateProvider(provider.id, payload)
        : await api.createProvider(payload);
      onSaved(saved, Boolean(apiKey));
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="provider-modal-title">
        <header className="modal-head">
          <div>
            <p className="eyebrow">Provider</p>
            <h2 id="provider-modal-title">
              {editing ? "Edit provider" : preset ? `Tambah ${preset.name}` : "Tambah provider"}
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup" disabled={submitting}>
            <X size={18} />
          </button>
        </header>

        <form className="modal-form" onSubmit={handleSubmit}>
          {!editing && templates?.length ? (
            <label className="field">
              <span>Isi dari preset</span>
              <select
                value={preset?.id ?? ""}
                onChange={(event) =>
                  applyTemplate(templates.find((item) => item.id === event.target.value) ?? null)
                }
              >
                <option value="">Tanpa preset</option>
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.category === "local" ? " (lokal)" : ""}
                  </option>
                ))}
              </select>
              <small>Memilih preset hanya mengisi nama, base URL, dan adapter. Bisa diubah manual.</small>
            </label>
          ) : null}

          {preset ? (
            <div className="preset-banner">
              <header>
                <Sparkles size={14} aria-hidden="true" />
                <strong>Preset {preset.name}</strong>
                <span className={`preset-tag ${preset.category === "local" ? "local" : ""}`}>
                  {preset.category === "local" ? "Lokal" : "Gratis"}
                </span>
              </header>
              <p>{preset.free_note}</p>
              <div className="preset-links">
                {preset.key_url ? (
                  <a href={preset.key_url} target="_blank" rel="noreferrer noopener">
                    <KeyRound size={12} aria-hidden="true" />
                    Ambil API key
                  </a>
                ) : null}
                {preset.docs_url ? (
                  <a href={preset.docs_url} target="_blank" rel="noreferrer noopener">
                    <ExternalLink size={12} aria-hidden="true" />
                    Dokumentasi
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          <label className="field">
            <span>Nama provider</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="OpenAI utama"
              maxLength={100}
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span>Base URL</span>
            <input
              type="url"
              value={form.base_url}
              onChange={(event) => update("base_url", event.target.value)}
              placeholder="https://api.openai.com/v1"
              maxLength={500}
              required
            />
            <small>
              Gunakan URL dasar API, biasanya berakhiran /v1. Path /models dipakai saat uji koneksi.
              {preset?.base_url.includes("ACCOUNT_ID")
                ? " Ganti ACCOUNT_ID dengan account ID akun kamu."
                : ""}
            </small>
          </label>

          <div className="form-row">
            <label className="field">
              <span>Adapter</span>
              <select
                value={form.adapter_type}
                onChange={(event) => update("adapter_type", event.target.value)}
              >
                {ADAPTERS.map((adapter) => (
                  <option key={adapter.value} value={adapter.value}>
                    {adapter.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => update("enabled", event.target.checked)}
              />
              <span>Aktif</span>
            </label>
          </div>

          <label className="field">
            <span>
              <KeyRound size={13} aria-hidden="true" /> API key {editing ? <em>opsional</em> : null}
            </span>
            <input
              type="password"
              value={form.api_key}
              onChange={(event) => update("api_key", event.target.value)}
              placeholder={editing ? "Kosongkan untuk mempertahankan key" : "sk-..."}
              autoComplete="new-password"
              maxLength={4096}
            />
            <small>
              Key dienkripsi sebelum disimpan dan tidak pernah dikirim kembali ke browser.
              {editing ? " Isi hanya jika ingin mengganti key." : ""}
            </small>
          </label>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <footer className="modal-actions">
            <button type="button" className="button" onClick={onClose} disabled={submitting}>
              Batal
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? "Menyimpan..." : editing ? "Simpan perubahan" : "Tambah provider"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
