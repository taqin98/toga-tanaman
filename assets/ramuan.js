const DUMMY_REMEDIES = [
  {
    id: "batuk-hangat-jahe",
    judul: "Batuk ringan dan tenggorokan gatal",
    kategori: "Pernapasan",
    tanaman: ["Jahe", "Kencur", "Madu"],
    ringkas:
      "Seduhan hangat sederhana untuk batuk ringan tanpa sesak, napas cepat, atau demam tinggi.",
    langkah: [
      "Geprek jahe dan kencur lalu rebus 10 menit.",
      "Saring saat hangat dan tambahkan madu.",
      "Minum perlahan pagi atau malam hari.",
    ],
    perhatian:
      "Madu tidak dianjurkan untuk anak di bawah 1 tahun. Bila batuk disertai sesak atau demam tinggi, periksa ke tenaga kesehatan.",
  },
  {
    id: "masuk-angin-jahe-sereh",
    judul: "Masuk angin dan badan meriang",
    kategori: "Pemulihan",
    tanaman: ["Jahe", "Sereh", "Jeruk Nipis"],
    ringkas:
      "Minuman hangat untuk meriang ringan dan perut terasa tidak nyaman setelah kehujanan atau kelelahan.",
    langkah: [
      "Rebus jahe dan sereh selama 10 sampai 12 menit.",
      "Tambahkan sedikit jeruk nipis saat sudah hangat.",
      "Minum sambil beristirahat dan menjaga tubuh tetap hangat.",
    ],
    perhatian:
      "Bila muntah berulang, nyeri berat, atau kondisi tidak membaik, jangan hanya mengandalkan ramuan.",
  },
  {
    id: "mual-kunyit-jahe",
    judul: "Mual ringan setelah telat makan",
    kategori: "Pencernaan",
    tanaman: ["Kunyit", "Jahe"],
    ringkas:
      "Seduhan kunyit dan jahe untuk membantu perut terasa lebih nyaman pada mual ringan.",
    langkah: [
      "Iris kunyit dan jahe lalu rebus sekitar 8 sampai 10 menit.",
      "Saring dan minum selagi hangat setelah makan ringan.",
      "Gunakan sebagai pendamping pola makan teratur.",
    ],
    perhatian:
      "Jika mual disertai muntah berulang, lemas berat, atau nyeri hebat, cari bantuan medis.",
  },
  {
    id: "sariawan-daun-sirih",
    judul: "Sariawan ringan dan mulut kurang nyaman",
    kategori: "Perawatan Mulut",
    tanaman: ["Daun Sirih"],
    ringkas:
      "Air rebusan daun sirih untuk berkumur pada sariawan ringan dan menjaga kebersihan area mulut.",
    langkah: [
      "Rebus 3 sampai 4 lembar daun sirih sekitar 8 menit.",
      "Dinginkan sampai hangat.",
      "Gunakan untuk berkumur 1 sampai 2 kali sehari.",
    ],
    perhatian:
      "Tidak untuk diminum banyak. Jika luka makin besar atau sulit makan, konsultasikan ke tenaga kesehatan.",
  },
  {
    id: "stamina-pagi-serai",
    judul: "Minuman pagi untuk menjaga kebugaran",
    kategori: "Kebugaran",
    tanaman: ["Jahe", "Sereh", "Madu"],
    ringkas:
      "Minuman hangat harian sederhana sebagai pendamping pola hidup sehat sebelum beraktivitas.",
    langkah: [
      "Rebus jahe dan sereh selama 10 menit.",
      "Tambahkan madu setelah hangat.",
      "Minum satu cangkir pada pagi hari.",
    ],
    perhatian:
      "Gunakan secukupnya dan tetap jadikan pola hidup sehat sebagai dasar utama.",
  },
];

function summarizeRemedy(item) {
  return {
    id: item.id,
    judul: item.judul,
    kategori: item.kategori,
    tanaman: item.tanaman.slice(0, 4),
    ringkas: item.ringkas,
    langkah: item.langkah.slice(0, 3),
    perhatian: item.perhatian,
  };
}

function publishRamuanContext() {
  const context = {
    page: "ramuan",
    view: "chat",
    title: "Ramuan TOGA",
    intro:
      "Halaman ini dipakai untuk konsultasi ringan seputar ramuan, langkah pemakaian tanaman TOGA, dan perhatian dasar. Data contoh masih dummy.",
    remedies: DUMMY_REMEDIES.map(summarizeRemedy),
    suggestedPrompts: [
      "Saya batuk ringan, tanaman TOGA apa yang cocok?",
      "Bagaimana langkah membuat ramuan jahe untuk badan meriang?",
      "Kalau mual ringan, ramuan TOGA apa yang bisa dicoba?",
      "Tolong jelaskan peringatan dasar sebelum memakai ramuan TOGA.",
      "Buatkan langkah sederhana untuk sariawan ringan dengan daun sirih.",
      "Tanaman apa yang cocok untuk minuman pagi menjaga kebugaran?",
    ],
  };

  window.TOGA_PAGE_CONTEXT = context;
  window.dispatchEvent(
    new CustomEvent("toga:page-context-change", { detail: context })
  );
}

function initRamuanPage() {
  publishRamuanContext();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initRamuanPage, { once: true });
} else {
  initRamuanPage();
}
