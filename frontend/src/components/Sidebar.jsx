import {
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  KeyRound,
  LayoutDashboard,
  LineChart,
  LogOut,
  MessageSquare,
  ScrollText,
  Server,
  Settings,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";

import PochiLogo from "./PochiLogo.jsx";

/**
 * `ranges: true` menandai halaman yang datanya benar-benar ikut rentang waktu.
 * Topbar memakai ini supaya 24H/7D/30D hanya muncul di tempat ia berpengaruh:
 * halaman lain (Chat, Models, API Keys, Settings, Workflows) tidak punya data
 * per-periode, jadi kontrolnya hanya jadi tombol mati di sana.
 */
export const PAGES = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, ranges: true },
  { id: "chat", label: "Chat Pochi", icon: MessageSquare },
  { id: "workflows", label: "Workflows", icon: Workflow },
  { id: "providers", label: "Providers", icon: Server, ranges: true },
  { id: "models", label: "Models", icon: Boxes },
  { id: "keys", label: "API Keys", icon: KeyRound },
  { id: "analytics", label: "Analytics", icon: LineChart, ranges: true },
  { id: "logs", label: "Request Logs", icon: ScrollText, ranges: true },
  { id: "settings", label: "Settings", icon: Settings },
];

export const RANGE_PAGES = new Set(PAGES.filter((page) => page.ranges).map((page) => page.id));

export default function Sidebar({
  pageId,
  onSelect,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  apiStatus,
  onLogout,
}) {
  return (
    <aside
      className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "open" : ""}`}
      aria-label="Navigasi utama"
    >
      <div className="sidebar-brand">
        <PochiLogo size={32} className="brand-logo" />
        <span className="brand-name">
          <strong>Pochi</strong>
          <small>Gateway</small>
        </span>
        <button
          type="button"
          className="icon-btn sidebar-close"
          onClick={onCloseMobile}
          aria-label="Tutup navigasi"
        >
          <X size={17} />
        </button>
      </div>

      <nav className="nav">
        {PAGES.map((page) => {
          const Icon = page.icon;
          const active = page.id === pageId;
          return (
            <button
              key={page.id}
              type="button"
              className={`nav-item ${page.id === "chat" ? "nav-accent" : ""} ${active ? "active" : ""}`}
              onClick={() => onSelect(page.id)}
              aria-current={active ? "page" : undefined}
              title={collapsed ? page.label : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              <span className="nav-label">{page.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className={`gateway-status ${apiStatus}`} title={`Gateway: ${apiStatus}`}>
          <span className="status-dot" aria-hidden="true" />
          <span className="status-copy">
            <strong>
              {apiStatus === "online"
                ? "Gateway online"
                : apiStatus === "offline"
                  ? "Gateway offline"
                  : "Memeriksa gateway"}
            </strong>
            <small>127.0.0.1:8000</small>
          </span>
        </div>

        <div className="sidebar-note">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>Local-first. Secret tetap di server.</span>
        </div>

        <div className="sidebar-actions">
          <button type="button" className="btn ghost small" onClick={onLogout}>
            <LogOut size={14} aria-hidden="true" />
            <span className="nav-label">Keluar</span>
          </button>
          <button
            type="button"
            className="icon-btn collapse-toggle"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}
            aria-pressed={collapsed}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
