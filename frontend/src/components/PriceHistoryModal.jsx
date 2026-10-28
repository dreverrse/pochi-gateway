import { useEffect, useState } from "react";
import { History, X } from "lucide-react";

import { api } from "../api/client.js";
import { formatDateTime, formatPrice } from "../utils/format.js";

export default function PriceHistoryModal({ model, onClose }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .priceHistory(model.provider_model)
      .then((history) => {
        if (active) setItems(history);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [model.provider_model]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-history-modal-title"
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">Riwayat harga</p>
            <h2 id="price-history-modal-title">
              {model.public_name}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <p className="field-note">
            Riwayat perubahan harga untuk provider model{" "}
            <code className="model-upstream">{model.provider_model}</code>.
            Harga dalam USD per 1 juta token.
          </p>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : items === null ? (
            <div className="loading-panel">
              <span className="spinner" aria-hidden="true" />
              <p>Memuat riwayat harga...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="empty-provider">
              <History size={24} aria-hidden="true" />
              <p>Belum ada riwayat harga untuk model ini.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="model-table">
                <thead>
                  <tr>
                    <th scope="col">Berlaku sejak</th>
                    <th scope="col">Berlaku sampai</th>
                    <th scope="col" className="numeric">Input / 1M</th>
                    <th scope="col" className="numeric">Output / 1M</th>
                    <th scope="col" className="numeric">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="time-cell">{formatDateTime(item.effective_from)}</td>
                      <td className="time-cell">
                        {item.effective_until ? formatDateTime(item.effective_until) : "Sekarang"}
                      </td>
                      <td className="numeric"><strong>{formatPrice(item.input_usd_per_million)}</strong></td>
                      <td className="numeric"><strong>{formatPrice(item.output_usd_per_million)}</strong></td>
                      <td className="numeric">
                        {item.effective_until ? <span className="chip muted">Riwayat</span> : <span className="chip ok">Aktif</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="modal-actions">
          <button type="button" className="button" onClick={onClose}>
            Tutup
          </button>
        </footer>
      </div>
    </div>
  );
}
