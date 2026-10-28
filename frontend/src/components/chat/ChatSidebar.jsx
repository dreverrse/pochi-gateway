import { useEffect, useRef, useState } from "react";
import {
  Check,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
  X,
} from "lucide-react";

function relativeTime(value) {
  if (!value) return "";
  const stamp = new Date(String(value).replace(" ", "T") + "Z");
  if (Number.isNaN(stamp.getTime())) return "";
  const diff = Date.now() - stamp.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} mnt`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} hr`;
  return stamp.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export default function ChatSidebar({
  conversations,
  activeId,
  search,
  onSearch,
  onNew,
  onOpen,
  onRename,
  onDelete,
  onTogglePin,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  apiStatus,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editingId !== null) inputRef.current?.focus();
  }, [editingId]);

  function startRename(item) {
    setEditingId(item.id);
    setDraft(item.title);
    setConfirmId(null);
  }

  function commitRename() {
    const title = draft.trim();
    if (editingId !== null && title) onRename(editingId, title);
    setEditingId(null);
  }

  const pinned = conversations.filter((item) => item.pinned);
  const rest = conversations.filter((item) => !item.pinned);

  function renderItem(item) {
    const active = item.id === activeId;
    if (editingId === item.id) {
      return (
        <li key={item.id} className="conv-item is-editing">
          <input
            ref={inputRef}
            className="conv-rename"
            value={draft}
            maxLength={120}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitRename();
              }
              if (event.key === "Escape") setEditingId(null);
            }}
            aria-label="Nama percakapan"
          />
          <button type="button" className="conv-icon" onClick={commitRename} aria-label="Simpan nama">
            <Check size={14} />
          </button>
          <button
            type="button"
            className="conv-icon"
            onClick={() => setEditingId(null)}
            aria-label="Batal ganti nama"
          >
            <X size={14} />
          </button>
        </li>
      );
    }

    return (
      <li key={item.id} className={`conv-item ${active ? "is-active" : ""}`}>
        <button
          type="button"
          className="conv-open"
          onClick={() => onOpen(item.id)}
          title={item.title}
        >
          <span className="conv-title">{item.title}</span>
          <span className="conv-meta">
            {item.pinned ? <Pin size={10} aria-hidden="true" /> : null}
            {relativeTime(item.updated_at)}
            {item.message_count ? ` · ${item.message_count} pesan` : ""}
          </span>
        </button>

        {confirmId === item.id ? (
          <span className="conv-confirm">
            <button
              type="button"
              className="conv-icon danger"
              onClick={() => {
                onDelete(item.id);
                setConfirmId(null);
              }}
              aria-label="Hapus permanen"
            >
              Hapus
            </button>
            <button
              type="button"
              className="conv-icon"
              onClick={() => setConfirmId(null)}
              aria-label="Batal hapus"
            >
              <X size={13} />
            </button>
          </span>
        ) : (
          <span className="conv-actions">
            <button
              type="button"
              className="conv-icon"
              onClick={() => onTogglePin(item)}
              aria-label={item.pinned ? "Lepas pin" : "Pin percakapan"}
              title={item.pinned ? "Lepas pin" : "Pin"}
            >
              {item.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
            <button
              type="button"
              className="conv-icon"
              onClick={() => startRename(item)}
              aria-label="Ganti nama"
              title="Ganti nama"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              className="conv-icon danger"
              onClick={() => setConfirmId(item.id)}
              aria-label="Hapus percakapan"
              title="Hapus"
            >
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </li>
    );
  }

  return (
    <aside
      className={`cw-side ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-open" : ""}`}
      aria-label="Riwayat percakapan"
    >
      <header className="cw-side-head">
        <button
          type="button"
          className="cw-icon-btn cw-side-close"
          onClick={onCloseMobile}
          aria-label="Tutup riwayat"
        >
          <X size={16} />
        </button>
        <button
          type="button"
          className="cw-icon-btn cw-side-collapse"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Lebarkan riwayat" : "Ciutkan riwayat"}
          title={collapsed ? "Lebarkan" : "Ciutkan"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </header>

      <button type="button" className="cw-new" onClick={onNew}>
        <MessageSquarePlus size={16} aria-hidden="true" />
        <span>Chat baru</span>
      </button>

      <label className="cw-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Cari percakapan"
          aria-label="Cari percakapan"
        />
      </label>

      <div className="cw-conv-scroll">
        {conversations.length === 0 ? (
          <p className="cw-conv-empty">
            {search ? "Tidak ada judul yang cocok." : "Belum ada percakapan. Mulai chat baru."}
          </p>
        ) : (
          <>
            {pinned.length ? (
              <>
                <p className="cw-group">Disematkan</p>
                <ul className="cw-conv-list">{pinned.map(renderItem)}</ul>
              </>
            ) : null}
            {rest.length ? (
              <>
                {pinned.length ? <p className="cw-group">Terbaru</p> : null}
                <ul className="cw-conv-list">{rest.map(renderItem)}</ul>
              </>
            ) : null}
          </>
        )}
      </div>

      <footer className="cw-side-foot">
        <span className={`cw-status ${apiStatus}`}>
          <span className="status-dot" aria-hidden="true" />
          {apiStatus === "online" ? "Gateway online" : apiStatus === "offline" ? "Gateway offline" : "Memeriksa"}
        </span>
        <span className="cw-side-note">Riwayat tersimpan di SQLite</span>
      </footer>
    </aside>
  );
}
