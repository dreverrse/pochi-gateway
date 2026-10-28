import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  ScrollText,
  TriangleAlert,
  Zap,
} from "lucide-react";

import { api } from "../api/client.js";
import {
  formatCompact,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatUsd,
} from "../utils/format.js";

const DAY_OPTIONS = [
  { value: 7, label: "7 hari" },
  { value: 14, label: "14 hari" },
  { value: 30, label: "30 hari" },
  { value: 90, label: "90 hari" },
];

const COST_LABELS = {
  known: "resmi",
  estimated: "estimasi",
  unknown: "tidak diketahui",
};

function shortRequestId(value) {
  return value ? value.slice(0, 8) : "—";
}

export default function UsageLogs() {
  const [filters, setFilters] = useState({
    days: 14,
    status: "all",
    model: "",
    keyId: "",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState(null);
  const [models, setModels] = useState([]);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([api.models(), api.keys()])
      .then(([modelData, keyData]) => {
        if (!active) return;
        setModels(modelData);
        setKeys(keyData);
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
      .usageLogs({
        days: filters.days,
        status: filters.status,
        model: filters.model,
        keyId: filters.keyId,
        page,
        pageSize,
      })
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
  }, [filters, page, pageSize, reloadKey]);

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  }

  function resetFilters() {
    setFilters({ days: 14, status: "all", model: "", keyId: "" });
    setPage(1);
    setPageSize(25);
  }

  function updatePageSize(value) {
    setPageSize(Number(value));
    setPage(1);
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const start = total === 0 ? 0 : (data.page - 1) * data.page_size + 1;
  const end = total === 0 ? 0 : Math.min(data.page * data.page_size, total);

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Observability</p>
          <h2>Usage logs</h2>
          <p>
            Riwayat request gateway beserta token, biaya, durasi, dan status. Biaya
            dihitung dari harga model yang berlaku saat request selesai.
          </p>
        </div>
      </section>

      <section className="panel usage-filter-panel">
        <div className="usage-filters">
          <label className="filter-field">
            <span>Periode</span>
            <select
              value={filters.days}
              onChange={(event) => updateFilter("days", Number(event.target.value))}
            >
              {DAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
            >
              <option value="all">Semua</option>
              <option value="success">Sukses</option>
              <option value="error">Gagal</option>
            </select>
          </label>

          <label className="filter-field">
            <span>Model</span>
            <select
              value={filters.model}
              onChange={(event) => updateFilter("model", event.target.value)}
            >
              <option value="">Semua model</option>
              {models.map((model) => (
                <option key={model.id} value={model.public_name}>
                  {model.public_name}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Virtual key</span>
            <select
              value={filters.keyId}
              onChange={(event) => updateFilter("keyId", event.target.value)}
            >
              <option value="">Semua key</option>
              {keys.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="usage-filter-actions">
          <button type="button" className="button small" onClick={resetFilters}>
            <Filter size={14} aria-hidden="true" />
            Reset
          </button>
          <button
            type="button"
            className="button small"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {loading ? "Memuat..." : "Muat ulang"}
          </button>
        </div>
      </section>

      {error ? (
        <section className="panel error-panel" role="alert">
          <TriangleAlert size={20} aria-hidden="true" />
          <div>
            <h2>Gagal memuat usage logs</h2>
            <p>{error}</p>
          </div>
          <button type="button" className="button" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={15} aria-hidden="true" />
            Coba lagi
          </button>
        </section>
      ) : null}

      <section className="panel usage-log-panel">
        <header className="panel-head">
          <div>
            <h2>Riwayat request</h2>
            <p>
              {data
                ? `${formatNumber(total)} request pada ${filters.days} hari terakhir`
                : "Memuat riwayat request..."}
            </p>
          </div>
          <span className="legend">
            <span className="legend-dot input" /> Biaya resmi/estimasi, biaya tak
            diketahui ditandai
          </span>
        </header>

        {loading && !data ? (
          <div className="loading-panel">
            <span className="spinner" aria-hidden="true" />
            <p>Memuat usage logs...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-provider">
            <ScrollText size={24} aria-hidden="true" />
            <p>Tidak ada request yang cocok dengan filter ini.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="usage-log-table">
              <thead>
                <tr>
                  <th scope="col">Waktu</th>
                  <th scope="col">Model</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Virtual key</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="numeric">Token in / out</th>
                  <th scope="col" className="numeric">Biaya</th>
                  <th scope="col" className="numeric">Durasi</th>
                  <th scope="col">Stream</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="time-cell">{formatDateTime(item.created_at)}</div>
                      <div className="request-id" title={item.request_id}>
                        #{shortRequestId(item.request_id)}
                      </div>
                    </td>
                    <td>
                      <div className="model-public-name">{item.public_model}</div>
                      <div className="provider-meta">
                        <span className="model-upstream">{item.provider_model}</span>
                      </div>
                    </td>
                    <td className="name-cell" title={item.provider_name ?? ""}>
                      {item.provider_name ?? "—"}
                    </td>
                    <td className="name-cell" title={item.key_name ?? ""}>
                      {item.key_name ?? "—"}
                    </td>
                    <td>
                      <span
                        className={`http-status ${
                          item.status_code >= 200 && item.status_code <= 299 ? "ok" : "fail"
                        }`}
                      >
                        {item.status_code}
                      </span>
                      {item.error_code ? (
                        <div className="request-id" title={item.error_code}>
                          {item.error_code}
                        </div>
                      ) : null}
                    </td>
                    <td className="numeric token-cell">
                      {formatCompact(item.input_tokens)} / {formatCompact(item.output_tokens)}
                    </td>
                    <td className="numeric">
                      <div className="cost-cell">
                        <strong>
                          {item.cost_status === "unknown"
                            ? "—"
                            : formatUsd(item.cost_usd)}
                        </strong>
                        <span className={`cost-badge ${item.cost_status}`}>
                          {COST_LABELS[item.cost_status] ?? item.cost_status}
                        </span>
                      </div>
                    </td>
                    <td className="numeric">{formatDuration(item.duration_ms)}</td>
                    <td>
                      {item.streamed ? (
                        <span className="stream-mark" title="Streaming SSE">
                          <Zap size={13} aria-hidden="true" />
                          SSE
                        </span>
                      ) : (
                        <span className="muted-text">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="usage-pagination">
          <div className="page-size">
            <span>Baris</span>
            <select value={pageSize} onChange={(event) => updatePageSize(event.target.value)}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <span className="pagination-summary">
            {total === 0 ? "Tidak ada data" : `Menampilkan ${start}-${end} dari ${formatNumber(total)}`}
          </span>
          <div className="pagination-buttons">
            <button
              type="button"
              className="button small"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={loading || page <= 1}
            >
              <ChevronLeft size={14} aria-hidden="true" />
              Sebelumnya
            </button>
            <span className="pagination-page">
              {data?.page ?? page} / {totalPages}
            </span>
            <button
              type="button"
              className="button small"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={loading || page >= totalPages}
            >
              Berikutnya
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
