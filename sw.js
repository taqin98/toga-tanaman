const SW_VERSION = "toga-v12.0.0";

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
  "./gallery.html",
  "./profile.html",
  "./marker-generator.html",
  "./print-markers.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./assets/style.css",
  "./assets/config.js",
  "./assets/app.js",
  "./assets/pwa.js",
  "./assets/theme.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/shortcut.png",
  "./assets/screenshots/install-mobile.png",
  "./data/plants.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAppShell());
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
  if (path === "ar.html") return "./ar.html";
  if (path === "profile.html") return "./profile.html";
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
