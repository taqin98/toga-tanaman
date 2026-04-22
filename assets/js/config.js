window.TOGA_CONFIG = Object.assign(
  {
    // Set true agar data diambil dari Google Apps Script.
    enableRemoteApi: true,
    apiUrl:
      "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec",
    // Opsional: endpoint backend AI di Vercel.
    // Contoh: "https://nama-app-vercel.vercel.app/api/chat"
    aiChatUrl: "https://vercel-ai-backend-ten.vercel.app/api/chat",
    // Aktif secara default agar backend bisa menarik knowledge base situs.
    aiChatUseRemoteDataSource: true,
    // Opsional: endpoint proxy gambar untuk thumbnail Google Drive di AR.
    // Jika kosong, frontend akan menurunkan URL dari aiChatUrl -> /api/image-proxy
    imageProxyUrl: "https://vercel-ai-backend-ten.vercel.app/api/image-proxy",
    // Opsional: endpoint auth backend.
    // Jika kosong, frontend akan menurunkan dari aiChatUrl -> /api/auth
    authApiUrl: "https://vercel-ai-backend-ten.vercel.app/api/auth",
    // Opsional: endpoint proxy jadwal backend.
    // Jika kosong, frontend akan menurunkan dari authApiUrl/aiChatUrl -> /api/schedule
    scheduleApiUrl: "https://vercel-ai-backend-ten.vercel.app/api/schedule",
    // Auth frontend untuk izin CRUD jadwal.
    // Hanya dipakai fallback jika auth backend belum diaktifkan.
    authUsers: [
      {
        username: "userDummy",
        password: "passwordDummy",
        displayName: "Display Dummy",
        role: "editor",
      },
    ],
    // Opsional: aktifkan Google Sign-In dengan Web Client ID dari Google Cloud Console.
    googleClientId: "48850536137-p383qe88mv03p23mb8e5j6mr84jg3tvj.apps.googleusercontent.com",
    // Opsional: jika diisi, hanya email ini yang boleh login via Google.
    allowedGoogleEmails: [],
  },
  window.TOGA_CONFIG || {}
);
