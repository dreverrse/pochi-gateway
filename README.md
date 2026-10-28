# Pochi Gateway

Dashboard monitoring dan gateway API AI lokal. Satu endpoint untuk beberapa provider, dengan pencatatan request, token, dan biaya.

Status saat ini: **MVP selesai (Milestone 1-8): gateway OpenAI-compatible dengan provider, model, virtual key, biaya, usage logs, rate limit, penegakan anggaran, backup, uji beban, dashboard sembilan halaman (Overview, Chat, Workflows, Providers, Models, API Keys, Analytics, Request Logs, Settings), chat lewat gateway, preset provider gratis, dan workflow automation bergaya n8n.**

## Yang sudah berjalan

- Backend FastAPI dengan health check dan dokumentasi OpenAPI.
- SQLite dengan skema providers, provider_secrets, virtual_keys, models, model_prices, dan request_logs.
- Seed data demo 14 hari (provider, model, virtual key, dan request log fiktif).
- Endpoint ringkasan dashboard dan timeseries.
- Dashboard React + Vite dengan sidebar, topbar (status gateway, rentang 24H/7D/30D, pencarian, Add Provider), dan design token terpusat.
- **Chat Workspace** (`#/chat`): panel riwayat percakapan, header model gateway (provider + harga), markdown aman, code block dengan nomor baris dan tombol salin, composer mengambang, dan streaming SSE.
- Percakapan disimpan server-side di SQLite (`conversations`, `conversation_messages`): buat, buka, ganti nama, pin, hapus, bersihkan, dan pulihkan setelah refresh.
- Tombol Stop menghentikan stream di server (bukan hanya menutup koneksi browser); pesan asisten tersimpan dengan status `stopped`.
- Usage per balasan (token masuk/keluar/total, latensi, biaya, provider, model) dicatat lewat pipeline usage yang sama, tanpa penghitungan ganda di analytics.
- Logo dan favicon memakai mark proyek Pochi (`github.com/dreverrse/pochi`), bukan aset pihak lain.
- Preset 14 provider (OpenRouter, Groq, Gemini, Cerebras, Mistral, NVIDIA, SambaNova, Together, Hugging Face, Cohere, Cloudflare, Ollama, llama.cpp, 9Router); base URL terisi otomatis, API key diisi sendiri.
- Workflow builder bergaya n8n: kanvas node, koneksi, trigger manual/jadwal/webhook, node Chat AI/HTTP/kondisi/set data, dan riwayat run.
- Login admin memakai Bearer token; endpoint administrasi terlindungi.
- CRUD provider, uji koneksi `/models`, dan pengaturan status aktif/nonaktif.
- API key provider dienkripsi Fernet dengan kunci terpisah dari database.
- Secret provider tidak pernah dikirim kembali ke browser.
- Pembuatan virtual key dengan token sekali tampil, hash SHA-256, prefix, pembatasan model, batas anggaran harian/bulanan, dan pencabutan permanen.
- CRUD model gateway: memetakan nama publik ke model provider, mengatur status aktif/nonaktif, dan harga per 1M token.
- Harga model disimpan dengan riwayat efektif; request baru dihitung sebagai `known` bila usage dan harga tersedia.
- Gateway `GET /v1/models` dan `POST /v1/chat/completions` dengan Bearer virtual key.
- Routing model publik ke provider dan model upstream, adapter OpenAI-compatible dan Inception.
- Pembatasan model per virtual key ditegakkan di gateway.
- Dukungan respons streaming SSE dan penggunaan token dari respons provider.
- Logging setiap request yang mencapai provider: model, token, biaya, status, durasi, streaming, dan request ID.
- Halaman Overview: empat KPI (request, token, biaya, success rate) dengan perbandingan periode sebelumnya dan sparkline, grafik metrik, ringkasan provider, request terbaru.
- Halaman Analytics dengan filter provider/model/API key/status, p50 dan p95 latensi, serta tabel breakdown.
- Halaman Request Logs: pencarian, filter status/provider/model, pagination, detail request, dan export CSV/JSON.
- Halaman Settings read-only berisi konfigurasi runtime efektif (rate limit, timeout, CORS) tanpa secret.
- Navigasi dashboard memakai hash (`#/analytics`) sehingga refresh dan bookmark tidak reset halaman.
- Rate limit fixed-window per virtual key dan penegakan batas anggaran harian/bulanan.
- Script backup konsisten untuk database, admin token, dan kunci enkripsi.
- Script uji beban ringan dengan pengukuran latensi dan RAM proses.
- `.env`, database, admin token, kunci enkripsi, dan direktori backup diabaikan Git.
- 89 pengujian backend lulus.
- Pemakaian anggaran berjalan tampil di halaman API Keys; riwayat harga model punya modal sendiri.
- Export usage logs ke CSV/JSON dari halaman Request Logs.
- Rate limit per key dapat diatur dari dashboard (kolom `rate_limit_rpm`).
- Code splitting per halaman; bundle awal turun dari ~641 kB ke ~237 kB.

> **Admin token:** endpoint `/api/v1/admin/*` memerlukan Bearer token. Token dibuat otomatis di `data/admin_token` (mode 600) saat pertama dijalankan, atau gunakan `POCHI_ADMIN_TOKEN`. Jangan commit file tersebut.

## Struktur proyek

```text
pochi-gateway/
├── backend/
│   ├── app/
│   │   ├── api/          # gateway.py, admin.py, workflows.py
│   │   ├── core/         # konfigurasi, keamanan, enkripsi
│   │   ├── db/           # koneksi, schema.sql, seed, repositories, workflow_repository
│   │   ├── models/       # model respons Pydantic
│   │   ├── services/     # gateway, providers, workflows, workflow_scheduler, provider_templates
│   │   └── main.py
│   ├── tests/
│   ├── pytest.ini
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/          # client.js (semua endpoint)
│       ├── components/   # Sidebar, Topbar, StatCard, UsageChart, modal, dll.
│       ├── pages/        # Overview, Chat, Workflows, Providers, Models, APIKeys, Analytics, RequestLogs, Settings, Login
│       ├── styles/       # app.css (design token + komponen)
│       └── utils/        # format.js, range.js
├── data/                 # database SQLite (tidak masuk Git)
└── .env.example
```

## Menjalankan di EndeavourOS

Prasyarat:

```bash
sudo pacman -S --needed git python nodejs npm
```

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend di terminal kedua:

```bash
cd frontend
npm install
npm run dev
```

Buka `http://127.0.0.1:5173`. Dokumentasi API ada di `http://127.0.0.1:8000/docs`.

## Menjalankan di Termux

```bash
pkg install python nodejs rust
```

`rust` dibutuhkan sekali untuk membangun `pydantic-core` dan `cryptography` karena belum tersedia wheel Android. Setelah itu langkah backend dan frontend sama seperti di atas. Script npm sudah memanggil Vite melalui Node agar tidak terpengaruh perbedaan shebang Termux.

## Login dashboard

Saat dashboard dibuka, masukkan admin token:

```bash
cat ~/Projects/pochi-gateway/data/admin_token
```

Token hanya disimpan di sessionStorage browser dan dikirim sebagai header Bearer. Setelah backend restart, token tetap sama karena tersimpan di file. Hapus file tersebut untuk membuat token baru.

## Konfigurasi

Default dapat langsung dipakai. Untuk menyesuaikan:

```bash
cp .env.example .env
```

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `POCHI_DB_PATH` | `<project>/data/pochi.db` | Lokasi database SQLite |
| `POCHI_SEED_DEMO` | `true` | Isi data demo saat database masih kosong |
| `POCHI_CORS_ORIGINS` | origin lokal Vite | Daftar origin dalam format JSON |
| `POCHI_ADMIN_TOKEN` | kosong | Token admin; jika kosong dibuat otomatis |
| `POCHI_ADMIN_TOKEN_PATH` | `data/admin_token` | Lokasi file token admin |
| `POCHI_SECRET_KEY_PATH` | `data/secret.key` | Kunci enkripsi provider secret |
| `POCHI_ALLOW_PRIVATE_PROVIDER_URLS` | `true` | Izinkan `base_url` provider ke loopback/jaringan privat. Set `false` sebelum publikasi |
| `POCHI_PROVIDER_TIMEOUT_SECONDS` | `8` | Batas waktu uji koneksi provider |
| `POCHI_GATEWAY_TIMEOUT_SECONDS` | `120` | Batas waktu baca request gateway ke provider |
| `POCHI_GATEWAY_CONNECT_TIMEOUT_SECONDS` | `10` | Batas waktu koneksi gateway ke provider |
| `POCHI_GATEWAY_RATE_LIMIT_RPM` | `60` | Batas request per menit per virtual key; `0` menonaktifkan |

Untuk memanggil backend dari origin lain saat build frontend, set `VITE_API_BASE_URL` di `frontend/.env`. Pada pengembangan lokal, proxy Vite sudah menangani ini.

Data demo hanya dimasukkan jika tabel `providers` kosong. Untuk membuat ulang data demo, hentikan backend lalu hapus `data/pochi.db*`.

## Endpoint aktif

| Method | Path | Fungsi |
| --- | --- | --- |
| GET | `/health` | Status server dan database (publik) |
| POST | `/api/v1/admin/login` | Validasi admin token |
| GET | `/api/v1/admin/summary?days=14` | Ringkasan request, token, biaya, breakdown, dan periode pembanding |
| GET | `/api/v1/admin/usage/timeseries?days=14` | Data grafik harian; `hours=24` untuk bucket per jam |
| GET | `/api/v1/admin/analytics` | Agregat analytics: p50/p95 latensi, breakdown provider/model/key/status |
| GET | `/api/v1/admin/providers/stats` | Pemakaian per provider (request, token, biaya, success rate) |
| GET | `/api/v1/admin/settings` | Konfigurasi runtime efektif tanpa secret (read-only) |
| GET | `/api/v1/admin/prices/history` | Riwayat harga per model upstream |
| GET | `/api/v1/admin/usage/export` | Export usage logs ke CSV/JSON dengan filter yang sama |
| GET | `/api/v1/admin/usage/logs` | Riwayat request dengan filter, pencarian, dan pagination |
| GET | `/api/v1/admin/provider-templates` | Preset provider OpenAI-compatible (base URL + catatan free tier) |
| POST | `/api/v1/admin/chat` | Chat dari dashboard: streaming SSE, boleh menyertakan `conversation_id` + `user_message` |
| GET/POST | `/api/v1/admin/conversations` | Daftar percakapan (filter `?search=`) dan buat percakapan baru |
| GET/PATCH/DELETE | `/api/v1/admin/conversations/{id}` | Detail beserta pesan, ubah judul/model/parameter, hapus |
| POST | `/api/v1/admin/conversations/{id}/clear` | Kosongkan pesan tanpa menghapus percakapan |
| POST | `/api/v1/admin/conversations/{id}/stop` | Hentikan stream yang sedang berjalan untuk percakapan itu |
| DELETE | `/api/v1/admin/conversations/{id}/messages/{mid}` | Hapus satu pesan (dipakai tombol Ulangi) |
| GET | `/api/v1/admin/providers` | Daftar provider tanpa secret |
| POST | `/api/v1/admin/providers` | Tambah provider dan enkripsi API key |
| PATCH | `/api/v1/admin/providers/{id}` | Ubah provider, status, atau rotasi key |
| POST | `/api/v1/admin/providers/{id}/test` | Uji koneksi ke endpoint `/models` |
| GET | `/api/v1/admin/models` | Daftar model gateway, flag `supports_streaming` dan `is_default` |
| POST | `/api/v1/admin/models` | Tambah pemetaan model publik ke model provider |
| PATCH | `/api/v1/admin/models/{id}` | Ubah nama, provider, model upstream, status, atau flag |
| GET | `/api/v1/admin/keys` | Daftar virtual key tanpa hash/token |
| POST | `/api/v1/admin/keys` | Buat key; token lengkap dikembalikan sekali |
| PATCH | `/api/v1/admin/keys/{id}` | Ubah nama, model, anggaran, atau status |
| POST | `/api/v1/admin/keys/{id}/revoke` | Cabut key secara permanen |
| GET/POST | `/api/v1/admin/workflows` | Daftar dan buat workflow |
| GET/PATCH/DELETE | `/api/v1/admin/workflows/{id}` | Baca, ubah, hapus workflow |
| POST | `/api/v1/admin/workflows/{id}/run` | Jalankan workflow secara manual dengan input JSON |
| GET | `/api/v1/admin/workflows/{id}/runs` | Riwayat run workflow (maks 100) |
| GET | `/api/v1/admin/workflows/runs/{run_id}` | Detail run beserta langkah per node |
| POST | `/api/v1/hooks/{token}` | Trigger webhook publik untuk workflow bertipe `trigger.webhook` |
| GET | `/v1/models` | Daftar model yang diizinkan untuk virtual key |
| POST | `/v1/chat/completions` | Chat completion, mendukung streaming SSE |
| GET | `/docs` | Dokumentasi OpenAPI |

Filter `/api/v1/admin/usage/logs` dan `/api/v1/admin/usage/export`: `days=1..90` atau `hours=1..2160`, `status=all|success|error`, `model=<nama-publik>`, `key_id=<id>`, `provider_id=<id>`, `search=<teks>`. Endpoint logs juga menerima `page` dan `page_size=1..100`.

`/api/v1/admin/analytics` menerima filter yang sama ditambah `provider_id`; responsnya berisi total, success rate, p50/p95 durasi, serta breakdown per provider, model, dan API key.

Catatan: `supports_streaming` dan `is_default` pada model hanya penanda untuk UI. Routing gateway tetap memakai urutan model yang ada; flag tidak mengubah pemilihan provider.

Semua endpoint `/api/v1/admin/*` selain login memerlukan header `Authorization: Bearer <admin-token>`.

Semua endpoint `/v1/*` memerlukan header `Authorization: Bearer <virtual-key>`. Key yang dicabut atau nonaktif ditolak, dan model harus ada di `allowed_models` key tersebut.

Contoh:

```bash
TOKEN=$(cat data/admin_token)
curl http://127.0.0.1:8000/health
curl -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8000/api/v1/admin/summary?days=7"

curl -X POST http://127.0.0.1:8000/api/v1/admin/providers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Provider saya",
    "base_url": "https://api.example.com/v1",
    "adapter_type": "openai_compatible",
    "api_key": "ISI_API_KEY_PROVIDER"
  }'
```

API key provider tidak pernah muncul pada respons daftar provider.

Membuat virtual key:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/admin/keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Aplikasi Android",
    "allowed_models": ["pochi-chat", "pochi-fast"],
    "budget_limit_usd": 10,
    "budget_period": "monthly",
    "enabled": true
  }'
```

Respons berisi objek `key` dan `token`. Simpan `token` saat itu juga; server hanya menyimpan hash-nya dan token tidak dapat dilihat lagi. Daftar `allowed_models` kosong berarti semua model diizinkan. Model yang tidak ada di katalog akan ditolak dengan status 422.

## Preset provider gratis

Halaman **Providers** menampilkan panel *Preset provider gratis* berupa satu baris chip. Klik satu chip (atau pilih dari dropdown *Isi dari preset* di modal Add Provider), base URL dan adapter terisi otomatis, lalu tempelkan API key milikmu sendiri. Katalog ada di kode (`backend/app/services/provider_templates.py`) dan diekspos lewat `GET /api/v1/admin/provider-templates`, jadi tidak ada baris provider yang dibuat sebelum kamu menyimpan.

| Preset | Base URL | Catatan free tier |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1` | Model berakhiran `:free`, ±50 request/hari |
| Groq | `https://api.groq.com/openai/v1` | ±30 RPM, 1.000 request/hari |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | Free tier AI Studio untuk model Flash |
| Cerebras | `https://api.cerebras.ai/v1` | Free trial model open-weight |
| Mistral AI | `https://api.mistral.ai/v1` | Free tier terbatas |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | Kredit gratis, perlu verifikasi telepon |
| SambaNova | `https://api.sambanova.ai/v1` | Free tier model open-weight |
| Together AI | `https://api.together.xyz/v1` | Kredit awal |
| Hugging Face Router | `https://router.huggingface.co/v1` | Kredit bulanan akun terdaftar |
| Cohere | `https://api.cohere.ai/compatibility/v1` | Trial key dengan batas bulanan |
| Cloudflare Workers AI | `https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1` | Ganti `ACCOUNT_ID`; kuota harian gratis |
| Ollama (lokal) | `http://127.0.0.1:11434/v1` | Tanpa API key |
| llama.cpp server (lokal) | `http://127.0.0.1:8080/v1` | Tanpa API key |
| 9Router (lokal) | `http://127.0.0.1:20128/v1` | Router lokal yang sudah dipakai |

Kuota adalah ringkasan dokumentasi resmi per 2026-10-29 dan bisa berubah; modal preset menyertakan tautan dokumentasi dan halaman pembuatan key. Setelah key tersimpan, tambahkan model di halaman **Models**, lalu uji dari kartu provider (tombol Test nonaktif selama provider belum punya key).

## Chat dashboard

Halaman **Chat Pochi** (`#/chat`) adalah workspace percakapan penuh, bukan lagi kotak chat satu tab.

Tata letak:

- Panel riwayat: brand, pencarian judul, tombol **Chat baru**, daftar percakapan (dikelompokkan Disematkan/Terbaru), aksi ganti nama, pin, dan hapus dengan konfirmasi, serta status gateway di footer.
- Header percakapan: judul, status koneksi, pemilih model gateway (nama model, provider, harga per 1M token), pengaturan percakapan, dan tombol bersihkan.
- Area pesan: markdown aman (paragraf, heading, list, tautan, tabel, blockquote, inline code) dan code block navy dengan nomor baris, highlight ringan ~2 KB, serta tombol salin.
- Composer mengambang: Enter kirim, Shift+Enter baris baru, auto-grow, tombol Stop saat streaming, dan indikator lampiran yang memang belum tersedia.

Alur data:

- `POST /api/v1/admin/chat` memanggil `gateway_service.proxy_chat` dengan model dari katalog gateway. Yang mengautentikasi adalah admin token dashboard, bukan virtual key; browser tidak pernah menerima API key provider.
- Kalau `conversation_id` dikirim, server menyimpan pesan user sebelum streaming dan pesan asisten sesudahnya lewat callback `on_complete` — satu penulisan, jadi usage tidak tercatat dua kali.
- Request tetap masuk `request_logs` dengan `virtual_key_id` NULL dan biaya dihitung seperti request biasa.
- Stop bekerja dua arah: `POST /conversations/{id}/stop` menandai event di server, dan `disconnect_check` menangkap tab yang ditutup. Stream yang belum mengirim byte pertama pun dibatalkan dalam ~100 ms, tidak menggantung sampai timeout.
- Parameter per percakapan (temperature, max token, system instructions, streaming) disimpan di baris percakapan dan dikirim apa adanya ke provider; provider yang tidak mendukungnya akan mengabaikannya.

Batas yang jujur:

- Satu admin token, tanpa peran/kedaluwarsa/audit per pengguna.
- Markdown memakai renderer sendiri tanpa `dangerouslySetInnerHTML`; subset yang didukung tidak mencakup footnote atau blockquote bersarang rumit.
- Pesan user belum bisa diedit; **Ulangi** menghapus balasan asisten terakhir lalu mengirim ulang.
- Lampiran dan mikrofon belum ada, jadi tombolnya dinonaktifkan dengan jelas.

## Workflow otomasi

Halaman **Workflows** adalah builder bergaya n8n yang sengaja dibatasi supaya ringan di mesin kecil dan tidak pernah mengeksekusi kode sembarang.

Node yang tersedia:

| Tipe | Fungsi | Konfigurasi |
| --- | --- | --- |
| `trigger.manual` | Titik mulai untuk tombol Jalankan | — |
| `trigger.schedule` | Dijalankan berkala oleh scheduler | `interval_seconds` minimal 60 |
| `trigger.webhook` | Dipicu `POST /api/v1/hooks/{token}` | token dibuat saat simpan |
| `action.chat` | Panggil model gateway | `model`, `system`, `prompt`, `temperature` |
| `action.http` | Request HTTP keluar | `method`, `url`, `headers`, `body` |
| `logic.condition` | Percabangan true/false | `path`, `operator`, `value` |
| `logic.set` | Susun output dari template | `fields` |

Aturan dan batas:

- Tepat satu trigger per workflow, graf harus DAG (siklus ditolak 422), maksimal 40 node dan 80 edge.
- Templating `{{jalan.simbol}}` membaca `input`, `nodes.<id>`, dan `data`; contoh `{{input.pesan}}`, `{{data.text}}`.
- Node HTTP menolak host privat/loopback saat `POCHI_ALLOW_PRIVATE_PROVIDER_URLS=false`, tidak mengikuti redirect, timeout 20 detik, body dibaca maksimal 256 KB.
- Node Chat memakai model gateway dan mencatat usage dengan `virtual_key_id` NULL.
- Node HTTP tidak punya allowlist domain per workflow; pakai hanya endpoint yang kamu percaya.
- Scheduler memeriksa jadwal setiap 30 detik dan bisa dimatikan lewat `POCHI_WORKFLOW_SCHEDULER_ENABLED=false`.
- Webhook publik: body JSON maksimal 32 KB, dibatasi 30 panggilan/menit per alamat klien, dan hanya berjalan bila workflow aktif.
- Tidak ada node kode, import/export JSON n8n, kredensial per node, atau retry otomatis.

Contoh memicu webhook:

```bash
curl -X POST "http://127.0.0.1:8000/api/v1/hooks/<token>" \
  -H "Content-Type: application/json" \
  -d '{"pesan":"halo dari luar"}'
```

## Memakai gateway

Gunakan token virtual key, bukan admin token:

```bash
VIRTUAL_KEY="pk_pochi_..."
curl http://127.0.0.1:8000/v1/models \
  -H "Authorization: Bearer $VIRTUAL_KEY"

curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Authorization: Bearer $VIRTUAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "pochi-chat",
    "messages": [{"role": "user", "content": "Halo"}],
    "stream": false
  }'
```

Untuk streaming, kirim `"stream": true` dan baca respons `text/event-stream`. Token usage pada respons streaming hanya tercatat jika provider mengirim objek `usage` (misalnya dengan `stream_options.include_usage` pada provider yang mendukungnya).

Model publik harus dipetakan ke provider terlebih dahulu:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/admin/models \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "public_name": "pochi-chat",
    "provider_id": 1,
    "provider_model": "gpt-4o-mini",
    "input_usd_per_million": 0.15,
    "output_usd_per_million": 0.60,
    "enabled": true
  }'
```

Provider harus aktif dan memiliki API key sebelum model dapat dipakai. Harga dalam USD per 1 juta token bersifat opsional; tanpa harga, request sukses tetap dicatat tetapi biayanya `unknown`. Perubahan harga disimpan sebagai entri efektif baru sehingga request lama tidak berubah.

### Rate limit dan anggaran

Setiap virtual key dibatasi `POCHI_GATEWAY_RATE_LIMIT_RPM` request per menit (fixed window). Jika terlampaui, gateway mengembalikan HTTP 429 dengan kode `rate_limit_exceeded` dan header `Retry-After`.

Batas anggaran virtual key diperiksa sebelum request diteruskan ke provider. Total biaya `known` dan `estimated` pada periode berjalan (UTC) dibandingkan dengan `budget_limit_usd`. Jika sudah mencapai batas, gateway mengembalikan HTTP 429 dengan kode `budget_exceeded` dan tipe `insufficient_quota`. Biaya `unknown` tidak dihitung ke anggaran karena nilainya belum diketahui.

## Integrasi Pochi/Hermes

Pochi, Hermes, atau klien lain yang mendukung API OpenAI-compatible dapat memakai gateway ini:

```text
Base URL : http://127.0.0.1:8000/v1
API key  : pk_pochi_...
Model    : pochi-chat
```

Gunakan token virtual key, bukan admin token. Untuk emulator Android di perangkat yang sama, `127.0.0.1` mengarah ke emulator; gunakan `10.0.2.2` atau alamat host yang sesuai. Jika backend diakses dari perangkat lain, ubah bind uvicorn secara sadar dan tambahkan HTTPS, firewall, serta reverse proxy; jangan mengekspos HTTP biasa ke jaringan publik.

Streaming SSE didukung dengan mengirim `"stream": true`. Sebagian provider hanya mengirim usage streaming jika diminta melalui `stream_options.include_usage`.

## Backup dan restore

Buat backup konsisten database beserta material enkripsi dan admin token:

```bash
cd backend
.venv/bin/python scripts/backup.py --keep 7
```

Hasil tersimpan di `data/backups/pochi-backup-YYYYMMDD-HHMMSS/` dengan permission `700`; file di dalamnya `600`. Backup berisi rahasia, sehingga direktori tersebut diabaikan Git dan tidak boleh dibagikan. Untuk restore, hentikan backend, salin `pochi.db`, `secret.key` (jika ada), dan `admin_token` ke lokasi yang dikonfigurasi, pertahankan permission ketat, lalu jalankan backend kembali.

## Uji beban

```bash
cd backend
.venv/bin/python scripts/load_test.py \
  --requests 200 --concurrency 20 --pid "$(pgrep -f '[u]vicorn app.main:app' | head -n1)"
```

Baseline Termux pada pengujian terakhir: 100 request, concurrency 10, 202 req/s, p50 39 ms, p95 99 ms, tanpa gagal, dengan kenaikan RAM sekitar 1,4 MiB. Angka ini bukan jaminan performa perangkat lain. Hentikan uji jika perangkat mulai panas atau kehabisan RAM.

## Pengujian

```bash
cd backend
source .venv/bin/activate
pytest -q
```

Build frontend:

```bash
cd frontend
npm run build
```

## Deployment non-lokal (HTTPS + reverse proxy)

Backend tetap mendengarkan `127.0.0.1:8000`. Satu-satunya port yang dibuka ke jaringan adalah port reverse proxy (443). Jangan pernah membuka `8000` atau `5173` langsung ke internet: token dan body chat akan lewat tanpa TLS.

Prasyarat: domain mengarah ke IP mesin (A record), port 80 dan 443 terbuka, backend berjalan sebagai service user.

### 1. Backend sebagai service user

`~/.config/systemd/user/pochi-gateway.service`:

```ini
[Unit]
Description=Pochi Gateway (uvicorn)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/user/Projects/pochi-gateway/backend
ExecStart=/home/user/Projects/pochi-gateway/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now pochi-gateway
loginctl enable-linger "$USER"   # tetap hidup walau belum login
sleep 20 && curl -s 127.0.0.1:8000/health
```

Uvicorn butuh beberapa detik untuk bind; `connection refused` tepat setelah `start` bukan kegagalan.

### 2. Frontend statis

Frontend yang dipakai publik adalah hasil build, bukan dev server:

```bash
cd frontend
VITE_API_BASE_URL=https://gw.example.com npm run build
# hasil: frontend/dist
```

Proxy `/api` dan `/v1` diteruskan ke `127.0.0.1:8000`, jadi `dist` cukup berisi aset statis.

### 3. Caddy (paling singkat, TLS otomatis)

`/etc/caddy/Caddyfile`:

```caddyfile
gw.example.com {
    encode gzip zstd

    # Header keamanan untuk semua respons. CSP halaman statis dipasang di handle terakhir.
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        -Server
    }

    handle /api/* {
        reverse_proxy 127.0.0.1:8000
    }
    handle /v1/* {
        reverse_proxy 127.0.0.1:8000 {
            flush_interval -1   # streaming SSE tanpa buffering
        }
    }
    handle /health {
        reverse_proxy 127.0.0.1:8000
    }
    handle {
        root * /home/user/Projects/pochi-gateway/frontend/dist
        try_files {path} /index.html
        file_server
        header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'"
    }
}
```

```bash
sudo systemctl reload caddy
```

### 4. nginx (alternatif)

`/etc/nginx/sites-available/pochi-gateway`:

```nginx
server {
    listen 443 ssl http2;
    server_name gw.example.com;

    ssl_certificate     /etc/letsencrypt/live/gw.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gw.example.com/privkey.pem;

    client_max_body_size 8m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /v1/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_buffering off;              # wajib untuk SSE
        proxy_read_timeout 180s;          # >= POCHI_GATEWAY_TIMEOUT_SECONDS
        add_header X-Accel-Buffering no;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000;
    }

    location / {
        root /home/user/Projects/pochi-gateway/frontend/dist;
        try_files $uri /index.html;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'" always;
    }
}

server {
    listen 80;
    server_name gw.example.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/pochi-gateway /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d gw.example.com
```

Tanpa `proxy_buffering off`, respons streaming tetap jalan tetapi terasa menggantung karena nginx menahan chunk sampai buffer penuh.

### 5. Konfigurasi aplikasi

`.env` backend:

```bash
POCHI_CORS_ORIGINS=["https://gw.example.com"]
POCHI_ALLOW_PRIVATE_PROVIDER_URLS=false
POCHI_SEED_DEMO=false
POCHI_GATEWAY_TIMEOUT_SECONDS=120
```

Samakan `proxy_read_timeout` proxy dengan nilai timeout gateway, atau lebih besar 60 detik.

### 6. Firewall dan hardening

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw enable
ss -ltnp | grep -E ':8000|:5173'   # harus 127.0.0.1, bukan 0.0.0.0
```

- Satu virtual key per klien; cabut key yang bocor lewat dashboard.
- Rate limit per key dan anggaran tetap aktif di level aplikasi; tambahkan `limit_req` hanya bila butuh proteksi sebelum auth.
- Admin token hanya dipakai di browser lokal atau lewat jaringan tepercaya; jangan simpan di klien publik.
- `data/` (DB, `admin_token`, `secret.key`, `backups/`) tidak boleh ikut tersaji web; jangan arahkan document root ke root repo, arahkan ke `frontend/dist`.
- Backup berkala: `.venv/bin/python scripts/backup.py --keep 7`, simpan di luar mesin yang sama.

### 7. Verifikasi setelah deploy

```bash
curl -s https://gw.example.com/health
curl -s -N https://gw.example.com/v1/chat/completions \
  -H "Authorization: Bearer $VIRTUAL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"pochi-lokal","stream":true,"messages":[{"role":"user","content":"halo"}]}'
```

Yang harus terlihat: `/health` mengembalikan `database: ok`, dan chunk SSE muncul bertahap (bukan sekaligus di akhir).

## Keamanan saat ini

Kontrol yang sudah ada di kode:

- Backend hanya mendengarkan `127.0.0.1`; port `8000`/`5173` tidak pernah dibuka ke jaringan.
- Admin API memakai Bearer token berentropi tinggi (32 byte acak), file mode 600, dibandingkan dengan `compare_digest`.
- Login dibatasi 10 percobaan gagal per menit per alamat klien, lalu `429` dengan `Retry-After`.
- Respons API membawa `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, dan HSTS bila skema HTTPS.
- Provider secret dienkripsi Fernet; kunci terpisah dari database dan mode 600.
- Database SQLite mode 600 (termasuk `-wal`/`-shm`) karena berisi metadata biaya dan nama key.
- Virtual key disimpan sebagai hash SHA-256; token asli hanya dikembalikan sekali; revoke permanen.
- Gateway hanya meneruskan model yang diizinkan key; header Authorization klien tidak diteruskan ke provider.
- Rate limit dan anggaran diperiksa sebelum request diteruskan.
- Redirect dan environment proxy tidak diikuti (`trust_env=False`, `follow_redirects=False`).
- Isi percakapan tidak disimpan; log hanya metadata; error provider disanitasi sebelum ditampilkan.
- `.env`, database, admin token, kunci enkripsi, dan backup diabaikan Git.
- Dependensi backend diaudit dengan `pip-audit`, frontend dengan `npm audit`; keduanya bersih per 2026-10-29.
- Chat dashboard memakai admin token, tidak mengirim API key provider ke browser.
- Workflow hanya menjalankan tipe node tetap; tidak ada evaluasi kode. Node HTTP menolak host privat saat `POCHI_ALLOW_PRIVATE_PROVIDER_URLS=false`.
- Webhook workflow: token 32 karakter URL-safe, throttle 30/menit per alamat klien, body JSON maksimal 32 KB, hanya untuk workflow aktif.

### Sebelum dipublikasikan

Urutan yang aman, jangan dilewati:

1. **Token admin baru yang kuat.** Jangan pakai token yang pernah muncul di terminal, screenshot, atau chat.
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```
   Simpan ke `.env` sebagai `POCHI_ADMIN_TOKEN=...`, lalu `systemctl --user restart pochi-gateway`.
2. **Tolak URL provider privat**, supaya sesi admin yang bocor tidak bisa dipakai menjelajah jaringan lokal atau metadata cloud.
   ```bash
   POCHI_ALLOW_PRIVATE_PROVIDER_URLS=false
   ```
   Provider yang memang lokal (mis. 9Router di `127.0.0.1:20128`) harus dipindah ke host lain atau tetap di mesin yang sama tanpa publikasi.
3. **Kunci CORS ke origin publik** dan bangun frontend dengan base URL yang sama.
   ```bash
   POCHI_CORS_ORIGINS=["https://gw.example.com"]
   cd frontend && VITE_API_BASE_URL=https://gw.example.com npm run build
   ```
4. **Matikan data demo.**
   ```bash
   POCHI_SEED_DEMO=false
   ```
5. **Jalankan uvicorn di belakang proxy**, tetap loopback, dengan header proxy hanya dipercaya dari proxy lokal.
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000 \
     --proxy-headers --forwarded-allow-ips 127.0.0.1
   ```
6. **Pasang TLS + header + rate limit di proxy.** Untuk SPA, CSP ketat dari aplikasi hanya berlaku pada respons API; halaman statis perlu CSP dari proxy (contoh di bagian Caddy/nginx).
7. **Firewall:** hanya 443 terbuka. `8000` dan `5173` tetap tertutup.
8. **Backup terenkripsi di luar mesin.** Backup berisi database, `secret.key`, dan admin token — siapa pun yang memegang file itu memegang gateway.

Yang belum tertutup dan perlu disadari:

- Satu admin token, tanpa peran, tanpa kedaluwarsa, tanpa audit trail tindakan admin.
- Pemeriksaan anggaran bersifat pre-request, bukan reservasi; request bersamaan masih bisa melampaui batas tipis.
- Rate limit fixed-window; lonjakan di batas menit masih mungkin.
- Validasi URL provider dilakukan saat disimpan; DNS rebinding setelah itu tidak dicegah.
- Tidak ada WAF, proteksi bot, atau pembatasan per-IP untuk endpoint `/v1/*` di aplikasi — letakkan di proxy bila publik.
- Webhook workflow (`/api/v1/hooks/*`) adalah jalur publik tanpa autentikasi selain token; token bocor berarti workflow bisa dipicu siapa pun. Matikan workflow yang tidak dipakai.
- Node HTTP workflow tidak punya allowlist domain, jadi workflow yang dibuat admin bisa memanggil host eksternal mana pun.

## Roadmap

- [x] Milestone 1: backend, frontend, SQLite, dashboard data simulasi, secret tidak masuk Git.
- [x] Milestone 2a: provider, enkripsi secret, uji koneksi, proteksi admin.
- [x] Milestone 2b: pembuatan, pembatasan, dan pencabutan virtual key.
- [x] Milestone 3: model gateway, `/v1/models`, `/v1/chat/completions`, routing provider, streaming, logging request.
- [x] Milestone 4: harga model, kalkulasi biaya, filter usage logs, dan data grafik aktual.
- [x] Milestone 5: integrasi Pochi/Hermes, rate limit, anggaran, backup, uji RAM.
- [x] Milestone 6: pemakaian anggaran per key, riwayat harga di UI, export usage logs, rate limit per key dari UI, code splitting, dokumentasi HTTPS/reverse proxy.
- [x] Milestone 7: redesign dashboard (sidebar + topbar, 4 KPI dengan pembanding periode, halaman Analytics, Request Logs, dan Settings), endpoint `analytics`/`providers/stats`/`settings`, window per jam, hash routing, design token terpusat.
- [x] Milestone 8: preset provider gratis (14 entri), halaman Chat streaming lewat gateway, dan workflow builder bergaya n8n (trigger manual/jadwal/webhook, node chat/HTTP/kondisi/set, riwayat run).
