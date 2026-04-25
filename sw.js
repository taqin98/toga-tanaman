const SW_VERSION = "toga-v13.6.0";

const CACHE_NAMES = {
  appShell: `${SW_VERSION}-app-shell`,
  assets: `${SW_VERSION}-assets`,
  images: `${SW_VERSION}-images`,
  api: `${SW_VERSION}-api`,
};

const APP_SHELL_ASSETS = [
  "./",
  "./index.html",
  "./ar.html",
  "./scan-qr.html",
  "./gallery.html",
  "./ramuan.html",
  "./marker-diagnostic.html",
  "./profile.html",
  "./settings.html",
  "./jadwal.html",
  "./account.html",
  "./marker-generator.html",
  "./print-markers.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./assets/css/account.css",
  "./assets/css/ar.css",
  "./assets/css/gallery.css",
  "./assets/css/marker-diagnostic.css",
  "./assets/css/style.css",
  "./assets/css/jadwal.css",
  "./assets/js/app.js",
  "./assets/js/ar.js",
  "./assets/js/scan-qr.js",
  "./assets/js/auth.js",
  "./assets/js/chat.js",
  "./assets/js/config.js",
  "./assets/js/gallery.js",
  "./assets/js/marker-diagnostic.js",
  "./assets/js/jadwal.js",
  "./assets/js/fcm.js",
  "./assets/js/pwa.js",
  "./assets/js/ramuan.js",
  "./assets/js/theme.js",
  "./assets/js/topbar.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/shortcut.png",
  "./assets/screenshots/install-mobile.png",
  "./data/plants.json",
  "./markers/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precacheAppShell();
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(cleanupOldCaches());
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Push Notification Handler (Firebase Cloud Messaging) ──
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch (_) {
    try {
      payload = { notification: { title: "TOGA", body: event.data?.text() || "" } };
    } catch (__) {
      payload = { notification: { title: "TOGA", body: "Ada pengingat baru." } };
    }
  }

  const notif = payload.notification || {};
  const data = payload.data || {};

  const title = notif.title || "🔔 TOGA Reminder";
  const options = {
    body: notif.body || "Ada agenda yang akan segera dimulai.",
    icon: "./assets/icons/icon-192.png",
    badge: "./assets/icons/icon-192.png",
    vibrate: [200, 100, 200],
    tag: "toga-reminder-" + (data.event_id || Date.now()),
    requireInteraction: true,
    data: {
      url: data.click_action || "./jadwal.html",
      event_id: data.event_id || "",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "./jadwal.html";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing tab if found
        for (const client of clientList) {
          if (client.url.includes("jadwal.html") && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise open new tab
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(handleNavigationRequest(request));
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, CACHE_NAMES.api));
    return;
  }

  if (isGoogleDriveThumbnailRequest(url)) {
    event.respondWith(cacheFirst(request, CACHE_NAMES.images));
    return;
  }

  if (isMarkerPatternRequest(url) || isMarkerManifestRequest(url)) {
    event.respondWith(networkFirst(request, CACHE_NAMES.assets));
    return;
  }

  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.images, event));
    return;
  }

  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font"
  ) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.assets, event));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, CACHE_NAMES.assets));
    return;
  }

  event.respondWith(networkFirst(request, CACHE_NAMES.assets));
});

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAMES.appShell);
  await Promise.all(
    APP_SHELL_ASSETS.map(async (asset) => {
      try {
        const response = await fetch(asset, { cache: "no-cache" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${asset}`);
        }
        await cache.put(asset, response);
      } catch (error) {
        console.warn("[SW] Precache dilewati:", asset, error);
      }
    })
  );
}

async function cleanupOldCaches() {
  const allowlist = new Set(Object.values(CACHE_NAMES));
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => !allowlist.has(key)).map((key) => caches.delete(key))
  );
}

async function handleNavigationRequest(request) {
  const appShellCache = await caches.open(CACHE_NAMES.appShell);
  const fallbackAsset = resolveNavigationAsset(request.url);

  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response && response.ok) {
      appShellCache.put(fallbackAsset, response.clone());
    }
    return response;
  } catch (_) {
    const cachedPage = await appShellCache.match(fallbackAsset);
    if (cachedPage) return cachedPage;

    const offline = await appShellCache.match("./offline.html");
    if (offline) return offline;

    const home = await appShellCache.match("./index.html");
    if (home) return home;

    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

function resolveNavigationAsset(requestUrl) {
  const url = new URL(requestUrl);
  const scopePath = new URL(self.registration.scope).pathname;
  let relativePath = url.pathname;

  if (relativePath.startsWith(scopePath)) {
    relativePath = relativePath.slice(scopePath.length);
  }

  const path = relativePath.replace(/^\/+/, "");
  if (path === "" || path === "index.html") return "./index.html";
  if (path === "gallery.html") return "./gallery.html";
  if (path === "ramuan.html") return "./ramuan.html";
  if (path === "ar.html") return "./ar.html";
  if (path === "scan-qr.html") return "./scan-qr.html";
  if (path === "marker-diagnostic.html") return "./marker-diagnostic.html";
  if (path === "profile.html") return "./profile.html";
  if (path === "settings.html") return "./settings.html";
  if (path === "jadwal.html") return "./jadwal.html";
  if (path === "marker-generator.html") return "./marker-generator.html";
  if (path === "print-markers.html") return "./print-markers.html";
  return "./index.html";
}

function isApiRequest(url) {
  if (url.origin === self.location.origin) return false;
  return (
    url.hostname.includes("script.google.com") ||
    url.hostname.includes("script.googleusercontent.com")
  );
}

function isGoogleDriveThumbnailRequest(url) {
  return url.hostname === "drive.google.com" && url.pathname === "/thumbnail";
}

function isMarkerPatternRequest(url) {
  return url.origin === self.location.origin && url.pathname.endsWith(".patt");
}

function isMarkerManifestRequest(url) {
  return url.origin === self.location.origin && url.pathname.endsWith("/markers/manifest.json");
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cache = await caches.open(cacheName);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(cacheName);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw _;
  }
}

function staleWhileRevalidate(request, cacheName, event) {
  const fetchPromise = fetch(request)
    .then(async (response) => {
      if (!response || !response.ok) return response;
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  event.waitUntil(fetchPromise);

  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => cached || fetchPromise)
  );
}
