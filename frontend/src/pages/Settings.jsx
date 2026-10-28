import { useEffect, useState } from "react";
import { Activity, KeyRound, Server, ShieldCheck, Terminal } from "lucide-react";

import { api } from "../api/client.js";
import ErrorState from "../components/ErrorState.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { PanelSkeleton } from "../components/Skeleton.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

export default function Settings({ apiStatus }) {
  const [settings, setSettings] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.settings(), api.health()])
      .then(([settingsData, healthData]) => {
        if (!active) return;
        setSettings(settingsData);
        setHealth(healthData);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="page">
        <PageHeader title="Settings" description="Konfigurasi runtime gateway." />
        <ErrorState title="Gagal memuat settings" message={error} />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="page">
        <PageHeader title="Settings" description="Konfigurasi runtime gateway." />
        <section className="panel">
          <PanelSkeleton height={160} />
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Settings"
        description="Nilai runtime yang dibaca dari environment. Halaman ini read-only: ubah lewat .env lalu restart service."
      />

      <div className="settings-grid">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>
                <Server size={15} aria-hidden="true" /> Gateway
              </h2>
              <p>Identitas aplikasi dan endpoint publik</p>
            </div>
            <StatusBadge
              tone={apiStatus === "online" ? "ok" : "err"}
              label={apiStatus === "online" ? "Online" : "Offline"}
            />
          </header>

          <dl className="settings-list">
            <div>
              <dt>Nama aplikasi</dt>
              <dd>{settings.app_name}</dd>
            </div>
            <div>
              <dt>Versi</dt>
              <dd className="mono-sm">{settings.app_version}</dd>
            </div>
            <div>
              <dt>Database</dt>
              <dd>{health?.database === "ok" ? "SQLite OK" : "Tidak diketahui"}</dd>
            </div>
            <div>
              <dt>Base URL lokal</dt>
              <dd className="mono-sm">http://127.0.0.1:8000</dd>
            </div>
            <div>
              <dt>Endpoint OpenAI-compatible</dt>
              <dd className="mono-sm">/v1/models · /v1/chat/completions</dd>
            </div>
            <div>
              <dt>URL provider privat</dt>
              <dd>
                {settings.allow_private_provider_urls
                  ? "Diizinkan (mode lokal)"
                  : "Ditolak (mode publik)"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>
                <Activity size={15} aria-hidden="true" /> Limit &amp; timeout
              </h2>
              <p>Nilai efektif proses yang sedang berjalan</p>
            </div>
          </header>

          <dl className="settings-list">
            <div>
              <dt>Rate limit default / key</dt>
              <dd>{settings.rate_limit_rpm ? `${settings.rate_limit_rpm} request/menit` : "Nonaktif"}</dd>
            </div>
            <div>
              <dt>Timeout baca gateway</dt>
              <dd>{settings.gateway_timeout_seconds} s</dd>
            </div>
            <div>
              <dt>Timeout koneksi gateway</dt>
              <dd>{settings.gateway_connect_timeout_seconds} s</dd>
            </div>
            <div>
              <dt>Timeout uji provider</dt>
              <dd>{settings.provider_timeout_seconds} s</dd>
            </div>
            <div>
              <dt>CORS origins</dt>
              <dd className="mono-sm">{settings.cors_origins.join(", ") || "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>
                <ShieldCheck size={15} aria-hidden="true" /> Keamanan
              </h2>
              <p>Batas yang dijaga aplikasi</p>
            </div>
          </header>
          <ul className="bullet-list">
            <li>Admin token disimpan di sessionStorage browser, bukan localStorage.</li>
            <li>Provider secret dienkripsi Fernet di server dan tidak pernah dikirim kembali.</li>
            <li>Virtual key hanya disimpan sebagai hash SHA-256; token tampil sekali.</li>
            <li>Isi prompt/respons tidak disimpan; log hanya metadata request.</li>
            <li>Percobaan login dibatasi 10 per menit per alamat klien.</li>
            <li>Respons API membawa CSP ketat, <code>nosniff</code>, dan larangan framing.</li>
            <li>Backend hanya mendengarkan 127.0.0.1 sampai reverse proxy HTTPS dipasang.</li>
          </ul>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>
                <Terminal size={15} aria-hidden="true" /> Operasional
              </h2>
              <p>Perintah yang dipakai di mesin ini</p>
            </div>
          </header>
          <div className="code-block">
            <code>systemctl --user status pochi-gateway</code>
            <code>systemctl --user restart pochi-gateway</code>
            <code>cd backend &amp;&amp; .venv/bin/python scripts/backup.py --keep 7</code>
            <code>cd backend &amp;&amp; .venv/bin/pytest -q</code>
          </div>
          <p className="field-note">
            Backup berisi database, <code>secret.key</code>, dan admin token — simpan di luar
            mesin yang sama.
          </p>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>
                <KeyRound size={15} aria-hidden="true" /> Belum tersedia
              </h2>
              <p>Supaya tidak ada tombol yang mengklaim operasi palsu</p>
            </div>
          </header>
          <ul className="bullet-list">
            <li>Hapus provider permanen: model yang terhubung menahan penghapusan (FK restrict).</li>
            <li>Hapus virtual key: hanya revoke permanen, sesuai skema hash.</li>
            <li>Multi-user/role: saat ini satu admin token.</li>
            <li>Reservasi anggaran: pengecekan bersifat pre-request, bukan penguncian.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
