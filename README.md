# TOGA RT 09

Sistem informasi **Tanaman Obat Keluarga (TOGA)** berbasis web untuk RT 09.

Proyek ini mencakup:
- katalog tanaman dan halaman detail berbasis `?id=`
- galeri kegiatan
- mode AR marker-based
- kalender/jadwal kegiatan
- halaman akun untuk login pengelola
- PWA dasar dengan service worker

## Ringkasan Arsitektur

### Frontend
- HTML, CSS, JavaScript vanilla
- halaman utama: `index.html`
- AR: `ar.html`
- akun/login: `account.html`
- jadwal: `jadwal.html`
- pengaturan: `settings.html`

### Sumber data baca
- data tanaman dan galeri dibaca dari **Google Apps Script**
- fallback baca:
  - cache browser
  - `data/plants.json` untuk tanaman

### Jalur tulis terproteksi
- login, session auth, dan write kalender berjalan lewat **backend Vercel** di folder `vercel-ai-backend/`
- backend ini yang memanggil **Google Apps Script**
- frontend **tidak lagi** menulis langsung ke Apps Script untuk:
  - `createEvent`
  - `updateEvent`
  - `deleteEvent`
  - `upsertLabel`
  - `deleteLabel`

### Logging login
- login sukses dicatat di backend
- backend juga mengirim log ke sheet `LoginLogs` di Google Sheets
- `timestamp_login` disimpan dalam timezone `Asia/Jakarta` (`GMT+7`)

## Fitur Utama
- daftar tanaman dengan pencarian dan filter
- detail tanaman dengan share link
- mode tampilan daftar `Grid` dan `Compact`
- galeri kegiatan
- AR dengan A-Frame + AR.js
- login pengelola dengan:
  - username/password
  - Google Sign-In
- kalender kegiatan dengan label warna
- PWA + cache offline dasar

## Struktur Proyek

```txt
.
├── index.html
├── ar.html
├── gallery.html
├── account.html
├── jadwal.html
├── settings.html
├── profile.html
├── marker-generator.html
├── print-markers.html
├── offline.html
├── manifest.webmanifest
├── sw.js
├── README.md
├── DEBUGGING.md
├── apps-script/
│   └── calendar-api.gs
├── data/
│   └── plants.json
├── images/
├── markers/
│   ├── *.patt
│   ├── qr/
│   └── note.md
├── scripts/
│   └── generate-qr-only.mjs
├── assets/
│   ├── app.js
│   ├── ar.js
│   ├── auth.js
│   ├── jadwal.js
│   ├── config.js
│   ├── pwa.js
│   ├── theme.js
│   ├── style.css
│   ├── account.css
│   ├── jadwal.css
│   ├── icons/
│   ├── screenshots/
│   └── vendor/
└── vercel-ai-backend/
    ├── api/
    ├── package.json
    ├── vercel.json
    ├── .env.example
    └── README.md
```

## Menjalankan Lokal

### Frontend dengan XAMPP
1. Simpan proyek di:
   - `/Applications/XAMPP/xamppfiles/htdocs/toga-tanaman`
2. Jalankan Apache dari XAMPP.
3. Buka:
   - `http://localhost/toga-tanaman/`

### Backend Vercel lokal
1. Masuk ke folder backend:
```bash
cd vercel-ai-backend
```
2. Siapkan env:
```bash
cp .env.example .env
```
3. Install dependency:
```bash
npm install
```
4. Jalankan check syntax:
```bash
npm run check
```
5. Jalankan via tooling Vercel/dev workflow yang Anda pakai.

Detail env dan endpoint backend ada di:
- [vercel-ai-backend/README.md](./vercel-ai-backend/README.md)

## URL Penting
- home: `http://localhost/toga-tanaman/`
- detail tanaman: `http://localhost/toga-tanaman/?id=kunyit`
- AR: `http://localhost/toga-tanaman/ar.html`
- AR debug: `http://localhost/toga-tanaman/ar.html?debug=1`
- akun: `http://localhost/toga-tanaman/account.html`
- jadwal: `http://localhost/toga-tanaman/jadwal.html`

## Konfigurasi Frontend

Konfigurasi utama ada di:
- [assets/config.js](./assets/config.js)

Field penting:
- `apiUrl`
  URL Google Apps Script untuk data tanaman/galeri
- `authApiUrl`
  endpoint backend auth
- `scheduleApiUrl`
  endpoint backend schedule
- `googleClientId`
  client ID Google Sign-In frontend

## Google Apps Script

Apps Script utama ada di:
- [apps-script/calendar-api.gs](./apps-script/calendar-api.gs)

Fungsi Apps Script saat ini:
- baca data tanaman
- baca galeri
- baca event kalender
- baca label kalender
- simpan event/label dari backend
- simpan log login ke sheet `LoginLogs`

Sheet yang dipakai:
- `Plants`
- `Galleries`
- `Events`
- `EventLabels`
- `LoginLogs`

### Keamanan Apps Script

Action POST berikut sekarang dilindungi secret:
- `createEvent`
- `updateEvent`
- `deleteEvent`
- `upsertLabel`
- `deleteLabel`
- `appendLoginLog`

Apps Script memeriksa `APPS_SCRIPT_SHARED_SECRET` dari **Script Properties**.

Set di Apps Script:
1. buka `Project Settings`
2. masuk ke `Script Properties`
3. tambah:
```text
APPS_SCRIPT_SHARED_SECRET=<secret-yang-sama-dengan-backend>
```

Setelah mengubah Apps Script:
1. update kode
2. redeploy Web App

## Backend Auth dan Schedule

Backend Vercel menangani:
- login username/password
- login Google
- session token
- proteksi write kalender
- forwarding write ke Apps Script
- forwarding login log ke Apps Script

Env penting di backend:
- `AUTH_JWT_SECRET`
- `AUTH_USERS_JSON`
- `GOOGLE_CLIENT_ID`
- `AUTH_ALLOWED_GOOGLE_EMAILS`
- `APPS_SCRIPT_API_URL`
- `APPS_SCRIPT_SHARED_SECRET`

Contoh detail konfigurasi ada di:
- [vercel-ai-backend/.env.example](./vercel-ai-backend/.env.example)

## AUTH_ALLOWED_GOOGLE_EMAILS

Format:

```env
AUTH_ALLOWED_GOOGLE_EMAILS=admin@gmail.com,editor@domain.com
```

Perilaku:
- jika diisi, hanya email tersebut yang boleh login via Google
- jika kosong, semua akun Google valid dengan `aud` yang cocok akan diterima

## Logging Login ke Sheet

Sheet target:
- `LoginLogs`

Kolom yang ditulis:
- `timestamp_login`
- `display_name`
- `email`
- `username`
- `provider`
- `role`
- `ip`
- `user_agent`
- `user_id`

Catatan:
- log ditulis oleh backend, bukan frontend
- backend juga tetap menulis runtime log
- jika Apps Script gagal menerima log, login tetap berhasil tetapi backend akan menulis warning

## Kalender/Jadwal

Halaman kalender:
- [jadwal.html](./jadwal.html)

Aturan saat ini:
- mode baca masih bisa mengambil data dari Apps Script/backend
- aksi tulis kalender hanya lewat backend `/api/schedule/*`
- fallback tulis langsung dari frontend ke Apps Script sudah dimatikan
- jika backend schedule belum aktif, UI akan menolak aksi simpan/ubah/hapus

## Data Tanaman

Endpoint baca yang dipakai frontend:
- `GET <APPS_SCRIPT_URL>?mode=list`
- `GET <APPS_SCRIPT_URL>?id=<id>`
- `GET <APPS_SCRIPT_URL>`
- `GET <APPS_SCRIPT_URL>?mode=gallery`

Jika API baca tidak tersedia:
- frontend fallback ke cache
- tanaman bisa fallback ke `data/plants.json`

Contoh objek tanaman:

```json
{
  "id": "kunyit",
  "nama": "Kunyit",
  "nama_latin": "Curcuma longa",
  "jenis": "Rimpang",
  "gambar": "images/kunyit.jpg",
  "manfaat": ["Anti-inflamasi", "Membantu pencernaan"],
  "deskripsi": "<p>Kunyit memiliki kandungan kurkumin yang dikenal bermanfaat.</p>",
  "catatan": ["Tidak untuk dosis berlebihan"]
}
```

## Menambah Tanaman Baru
1. Tambahkan data ke sheet/API utama.
2. Tambahkan gambar ke `images/` jika memakai aset lokal.
3. Buat marker pattern:
   - `markers/<id>.patt`
4. Uji:
   - `/?id=<id>`
   - `/ar.html`

## AR Marker

Marker AR dibuat dari generator AR.js:
- `https://ar-js-org.github.io/AR.js/three.js/examples/marker-training/examples/generator.html`

Aturan penamaan:
- file pattern harus disimpan sebagai `markers/<id>.patt`
- `<id>` harus sama dengan `id` data tanaman

Mode uji:
- normal: `/ar.html`
- debug: `/ar.html?debug=1`

## Generate QR

Generate QR PNG dari data Apps Script:

```bash
npm run qr:generate
```

Contoh dengan opsi:

```bash
npm run qr:generate -- \
  --api-url "https://<WEB_APP_URL>/exec" \
  --detail-base "https://taqin98.github.io/toga-tanaman/" \
  --size 600 \
  --ids kunyit,kangkung
```

Output:
- `markers/qr/<id>.png`
- `markers/qr/report.json`

## PWA
- manifest: [manifest.webmanifest](./manifest.webmanifest)
- service worker: [sw.js](./sw.js)
- registrasi SW: [assets/pwa.js](./assets/pwa.js)

Jika mengubah aset penting, naikkan versi cache di `sw.js`.

## Troubleshooting
- panduan debug: [DEBUGGING.md](./DEBUGGING.md)

## Lisensi
Belum ditentukan.
