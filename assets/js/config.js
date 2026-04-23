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
    // Opsional: aktifkan Google Sign-In dengan Web Client ID dari Google Cloud Console.
    googleClientId: "48850536137-p383qe88mv03p23mb8e5j6mr84jg3tvj.apps.googleusercontent.com",

    // ── Firebase Cloud Messaging (Push Notifications) ──
    // Isi dari Firebase Console > Project Settings > General > Your apps > Web
    firebaseConfig: {
      apiKey: "AIzaSyD322P4hrrnOgueb8MGpcNVMFjhJHoDrOw",
      authDomain: "toga-firebase.firebaseapp.com",
      projectId: "toga-firebase",
      storageBucket: "toga-firebase.firebasestorage.app",
      messagingSenderId: "957268204190",
      appId: "1:957268204190:web:77abe63158ebef21d3b98f",
      measurementId: "G-V9HSM8DREZ"
    },
    // Isi dari Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
    fcmVapidKey: "BE_rpk0maOjamG2XeLqgRutvRNgQrXtKhSEBeMB8ZbrTURWBmG0xZ_zg8yPZOHZDtbmnjbYtEjOSP2Mlwgr90V4",
  },
  window.TOGA_CONFIG || {}
);
