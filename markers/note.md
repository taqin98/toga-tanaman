Rename sesuai id tanaman kamu
```bash
kunyit.patt
kangkung.patt
jahe.patt
```

⚠️ HARUS sama persis dengan kolom id di Google Sheets
```bash
huruf kecil
tanpa spasi
pakai underscore kalau perlu
```


Cara bua QR Code
```bash
https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://taqin98.github.io/toga-tanaman/?id=kangkung
```


Cara buat AR Code
```bash
https://ar-js-org.github.io/AR.js/three.js/examples/marker-training/examples/generator.html
```
`upload hasil generate QR code di webiste generate AR`


?debug=1

paste ini
```bash
document.querySelector('#m_' + document.querySelector('#debugSelect').value).object3D.visible = true
```

`#m_' + document.querySelector('#debugSelect').value` bisa diganti dengan `#m_kunyit`

#m_kunyit id yg ada di datatabase sheet id:`kunyit`
