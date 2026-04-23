/**
 * fcm.js – Firebase Cloud Messaging client module
 *
 * Handles:
 * 1. Loading Firebase SDK from CDN
 * 2. Requesting notification permission
 * 3. Getting FCM token
 * 4. Registering token to backend
 * 5. Handling foreground messages (in-app toast)
 */
(function () {
  "use strict";

  const STORAGE_KEY = "toga:fcm:token";
  const STORAGE_KEY_DENIED = "toga:fcm:denied";

  let _registering = false; // mutex to prevent concurrent calls
  let _registered = false;  // skip if already done this session
  let _initDone = false;    // prevent double init

  function getConfig() {
    return window.TOGA_CONFIG || {};
  }

  function getFirebaseConfig() {
    return getConfig().firebaseConfig || null;
  }

  function getVapidKey() {
    return String(getConfig().fcmVapidKey || "").trim();
  }

  function getPushRegisterUrl() {
    const config = getConfig();

    // Explicit push API URL
    if (typeof config.pushApiUrl === "string" && config.pushApiUrl.trim()) {
      return config.pushApiUrl.trim().replace(/\/+$/g, "") + "/register";
    }

    // Derive from scheduleApiUrl -> /api/push/register
    if (typeof config.scheduleApiUrl === "string" && config.scheduleApiUrl.trim()) {
      return config.scheduleApiUrl
        .trim()
        .replace(/\/schedule\/?$/i, "/push/register");
    }

    // Derive from authApiUrl -> /api/push/register
    if (typeof config.authApiUrl === "string" && config.authApiUrl.trim()) {
      return config.authApiUrl
        .trim()
        .replace(/\/auth\/?$/i, "/push/register");
    }

    // Derive from aiChatUrl
    if (typeof config.aiChatUrl === "string" && config.aiChatUrl.trim()) {
      try {
        const url = new URL(config.aiChatUrl.trim(), window.location.href);
        return `${url.origin}/api/push/register`;
      } catch (_) {}
    }

    return "";
  }

  function getAuthToken() {
    return String(window.TOGAAuth?.getToken?.() || "").trim();
  }

  function isAuthenticated() {
    return !!window.TOGAAuth?.isAuthenticated?.();
  }

  function getStoredToken() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function storeToken(token) {
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch (_) {}
  }

  function isDenied() {
    try {
      return localStorage.getItem(STORAGE_KEY_DENIED) === "1";
    } catch (_) {
      return false;
    }
  }

  function markDenied() {
    try {
      localStorage.setItem(STORAGE_KEY_DENIED, "1");
    } catch (_) {}
  }

  /**
   * Dynamically load Firebase SDK from CDN (compat version for simplicity)
   */
  function loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
      // Already loaded
      if (window.firebase?.messaging) {
        resolve();
        return;
      }

      const scripts = [
        "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
        "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js",
      ];

      let loaded = 0;

      function loadNext() {
        if (loaded >= scripts.length) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = scripts[loaded];
        script.onload = () => {
          loaded++;
          loadNext();
        };
        script.onerror = () => reject(new Error("Gagal memuat Firebase SDK."));
        document.head.appendChild(script);
      }

      loadNext();
    });
  }

  /**
   * Initialize Firebase and return messaging instance
   */
  async function initMessaging() {
    const firebaseConfig = getFirebaseConfig();
    if (!firebaseConfig) {
      console.warn("[fcm] firebaseConfig belum diatur di TOGA_CONFIG.");
      return null;
    }

    await loadFirebaseSDK();

    if (!window.firebase) {
      console.warn("[fcm] Firebase SDK tidak tersedia.");
      return null;
    }

    // Initialize Firebase app (only once)
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    return firebase.messaging();
  }

  /**
   * Request notification permission + get FCM token
   */
  async function requestAndRegister() {
    // Guard: prevent concurrent or duplicate calls
    if (_registering || _registered) {
      console.info("[fcm] Register sudah berjalan atau selesai, skip.");
      return null;
    }
    _registering = true;

    try {
      if (!("Notification" in window)) {
        console.info("[fcm] Browser tidak support Notification API.");
        return null;
      }

      if (Notification.permission === "denied" || isDenied()) {
        console.info("[fcm] Notifikasi sudah ditolak oleh user.");
        return null;
      }

      const vapidKey = getVapidKey();
      if (!vapidKey) {
        console.warn("[fcm] fcmVapidKey belum diatur di TOGA_CONFIG.");
        return null;
      }

      const messaging = await initMessaging();
      if (!messaging) return null;

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.info("[fcm] Izin notifikasi ditolak.");
        markDenied();
        return null;
      }

      // Get the service worker registration
      let swRegistration = null;
      try {
        swRegistration = await navigator.serviceWorker.ready;
      } catch (_) {
        console.warn("[fcm] Service worker belum tersedia.");
        return null;
      }

      // Get FCM token
      let token = "";
      try {
        token = await messaging.getToken({
          vapidKey,
          serviceWorkerRegistration: swRegistration,
        });
      } catch (error) {
        console.error("[fcm] Gagal mendapatkan FCM token:", error);
        return null;
      }

      if (!token) {
        console.warn("[fcm] FCM token kosong.");
        return null;
      }

      // Check if this token is already registered
      const storedToken = getStoredToken();
      if (storedToken === token) {
        console.info("[fcm] Token sudah terdaftar, skip register.");
        _registered = true;
        return token;
      }

      // Store FIRST to prevent race condition — any concurrent call will
      // see the token in localStorage and skip before hitting the backend.
      storeToken(token);
      _registered = true;

      // Then register to backend (only 1 call reaches here)
      await registerTokenToBackend(token);

      return token;
    } finally {
      _registering = false;
    }
  }

  /**
   * Send FCM token to backend
   */
  async function registerTokenToBackend(token) {
    const registerUrl = getPushRegisterUrl();
    if (!registerUrl) {
      console.warn("[fcm] Push register URL tidak ditemukan.");
      return;
    }

    const authToken = getAuthToken();
    if (!authToken) {
      console.info("[fcm] Belum login, skip register token ke backend.");
      return;
    }

    try {
      const response = await fetch(registerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        console.warn("[fcm] Register token gagal:", response.status);
        return;
      }

      const data = await response.json();
      console.info("[fcm] Token terdaftar:", data?.message || "OK");
    } catch (error) {
      console.warn("[fcm] Register token error:", error);
    }
  }

  /**
   * Handle foreground messages (show in-app notification)
   */
  function setupForegroundHandler(messaging) {
    messaging.onMessage((payload) => {
      console.info("[fcm] Foreground message:", payload);

      const title = payload?.notification?.title || "TOGA Reminder";
      const body = payload?.notification?.body || "";

      // Show a browser notification even in foreground
      if (Notification.permission === "granted") {
        const notif = new Notification(title, {
          body,
          icon: "./assets/icons/icon-192.png",
          badge: "./assets/icons/icon-192.png",
          tag: "toga-reminder-" + (payload?.data?.event_id || Date.now()),
        });

        notif.addEventListener("click", () => {
          window.focus();
          window.location.href = payload?.data?.click_action || "./jadwal.html";
          notif.close();
        });
      }
    });
  }

  /**
   * Main initialization — setup foreground handler and catch-up registration.
   * Primary registration is triggered by auth.js after login.
   * Catch-up: if user navigated away before register finished, retry here.
   */
  async function initFCM() {
    if (_initDone) return;
    _initDone = true;

    const firebaseConfig = getFirebaseConfig();
    if (!firebaseConfig) return;

    if (!("serviceWorker" in navigator) || !("Notification" in window)) return;

    try {
      const messaging = await initMessaging();
      if (!messaging) return;

      // Setup foreground handler
      setupForegroundHandler(messaging);

      // Catch-up: user already logged in but token not yet stored
      // (e.g. navigated away from account.html before register finished)
      if (isAuthenticated() && !getStoredToken()) {
        await requestAndRegister();
      }
    } catch (error) {
      console.error("[fcm] initFCM error:", error);
    }
  }

  // Auto-initialize foreground handler when DOM is ready (no token registration)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.setTimeout(initFCM, 1500);
    });
  } else {
    window.setTimeout(initFCM, 1500);
  }

  // Expose for auth.js to call after login
  window.TOGA_FCM = {
    requestAndRegister,
    initFCM,
  };
})();
