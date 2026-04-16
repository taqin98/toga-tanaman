function publishRamuanContext() {
  const context = {
    page: "ramuan",
    view: "chat",
    title: "Ramuan TOGA",
    intro:
      "Halaman ini dipakai untuk konsultasi ringan seputar ramuan, langkah pemakaian tanaman TOGA, dan perhatian dasar. Dataset ramuan lokal belum tersedia di halaman ini.",
    suggestedPrompts: [
      "Saya batuk ringan, tanaman TOGA apa yang cocok?",
      "Apa perhatian dasar sebelum memakai ramuan TOGA?",
      "Kapan keluhan sebaiknya diperiksa ke tenaga kesehatan?",
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
