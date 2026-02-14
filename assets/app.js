const API_URL =
  "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec";
const LOCAL_DATA_URL = "data/plants.json";
const FETCH_TIMEOUT_MS = 12000;

const $ = (id) => document.getElementById(id);

function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

function toList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);

  if (typeof value === "string") {
    // Support: newline, ;, or | from spreadsheet
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
  // mode=list biasanya return array
  // full dataset bisa return object map {id: {...}}
  if (Array.isArray(data)) return data.map(normalizePlant).filter(Boolean);

  // kalau object map: ambil values()
  if (data && typeof data === "object") {
    return Object.values(data).map(normalizePlant).filter(Boolean);
  }

  // support struktur {data:[...]} jika suatu saat kamu ubah API
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

    // Kalau server balas bukan JSON valid, ini akan throw dan masuk fallback
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
    // Remote list
    const remote = await fetchRemoteJSON(`${API_URL}?mode=list`);
    const normalized = normalizePlantList(remote);
    if (normalized.length > 0) return normalized;
  } catch (err) {
    // Kena CORS biasanya errornya TypeError: Failed to fetch
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
  ["stateLoading", "stateError", "stateList", "stateDetail"].forEach((x) =>
    $(x).classList.add("hidden")
  );
  $(id).classList.remove("hidden");
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
      $("listWrap").innerHTML = "";
      plants.forEach((item) => $("listWrap").appendChild(makeListCard(item)));

      if (plants.length === 0) throw new Error("Data tanaman kosong");

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
