const API_URL =
  "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec";
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
const SUPPORTS_WEBP = (() => {
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
let listIntersectionObserver = null;
let filteredPlantsCache = [];
let visiblePlantsCount = LIST_PAGE_SIZE;
let lastRenderedCount = 0;
let isLoadingMore = false;
let loadingStartedAt = 0;

const $ = (id) => document.getElementById(id);

function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
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
    if (normalized.length > 0) writeCache(CACHE_KEYS.list, normalized);
  } catch (_) {}
}

async function loadPlants() {
  const cached = normalizePlantList(readCache(CACHE_KEYS.list));
  if (cached.length > 0) {
    refreshPlantsCache();
    return cached;
  }

  // Prioritaskan data lokal agar konten cepat tampil, lalu refresh remote di belakang.
  try {
    const local = await fetchLocalPlants();
    if (local.length > 0) {
      refreshPlantsCache();
      return local;
    }
  } catch (err) {
    console.warn("Data lokal gagal dibaca:", err);
  }

  try {
    const remote = await fetchRemoteJSON(`${API_URL}?mode=list`);
    const normalized = normalizePlantList(remote);
    if (normalized.length > 0) {
      writeCache(CACHE_KEYS.list, normalized);
      return normalized;
    }
  } catch (err) {
    console.warn("Remote list gagal:", err);
  }

  return [];
}

async function refreshPlantDetailCache(id) {
  try {
    const remote = await fetchRemoteJSON(
      `${API_URL}?id=${encodeURIComponent(id)}`
    );
    const normalized = normalizePlant(remote);
    if (normalized) writeCache(CACHE_KEYS.detail(id), normalized);
  } catch (_) {}
}

async function loadPlantDetail(id, fallbackMap) {
  const cached = normalizePlant(readCache(CACHE_KEYS.detail(id)));
  if (cached) {
    refreshPlantDetailCache(id);
    return cached;
  }

  const fallback = fallbackMap.get(id) || null;
  if (fallback) {
    refreshPlantDetailCache(id);
    return fallback;
  }

  try {
    const remote = await fetchRemoteJSON(
      `${API_URL}?id=${encodeURIComponent(id)}`
    );
    const normalized = normalizePlant(remote);
    if (normalized) {
      writeCache(CACHE_KEYS.detail(id), normalized);
      return normalized;
    }
  } catch (err) {
    console.warn("Remote detail gagal, fallback list map:", err);
  }

  return null;
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

function applyImageSources(img, src, { sizes, defaultWidth }) {
  const variants = getImageVariants(src);
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
  applyImageSources(img, item.gambar || "", {
    sizes: THUMB_SIZES,
    defaultWidth: 320,
  });


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

function getFilteredPlants(plants) {
  return plants.filter((item) => {
    const byJenis =
      LIST_STATE.jenis === "all" ||
      String(item.jenis || "").toLowerCase() === LIST_STATE.jenis.toLowerCase();

    if (!byJenis) return false;

    const q = LIST_STATE.query.trim().toLowerCase();
    if (!q) return true;

    const haystack = `${item.nama} ${item.nama_latin} ${item.jenis}`.toLowerCase();
    return haystack.includes(q);
  });
}

function setupListInteractions(plants) {
  const input = $("searchInput");
  const jenisWrap = $("jenisFilters");
  const viewGrid = $("viewGrid");
  const viewList = $("viewList");
  const loadMoreBtn = $("loadMoreBtn");
  const jenisOptions = getJenisOptions(plants);

  renderJenisFilters(jenisOptions);
  updateViewToggle();
  setupLoadMoreObserver();

  const applyFilter = () => {
    filteredPlantsCache = getFilteredPlants(plants);
    resetListPagination();
    renderList(filteredPlantsCache, "reset");
  };

  input.addEventListener("input", () => {
    LIST_STATE.query = input.value;
    applyFilter();
  });

  jenisWrap.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-jenis]");
    if (!btn) return;
    LIST_STATE.jenis = btn.dataset.jenis || "all";
    renderJenisFilters(jenisOptions);
    applyFilter();
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

  applyFilter();
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
    ? `Nama latin: ${plant.nama_latin}`
    : "";
  $("chipJenis").textContent = plant.jenis || "TOGA";

  setList($("manfaat"), plant.manfaat);
  $("deskripsi").innerHTML = plant.deskripsi || "";
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
}

async function main() {
  show("stateLoading");

  try {
    const plants = await loadPlants();
    const byId = new Map(plants.map((item) => [item.id, item]));
    const id = getParam("id");

    if (!id) {
      if (plants.length === 0) throw new Error("Data tanaman kosong");

      setupListInteractions(plants);
      show("stateList");
      return;
    }

    const plant = await loadPlantDetail(id, byId);
    if (!plant) throw new Error("Tanaman tidak ditemukan");

    renderDetail(plant);
    show("stateDetail");
  } catch (err) {
    console.error(err);
    show("stateError");
  }
}

main();
