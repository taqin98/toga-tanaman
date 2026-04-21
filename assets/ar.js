const DEFAULT_API_URL =
  "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec";
const API_URL =
  typeof window.TOGA_CONFIG?.apiUrl === "string" &&
  window.TOGA_CONFIG.apiUrl.trim()
    ? window.TOGA_CONFIG.apiUrl.trim()
    : DEFAULT_API_URL;
const LOCAL_DATA_URL = "data/plants.json";
const FETCH_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_KEY_AR_LIST = "toga:ar:plants:full:v1";
const SEARCH_PARAMS = new URLSearchParams(window.location.search);

const PLACEHOLDER_SVG_DATA =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <rect fill="#dddddd" width="100%" height="100%"/>
      <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-size="28">TOGA</text>
    </svg>`
  );

const LOST_DEBOUNCE_MS = 350;
const FOUND_EVENT_THROTTLE_MS = 220;
const DEBUG_MODE = SEARCH_PARAMS.get("debug") === "1";
const PREVIEW_TARGET = (SEARCH_PARAMS.get("preview") || "").trim();

const hud = document.getElementById("hud");
const btnBack = document.getElementById("btnBack");
const btn = document.getElementById("btnDetail");
const arDock = document.getElementById("arDock");
const btnDebugToggle = document.getElementById("btnDebugToggle");
const scanFrame = document.querySelector(".ar-scan-frame");
const root = document.getElementById("root");
const sceneEl = document.querySelector("a-scene");

const debugPanel = document.getElementById("debugPanel");
const debugSelect = document.getElementById("debugSelect");
const debugFoundBtn = document.getElementById("debugFound");
const debugLostBtn = document.getElementById("debugLost");
const debugResetBtn = document.getElementById("debugReset");
const debugExportBtn = document.getElementById("debugExport");
const debugClearBtn = document.getElementById("debugClear");
const debugLogEl = document.getElementById("debugLog");

const activeMarkers = new Map();
const lostTimers = new Map();
const markerLastFoundAt = new Map();
const plantById = new Map();
const debugEvents = [];
let scanState = "loading";
let arDataSource = "remote";
const IS_ANDROID = /android/i.test(window.navigator.userAgent || "");

if (btnDebugToggle && !DEBUG_MODE) {
  btnDebugToggle.style.visibility = "hidden";
  btnDebugToggle.style.pointerEvents = "none";
}

updateActiveUI();

function getViewportSize() {
  return {
    width: Math.round(window.innerWidth || document.documentElement.clientWidth || 0),
    height: Math.round(window.innerHeight || document.documentElement.clientHeight || 0),
  };
}

function fitContainRect(containerWidth, containerHeight, sourceWidth, sourceHeight) {
  const safeContainerWidth = Math.max(1, Number(containerWidth) || 1);
  const safeContainerHeight = Math.max(1, Number(containerHeight) || 1);
  const safeSourceWidth = Math.max(1, Number(sourceWidth) || 1);
  const safeSourceHeight = Math.max(1, Number(sourceHeight) || 1);
  const sourceRatio = safeSourceWidth / safeSourceHeight;
  const containerRatio = safeContainerWidth / safeContainerHeight;

  if (containerRatio > sourceRatio) {
    const height = safeContainerHeight;
    return {
      width: Math.round(height * sourceRatio),
      height: Math.round(height),
    };
  }

  const width = safeContainerWidth;
  return {
    width: Math.round(width),
    height: Math.round(width / sourceRatio),
  };
}

function applyArCameraViewport() {
  if (!IS_ANDROID) return;

  const videoEl =
    document.querySelector("#arjs-video") ||
    document.querySelector("video");
  const canvasEl =
    document.querySelector(".a-canvas") ||
    (sceneEl && sceneEl.canvas) ||
    document.querySelector("canvas");

  if (!videoEl || !canvasEl) return;

  const viewport = getViewportSize();
  const videoWidth = videoEl.videoWidth || 640;
  const videoHeight = videoEl.videoHeight || 480;
  const frame = fitContainRect(viewport.width, viewport.height, videoWidth, videoHeight);
  const offsetLeft = Math.round((viewport.width - frame.width) / 2);
  const offsetTop = Math.round((viewport.height - frame.height) / 2);

  [videoEl, canvasEl].forEach((element) => {
    if (!element) return;
    element.style.position = "fixed";
    element.style.left = `${offsetLeft}px`;
    element.style.top = `${offsetTop}px`;
    element.style.width = `${frame.width}px`;
    element.style.height = `${frame.height}px`;
    element.style.maxWidth = "none";
    element.style.maxHeight = "none";
  });
}

function lockPageScale() {
  const viewport = window.visualViewport;
  if (!viewport || viewport.scale === 1) return;

  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  meta.setAttribute(
    "content",
    "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
  );
}

function bindGestureLock() {
  const preventMultiTouchZoom = (event) => {
    if (event.touches && event.touches.length > 1) {
      event.preventDefault();
    }
  };

  document.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });
  document.addEventListener("touchstart", preventMultiTouchZoom, { passive: false });
}

function bindAndroidCameraViewportFix() {
  if (!IS_ANDROID) return;

  const watchVideo = () => {
    const videoEl =
      document.querySelector("#arjs-video") ||
      document.querySelector("video");
    if (!videoEl) return false;

    videoEl.setAttribute("playsinline", "true");
    videoEl.setAttribute("webkit-playsinline", "true");

    if (!videoEl.dataset.viewportFixBound) {
      videoEl.dataset.viewportFixBound = "true";
      videoEl.addEventListener("loadedmetadata", applyArCameraViewport);
      videoEl.addEventListener("playing", applyArCameraViewport);
    }

    applyArCameraViewport();
    return true;
  };

  if (watchVideo()) return;

  const observer = new MutationObserver(() => {
    if (!watchVideo()) return;
    observer.disconnect();
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function setScanFrameVisible(visible) {
  if (!scanFrame) return;
  scanFrame.classList.toggle("is-hidden", !visible);
}

function setDockVisible(visible) {
  if (!arDock) return;
  arDock.style.display = visible ? "block" : "none";
}

function dataSourceHint(source) {
  if (source === "cache") return " • sumber cache";
  if (source === "local") return " • sumber lokal";
  return "";
}

function setHudText(message) {
  hud.textContent = `${message}${dataSourceHint(arDataSource)}`;
}

function logDebug(event, payload = {}) {
  if (!DEBUG_MODE) return;
  debugEvents.push({
    t: new Date().toISOString(),
    event,
    ...payload,
  });
  debugLogEl.textContent = JSON.stringify(debugEvents, null, 2);
}

function setScanState(nextState) {
  if (scanState === nextState) return;
  scanState = nextState;
  logDebug("scanState", { state: nextState });
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((x) => safeStr(x).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|;|\|/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
}

function firstBullets(arr, n = 3) {
  let arrData = normalizeList(arr);
  return arrData.slice(0, n).map((x) => `• ${x}`).join("\n");
}

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

function sanitizeThumbWidth(preferredWidth, fallbackWidth = 400) {
  const width = Number(preferredWidth) || fallbackWidth;
  return Math.max(120, Math.min(width, 1000));
}

function extractGoogleDriveFileId(urlValue) {
  const input = safeStr(urlValue).trim();
  if (!input || !isHttpUrl(input)) return "";

  let url;
  try {
    url = new URL(input, window.location.href);
  } catch (_) {
    return "";
  }

  const host = url.hostname.toLowerCase();
  if (
    !host.includes("drive.google.com") &&
    !host.includes("drive.usercontent.google.com") &&
    !host.includes("docs.google.com") &&
    !host.includes("lh3.googleusercontent.com")
  ) {
    return "";
  }

  const idFromQuery = url.searchParams.get("id");
  if (idFromQuery) return idFromQuery;

  const matchers = [
    /\/thumbnail\/d\/([^/?]+)/i,
    /\/file\/d\/([^/?]+)/i,
    /\/d\/([^/?]+)/i,
  ];

  for (const pattern of matchers) {
    const match = url.pathname.match(pattern);
    if (match && match[1]) return match[1];
  }

  return "";
}

function buildDriveThumbProxyUrl(fileId, preferredWidth) {
  const width = sanitizeThumbWidth(preferredWidth);
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`;
}

function inferImageProxyUrlFromConfig() {
  const direct = safeStr(window.TOGA_CONFIG?.imageProxyUrl).trim();
  if (direct) return direct;

  const aiChatUrl = safeStr(window.TOGA_CONFIG?.aiChatUrl).trim();
  if (!aiChatUrl) return "";

  try {
    const url = new URL(aiChatUrl, window.location.href);
    url.pathname = url.pathname.replace(/\/api\/chat\/?$/i, "/api/image-proxy");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

function buildLocalImageProxyUrl(url) {
  const proxyUrl = inferImageProxyUrlFromConfig();
  if (!proxyUrl) return url;
  return `${proxyUrl}?url=${encodeURIComponent(url)}`;
}

function normalizeRemoteImageUrl(url) {
  const fileId = extractGoogleDriveFileId(url);
  if (fileId) {
    return buildLocalImageProxyUrl(buildDriveThumbProxyUrl(fileId, 400));
  }
  return buildLocalImageProxyUrl(url);
}

function resolveImageSrc(gambar) {
  const src = safeStr(gambar).trim();
  if (!src) return PLACEHOLDER_SVG_DATA;

  // jika absolute http(s), pakai langsung
  if (isHttpUrl(src)) return normalizeRemoteImageUrl(src);

  // jika data URL (base64 / svg)
  if (/^data:/i.test(src)) return src;

  // selain itu dianggap path lokal relatif
  // contoh: "images/jahe.jpg" atau "./images/jahe.jpg"
  return src.replace(/^\.\//, "");
}

async function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: "default",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function readCache(key, ttlMs = CACHE_TTL_MS) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const age = Date.now() - Number(parsed.ts || 0);
    if (age > ttlMs) return null;
    return parsed.data;
  } catch (_) {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (_) {}
}

function clearLostTimer(id) {
  const timer = lostTimers.get(id);
  if (!timer) return;
  clearTimeout(timer);
  lostTimers.delete(id);
}

function updateActiveUI() {
  const top = activeMarkers.values().next().value;
  btnBack.style.display = "grid";
  if (!top) {
    setScanState("scanning");
    setHudText("AR TOGA • Arahkan kamera ke marker pattern");
    setDockVisible(false);
    btn.style.display = "none";
    btn.href = "#";
    setScanFrameVisible(true);
    return;
  }

  setScanState("found");
  setHudText(`Marker terdeteksi: ${top.nama}`);
  btn.href = top.detailUrl;
  setDockVisible(true);
  btn.style.display = "inline-flex";
  setScanFrameVisible(false);
}

function setMarkerFound(id, nama, detailUrl) {
  clearLostTimer(id);
  const now = Date.now();
  const lastSeenAt = markerLastFoundAt.get(id) || 0;
  markerLastFoundAt.set(id, now);
  if (activeMarkers.has(id) && now - lastSeenAt < FOUND_EVENT_THROTTLE_MS) {
    return;
  }
  activeMarkers.set(id, { id, nama, detailUrl });
  updateActiveUI();
  logDebug("markerFound", { id, nama });
}

function setMarkerLost(id) {
  clearLostTimer(id);
  const timer = setTimeout(() => {
    activeMarkers.delete(id);
    markerLastFoundAt.delete(id);
    lostTimers.delete(id);
    updateActiveUI();
    logDebug("markerLost", { id });
  }, LOST_DEBOUNCE_MS);
  lostTimers.set(id, timer);
}

function withMarkerObject(id, callback) {
  const markerEl = document.getElementById(`m_${id}`);
  if (!markerEl) return false;

  const apply = () => {
    if (!markerEl.object3D) return;
    callback(markerEl);
  };

  if (markerEl.hasLoaded) {
    apply();
  } else {
    markerEl.addEventListener("loaded", apply, { once: true });
  }

  return true;
}

function forceMarkerVisible(id) {
  return withMarkerObject(id, (markerEl) => {
    markerEl.setAttribute("visible", "true");
    markerEl.object3D.visible = true;
    markerEl.object3D.traverse((obj) => {
      obj.visible = true;
    });
  });
}

function ensureImageAsset(id, gambar) {
  const assetsEl = document.getElementById("assets");
  const assetId = `img_${id}`;
  if (document.getElementById(assetId)) return assetId;

  const imgAsset = document.createElement("img");
  imgAsset.id = assetId;

  const srcUrl = resolveImageSrc(gambar);

  // crossOrigin hanya untuk http(s)
  if (isHttpUrl(srcUrl)) imgAsset.crossOrigin = "anonymous";

  imgAsset.src = srcUrl;

  imgAsset.onload = () => {
    console.debug("Image asset loaded:", assetId, srcUrl);
    logDebug("imgLoaded", { id, srcUrl });
  };

  imgAsset.onerror = () => {
    const canRetry = isHttpUrl(srcUrl) && imgAsset.getAttribute("crossorigin");
    if (canRetry && !imgAsset.dataset.retry) {
      console.warn("Image CORS error, retry without crossorigin:", srcUrl);
      imgAsset.dataset.retry = "1";
      imgAsset.removeAttribute("crossorigin");
      imgAsset.src = srcUrl;
      return;
    }
    console.warn("Image failed:", srcUrl, "fallback placeholder");
    logDebug("imgError", { id, srcUrl });
    imgAsset.onerror = null;
    imgAsset.src = PLACEHOLDER_SVG_DATA;
  };

  assetsEl.appendChild(imgAsset);
  return assetId;
}

function makeMarker(plant) {
  const id = safeStr(plant.id).trim();
  if (!id) return null;

  const nama = safeStr(plant.nama || id);
  const gambar = safeStr(plant.gambar || "");
  const manfaat = plant.manfaat || "";
  const detailUrl = `./?id=${encodeURIComponent(id)}`;

  const marker = document.createElement("a-marker");
  marker.setAttribute("type", "pattern");
  marker.setAttribute("url", `markers/${encodeURIComponent(id)}.patt`);
  marker.setAttribute("id", `m_${id}`);
  marker.setAttribute("smooth", "true");
  marker.setAttribute("smoothCount", "10");
  marker.setAttribute("smoothTolerance", "0.01");
  marker.setAttribute("smoothThreshold", "5");

  const panel = document.createElement("a-plane");
  panel.setAttribute("position", "0 0.6 0");
  panel.setAttribute("rotation", "-90 0 0");
  panel.setAttribute("width", "2.6");
  panel.setAttribute("height", "1.5");
  panel.setAttribute("material", "color:#000; opacity:0.45");
  marker.appendChild(panel);

  const assetId = ensureImageAsset(id, gambar);

  const img = document.createElement("a-image");
  img.setAttribute("position", "-0.6 0.8 0.01");
  img.setAttribute("rotation", "-90 0 0");
  img.setAttribute("width", "1.1");
  img.setAttribute("height", "1.1");
  img.setAttribute("src", `#${assetId}`);
  marker.appendChild(img);

  const txtName = document.createElement("a-text");
  txtName.setAttribute("position", "0.037 0.8 -0.399");
  txtName.setAttribute("rotation", "-90 0 0");
  txtName.setAttribute("value", nama.toUpperCase());
  txtName.setAttribute("width", "1.4");
  txtName.setAttribute("align", "left");
  txtName.setAttribute("wrap-count", "18");
  txtName.setAttribute("color", "#FFFFFF");
  txtName.setAttribute("outline-color", "#000000");
  txtName.setAttribute("outline-width", "4");
  marker.appendChild(txtName);

  const txtInfo = document.createElement("a-text");
  txtInfo.setAttribute("position", "0.037 0.8 -0.200");
  txtInfo.setAttribute("rotation", "-90 0 0");
  txtInfo.setAttribute("value", firstBullets(manfaat, 3));
  txtInfo.setAttribute("width", "1.4");
  txtInfo.setAttribute("align", "left");
  txtInfo.setAttribute("baseline", "top");
  txtInfo.setAttribute("wrap-count", "28");
  txtInfo.setAttribute("color", "#E8F5FF");
  txtInfo.setAttribute("outline-color", "#000000");
  txtInfo.setAttribute("outline-width", "3");
  marker.appendChild(txtInfo);

  marker.addEventListener("markerFound", () =>
    setMarkerFound(id, nama, detailUrl)
  );
  marker.addEventListener("markerLost", () => setMarkerLost(id));

  return marker;
}

function setupDebugMode(plants) {
  if (!DEBUG_MODE || !debugPanel || !debugSelect) return;

  if (btnDebugToggle) {
    btnDebugToggle.style.visibility = "visible";
    btnDebugToggle.style.pointerEvents = "auto";
    btnDebugToggle.onclick = () => {
      const isOpen = debugPanel.style.display === "block";
      debugPanel.style.display = isOpen ? "none" : "block";
    };
  }
  debugPanel.style.display = "none";
  debugSelect.innerHTML = "";
  debugEvents.length = 0;
  debugLogEl.textContent = "[]";

  plants.forEach((p) => {
    const id = safeStr(p.id).trim();
    if (!id) return;
    const nama = safeStr(p.nama || id);
    const detailUrl = `./?id=${encodeURIComponent(id)}`;
    plantById.set(id, { id, nama, detailUrl });

    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = `${nama} (${id})`;
    debugSelect.appendChild(opt);
  });

  // FIX: debugZSelect -> debugSelect
  debugFoundBtn.onclick = () => {
    const id = debugSelect.value;
    const plant = plantById.get(id);
    if (!plant) return;
    setMarkerFound(plant.id, plant.nama, plant.detailUrl);
  };

  debugLostBtn.onclick = () => {
    const id = debugSelect.value;
    if (!id) return;
    setMarkerLost(id);
  };

  debugResetBtn.onclick = () => {
    Array.from(lostTimers.keys()).forEach((id) => clearLostTimer(id));
    activeMarkers.clear();
    updateActiveUI();
    logDebug("reset");
  };

  debugExportBtn.onclick = async () => {
    const json = JSON.stringify(debugEvents, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      alert("Log debug disalin ke clipboard.");
    } catch (_) {
      window.prompt("Copy JSON ini:", json);
    }
  };

  debugClearBtn.onclick = () => {
    debugEvents.length = 0;
    debugLogEl.textContent = "[]";
  };
}

function resolvePreviewPlant(plants) {
  if (!PREVIEW_TARGET) return null;

  const normalizedTarget = PREVIEW_TARGET.toLowerCase();
  if (normalizedTarget === "1" || normalizedTarget === "first") {
    return plants.find((p) => safeStr(p.id).trim()) || null;
  }

  return (
    plants.find(
      (p) => safeStr(p.id).trim().toLowerCase() === normalizedTarget
    ) || null
  );
}

function applyPreviewMode(plants) {
  const previewPlant = resolvePreviewPlant(plants);
  if (!PREVIEW_TARGET) return;

  if (!previewPlant) {
    setHudText(`AR TOGA • Preview id "${PREVIEW_TARGET}" tidak ditemukan.`);
    logDebug("previewMissing", { preview: PREVIEW_TARGET });
    return;
  }

  const id = safeStr(previewPlant.id).trim();
  const nama = safeStr(previewPlant.nama || id);
  const detailUrl = `./?id=${encodeURIComponent(id)}`;

  if (debugSelect) debugSelect.value = id;
  setMarkerFound(id, nama, detailUrl);
  forceMarkerVisible(id);
  setHudText(`Preview marker: ${nama}`);
  logDebug("previewActive", { id, nama });
}

async function loadPlants() {
  const cached = readCache(CACHE_KEY_AR_LIST);
  const cachedPlants = Array.isArray(cached)
    ? cached
    : Object.values(cached || {});
  if (cachedPlants.length > 0) {
    // AR butuh field manfaat/cara/catatan, jadi ambil dataset full.
    fetchJSON(`${API_URL}`)
      .then((dataset) => {
        const plants = Array.isArray(dataset)
          ? dataset
          : Object.values(dataset || {});
        if (plants.length > 0) writeCache(CACHE_KEY_AR_LIST, plants);
      })
      .catch(() => {});
    return { plants: cachedPlants, source: "cache" };
  }

  // AR mode: ambil data full agar text manfaat bisa tampil.
  try {
    const dataset = await fetchJSON(`${API_URL}`);
    const plants = Array.isArray(dataset)
      ? dataset
      : Object.values(dataset || {});
    if (plants.length > 0) {
      writeCache(CACHE_KEY_AR_LIST, plants);
      return { plants, source: "remote" };
    }
  } catch (error) {
    console.warn("Remote API gagal, fallback ke data lokal", error);
  }

  const local = await fetchJSON(LOCAL_DATA_URL);
  return {
    plants: Array.isArray(local) ? local : Object.values(local || {}),
    source: "local",
  };
}

async function main() {
  setScanState("loading");
  setHudText("AR TOGA • Memuat data tanaman...");
  try {
    const result = await loadPlants();
    const plants = result.plants;
    arDataSource = result.source || "remote";

    if (!plants.length) {
      setScanState("error");
      setHudText("AR TOGA • Data tanaman kosong");
      return;
    }

    plants.forEach((p) => {
      const id = safeStr(p.id).trim();
      if (id) {
        plantById.set(id, {
          id,
          nama: safeStr(p.nama || id),
          detailUrl: `./?id=${encodeURIComponent(id)}`,
        });
      }
      const marker = makeMarker(p);
      if (marker) root.appendChild(marker);
    });

    setupDebugMode(plants);
    setScanState("scanning");
    setHudText("AR TOGA • Siap. Arahkan kamera ke marker pattern.");
    applyPreviewMode(plants);
  } catch (e) {
    console.error(e);
    setScanState("error");
    if (navigator.onLine === false) {
      setHudText("AR TOGA • Offline. Gunakan data cache/lokal jika tersedia.");
      return;
    }
    setHudText("AR TOGA • Gagal memuat data (cek koneksi/API/data lokal).");
  }
}

bindAndroidCameraViewportFix();
bindGestureLock();
window.addEventListener("resize", applyArCameraViewport);
window.visualViewport?.addEventListener("resize", () => {
  lockPageScale();
  applyArCameraViewport();
});
window.visualViewport?.addEventListener("scroll", () => {
  lockPageScale();
  applyArCameraViewport();
});
window.addEventListener("orientationchange", () => {
  window.setTimeout(applyArCameraViewport, 180);
});
sceneEl?.addEventListener("loaded", () => {
  window.setTimeout(applyArCameraViewport, 180);
});

main();
