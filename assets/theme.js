(() => {
  const STORAGE_KEY = "toga:theme";
  const SETTINGS_CACHE_KEY = "toga:settings:cache:v1";
  const SETTINGS_CACHE_VERSION = 1;
  const THEME_DARK = "dark";
  const THEME_LIGHT = "light";

  function normalizeTheme(value) {
    return value === THEME_DARK || value === THEME_LIGHT ? value : "";
  }

  function readSettingsCache() {
    try {
      const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (Number(parsed.version || 0) !== SETTINGS_CACHE_VERSION) return null;
      const data = parsed.data && typeof parsed.data === "object" ? parsed.data : null;
      if (!data) return null;
      const theme = normalizeTheme(data.theme);
      if (!theme) return null;
      return { theme, ts: Number(parsed.ts || 0) };
    } catch (_) {
      return null;
    }
  }

  function writeSettingsCache(theme) {
    try {
      localStorage.setItem(
        SETTINGS_CACHE_KEY,
        JSON.stringify({
          version: SETTINGS_CACHE_VERSION,
          ts: Date.now(),
          data: { theme },
        })
      );
    } catch (_) {}
  }

  function readStoredTheme() {
    const cache = readSettingsCache();
    if (cache && cache.theme) {
      return cache.theme;
    }

    try {
      const value = localStorage.getItem(STORAGE_KEY);
      const legacyTheme = normalizeTheme(value);
      if (legacyTheme) {
        writeSettingsCache(legacyTheme);
      }
      return legacyTheme;
    } catch (_) {
      return "";
    }
  }

  function detectSystemTheme() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? THEME_DARK
      : THEME_LIGHT;
  }

  function getActiveTheme() {
    // return readStoredTheme() || detectSystemTheme();
    return readStoredTheme() || THEME_LIGHT;
  }

  function updateThemeColor(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute("content", theme === THEME_DARK ? "#0f1a14" : "#dff0dd");
  }

  function applyTheme(theme, { persist = false } = {}) {
    const normalized = theme === THEME_DARK ? THEME_DARK : THEME_LIGHT;
    document.documentElement.setAttribute("data-theme", normalized);
    updateThemeColor(normalized);

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, normalized);
      } catch (_) {}
      writeSettingsCache(normalized);
    }

    window.dispatchEvent(
      new CustomEvent("toga:themechange", { detail: { theme: normalized } })
    );
  }

  function syncToggle() {
    const toggle = document.querySelector("[data-theme-toggle]");
    if (!toggle) return;
    toggle.checked = getActiveTheme() === THEME_DARK;
  }

  function bindToggle() {
    const toggle = document.querySelector("[data-theme-toggle]");
    if (!toggle) return;

    toggle.checked = getActiveTheme() === THEME_DARK;
    toggle.addEventListener("change", () => {
      applyTheme(toggle.checked ? THEME_DARK : THEME_LIGHT, { persist: true });
    });
  }

  applyTheme(getActiveTheme());

  window.addEventListener("DOMContentLoaded", () => {
    bindToggle();
    syncToggle();
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    applyTheme(getActiveTheme());
    syncToggle();
  });

  window.TOGATheme = {
    getTheme: getActiveTheme,
    setTheme: (theme) => applyTheme(theme, { persist: true }),
    getSettingsCache: readSettingsCache,
  };
})();
