(() => {
  const STORAGE_USER_KEY = "toga:auth:user:v2";
  const STORAGE_TOKEN_KEY = "toga:auth:token:v1";
  const LEGACY_USER_KEY = "toga:auth:user:v1";
  const AUTH_EVENT = "toga:authchange";
  const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
  const AUTH_TIMEOUT_MS = 12000;
  const AUTH_STATUS_MS = 3000;
  let googleScriptPromise = null;
  let googleIdentityClientId = "";
  let googleIdentityHandlers = {};
  let authStatusTimer = 0;

  function getConfig() {
    const config = window.TOGA_CONFIG || {};
    return {
      authUsers: Array.isArray(config.authUsers) ? config.authUsers : [],
      googleClientId: String(config.googleClientId || "").trim(),
      allowedGoogleEmails: Array.isArray(config.allowedGoogleEmails)
        ? config.allowedGoogleEmails
        : [],
      authApiUrl: String(config.authApiUrl || "").trim(),
      aiChatUrl: String(config.aiChatUrl || "").trim(),
    };
  }

  function normalizeUser(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw.id || raw.username || raw.email || "").trim();
    if (!id) return null;
    return {
      id,
      username: String(raw.username || "").trim(),
      email: String(raw.email || "").trim(),
      displayName:
        String(raw.displayName || raw.name || raw.username || raw.email || "Pengguna").trim() ||
        "Pengguna",
      role: String(raw.role || "editor").trim() || "editor",
      provider: String(raw.provider || "password").trim() || "password",
      avatar: String(raw.avatar || "").trim(),
      loginAt: Number(raw.loginAt || Date.now()) || Date.now(),
    };
  }

  function deriveAuthApiBase() {
    const config = getConfig();
    if (config.authApiUrl) {
      return config.authApiUrl.replace(/\/+$/g, "");
    }

    if (config.aiChatUrl) {
      try {
        const url = new URL(config.aiChatUrl, window.location.href);
        return `${url.origin}/api/auth`;
      } catch (_) {}
    }

    return "";
  }

  const AUTH_API_BASE = deriveAuthApiBase();

  function hasAuthBackend() {
    return !!AUTH_API_BASE;
  }

  function readToken() {
    try {
      return String(localStorage.getItem(STORAGE_TOKEN_KEY) || "").trim();
    } catch (_) {
      return "";
    }
  }

  function readUser() {
    try {
      const nextRaw = localStorage.getItem(STORAGE_USER_KEY);
      if (nextRaw) {
        return normalizeUser(JSON.parse(nextRaw));
      }

      const legacyRaw = localStorage.getItem(LEGACY_USER_KEY);
      if (legacyRaw) {
        const legacyUser = normalizeUser(JSON.parse(legacyRaw));
        if (legacyUser) {
          localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(legacyUser));
        }
        localStorage.removeItem(LEGACY_USER_KEY);
        return legacyUser;
      }
    } catch (_) {}

    return null;
  }

  function writeSession(session) {
    const token = String(session?.token || "").trim();
    const user = normalizeUser(session?.user);

    try {
      if (token) {
        localStorage.setItem(STORAGE_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(STORAGE_TOKEN_KEY);
      }

      if (user) {
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_USER_KEY);
      }

      localStorage.removeItem(LEGACY_USER_KEY);
    } catch (_) {}

    dispatchAuthChange(user);
    return user;
  }

  function clearSession() {
    return writeSession({ token: "", user: null });
  }

  function dispatchAuthChange(user) {
    document.documentElement.setAttribute("data-auth", user ? "in" : "out");
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { user } }));
  }

  function getAuthUsers() {
    return getConfig().authUsers
      .map((item) => (item && typeof item === "object" ? item : null))
      .filter(Boolean);
  }

  function loginWithPasswordFallback(username, password) {
    const cleanUsername = String(username || "").trim().toLowerCase();
    const cleanPassword = String(password || "");
    const matched = getAuthUsers().find((user) => {
      return (
        String(user.username || "").trim().toLowerCase() === cleanUsername &&
        String(user.password || "") === cleanPassword
      );
    });

    if (!matched) {
      throw new Error("Username atau password tidak cocok.");
    }

    return writeSession({
      token: "",
      user: {
        id: matched.username,
        username: matched.username,
        displayName: matched.displayName || matched.name || matched.username,
        role: matched.role || "editor",
        provider: "password",
        loginAt: Date.now(),
      },
    });
  }

  function decodeJwtPayload(token) {
    const part = String(token || "").split(".")[1] || "";
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join("")
    );
    return JSON.parse(json);
  }

  function loginWithGoogleFallback(credential) {
    const payload = decodeJwtPayload(credential);
    const config = getConfig();
    if (!payload || !payload.email) {
      throw new Error("Token Google tidak valid.");
    }
    if (!payload.email_verified) {
      throw new Error("Akun Google belum terverifikasi.");
    }

    const allowedEmails = config.allowedGoogleEmails.map((item) =>
      String(item || "").trim().toLowerCase()
    );
    const email = String(payload.email || "").trim().toLowerCase();
    if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
      throw new Error("Akun Google ini belum diizinkan untuk mengelola jadwal.");
    }

    return writeSession({
      token: "",
      user: {
        id: payload.sub || email,
        email,
        displayName: payload.name || payload.given_name || payload.email,
        avatar: payload.picture || "",
        role: "editor",
        provider: "google",
        loginAt: Date.now(),
      },
    });
  }

  function isAuthenticated() {
    return !!readUser();
  }

  function getLoginUrl() {
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const currentSearch = window.location.search || "";
    const currentHash = window.location.hash || "";
    const next = `${currentPath}${currentSearch}${currentHash}`;
    return `account.html?next=${encodeURIComponent(next)}`;
  }

  function ensureAuthenticated(message) {
    if (isAuthenticated()) return true;
    if (message) {
      window.alert(message);
    }
    window.location.href = getLoginUrl();
    return false;
  }

  async function requestAuth(path, options = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

    try {
      const headers = new Headers(options.headers || {});
      headers.set("Accept", "application/json");

      const body = options.body;
      const token = readToken();
      if (body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch(`${AUTH_API_BASE}${path}`, {
        method: options.method || "GET",
        headers,
        body,
        signal: controller.signal,
      });

      let data = {};
      try {
        data = await response.json();
      } catch (_) {}

      if (!response.ok || (data && data.ok === false)) {
        throw new Error(
          String(data?.error || `Auth request gagal (${response.status || "error"}).`)
        );
      }

      return data;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function loginWithPassword(username, password) {
    if (!hasAuthBackend()) {
      return loginWithPasswordFallback(username, password);
    }

    const data = await requestAuth("/login", {
      method: "POST",
      body: JSON.stringify({
        username: String(username || "").trim(),
        password: String(password || ""),
      }),
    });

    return writeSession({
      token: data.token,
      user: data.user,
    });
  }

  async function loginWithGoogleCredential(credential) {
    if (!hasAuthBackend()) {
      return loginWithGoogleFallback(credential);
    }

    const data = await requestAuth("/google", {
      method: "POST",
      body: JSON.stringify({
        credential: String(credential || "").trim(),
      }),
    });

    return writeSession({
      token: data.token,
      user: data.user,
    });
  }

  async function refreshSession() {
    if (!hasAuthBackend()) {
      const user = readUser();
      dispatchAuthChange(user);
      return user;
    }

    const token = readToken();
    if (!token) {
      clearSession();
      return null;
    }

    try {
      const data = await requestAuth("/session", { method: "GET" });
      return writeSession({
        token,
        user: data.user,
      });
    } catch (_) {
      clearSession();
      return null;
    }
  }

  async function logout() {
    if (hasAuthBackend() && readToken()) {
      try {
        await requestAuth("/logout", { method: "POST" });
      } catch (_) {}
    }
    clearSession();
  }

  function loadGoogleScript() {
    if (window.google?.accounts?.id) {
      return Promise.resolve(window.google);
    }
    if (googleScriptPromise) return googleScriptPromise;

    googleScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(window.google), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Gagal memuat Google Sign-In.")),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.src = GOOGLE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google);
      script.onerror = () => reject(new Error("Gagal memuat Google Sign-In."));
      document.head.appendChild(script);
    });

    return googleScriptPromise;
  }

  async function ensureGoogleIdentity(config) {
    await loadGoogleScript();
    if (!window.google?.accounts?.id) {
      throw new Error("Google Sign-In belum tersedia.");
    }

    if (googleIdentityClientId === config.googleClientId) {
      return window.google.accounts.id;
    }

    window.google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: async (response) => {
        try {
          const user = await loginWithGoogleCredential(response.credential);
          if (typeof googleIdentityHandlers.onSuccess === "function") {
            googleIdentityHandlers.onSuccess(user);
          }
        } catch (error) {
          if (typeof googleIdentityHandlers.onError === "function") {
            googleIdentityHandlers.onError(error);
          }
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    googleIdentityClientId = config.googleClientId;
    return window.google.accounts.id;
  }

  async function renderGoogleButton(container, handlers = {}) {
    const config = getConfig();
    if (!container) return false;
    container.innerHTML = "";

    if (!config.googleClientId) {
      return false;
    }

    googleIdentityHandlers = handlers && typeof handlers === "object" ? handlers : {};

    const googleIdentity = await ensureGoogleIdentity(config);
    googleIdentity.renderButton(container, {
      theme:
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "filled_black"
          : "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: Math.max(240, container.clientWidth || 240),
    });

    return true;
  }

  function injectAccountMenu() {
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".profile-menu__dropdown").forEach((dropdown) => {
      if (dropdown.querySelector('[data-auth-account-link="true"]')) return;
      const link = document.createElement("a");
      link.href = "account.html";
      link.textContent = "Akun";
      link.className = `profile-menu__item${currentPage === "account.html" ? " is-active" : ""}`;
      link.setAttribute("data-auth-account-link", "true");

      const settingsLink = Array.from(dropdown.querySelectorAll(".profile-menu__item")).find(
        (item) => /settings/i.test(item.textContent || "")
      );

      if (settingsLink) {
        dropdown.insertBefore(link, settingsLink);
      } else {
        dropdown.appendChild(link);
      }
    });
  }

  function setPendingState(root, isPending) {
    root.querySelectorAll("input, button").forEach((element) => {
      if (element.dataset.allowWhilePending === "true") return;
      element.disabled = isPending;
    });

    const submitButton = root.querySelector("[data-auth-submit]");
    const submitLabel = root.querySelector("[data-auth-submit-label]");
    if (submitButton) {
      submitButton.setAttribute("data-loading", isPending ? "true" : "false");
    }
    if (submitLabel) {
      submitLabel.textContent = isPending ? "Memproses..." : "Login";
    }
  }

  function clearAuthStatus() {
    const statusEl = document.querySelector("[data-auth-status]");
    window.clearTimeout(authStatusTimer);
    authStatusTimer = 0;
    if (!statusEl) return;
    statusEl.textContent = "";
    statusEl.hidden = true;
  }

  function showAuthStatus(message, duration = AUTH_STATUS_MS) {
    const statusEl = document.querySelector("[data-auth-status]");
    const text = String(message || "").trim();

    window.clearTimeout(authStatusTimer);
    authStatusTimer = 0;
    if (!statusEl) return;

    statusEl.textContent = text;
    statusEl.hidden = !text;
    if (!text) return;

    authStatusTimer = window.setTimeout(() => {
      clearAuthStatus();
    }, duration);
  }

  function syncAuthPage() {
    const root = document.querySelector("[data-auth-page]");
    if (!root) return;

    const user = readUser();
    const titleEl = root.querySelector("[data-auth-title]");
    const descEl = root.querySelector("[data-auth-desc]");
    const guestSection = root.querySelector("[data-auth-guest]");
    const userSection = root.querySelector("[data-auth-user]");
    const errorEl = root.querySelector("[data-auth-error]");
    const nameEl = root.querySelector("[data-auth-name]");
    const metaEl = root.querySelector("[data-auth-meta]");
    const avatarEl = root.querySelector("[data-auth-avatar]");
    const googleWrap = root.querySelector("[data-auth-google-wrap]");
    const googleButton = root.querySelector("[data-auth-google-button]");
    const googleHint = root.querySelector("[data-auth-google-hint]");
    const config = getConfig();

    if (guestSection) guestSection.hidden = !!user;
    if (userSection) userSection.hidden = !user;

    if (titleEl) {
      titleEl.textContent = user ? "Selamat" : "Masuk";
    }

    if (descEl) {
      descEl.textContent = user
        ? "Anda sudah login dan bisa mengelola jadwal, label warna, dan perubahan agenda."
        : "Login untuk mengelola jadwal, label warna, dan perubahan agenda.";
    }

    if (nameEl) {
      nameEl.textContent = user ? user.displayName : "-";
    }

    if (metaEl) {
      metaEl.textContent = user
        ? `${user.provider === "google" ? "Google" : "Username & password"} • ${
            user.email || user.username || user.role
          }`
        : " ";
    }

    if (avatarEl) {
      if (user?.avatar) {
        avatarEl.innerHTML = `<img src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.displayName)}" />`;
      } else {
        avatarEl.textContent = user
          ? String(user.displayName || "U").trim().charAt(0).toUpperCase()
          : "?";
      }
    }

    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }

    if (googleWrap) {
      googleWrap.hidden = !!user;
    }

    if (googleHint) {
      let labelHint = "Masuk dengan akun Google yang diizinkan.";
      let backToHome = `<a href="index.html">Kembali ke halaman utama</a>`;
      googleHint.innerHTML = config.googleClientId
        ? `${labelHint}<br>${backToHome}`
        : "Google Sign-In belum aktif. Isi googleClientId di assets/js/config.js.";
    }

    if (!user && googleButton && config.googleClientId) {
      renderGoogleButton(googleButton, {
        onSuccess: () => handlePostLogin(),
        onError: (error) => showAuthError(String(error?.message || error)),
      }).catch((error) => {
        showAuthError(String(error?.message || error));
      });
    } else if (googleButton) {
      googleButton.innerHTML = "";
    }
  }

  function showAuthError(message) {
    const errorEl = document.querySelector("[data-auth-error]");
    clearAuthStatus();
    if (!errorEl) return;
    const text = String(message || "").trim();
    errorEl.textContent = text;
    errorEl.hidden = !text;
  }

  function handlePostLogin(message = "Login berhasil.") {
    showAuthError("");
    syncAuthPage();
    showAuthStatus(message);

    // Register FCM push token after successful login (1x only)
    if (window.TOGA_FCM?.requestAndRegister) {
      window.TOGA_FCM.requestAndRegister();
    }

    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next !== "account.html") {
      window.setTimeout(() => {
        window.location.href = next;
      }, 450);
    }
  }

  function bindAuthPage() {
    const root = document.querySelector("[data-auth-page]");
    if (!root) return;

    root.querySelector("[data-auth-password-toggle]")?.addEventListener("click", (event) => {
      const button = event.currentTarget;
      const passwordInput = root.querySelector("#authPassword");
      if (!button || !passwordInput) return;

      const nextVisible = passwordInput.type === "password";
      passwordInput.type = nextVisible ? "text" : "password";
      button.setAttribute("aria-pressed", nextVisible ? "true" : "false");
      button.setAttribute(
        "aria-label",
        nextVisible ? "Sembunyikan password" : "Tampilkan password"
      );
    });

    root.querySelector("[data-auth-login-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const username = form.querySelector("[name='username']")?.value || "";
      const password = form.querySelector("[name='password']")?.value || "";
      const passwordInput = form.querySelector("#authPassword");
      const passwordToggle = root.querySelector("[data-auth-password-toggle]");

      setPendingState(root, true);
      try {
        await loginWithPassword(username, password);
        form.reset();
        if (passwordInput) {
          passwordInput.type = "password";
        }
        if (passwordToggle) {
          passwordToggle.setAttribute("aria-pressed", "false");
          passwordToggle.setAttribute("aria-label", "Tampilkan password");
        }
        handlePostLogin();
      } catch (error) {
        showAuthError(String(error?.message || error));
      } finally {
        setPendingState(root, false);
      }
    });

    root.querySelector("[data-auth-logout]")?.addEventListener("click", async () => {
      setPendingState(root, true);
      try {
        await logout();
        syncAuthPage();
        showAuthStatus("Anda telah logout.");
      } finally {
        setPendingState(root, false);
      }
    });

    syncAuthPage();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function init() {
    injectAccountMenu();
    dispatchAuthChange(readUser());
    bindAuthPage();
    refreshSession().then(syncAuthPage).catch(() => {});
  }

  window.addEventListener("DOMContentLoaded", init);
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_USER_KEY && event.key !== STORAGE_TOKEN_KEY) return;
    dispatchAuthChange(readUser());
    syncAuthPage();
  });
  window.addEventListener(AUTH_EVENT, syncAuthPage);

  window.TOGAAuth = {
    getUser: readUser,
    getToken: readToken,
    isAuthenticated,
    loginWithPassword,
    loginWithGoogleCredential,
    refreshSession,
    logout,
    renderGoogleButton,
    ensureAuthenticated,
    getLoginUrl,
    hasAuthBackend,
  };
})();
