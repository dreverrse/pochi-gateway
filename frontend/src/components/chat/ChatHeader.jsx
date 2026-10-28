import { useEffect, useRef, useState } from "react";
import { Menu, SlidersHorizontal, Trash2 } from "lucide-react";

export default function ChatHeader({
  title,
  onOpenHistory,
  onOpenSettings,
  onClear,
  apiStatus,
  streaming,
  hasConversation,
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      timerRef.current = window.setTimeout(() => setConfirmClear(false), 3200);
      return;
    }
    window.clearTimeout(timerRef.current);
    setConfirmClear(false);
    onClear();
  }

  return (
    <header className="cw-head">
      <button
        type="button"
        className="cw-icon-btn cw-history-btn"
        onClick={onOpenHistory}
        aria-label="Buka riwayat percakapan"
      >
        <Menu size={17} />
      </button>

      <div className="cw-head-copy">
        <h1 title={title}>{title}</h1>
        <p>
          <span className={`cw-head-status ${apiStatus}`}>
            <span className="status-dot" aria-hidden="true" />
            {apiStatus === "online"
              ? "Terhubung ke gateway"
              : apiStatus === "offline"
                ? "Gateway offline"
                : "Memeriksa gateway"}
          </span>
          {streaming ? <span className="cw-head-stream"> · streaming</span> : null}
        </p>
      </div>

      <div className="cw-head-actions">
        <button
          type="button"
          className="cw-icon-btn"
          onClick={onOpenSettings}
          aria-label="Pengaturan percakapan"
          title="Pengaturan percakapan"
        >
          <SlidersHorizontal size={16} />
        </button>

        <button
          type="button"
          className={`cw-icon-btn ${confirmClear ? "is-danger" : ""}`}
          onClick={handleClear}
          disabled={!hasConversation}
          aria-label={confirmClear ? "Konfirmasi hapus semua pesan" : "Bersihkan percakapan"}
          title={confirmClear ? "Klik lagi untuk hapus semua pesan" : "Bersihkan percakapan"}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </header>
  );
}
