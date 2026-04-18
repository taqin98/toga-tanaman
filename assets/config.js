window.TOGA_CONFIG = Object.assign(
  {
    // Set true agar data diambil dari Google Apps Script.
    enableRemoteApi: true,
    apiUrl:
      "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec",
    // Opsional: endpoint backend AI di Vercel.
    // Contoh: "https://nama-app-vercel.vercel.app/api/chat"
    aiChatUrl: "https://vercel-ai-backend-ten.vercel.app/api/chat",
    // Nonaktif secara default agar chat tidak selalu menunggu fetch dataset remote
    // sebelum ke model. Aktifkan hanya jika memang perlu grounding langsung dari API.
    aiChatUseRemoteDataSource: false,
    // Opsional: endpoint proxy gambar untuk thumbnail Google Drive di AR.
    // Jika kosong, frontend akan menurunkan URL dari aiChatUrl -> /api/image-proxy
    imageProxyUrl: "https://vercel-ai-backend-ten.vercel.app/api/image-proxy",
  },
  window.TOGA_CONFIG || {}
);
