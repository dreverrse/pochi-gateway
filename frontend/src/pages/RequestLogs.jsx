import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Filter, RefreshCw, ScrollText, Search } from "lucide-react";

import { api } from "../api/client.js";
import { useUi } from "../app-context.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorState from "../components/ErrorState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import RequestDetailModal from "../components/RequestDetailModal.jsx";
import { TableSkeleton } from "../components/Skeleton.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import {
  formatCompact,
  formatDuration,
  formatNumber,
  formatTime,
  formatUsd,
} from "../utils/format.js";
import { rangeFromId, rangeLabel, rangeParams } from "../utils/range.js";

const PAGE_SIZES = [25, 50, 100];

export default function RequestLogs() {
  const { range, search, setSearch, pushToast } = useUi();
  const window = rangeFromId(range);
  const [filters, setFilters] = useState({ status: "all", providerId: "", model: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [data, setData] = useState(null);
  const [options, setOptions] = useState({ providers: [], models: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [detail, setDetail] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters, range]);

  useEffect(() => {
    let active = true;
    Promise.all([api.providers(), api.models()])
      .then(([providers, models]) => {
        if (active) setOptions({ providers, models });
      })
      .catch(() => {
        // Opsi filter tidak wajib untuk menampilkan tabel.
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
        ...rangeParams(range),
        ...filters,
        search: debouncedSearch.trim(),
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
  }, [range, filters, debouncedSearch, page, pageSize, reloadKey]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const activeFilters = useMemo(
    () =>
      Object.entries(filters).filter(([, value]) => value && value !== "all").length +
      (debouncedSearch.trim() ? 1 : 0),
    [filters, debouncedSearch],
  );

  async function handleExport(format) {
    setExporting(true);
    try {
      const response = await api.exportUsage({
        ...rangeParams(range),
        ...filters,
        search: debouncedSearch.trim(),
        format,
      });
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = match ? match[1] : `usage-logs.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      pushToast({ tone: "success", title: "Export selesai", message: `${total} baris diunduh.` });
    } catch (err) {
      pushToast({ tone: "error", title: "Export gagal", message: err.message });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Request Logs"
        description="Metadata request gateway: token, biaya, latensi, status. Isi prompt dan respons tidak disimpan, dan header Authorization tidak pernah dicatat."
        meta={data ? `${formatNumber(total)} request · ${rangeLabel(range)}` : null}
        actions={
          <>
            <button
              type="button"
              className="btn small"
              onClick={() => handleExport("csv")}
              disabled={exporting || !total}
            >
              <Download size={14} aria-hidden="true" />
              CSV
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => handleExport("json")}
              disabled={exporting || !total}
            >
              <Download size={14} aria-hidden="true" />
              JSON
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={loading}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {loading ? "Memuat" : "Muat ulang"}
            </button>
          </>
        }
      />

      <section className="filter-bar">
        <label className="search-field filter-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Cari request, model, atau provider"
            placeholder="Cari request, model, provider"
          />
        </label>

        <label className="filter-field">
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="all">Semua</option>
            <option value="success">Sukses</option>
            <option value="error">Gagal</option>
          </select>
        </label>

        <label className="filter-field">
          <span>Provider</span>
          <select
            value={filters.providerId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, providerId: event.target.value }))
            }
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
          <select
            value={filters.model}
            onChange={(event) => setFilters((current) => ({ ...current, model: event.target.value }))}
          >
            <option value="">Semua model</option>
            {options.models.map((model) => (
              <option key={model.id} value={model.public_name}>
                {model.public_name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn small"
          onClick={() => setFilters({ status: "all", providerId: "", model: "" })}
          disabled={!activeFilters}
        >
          <Filter size={14} aria-hidden="true" />
          Reset{activeFilters ? ` (${activeFilters})` : ""}
        </button>
      </section>

      {error ? (
        <ErrorState
          title="Gagal memuat request logs"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      <section className="panel">
        {loading && !data ? (
          <TableSkeleton rows={8} columns={7} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Tidak ada request yang cocok"
            description="Ubah rentang waktu, filter, atau kata kunci pencarian."
          />
        ) : (
          <div className={`table-scroll ${loading ? "is-loading" : ""}`}>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Model</th>
                  <th scope="col">Provider</th>
                  <th scope="col" className="num">Tokens in / out</th>
                  <th scope="col" className="num">Latency</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="clickable"
                    onClick={() => setDetail(item)}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setDetail(item);
                    }}
                  >
                    <td>
                      <div className="mono-sm">{formatTime(item.created_at)}</div>
                      <div className="cell-sub mono-sm">#{item.request_id.slice(0, 8)}</div>
                    </td>
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
                        <StatusBadge tone="neutral" label="Unknown" dot={false} />
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
        )}

        <footer className="pagination">
          <div className="page-size">
            <span>Rows</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <span className="pagination-summary">
            {total === 0
              ? "Tidak ada data"
              : `Menampilkan ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} dari ${formatNumber(total)}`}
          </span>
          <div className="pagination-buttons">
            <button
              type="button"
              className="btn small"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={loading || page <= 1}
            >
              <ChevronLeft size={14} aria-hidden="true" />
              Prev
            </button>
            <span className="pagination-page">
              {data?.page ?? page} / {totalPages}
            </span>
            <button
              type="button"
              className="btn small"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={loading || page >= totalPages}
            >
              Next
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </section>

      {detail ? <RequestDetailModal item={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
