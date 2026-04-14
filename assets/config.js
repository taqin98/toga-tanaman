window.TOGA_CONFIG = Object.assign(
  {
    // Set true agar data diambil dari Google Apps Script.
    enableRemoteApi: true,
    apiUrl:
      "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec",
    // Opsional: endpoint backend AI di Vercel.
    // Contoh: "https://nama-app-vercel.vercel.app/api/chat"
    aiChatUrl: "https://vercel-ai-backend-ten.vercel.app/api/chat",
  },
  window.TOGA_CONFIG || {}
);
