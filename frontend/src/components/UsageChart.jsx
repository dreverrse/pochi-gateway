import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatAxisLabel, formatCompact, formatNumber, formatUsd } from "../utils/format.js";

export const CHART_METRICS = [
  { id: "requests", label: "Requests", key: "requests" },
  { id: "input_tokens", label: "Input Tokens", key: "input_tokens" },
  { id: "output_tokens", label: "Output Tokens", key: "output_tokens" },
  { id: "cost_usd", label: "Cost", key: "cost_usd" },
];

function formatValue(metric, value) {
  if (metric === "cost_usd") return formatUsd(value);
  return formatNumber(value);
}

function formatTick(metric, value) {
  if (metric === "cost_usd") return formatUsd(value);
  return formatCompact(value);
}

export default function UsageChart({
  data = [],
  metric = "requests",
  onMetricChange,
  hourly = false,
  height = 268,
}) {
  const activeMetric = CHART_METRICS.find((item) => item.id === metric) ?? CHART_METRICS[0];
  const hasData = data.some((point) => Number(point[activeMetric.key]) > 0);

  const tooltip = (
    <Tooltip
      cursor={{ stroke: "rgba(167,139,250,0.35)", strokeWidth: 1 }}
      contentStyle={{
        background: "#14141F",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
        fontSize: 12,
        color: "#F4F4FA",
      }}
      labelStyle={{ color: "#9292A8", marginBottom: 4 }}
      formatter={(value) => [formatValue(metric, value), activeMetric.label]}
    />
  );

  return (
    <section className="panel chart-panel">
      <header className="panel-head">
        <div>
          <h2>Usage over time</h2>
          <p>{hourly ? "Per jam, 24 jam terakhir" : "Agregat harian dari request yang tercatat"}</p>
        </div>
        <div className="segmented" role="group" aria-label="Metrik grafik">
          {CHART_METRICS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === metric ? "active" : ""}
              onClick={() => onMetricChange?.(item.id)}
              aria-pressed={item.id === metric}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {!hasData ? (
        <div className="chart-empty">
          <p>Belum ada data pada rentang ini.</p>
        </div>
      ) : (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="usage-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A78BFA" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#A78BFA" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => formatAxisLabel(value, hourly)}
                stroke="#6E6E85"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                minTickGap={hourly ? 28 : 8}
              />
              <YAxis
                tickFormatter={(value) => formatTick(metric, value)}
                stroke="#6E6E85"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                width={62}
                allowDecimals={metric === "cost_usd"}
              />
              {tooltip}
              <Area
                type="monotone"
                dataKey={activeMetric.key}
                name={activeMetric.label}
                stroke="#A78BFA"
                strokeWidth={2}
                fill="url(#usage-gradient)"
                activeDot={{ r: 4, stroke: "#0B0B12", strokeWidth: 2, fill: "#C4B5FD" }}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
