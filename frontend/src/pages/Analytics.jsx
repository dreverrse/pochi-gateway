import { useEffect, useMemo, useState } from "react";
import { Coins, Filter, Gauge, RefreshCw, Timer, Zap } from "lucide-react";

import { api } from "../api/client.js";
import { useUi } from "../app-context.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { CardSkeletons, PanelSkeleton } from "../components/Skeleton.jsx";
import StatCard from "../components/StatCard.jsx";
import UsageChart from "../components/UsageChart.jsx";
import {
  formatCompact,
  formatDuration,
  formatNumber,
  formatRate,
  formatUsd,
} from "../utils/format.js";
import { rangeFromId, rangeLabel, rangeParams } from "../utils/range.js";

export default function Analytics() {
  const { range } = useUi();
  const window = rangeFromId(range);
  const [filters, setFilters] = useState({ status: "all", providerId: "", model: "", keyId: "" });
  const [options, setOptions] = useState({ providers: [], models: [], keys: [] });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metric, setMetric] = useState("requests");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([api.providers(), api.models(), api.keys()])
      .then(([providers, models, keys]) => {
        if (active) setOptions({ providers, models, keys });
      })
      .catch(() => {
        // Filter tetap bisa dipakai tanpa daftar opsi.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    api
      .analytics({ ...rangeParams(range), ...filters })
      .then((payload) => {
        if (active) setData(payload);
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
  }, [range, filters, reloadKey]);

  const sparklines = useMemo(() => {
    const points = data?.timeseries ?? [];
    return {
      requests: points.map((point) => point.requests),
      tokens: points.map((point) => point.input_tokens + point.output_tokens),
      cost: points.map((point) => point.cost_usd),
      latency: [],
    };
  }, [data]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters({ status: "all", providerId: "", model: "", keyId: "" });
  }

  const activeFilterCount = Object.values(filters).filter((value) => value && value !== "all").length;

  return (
    <div className="page">
      <PageHeader
        title="Analytics"
        description={`Metrik terfilter untuk ${rangeLabel(range)}. Biaya dihitung dari tarif konfigurasi — labelnya estimasi, bukan tagihan final provider.`}
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

      <section className="filter-bar">
        <label className="filter-field">
          <span>Provider</span>
          <select
            value={filters.providerId}
            onChange={(event) => updateFilter("providerId", event.target.value)}
          >
            <option value="">Semua provider</option>
            {options.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>Model</span>
          <select value={filters.model} onChange={(event) => updateFilter("model", event.target.value)}>
            <option value="">Semua model</option>
            {options.models.map((model) => (
              <option key={model.id} value={model.public_name}>
                {model.public_name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>API key</span>
          <select value={filters.keyId} onChange={(event) => updateFilter("keyId", event.target.value)}>
            <option value="">Semua key</option>
            {options.keys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter-field">
          <span>Status</span>
          <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
            <option value="all">Semua</option>
            <option value="success">Sukses</option>
            <option value="error">Gagal</option>
          </select>
        </label>

        <button type="button" className="btn small" onClick={resetFilters} disabled={!activeFilterCount}>
          <Filter size={14} aria-hidden="true" />
          Reset{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>
      </section>

      {error ? (
        <ErrorState
          title="Gagal memuat analytics"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      {loading && !data ? <CardSkeletons /> : null}

      {data ? (
        <>
          <section className="stat-grid">
            <StatCard
              label="Requests"
              value={formatNumber(data.total_requests)}
              hint={`${formatNumber(data.successful_requests)} sukses · ${formatNumber(data.failed_requests)} gagal`}
              sparkline={sparklines.requests}
            />
            <StatCard
              label="Input tokens"
              value={formatCompact(data.input_tokens)}
              hint="Token prompt yang dikirim klien"
              sparkline={data.timeseries.map((point) => point.input_tokens)}
              sparkColor="#9DB8FF"
            />
            <StatCard
              label="Output tokens"
              value={formatCompact(data.output_tokens)}
              hint="Token yang dihasilkan provider"
              sparkline={data.timeseries.map((point) => point.output_tokens)}
              sparkColor="#8EE7C8"
            />
            <StatCard
              label="Total tokens"
              value={formatCompact(data.total_tokens)}
              hint="Input + output pada filter ini"
              sparkline={sparklines.tokens}
              sparkColor="#C4B5FD"
              icon={Zap}
            />
          </section>

          <section className="stat-grid">
            <StatCard
              label="Success rate"
              value={formatRate(data.success_rate)}
              hint={`${formatNumber(data.failed_requests)} request gagal`}
              icon={Gauge}
              tone="default"
            />
            <StatCard
              label="Latency p50 / p95"
              value={formatDuration(data.p50_duration_ms)}
              hint={`p95 ${formatDuration(data.p95_duration_ms)} · rata-rata ${formatDuration(data.avg_duration_ms)}`}
              icon={Timer}
            />
            <StatCard
              label="Estimated cost"
              value={formatUsd(data.known_cost_usd + data.estimated_cost_usd)}
              hint={`${formatUsd(data.known_cost_usd)} resmi · ${formatUsd(data.estimated_cost_usd)} estimasi`}
              icon={Coins}
              tone="estimated"
            />
            <StatCard
              label="Unknown cost"
              value={formatNumber(data.unknown_cost_requests)}
              hint="Request tanpa harga model; tidak dihitung nol"
            />
          </section>

          <UsageChart
            data={data.timeseries}
            metric={metric}
            onMetricChange={setMetric}
            hourly={Boolean(window.hours)}
          />

          <div className="tables-grid">
            <BreakdownTable title="By provider" rows={data.by_provider} />
            <BreakdownTable title="By model" rows={data.by_model} />
            <BreakdownTable title="By API key" rows={data.by_key} />
          </div>
        </>
      ) : null}

      {loading && data ? <PanelSkeleton height={180} /> : null}
    </div>
  );
}

function BreakdownTable({ title, rows }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>Kontribusi pada filter aktif</p>
        </div>
      </header>
      {rows.length === 0 ? (
        <EmptyState title="Tidak ada data" description="Belum ada request pada kombinasi filter ini." />
      ) : (
        <div className="table-scroll">
          <table className="data-table compact">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col" className="num">Req</th>
                <th scope="col" className="num">Tokens</th>
                <th scope="col" className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td className="cell-strong" title={row.name}>
                    {row.name}
                  </td>
                  <td className="num">{formatNumber(row.requests)}</td>
                  <td className="num mono-sm">
                    {formatCompact(row.input_tokens)} / {formatCompact(row.output_tokens)}
                  </td>
                  <td className="num mono-sm">{formatUsd(row.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
