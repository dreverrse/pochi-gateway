import { SlidersHorizontal, X } from "lucide-react";

const TEMPERATURES = ["Presisi", "Seimbang", "Kreatif"];

export default function ChatSettings({
  open,
  onClose,
  models,
  modelId,
  onModelChange,
  settings,
  onChange,
  onClear,
  hasConversation,
  saving,
}) {
  if (!open) return null;

  return (
    <div className="cw-settings-layer">
      <button
        type="button"
        className="cw-settings-backdrop"
        onClick={onClose}
        aria-label="Tutup pengaturan"
      />
      <aside className="cw-settings" aria-label="Pengaturan percakapan">
        <header className="cw-settings-head">
          <h2>
            <SlidersHorizontal size={15} aria-hidden="true" />
            Pengaturan percakapan
          </h2>
          <button type="button" className="cw-icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={16} />
          </button>
        </header>

        <div className="cw-settings-body">
          <label className="cw-field">
            <span>Model</span>
            <select value={modelId} onChange={(event) => onModelChange(event.target.value)}>
              {models.length === 0 ? <option value="">Belum ada model aktif</option> : null}
              {models.map((row) => (
                <option key={row.id} value={row.public_name}>
                  {row.public_name} · {row.provider_name}
                </option>
              ))}
            </select>
            <small>Berlaku untuk pesan berikutnya, riwayat lama tidak diubah.</small>
          </label>

          <div className="cw-field">
            <span>
              Temperature
              <em>{settings.temperature === null ? "default provider" : settings.temperature.toFixed(1)}</em>
            </span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature ?? 0.7}
              onChange={(event) => onChange({ temperature: Number(event.target.value) })}
              disabled={settings.temperature === null}
              aria-label="Temperature"
            />
            <div className="cw-field-row">
              <span className="cw-scale">
                {TEMPERATURES.map((label) => (
                  <small key={label}>{label}</small>
                ))}
              </span>
              <button
                type="button"
                className="cw-mini-btn"
                onClick={() =>
                  onChange({ temperature: settings.temperature === null ? 0.7 : null })
                }
              >
                {settings.temperature === null ? "Atur manual" : "Pakai default"}
              </button>
            </div>
          </div>

          <label className="cw-field">
            <span>Maksimum token output</span>
            <input
              type="number"
              min="1"
              max="32000"
              step="1"
              value={settings.maxTokens ?? ""}
              onChange={(event) =>
                onChange({
                  maxTokens: event.target.value === "" ? null : Number(event.target.value),
                })
              }
              placeholder="Default provider"
            />
            <small>Kosongkan untuk mengikuti batas provider.</small>
          </label>

          <label className="cw-field">
            <span>System instructions</span>
            <textarea
              value={settings.systemPrompt}
              onChange={(event) => onChange({ systemPrompt: event.target.value })}
              rows={4}
              maxLength={8000}
              placeholder="Contoh: jawab singkat dalam bahasa Indonesia, sebutkan asumsi bila ragu."
            />
          </label>

          <label className="cw-switch">
            <input
              type="checkbox"
              checked={settings.streaming}
              onChange={(event) => onChange({ streaming: event.target.checked })}
            />
            <span>
              <strong>Streaming</strong>
              <small>Matikan untuk menunggu balasan utuh sebelum ditampilkan.</small>
            </span>
          </label>

          <button
            type="button"
            className="btn small cw-danger"
            onClick={onClear}
            disabled={!hasConversation}
          >
            Hapus semua pesan
          </button>

          <p className="cw-settings-note">
            Parameter dikirim apa adanya ke provider. Kalau provider tidak mendukung
            temperature atau max token, nilainya diabaikan di sisi mereka.
            {saving ? " Menyimpan…" : ""}
          </p>
        </div>
      </aside>
    </div>
  );
}
