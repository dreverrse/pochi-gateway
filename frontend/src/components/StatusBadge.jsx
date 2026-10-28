const TONES = {
  ok: "ok",
  success: "ok",
  warn: "warn",
  warning: "warn",
  err: "err",
  error: "err",
  danger: "err",
  neutral: "neutral",
  muted: "neutral",
  info: "info",
};

export default function StatusBadge({ tone = "neutral", label, dot = true }) {
  return (
    <span className={`badge ${TONES[tone] ?? "neutral"}`}>
      {dot ? <span className="badge-dot" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
