import { useEffect } from "react";
import { X } from "lucide-react";

import { formatDateTime, formatDuration, formatNumber, formatUsd } from "../utils/format.js";
import StatusBadge from "./StatusBadge.jsx";

const COST_LABELS = {
  known: "Resmi",
  estimated: "Estimasi",
  unknown: "Tidak diketahui",
};

const COST_TONES = {
  known: "ok",
  estimated: "warn",
  unknown: "neutral",
};

export default function RequestDetailModal({ item, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (!item) return null;
  const success = item.status_code >= 200 && item.status_code <= 299;

  const rows = [
    ["Request ID", item.request_id],
    ["Waktu", formatDateTime(item.created_at)],
    ["Model publik", item.public_model],
    ["Model provider", item.provider_model],
    ["Provider", item.provider_name ?? "—"],
    ["Virtual key", item.key_name ?? "—"],
    ["Input tokens", formatNumber(item.input_tokens)],
    ["Output tokens", formatNumber(item.output_tokens)],
    ["Durasi", formatDuration(item.duration_ms)],
    ["Streaming", item.streamed ? "SSE" : "Tidak"],
    ["Status biaya", COST_LABELS[item.cost_status] ?? item.cost_status],
    ["Biaya", item.cost_status === "unknown" ? "Tidak diketahui" : formatUsd(item.cost_usd)],
  ];

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
        <header className="modal-head">
          <div>
            <p className="eyebrow">Detail request</p>
            <h2 id="request-detail-title">#{item.request_id.slice(0, 8)}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <div className="detail-badges">
            <StatusBadge
              tone={success ? "ok" : "err"}
              label={`HTTP ${item.status_code}`}
              dot={false}
            />
            <StatusBadge
              tone={COST_TONES[item.cost_status] ?? "neutral"}
              label={COST_LABELS[item.cost_status] ?? item.cost_status}
            />
            {item.error_code ? (
              <StatusBadge tone="err" label={item.error_code} dot={false} />
            ) : null}
          </div>

          <dl className="detail-grid">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd title={String(value)}>{value}</dd>
              </div>
            ))}
          </dl>

          <p className="field-note">
            Metadata saja. Isi prompt dan respons tidak disimpan gateway, dan header
            Authorization tidak pernah dicatat.
          </p>

          <footer className="modal-actions">
            <button type="button" className="btn primary" onClick={onClose}>
              Tutup
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
