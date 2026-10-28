import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Konfirmasi",
  busy = false,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, onCancel]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="modal narrow"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <div className="modal-body confirm-body">
          <div className="confirm-icon" aria-hidden="true">
            <TriangleAlert size={22} />
          </div>
          <div>
            <h2 id="confirm-title">{title}</h2>
            <p id="confirm-message">{message}</p>
          </div>
          <footer className="modal-actions">
            <button type="button" className="button" onClick={onCancel} disabled={busy}>
              Batal
            </button>
            <button type="button" className="button danger" onClick={onConfirm} disabled={busy}>
              {busy ? "Memproses..." : confirmLabel}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
