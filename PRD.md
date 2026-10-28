# PRD — Pochi Gateway

Terakhir diperbarui: 2026-10-28  
Versi aplikasi: `0.6.0`  
Status: MVP Milestone 1–5 selesai; pekerjaan berikutnya bersifat penyempurnaan.

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
- Admin memantau ringkasan, grafik, usage logs, biaya, dan status request.
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
- [x] Dashboard aktual dan halaman Usage Logs dengan filter serta pagination.
- [x] Rate limit fixed-window per virtual key.
- [x] Penegakan anggaran harian/bulanan sebelum request diteruskan.
- [x] Script backup dan script uji beban/RAM.
- [x] 47 pengujian backend lulus.
- [x] Build frontend lulus; hanya ada warning ukuran bundle sekitar 641 kB.

### Backlog

- Menampilkan pemakaian anggaran berjalan di halaman API Keys.
- Riwayat perubahan harga model di UI.
- Export usage logs (CSV/JSON).
- Rate limit per key yang dapat diatur dari UI.
- Injeksi `stream_options.include_usage` untuk provider yang mendukung, agar biaya streaming lebih sering `known`.
- Code splitting frontend untuk mengurangi bundle.
- Dokumentasi deployment HTTPS/reverse proxy untuk akses non-lokal.

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
│   │   ├── db/           # schema, seed, repository
│   │   ├── models/       # schema Pydantic
│   │   ├── services/     # provider, model, key, gateway, pricing, usage
│   │   └── main.py
│   ├── scripts/          # backup.py, load_test.py
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── pages/
│       ├── styles/
│       └── utils/
├── data/                 # DB, token, secret, backup; tidak masuk Git
├── .env.example
├── README.md
└── PRD.md
```

## 7. Model data

Tabel utama:

- `providers`: nama, base URL, adapter, status.
- `provider_secrets`: ciphertext API key per provider.
- `models`: alias publik, provider, model upstream, status.
- `model_prices`: harga input/output per 1 juta token, periode efektif, sumber.
- `virtual_keys`: prefix, hash token, allowlist model, anggaran, status, last used.
- `request_logs`: metadata request, token, biaya, status, durasi, error.
- `rate_limit_windows`: counter fixed-window per virtual key.

Keputusan data:

- Model tidak dihapus; gunakan status nonaktif.
- Harga disimpan sebagai entri efektif baru agar request lama tidak berubah.
- Harga dicari berdasarkan `provider_model`, sehingga model publik berbeda yang memakai nama upstream sama berbagi harga.
- Isi percakapan tidak disimpan; hanya metadata.

## 8. API utama

Admin:

- `POST /api/v1/admin/login`
- `GET /api/v1/admin/summary`
- `GET /api/v1/admin/usage/timeseries`
- `GET /api/v1/admin/usage/logs`
- CRUD `/api/v1/admin/providers`
- CRUD `/api/v1/admin/models`
- CRUD/revoke `/api/v1/admin/keys`

Gateway:

- `GET /v1/models`
- `POST /v1/chat/completions`

Detail filter usage logs: `days=1..90`, `status=all|success|error`, `model`, `key_id`, `page`, `page_size=1..100`.

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

- Backend default hanya mendengarkan `127.0.0.1`.
- Admin token dan kunci enkripsi berada di `data/`, mode ketat, tidak masuk Git.
- Provider secret tidak pernah dikirim ke browser.
- Virtual key hanya disimpan sebagai hash; token asli tampil sekali.
- Backup berisi admin token dan kunci enkripsi; direktori backup diabaikan Git.
- Belum ada HTTPS, reverse proxy, atau hardening multi-user.
- Budget check bersifat pre-request, bukan reservasi; request bersamaan dapat melampaui batas tipis.
- Rate limit fixed-window; lonjakan di batas window masih mungkin.
- Biaya bisa `unknown` jika usage atau harga tidak tersedia.

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

Verifikasi wajib setelah perubahan:

```bash
cd backend
timeout 60s .venv/bin/pytest -q

cd ../frontend
npm run build
```

Baseline saat PRD dibuat: `47 passed`; build sukses dengan warning ukuran bundle.

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
Kamu melanjutkan proyek Pochi Gateway di /data/data/com.termux/files/home/Projects/pochi-gateway.
Baca PRD.md dan README.md terlebih dahulu. Patuhi keputusan, batasan keamanan, dan backlog di sana.
Tujuan saat ini: [tulis tugas baru].
Sebelum coding, ringkas pemahamanmu dan sebutkan file yang akan diubah.
Setelah selesai, jalankan pytest dan build frontend, lalu laporkan hasil aktual.
```
