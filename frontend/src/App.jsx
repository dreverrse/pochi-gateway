import { useEffect, useState } from "react";
import {
  Boxes,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";

import { api } from "./api/client.js";
import { clearAdminToken, getAdminToken, setAdminToken } from "./auth.js";
import APIKeys from "./pages/APIKeys.jsx";
import Login from "./pages/Login.jsx";
import Models from "./pages/Models.jsx";
import Overview from "./pages/Overview.jsx";
import Providers from "./pages/Providers.jsx";
import UsageLogs from "./pages/UsageLogs.jsx";

const PAGES = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, Component: Overview },
  { id: "providers", label: "Providers", icon: Server, Component: Providers },
  { id: "models", label: "Models", icon: Boxes, Component: Models },
  { id: "keys", label: "API Keys", icon: KeyRound, Component: APIKeys },
  { id: "usage", label: "Usage Logs", icon: ScrollText, Component: UsageLogs },
];

export default function App() {
  const [pageId, setPageId] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState("checking");
  const [token, setToken] = useState(getAdminToken);

  useEffect(() => {
    let active = true;
    api
      .health()
      .then(() => {
        if (active) setApiStatus("online");
      })
      .catch(() => {
        if (active) setApiStatus("offline");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      setToken("");
    }
    window.addEventListener("pochi:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("pochi:unauthorized", handleUnauthorized);
  }, []);

  const current = PAGES.find((page) => page.id === pageId) ?? PAGES[0];
  const CurrentPage = current.Component;

  function selectPage(id) {
    setPageId(id);
    setSidebarOpen(false);
  }

  function handleLogin(value) {
    setAdminToken(value);
    setToken(value);
    setPageId("overview");
  }

  function handleLogout() {
    clearAdminToken();
    setToken("");
    setPageId("overview");
    setSidebarOpen(false);
  }

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Navigasi utama">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">P</div>
          <div>
            <strong>Pochi</strong>
            <span>Gateway</span>
          </div>
          <button
            type="button"
            className="icon-button close-sidebar"
            onClick={() => setSidebarOpen(false)}
            aria-label="Tutup navigasi"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="nav">
          <p className="nav-label">Monitoring</p>
          {PAGES.map((page) => {
            const Icon = page.icon;
            const active = page.id === current.id;
            return (
              <button
                key={page.id}
                type="button"
                className={`nav-item ${active ? "active" : ""}`}
                onClick={() => selectPage(page.id)}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{page.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="security-note">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Local-first. Hanya 127.0.0.1.</span>
          </div>
          <code>127.0.0.1:8000</code>
          <button type="button" className="logout-button" onClick={handleLogout}>
            <LogOut size={15} aria-hidden="true" />
            Keluar
          </button>
        </div>
      </aside>

      {sidebarOpen ? (
        <button
          type="button"
          className="scrim"
          onClick={() => setSidebarOpen(false)}
          aria-label="Tutup navigasi"
        />
      ) : null}

      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button menu-button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka navigasi"
          >
            <Menu size={20} />
          </button>
          <div className="topbar-title">
            <p className="eyebrow">Pochi Gateway</p>
            <h1>{current.label}</h1>
          </div>
          <div className={`api-status ${apiStatus}`} title={`Status API: ${apiStatus}`}>
            <span className="status-dot" aria-hidden="true" />
            <span className="status-text">
              {apiStatus === "online" ? "API online" : apiStatus === "offline" ? "API offline" : "Memeriksa API"}
            </span>
          </div>
        </header>

        <div className="content">
          <CurrentPage />
        </div>
      </main>
    </div>
  );
}
