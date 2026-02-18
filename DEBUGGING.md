# Debugging Guide - TOGA RT 09

Dokumen ini berisi panduan debug untuk fitur utama proyek: data/API, tampilan list-detail, AR marker, dan PWA/service worker.

## 1. Persiapan Debug
- Jalankan proyek dari server lokal (contoh XAMPP): `http://localhost/toga-tanaman/`
- Gunakan browser modern (Chrome/Edge/Safari terbaru).
- Buka DevTools:
  - Console: cek error JavaScript
  - Network: cek request API dan file statis
  - Application: cek Local Storage, Cache Storage, dan Service Worker

## 2. Debug Data dan API
- Endpoint list: `API_URL?mode=list`
- Endpoint detail: `API_URL?id=<id>`
- Fallback lokal: `data/plants.json`

Langkah cek:
1. Buka tab Network lalu refresh halaman `index.html`.
2. Pastikan request ke endpoint list status `200`.
3. Jika gagal, cek Console apakah muncul log fallback ke data lokal.
4. Buka Local Storage, cek cache key:
   - `toga:plants:list:v1`
   - `toga:plants:detail:v1:<id>`
5. Jika data stale/rusak, hapus key cache lalu refresh.

Gejala umum:
- Daftar kosong: API gagal dan `data/plants.json` kosong.
- Detail tidak muncul: parameter `?id=` tidak ada/invalid atau data ID tidak ditemukan.

## 3. Debug Halaman AR
- URL AR normal: `http://localhost/toga-tanaman/ar.html`
- URL AR debug: `http://localhost/toga-tanaman/ar.html?debug=1`

Langkah cek AR:
1. Pastikan izin kamera diberikan.
2. Pastikan file marker ada: `markers/<id>.patt`.
3. Pastikan `id` marker sama dengan `id` data tanaman.
4. Cek Console untuk error gambar (CORS/path) dan marker loading.

Mode debug (`?debug=1`) menyediakan:
- Simulasi event marker `Found`, `Lost`, `Reset`
- Export log event debug (JSON)
- Clear log

Force tampil object 3D marker dari Console (untuk adjust posisi/style):
- Berdasarkan pilihan dropdown debug:
```js
document.querySelector('#m_' + document.querySelector('#debugSelect').value).object3D.visible = true
```
- Langsung tembak ID marker:
```js
document.querySelector('#m_kunyit').object3D.visible = true
```

Gunakan cara ini untuk menampilkan objek AR tanpa menunggu scan marker, lalu lakukan penyesuaian atribut/posisi di elemen A-Frame dan terapkan hasilnya ke kode sumber.

Jika marker tidak terbaca:
- Tingkatkan pencahayaan
- Gunakan hasil print marker yang tajam
- Hindari marker blur, terlipat, atau terlalu kecil

Membuka DevTools:
- macOS: `Command + Option + Control + I`
- Windows (umum): `Ctrl + Shift + I`

## 4. Debug Service Worker dan Cache
- Registrasi SW dilakukan oleh `assets/pwa.js`
- File SW utama: `sw.js`
- Versi cache saat ini: `toga-v9`

Langkah cek:
1. Buka Application -> Service Workers, pastikan `sw.js` aktif.
2. Buka Cache Storage, cek cache:
   - `toga-v9-static`
   - `toga-v9-runtime`
3. Jika update file tidak terlihat:
   - Hard reload
   - Unregister service worker
   - Clear site data/cache
   - Naikkan `SW_VERSION` di `sw.js` lalu deploy ulang

## 5. Checklist Cepat Saat Error
1. Cek Console error.
2. Cek Network request API (status dan response JSON).
3. Cek Local Storage cache key TOGA.
4. Cek file marker `.patt` dan kecocokan `id`.
5. Cek status service worker dan versi cache.

## 6. Referensi File
- `index.html`
- `ar.html`
- `assets/app.js`
- `assets/pwa.js`
- `sw.js`
- `manifest.webmanifest`
- `data/plants.json`
- `markers/`
