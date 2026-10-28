function formatCost(value) {
  if (value === null || value === undefined) return "Tidak diketahui";
  if (value === 0) return "$0";
  if (value < 0.0001) return `$${value.toExponential(2)}`;
  if (value < 0.01) return `$${value.toFixed(5)}`;
  return `$${value.toFixed(4)}`;
}

export default function UsageDetails({ message }) {
  const hasUsage =
    message.input_tokens != null || message.output_tokens != null;
  const total = message.total_tokens ?? null;

  if (!hasUsage && message.duration_ms == null) return null;

  const summary = [
    total != null ? `${total} token` : hasUsage ? "token tidak lengkap" : "usage tidak tersedia",
    message.duration_ms != null ? `${(message.duration_ms / 1000).toFixed(1)} dtk` : null,
    message.cost_status && message.cost_status !== "unknown"
      ? formatCost(message.cost_usd)
      : "biaya tidak diketahui",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="usage">
      <summary>{summary}</summary>
      <dl className="usage-grid">
        <div>
          <dt>Input</dt>
          <dd>{message.input_tokens ?? "—"}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>{message.output_tokens ?? "—"}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{total ?? "—"}</dd>
        </div>
        <div>
          <dt>Latensi</dt>
          <dd>{message.duration_ms != null ? `${message.duration_ms} ms` : "—"}</dd>
        </div>
        <div>
          <dt>Biaya</dt>
          <dd>
            {message.cost_status === "unknown" ? "Tidak diketahui" : formatCost(message.cost_usd)}
            {message.cost_status === "estimated" ? " (estimasi)" : ""}
          </dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{message.provider_name ?? "—"}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{message.model ?? "—"}</dd>
        </div>
      </dl>
    </details>
  );
}
