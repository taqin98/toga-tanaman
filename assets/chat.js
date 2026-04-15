(function () {
  const root = document.body;
  if (!root || root.dataset.aiChat === "off") return;
  if (root.dataset.aiChatMode !== "page") return;

  const aiChatUrl = String(window.TOGA_CONFIG?.aiChatUrl || "").trim();
  const apiUrl = String(window.TOGA_CONFIG?.apiUrl || "").trim();
  const STORAGE_KEY = `toga:ai-chat:${window.location.pathname}:history:v2`;
  const MAX_HISTORY = 12;
  const mountTarget = document.getElementById("aiChatMount");

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

  function buildRequestContext() {
    return getPageContext() || {};
  }

  function buildDataSource() {
    return apiUrl
      ? {
          url: apiUrl,
          mode: "list",
        }
      : null;
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
    loading: false,
    history: readHistory(),
  };

  const host = document.createElement("div");
  host.className = "ai-chat ai-chat--page";

  host.innerHTML = `
    <section class="ai-chat__panel ai-chat__panel--page" aria-label="Asisten Ai TOGA">
      <div class="ai-chat__head">
        <div>
          <strong class="ai-chat__title">Asisten Ai TOGA</strong>
          <p class="ai-chat__subtitle">${getSubtitle(getPageContext())}</p>
        </div>
      </div>
      <div class="ai-chat__suggestions"></div>
      <div class="ai-chat__messages" aria-live="polite"></div>
      <form class="ai-chat__composer">
        <textarea class="ai-chat__input" rows="3" placeholder="Tulis pertanyaan tentang ramuan atau penggunaan tanaman..." maxlength="1000"></textarea>
        <div class="ai-chat__actions">
          <button class="ai-chat__ghost" data-ai-chat-reset type="button">Reset</button>
          <button class="ai-chat__send" data-ai-chat-send type="submit">Kirim</button>
        </div>
      </form>
    </section>
  `;

  mountTarget.appendChild(host);

  const messagesEl = host.querySelector(".ai-chat__messages");
  const form = host.querySelector(".ai-chat__composer");
  const input = host.querySelector(".ai-chat__input");
  const sendBtn = host.querySelector("[data-ai-chat-send]");
  const resetBtn = host.querySelector("[data-ai-chat-reset]");
  const subtitleEl = host.querySelector(".ai-chat__subtitle");
  const suggestionsEl = host.querySelector(".ai-chat__suggestions");

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isSafeHref(value) {
    try {
      const url = new URL(String(value || "").trim(), window.location.href);
      return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
    } catch (_) {
      return false;
    }
  }

  function renderInlineMarkdown(value) {
    const placeholders = [];
    let html = escapeHtml(value);

    html = html.replace(/`([^`\n]+)`/g, (_, code) => {
      const token = `__MD_TOKEN_${placeholders.length}__`;
      placeholders.push(`<code>${escapeHtml(code)}</code>`);
      return token;
    });

    html = html.replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)/g,
      (_, label, href) => {
        if (!isSafeHref(href)) return escapeHtml(label);

        const token = `__MD_TOKEN_${placeholders.length}__`;
        placeholders.push(
          `<a href="${escapeHtml(
            href
          )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            label
          )}</a>`
        );
        return token;
      }
    );

    html = html.replace(
      /\b(https?:\/\/[^\s<]+[^\s<.,;:!?])/g,
      (href) => {
        if (!isSafeHref(href)) return href;

        const token = `__MD_TOKEN_${placeholders.length}__`;
        placeholders.push(
          `<a href="${escapeHtml(
            href
          )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            href
          )}</a>`
        );
        return token;
      }
    );

    html = html.replace(/\*\*([^*\n][\s\S]*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^\w])\*([^*\n][\s\S]*?)\*(?!\w)/g, "$1<em>$2</em>");

    placeholders.forEach((replacement, index) => {
      html = html.replace(`__MD_TOKEN_${index}__`, replacement);
    });

    return html;
  }

  function buildParagraphBlock(lines) {
    const joined = lines.join("\n").trim();
    if (!joined) return "";

    const calloutMatch = joined.match(
      /^(Perhatian|Penting|Catatan|Catatan Dasar|Tips|Tip|Info)\s*:\s*([\s\S]+)$/i
    );

    if (calloutMatch) {
      const label = calloutMatch[1];
      const body = calloutMatch[2]
        .split("\n")
        .map((line) => renderInlineMarkdown(line))
        .join("<br>");
      const tone =
        /perhatian|penting/i.test(label)
          ? "warning"
          : /tips|tip/i.test(label)
          ? "tip"
          : "note";

      return `<aside class="ai-chat__callout ai-chat__callout--${tone}"><strong>${escapeHtml(
        label
      )}:</strong><p>${body}</p></aside>`;
    }

    return `<p>${joined
      .split("\n")
      .map((line) => renderInlineMarkdown(line))
      .join("<br>")}</p>`;
  }

  function buildListBlock(lines, ordered) {
    const tag = ordered ? "ol" : "ul";
    const pattern = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
    const items = lines
      .map((line) => line.replace(pattern, "").trim())
      .filter(Boolean)
      .map((line) => `<li>${renderInlineMarkdown(line)}</li>`)
      .join("");

    return items ? `<${tag}>${items}</${tag}>` : "";
  }

  function buildBlockquoteBlock(lines) {
    const content = lines
      .map((line) => line.replace(/^>\s?/, ""))
      .join("\n")
      .trim();

    return content ? `<blockquote>${buildParagraphBlock([content])}</blockquote>` : "";
  }

  function buildCodeBlock(lines) {
    const content = escapeHtml(lines.join("\n"));
    return `<pre><code>${content}</code></pre>`;
  }

  function markdownToHtml(value) {
    const normalized = String(value || "").replace(/\r\n?/g, "\n").trim();
    if (!normalized) return "<p></p>";

    const lines = normalized.split("\n");
    const blocks = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        index += 1;
        continue;
      }

      if (/^```/.test(trimmed)) {
        const codeLines = [];
        index += 1;

        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          codeLines.push(lines[index]);
          index += 1;
        }

        if (index < lines.length) index += 1;
        blocks.push(buildCodeBlock(codeLines));
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(headingMatch[1].length, 4);
        blocks.push(
          `<h${level}>${renderInlineMarkdown(headingMatch[2].trim())}</h${level}>`
        );
        index += 1;
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        const listLines = [];

        while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
          listLines.push(lines[index].trim());
          index += 1;
        }

        blocks.push(buildListBlock(listLines, false));
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        const listLines = [];

        while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
          listLines.push(lines[index].trim());
          index += 1;
        }

        blocks.push(buildListBlock(listLines, true));
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        const quoteLines = [];

        while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
          quoteLines.push(lines[index].trim());
          index += 1;
        }

        blocks.push(buildBlockquoteBlock(quoteLines));
        continue;
      }

      if (/^---+$/.test(trimmed)) {
        blocks.push("<hr>");
        index += 1;
        continue;
      }

      const paragraphLines = [];

      while (index < lines.length) {
        const current = lines[index];
        const currentTrimmed = current.trim();

        if (
          !currentTrimmed ||
          /^```/.test(currentTrimmed) ||
          /^(#{1,4})\s+/.test(currentTrimmed) ||
          /^[-*]\s+/.test(currentTrimmed) ||
          /^\d+\.\s+/.test(currentTrimmed) ||
          /^>\s?/.test(currentTrimmed) ||
          /^---+$/.test(currentTrimmed)
        ) {
          break;
        }

        paragraphLines.push(currentTrimmed);
        index += 1;
      }

      blocks.push(buildParagraphBlock(paragraphLines));
    }

    return blocks.join("");
  }

  function sanitizeRichHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html;

    const allowedTags = new Set([
      "A",
      "ASIDE",
      "BLOCKQUOTE",
      "BR",
      "CODE",
      "EM",
      "H1",
      "H2",
      "H3",
      "H4",
      "HR",
      "LI",
      "OL",
      "P",
      "PRE",
      "STRONG",
      "UL",
    ]);
    const allowedAttrs = {
      A: new Set(["href", "target", "rel"]),
      ASIDE: new Set(["class"]),
    };

    function sanitizeNode(node) {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tagName = child.tagName.toUpperCase();

          if (!allowedTags.has(tagName)) {
            const fragment = document.createDocumentFragment();
            while (child.firstChild) {
              fragment.appendChild(child.firstChild);
            }
            child.replaceWith(fragment);
            sanitizeNode(node);
            return;
          }

          Array.from(child.attributes).forEach((attr) => {
            const allowed = allowedAttrs[tagName];
            if (!allowed || !allowed.has(attr.name)) {
              child.removeAttribute(attr.name);
            }
          });

          if (tagName === "A") {
            const href = child.getAttribute("href") || "";
            if (!isSafeHref(href)) {
              child.replaceWith(document.createTextNode(child.textContent || ""));
              return;
            }

            child.setAttribute("target", "_blank");
            child.setAttribute("rel", "noopener noreferrer");
          }

          sanitizeNode(child);
          return;
        }

        if (child.nodeType !== Node.TEXT_NODE) {
          child.remove();
        }
      });
    }

    sanitizeNode(template.content);
    return template.innerHTML;
  }

  function renderAssistantBody(content) {
    const wrapper = document.createElement("div");
    wrapper.className = "ai-chat__richtext";
    wrapper.innerHTML = sanitizeRichHtml(markdownToHtml(content));
    return wrapper;
  }

  function appendMessage(role, content) {
    const item = document.createElement("article");
    item.className = `ai-chat__bubble ai-chat__bubble--${role}`;

    const body =
      role === "assistant"
        ? renderAssistantBody(content)
        : document.createElement("p");

    if (role !== "assistant") {
      body.textContent = content;
    }

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

    const suggestions = getSuggestions(getPageContext()).slice(0, 6);
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
          context: buildRequestContext(),
          dataSource: buildDataSource(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail || data?.error || "Gagal menghubungi backend AI."
        );
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
  input.focus();
})();
