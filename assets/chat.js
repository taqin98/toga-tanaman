(function () {
  const root = document.body;
  if (!root || root.dataset.aiChat === "off") return;

  const aiChatUrl = String(window.TOGA_CONFIG?.aiChatUrl || "").trim();
  const mode = root.dataset.aiChatMode === "page" ? "page" : "widget";

  const STORAGE_KEY = `toga:ai-chat:${window.location.pathname}:history:v2`;
  const MAX_HISTORY = 12;
  const mountTarget =
    mode === "page" ? document.getElementById("aiChatMount") : document.body;

  if (!mountTarget) return;

  function readHistory() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed = JSON.parse(raw || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string"
      );
    } catch (_) {
      return [];
    }
  }

  function writeHistory(history) {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(history.slice(-MAX_HISTORY))
      );
    } catch (_) {}
  }

  function getPageContext() {
    const context = window.TOGA_PAGE_CONTEXT;
    if (!context || typeof context !== "object") return null;

    try {
      return JSON.parse(JSON.stringify(context));
    } catch (_) {
      return null;
    }
  }

  function getAssistantIntro(context) {
    if (!aiChatUrl) {
      return "Mode lokal aktif. Saya menjawab dari konteks halaman dan data yang tersedia di browser. Isi `aiChatUrl` untuk jawaban AI dari backend.";
    }

    if (context?.page === "ramuan") {
      return "Halo, saya fokus membantu pilihan ramuan TOGA, langkah penggunaan, dan peringatan dasar.";
    }

    if (context?.page === "tanaman") {
      return "Halo, saya bisa membantu menjelaskan manfaat, deskripsi, dan penggunaan tanaman TOGA yang sedang Anda lihat.";
    }

    if (context?.page === "gallery") {
      return "Halo, saya bisa membantu merangkum dokumentasi kegiatan TOGA yang sedang Anda lihat.";
    }

    return "Halo, saya siap membantu pertanyaan ringan seputar TOGA.";
  }

  function getSubtitle(context) {
    if (context?.page === "ramuan") {
      return aiChatUrl
        ? "Tanyakan keluhan ringan, tanaman yang relevan, langkah pembuatan, dan perhatian dasar."
        : "Mode lokal: memakai data ramuan pada halaman ini untuk memberi jawaban awal.";
    }

    if (context?.page === "tanaman") {
      return aiChatUrl
        ? "Jawaban akan menyesuaikan konteks daftar tanaman atau detail tanaman aktif."
        : "Mode lokal: jawaban memakai data tanaman yang sedang tampil di halaman.";
    }

    if (context?.page === "gallery") {
      return aiChatUrl
        ? "Jawaban akan menyesuaikan konteks kegiatan atau dokumentasi yang sedang dibuka."
        : "Mode lokal: jawaban memakai ringkasan galeri yang sedang tampil.";
    }

    return aiChatUrl
      ? "Tanya seputar tanaman, ramuan, dan penggunaan dasar."
      : "Mode lokal: jawaban dibatasi pada konteks halaman yang tersedia.";
  }

  function getSuggestions(context) {
    const prompts = Array.isArray(context?.suggestedPrompts)
      ? context.suggestedPrompts
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];

    if (prompts.length > 0) return prompts;

    return [
      "Tanaman apa yang cocok untuk batuk ringan?",
      "Bagaimana cara memakai jahe untuk keluhan perut tidak nyaman?",
      "Apa catatan dasar sebelum memakai ramuan TOGA?",
    ];
  }

  const state = {
    open: mode === "page",
    loading: false,
    history: readHistory(),
  };

  const host = document.createElement("div");
  host.className = mode === "page" ? "ai-chat ai-chat--page" : "ai-chat";

  host.innerHTML =
    mode === "page"
      ? `
    <section id="aiChatPanel" class="ai-chat__panel ai-chat__panel--page" aria-label="Asisten TOGA">
      <div class="ai-chat__head">
        <div>
          <strong class="ai-chat__title">Asisten TOGA</strong>
          <p class="ai-chat__subtitle">${getSubtitle(getPageContext())}</p>
        </div>
      </div>
      <div class="ai-chat__suggestions"></div>
      <div id="aiChatMessages" class="ai-chat__messages" aria-live="polite"></div>
      <form id="aiChatForm" class="ai-chat__composer">
        <textarea id="aiChatInput" class="ai-chat__input" rows="3" placeholder="Tulis pertanyaan tentang ramuan atau penggunaan tanaman..." maxlength="1000"></textarea>
        <div class="ai-chat__actions">
          <button id="aiChatReset" class="ai-chat__ghost" type="button">Reset</button>
          <button id="aiChatSend" class="ai-chat__send" type="submit">Kirim</button>
        </div>
      </form>
    </section>
  `
      : `
    <button id="aiChatToggle" class="ai-chat__toggle" type="button" aria-expanded="false" aria-controls="aiChatPanel">
      <span class="ai-chat__toggle-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M7 9.5h10M7 13h6m-7.5 6 2.2-3H18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5V19Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span>Chat TOGA</span>
    </button>
    <section id="aiChatPanel" class="ai-chat__panel hidden" aria-label="Asisten TOGA">
      <div class="ai-chat__head">
        <div>
          <strong class="ai-chat__title">Asisten TOGA</strong>
          <p class="ai-chat__subtitle">${getSubtitle(getPageContext())}</p>
        </div>
        <button id="aiChatClose" class="ai-chat__close" type="button" aria-label="Tutup chat">×</button>
      </div>
      <div class="ai-chat__suggestions"></div>
      <div id="aiChatMessages" class="ai-chat__messages" aria-live="polite"></div>
      <form id="aiChatForm" class="ai-chat__composer">
        <textarea id="aiChatInput" class="ai-chat__input" rows="2" placeholder="Tulis pertanyaan..." maxlength="1000"></textarea>
        <div class="ai-chat__actions">
          <button id="aiChatReset" class="ai-chat__ghost" type="button">Reset</button>
          <button id="aiChatSend" class="ai-chat__send" type="submit">Kirim</button>
        </div>
      </form>
    </section>
  `;

  mountTarget.appendChild(host);

  const toggleBtn = document.getElementById("aiChatToggle");
  const panel = document.getElementById("aiChatPanel");
  const closeBtn = document.getElementById("aiChatClose");
  const messagesEl = document.getElementById("aiChatMessages");
  const form = document.getElementById("aiChatForm");
  const input = document.getElementById("aiChatInput");
  const sendBtn = document.getElementById("aiChatSend");
  const resetBtn = document.getElementById("aiChatReset");
  const subtitleEl = host.querySelector(".ai-chat__subtitle");
  const suggestionsEl = host.querySelector(".ai-chat__suggestions");

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendMessage(role, content) {
    const item = document.createElement("article");
    item.className = `ai-chat__bubble ai-chat__bubble--${role}`;
    const body = document.createElement("p");
    body.textContent = content;
    item.appendChild(body);
    messagesEl.appendChild(item);
    scrollToBottom();
  }

  function renderMessages() {
    messagesEl.innerHTML = "";

    if (state.history.length === 0) {
      appendMessage("assistant", getAssistantIntro(getPageContext()));
      return;
    }

    state.history.forEach((item) => appendMessage(item.role, item.content));
  }

  function bindSuggestionButtons() {
    const buttons = host.querySelectorAll(".ai-chat__suggestion");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        submitMessage(button.textContent || "");
      });
    });
  }

  function renderSuggestions() {
    if (!suggestionsEl) return;

    const limit = mode === "page" ? 6 : 3;
    const suggestions = getSuggestions(getPageContext()).slice(0, limit);
    suggestionsEl.innerHTML = suggestions
      .map(
        (prompt) =>
          `<button class="ai-chat__suggestion" type="button">${prompt}</button>`
      )
      .join("");
    bindSuggestionButtons();
  }

  function refreshContextUi() {
    if (subtitleEl) {
      subtitleEl.textContent = getSubtitle(getPageContext());
    }
    renderSuggestions();
    if (state.history.length === 0) {
      renderMessages();
    }
  }

  function setOpen(nextOpen) {
    if (mode === "page") return;
    state.open = nextOpen;
    panel.classList.toggle("hidden", !nextOpen);
    toggleBtn.setAttribute("aria-expanded", String(nextOpen));
    if (nextOpen) {
      input.focus();
      scrollToBottom();
    }
  }

  function setLoading(loading) {
    state.loading = loading;
    sendBtn.disabled = loading;
    input.disabled = loading;
    sendBtn.textContent = loading ? "Memproses..." : "Kirim";
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findMatchingRemedy(context, normalizedMessage) {
    const remedies = Array.isArray(context?.remedies) ? context.remedies : [];
    let best = null;
    let bestScore = 0;

    remedies.forEach((item) => {
      const haystack = normalizeText(
        [
          item.judul,
          item.kategori,
          Array.isArray(item.tanaman) ? item.tanaman.join(" ") : "",
          item.ringkas,
          Array.isArray(item.langkah) ? item.langkah.join(" ") : "",
          item.perhatian,
        ].join(" ")
      );

      let score = 0;
      normalizedMessage.split(" ").forEach((word) => {
        if (word.length >= 3 && haystack.includes(word)) score += 1;
      });

      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    });

    return bestScore > 0 ? best : remedies[0] || null;
  }

  function buildLocalReply(message, context) {
    const normalizedMessage = normalizeText(message);

    if (context?.page === "ramuan") {
      const remedy = findMatchingRemedy(context, normalizedMessage);
      if (!remedy) {
        return "Data ramuan lokal belum tersedia. Isi `aiChatUrl` untuk memakai backend AI.";
      }

      const steps = Array.isArray(remedy.langkah)
        ? remedy.langkah.slice(0, 3).join(" ")
        : "Langkah belum tersedia.";
      const plants = Array.isArray(remedy.tanaman)
        ? remedy.tanaman.join(", ")
        : "Tanaman belum tersedia.";

      return [
        `Dari konteks halaman, contoh yang paling relevan adalah "${remedy.judul}".`,
        `Tanaman yang dipakai: ${plants}.`,
        remedy.ringkas || "",
        `Langkah singkat: ${steps}`,
        remedy.perhatian ? `Perhatian: ${remedy.perhatian}` : "",
        "Ini masih panduan umum berbasis data dummy. Jika keluhan berat atau tidak membaik, periksa ke tenaga kesehatan.",
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    if (context?.page === "tanaman") {
      const item = context.currentItem || (Array.isArray(context.visibleItems) ? context.visibleItems[0] : null);
      if (!item) {
        return "Saya belum menerima data tanaman dari halaman ini. Coba buka detail tanaman atau isi `aiChatUrl` untuk backend AI.";
      }

      const manfaat = Array.isArray(item.manfaat) ? item.manfaat.slice(0, 3).join(", ") : "-";
      const catatan = Array.isArray(item.catatan) ? item.catatan.slice(0, 2).join(" ") : "";

      return [
        `Dari konteks halaman, tanaman yang paling relevan saat ini adalah "${item.nama || "-"}".`,
        item.nama_latin ? `Nama ilmiah: ${item.nama_latin}.` : "",
        `Jenis: ${item.jenis || "TOGA"}.`,
        manfaat && manfaat !== "-" ? `Manfaat utama: ${manfaat}.` : "",
        item.deskripsi ? `Ringkasan: ${item.deskripsi}` : "",
        catatan ? `Catatan dasar: ${catatan}` : "",
        "Jika ingin jawaban yang lebih fleksibel, isi `aiChatUrl` agar chat memakai backend AI.",
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    if (context?.page === "gallery") {
      const item = context.currentItem || (Array.isArray(context.visibleItems) ? context.visibleItems[0] : null);
      if (!item) {
        return "Belum ada item galeri yang bisa diringkas dari konteks halaman.";
      }

      return [
        `Ringkasan dokumentasi: "${item.title || "-"}".`,
        `Waktu/lokasi: ${item.date || "-"} • ${item.location || "-"}.`,
        item.person ? `Pelaksana atau penanggung jawab: ${item.person}.` : "",
        item.desc ? `Deskripsi: ${item.desc}` : "",
        "Untuk jawaban yang lebih kaya, isi `aiChatUrl` agar chat memakai backend AI.",
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    return "Mode lokal aktif. Isi `aiChatUrl` di assets/config.js agar chat memakai backend AI.";
  }

  async function sendMessage(message) {
    if (!aiChatUrl) {
      const reply = buildLocalReply(message, getPageContext());
      state.history.push({ role: "assistant", content: reply });
      writeHistory(state.history);
      appendMessage("assistant", reply);
      return;
    }

    setLoading(true);

    try {
      const history = state.history.slice(-MAX_HISTORY);
      const response = await fetch(aiChatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          history,
          context: getPageContext(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Gagal menghubungi backend AI.");
      }

      const reply = String(data?.reply || "").trim() || "Tidak ada respons.";
      state.history.push({ role: "assistant", content: reply });
      writeHistory(state.history);
      appendMessage("assistant", reply);
    } catch (error) {
      appendMessage(
        "assistant",
        error?.message || "Tidak bisa terhubung ke backend AI."
      );
    } finally {
      setLoading(false);
    }
  }

  async function submitMessage(message) {
    const trimmed = String(message || "").trim();
    if (!trimmed || state.loading) return;

    state.history.push({ role: "user", content: trimmed });
    writeHistory(state.history);
    appendMessage("user", trimmed);
    input.value = "";
    await sendMessage(trimmed);
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      setOpen(!state.open);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      setOpen(false);
    });
  }

  resetBtn.addEventListener("click", () => {
    state.history = [];
    writeHistory(state.history);
    renderMessages();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitMessage(input.value);
  });

  refreshContextUi();
  renderMessages();
  window.addEventListener("toga:page-context-change", refreshContextUi);
  if (mode === "page") {
    input.focus();
  }
})();
