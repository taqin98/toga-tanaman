const API_URL =
  "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec";
const LOCAL_DATA_URL = "data/plants.json";
const FETCH_TIMEOUT_MS = 12000;
const LIST_STATE = {
  query: "",
  jenis: "all",
  view: "grid",
};

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
    cara_pakai: toList(raw.cara_pakai),
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
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLocalPlants() {
  const res = await fetch(LOCAL_DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Gagal membaca data lokal");
  const json = await res.json();
  return normalizePlantList(json);
}

async function loadPlants() {
  try {
    const remote = await fetchRemoteJSON(`${API_URL}?mode=list`);
    const normalized = normalizePlantList(remote);
    if (normalized.length > 0) return normalized;
  } catch (err) {
    console.warn("Remote list gagal, fallback lokal:", err);
  }

  return await fetchLocalPlants();
}

async function loadPlantDetail(id, fallbackMap) {
  try {
    const remote = await fetchRemoteJSON(
      `${API_URL}?id=${encodeURIComponent(id)}`
    );
    const normalized = normalizePlant(remote);
    if (normalized) return normalized;
  } catch (err) {
    console.warn("Remote detail gagal, fallback list map:", err);
  }

  return fallbackMap.get(id) || null;
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
}

function makeListCard(item) {
  const a = document.createElement("a");
  a.href = `./?id=${encodeURIComponent(item.id)}`;
  a.className = "card item";

  const img = document.createElement("img");
  img.className = "thumb";
  img.src = item.gambar || "";
  img.alt = `Foto ${item.nama || ""}`;

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

function renderList(items) {
  const listWrap = $("listWrap");
  const listCount = $("listCount");
  const listEmpty = $("listEmpty");
  const compactMode = LIST_STATE.view === "compact";

  listWrap.innerHTML = "";
  listWrap.classList.toggle("compact", compactMode);

  items.forEach((item, index) => {
    const card = makeListCard(item);
    card.style.animation = "fadeUp 0.35s ease both";
    card.style.animationDelay = `${Math.min(index * 45, 320)}ms`;
    listWrap.appendChild(card);
  });

  listCount.textContent = `${items.length} tanaman`;
  listEmpty.classList.toggle("hidden", items.length > 0);
}

function updateViewToggle() {
  $("viewCard").classList.toggle("is-active", LIST_STATE.view === "grid");
  $("viewCompact").classList.toggle("is-active", LIST_STATE.view === "compact");
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
  const viewCard = $("viewCard");
  const viewCompact = $("viewCompact");
  const jenisOptions = getJenisOptions(plants);

  renderJenisFilters(jenisOptions);
  updateViewToggle();

  const applyFilter = () => {
    renderList(getFilteredPlants(plants));
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

  viewCard.addEventListener("click", () => {
    LIST_STATE.view = "grid";
    updateViewToggle();
    applyFilter();
  });

  viewCompact.addEventListener("click", () => {
    LIST_STATE.view = "compact";
    updateViewToggle();
    applyFilter();
  });

  applyFilter();
}

function renderDetail(plant) {
  $("img").src = plant.gambar || "";
  $("nama").textContent = plant.nama || "-";
  $("latin").textContent = plant.nama_latin
    ? `Nama latin: ${plant.nama_latin}`
    : "";
  $("chipJenis").textContent = plant.jenis || "TOGA";

  setList($("manfaat"), plant.manfaat);
  setList($("cara"), plant.cara_pakai);
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
