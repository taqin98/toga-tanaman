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
const CACHE_KEYS = {
  list: "toga:plants:list:v1",
  detail: (id) => `toga:plants:detail:v1:${id}`,
};
const LIST_STATE = {
  query: "",
  jenis: "all",
  view: "list",
};
const LIST_PAGE_SIZE = 10;
const SUPPORTS_INTERSECTION_OBSERVER = "IntersectionObserver" in window;
const USER_AGENT =
  typeof navigator === "object" && typeof navigator.userAgent === "string"
    ? navigator.userAgent
    : "";
const IS_IOS_WEBKIT =
  /iphone|ipad|ipod/i.test(USER_AGENT) &&
  /applewebkit/i.test(USER_AGENT) &&
  !/crios|fxios|edgios|opios/i.test(USER_AGENT);
const SUPPORTS_WEBP = (() => {
  if (IS_IOS_WEBKIT) return false;
  try {
    return (
      document
        .createElement("canvas")
        .toDataURL("image/webp")
        .indexOf("data:image/webp") === 0
    );
  } catch (_) {
    return false;
  }
})();
const IMAGE_WIDTHS = [320, 640, 1000];
const THUMB_SIZES =
  "(min-width: 920px) 150px, (min-width: 640px) 120px, 80px";
const HERO_SIZES = "100vw";
const MIN_SPINNER_MS = 320;
const LIST_THUMB_ROOT_MARGIN = "220px 0px";
const LIST_THUMB_MAX_CONCURRENT = 2;
let listIntersectionObserver = null;
let listThumbObserver = null;
let pendingListThumbs = [];
let activeListThumbLoads = 0;
let filteredPlantsCache = [];
let allPlantsCache = [];
let visiblePlantsCount = LIST_PAGE_SIZE;
let lastRenderedCount = 0;
let isLoadingMore = false;
let loadingStartedAt = 0;
let hasBoundListInteractions = false;

const $ = (id) => document.getElementById(id);

function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

function buildArHref(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return "ar.html";
  return `ar.html?id=${encodeURIComponent(cleanId)}`;
}

function updateArEntryLinks(id) {
  const href = buildArHref(id);
  document
    .querySelectorAll('a[href="ar.html"], a[href="./ar.html"], #btnOpenAr')
    .forEach((link) => {
      link.setAttribute("href", href);
    });
}

function toList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);

  if (typeof value === "string") {
    return value
      .split(/\r?\n|;|\|/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizePlant(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = String(raw.id || "").trim();
  if (!id) return null;

  return {
    id,
    nama: raw.nama || "-",
    nama_latin: raw.nama_latin || "",
    jenis: raw.jenis || "TOGA",
    gambar: raw.gambar || "",
    manfaat: toList(raw.manfaat),
    deskripsi: typeof raw.deskripsi === "string" ? raw.deskripsi : "",
    catatan: toList(raw.catatan),
  };
}

function normalizePlantList(data) {
  if (Array.isArray(data)) return data.map(normalizePlant).filter(Boolean);

  if (data && typeof data === "object") {
    return Object.values(data).map(normalizePlant).filter(Boolean);
  }

  const maybeArr = Array.isArray(data?.data) ? data.data : [];
  return maybeArr.map(normalizePlant).filter(Boolean);
}

async function fetchRemoteJSON(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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

async function fetchLocalPlants() {
  const res = await fetch(LOCAL_DATA_URL, { cache: "default" });
  if (!res.ok) throw new Error("Gagal membaca data lokal");
  const json = await res.json();
  return normalizePlantList(json);
}

async function refreshPlantsCache() {
  try {
    const remote = await fetchRemoteJSON(`${API_URL}?mode=list`);
    const normalized = normalizePlantList(remote);
    if (normalized.length > 0) {
      writeCache(CACHE_KEYS.list, normalized);
      return normalized;
    }
  } catch (_) {}

  return [];
}

async function loadPlants() {
  const cached = normalizePlantList(readCache(CACHE_KEYS.list));
  if (cached.length > 0) {
    return { plants: cached, source: "cache", shouldRefresh: true };
  }

  // Prioritaskan data lokal agar konten cepat tampil, lalu refresh remote di belakang.
  try {
    const local = await fetchLocalPlants();
    if (local.length > 0) {
      return { plants: local, source: "local", shouldRefresh: true };
    }
  } catch (err) {
    console.warn("Data lokal gagal dibaca:", err);
  }

  try {
    const remote = await fetchRemoteJSON(`${API_URL}?mode=list`);
    const normalized = normalizePlantList(remote);
    if (normalized.length > 0) {
      writeCache(CACHE_KEYS.list, normalized);
      return { plants: normalized, source: "remote", shouldRefresh: false };
    }
  } catch (err) {
    console.warn("Remote list gagal:", err);
  }

  return { plants: [], source: "empty", shouldRefresh: false };
}

async function refreshPlantDetailCache(id) {
  try {
    const remote = await fetchRemoteJSON(
      `${API_URL}?id=${encodeURIComponent(id)}`
    );
    const normalized = normalizePlant(remote);
    if (normalized) {
      writeCache(CACHE_KEYS.detail(id), normalized);
      return normalized;
    }
  } catch (_) {}
  return null;
}

async function loadPlantDetail(id, fallbackMap) {
  const cached = normalizePlant(readCache(CACHE_KEYS.detail(id)));
  if (cached) {
    refreshPlantDetailCache(id);
    return { plant: cached, source: "cache" };
  }

  const fallback = fallbackMap.get(id) || null;
  if (fallback) {
    refreshPlantDetailCache(id);
    return { plant: fallback, source: "list-fallback" };
  }

  try {
    const remote = await fetchRemoteJSON(
      `${API_URL}?id=${encodeURIComponent(id)}`
    );
    const normalized = normalizePlant(remote);
    if (normalized) {
      writeCache(CACHE_KEYS.detail(id), normalized);
      return { plant: normalized, source: "remote" };
    }
  } catch (err) {
    console.warn("Remote detail gagal, fallback list map:", err);
  }

  return { plant: null, source: "empty" };
}

function setList(el, items) {
  el.innerHTML = "";
  (items || []).forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    el.appendChild(li);
  });
}

function show(id) {
  ["stateLoading", "stateError", "stateList", "stateDetail"].forEach((x) => {
    const el = $(x);
    el.classList.add("hidden");
    el.classList.remove("state-enter");
  });

  const target = $(id);
  target.classList.remove("hidden");
  // Restart animation each state transition.
  void target.offsetWidth;
  target.classList.add("state-enter");

  if (id !== "stateList") {
    $("loadMoreTrigger").classList.add("hidden");
    $("loadMoreActions").classList.add("hidden");
  }
}

function resolveImg(src) {
  if (!src) return "";
  return String(src).replace(/^\.\//, "");
}

function buildSrcset(base, ext, widths) {
  return widths.map((w) => `${base}-${w}.${ext} ${w}w`).join(", ");
}

function buildWebpSrcset(base, widths) {
  return widths.map((w) => `${base}-${w}.webp ${w}w`).join(", ");
}

function getImageVariants(src) {
  const clean = resolveImg(src);
  if (!clean) return { src: "" };
  if (/^https?:\/\//i.test(clean)) return { src: clean };
  if (!clean.startsWith("images/")) return { src: clean };

  const match = clean.match(/^(.*)\.(jpg|jpeg|png)$/i);
  if (!match) return { src: clean };

  const base = match[1];
  const ext = match[2].toLowerCase();
  return {
    src: clean,
    base,
    ext,
    srcset: buildSrcset(base, ext, IMAGE_WIDTHS),
    webpSrcset: buildWebpSrcset(base, IMAGE_WIDTHS),
  };
}

function getListThumbWidth() {
  return LIST_STATE.view === "grid" ? 240 : 160;
}

function createThumbPlaceholder(width = 320, height = 240) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" fill="#edf5ea"/>
      <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="18" fill="#dbead7"/>
      <circle cx="${Math.round(width * 0.34)}" cy="${Math.round(height * 0.42)}" r="18" fill="#c3ddbd"/>
      <path d="M72 ${height - 70}l42-42 30 30 48-56 56 68z" fill="#b1d2aa"/>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const LIST_THUMB_PLACEHOLDER = createThumbPlaceholder();

function sanitizeThumbWidth(preferredWidth, fallbackWidth = 240) {
  const width = Number(preferredWidth) || fallbackWidth;
  return Math.max(120, Math.min(width, 1000));
}

function extractGoogleDriveFileId(src) {
  const clean = resolveImg(src);
  if (!clean || !/^https?:\/\//i.test(clean)) return "";

  let url;
  try {
    url = new URL(clean, window.location.href);
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
  const direct = String(window.TOGA_CONFIG?.imageProxyUrl || "").trim();
  if (direct) return direct;

  const aiChatUrl = String(window.TOGA_CONFIG?.aiChatUrl || "").trim();
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

function buildImageProxyUrl(src) {
  const proxyUrl = inferImageProxyUrlFromConfig();
  if (!proxyUrl) return src;
  return `${proxyUrl}?url=${encodeURIComponent(src)}`;
}

function optimizeDriveThumbnail(src, preferredWidth) {
  const clean = resolveImg(src);
  const fileId = extractGoogleDriveFileId(clean);
  if (!fileId) return clean;
  return buildImageProxyUrl(buildDriveThumbProxyUrl(fileId, preferredWidth));
}

function applyImageSources(img, src, { sizes, defaultWidth }) {
  const variants = getImageVariants(optimizeDriveThumbnail(src, defaultWidth));
  if (!variants.base) {
    img.src = variants.src || "";
    img.srcset = "";
    if (sizes) {
      img.sizes = sizes;
    } else {
      img.removeAttribute("sizes");
    }
    return;
  }

  const fallbackWidth = defaultWidth || IMAGE_WIDTHS[1];
  if (SUPPORTS_WEBP) {
    img.src = `${variants.base}-${fallbackWidth}.webp`;
    img.srcset = variants.webpSrcset;
  } else {
    img.src = `${variants.base}-${fallbackWidth}.${variants.ext}`;
    img.srcset = variants.srcset;
  }
  if (sizes) {
    img.sizes = sizes;
  } else {
    img.removeAttribute("sizes");
  }
}

function setDeferredImageSources(img, src, { sizes, defaultWidth }) {
  const optimizedSrc = optimizeDriveThumbnail(src, defaultWidth);
  const variants = getImageVariants(optimizedSrc);
  const fallbackWidth = defaultWidth || IMAGE_WIDTHS[1];
  let resolvedSrc = "";
  let resolvedSrcset = "";

  if (!variants.base) {
    resolvedSrc = variants.src || "";
  } else if (SUPPORTS_WEBP) {
    resolvedSrc = `${variants.base}-${fallbackWidth}.webp`;
    resolvedSrcset = variants.webpSrcset;
  } else {
    resolvedSrc = `${variants.base}-${fallbackWidth}.${variants.ext}`;
    resolvedSrcset = variants.srcset;
  }

  if (resolvedSrc) {
    img.dataset.src = resolvedSrc;
  } else {
    delete img.dataset.src;
  }

  if (resolvedSrcset) {
    img.dataset.srcset = resolvedSrcset;
  } else {
    delete img.dataset.srcset;
  }

  if (sizes) {
    img.dataset.sizes = sizes;
  } else {
    delete img.dataset.sizes;
  }
}

function finishListThumbLoad(img, failed = false) {
  activeListThumbLoads = Math.max(activeListThumbLoads - 1, 0);
  img.dataset.loaded = "1";
  delete img.dataset.loading;
  delete img.dataset.queued;

  if (failed) {
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.src = LIST_THUMB_PLACEHOLDER;
  }

  flushListThumbQueue();
}

function hydrateDeferredImage(img) {
  if (!img || img.tagName !== "IMG") return false;
  if (!img.isConnected || img.dataset.loaded === "1" || img.dataset.loading === "1") {
    return false;
  }

  const src = img.dataset.src || "";
  if (!src) {
    img.dataset.loaded = "1";
    delete img.dataset.queued;
    return false;
  }

  img.dataset.loading = "1";
  img.addEventListener("load", () => finishListThumbLoad(img), { once: true });
  img.addEventListener("error", () => finishListThumbLoad(img, true), {
    once: true,
  });

  if (img.dataset.srcset) {
    img.srcset = img.dataset.srcset;
  } else {
    img.removeAttribute("srcset");
  }

  if (img.dataset.sizes) {
    img.sizes = img.dataset.sizes;
  } else {
    img.removeAttribute("sizes");
  }

  img.src = src;
  return true;
}

function flushListThumbQueue() {
  while (
    activeListThumbLoads < LIST_THUMB_MAX_CONCURRENT &&
    pendingListThumbs.length > 0
  ) {
    const nextImg = pendingListThumbs.shift();
    if (!nextImg || !nextImg.isConnected || nextImg.dataset.loaded === "1") {
      continue;
    }
    if (!hydrateDeferredImage(nextImg)) continue;
    activeListThumbLoads += 1;
  }
}

function ensureListThumbObserver() {
  if (!SUPPORTS_INTERSECTION_OBSERVER || listThumbObserver) return;

  listThumbObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        listThumbObserver.unobserve(img);
        if (img.dataset.queued === "1" || img.dataset.loaded === "1") return;
        img.dataset.queued = "1";
        pendingListThumbs.push(img);
      });
      flushListThumbQueue();
    },
    {
      root: null,
      rootMargin: LIST_THUMB_ROOT_MARGIN,
      threshold: 0.01,
    }
  );
}

function registerListThumb(img) {
  if (!img || img.tagName !== "IMG") return;
  if (!img.dataset.src) return;

  if (!SUPPORTS_INTERSECTION_OBSERVER) {
    hydrateDeferredImage(img);
    return;
  }

  ensureListThumbObserver();
  listThumbObserver.observe(img);
}

function makeListCard(item) {
  const a = document.createElement("a");
  a.href = `./?id=${encodeURIComponent(item.id)}`;
  a.className = "card item";

  const img = document.createElement("img");
  img.className = "thumb";
  img.alt = `Foto ${item.nama || ""}`;
  img.width = 320;
  img.height = 240;
  img.loading = "lazy";
  img.decoding = "async";
  img.fetchPriority = "low";
  img.src = LIST_THUMB_PLACEHOLDER;
  setDeferredImageSources(img, item.gambar || "", {
    sizes: THUMB_SIZES,
    defaultWidth: getListThumbWidth(),
  });
  registerListThumb(img);


  const wrap = document.createElement("div");
  const title = document.createElement("h4");
  title.textContent = item.nama || "-";

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${item.jenis || ""} • ${item.nama_latin || ""}`;

  wrap.appendChild(title);
  wrap.appendChild(meta);
  a.appendChild(img);
  a.appendChild(wrap);

  return a;
}

function renderList(items, mode = "reset") {
  const listWrap = $("listWrap");
  const listCount = $("listCount");
  const listEmpty = $("listEmpty");
  const loadMoreTrigger = $("loadMoreTrigger");
  const loadMoreActions = $("loadMoreActions");
  const loadMoreBtn = $("loadMoreBtn");
  const loadMoreDone = $("loadMoreDone");
  const totalItems = items.length;
  const visibleItems = items.slice(0, visiblePlantsCount);
  const hasMore = visibleItems.length < totalItems;

  if (mode === "reset") {
    listWrap.innerHTML = "";
    lastRenderedCount = 0;
  }

  listWrap.classList.toggle("gallery", LIST_STATE.view === "grid");
  listWrap.classList.toggle("list", LIST_STATE.view === "list");

  visibleItems.forEach((item, index) => {
    if (index < lastRenderedCount) return;
    const card = makeListCard(item);
    if (mode === "reset") {
      card.style.animation = "fadeUp 0.35s ease both";
      card.style.animationDelay = `${Math.min(index * 45, 320)}ms`;
    }
    listWrap.appendChild(card);
  });

  lastRenderedCount = visibleItems.length;

  listCount.textContent = `Menampilkan ${visibleItems.length} dari ${totalItems} tanaman`;
  listEmpty.classList.toggle("hidden", totalItems > 0);
  loadMoreTrigger.classList.toggle(
    "hidden",
    !SUPPORTS_INTERSECTION_OBSERVER || !hasMore || totalItems === 0
  );
  loadMoreActions.classList.toggle("hidden", totalItems === 0);
  loadMoreBtn.classList.toggle("hidden", !hasMore);
  loadMoreDone.classList.toggle("hidden", hasMore || totalItems === 0);

  if (listIntersectionObserver) {
    if (!hasMore || totalItems === 0) {
      listIntersectionObserver.disconnect();
    } else if (SUPPORTS_INTERSECTION_OBSERVER) {
      listIntersectionObserver.observe(loadMoreTrigger);
    }
  }
}

function loadMoreItems() {
  if (visiblePlantsCount >= filteredPlantsCache.length) return;
  if (isLoadingMore) return;
  isLoadingMore = true;
  loadingStartedAt = Date.now();
  const loadMoreTrigger = $("loadMoreTrigger");
  const loadMoreBtn = $("loadMoreBtn");
  loadMoreTrigger.classList.add("is-loading");
  loadMoreBtn.disabled = true;

  visiblePlantsCount = Math.min(
    visiblePlantsCount + LIST_PAGE_SIZE,
    filteredPlantsCache.length
  );

  const finishLoad = () => {
    renderList(filteredPlantsCache, "append");
    loadMoreTrigger.classList.remove("is-loading");
    loadMoreBtn.disabled = false;
    isLoadingMore = false;
  };

  requestAnimationFrame(() => {
    const elapsed = Date.now() - loadingStartedAt;
    const delay = Math.max(MIN_SPINNER_MS - elapsed, 0);
    setTimeout(finishLoad, delay);
  });
}

function resetListPagination() {
  visiblePlantsCount = LIST_PAGE_SIZE;
}

function setupLoadMoreObserver() {
  if (!SUPPORTS_INTERSECTION_OBSERVER) return;
  if (listIntersectionObserver) {
    listIntersectionObserver.disconnect();
  }

  const trigger = $("loadMoreTrigger");
  listIntersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadMoreItems();
        }
      });
    },
    {
      root: null,
      rootMargin: "120px 0px",
      threshold: 0.05,
    }
  );

  listIntersectionObserver.observe(trigger);
}

function updateViewToggle() {
  $("viewGrid").classList.toggle("is-active", LIST_STATE.view === "grid");
  $("viewList").classList.toggle("is-active", LIST_STATE.view === "list");
}

function getJenisOptions(plants) {
  const set = new Set();
  plants.forEach((item) => {
    const val = String(item.jenis || "").trim();
    if (val) set.add(val);
  });
  return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b, "id"))];
}

function renderJenisFilters(options) {
  const wrap = $("jenisFilters");
  wrap.innerHTML = "";

  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-chip";
    btn.dataset.jenis = opt;
    btn.textContent = opt === "all" ? "Semua" : opt;
    btn.classList.toggle("is-active", LIST_STATE.jenis === opt);
    wrap.appendChild(btn);
  });
}

function arePlantListsEqual(left, right) {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}

function syncPlantListUI(plants, { preserveVisibleCount = false } = {}) {
  const nextPlants = Array.isArray(plants) ? plants : [];
  const previousVisibleCount = visiblePlantsCount;
  const jenisOptions = getJenisOptions(nextPlants);

  allPlantsCache = nextPlants;

  if (!jenisOptions.includes(LIST_STATE.jenis)) {
    LIST_STATE.jenis = "all";
  }

  renderJenisFilters(jenisOptions);
  updateViewToggle();

  filteredPlantsCache = getFilteredPlants(nextPlants);

  if (preserveVisibleCount) {
    visiblePlantsCount = Math.max(
      LIST_PAGE_SIZE,
      Math.min(previousVisibleCount, filteredPlantsCache.length || LIST_PAGE_SIZE)
    );
  } else {
    resetListPagination();
  }

  renderList(filteredPlantsCache, "reset");
  updatePlantListContext(nextPlants);
}

function getFilteredPlants(plants) {
  return plants.filter((item) => {
    const byJenis =
      LIST_STATE.jenis === "all" ||
      String(item.jenis || "").toLowerCase() === LIST_STATE.jenis.toLowerCase();

    if (!byJenis) return false;

    const q = LIST_STATE.query.trim().toLowerCase();
    if (!q) return true;

    const haystack = `${item.nama} ${item.nama_latin} ${item.deskripsi} ${item.manfaat.join(' ')} ${item.jenis}`.toLowerCase();
    return haystack.includes(q);
  });
}

function summarizePlantForContext(plant) {
  if (!plant || typeof plant !== "object") return null;

  return {
    id: plant.id || "",
    nama: plant.nama || "-",
    nama_latin: plant.nama_latin || "",
    jenis: plant.jenis || "TOGA",
    manfaat: Array.isArray(plant.manfaat) ? plant.manfaat.slice(0, 4) : [],
    catatan: Array.isArray(plant.catatan) ? plant.catatan.slice(0, 3) : [],
    deskripsi: String(plant.deskripsi || "").replace(/\s+/g, " ").trim().slice(0, 240),
  };
}

function publishPageContext(context) {
  window.TOGA_PAGE_CONTEXT = context;
  window.dispatchEvent(new CustomEvent("toga:page-context-change", { detail: context }));
}

function updatePlantListContext(plants) {
  publishPageContext({
    page: "tanaman",
    view: "list",
    title: "Daftar Tanaman TOGA",
    totalItems: plants.length,
    filteredItems: filteredPlantsCache.length,
    selectedJenis: LIST_STATE.jenis,
    query: LIST_STATE.query.trim(),
    visibleItems: filteredPlantsCache
      .slice(0, Math.min(5, visiblePlantsCount))
      .map(summarizePlantForContext)
      .filter(Boolean),
    suggestedPrompts: [
      "Tanaman apa yang cocok untuk batuk ringan?",
      "Jelaskan manfaat kunyit dan jahe secara singkat.",
      "Bagaimana cara memakai daun sirih dengan aman?",
    ],
  });
}

function updatePlantDetailContext(plant) {
  publishPageContext({
    page: "tanaman",
    view: "detail",
    title: plant.nama || "Detail tanaman TOGA",
    currentItem: summarizePlantForContext(plant),
    suggestedPrompts: [
      `Apa manfaat utama ${plant.nama || "tanaman ini"}?`,
      `Bagaimana cara memakai ${plant.nama || "tanaman ini"} untuk penggunaan sederhana?`,
      `Apa catatan dasar sebelum memakai ${plant.nama || "tanaman ini"}?`,
    ],
  });
}

function setupListInteractions(plants) {
  const input = $("searchInput");
  const jenisWrap = $("jenisFilters");
  const viewGrid = $("viewGrid");
  const viewList = $("viewList");
  const loadMoreBtn = $("loadMoreBtn");

  if (!hasBoundListInteractions) {
    setupLoadMoreObserver();

    input.addEventListener("input", () => {
      LIST_STATE.query = input.value;
      syncPlantListUI(allPlantsCache);
    });

    jenisWrap.addEventListener("click", (event) => {
      const btn = event.target.closest("button[data-jenis]");
      if (!btn) return;
      LIST_STATE.jenis = btn.dataset.jenis || "all";
      syncPlantListUI(allPlantsCache);
    });

    viewGrid.addEventListener("click", () => {
      LIST_STATE.view = "grid";
      updateViewToggle();
      renderList(filteredPlantsCache, "reset");
    });

    viewList.addEventListener("click", () => {
      LIST_STATE.view = "list";
      updateViewToggle();
      renderList(filteredPlantsCache, "reset");
    });

    loadMoreBtn.addEventListener("click", () => {
      loadMoreItems();
    });

    hasBoundListInteractions = true;
  }

  input.value = LIST_STATE.query;
  syncPlantListUI(plants);
}

function sanitizeRichText(rawHtml) {
  const source = String(rawHtml || "");
  if (!source.trim()) return "";

  const allowedTags = new Set([
    "P",
    "BR",
    "STRONG",
    "EM",
    "B",
    "I",
    "U",
    "UL",
    "OL",
    "LI",
    "A",
  ]);
  const template = document.createElement("template");
  template.innerHTML = source;

  const cleanNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return document.createTextNode("");
    }

    const tag = node.tagName.toUpperCase();
    if (!allowedTags.has(tag)) {
      const fragment = document.createDocumentFragment();
      Array.from(node.childNodes).forEach((child) => {
        const cleanChild = cleanNode(child);
        if (cleanChild) fragment.appendChild(cleanChild);
      });
      return fragment;
    }

    const cleanEl = document.createElement(tag.toLowerCase());
    if (tag === "A") {
      const href = String(node.getAttribute("href") || "").trim();
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        cleanEl.setAttribute("href", href);
      }
      cleanEl.setAttribute("target", "_blank");
      cleanEl.setAttribute("rel", "noopener noreferrer");

      const title = String(node.getAttribute("title") || "").trim();
      if (title) cleanEl.setAttribute("title", title);
    }

    Array.from(node.childNodes).forEach((child) => {
      const cleanChild = cleanNode(child);
      if (cleanChild) cleanEl.appendChild(cleanChild);
    });
    return cleanEl;
  };

  const out = document.createDocumentFragment();
  Array.from(template.content.childNodes).forEach((node) => {
    const clean = cleanNode(node);
    if (clean) out.appendChild(clean);
  });

  const wrap = document.createElement("div");
  wrap.appendChild(out);
  return wrap.innerHTML;
}

function renderDetail(plant) {
  const img = $("img");
  img.decoding = "async";
  img.fetchPriority = "high";
  img.loading = "eager";
  img.width = 1000;
  img.height = 600;
  applyImageSources(img, plant.gambar || "", {
    sizes: HERO_SIZES,
    defaultWidth: 1000,
  });
  $("nama").textContent = plant.nama || "-";
  $("latin").textContent = plant.nama_latin
    ? `Nama Ilmiah: ${plant.nama_latin}`
    : "";
  $("chipJenis").textContent = plant.jenis || "TOGA";

  setList($("manfaat"), plant.manfaat);
  $("deskripsi").innerHTML = sanitizeRichText(plant.deskripsi || "");
  setList($("catatan"), plant.catatan);

  $("btnShare").onclick = async () => {
    const url = window.location.href;
    const text = `Info TOGA: ${plant.nama} (RT 09)`;

    if (navigator.share) {
      try {
        await navigator.share({ title: plant.nama, text, url });
      } catch (_) {}
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      alert("Link sudah disalin.");
    } catch (_) {
      window.prompt("Salin link ini:", url);
    }
  };

  updatePlantDetailContext(plant);
}

function setDataSourceNotice(source) {
  const el = $("dataSourceNotice");
  if (!el) return;

  el.classList.remove("hidden", "is-warning", "is-danger");
  if (source === "remote") {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }

  if (source === "cache") {
    el.textContent = "Menampilkan data dari cache lokal perangkat.";
    el.classList.add("is-warning");
    return;
  }

  if (source === "local" || source === "list-fallback") {
    el.textContent =
      "Menampilkan data fallback lokal. Beberapa informasi bisa belum terbaru.";
    el.classList.add("is-warning");
    return;
  }

  el.textContent = "Data tidak tersedia dari server maupun cache lokal.";
  el.classList.add("is-danger");
}

function setErrorState(title, desc) {
  const titleEl = $("stateErrorTitle");
  const descEl = $("stateErrorDesc");
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.innerHTML = desc;
}

async function main() {
  show("stateLoading");

  try {
    const listResult = await loadPlants();
    const plants = listResult.plants;
    setDataSourceNotice(listResult.source);
    const byId = new Map(plants.map((item) => [item.id, item]));
    const id = getParam("id");
    updateArEntryLinks(id);

    if (!id) {
      if (plants.length === 0) throw new Error("Data tanaman kosong");

      setupListInteractions(plants);
      show("stateList");

      if (listResult.shouldRefresh) {
        refreshPlantsCache().then((freshPlants) => {
          if (!Array.isArray(freshPlants) || freshPlants.length === 0) return;
          if (arePlantListsEqual(freshPlants, allPlantsCache)) {
            setDataSourceNotice("remote");
            return;
          }

          syncPlantListUI(freshPlants, { preserveVisibleCount: true });
          setDataSourceNotice("remote");
        });
      }

      return;
    }

    const detailResult = await loadPlantDetail(id, byId);
    const plant = detailResult.plant;
    setDataSourceNotice(detailResult.source);
    if (!plant) throw new Error("Tanaman tidak ditemukan");

    updateArEntryLinks(plant.id || id);
    renderDetail(plant);
    show("stateDetail");

    refreshPlantDetailCache(id).then((fresh) => {
      if (!fresh) return;
      const hasMissing =
        !plant.deskripsi ||
        (Array.isArray(plant.manfaat) && plant.manfaat.length === 0);
      const hasFresh =
        fresh.deskripsi ||
        (Array.isArray(fresh.manfaat) && fresh.manfaat.length > 0);
      if (hasMissing && hasFresh) {
        renderDetail(fresh);
      }
      setDataSourceNotice("remote");
    });
  } catch (err) {
    console.error(err);
    if (navigator.onLine === false) {
      setErrorState(
        "Anda sedang offline",
        "Koneksi internet tidak tersedia. Coba lagi saat online, atau buka halaman yang sudah tersimpan di cache."
      );
      setDataSourceNotice("empty");
    } else if (String(err && err.message || "").toLowerCase().includes("tidak ditemukan")) {
      setErrorState(
        "Tanaman tidak ditemukan",
        "Cek kembali QR Code atau parameter <code>?id=...</code>."
      );
    } else {
      setErrorState(
        "Gagal memuat data tanaman",
        "Terjadi kendala saat mengambil data. Coba muat ulang halaman atau periksa API."
      );
    }
    show("stateError");
  }
}

main();
