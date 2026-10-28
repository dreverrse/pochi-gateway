import { useEffect, useState } from "react";
import { Boxes, X } from "lucide-react";

import { api } from "../api/client.js";

export default function ModelModal({ model, providers, onClose, onSaved }) {
  const editing = Boolean(model);
  const defaultProvider = providers[0]?.id;
  const [form, setForm] = useState({
    public_name: model?.public_name ?? "",
    provider_id: String(model?.provider_id ?? defaultProvider ?? ""),
    provider_model: model?.provider_model ?? "",
    enabled: model?.enabled ?? true,
    supports_streaming: model?.supports_streaming ?? false,
    is_default: model?.is_default ?? false,
    input_price:
      model?.input_usd_per_million === null || model?.input_usd_per_million === undefined
        ? ""
        : String(model.input_usd_per_million),
    output_price:
      model?.output_usd_per_million === null || model?.output_usd_per_million === undefined
        ? ""
        : String(model.output_usd_per_million),
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

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const inputPriceText = form.input_price.trim();
    const outputPriceText = form.output_price.trim();
    const hasInputPrice = inputPriceText !== "";
    const hasOutputPrice = outputPriceText !== "";
    if (hasInputPrice !== hasOutputPrice) {
      setError("Isi harga input dan output bersamaan, atau kosongkan keduanya.");
      return;
    }

    const payload = {
      public_name: form.public_name.trim(),
      provider_id: Number(form.provider_id),
      provider_model: form.provider_model.trim(),
      enabled: form.enabled,
      supports_streaming: form.supports_streaming,
      is_default: form.is_default,
    };

    if (hasInputPrice) {
      const inputPrice = Number(inputPriceText);
      const outputPrice = Number(outputPriceText);
      if (
        !Number.isFinite(inputPrice) ||
        !Number.isFinite(outputPrice) ||
        inputPrice < 0 ||
        outputPrice < 0
      ) {
        setError("Harga harus berupa angka nol atau lebih.");
        return;
      }
      payload.input_usd_per_million = inputPrice;
      payload.output_usd_per_million = outputPrice;
    }

    setSubmitting(true);

    try {
      const saved = editing
        ? await api.updateModel(model.id, payload)
        : await api.createModel(payload);
      onSaved(saved);
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
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="model-modal-title">
        <header className="modal-head">
          <div>
            <p className="eyebrow">Model</p>
            <h2 id="model-modal-title">{editing ? "Edit model" : "Tambah model"}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Tutup"
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </header>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Nama model publik</span>
            <input
              type="text"
              value={form.public_name}
              onChange={(event) => update("public_name", event.target.value)}
              placeholder="pochi-chat"
              maxLength={100}
              required
              autoFocus
            />
            <small>
              Nama ini dipakai klien pada `/v1/models` dan `/v1/chat/completions`.
              Gunakan tanpa spasi.
            </small>
          </label>

          <label className="field">
            <span>Provider</span>
            <select
              value={form.provider_id}
              onChange={(event) => update("provider_id", event.target.value)}
              required
              disabled={!providers.length}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                  {provider.has_secret ? "" : " — key belum ada"}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Nama model di provider</span>
            <input
              type="text"
              value={form.provider_model}
              onChange={(event) => update("provider_model", event.target.value)}
              placeholder="gpt-4o-mini"
              maxLength={200}
              required
            />
            <small>Nilai yang dikirim ke API provider, bukan nama publik gateway.</small>
          </label>

          <div className="form-row price-row">
            <label className="field">
              <span>Harga input / 1M token</span>
              <input
                type="number"
                min="0"
                step="any"
                value={form.input_price}
                onChange={(event) => update("input_price", event.target.value)}
                placeholder="0.15"
              />
            </label>
            <label className="field">
              <span>Harga output / 1M token</span>
              <input
                type="number"
                min="0"
                step="any"
                value={form.output_price}
                onChange={(event) => update("output_price", event.target.value)}
                placeholder="0.60"
              />
            </label>
          </div>
          <p className="field-note">
            Opsional, dalam USD. Tanpa harga, biaya request dicatat sebagai{" "}
            <code>unknown</code>. Harga berlaku untuk nama model provider yang sama.
          </p>

          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => update("enabled", event.target.checked)}
            />
            <span>Aktifkan model di gateway</span>
          </label>

          <div className="form-row">
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={form.supports_streaming}
                onChange={(event) => update("supports_streaming", event.target.checked)}
              />
              <span>Mendukung streaming SSE</span>
            </label>

            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(event) => update("is_default", event.target.checked)}
              />
              <span>Jadikan model default</span>
            </label>
          </div>
          <p className="field-note">
            Penanda ini dokumentasi konfigurasi. Gateway tetap memakai nilai `model` dari
            request klien; default tidak mengubah routing.
          </p>

          <p className="form-hint">
            <Boxes size={13} aria-hidden="true" />
            Model publik yang aktif akan muncul di `/v1/models` untuk virtual key yang
            mengizinkannya.
          </p>

          {providers.length === 0 ? (
            <p className="field-note">
              Belum ada provider. Tambahkan provider terlebih dahulu sebelum membuat model.
            </p>
          ) : null}

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <footer className="modal-actions">
            <button type="button" className="button" onClick={onClose} disabled={submitting}>
              Batal
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={submitting || providers.length === 0}
            >
              {submitting ? "Menyimpan..." : editing ? "Simpan perubahan" : "Tambah model"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
