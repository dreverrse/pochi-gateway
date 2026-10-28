import { useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";

import { api } from "../api/client.js";

const PERIODS = [
  { value: "daily", label: "Harian" },
  { value: "monthly", label: "Bulanan" },
];

export default function VirtualKeyModal({ virtualKey, models, onClose, onSaved }) {
  const editing = Boolean(virtualKey);
  const [form, setForm] = useState({
    name: virtualKey?.name ?? "",
    allowed_models: virtualKey?.allowed_models ?? [],
    budget_limit_usd:
      virtualKey?.budget_limit_usd === null || virtualKey?.budget_limit_usd === undefined
        ? ""
        : String(virtualKey.budget_limit_usd),
    budget_period: virtualKey?.budget_period ?? "monthly",
    enabled: virtualKey?.enabled ?? true,
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

  function toggleModel(modelName) {
    setForm((current) => {
      const selected = current.allowed_models.includes(modelName);
      return {
        ...current,
        allowed_models: selected
          ? current.allowed_models.filter((model) => model !== modelName)
          : [...current.allowed_models, modelName],
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const budgetText = form.budget_limit_usd.trim();
    const budget = budgetText === "" ? null : Number(budgetText);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
      setError("Anggaran harus berupa angka 0 atau lebih.");
      setSubmitting(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      allowed_models: form.allowed_models,
      budget_limit_usd: budget,
      budget_period: form.budget_period,
      enabled: form.enabled,
    };

    try {
      const result = editing
        ? await api.updateKey(virtualKey.id, payload)
        : await api.createKey(payload);
      onSaved(result.key ?? result, result.token ?? null);
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
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="virtual-key-modal-title"
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">Virtual key</p>
            <h2 id="virtual-key-modal-title">
              {editing ? "Edit virtual key" : "Buat virtual key"}
            </h2>
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
            <span>Nama key</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="Aplikasi Android"
              maxLength={100}
              required
              autoFocus
            />
          </label>

          <fieldset className="field model-fieldset">
            <legend>
              Model yang diizinkan <em>opsional</em>
            </legend>
            {models.length ? (
              <div className="model-options">
                {models.map((model) => {
                  const checked = form.allowed_models.includes(model.public_name);
                  return (
                    <label
                      key={model.id}
                      className={`model-option ${checked ? "selected" : ""} ${
                        model.enabled ? "" : "disabled"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModel(model.public_name)}
                      />
                      <span className="model-option-text">
                        <span>{model.public_name}</span>
                        <small>
                          {model.provider_name}
                          {model.enabled ? "" : " · nonaktif"}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="field-note">Belum ada model di katalog.</p>
            )}
            <small>
              Kosongkan semua pilihan untuk mengizinkan seluruh model. Kebijakan ini
              disimpan untuk diterapkan oleh gateway.
            </small>
          </fieldset>

          <div className="form-row budget-row">
            <label className="field">
              <span>Batas anggaran (USD)</span>
              <input
                type="number"
                inputMode="decimal"
                value={form.budget_limit_usd}
                onChange={(event) => update("budget_limit_usd", event.target.value)}
                placeholder="Tanpa batas"
                min="0"
                max="1000000"
                step="0.01"
              />
            </label>

            <label className="field">
              <span>Periode</span>
              <select
                value={form.budget_period}
                onChange={(event) => update("budget_period", event.target.value)}
                disabled={form.budget_limit_usd.trim() === ""}
              >
                {PERIODS.map((period) => (
                  <option key={period.value} value={period.value}>
                    {period.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => update("enabled", event.target.checked)}
            />
            <span>Aktifkan key setelah disimpan</span>
          </label>

          <p className="form-hint">
            <KeyRound size={13} aria-hidden="true" />
            Token lengkap hanya ditampilkan satu kali setelah key dibuat. Server
            menyimpan hash-nya, bukan token asli.
          </p>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <footer className="modal-actions">
            <button type="button" className="button" onClick={onClose} disabled={submitting}>
              Batal
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? "Menyimpan..." : editing ? "Simpan perubahan" : "Buat key"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
