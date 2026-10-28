# PRD — Pochi Gateway

Terakhir diperbarui: 2026-10-29  
Versi aplikasi: `0.8.0`  
Status: MVP Milestone 1–7 selesai, ditambah Chat Workspace; sisa pekerjaan ada di backlog dan bersifat penyempurnaan.

## 1. Ringkasan

Pochi Gateway adalah dashboard monitoring dan gateway API AI lokal. Gateway menyediakan satu endpoint OpenAI-compatible untuk beberapa provider, dengan autentikasi virtual key, pembatasan model, pencatatan token/biaya, rate limit, dan penegakan anggaran.

Dokumen ini adalah sumber konteks utama untuk model AI atau developer berikutnya. Baca dokumen ini sebelum mengubah kode.

## 2. Tujuan produk

1. Menyatukan beberapa provider AI di balik satu endpoint lokal.
2. Membatasi akses per klien melalui virtual key dan daftar model yang diizinkan.
3. Mengetahui pemakaian token, biaya, status, dan durasi setiap request.
4. Mencegah pemakaian berlebihan melalui rate limit dan anggaran.
5. Menjaga provider secret tetap lokal dan terenkripsi.
6. Memungkinkan pengguna berganti model AI tanpa kehilangan konteks proyek melalui dokumen PRD yang lengkap.

## 3. Pengguna dan alur utama

- Admin lokal membuka dashboard, login dengan admin token, lalu mengelola provider, model, dan virtual key.
- Klien seperti Pochi, Hermes, atau aplikasi OpenAI-compatible memakai base URL gateway dan virtual key.
- Klien memanggil `/v1/models` lalu `/v1/chat/completions`, termasuk streaming SSE.
- Admin memantau ringkasan, grafik, analytics, request logs, biaya, dan status request lewat sembilan halaman dashboard.
- Admin memakai **Chat Pochi** untuk mengobrol langsung dengan model gateway; riwayat percakapan tersimpan dan bisa dibuka lagi.
- Admin dapat mengubah harga model dan melihat dampaknya pada request baru.

## 4. Scope dan status

### Selesai

- [x] Backend FastAPI, frontend React + Vite, SQLite, seed demo 14 hari.
- [x] Login admin Bearer dan proteksi endpoint `/api/v1/admin/*`.
- [x] CRUD provider, enkripsi API key Fernet, uji koneksi provider.
- [x] CRUD model gateway: alias publik, provider, model upstream, status, harga.
- [x] Virtual key: token sekali tampil, hash SHA-256, allowlist model, anggaran, revoke.
- [x] Gateway OpenAI-compatible: `/v1/models`, `/v1/chat/completions`, streaming SSE.
- [x] Routing provider, adapter OpenAI-compatible dan Inception, timeout, error shape OpenAI.
- [x] Logging request metadata, token, biaya, status, durasi, streaming, request ID.
- [x] Harga model efektif, kalkulasi biaya `known`/`unknown`.
- [x] Dashboard sembilan halaman: Overview, Chat, Workflows, Providers, Models, API Keys, Analytics, Request Logs, Settings.
- [x] Design token terpusat (warna, radius, transisi) dan layout responsif hingga lebar ponsel.
- [x] Empat KPI Overview dengan perbandingan periode sebelumnya, sparkline, dan grafik metrik 24H/7D/30D.
- [x] Halaman Analytics dengan filter provider/model/API key/status, p50/p95 latensi, dan tiga tabel breakdown.
- [x] Halaman Request Logs dengan pencarian, filter status/provider/model, detail request, dan export.
- [x] Halaman Settings read-only berisi konfigurasi runtime efektif tanpa secret.
- [x] Navigasi hash (`#/analytics`) agar refresh dan bookmark mempertahankan halaman.
- [x] Rate limit fixed-window per virtual key.
- [x] Penegakan anggaran harian/bulanan sebelum request diteruskan.
- [x] Script backup dan script uji beban/RAM.
- [x] 89 pengujian backend lulus.
- [x] Build frontend lulus dengan code splitting per halaman; bundle awal ~246 kB, `UsageChart` (Recharts) ~359 kB dimuat lazy, tiap halaman 5,8–15,8 kB.
- [x] Pemakaian anggaran berjalan ditampilkan di halaman API Keys.
- [x] Riwayat perubahan harga model tersedia di UI (modal dari halaman Models).
- [x] Export usage logs CSV/JSON.
- [x] Rate limit per key yang dapat diatur dari UI.
- [x] Injeksi `stream_options.include_usage` untuk adapter yang mendukung.
- [x] Dokumentasi deployment HTTPS/reverse proxy.
- [x] Preset 14 provider OpenAI-compatible (`provider_templates.py`) dengan base URL, catatan free tier, dokumentasi, dan tautan pembuatan key; UI hanya mengisi modal, bukan menyimpan otomatis.
- [x] Chat Workspace (`#/chat`): panel riwayat, header model gateway dengan provider + harga, markdown aman, code block bernomor baris dengan tombol salin, composer mengambang, empty state dengan saran prompt.
- [x] `POST /api/v1/admin/chat` dengan opsi `conversation_id` + `user_message`: streaming lewat `proxy_chat`, `virtual_key_id` NULL, usage dicatat sekali lewat callback `on_complete`.
- [x] Persistensi percakapan di SQLite (`conversations`, `conversation_messages`): buat, buka, ganti nama, pin, hapus, bersihkan, hapus satu pesan, plus `?search=` pada daftar.
- [x] Stop dua lapis: event server lewat `POST /conversations/{id}/stop` dan deteksi disconnect (`request.is_disconnected` + polling 100 ms saat menunggu byte pertama).
- [x] Logo, favicon, dan mark sidebar/login memakai ikon proyek Pochi (`github.com/dreverrse/pochi`).
- [x] Workflow builder: tabel `workflows`/`workflow_runs`/`workflow_steps`, node tetap (`trigger.manual|schedule|webhook`, `action.chat|http`, `logic.condition|set`), validasi DAG, templating `{{path}}`, executor, log per node, scheduler 30 detik, dan webhook publik bertoken.
- [x] Kanvas workflow di dashboard: drag node, sambung port, inspector konfigurasi per tipe, panel run dan riwayat run.

### Backlog

- Antrian request/worker terpisah bila trafik tumbuh melewati kapasitas satu proses uvicorn.
- Autentikasi multi-user (peran admin/viewer) di luar Bearer token tunggal.
- Reservasi anggaran pra-request agar request bersamaan tidak dapat melampaui batas.
- Rate limit sliding-window atau token-bucket sebagai pengganti fixed-window.
- Notifikasi (email/webhook) saat anggaran key mendekati batas.

## 5. Arsitektur

```text
Browser / klien OpenAI-compatible
        |
        v
FastAPI (127.0.0.1:8000)
  ├── /health
  ├── /api/v1/admin/*   -> admin Bearer token
  └── /v1/*             -> virtual key Bearer token
        |
        ├── SQLite (data/pochi.db)
        └── Provider API (OpenAI-compatible / Inception)
```

Stack:

- Backend: Python 3.14, FastAPI, httpx, Pydantic, SQLite.
- Frontend: React 19, Vite 8, Recharts, lucide-react.
- Enkripsi provider secret: Fernet.
- Tidak ada Redis, queue, atau worker terpisah.

## 6. Struktur proyek

```text
pochi-gateway/
├── backend/
│   ├── app/
│   │   ├── api/          # admin.py, gateway.py
│   │   ├── core/         # config.py, security.py
│   │   ├── db/           # schema, seed, repositories, time_window, analytics_repository
│   │   ├── models/       # schema Pydantic (termasuk analytics, settings)
│   │   ├── services/     # provider, model, key, gateway, pricing, usage, analytics
│   │   └── main.py
│   ├── scripts/          # backup.py, load_test.py
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/          # client.js
│       ├── components/   # Sidebar, Topbar, StatCard, UsageChart, modal, empty/error state
│       ├── pages/        # Overview, Providers, Models, APIKeys, Analytics, RequestLogs, Settings, Login
│       ├── styles/       # app.css (token + komponen)
│       └── utils/        # format.js, range.js
├── data/                 # DB, token, secret, backup; tidak masuk Git
├── .env.example
├── README.md
└── PRD.md
```

## 7. Model data

Tabel utama:

- `providers`: nama, base URL, adapter, status.
- `provider_secrets`: ciphertext API key per provider.
- `models`: alias publik, provider, model upstream, status, flag `supports_streaming` dan `is_default`.
- `model_prices`: harga input/output per 1 juta token, periode efektif, sumber.
- `virtual_keys`: prefix, hash token, allowlist model, anggaran, status, last used.
- `request_logs`: metadata request, token, biaya, status, durasi, error.
- `rate_limit_windows`: counter fixed-window per virtual key.
- `conversations`: judul, model terpilih, system prompt, temperature, max token, pin, timestamp.
- `conversation_messages`: role, isi, status (`complete|streaming|error|stopped`), model, provider, token, biaya, durasi, error.

Keputusan data:

- Model tidak dihapus; gunakan status nonaktif.
- Harga disimpan sebagai entri efektif baru agar request lama tidak berubah.
- Harga dicari berdasarkan `provider_model`, sehingga model publik berbeda yang memakai nama upstream sama berbagi harga.
- Isi percakapan chat dashboard disimpan di `conversation_messages` (lokal, satu admin token). Request gateway `/v1/*` tetap hanya menyimpan metadata.
- Pesan asisten yang dihentikan disimpan dengan status `stopped` beserta potongan teks yang sempat diterima.

## 8. API utama

Admin:

- `POST /api/v1/admin/login`
- `GET /api/v1/admin/summary`
- `GET /api/v1/admin/usage/timeseries`
- `GET /api/v1/admin/usage/logs`
- `GET /api/v1/admin/usage/export` (`format=csv|json`, filter sama dengan logs)
- `GET /api/v1/admin/prices/history?provider_model=<nama>`
- `GET /api/v1/admin/analytics` (filter status/provider/model/key; p50/p95 dan breakdown)
- `GET /api/v1/admin/providers/stats` (pemakaian per provider)
- `GET /api/v1/admin/settings` (konfigurasi runtime efektif, read-only, tanpa secret)
- CRUD `/api/v1/admin/providers`
- CRUD `/api/v1/admin/models` (termasuk flag `supports_streaming` dan `is_default`)
- CRUD/revoke `/api/v1/admin/keys`
- `GET /api/v1/admin/provider-templates` (katalog preset, tanpa secret)
- `POST /api/v1/admin/chat` (chat dashboard, streaming SSE, `conversation_id` + `user_message` opsional)
- `GET|POST /api/v1/admin/conversations`, `GET|PATCH|DELETE /api/v1/admin/conversations/{id}`
- `POST /api/v1/admin/conversations/{id}/clear`, `POST /api/v1/admin/conversations/{id}/stop`
- `DELETE /api/v1/admin/conversations/{id}/messages/{message_id}`
- CRUD `/api/v1/admin/workflows`, `POST /{id}/run`, `GET /{id}/runs`, `GET /runs/{run_id}`
- `POST /api/v1/hooks/{token}` (webhook workflow, publik, 30/menit, body maks 32 KB)

Gateway:

- `GET /v1/models`
- `POST /v1/chat/completions`

Detail filter usage logs: `days=1..90` atau `hours=1..2160`, `status=all|success|error`, `model`, `key_id`, `provider_id`, `search`, `page`, `page_size=1..100`. Export memakai filter yang sama.

`supports_streaming` dan `is_default` adalah penanda untuk UI saja; routing gateway tidak berubah karenanya.

## 9. Perilaku gateway

Urutan request chat:

1. Autentikasi virtual key.
2. Resolve model publik dan cek allowlist.
3. Cek provider aktif dan secret tersedia.
4. Rate limit per key.
5. Cek anggaran periode berjalan.
6. Proxy ke provider, streaming atau non-streaming.
7. Catat metadata request dan hitung biaya bila usage + harga tersedia.

Aturan penting:

- Token admin tidak boleh dipakai ke `/v1/*`.
- Header Authorization klien tidak diteruskan; gateway memakai secret provider sendiri.
- Timeout default: baca 120 detik, koneksi 10 detik.
- Rate limit default: 60 request/menit/key; `0` menonaktifkan.
- Anggaran dihitung dari biaya `known` dan `estimated` pada periode UTC berjalan.
- Biaya `unknown` tidak dihitung ke anggaran.
- Request yang ditolak auth/model/rate/budget belum tentu masuk usage logs.
- Streaming usage hanya tercatat jika provider mengirim objek `usage`.

## 10. Keamanan dan batasan

Kontrol aktif:

- Backend default hanya mendengarkan `127.0.0.1`.
- Admin token dan kunci enkripsi di `data/`, mode 600, tidak masuk Git; token dibandingkan `compare_digest`.
- Login dibatasi 10 percobaan gagal per menit per alamat klien (`LoginThrottle` in-memory), membalas `429` + `Retry-After`.
- Middleware memasang CSP ketat (kecuali `/docs`), `nosniff`, `DENY` framing, `no-referrer`, `Permissions-Policy`, dan HSTS saat skema HTTPS.
- Database SQLite dan `-wal`/`-shm` di-chmod 600 saat init.
- `base_url` provider divalidasi: hanya http/https, tanpa kredensial/query/fragment, dan menolak host privat/loopback/link-local bila `POCHI_ALLOW_PRIVATE_PROVIDER_URLS=false`.
- Provider secret tidak pernah dikirim ke browser; virtual key hanya hash; token tampil sekali.
- Backup berisi admin token dan kunci enkripsi; direktori backup diabaikan Git.

Batasan yang masih ada:

- Satu admin token: tanpa peran, tanpa kedaluwarsa, tanpa audit trail tindakan admin.
- Belum ada HTTPS di proses aplikasi; TLS, WAF, dan rate limit per-IP diserahkan ke reverse proxy.
- Budget check pre-request, bukan reservasi; request bersamaan dapat melampaui batas tipis.
- Rate limit fixed-window; lonjakan di batas window masih mungkin.
- Validasi host provider terjadi saat disimpan; DNS rebinding setelah penyimpanan tidak dicegah.
- Biaya bisa `unknown` jika usage atau harga tidak tersedia.
- Webhook workflow adalah endpoint publik: keamanannya bergantung pada kerahasiaan token (32 karakter URL-safe) dan throttle 30/menit per IP, bukan pada autentikasi.
- Node HTTP workflow tidak punya allowlist domain; pemblokiran hanya untuk host privat saat `POCHI_ALLOW_PRIVATE_PROVIDER_URLS=false`.
- Workflow memakai tipe node tetap: tidak ada node kode, import n8n, retry, atau kredensial per node.
- Chat dashboard dan node Chat workflow mencatat usage dengan `virtual_key_id` NULL, sehingga tidak masuk anggaran virtual key mana pun.
- Riwayat chat tersimpan tanpa enkripsi tambahan di SQLite lokal; siapa pun yang memegang admin token dapat membacanya.
- Markdown dirender tanpa `dangerouslySetInnerHTML`; tetap ada risiko tampilan (bukan eksekusi) dari teks yang sangat panjang.
- Chat memakai `stop_event` in-process; kalau uvicorn dijalankan multi-worker, tombol Stop hanya menjangkau worker yang memegang stream.

## 11. Konfigurasi

Variabel penting:

- `POCHI_DB_PATH`
- `POCHI_SEED_DEMO`
- `POCHI_ADMIN_TOKEN`
- `POCHI_ADMIN_TOKEN_PATH`
- `POCHI_SECRET_KEY_PATH`
- `POCHI_PROVIDER_TIMEOUT_SECONDS`
- `POCHI_GATEWAY_TIMEOUT_SECONDS`
- `POCHI_GATEWAY_CONNECT_TIMEOUT_SECONDS`
- `POCHI_GATEWAY_RATE_LIMIT_RPM`
- `POCHI_WORKFLOW_SCHEDULER_ENABLED`

Lihat `.env.example` dan README untuk default.

## 12. Cara menjalankan dan memverifikasi

Backend:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm run dev
```

Deployment non-lokal (HTTPS, reverse proxy, service systemd, firewall): lihat bagian "Deployment non-lokal" di `README.md`.

Verifikasi wajib setelah perubahan:

```bash
cd backend
timeout 60s .venv/bin/pytest -q

cd ../frontend
npm run build
```

Baseline saat PRD dibuat: `47 passed`; baseline saat ini: `68 passed` (termasuk `test_ui_contract.py` dan `test_security.py`); build frontend sukses dengan code splitting.

Backup:

```bash
cd backend
.venv/bin/python scripts/backup.py --keep 7
```

Uji beban:

```bash
cd backend
.venv/bin/python scripts/load_test.py --requests 100 --concurrency 10
```

## 13. Requirement berikutnya: handoff saat ganti model AI

Masalah pengguna:

> Saat berganti model AI, model baru tidak mengetahui konteks, keputusan, dan tujuan proyek.

Tujuan:

- Model AI berikutnya dapat melanjutkan pekerjaan tanpa mengulang eksplorasi.
- Konteks harus ringkas, faktual, dan tersimpan di repo.
- Keputusan yang sudah dibuat tidak boleh diubah tanpa alasan kuat.
- Batasan keamanan dan data rahasia harus tetap dipatuhi.

Implementasi saat ini:

- `PRD.md` menjadi sumber konteks utama.
- `README.md` menjadi dokumentasi penggunaan.
- Model berikutnya wajib membaca `PRD.md` sebelum coding.

Acceptance criteria:

- Model baru dapat mengetahui status milestone, arsitektur, endpoint, keputusan, dan backlog hanya dari repo.
- Model baru menjalankan test/build sebelum menyatakan selesai.
- Model baru tidak membuka atau meng-commit `data/admin_token`, DB, secret, atau backup.
- Jika requirement ambigu, model baru harus bertanya sebelum mengubah perilaku produk.

Catatan ambiguitas:

- Jika yang dimaksud “ganti model” adalah mengganti model AI yang mengerjakan proyek, PRD ini adalah solusinya.
- Jika yang dimaksud adalah fitur di aplikasi gateway untuk mengganti model tujuan secara dinamis, kebutuhan itu belum didefinisikan dan harus diklarifikasi sebelum implementasi.

## 14. Aturan kerja untuk model AI berikutnya

1. Baca `PRD.md`, `README.md`, dan file terkait sebelum mengubah kode.
2. Pertahankan pola arsitektur yang ada: route tipis, logika di service, SQL di repository.
3. Jangan menambah dependency tanpa kebutuhan jelas.
4. Jangan mengubah data demo atau harga secara destruktif saat smoke test.
5. Jangan commit secret, database, token, atau backup.
6. Jalankan `pytest` dan build frontend setelah perubahan.
7. Perbarui PRD/README jika perilaku produk berubah.
8. Jangan commit atau push kecuali diminta eksplisit.
9. Jika menemukan bug lama, perbaiki dengan perubahan minimal dan tambahkan test regresi.
10. Laporkan hasil dengan bukti test, bukan asumsi.

## 15. Prompt handoff singkat

Gunakan prompt berikut saat berganti model AI:

```text
Kamu melanjutkan proyek Pochi Gateway di /home/kyle/Proyek/Pochi/pochi-gateway (lokal, EndeavourOS) atau /data/data/com.termux/files/home/Projects/pochi-gateway (Termux).
Baca PRD.md dan README.md terlebih dahulu. Patuhi keputusan, batasan keamanan, dan backlog di sana.
Tujuan saat ini: [tulis tugas baru].
Sebelum coding, ringkas pemahamanmu dan sebutkan file yang akan diubah.
Setelah selesai, jalankan pytest dan build frontend, lalu laporkan hasil aktual.
```
