import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

import { useUi } from "../app-context.jsx";

const ICONS = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
};

export default function ToastStack() {
  const { toasts, dismissToast } = useUi();
  if (!toasts.length) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone] ?? Info;
        return (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            <Icon size={17} aria-hidden="true" />
            <div className="toast-copy">
              {toast.title ? <strong>{toast.title}</strong> : null}
              {toast.message ? <span>{toast.message}</span> : null}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Tutup notifikasi"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
