import { useEffect, useState } from "react";
import {
  Activity,
  Coins,
  Gauge,
  RefreshCw,
  Timer,
  TriangleAlert,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "../api/client.js";
import StatCard from "../components/StatCard.jsx";
import UsageTable from "../components/UsageTable.jsx";
import {
  formatCompact,
  formatDuration,
  formatNumber,
  formatPercent,
  formatUsd,
} from "../utils/format.js";

const RANGES = [
  { days: 7, label: "7 hari" },
  { days: 14, label: "14 hari" },
  { days: 30, label: "30 hari" },
];

const tooltipStyle = {
  background: "#111a33",
  border: "1px solid #263457",
  borderRadius: 10,
  color: "#e6ecff",
  fontSize: 12,
};

export default function Overview() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);

    api
      .summary(days)
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
  }, [days, reloadKey]);

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Local monitoring</p>
          <h2>Ringkasan penggunaan</h2>
          <p>
            Metrik {days} hari terakhir. Biaya diketahui dan estimasi ditampilkan terpisah,
            sedangkan biaya yang tidak diketahui tidak dihitung sebagai nol.
          </p>
        </div>
        <div className="range-switch" role="group" aria-label="Rentang waktu">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              className={days === range.days ? "active" : ""}
              onClick={() => setDays(range.days)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <section className="panel error-panel" role="alert">
          <TriangleAlert size={20} aria-hidden="true" />
          <div>
            <h2>Gagal memuat data</h2>
            <p>{error}. Pastikan backend berjalan di 127.0.0.1:8000.</p>
          </div>
          <button type="button" className="button" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={15} aria-hidden="true" />
            Coba lagi
          </button>
        </section>
      ) : null}

      {loading && !data ? (
        <section className="panel loading-panel">
          <span className="spinner" aria-hidden="true" />
          <p>Memuat data penggunaan...</p>
        </section>
      ) : null}

      {data ? (
        <>
          <section className="stat-grid">
            <StatCard
              label="Total request"
              value={formatNumber(data.total_requests)}
              hint={`${formatNumber(data.successful_requests)} sukses, ${formatNumber(data.failed_requests)} gagal`}
              icon={Activity}
            />
            <StatCard
              label="Tingkat sukses"
              value={formatPercent(data.successful_requests, data.total_requests)}
              hint={`${formatNumber(data.failed_requests)} request gagal`}
              icon={Gauge}
            />
            <StatCard
              label="Total token"
              value={formatCompact(data.input_tokens + data.output_tokens)}
              hint={`${formatCompact(data.input_tokens)} input, ${formatCompact(data.output_tokens)} output`}
              icon={Zap}
            />
            <StatCard
              label="Biaya diketahui"
              value={formatUsd(data.known_cost_usd)}
              hint="Berdasarkan usage resmi provider"
              icon={Coins}
              tone="known"
            />
            <StatCard
              label="Biaya estimasi"
              value={formatUsd(data.estimated_cost_usd)}
              hint="Tokenizer atau usage tidak lengkap"
              icon={Coins}
              tone="estimated"
            />
            <StatCard
              label="Rata-rata respons"
              value={formatDuration(data.avg_duration_ms)}
              hint="Durasi request selesai"
              icon={Timer}
            />
          </section>

          {data.unknown_cost_requests > 0 ? (
            <p className="notice">
              <TriangleAlert size={16} aria-hidden="true" />
              {formatNumber(data.unknown_cost_requests)} request memiliki biaya tidak diketahui dan
              tidak dimasukkan ke total biaya.
            </p>
          ) : null}

          <section className="panel chart-panel">
            <header className="panel-head">
              <div>
                <h2>Token per hari</h2>
                <p>Input dan output dari request yang tercatat</p>
              </div>
              <span className="legend">
                <span className="legend-dot input" /> Input
                <span className="legend-dot output" /> Output
              </span>
            </header>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data.timeseries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="inputGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c9cff" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#7c9cff" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="outputGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4fd1b8" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#4fd1b8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2a48" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => value.slice(5).replace("-", "/")}
                    stroke="#7f8cad"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                  />
                  <YAxis
                    tickFormatter={formatCompact}
                    stroke="#7f8cad"
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    width={54}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "#aab7d8" }}
                    formatter={(value, name) => [formatNumber(value), name]}
                  />
                  <Area
                    type="monotone"
                    dataKey="input_tokens"
                    name="Input"
                    stroke="#7c9cff"
                    strokeWidth={2}
                    fill="url(#inputGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="output_tokens"
                    name="Output"
                    stroke="#4fd1b8"
                    strokeWidth={2}
                    fill="url(#outputGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="tables-grid">
            <UsageTable title="Per model" subtitle="Distribusi pemakaian model publik" rows={data.by_model} />
            <UsageTable title="Per provider" subtitle="Beban tiap provider terkonfigurasi" rows={data.by_provider} />
            <UsageTable title="Per virtual key" subtitle="Pemakaian per klien" rows={data.by_key} />
          </div>
        </>
      ) : null}
    </div>
  );
}
