(function () {
  const root = document.querySelector("[data-jadwal-app]");
  if (!root) return;

  const DEFAULT_API_URL =
    "https://script.google.com/macros/s/AKfycbzNJ5nbk41yTxowEorHZendyeW-TvgzfdnnpyTMHGEayTW1KE7zQuk0GHe6fjAQmkukUg/exec";
  const API_URL =
    typeof window.TOGA_CONFIG?.apiUrl === "string" &&
    window.TOGA_CONFIG.apiUrl.trim()
      ? window.TOGA_CONFIG.apiUrl.trim()
      : DEFAULT_API_URL;
  const SCHEDULE_API_BASE = deriveScheduleApiBase();
  const FETCH_TIMEOUT_MS = 12000;
  const AUTH_REQUIRED_MESSAGE =
    "Login lewat menu Akun diperlukan untuk menambah, mengedit, menghapus jadwal, dan kelola warna.";
  const STORAGE_KEYS = {
    events: "toga:calendar:events:v1",
    labels: "toga:calendar:labels:v1",
  };
  const DEFAULT_LABELS = [
    { id: "LBL-GREEN", name: "Kebun", color: "#43A047", status: "1", is_default: "1" },
    { id: "LBL-BLUE", name: "Rapat", color: "#1E88E5", status: "1", is_default: "1" },
    { id: "LBL-ORANGE", name: "Kegiatan", color: "#FB8C00", status: "1", is_default: "1" },
    { id: "LBL-RED", name: "Penting", color: "#E53935", status: "1", is_default: "1" },
    { id: "LBL-PURPLE", name: "Pribadi", color: "#8E24AA", status: "1", is_default: "1" },
    { id: "LBL-TEAL", name: "Pengingat", color: "#00897B", status: "1", is_default: "1" },
  ];

  const els = {
    title: root.querySelector("[data-calendar-title]"),
    subtitle: root.querySelector("[data-calendar-subtitle]"),
    grid: root.querySelector("[data-calendar-grid]"),
    agendaTitle: root.querySelector("[data-agenda-title]"),
    agendaSubtitle: root.querySelector("[data-agenda-subtitle]"),
    agendaList: root.querySelector("[data-agenda-list]"),
    labelList: root.querySelector("[data-label-list]"),
    status: root.querySelector("[data-sync-status]"),
    emptyMonth: root.querySelector("[data-month-empty]"),
    eventModal: document.querySelector("[data-event-modal]"),
    labelModal: document.querySelector("[data-label-modal]"),
    eventForm: document.querySelector("[data-event-form]"),
    labelForm: document.querySelector("[data-label-form]"),
    eventModalTitle: document.querySelector("[data-event-modal-title]"),
    labelModalTitle: document.querySelector("[data-label-modal-title]"),
    eventDeleteBtn: document.querySelector("[data-event-delete]"),
    labelDeleteBtn: document.querySelector("[data-label-delete]"),
    labelSelect: document.querySelector("[name='label_id']"),
    allDayInput: document.querySelector("[name='all_day']"),
    timeFields: document.querySelectorAll("[data-time-field]"),
    labelItems: document.querySelector("[data-label-items]"),
    notice: document.querySelector("[data-jadwal-notice]"),
    networkLoading: document.querySelector("[data-network-loading]"),
    networkLoadingText: document.querySelector("[data-network-loading-text]"),
    authNote: document.querySelector("[data-auth-required-note]"),
  };

  const state = {
    monthCursor: startOfMonth(new Date()),
    selectedDate: toISODate(new Date()),
    events: readStore(STORAGE_KEYS.events, []),
    labels: normalizeLabels(readStore(STORAGE_KEYS.labels, DEFAULT_LABELS)),
    sourceText: "Memuat jadwal...",
    editingEventId: "",
    editingLabelId: "",
    loadingCount: 0,
    noticeTimerId: 0,
    statusTimerId: 0,
  };
  window.TOGA_JADWAL_STATE = state;

  function getAuthApi() {
    return window.TOGAAuth || null;
  }

  function deriveScheduleApiBase() {
    const config = window.TOGA_CONFIG || {};
    if (typeof config.scheduleApiUrl === "string" && config.scheduleApiUrl.trim()) {
      return config.scheduleApiUrl.trim().replace(/\/+$/g, "");
    }

    if (typeof config.authApiUrl === "string" && config.authApiUrl.trim()) {
      return config.authApiUrl.trim().replace(/\/auth\/?$/i, "/schedule").replace(/\/+$/g, "");
    }

    if (typeof config.aiChatUrl === "string" && config.aiChatUrl.trim()) {
      try {
        const url = new URL(config.aiChatUrl.trim(), window.location.href);
        return `${url.origin}/api/schedule`;
      } catch (_) {}
    }

    return "";
  }

  function hasScheduleBackend() {
    return !!SCHEDULE_API_BASE;
  }

  function getCurrentUser() {
    return getAuthApi()?.getUser?.() || null;
  }

  function getAuthToken() {
    return String(getAuthApi()?.getToken?.() || "").trim();
  }

  function canManageCalendar() {
    return !!getAuthApi()?.isAuthenticated?.();
  }

  function redirectToAccountPage() {
    const authApi = getAuthApi();
    const loginUrl =
      authApi?.getLoginUrl?.() ||
      `account.html?next=${encodeURIComponent(
        `${window.location.pathname.split("/").pop() || "jadwal.html"}${window.location.search || ""}${window.location.hash || ""}`
      )}`;
    window.location.href = loginUrl;
  }

  function requireCalendarAuth() {
    if (canManageCalendar()) return true;
    setNotice(AUTH_REQUIRED_MESSAGE, "warning");
    setStatus("Mode lihat aktif. Login diperlukan untuk fitur CRUD jadwal.");
    window.setTimeout(redirectToAccountPage, 500);
    return false;
  }

  function requireScheduleWriteBackend() {
    if (hasScheduleBackend()) return true;
    setNotice(
      "Backend jadwal belum aktif. Simpan, ubah, dan hapus hanya bisa lewat backend terproteksi.",
      "warning"
    );
    setStatus("Aksi tulis kalender dinonaktifkan sampai schedule backend tersedia.");
    return false;
  }

  function readStore(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function createId(prefix) {
    const part = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${prefix}-${Date.now()}-${part}`;
  }

  function normalizeColor(value) {
    const color = String(value || "").trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(color) ? color : "#43A047";
  }

  function normalizeLabel(raw, index = 0) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw.id || "").trim() || `LBL-${index + 1}`;
    const status = String(raw.status ?? "1").trim() || "1";
    if (status !== "1") return null;
    return {
      id,
      name: String(raw.name || "Label").trim() || "Label",
      color: normalizeColor(raw.color),
      sort_order: Number(raw.sort_order || index + 1) || index + 1,
      status,
      is_default: String(raw.is_default ?? "0").trim() || "0",
    };
  }

  function normalizeLabels(list) {
    const fallback = DEFAULT_LABELS.map(normalizeLabel).filter(Boolean);
    const normalized = Array.isArray(list)
      ? list.map(normalizeLabel).filter(Boolean)
      : [];
    const source = normalized.length > 0 ? normalized : fallback;
    return source.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }

  function normalizeEvent(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw.id || "").trim();
    const title = String(raw.title || "").trim();
    const startDate = String(raw.start_date || "").trim();
    if (!id || !title || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.end_date || "").trim())
      ? String(raw.end_date || "").trim()
      : startDate;
    const allDay = isTruthy(raw.all_day);
    const label = getLabelById(String(raw.label_id || "").trim());
    return {
      id,
      title,
      start_date: startDate,
      start_time: normalizeTime(raw.start_time),
      end_date: endDate,
      end_time: normalizeTime(raw.end_time),
      all_day: allDay,
      label_id: String(raw.label_id || label?.id || "").trim(),
      label_name: String(raw.label_name || label?.name || "").trim(),
      label_color: normalizeColor(raw.label_color || label?.color || "#43A047"),
      location: String(raw.location || "").trim(),
      notes: String(raw.notes || "").trim(),
      reminder_minutes: String(raw.reminder_minutes || "").trim(),
      related_plant_id: String(raw.related_plant_id || "").trim(),
      status: String(raw.status || "1").trim() || "1",
      created_at: String(raw.created_at || "").trim(),
      updated_at: String(raw.updated_at || "").trim(),
      created_by: String(raw.created_by || "").trim(),
    };
  }

  function normalizeEvents(list) {
    return (Array.isArray(list) ? list : [])
      .map(normalizeEvent)
      .filter(Boolean)
      .filter((item) => item.status === "1")
      .sort(compareEvents);
  }

  function getLabelById(id) {
    return state.labels.find((item) => item.id === id) || null;
  }

  function compareEvents(a, b) {
    const aKey = `${a.start_date} ${a.all_day ? "00:00" : a.start_time || "00:00"}`;
    const bKey = `${b.start_date} ${b.all_day ? "00:00" : b.start_time || "00:00"}`;
    if (aKey !== bKey) return aKey.localeCompare(bKey);
    return a.title.localeCompare(b.title, "id");
  }

  function isTruthy(value) {
    return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
  }

  function normalizeTime(value) {
    const time = String(value || "").trim();
    return /^\d{2}:\d{2}$/.test(time) ? time : "";
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseISODate(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  }

  function formatMonthYear(date) {
    return new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
    }).format(date);
  }

  function formatLongDate(value) {
    return new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(parseISODate(value));
  }

  function formatDateCompact(value) {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "short",
    }).format(parseISODate(value));
  }

  function toICSDateTime(dateStr, timeStr = "") {
    const cleanDate = String(dateStr || "").replace(/-/g, "");
    if (!cleanDate || cleanDate.length !== 8) return "";
    if (!timeStr) return `${cleanDate}T000000`;
    const cleanTime = String(timeStr || "").replace(":", "");
    return `${cleanDate}T${cleanTime}00`;
  }

  function addIsoDateDays(dateStr, days) {
    return toISODate(addDays(parseISODate(dateStr), days));
  }

  function buildGoogleCalendarUrl(event) {
    const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
    const start = event.all_day
      ? event.start_date.replace(/-/g, "")
      : toICSDateTime(event.start_date, event.start_time || "00:00");
    const end = event.all_day
      ? addIsoDateDays(event.end_date, 1).replace(/-/g, "")
      : toICSDateTime(event.end_date, event.end_time || event.start_time || "00:00");
    const details = event.notes || "";
    const location = event.location || "";
    const query = new URLSearchParams({
      text: event.title || "Event TOGA",
      dates: `${start}/${end}`,
      details,
      location,
    });
    return `${base}&${query.toString()}`;
  }

  function eventToICS(event) {
    const escapeICS = (value) =>
      String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const lines = eventToICSLines(event, escapeICS);
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TOGA TANAMAN//JADWAL//ID",
      "CALSCALE:GREGORIAN",
      ...lines,
      "END:VCALENDAR",
    ].join("\r\n");
  }

  function eventToICSLines(event, escapeICS) {
    const dtStamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const uid = `${event.id || createId("EVT")}@toga-tanaman`;
    const start = event.all_day
      ? `DTSTART;VALUE=DATE:${event.start_date.replace(/-/g, "")}`
      : `DTSTART:${toICSDateTime(event.start_date, event.start_time || "00:00")}`;
    const end = event.all_day
      ? `DTEND;VALUE=DATE:${addIsoDateDays(event.end_date, 1).replace(/-/g, "")}`
      : `DTEND:${toICSDateTime(event.end_date, event.end_time || event.start_time || "00:00")}`;
    return [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      start,
      end,
      `SUMMARY:${escapeICS(event.title)}`,
      event.location ? `LOCATION:${escapeICS(event.location)}` : "",
      event.notes ? `DESCRIPTION:${escapeICS(event.notes)}` : "",
      "END:VEVENT",
    ]
      .filter(Boolean);
  }

  function sanitizeFilename(value) {
    return String(value || "event")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 40);
  }

  function downloadICS(filename, content) {
    const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function getMonthRange(date) {
    const monthStart = startOfMonth(date);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return {
      from: toISODate(monthStart),
      to: toISODate(monthEnd),
    };
  }

  function getGridStart(date) {
    const monthStart = startOfMonth(date);
    const mondayBasedDay = (monthStart.getDay() + 6) % 7;
    return addDays(monthStart, -mondayBasedDay);
  }

  function getGridDates(date) {
    const start = getGridStart(date);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }

  function eventIntersectsDate(event, dateStr) {
    return event.start_date <= dateStr && event.end_date >= dateStr;
  }

  function getEventsForDate(dateStr) {
    return state.events.filter((event) => eventIntersectsDate(event, dateStr));
  }

  function getEventsForMonth(date) {
    const range = getMonthRange(date);
    return state.events.filter(
      (event) => event.start_date <= range.to && event.end_date >= range.from
    );
  }

  function mergeEventsByRange(existing, incoming, range) {
    const outsideRange = existing.filter(
      (event) => !(event.start_date <= range.to && event.end_date >= range.from)
    );
    return normalizeEvents(outsideRange.concat(incoming));
  }

  function buildTimeLabel(event) {
    if (event.all_day) return "Seharian";
    if (event.start_date === event.end_date) {
      const start = event.start_time || "--:--";
      const end = event.end_time || "";
      return end ? `${start} - ${end}` : start;
    }
    const startLabel = `${formatDateCompact(event.start_date)} ${event.start_time || ""}`.trim();
    const endLabel = `${formatDateCompact(event.end_date)} ${event.end_time || ""}`.trim();
    return `${startLabel} - ${endLabel}`;
  }

  function setNotice(message, kind = "info") {
    if (!els.notice) return;

    if (state.noticeTimerId) {
      window.clearTimeout(state.noticeTimerId);
      state.noticeTimerId = 0;
    }

    els.notice.textContent = message;
    els.notice.dataset.kind = kind;
    els.notice.hidden = !message;

    if (
      kind === "success" ||
      kind === "warning" ||
      kind === "danger" ||
      (kind === "info" && message)
    ) {
      state.noticeTimerId = window.setTimeout(() => {
        if (!els.notice) return;
        els.notice.textContent = "";
        els.notice.hidden = true;
        state.noticeTimerId = 0;
      }, 3000);
    }
  }

  function setStatus(message) {
    if (state.statusTimerId) {
      window.clearTimeout(state.statusTimerId);
      state.statusTimerId = 0;
    }

    state.sourceText = message;
    if (els.status) {
      els.status.textContent = message;
      els.status.hidden = !message;
    }

    if (message && els.status) {
      state.statusTimerId = window.setTimeout(() => {
        if (!els.status) return;
        els.status.textContent = "";
        els.status.hidden = true;
        state.statusTimerId = 0;
      }, 3000);
    }
  }

  function ensureArrayResponse(data, modeName) {
    if (!Array.isArray(data)) {
      const detail =
        data && typeof data === "object" && data.error
          ? String(data.error)
          : `Respons ${modeName} bukan array.`;
      throw new Error(detail);
    }
    return data;
  }

  function beginLoading(message) {
    state.loadingCount += 1;
    if (els.networkLoadingText) {
      els.networkLoadingText.textContent = message || "Sedang memuat data...";
    }
    if (els.networkLoading) {
      els.networkLoading.hidden = false;
    }
  }

  function endLoading() {
    state.loadingCount = Math.max(0, state.loadingCount - 1);
    if (state.loadingCount > 0) return;
    if (els.networkLoading) {
      els.networkLoading.hidden = true;
    }
  }

  async function fetchRemoteJSON(url, loadingMessage = "Sedang memuat data...") {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    beginLoading(loadingMessage);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "default",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } finally {
      window.clearTimeout(timer);
      endLoading();
    }
  }

  async function fetchScheduleJSON(path, loadingMessage) {
    if (!hasScheduleBackend()) {
      return null;
    }
    return fetchRemoteJSON(`${SCHEDULE_API_BASE}${path}`, loadingMessage);
  }

  async function mutateScheduleJSON(path, options, loadingMessage) {
    if (!hasScheduleBackend()) {
      return null;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    beginLoading(loadingMessage);
    try {
      const headers = {
        Accept: "application/json",
        ...(options?.headers || {}),
      };
      const token = getAuthToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`${SCHEDULE_API_BASE}${path}`, {
        method: options?.method || "POST",
        headers,
        body: options?.body,
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || data?.ok === false) {
        throw new Error(String(data?.error || `HTTP ${response.status}`));
      }
      return data;
    } finally {
      window.clearTimeout(timer);
      endLoading();
    }
  }

  async function loadLabels() {
    try {
      let remote = null;
      if (hasScheduleBackend()) {
        const proxied = await fetchScheduleJSON("/labels", "Sedang memuat label warna...");
        remote = ensureArrayResponse(proxied?.labels, "schedule-labels");
      } else {
        remote = ensureArrayResponse(
          await fetchRemoteJSON(
            `${API_URL}?mode=calendar-labels`,
            "Sedang memuat label warna..."
          ),
          "calendar-labels"
        );
      }
      const normalized = normalizeLabels(remote);
      state.labels = normalized;
      writeStore(STORAGE_KEYS.labels, normalized);
      return true;
    } catch (_) {
      state.labels = normalizeLabels(readStore(STORAGE_KEYS.labels, DEFAULT_LABELS));
      if (state.labels.length === DEFAULT_LABELS.length) {
        setNotice(
          "Label memakai fallback lokal. Pastikan Apps Script terbaru sudah di-deploy.",
          "warning"
        );
      }
      return false;
    }
  }

  async function loadEventsForCurrentMonth() {
    const range = getMonthRange(state.monthCursor);
    try {
      let remote = null;
      if (hasScheduleBackend()) {
        const proxied = await fetchScheduleJSON(
          `/events?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
          "Sedang memuat agenda kalender..."
        );
        remote = ensureArrayResponse(proxied?.events, "schedule-events");
      } else {
        const remoteRaw = await fetchRemoteJSON(
          `${API_URL}?mode=calendar-events&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
          "Sedang memuat agenda kalender..."
        );
        remote = ensureArrayResponse(remoteRaw, "calendar-events");
      }
      const normalized = normalizeEvents(remote);
      const merged = mergeEventsByRange(
        normalizeEvents(readStore(STORAGE_KEYS.events, [])),
        normalized,
        range
      );
      state.events = merged;
      writeStore(STORAGE_KEYS.events, merged);
      setStatus(
        normalized.length > 0
          ? `Tersinkron ke Google Sheets. ${normalized.length} event dimuat.`
          : "Respons endpoint berhasil, tetapi tidak ada event di rentang bulan ini."
      );
      if (normalized.length === 0) {
        setNotice(
          `Endpoint mengembalikan 0 event untuk rentang ${range.from} s/d ${range.to}. Periksa hasil URL mode=calendar-events langsung atau row event di sheet.`,
          "warning"
        );
      }
      return true;
    } catch (error) {
      state.events = normalizeEvents(readStore(STORAGE_KEYS.events, []));
      setStatus("Menampilkan data lokal. Update Apps Script diperlukan untuk sinkron penuh.");
      if (state.events.length === 0) {
        setNotice(
          `Gagal memuat calendar-events: ${String(error && error.message || error)}. Redeploy Web App Apps Script lalu refresh halaman.`,
          "warning"
        );
      }
      return false;
    }
  }

  function renderCalendar() {
    const gridDates = getGridDates(state.monthCursor);
    const today = toISODate(new Date());
    const monthKey = `${state.monthCursor.getFullYear()}-${String(
      state.monthCursor.getMonth() + 1
    ).padStart(2, "0")}`;
    const monthEvents = getEventsForMonth(state.monthCursor);

    if (els.title) {
      els.title.textContent = formatMonthYear(state.monthCursor);
    }
    if (els.subtitle) {
      els.subtitle.textContent =
        monthEvents.length > 0
          ? `${monthEvents.length} agenda di bulan ini`
          : "Belum ada agenda";
    }

    if (els.emptyMonth) {
      els.emptyMonth.hidden = monthEvents.length > 0;
    }

    els.grid.innerHTML = gridDates
      .map((date) => {
        const iso = toISODate(date);
        const dayEvents = getEventsForDate(iso);
        const isOutsideMonth = !iso.startsWith(monthKey);
        const classes = [
          "calendar-day",
          isOutsideMonth ? "is-outside" : "",
          iso === state.selectedDate ? "is-selected" : "",
          iso === today ? "is-today" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const preview = dayEvents
          .slice(0, 3)
          .map(
            (event) =>
              `<span class="calendar-event-dot" style="--event-color:${escapeHtml(
                event.label_color
              )}"></span>`
          )
          .join("");
        return `
          <button class="${classes}" type="button" data-day="${iso}">
            <span class="calendar-day__number">${date.getDate()}</span>
            <span class="calendar-day__dots">${preview}</span>
            <span class="calendar-day__count">${dayEvents.length > 0 ? `${dayEvents.length} acara` : ""}</span>
          </button>
        `;
      })
      .join("");

    Array.from(els.grid.querySelectorAll("[data-day]")).forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedDate = button.dataset.day || state.selectedDate;
        renderCalendar();
        renderAgenda();
      });
    });
  }

  function renderAgenda() {
    const items = getEventsForDate(state.selectedDate);
    const canManage = canManageCalendar();
    if (els.agendaTitle) {
      els.agendaTitle.textContent = formatLongDate(state.selectedDate);
    }
    if (els.agendaSubtitle) {
      els.agendaSubtitle.textContent =
        items.length > 0
          ? `${items.length} agenda tersusun`
          : "Belum ada agenda untuk tanggal ini";
    }

    if (items.length === 0) {
      els.agendaList.innerHTML = `
        <div class="agenda-empty">
          <strong>Tanggal ini masih kosong.</strong>
          <p>${
            canManage
              ? "Buat event baru untuk jadwal kebun, rapat, atau pengingat pribadi."
              : "Login terlebih dulu bila ingin menambahkan agenda pada tanggal ini."
          }</p>
        </div>
      `;
      return;
    }

    els.agendaList.innerHTML = items
      .map(
        (event) => `
          <article class="agenda-item">
            <span class="agenda-item__stripe" style="--event-color:${escapeHtml(
              event.label_color
            )}"></span>
            <span class="agenda-item__body">
              <span class="agenda-item__top">
                <span class="agenda-item__title">${escapeHtml(event.title)}</span>
                <span class="agenda-item__time">${escapeHtml(buildTimeLabel(event))}</span>
              </span>
              <span class="agenda-item__meta">
                ${
                  event.label_name
                    ? `<span class="agenda-item__label" style="--event-color:${escapeHtml(
                        event.label_color
                      )}">${escapeHtml(event.label_name)}</span>`
                    : ""
                }
                ${event.location ? `<span>${escapeHtml(event.location)}</span>` : ""}
              </span>
              ${
                event.notes
                  ? `<span class="agenda-item__notes">${escapeHtml(event.notes)}</span>`
                  : ""
              }
              <span class="agenda-item__actions">
                ${
                  canManage
                    ? `<button class="mini-btn" type="button" data-event-id="${escapeHtml(event.id)}">Edit</button>`
                    : ""
                }
                <button class="mini-btn" type="button" data-event-google="${escapeHtml(event.id)}">Google Calendar</button>
                <button class="mini-btn" type="button" data-event-ics="${escapeHtml(event.id)}">Kalender HP (.ics)</button>
              </span>
            </span>
          </article>
        `
      )
      .join("");

    Array.from(els.agendaList.querySelectorAll("[data-event-id]")).forEach((button) => {
      button.addEventListener("click", () => {
        const item = state.events.find((event) => event.id === button.dataset.eventId);
        if (item) {
          openEventModal(item);
        }
      });
    });

    Array.from(els.agendaList.querySelectorAll("[data-event-google]")).forEach((button) => {
      button.addEventListener("click", () => {
        const item = state.events.find((event) => event.id === button.dataset.eventGoogle);
        if (!item) return;
        openExternalUrl(buildGoogleCalendarUrl(item));
      });
    });

    Array.from(els.agendaList.querySelectorAll("[data-event-ics]")).forEach((button) => {
      button.addEventListener("click", () => {
        const item = state.events.find((event) => event.id === button.dataset.eventIcs);
        if (!item) return;
        const safeName = sanitizeFilename(item.title);
        downloadICS(`jadwal-${item.start_date}-${safeName}.ics`, eventToICS(item));
        setNotice("File .ics diunduh. Bisa dibuka di Google Calendar / iOS / Android.", "success");
      });
    });
  }

  function openExternalUrl(url) {
    const href = String(url || "").trim();
    if (!href) return;

    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function renderLabels() {
    if (!els.labelList) return;
    const canManage = canManageCalendar();
    els.labelList.innerHTML = state.labels
      .map(
        (label) => `
          <${
            canManage ? "button" : "span"
          } class="label-chip" ${canManage ? `type="button" data-label-edit="${escapeHtml(label.id)}"` : ""}>
            <span class="label-chip__swatch" style="--event-color:${escapeHtml(label.color)}"></span>
            <span>${escapeHtml(label.name)}</span>
          </${canManage ? "button" : "span"}>
        `
      )
      .join("");

    if (els.labelItems) {
      els.labelItems.innerHTML = canManage
        ? state.labels
            .map(
              (label) => `
                <div class="label-row">
                  <button class="label-row__main" type="button" data-label-edit="${escapeHtml(label.id)}">
                    <span class="label-row__swatch" style="--event-color:${escapeHtml(label.color)}"></span>
                    <span>
                      <strong>${escapeHtml(label.name)}</strong>
                      <small>${escapeHtml(label.color)}</small>
                    </span>
                  </button>
                </div>
              `
            )
            .join("")
        : "";
    }

    const editTargets = document.querySelectorAll("[data-label-edit]");
    editTargets.forEach((target) => {
      target.addEventListener("click", () => {
        const item = getLabelById(target.dataset.labelEdit || "");
        if (item) {
          openLabelModal(item);
        }
      });
    });

    if (els.labelSelect) {
      const currentValue = els.labelSelect.value;
      els.labelSelect.innerHTML = state.labels
        .map(
          (label) =>
            `<option value="${escapeHtml(label.id)}">${escapeHtml(label.name)}</option>`
        )
        .join("");
      if (state.labels.some((label) => label.id === currentValue)) {
        els.labelSelect.value = currentValue;
      } else if (state.labels[0]) {
        els.labelSelect.value = state.labels[0].id;
      }
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function syncTimeFieldState() {
    const disabled = !!els.allDayInput?.checked;
    els.timeFields.forEach((field) => {
      field.disabled = disabled;
      field.closest(".field")?.classList.toggle("is-disabled", disabled);
    });
  }

  function openEventModal(event) {
    if (!requireCalendarAuth()) return;
    state.editingEventId = event?.id || "";
    if (els.eventModalTitle) {
      els.eventModalTitle.textContent = event ? "Edit event" : "Buat event";
    }
    if (els.eventDeleteBtn) {
      els.eventDeleteBtn.hidden = !event;
    }
    els.eventForm.reset();
    els.eventForm.elements.id.value = event?.id || "";
    els.eventForm.elements.title.value = event?.title || "";
    els.eventForm.elements.start_date.value = event?.start_date || state.selectedDate;
    els.eventForm.elements.start_time.value = event?.start_time || "08:00";
    els.eventForm.elements.end_date.value = event?.end_date || event?.start_date || state.selectedDate;
    els.eventForm.elements.end_time.value = event?.end_time || "09:00";
    els.eventForm.elements.all_day.checked = !!event?.all_day;
    els.eventForm.elements.label_id.value =
      event?.label_id || state.labels[0]?.id || "";
    els.eventForm.elements.location.value = event?.location || "";
    els.eventForm.elements.notes.value = event?.notes || "";
    els.eventForm.elements.reminder_minutes.value = event?.reminder_minutes || "30";
    syncTimeFieldState();
    els.eventModal.hidden = false;
  }

  function closeEventModal() {
    els.eventModal.hidden = true;
    state.editingEventId = "";
  }

  function openLabelModal(label) {
    if (!requireCalendarAuth()) return;
    state.editingLabelId = label?.id || "";
    if (els.labelModalTitle) {
      els.labelModalTitle.textContent = label ? "Edit label" : "Tambah label";
    }
    if (els.labelDeleteBtn) {
      els.labelDeleteBtn.hidden = !label;
    }
    els.labelForm.reset();
    els.labelForm.elements.id.value = label?.id || "";
    els.labelForm.elements.name.value = label?.name || "";
    els.labelForm.elements.color.value = label?.color || "#43A047";
    els.labelModal.hidden = false;
  }

  function closeLabelModal() {
    els.labelModal.hidden = true;
    state.editingLabelId = "";
  }

  function serializeEventForm(form) {
    const formData = new FormData(form);
    const label = getLabelById(String(formData.get("label_id") || "").trim()) || state.labels[0];
    const startDate = String(formData.get("start_date") || "").trim();
    const endDate = String(formData.get("end_date") || "").trim() || startDate;
    const currentUser = getCurrentUser();
    return {
      id: String(formData.get("id") || "").trim(),
      title: String(formData.get("title") || "").trim(),
      start_date: startDate,
      start_time: String(formData.get("start_time") || "").trim(),
      end_date: endDate,
      end_time: String(formData.get("end_time") || "").trim(),
      all_day: formData.get("all_day") ? "1" : "0",
      label_id: label?.id || "",
      label_name: label?.name || "",
      label_color: label?.color || "#43A047",
      location: String(formData.get("location") || "").trim(),
      notes: String(formData.get("notes") || "").trim(),
      reminder_minutes: String(formData.get("reminder_minutes") || "").trim(),
      related_plant_id: "",
      created_by: currentUser?.email || currentUser?.username || "",
    };
  }

  function validateEventPayload(payload) {
    if (!payload.title) return "Judul event wajib diisi.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.start_date)) {
      return "Tanggal mulai belum valid.";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.end_date)) {
      return "Tanggal selesai belum valid.";
    }
    if (payload.all_day !== "1") {
      if (!/^\d{2}:\d{2}$/.test(payload.start_time)) {
        return "Jam mulai wajib diisi.";
      }
      if (!/^\d{2}:\d{2}$/.test(payload.end_time)) {
        return "Jam selesai wajib diisi.";
      }
    }
    return "";
  }

  async function saveEvent(payload) {
    if (!requireCalendarAuth()) return;
    if (!requireScheduleWriteBackend()) return;
    const validationError = validateEventPayload(payload);
    if (validationError) {
      setNotice(validationError, "danger");
      return;
    }

    try {
      const result = await mutateScheduleJSON(
        "/events",
        {
          method: payload.id ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
        payload.id ? "Sedang memperbarui event..." : "Sedang menyimpan event..."
      );
      const nextEvent = normalizeEvent(result?.event || { ...payload, id: payload.id || createId("EVT") });
      const nextEvents = upsertArrayItem(state.events, nextEvent, "id");
      state.events = normalizeEvents(nextEvents);
      writeStore(STORAGE_KEYS.events, state.events);
      setStatus("Event tersimpan lewat backend jadwal.");
      setNotice("Event berhasil disimpan.", "success");
    } catch (error) {
      setStatus("Gagal menyimpan event ke backend jadwal.");
      setNotice(String(error?.message || error || "Gagal menyimpan event."), "danger");
      return;
    }

    state.selectedDate = payload.start_date;
    state.monthCursor = startOfMonth(parseISODate(payload.start_date));
    closeEventModal();
    renderAll();
  }

  async function deleteEvent() {
    if (!requireCalendarAuth()) return;
    if (!requireScheduleWriteBackend()) return;
    const id = state.editingEventId;
    if (!id) return;
    if (!window.confirm("Hapus event ini?")) return;

    try {
      await mutateScheduleJSON(
        `/events?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
        "Sedang menghapus event..."
      );
      state.events = state.events.filter((item) => item.id !== id);
      writeStore(STORAGE_KEYS.events, state.events);
      setStatus("Event dihapus lewat backend jadwal.");
      setNotice("Event berhasil dihapus.", "success");
    } catch (error) {
      setStatus("Gagal menghapus event dari backend jadwal.");
      setNotice(String(error?.message || error || "Gagal menghapus event."), "danger");
      return;
    }

    closeEventModal();
    renderAll();
  }

  function serializeLabelForm(form) {
    const formData = new FormData(form);
    return {
      id: String(formData.get("id") || "").trim(),
      name: String(formData.get("name") || "").trim(),
      color: normalizeColor(formData.get("color")),
    };
  }

  async function saveLabel(payload) {
    if (!requireCalendarAuth()) return;
    if (!requireScheduleWriteBackend()) return;
    if (!payload.name) {
      setNotice("Nama label wajib diisi.", "danger");
      return;
    }

    const nextLabel = normalizeLabel({
      ...payload,
      id: payload.id || createId("LBL"),
      sort_order: state.labels.length + 1,
      status: "1",
      is_default: "0",
    });

    try {
      const result = await mutateScheduleJSON(
        "/labels",
        {
          method: payload.id ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(nextLabel),
        },
        payload.id ? "Sedang memperbarui label..." : "Sedang menyimpan label..."
      );
      const label = normalizeLabel(result?.label || nextLabel);
      state.labels = normalizeLabels(upsertArrayItem(state.labels, label, "id"));
      writeStore(STORAGE_KEYS.labels, state.labels);
      setNotice("Label berhasil disimpan.", "success");
    } catch (error) {
      setStatus("Gagal menyimpan label ke backend jadwal.");
      setNotice(String(error?.message || error || "Gagal menyimpan label."), "danger");
      return;
    }

    closeLabelModal();
    renderLabels();
  }

  async function deleteLabel() {
    if (!requireCalendarAuth()) return;
    if (!requireScheduleWriteBackend()) return;
    const id = state.editingLabelId;
    if (!id) return;
    if (!window.confirm("Hapus label ini?")) return;

    try {
      await mutateScheduleJSON(
        `/labels?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
        "Sedang menghapus label..."
      );
    } catch (error) {
      setStatus("Gagal menghapus label dari backend jadwal.");
      setNotice(String(error?.message || error || "Gagal menghapus label."), "danger");
      return;
    }

    state.labels = state.labels.filter((item) => item.id !== id);
    writeStore(STORAGE_KEYS.labels, state.labels);
    state.events = state.events.map((event) =>
      event.label_id === id
        ? {
            ...event,
            label_id: "",
            label_name: "",
            label_color: "#43A047",
          }
        : event
    );
    writeStore(STORAGE_KEYS.events, state.events);
    setStatus("Label dihapus lewat backend jadwal.");
    setNotice("Label dihapus.", "success");
    closeLabelModal();
    renderAll();
  }

  function upsertArrayItem(list, item, key) {
    const index = list.findIndex((entry) => entry?.[key] === item?.[key]);
    if (index === -1) return [...list, item];
    const next = list.slice();
    next[index] = item;
    return next;
  }

  function bindGlobalActions() {
    root.querySelector("[data-month-prev]")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
      loadEventsForCurrentMonth().then(renderAll);
    });

    root.querySelector("[data-month-next]")?.addEventListener("click", () => {
      state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
      loadEventsForCurrentMonth().then(renderAll);
    });

    root.querySelector("[data-go-today]")?.addEventListener("click", () => {
      const today = new Date();
      state.monthCursor = startOfMonth(today);
      state.selectedDate = toISODate(today);
      loadEventsForCurrentMonth().then(renderAll);
    });

    root.querySelector("[data-export-day-ics]")?.addEventListener("click", () => {
      const items = getEventsForDate(state.selectedDate);
      if (items.length === 0) {
        setNotice("Tidak ada event di tanggal ini untuk diexport.", "warning");
        return;
      }
      const calendarBody = items
        .map((event) =>
          eventToICSLines(event, (value) =>
            String(value || "")
              .replace(/\\/g, "\\\\")
              .replace(/\n/g, "\\n")
              .replace(/,/g, "\\,")
              .replace(/;/g, "\\;")
          ).join("\r\n")
        )
        .join("\r\n");
      const merged = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TOGA TANAMAN//JADWAL//ID",
        "CALSCALE:GREGORIAN",
        calendarBody,
        "END:VCALENDAR",
      ].join("\r\n");
      downloadICS(`jadwal-${state.selectedDate}.ics`, merged);
      setNotice("File .ics berhasil dibuat untuk kalender HP / Google Calendar.", "success");
    });

    document.querySelectorAll("[data-open-event-modal]").forEach((button) => {
      button.addEventListener("click", () => openEventModal());
    });

    document.querySelectorAll("[data-open-label-modal]").forEach((button) => {
      button.addEventListener("click", () => openLabelModal());
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.closest("[data-event-modal]")) closeEventModal();
        if (button.closest("[data-label-modal]")) closeLabelModal();
      });
    });

    els.eventModal?.addEventListener("click", (event) => {
      if (event.target === els.eventModal) closeEventModal();
    });

    els.labelModal?.addEventListener("click", (event) => {
      if (event.target === els.labelModal) closeLabelModal();
    });

    els.eventForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveEvent(serializeEventForm(els.eventForm));
    });

    els.labelForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveLabel(serializeLabelForm(els.labelForm));
    });

    els.eventDeleteBtn?.addEventListener("click", deleteEvent);
    els.labelDeleteBtn?.addEventListener("click", deleteLabel);
    els.allDayInput?.addEventListener("change", syncTimeFieldState);
  }

  function renderAll() {
    const canManage = canManageCalendar();
    document.querySelectorAll("[data-open-event-modal]").forEach((button) => {
      button.hidden = !canManage;
    });
    document.querySelectorAll("[data-open-label-modal]").forEach((button) => {
      button.hidden = !canManage;
    });
    if (els.authNote) {
      els.authNote.hidden = canManage;
    }
    if (!canManage) {
      closeEventModal();
      closeLabelModal();
    }
    renderLabels();
    renderCalendar();
    renderAgenda();
  }

  async function init() {
    bindGlobalActions();
    window.addEventListener("toga:authchange", () => {
      renderAll();
    });
    await loadLabels();
    await loadEventsForCurrentMonth();
    setNotice(
      canManageCalendar()
        ? "UI siap. Jika Apps Script belum diperbarui, tambah/edit event akan disimpan lokal dulu."
        : "Mode baca aktif. Login di menu Akun untuk membuka fitur CRUD jadwal.",
      "info"
    );
    renderAll();
  }

  init();
})();
