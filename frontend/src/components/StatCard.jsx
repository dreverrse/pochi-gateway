import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import Sparkline from "./Sparkline.jsx";

const DELTA_ICONS = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
  new: ArrowUpRight,
};

/**
 * Kartu KPI: label, nilai, delta periode sebelumnya, sparkline.
 * State loading/error ditangani di sini supaya tiap kartu konsisten.
 */
export default function StatCard({
  label,
  value,
  hint,
  delta,
  sparkline,
  sparkColor = "#A78BFA",
  tone = "default",
  icon: Icon,
  loading = false,
  error = "",
}) {
  const DeltaIcon = delta ? DELTA_ICONS[delta.direction] ?? Minus : null;

  return (
    <article className={`stat-card tone-${tone}`}>
      <header className="stat-head">
        <span className="stat-label">{label}</span>
        {Icon ? (
          <span className="stat-icon" aria-hidden="true">
            <Icon size={15} />
          </span>
        ) : null}
      </header>

      {loading ? (
        <div className="stat-skeleton" aria-hidden="true">
          <span className="skeleton skeleton-value" />
          <span className="skeleton skeleton-line" />
        </div>
      ) : error ? (
        <p className="stat-error" title={error}>
          Gagal memuat
        </p>
      ) : (
        <>
          <div className="stat-value-row">
            <strong className="stat-value">{value}</strong>
            {delta ? (
              <span className={`delta ${delta.direction}`}>
                {DeltaIcon ? <DeltaIcon size={13} aria-hidden="true" /> : null}
                {delta.label}
              </span>
            ) : null}
          </div>
          {hint ? <p className="stat-hint">{hint}</p> : null}
        </>
      )}

      <div className="stat-spark">
        {loading ? (
          <span className="skeleton skeleton-spark" aria-hidden="true" />
        ) : sparkline ? (
          <Sparkline data={sparkline} color={sparkColor} />
        ) : null}
      </div>
    </article>
  );
}
