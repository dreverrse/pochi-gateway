# Pochi Gateway

Dashboard monitoring dan gateway API AI lokal. Satu endpoint untuk beberapa provider, dengan pencatatan request, token, dan biaya.

Status saat ini: **MVP selesai (Milestone 1-5): gateway OpenAI-compatible dengan provider, model, virtual key, biaya, usage logs, rate limit, penegakan anggaran, backup, dan uji beban.**

## Yang sudah berjalan

- Backend FastAPI dengan health check dan dokumentasi OpenAPI.
- SQLite dengan skema providers, provider_secrets, virtual_keys, models, model_prices, dan request_logs.
- Seed data demo 14 hari (provider, model, virtual key, dan request log fiktif).
- Endpoint ringkasan dashboard dan timeseries.
- Dashboard React + Vite: kartu statistik, grafik token, tabel per model/provider/key, status API.
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
- Halaman Usage Logs dengan filter periode, status, model, virtual key, serta pagination.
- Rate limit fixed-window per virtual key dan penegakan batas anggaran harian/bulanan.
- Script backup konsisten untuk database, admin token, dan kunci enkripsi.
- Script uji beban ringan dengan pengukuran latensi dan RAM proses.
- `.env`, database, admin token, kunci enkripsi, dan direktori backup diabaikan Git.
- 47 pengujian backend lulus.

> **Admin token:** endpoint `/api/v1/admin/*` memerlukan Bearer token. Token dibuat otomatis di `data/admin_token` (mode 600) saat pertama dijalankan, atau gunakan `POCHI_ADMIN_TOKEN`. Jangan commit file tersebut.

## Struktur proyek

```text
pochi-gateway/
├── backend/
│   ├── app/
│   │   ├── api/          # gateway.py, admin.py
│   │   ├── core/         # konfigurasi
│   │   ├── db/           # koneksi, schema.sql, seed, repositories
│   │   ├── models/       # model respons Pydantic
│   │   └── main.py
│   ├── tests/
│   ├── pytest.ini
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── pages/
│       ├── styles/
│       └── utils/
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
| GET | `/api/v1/admin/summary?days=14` | Ringkasan request, token, biaya, dan breakdown |
| GET | `/api/v1/admin/usage/timeseries?days=14` | Data grafik harian |
| GET | `/api/v1/admin/usage/logs` | Riwayat request dengan filter dan pagination |
| GET | `/api/v1/admin/providers` | Daftar provider tanpa secret |
| POST | `/api/v1/admin/providers` | Tambah provider dan enkripsi API key |
| PATCH | `/api/v1/admin/providers/{id}` | Ubah provider, status, atau rotasi key |
| POST | `/api/v1/admin/providers/{id}/test` | Uji koneksi ke endpoint `/models` |
| GET | `/api/v1/admin/models` | Daftar model gateway dan provider-nya |
| POST | `/api/v1/admin/models` | Tambah pemetaan model publik ke model provider |
| PATCH | `/api/v1/admin/models/{id}` | Ubah nama, provider, model upstream, atau status |
| GET | `/api/v1/admin/keys` | Daftar virtual key tanpa hash/token |
| POST | `/api/v1/admin/keys` | Buat key; token lengkap dikembalikan sekali |
| PATCH | `/api/v1/admin/keys/{id}` | Ubah nama, model, anggaran, atau status |
| POST | `/api/v1/admin/keys/{id}/revoke` | Cabut key secara permanen |
| GET | `/v1/models` | Daftar model yang diizinkan untuk virtual key |
| POST | `/v1/chat/completions` | Chat completion, mendukung streaming SSE |
| GET | `/docs` | Dokumentasi OpenAPI |

Filter `/api/v1/admin/usage/logs`: `days=1..90`, `status=all|success|error`, `model=<nama-publik>`, `key_id=<id>`, `page`, dan `page_size=1..100`.

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

## Keamanan saat ini

- Backend hanya untuk `127.0.0.1`.
- Admin API memakai Bearer token berentropi tinggi; token disimpan mode 600.
- Provider secret dienkripsi Fernet; kunci enkripsi terpisah dari database dan mode 600.
- Tidak ada provider secret nyata di repo maupun database demo.
- Virtual key disimpan sebagai hash SHA-256; token asli hanya dikembalikan sekali saat pembuatan.
- Virtual key yang dicabut tidak dapat diaktifkan kembali.
- Gateway hanya meneruskan model yang diizinkan key; header Authorization klien tidak diteruskan ke provider.
- Rate limit dan anggaran diperiksa sebelum request diteruskan ke provider.
- Redirect dan environment proxy tidak diikuti; koneksi provider memakai batas waktu.
- Isi percakapan tidak disimpan; log hanya menyimpan metadata request.
- `.env`, database, admin token, kunci enkripsi, dan backup diabaikan Git.
- Untuk akses publik, tetap diperlukan HTTPS, firewall, dan reverse proxy yang aman.

## Roadmap

- [x] Milestone 1: backend, frontend, SQLite, dashboard data simulasi, secret tidak masuk Git.
- [x] Milestone 2a: provider, enkripsi secret, uji koneksi, proteksi admin.
- [x] Milestone 2b: pembuatan, pembatasan, dan pencabutan virtual key.
- [x] Milestone 3: model gateway, `/v1/models`, `/v1/chat/completions`, routing provider, streaming, logging request.
- [x] Milestone 4: harga model, kalkulasi biaya, filter usage logs, dan data grafik aktual.
- [x] Milestone 5: integrasi Pochi/Hermes, rate limit, anggaran, backup, uji RAM.
