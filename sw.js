const SW_VERSION = "toga-v10.7.21";
const STATIC_CACHE = `${SW_VERSION}-static`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./ar.html",
  "./gallery.html",
  "./profile.html",
  "./manifest.webmanifest",
  "./assets/style.css",
  "./assets/config.js",
  "./assets/app.js",
  "./assets/pwa.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/shortcut.png",
  "./assets/screenshots/install-mobile.png",
  "./data/plants.json",
  "./images/kangkung.jpg",
  "./images/kunyit.jpg",
  "./markers/kangkung_v3.patt",
  "./markers/kunyit_v3.patt"
];

self.addEventListener("install", (event) => {
  event.waitUntil(precacheStaticAssets());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function handleNavigation(request) {
  const staticCache = await caches.open(STATIC_CACHE);
  const staticAsset = resolveNavigationAsset(request.url);
  const cached = await staticCache.match(staticAsset);
  if (cached) return cached;

  try {
    return await fetch(request, { cache: "no-cache" });
  } catch (_) {
    const fallback = await staticCache.match("./index.html");
    if (fallback) return fallback;
    throw _;
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
  return "./index.html";
}

async function precacheStaticAssets() {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    STATIC_ASSETS.map(async (asset) => {
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

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cache = await caches.open(RUNTIME_CACHE);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw _;
  }
}
