import {
  CheckCircle2,
  Pencil,
  PlugZap,
  Server,
  TriangleAlert,
} from "lucide-react";

import { formatCompact, formatNumber, formatTime, formatUsd } from "../utils/format.js";

const ADAPTER_LABELS = {
  openai_compatible: "OpenAI compatible",
  inception: "Inception Labs",
};

export default function ProviderCard({ provider, stats, test, onTest, onEdit, onToggle, toggling }) {
  const usage = stats ?? null;

  return (
    <article className={`provider-card ${provider.enabled ? "" : "disabled"}`}>
      <header className="provider-card-head">
        <span className="provider-avatar" aria-hidden="true">
          <Server size={16} />
        </span>
        <div className="provider-title">
          <strong>{provider.name}</strong>
          <span>{ADAPTER_LABELS[provider.adapter_type] ?? provider.adapter_type}</span>
        </div>
        <button
          type="button"
          className={`switch ${provider.enabled ? "on" : ""}`}
          onClick={() => onToggle(provider)}
          disabled={toggling}
          aria-pressed={provider.enabled}
          aria-label={provider.enabled ? "Nonaktifkan provider" : "Aktifkan provider"}
          title={provider.enabled ? "Nonaktifkan" : "Aktifkan"}
        >
          <span />
        </button>
      </header>

      <div className="provider-status-row">
        <span className={`badge ${provider.has_secret ? "ok" : "warn"}`}>
          <span className="badge-dot" aria-hidden="true" />
          {provider.has_secret ? "API key tersimpan" : "API key belum ada"}
        </span>
        <span className={`badge ${provider.enabled ? "ok" : "neutral"}`}>
          <span className="badge-dot" aria-hidden="true" />
          {provider.enabled ? "Aktif" : "Nonaktif"}
        </span>
      </div>

      <code className="provider-url" title={provider.base_url}>
        {provider.base_url}
      </code>

      <dl className="provider-metrics">
        <div>
          <dt>Models</dt>
          <dd>{formatNumber(usage?.models_count ?? 0)}</dd>
        </div>
        <div>
          <dt>Requests</dt>
          <dd>{formatNumber(usage?.requests ?? 0)}</dd>
        </div>
        <div>
          <dt>Tokens</dt>
          <dd>{formatCompact((usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0))}</dd>
        </div>
        <div>
          <dt>Est. cost</dt>
          <dd>{formatUsd(usage?.cost_usd ?? 0)}</dd>
        </div>
      </dl>

      <footer className="provider-card-foot">
        <span className="provider-last">
          {usage?.last_request_at ? `Terakhir ${formatTime(usage.last_request_at)}` : "Belum ada request"}
        </span>
        <div className="provider-card-actions">
          <button
            type="button"
            className="btn small"
            onClick={() => onTest(provider)}
            disabled={Boolean(test?.loading) || !provider.has_secret}
            title={provider.has_secret ? "Uji koneksi" : "Simpan API key dulu"}
          >
            <PlugZap size={14} aria-hidden="true" />
            {test?.loading ? "Menguji" : "Test"}
          </button>
          <button type="button" className="btn small" onClick={() => onEdit(provider)}>
            <Pencil size={14} aria-hidden="true" />
            Edit
          </button>
        </div>
      </footer>

      {test?.result ? (
        <div className={`test-result ${test.result.ok ? "ok" : "fail"}`}>
          {test.result.ok ? (
            <CheckCircle2 size={15} aria-hidden="true" />
          ) : (
            <TriangleAlert size={15} aria-hidden="true" />
          )}
          <span>{test.result.message}</span>
          {test.result.latency_ms != null ? (
            <span className="test-meta">{test.result.latency_ms} ms</span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
