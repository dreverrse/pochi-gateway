import { Menu, MessageSquare, Plus, Search, Settings } from "lucide-react";

import { useUi } from "../app-context.jsx";
import { RANGES, rangeLabel } from "../utils/range.js";
import { RANGE_PAGES } from "./Sidebar.jsx";

export default function Topbar({
  pageId,
  minimal = false,
  title,
  onOpenSidebar,
  onSearchSubmit,
  onOpenSettings,
  onOpenChat,
  onAddProvider,
  apiStatus,
}) {
  const { range, setRange, search, setSearch } = useUi();
  const showRange = RANGE_PAGES.has(pageId);

  // Mode minimal dipakai halaman yang ingin fokus penuh (Chat Pochi): bar
  // kosong di desktop, tapi tombol menu tetap ada di layar kecil supaya
  // drawer navigasi tidak hilang.
  if (minimal) {
    return (
      <div className="topbar topbar-minimal">
        <button
          type="button"
          className="icon-btn menu-button"
          onClick={onOpenSidebar}
          aria-label="Buka navigasi"
        >
          <Menu size={18} />
        </button>
      </div>
    );
  }

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn menu-button"
        onClick={onOpenSidebar}
        aria-label="Buka navigasi"
      >
        <Menu size={18} />
      </button>

      <div className="topbar-title">
        <span className="topbar-eyebrow">Pochi Gateway</span>
        <h1>{title}</h1>
      </div>

      <div className="topbar-tools">
        <span className={`api-pill ${apiStatus}`}>
          <span className="status-dot" aria-hidden="true" />
          {apiStatus === "online" ? "Online" : apiStatus === "offline" ? "Offline" : "Cek"}
        </span>

        {showRange ? (
          <div
            className="segmented range-switch"
            role="group"
            aria-label="Rentang waktu"
            title={`Rentang data: ${rangeLabel(range)}`}
          >
            {RANGES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={option.id === range ? "active" : ""}
                onClick={() => setRange(option.id)}
                aria-pressed={option.id === range}
                title={rangeLabel(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSearchSubmit?.();
            }}
            placeholder="Cari request, model, provider"
            aria-label="Cari request, model, atau provider"
          />
        </label>

        <button
          type="button"
          className="btn small chat-button"
          onClick={onOpenChat}
          title="Chat dengan model lewat gateway"
        >
          <MessageSquare size={14} aria-hidden="true" />
          Chat Pochi
        </button>

        <button
          type="button"
          className="btn primary small add-provider-button"
          onClick={onAddProvider}
        >
          <Plus size={14} aria-hidden="true" />
          Add Provider
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          aria-label="Buka pengaturan"
          title="Pengaturan"
        >
          <Settings size={17} />
        </button>
      </div>
    </header>
  );
}
