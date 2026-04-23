(function () {
  const DEFAULT_API_URL =
    "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec";
  const API_URL =
    typeof window.TOGA_CONFIG?.apiUrl === "string" &&
    window.TOGA_CONFIG.apiUrl.trim()
      ? window.TOGA_CONFIG.apiUrl.trim()
      : DEFAULT_API_URL;
  const FETCH_TIMEOUT_MS = 12000;
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const CACHE_KEY_GALLERY = "toga:gallery:list:v1";
  const PAGE_SIZE = 15;
  const SKELETON_COUNT = 9;
  const SUPPORTS_INTERSECTION_OBSERVER = "IntersectionObserver" in window;
  const MIN_SPINNER_MS = 240;

  const kegiatan = [
    "Edukasi",
    "Perawatan",
    "Panen",
    "Gotong Royong",
    "Pelatihan",
    "Monitoring",
  ];
  const lokasi = ["Kebun RT 09", "Posyandu", "Balai Warga", "Halaman Masjid"];
  const petugas = ["Ibu PKK", "Karang Taruna", "Kader Kesehatan", "Relawan RT"];

  const gridEl = document.getElementById("galleryGrid");
  const modalEl = document.getElementById("previewModal");
  const closeEl = document.getElementById("previewClose");
  const loadMoreTrigger = document.getElementById("loadMoreTrigger");
  const loadMoreDone = document.getElementById("loadMoreDone");
  const previewImgEl = document.getElementById("previewImg");
  const previewTitleEl = document.getElementById("previewTitle");
  const previewMetaEl = document.getElementById("previewMeta");
  const previewDescEl = document.getElementById("previewDesc");

  if (
    !gridEl ||
    !modalEl ||
    !closeEl ||
    !loadMoreTrigger ||
    !loadMoreDone ||
    !previewImgEl ||
    !previewTitleEl ||
    !previewMetaEl ||
    !previewDescEl
  ) {
    return;
  }

  let allItems = [];
  let visibleCount = 0;
  let lastRenderedCount = 0;
  let galleryIntersectionObserver = null;
  let isLoadingMore = false;
  let loadingStartedAt = 0;

  function setSourceText(value) {
    const sourceEl = document.getElementById("gallerySourceText");
    if (!sourceEl) return;
    sourceEl.textContent = value;
  }

  function publishGalleryContext(context) {
    window.TOGA_PAGE_CONTEXT = context;
    window.dispatchEvent(new CustomEvent("toga:page-context-change", { detail: context }));
  }

  function summarizeGalleryItem(item) {
    if (!item || typeof item !== "object") return null;

    return {
      id: item.id || "",
      title: item.title || "-",
      date: item.date || "-",
      location: item.location || "-",
      person: item.person || "-",
      desc: String(item.desc || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220),
    };
  }

  function updateGalleryContext(view = "list", currentItem = null) {
    publishGalleryContext({
      page: "gallery",
      view,
      title: "Galeri Kegiatan TOGA",
      totalItems: allItems.length,
      visibleItems: allItems
        .slice(0, Math.min(4, visibleCount))
        .map(summarizeGalleryItem)
        .filter(Boolean),
      currentItem: summarizeGalleryItem(currentItem),
      suggestedPrompts:
        view === "detail" && currentItem
          ? [
              `Ringkas isi dokumentasi ${currentItem.title}.`,
              `Apa kegiatan utama pada dokumentasi ini?`,
              `Apa manfaat kegiatan ini untuk warga?`,
            ]
          : [
              "Ringkas kegiatan TOGA yang terlihat di galeri.",
              "Jenis aktivitas warga apa saja yang terdokumentasi?",
              "Apa manfaat kegiatan TOGA untuk lingkungan RT?",
            ],
    });
  }

  function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || "").trim());
  }

  function sanitizeThumbWidth(preferredWidth, fallbackWidth = 600) {
    const width = Number(preferredWidth) || fallbackWidth;
    return Math.max(120, Math.min(width, 1000));
  }

  function extractGoogleDriveFileId(value) {
    const input = String(value || "").trim();
    if (!input || !isHttpUrl(input)) return "";

    try {
      const url = new URL(input, window.location.href);
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

      const matchers = [/\/thumbnail\/d\/([^/?]+)/i, /\/file\/d\/([^/?]+)/i, /\/d\/([^/?]+)/i];

      for (const pattern of matchers) {
        const match = url.pathname.match(pattern);
        if (match && match[1]) return match[1];
      }
    } catch (_) {}

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

  function buildLocalImageProxyUrl(url) {
    const proxyUrl = inferImageProxyUrlFromConfig();
    if (!proxyUrl) return url;
    return `${proxyUrl}?url=${encodeURIComponent(url)}`;
  }

  function normalizeRemoteImageUrl(url) {
    const fileId = extractGoogleDriveFileId(url);
    if (fileId) {
      return buildLocalImageProxyUrl(buildDriveThumbProxyUrl(fileId, 600));
    }
    return url;
  }

  function normalizeDriveImageUrl(value) {
    const input = String(value || "").trim();
    if (!input) return "";

    try {
      const url = new URL(input);
      const host = url.hostname.toLowerCase();
      const idFromQuery = url.searchParams.get("id");
      const buildProxy = (id, width = 400) =>
        buildLocalImageProxyUrl(
          `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`
        );

      if (host.includes("drive.google.com")) {
        if (url.pathname.includes("/thumbnail")) {
          const id = idFromQuery;
          if (id) return buildProxy(id);
        }

        if (url.pathname.includes("/file/d/")) {
          const match = url.pathname.match(/\/file\/d\/([^/]+)/);
          if (match && match[1]) {
            return buildProxy(match[1]);
          }
        }

        const genericMatch = url.pathname.match(/\/d\/([^/]+)/);
        if (genericMatch && genericMatch[1]) {
          return buildProxy(genericMatch[1]);
        }

        if (idFromQuery) {
          return buildProxy(idFromQuery);
        }
      }

      if (
        host.includes("drive.usercontent.google.com") ||
        host.includes("docs.google.com") ||
        host.includes("lh3.googleusercontent.com")
      ) {
        if (idFromQuery) return buildProxy(idFromQuery);

        const match = url.pathname.match(/\/d\/([^/]+)/);
        if (match && match[1]) {
          return buildProxy(match[1]);
        }
      }
    } catch (_) {}

    return normalizeRemoteImageUrl(input);
  }

  function makeDummyItems(total = 24) {
    return Array.from({ length: total }, (_, i) => {
      const idx = i + 1;
      const kegiatanText = kegiatan[Math.floor(Math.random() * kegiatan.length)];
      const lokasiText = lokasi[Math.floor(Math.random() * lokasi.length)];
      const petugasText = petugas[Math.floor(Math.random() * petugas.length)];
      return {
        id: `doc-${idx}`,
        title: `${kegiatanText} TOGA #${idx}`,
        image: `https://picsum.photos/seed/toga-${idx}/600`,
        date: `2026-0${(idx % 9) + 1}-${String((idx % 27) + 1).padStart(2, "0")}`,
        location: lokasiText,
        person: petugasText,
        desc: `Dokumentasi kegiatan ${kegiatanText.toLowerCase()} TOGA bersama warga di ${lokasiText}.`,
      };
    });
  }

  function normalizeGalleryItem(raw, index = 0) {
    if (!raw || typeof raw !== "object") return null;

    const id = String(raw.id || `gallery-${index + 1}`).trim();
    const title = String(raw.title || raw.judul || "").trim();
    const image = normalizeDriveImageUrl(raw.image || raw.gambar || "");
    const date = String(raw.date || raw.tanggal || "").trim();
    const location = String(raw.location || raw.lokasi || "").trim();
    const person = String(raw.person || raw.petugas || "").trim();
    const desc = String(raw.desc || raw.deskripsi || "").trim();

    if (!image) return null;

    return {
      id,
      title: title || `Dokumentasi ${id}`,
      image,
      date: date || "-",
      location: location || "-",
      person: person || "-",
      desc: desc || "Belum ada deskripsi.",
    };
  }

  function normalizeGalleryList(payload) {
    const arr = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    return arr.map(normalizeGalleryItem).filter(Boolean);
  }

  async function fetchRemoteJSON(url) {
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

  async function refreshGalleryCache() {
    try {
      const remote = await fetchRemoteJSON(`${API_URL}?mode=gallery`);
      const normalized = normalizeGalleryList(remote);
      if (normalized.length > 0) writeCache(CACHE_KEY_GALLERY, normalized);
    } catch (_) {}
  }

  async function loadGallery() {
    const cached = normalizeGalleryList(readCache(CACHE_KEY_GALLERY));
    if (cached.length > 0) {
      setSourceText("Sumber data: cache Google Sheet");
      refreshGalleryCache();
      return cached;
    }

    try {
      const remote = await fetchRemoteJSON(`${API_URL}?mode=gallery`);
      const normalized = normalizeGalleryList(remote);
      if (normalized.length > 0) {
        writeCache(CACHE_KEY_GALLERY, normalized);
        setSourceText("Sumber data: Google Sheet");
        return normalized;
      }
    } catch (err) {
      console.warn("Load gallery dari Google Sheet gagal:", err);
    }

    setSourceText("Sumber data: dummy lokal (fallback)");
    return makeDummyItems();
  }

  function openPreview(item) {
    previewImgEl.src = item.image;
    previewTitleEl.textContent = item.title;
    previewMetaEl.textContent = `${item.date} • ${item.location} • ${item.person}`;
    previewDescEl.textContent = item.desc;
    modalEl.classList.add("is-open");
    updateGalleryContext("detail", item);
  }

  function closePreview() {
    modalEl.classList.remove("is-open");
    updateGalleryContext("list");
  }

  function renderGallery(items, mode = "reset") {
    const hasMore = visibleCount < allItems.length;

    if (mode === "reset") {
      gridEl.innerHTML = "";
      lastRenderedCount = 0;
    }

    items.forEach((item, index) => {
      if (index < lastRenderedCount) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gallery-item";
      button.setAttribute("aria-label", `Lihat detail ${item.title}`);

      const imageEl = document.createElement("img");
      imageEl.src = item.image;
      imageEl.alt = item.title;
      imageEl.loading = "lazy";
      imageEl.decoding = "async";

      button.appendChild(imageEl);
      button.addEventListener("click", () => openPreview(item));
      gridEl.appendChild(button);
    });

    lastRenderedCount = items.length;
    loadMoreTrigger.classList.toggle(
      "hidden",
      !SUPPORTS_INTERSECTION_OBSERVER || !hasMore || allItems.length === 0
    );
    loadMoreDone.classList.toggle("hidden", hasMore || allItems.length === 0);

    if (galleryIntersectionObserver) {
      if (!hasMore || allItems.length === 0) {
        galleryIntersectionObserver.disconnect();
      } else if (SUPPORTS_INTERSECTION_OBSERVER) {
        galleryIntersectionObserver.observe(loadMoreTrigger);
      }
    }
  }

  function shouldAutoLoadMore() {
    if (isLoadingMore) return false;
    if (visibleCount >= allItems.length) return false;
    if (loadMoreTrigger.classList.contains("hidden")) return false;

    const rect = loadMoreTrigger.getBoundingClientRect();
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight || 0;

    return rect.top <= viewportHeight + 120;
  }

  function syncAutoLoadAfterRender() {
    if (!SUPPORTS_INTERSECTION_OBSERVER) return;
    if (!shouldAutoLoadMore()) return;

    requestAnimationFrame(() => {
      if (shouldAutoLoadMore()) {
        loadMoreItems();
      }
    });
  }

  function renderGallerySkeleton(count = SKELETON_COUNT) {
    gridEl.innerHTML = "";
    for (let i = 0; i < count; i += 1) {
      const skeleton = document.createElement("div");
      skeleton.className = "gallery-skeleton-item";
      skeleton.setAttribute("aria-hidden", "true");
      gridEl.appendChild(skeleton);
    }
  }

  function loadMoreItems() {
    if (visibleCount >= allItems.length) return;
    if (isLoadingMore) return;

    isLoadingMore = true;
    loadingStartedAt = Date.now();
    loadMoreTrigger.classList.add("is-loading");

    visibleCount = Math.min(visibleCount + PAGE_SIZE, allItems.length);

    const finishLoad = () => {
      renderGallery(allItems.slice(0, visibleCount), "append");
      loadMoreTrigger.classList.remove("is-loading");
      isLoadingMore = false;
      updateGalleryContext("list");
      syncAutoLoadAfterRender();
    };

    requestAnimationFrame(() => {
      const elapsed = Date.now() - loadingStartedAt;
      const delay = Math.max(MIN_SPINNER_MS - elapsed, 0);
      setTimeout(finishLoad, delay);
    });
  }

  function resetGalleryPagination() {
    visibleCount = Math.min(PAGE_SIZE, allItems.length);
  }

  function setupLoadMoreObserver() {
    if (!SUPPORTS_INTERSECTION_OBSERVER) return;
    if (galleryIntersectionObserver) {
      galleryIntersectionObserver.disconnect();
    }

    galleryIntersectionObserver = new IntersectionObserver(
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

    galleryIntersectionObserver.observe(loadMoreTrigger);
  }

  closeEl.addEventListener("click", closePreview);
  modalEl.addEventListener("click", (event) => {
    if (event.target === modalEl) closePreview();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePreview();
  });

  async function main() {
    renderGallerySkeleton();
    allItems = await loadGallery();
    resetGalleryPagination();
    setupLoadMoreObserver();
    renderGallery(allItems.slice(0, visibleCount));
    updateGalleryContext("list");
    syncAutoLoadAfterRender();
  }

  main();
})();
