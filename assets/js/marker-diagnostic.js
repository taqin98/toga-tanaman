const MARKER_ASSET_VERSION = "2026-04-24-2";
const MARKER_MANIFEST_URL = `markers/manifest.json?v=${encodeURIComponent(MARKER_ASSET_VERSION)}`;
const STORAGE_KEY = "toga:marker-diagnostic:v1";

const diagStatusText = document.getElementById("diagStatusText");
const diagStats = document.getElementById("diagStats");
const candidateIdsEl = document.getElementById("candidateIds");
const historyListEl = document.getElementById("historyList");

const groupALabel = document.getElementById("groupALabel");
const groupAIdsEl = document.getElementById("groupAIds");
const btnOpenA = document.getElementById("btnOpenA");
const btnCopyA = document.getElementById("btnCopyA");
const btnCrashA = document.getElementById("btnCrashA");
const btnSafeA = document.getElementById("btnSafeA");

const groupBLabel = document.getElementById("groupBLabel");
const groupBIdsEl = document.getElementById("groupBIds");
const btnOpenB = document.getElementById("btnOpenB");
const btnCopyB = document.getElementById("btnCopyB");
const btnCrashB = document.getElementById("btnCrashB");
const btnSafeB = document.getElementById("btnSafeB");

const btnOpenCurrent = document.getElementById("btnOpenCurrent");
const btnCopyCurrent = document.getElementById("btnCopyCurrent");
const btnUndo = document.getElementById("btnUndo");
const btnReset = document.getElementById("btnReset");

let manifestIds = [];
let state = {
  candidates: [],
  history: [],
};

function safeStr(value) {
  return value === null || value === undefined ? "" : String(value);
}

function sortIds(ids) {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function uniqueIds(ids) {
  return Array.from(new Set(ids.map((id) => safeStr(id).trim()).filter(Boolean)));
}

function buildArUrl(ids) {
  const normalizedIds = uniqueIds(ids);
  const params = new URLSearchParams();
  params.set("debug", "1");
  params.set("ids", normalizedIds.join(","));
  return `./ar.html?${params.toString()}`;
}

function splitCandidates(ids) {
  const mid = Math.ceil(ids.length / 2);
  return {
    groupA: ids.slice(0, mid),
    groupB: ids.slice(mid),
  };
}

function createChip(text, soft = false) {
  const span = document.createElement("span");
  span.className = soft ? "chip chip-soft" : "chip";
  span.textContent = text;
  return span;
}

function renderChipList(target, ids, limit = 24) {
  target.innerHTML = "";
  if (!ids.length) {
    const empty = document.createElement("div");
    empty.className = "diag-empty";
    empty.textContent = "Tidak ada marker dalam grup ini.";
    target.appendChild(empty);
    return;
  }

  ids.slice(0, limit).forEach((id) => {
    target.appendChild(createChip(id));
  });

  if (ids.length > limit) {
    target.appendChild(createChip(`+${ids.length - limit} marker lagi`, true));
  }
}

function renderStats(totalIds, candidateCount, historyCount) {
  diagStats.innerHTML = "";
  [
    { label: "Total marker", value: totalIds },
    { label: "Kandidat aktif", value: candidateCount },
    { label: "Riwayat langkah", value: historyCount },
  ].forEach((item) => {
    const box = document.createElement("div");
    box.className = "diag-stat";
    box.innerHTML = `
      <span class="diag-stat__label">${item.label}</span>
      <span class="diag-stat__value">${item.value}</span>
    `;
    diagStats.appendChild(box);
  });
}

function renderHistory() {
  historyListEl.innerHTML = "";

  if (!state.history.length) {
    const empty = document.createElement("div");
    empty.className = "diag-empty";
    empty.textContent =
      "Belum ada langkah. Uji salah satu grup di AR, lalu tandai hasilnya di halaman ini.";
    historyListEl.appendChild(empty);
    return;
  }

  state.history
    .slice()
    .reverse()
    .forEach((entry, index) => {
      const item = document.createElement("div");
      item.className = "diag-history__item";
      item.innerHTML = `
        <p class="diag-history__title">Langkah ${state.history.length - index}: ${entry.action}</p>
        <p class="diag-history__meta">
          Kandidat sebelumnya: ${entry.before.join(", ")}<br />
          Kandidat sekarang: ${entry.after.join(", ")}
        </p>
      `;
      historyListEl.appendChild(item);
    });
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        manifestIds,
        state,
      })
    );
  } catch (_) {}
}

function resetState() {
  state = {
    candidates: [...manifestIds],
    history: [],
  };
  saveState();
  render();
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const savedManifestIds = uniqueIds(parsed?.manifestIds || []);
    const currentManifestKey = manifestIds.join("|");
    const savedManifestKey = savedManifestIds.join("|");
    if (currentManifestKey !== savedManifestKey) return false;

    const savedCandidates = uniqueIds(parsed?.state?.candidates || []);
    const savedHistory = Array.isArray(parsed?.state?.history) ? parsed.state.history : [];
    state = {
      candidates: savedCandidates.length ? savedCandidates : [...manifestIds],
      history: savedHistory,
    };
    return true;
  } catch (_) {
    return false;
  }
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    diagStatusText.textContent = successMessage;
  } catch (_) {
    window.prompt("Copy teks ini:", value);
  }
}

function updateGroupControls(ids, labelEl, idsEl, openEl, copyEl, crashEl, safeEl, groupName, otherIds) {
  renderChipList(idsEl, ids);
  labelEl.textContent = ids.length
    ? `${ids.length} marker dalam ${groupName.toLowerCase()}`
    : `${groupName} kosong`;

  const href = ids.length ? buildArUrl(ids) : "./ar.html?debug=1";
  openEl.href = href;
  openEl.setAttribute("aria-disabled", ids.length ? "false" : "true");
  openEl.style.pointerEvents = ids.length ? "auto" : "none";
  openEl.style.opacity = ids.length ? "1" : "0.6";
  copyEl.disabled = !ids.length;
  crashEl.disabled = !ids.length;
  safeEl.disabled = !ids.length || !otherIds.length;

  copyEl.onclick = () => copyText(href, `${groupName} URL disalin.`);
  crashEl.onclick = () => applyStep(`${groupName} crash`, ids);
  safeEl.onclick = () => applyStep(`${groupName} aman`, otherIds);
}

function applyStep(action, nextCandidates) {
  const before = [...state.candidates];
  const after = uniqueIds(nextCandidates);
  if (!after.length) return;

  state.history.push({
    action,
    before,
    after,
  });
  state.candidates = after;
  saveState();
  render();
}

function undoStep() {
  if (!state.history.length) return;
  const last = state.history.pop();
  state.candidates = uniqueIds(last.before);
  saveState();
  render();
}

function render() {
  const candidates = uniqueIds(state.candidates);
  const { groupA, groupB } = splitCandidates(candidates);

  renderStats(manifestIds.length, candidates.length, state.history.length);
  renderChipList(candidateIdsEl, candidates, 58);
  renderHistory();

  const currentHref = buildArUrl(candidates);
  btnOpenCurrent.href = currentHref;
  btnCopyCurrent.disabled = !candidates.length;
  btnCopyCurrent.onclick = () => copyText(currentHref, "URL kandidat saat ini disalin.");
  btnUndo.disabled = state.history.length === 0;
  btnReset.disabled = manifestIds.length === 0;

  updateGroupControls(groupA, groupALabel, groupAIdsEl, btnOpenA, btnCopyA, btnCrashA, btnSafeA, "Grup A", groupB);
  updateGroupControls(groupB, groupBLabel, groupBIdsEl, btnOpenB, btnCopyB, btnCrashB, btnSafeB, "Grup B", groupA);

  if (candidates.length === 1) {
    diagStatusText.textContent = `Kandidat tinggal 1 marker: ${candidates[0]}. Uji marker tunggal itu di AR untuk verifikasi akhir.`;
    return;
  }

  if (candidates.length === 2) {
    diagStatusText.textContent =
      "Kandidat tinggal 2 marker. Uji Grup A lalu Grup B untuk memastikan file mana yang benar-benar memicu crash.";
    return;
  }

  diagStatusText.textContent =
    "Uji salah satu grup di tab AR. Jika grup itu crash, klik tombol crash grup tersebut. Jika aman, klik tombol aman untuk mengeliminasi grup itu.";
}

async function init() {
  btnUndo.onclick = undoStep;
  btnReset.onclick = resetState;

  try {
    const response = await fetch(MARKER_MANIFEST_URL, {
      cache: "no-cache",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest = await response.json();
    const rawIds = Array.isArray(manifest)
      ? manifest
      : Array.isArray(manifest?.markers)
        ? manifest.markers
        : [];
    manifestIds = sortIds(uniqueIds(rawIds));

    if (!manifestIds.length) {
      throw new Error("Manifest marker kosong.");
    }

    if (!loadSavedState()) {
      resetState();
      return;
    }

    render();
  } catch (error) {
    diagStatusText.textContent = `Gagal memuat manifest marker: ${error.message}`;
    diagStats.innerHTML = "";
    renderChipList(candidateIdsEl, []);
    renderChipList(groupAIdsEl, []);
    renderChipList(groupBIdsEl, []);
    historyListEl.innerHTML = "";
    const item = document.createElement("div");
    item.className = "diag-empty";
    item.textContent = "Periksa server lokal, service worker, atau isi markers/manifest.json.";
    historyListEl.appendChild(item);
  }
}

init();
