import { useEffect, useRef, useState } from "react";
import { Check, Copy, ShieldAlert, X } from "lucide-react";

export default function TokenRevealModal({ virtualKey, token, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const inputRef = useRef(null);

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

  async function handleCopy() {
    setCopyError("");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(token);
      } else {
        inputRef.current?.select();
        document.execCommand("copy");
      }
      setCopied(true);
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopyError("Penyalinan otomatis gagal. Pilih token lalu salin secara manual.");
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-reveal-title"
      >
        <header className="modal-head">
          <div>
            <p className="eyebrow">Key dibuat</p>
            <h2 id="token-reveal-title">Simpan token sekarang</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <div className="token-warning" role="alert">
            <ShieldAlert size={19} aria-hidden="true" />
            <div>
              <strong>Token hanya ditampilkan sekali.</strong>
              <p>
                Simpan di tempat aman sekarang. Setelah modal ini ditutup, token tidak
                dapat dilihat lagi. Key <em>{virtualKey.name}</em> hanya menyimpan hash
                di server.
              </p>
            </div>
          </div>

          <label className="field">
            <span>Virtual key</span>
            <div className="token-copy-row">
              <input
                ref={inputRef}
                type="text"
                value={token}
                readOnly
                spellCheck={false}
                autoFocus
                onFocus={(event) => event.target.select()}
              />
              <button type="button" className="button" onClick={handleCopy}>
                {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                {copied ? "Tersalin" : "Salin"}
              </button>
            </div>
            <small>
              Gunakan sebagai header <code>Authorization: Bearer &lt;token&gt;</code> saat
              memanggil gateway.
            </small>
          </label>

          {copyError ? (
            <p className="form-error" role="alert">
              {copyError}
            </p>
          ) : null}

          <footer className="modal-actions">
            <button type="button" className="button primary" onClick={onClose}>
              Selesai
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
