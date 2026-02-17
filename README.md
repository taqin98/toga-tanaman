# TOGA RT 09

Sistem informasi **Tanaman Obat Keluarga (TOGA)** berbasis web untuk RT 09.
Proyek ini menyediakan:
- Halaman daftar dan detail tanaman (berbasis QR parameter `?id=`)
- Mode Augmented Reality (AR) berbasis marker pattern
- Dukungan Progressive Web App (PWA) + service worker untuk cache offline dasar

## Fitur Utama
- Daftar tanaman dengan pencarian dan filter jenis
- Halaman detail tanaman (manfaat, cara pakai, catatan)
- Share link detail tanaman
- Mode tampilan daftar: `Grid` dan `Compact`
- Mode AR di `ar.html` menggunakan A-Frame + AR.js
- Fallback data: API Google Apps Script -> cache localStorage -> `data/plants.json`
- Service worker (`sw.js`) untuk precache aset statis

## Teknologi yang Digunakan
- HTML, CSS, JavaScript (vanilla)
- A-Frame (`aframe.min.js`)
- AR.js (`aframe-ar.js`)
- Web App Manifest (`manifest.webmanifest`)
- Service Worker (`sw.js`)

## Troubleshooting
- Panduan debug proyek: [DEBUGGING.md](./DEBUGGING.md)

## Struktur Proyek
```txt
.
├── index.html                  # Halaman daftar + detail tanaman
├── ar.html                     # Halaman AR marker-based
├── manifest.webmanifest        # Konfigurasi PWA
├── sw.js                       # Service worker + cache strategy
├── data/
│   └── plants.json             # Data fallback lokal
├── markers/
│   ├── *_v3.patt               # File marker AR per tanaman
│   └── note.md
├── images/                     # Gambar tanaman lokal
└── assets/
    ├── app.js                  # Logic daftar/detail tanaman
    ├── pwa.js                  # Registrasi service worker
    ├── style.css
    ├── icons/
    └── screenshots/
```

## Cara Menjalankan (XAMPP)
1. Pastikan folder proyek berada di:
   - `/Applications/XAMPP/xamppfiles/htdocs/toga-tanaman`
2. Jalankan Apache dari XAMPP.
3. Buka browser:
   - `http://localhost/toga-tanaman/`

## URL Penting
- Daftar tanaman: `http://localhost/toga-tanaman/`
- Detail tanaman by id: `http://localhost/toga-tanaman/?id=kunyit`
- Mode AR: `http://localhost/toga-tanaman/ar.html`
- Mode AR + debug: `http://localhost/toga-tanaman/ar.html?debug=1`
- Generator marker lokal: `http://localhost/toga-tanaman/marker-generator.html`

## Konfigurasi Data
Sumber data utama saat ini memakai endpoint Google Apps Script (di `assets/app.js` dan script di `ar.html`):
- `API_URL?mode=list` untuk daftar tanaman
- `API_URL?id=<id>` untuk detail tanaman

Jika API tidak tersedia, aplikasi akan fallback ke data lokal:
- `data/plants.json`

Catatan: isi `data/plants.json` saat ini masih kosong (`[]`), jadi untuk mode offline sebaiknya diisi data tanaman.

## Google Apps Script API
Proyek ini menggunakan Google Apps Script sebagai JSON API dari Google Sheets.

### 1. Struktur Spreadsheet
- Spreadsheet URL: `https://docs.google.com/spreadsheets/d/17BjGxtalow56mIflBtT_DihH1jJQo96r5Uur1ozZF9E/edit?usp=sharing`
- Spreadsheet ID: `17BjGxtalow56mIflBtT_DihH1jJQo96r5Uur1ozZF9E`
- Sheet name: `Plants`
- Susunan kolom:
  - `id,nama,nama_latin,jenis,gambar,manfaat,deskripsi,catatan,url_qr,gr_img`

Kolom yang dibaca API utama:
- `id,nama,nama_latin,jenis,gambar,manfaat,deskripsi,catatan`

Kolom tambahan spreadsheet:
- `url_qr`
- `gr_img`

Untuk data galeri, tambahkan sheet baru:
- Sheet name: `Galleries`
- Kolom:
  - `id,title,image,date,location,person,desc`

Contoh isi row `Galleries`:
- `gal-001,Kerja Bakti TOGA,https://images.unsplash.com/... ,2026-02-10,Kebun RT 09,Ibu PKK,Perawatan rutin area tanam TOGA`

Format kolom list (`manfaat`, `catatan`) dapat diisi:
- Satu nilai saja, atau
- Banyak nilai dipisah karakter `|` (pipe), contoh: `A|B|C`

Kolom `deskripsi` diisi teks paragraf (HTML mentah), contoh:
```html
<p>Kunyit dikenal sebagai rempah dengan banyak manfaat.</p>
<p>Gunakan seperlunya sesuai kebutuhan.</p>
```

Formula spreadsheet:
- `url_qr` (contoh di baris 2):
```excel
="https://taqin98.github.io/toga-tanaman/?id="&A2
```
- `gr_img` / QR image (contoh di baris 2):
```excel
=IMAGE("https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="&ENCODEURL(I2))
```

### 2. Kode Google Apps Script
Gunakan kode yang Anda pakai saat ini (disarankan simpan sebagai `Code.gs`):

```javascript
/**
 * TOGA RT09 - JSON API dari Google Sheets
 * Sheet name: Plants
 * Kolom wajib: id,nama,nama_latin,jenis,gambar,manfaat,deskripsi,catatan
 */

const SPREADSHEET_ID = "17BjGxtalow56mIflBtT_DihH1jJQo96r5Uur1ozZF9E";
const SHEET_NAME = "Plants";

function doOptions(e){
  return jsonCORS_({ ok: true });
}

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const callback = (params.callback || "").trim();

  const id = (params.id || "").trim();
  const mode = (params.mode || "").trim();

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return output_(callback, { error: `Sheet "${SHEET_NAME}" tidak ditemukan.` });

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return output_(callback, { error: "Data kosong." });

  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1);

  const data = rows.map(r => rowToObj_(headers, r)).filter(o => o.id);

  if (id) {
    const found = data.find(x => String(x.id).trim() === id);
    if (!found) return output_(callback, { error: "Tanaman tidak ditemukan", id });
    return output_(callback, normalizePlant_(found));
  }

  if (mode === "list") {
    return output_(callback, data.map(d => ({
      id: String(d.id).trim(),
      nama: d.nama || "",
      nama_latin: d.nama_latin || "",
      jenis: d.jenis || "",
      gambar: d.gambar || ""
    })));
  }

  if (mode === "gallery") {
    return output_(callback, getGallery_(ss));
  }


  const out = {};
  data.forEach(d => out[String(d.id).trim()] = normalizePlant_(d));
  return output_(callback, out);
}

function output_(callback, obj) {
  const json = JSON.stringify(obj);

  // JSONP mode
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${json})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  // Normal JSON mode (kalau dibuka langsung di browser)
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function getGallery_(ss) {
  const gallerySheet = ss.getSheetByName("Galleries");
  if (!gallerySheet) return [];

  const values = gallerySheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1);

  return rows
    .map(r => rowToObj_(headers, r))
    .filter(o => String(o.image || "").trim())
    .map((o, i) => ({
      id: String(o.id || `gallery-${i + 1}`).trim(),
      title: String(o.title || "").trim(),
      image: String(o.image || "").trim(),
      date: String(o.date || "").trim(),
      location: String(o.location || "").trim(),
      person: String(o.person || "").trim(),
      desc: String(o.desc || "").trim()
    }));
}

function rowToObj_(headers, row) {
  const o = {};
  headers.forEach((h, i) => o[h] = row[i] !== undefined ? row[i] : "");
  Object.keys(o).forEach(k => {
    if (typeof o[k] === "string") o[k] = o[k].trim();
  });
  return o;
}

function splitPipe_(v) {
  if (v === null || v === undefined) return [];
  const s = String(v).trim();
  if (!s) return [];
  return s.includes("|") ? s.split("|").map(x => x.trim()).filter(Boolean) : [s];
}

function normalizePlant_(p) {
  return {
    id: String(p.id || "").trim(),
    nama: p.nama || "",
    nama_latin: p.nama_latin || "",
    jenis: p.jenis || "",
    gambar: p.gambar || "",
    manfaat: splitPipe_(p.manfaat),
    deskripsi: p.deskripsi || "",
    catatan: splitPipe_(p.catatan)
  };
}

function jsonCORS_(obj) {
  const payload = JSON.stringify(obj);
  const out = HtmlService.createHtmlOutput(payload);
  out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  out.setHeader("Access-Control-Allow-Origin", "*");
  out.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  out.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return out;
}
```

### 3. Deploy sebagai Web App
1. Buka `script.google.com`, buat project Apps Script.
2. Tempel kode di atas pada `Code.gs`.
3. Klik `Deploy` -> `New deployment`.
4. Pilih type `Web app`.
5. Set:
   - Execute as: `Me`
   - Who has access: `Anyone`
6. Klik `Deploy`, lalu salin URL Web App (`.../exec`).

### 4. Endpoint yang Digunakan Frontend
- List ringkas tanaman:
  - `GET <WEB_APP_URL>/exec?mode=list`
- Detail tanaman per id:
  - `GET <WEB_APP_URL>/exec?id=kunyit`
- Semua data normalisasi (objek by id):
  - `GET <WEB_APP_URL>/exec`
- List galeri:
  - `GET <WEB_APP_URL>/exec?mode=gallery`

### 5. Integrasi ke Proyek
Ganti nilai `API_URL` di:
- `assets/app.js`
- script inline pada `ar.html`

Pastikan nilai `API_URL` menunjuk ke URL Web App terbaru (deployment aktif).

## Format Data Tanaman
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
1. Tambahkan data tanaman (ID unik) ke sumber data utama (API) dan/atau `data/plants.json`.
2. Tambahkan gambar ke `images/` lalu isi field `gambar`.
3. Buat marker pattern dengan nama:
   - `markers/<id>_v3.patt`
4. Uji akses:
   - `/?id=<id>`
   - `/ar.html` lalu scan marker.

## Dokumentasi AR Marker (Generator AR.js)
Marker AR pada proyek ini dibuat dari generator resmi AR.js:
- `https://ar-js-org.github.io/AR.js/three.js/examples/marker-training/examples/generator.html`

### Alur Generate Marker
1. Siapkan gambar marker (PNG/JPG) dengan kontras tinggi.
2. Buka link generator AR.js di atas.
3. Upload gambar marker.
4. Download file pattern `.patt` (wajib untuk tracking AR.js).
5. (Opsional) download gambar marker hasil generate untuk dicetak sebagai target scan.

### Aturan Penamaan di Proyek Ini
File marker harus disimpan di folder `markers/` dengan format:
- `markers/<id>_v3.patt`

Contoh:
- ID tanaman `kunyit` -> `markers/kunyit_v3.patt`
- ID tanaman `kangkung` -> `markers/kangkung_v3.patt`

`<id>` harus sama persis dengan kolom `id` di data tanaman/API, karena `ar.html` memuat marker dengan pola:
- `markers/${id}_v3.patt`

### Cara Uji Marker
1. Buka `http://localhost/toga-tanaman/ar.html`.
2. Arahkan kamera ke marker yang sudah dicetak/ditampilkan.
3. Jika terdeteksi, overlay AR tampil dan tombol detail tanaman muncul.
4. Untuk simulasi tanpa scan kamera, gunakan mode debug:
   - `http://localhost/toga-tanaman/ar.html?debug=1`

### Catatan Penting
- Jangan ubah nama file marker setelah mapping ID dipakai di data.
- Pastikan pencahayaan cukup saat scanning.
- Gunakan marker yang dicetak tajam dan tidak blur untuk akurasi deteksi.

## Generate QR Code Otomatis (Tanpa .patt)
Jika ingin generate PNG QR saja dari data Apps Script:

```bash
npm run qr:generate
```

Opsi tambahan:
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

## Generate Otomatis QR + Marker + .patt (Command Line)
Jika ingin proses full tanpa upload manual ke website AR.js:

```bash
npm run markers:generate
```

Opsi tambahan:
```bash
npm run markers:generate -- \
  --api-url "https://<WEB_APP_URL>/exec" \
  --detail-base "https://taqin98.github.io/toga-tanaman/" \
  --qr-size 600 \
  --marker-image-size 600 \
  --pattern-ratio 0.52 \
  --border-color "#000000" \
  --ids kunyit,kangkung
```

Output:
- `markers/qr/<id>.png`
- `markers/qr/<id>-marker.png`
- `markers/<id>_v3.patt`
- `markers/qr/report.json`

## Catatan PWA
- Manifest: `manifest.webmanifest`
- Registrasi SW: `assets/pwa.js`
- Precache aset statis: `sw.js`
- Versi cache saat ini: `toga-v9`

Jika mengubah aset penting, naikkan versi cache di `sw.js` agar cache lama dibersihkan.

## Lisensi
Belum ditentukan. Tambahkan lisensi sesuai kebutuhan proyek.
