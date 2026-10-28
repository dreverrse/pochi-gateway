import { RefreshCw, TriangleAlert } from "lucide-react";

export default function ErrorState({ title = "Gagal memuat data", message, onRetry, retrying = false }) {
  return (
    <div className="error-state" role="alert">
      <span className="error-icon" aria-hidden="true">
        <TriangleAlert size={18} />
      </span>
      <div className="error-copy">
        <strong>{title}</strong>
        {message ? <p>{message}</p> : null}
      </div>
      {onRetry ? (
        <button type="button" className="btn small" onClick={onRetry} disabled={retrying}>
          <RefreshCw size={14} aria-hidden="true" />
          {retrying ? "Mencoba..." : "Coba lagi"}
        </button>
      ) : null}
    </div>
  );
}
