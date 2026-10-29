import { lazy, Suspense, useEffect, useState } from "react";

import { api } from "./api/client.js";
import { UiProvider, useUi } from "./app-context.jsx";
import { clearAdminToken, getAdminToken, setAdminToken } from "./auth.js";
import Sidebar, { PAGES } from "./components/Sidebar.jsx";
import ToastStack from "./components/ToastStack.jsx";
import Topbar from "./components/Topbar.jsx";
import Login from "./pages/Login.jsx";

const Overview = lazy(() => import("./pages/Overview.jsx"));
const Chat = lazy(() => import("./pages/Chat.jsx"));
const Workflows = lazy(() => import("./pages/Workflows.jsx"));
const Providers = lazy(() => import("./pages/Providers.jsx"));
const Models = lazy(() => import("./pages/Models.jsx"));
const APIKeys = lazy(() => import("./pages/APIKeys.jsx"));
const Analytics = lazy(() => import("./pages/Analytics.jsx"));
const RequestLogs = lazy(() => import("./pages/RequestLogs.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));

const COMPONENTS = {
  overview: Overview,
  chat: Chat,
  workflows: Workflows,
  providers: Providers,
  models: Models,
  keys: APIKeys,
  analytics: Analytics,
  logs: RequestLogs,
  settings: Settings,
};

const COLLAPSE_KEY = "pochi_sidebar_collapsed";

/** true = sembunyikan topbar di Chat Pochi. Dimatikan: hasilnya terasa jelek. */
const CHAT_HIDE_TOPBAR = false;

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function PageFallback() {
  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-copy">
          <span className="skeleton" style={{ width: 180, height: 22, borderRadius: 8 }} />
          <span className="skeleton" style={{ width: 320, height: 12, marginTop: 12 }} />
        </div>
      </div>
      <div className="stat-grid" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <article key={index} className="stat-card">
            <span className="skeleton" style={{ width: "45%", height: 10 }} />
            <span className="skeleton" style={{ width: "60%", height: 26, marginTop: 14 }} />
            <span className="skeleton" style={{ width: "100%", height: 30, marginTop: 18 }} />
          </article>
        ))}
      </div>
    </div>
  );
}

/** Halaman aktif disimpan di hash supaya refresh dan bookmark tidak reset. */
function readHashPage() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return PAGES.some((page) => page.id === raw) ? raw : "overview";
}

function Shell() {
  const { search, setSearch } = useUi();
  const [pageId, setPageId] = useState(readHashPage);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [apiStatus, setApiStatus] = useState("checking");
  const [token, setToken] = useState(getAdminToken);
  const [addProviderSignal, setAddProviderSignal] = useState(0);

  useEffect(() => {
    let active = true;

    function check() {
      api
        .health()
        .then(() => {
          if (active) setApiStatus("online");
        })
        .catch(() => {
          if (active) setApiStatus("offline");
        });
    }

    check();
    const timer = setInterval(check, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      setToken("");
    }
    window.addEventListener("pochi:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("pochi:unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // localStorage diblokir; preferensi tidak disimpan.
    }
  }, [collapsed]);

  useEffect(() => {
    const target = `#/${pageId}`;
    if (window.location.hash !== target) window.location.hash = target;
  }, [pageId]);

  useEffect(() => {
    function handleHashChange() {
      setPageId(readHashPage());
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pageId]);

  const current = PAGES.find((page) => page.id === pageId) ?? PAGES[0];
  const CurrentPage = COMPONENTS[current.id];

  // Kalau nav sudah menampilkan halaman tapi bundelnya belum ikut ter-update
  // (sisa HMR / tab lama), jangan diam-diam menampilkan Overview: muat ulang
  // sekali saja supaya chunk halaman yang benar terambil.
  useEffect(() => {
    if (CurrentPage) return;
    const guard = "pochi_page_reload_at";
    try {
      const last = Number(window.sessionStorage.getItem(guard) ?? 0);
      if (Date.now() - last < 10000) return;
      window.sessionStorage.setItem(guard, String(Date.now()));
      window.location.reload();
    } catch {
      // sessionStorage diblokir; biarkan fallback di bawah yang tampil.
    }
  }, [CurrentPage]);

  function handleLogin(value) {
    setAdminToken(value);
    setToken(value);
    setPageId("overview");
  }

  function handleLogout() {
    clearAdminToken();
    setToken("");
    setPageId("overview");
    setSearch("");
    setMobileOpen(false);
  }

  function handleAddProvider() {
    setPageId("providers");
    setAddProviderSignal((value) => value + 1);
  }

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      <Sidebar
        pageId={current.id}
        onSelect={setPageId}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        apiStatus={apiStatus}
        onLogout={handleLogout}
      />

      {mobileOpen ? (
        <button
          type="button"
          className="scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Tutup navigasi"
        />
      ) : null}

      <div className={`app-main ${CHAT_HIDE_TOPBAR && pageId === "chat" ? "no-topbar" : ""}`}>
        <Topbar
          pageId={pageId}
          minimal={CHAT_HIDE_TOPBAR && pageId === "chat"}
          title={current.label}
          apiStatus={apiStatus}
          onOpenSidebar={() => setMobileOpen(true)}
          onSearchSubmit={() => setPageId("logs")}
          onOpenSettings={() => setPageId("settings")}
          onOpenChat={() => setPageId("chat")}
          onAddProvider={handleAddProvider}
        />

        <main className="content">
          {CurrentPage ? (
            <Suspense fallback={<PageFallback />}>
              <CurrentPage
                onNavigate={setPageId}
                apiStatus={apiStatus}
                openAddSignal={addProviderSignal}
              />
            </Suspense>
          ) : (
            <div className="page">
              <div className="empty-state">
                <h2>Halaman belum termuat</h2>
                <p>Bundel halaman ini belum ikut ter-update di tab lama. Muat ulang untuk mengambil versi terbaru.</p>
                <button type="button" className="btn primary" onClick={() => window.location.reload()}>
                  Muat ulang
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      <ToastStack />
    </div>
  );
}

export default function App() {
  return (
    <UiProvider>
      <Shell />
    </UiProvider>
  );
}
