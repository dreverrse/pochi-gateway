import { useEffect, useMemo, useState } from "react";
import { Activity, Coins, Gauge, RefreshCw, Server, Timer, Zap } from "lucide-react";

import { api } from "../api/client.js";
import { useUi } from "../app-context.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import RequestDetailModal from "../components/RequestDetailModal.jsx";
import { CardSkeletons, TableSkeleton } from "../components/Skeleton.jsx";
import StatCard from "../components/StatCard.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import UsageChart from "../components/UsageChart.jsx";
import {
  formatCompact,
  formatDelta,
  formatDuration,
  formatNumber,
  formatRate,
  formatTime,
  formatUsd,
} from "../utils/format.js";
import { rangeFromId, rangeLabel, rangeParams, rangeWindowLabel } from "../utils/range.js";

const COST_TONES = { known: "ok", estimated: "warn", unknown: "neutral" };

function rateDelta(current, previous) {
  const a = current.successful_requests / (current.total_requests || 1);
  const b = previous.successful_requests / (previous.total_requests || 1);
  if (!previous.total_requests) return null;
  const diff = (a - b) * 100;
  return {
    direction: diff > 0.05 ? "up" : diff < -0.05 ? "down" : "flat",
    label: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}pp`,
  };
}

export default function Overview({ onNavigate }) {
  const { range } = useUi();
  const window = rangeFromId(range);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [metric, setMetric] = useState("requests");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let active = true;
    const params = rangeParams(range);
    setLoading(true);
    setError("");

    Promise.all([
      api.summary(params),
      api.providerStats(params),
      api.usageLogs({ ...params, pageSize: 8 }),
    ])
      .then(([summary, providers, logs]) => {
        if (!active) return;
        setData({ summary, providers, logs: logs.items });
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [range, reloadKey]);

  const summary = data?.summary;
  const previous = summary?.previous;

  const sparklines = useMemo(() => {
    const points = summary?.timeseries ?? [];
    return {
      requests: points.map((point) => point.requests),
      tokens: points.map((point) => point.input_tokens + point.output_tokens),
      cost: points.map((point) => point.cost_usd),
      success: points.map((point) =>
        point.requests ? (point.successful_requests / point.requests) * 100 : 0,
      ),
    };
  }, [summary]);

  const totalCost = (summary?.known_cost_usd ?? 0) + (summary?.estimated_cost_usd ?? 0);
  const previousCost = previous ? previous.known_cost_usd + previous.estimated_cost_usd : 0;
  const totalTokens = (summary?.input_tokens ?? 0) + (summary?.output_tokens ?? 0);
  const previousTokens = previous ? previous.input_tokens + previous.output_tokens : 0;
  const providerRows = data?.providers ?? [];
  const maxProviderRequests = Math.max(1, ...providerRows.map((row) => row.requests));

  return (
    <div className="page">
      <PageHeader
        title="Overview"
        description={`Ringkasan pemakaian gateway ${rangeLabel(range)}. Biaya diketahui dan estimasi dipisah; biaya tak dikenal tidak dihitung nol.`}
        actions={
          <button
            type="button"
            className="btn small"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {loading ? "Memuat" : "Muat ulang"}
          </button>
        }
      />

      {error ? (
        <ErrorState
          title="Gagal memuat ringkasan"
          message={`${error}. Pastikan backend berjalan di 127.0.0.1:8000.`}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      {loading && !summary ? <CardSkeletons /> : null}

      {summary ? (
        <>
          <section className="stat-grid">
            <StatCard
              label="Total Requests"
              value={formatNumber(summary.total_requests)}
              hint={`${formatNumber(summary.successful_requests)} sukses · ${formatNumber(summary.failed_requests)} gagal`}
              delta={previous ? formatDelta(summary.total_requests, previous.total_requests) : null}
              sparkline={sparklines.requests}
              icon={Activity}
            />
            <StatCard
              label="Total Tokens"
              value={formatCompact(totalTokens)}
              hint={`${formatCompact(summary.input_tokens)} input · ${formatCompact(summary.output_tokens)} output`}
              delta={previous ? formatDelta(totalTokens, previousTokens) : null}
              sparkline={sparklines.tokens}
              sparkColor="#8EE7C8"
              icon={Zap}
            />
            <StatCard
              label="Estimated Cost"
              value={formatUsd(totalCost)}
              hint={`${formatUsd(summary.known_cost_usd)} resmi · ${formatUsd(summary.estimated_cost_usd)} estimasi`}
              delta={previous ? formatDelta(totalCost, previousCost) : null}
              sparkline={sparklines.cost}
              sparkColor="#F5C97B"
              icon={Coins}
            />
            <StatCard
              label="Success Rate"
              value={formatRate(
                summary.total_requests
                  ? (summary.successful_requests / summary.total_requests) * 100
                  : null,
              )}
              hint={`${formatNumber(summary.failed_requests)} request gagal`}
              delta={previous ? rateDelta(summary, previous) : null}
              sparkline={sparklines.success}
              sparkColor="#7DD3A8"
              icon={Gauge}
            />
          </section>

          {summary.unknown_cost_requests > 0 ? (
            <p className="notice warn">
              <Coins size={15} aria-hidden="true" />
              {formatNumber(summary.unknown_cost_requests)} request tanpa harga model. Biaya
              mereka tidak dihitung sebagai nol dan tidak masuk total.
            </p>
          ) : null}

          <UsageChart
            data={summary.timeseries}
            metric={metric}
            onMetricChange={setMetric}
            hourly={Boolean(window.hours)}
          />

          <div className="overview-split">
            <section className="panel">
              <header className="panel-head">
                <div>
                  <h2>Provider summary</h2>
                  <p>Distribusi beban antar provider terdaftar</p>
                </div>
                <button type="button" className="btn ghost small" onClick={() => onNavigate?.("providers")}>
                  Kelola
                </button>
              </header>

              {providerRows.length === 0 ? (
                <EmptyState
                  icon={Server}
                  title="Belum ada provider"
                  description="Tambahkan provider untuk mulai meneruskan request."
                />
              ) : (
                <ul className="provider-summary">
                  {providerRows.map((row) => {
                    const share = Math.round((row.requests / maxProviderRequests) * 100);
                    return (
                      <li key={row.provider_id}>
                        <div className="provider-summary-head">
                          <span className="provider-summary-name">{row.name}</span>
                          <span className="provider-summary-value">
                            {formatNumber(row.requests)} req
                          </span>
                        </div>
                        <div className="share-bar" aria-hidden="true">
                          <span style={{ width: `${share}%` }} />
                        </div>
                        <div className="provider-summary-meta">
                          <span>{formatCompact(row.input_tokens + row.output_tokens)} token</span>
                          <span>{formatUsd(row.cost_usd)}</span>
                          <span>{row.models_count} model</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="panel">
              <header className="panel-head">
                <div>
                  <h2>Kualitas layanan</h2>
                  <p>Periode ini {rangeWindowLabel(range)}</p>
                </div>
              </header>
              <dl className="metric-list">
                <div>
                  <dt>
                    <Timer size={14} aria-hidden="true" /> Rata-rata respons
                  </dt>
                  <dd>{formatDuration(summary.avg_duration_ms)}</dd>
                </div>
                <div>
                  <dt>Success rate</dt>
                  <dd>
                    {formatRate(
                      summary.total_requests
                        ? (summary.successful_requests / summary.total_requests) * 100
                        : null,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Biaya tak diketahui</dt>
                  <dd>{formatNumber(summary.unknown_cost_requests)} request</dd>
                </div>
                <div>
                  <dt>Provider aktif</dt>
                  <dd>
                    {providerRows.filter((row) => row.requests > 0).length} / {providerRows.length}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <section className="panel">
            <header className="panel-head">
              <div>
                <h2>Recent requests</h2>
                <p>Delapan request terakhir pada rentang ini</p>
              </div>
              <button type="button" className="btn ghost small" onClick={() => onNavigate?.("logs")}>
                Lihat semua
              </button>
            </header>

            {loading && !data ? (
              <TableSkeleton rows={6} columns={7} />
            ) : data?.logs?.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Waktu</th>
                      <th scope="col">Model</th>
                      <th scope="col">Provider</th>
                      <th scope="col" className="num">Token in / out</th>
                      <th scope="col" className="num">Latency</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="num">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.logs.map((item) => (
                      <tr
                        key={item.id}
                        className="clickable"
                        onClick={() => setDetail(item)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") setDetail(item);
                        }}
                      >
                        <td className="mono-sm">{formatTime(item.created_at)}</td>
                        <td>
                          <div className="cell-strong">{item.public_model}</div>
                          <div className="cell-sub mono-sm">{item.provider_model}</div>
                        </td>
                        <td className="cell-sub">{item.provider_name ?? "—"}</td>
                        <td className="num mono-sm">
                          {formatCompact(item.input_tokens)} / {formatCompact(item.output_tokens)}
                        </td>
                        <td className="num mono-sm">{formatDuration(item.duration_ms)}</td>
                        <td>
                          <StatusBadge
                            tone={item.status_code < 300 ? "ok" : "err"}
                            label={String(item.status_code)}
                            dot={false}
                          />
                        </td>
                        <td className="num">
                          {item.cost_status === "unknown" ? (
                            <StatusBadge tone={COST_TONES.unknown} label="Unknown" dot={false} />
                          ) : (
                            <span className="mono-sm">
                              {formatUsd(item.cost_usd)}
                              <span className={`cost-tag ${item.cost_status}`}>
                                {item.cost_status === "estimated" ? "est" : "resmi"}
                              </span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Belum ada request"
                description="Request yang melewati gateway akan muncul di sini."
              />
            )}
          </section>
        </>
      ) : null}

      {detail ? <RequestDetailModal item={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
