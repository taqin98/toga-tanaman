(function () {
  const SPLASH_SESSION_KEY = "toga:splash:shown";
  const rootEl = document.documentElement;
  const isInstalledApp = () =>
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true ||
    document.referrer.startsWith("android-app://");

  const splashShownAt = Date.now();
  let splashHidden = false;

  const isSplashAlreadyShown = () => {
    try {
      return sessionStorage.getItem(SPLASH_SESSION_KEY) === "1";
    } catch (_) {
      return false;
    }
  };

  const markSplashShown = () => {
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    } catch (_) {}
  };

  const shouldShowSplash = isInstalledApp() && !isSplashAlreadyShown();
  if (!shouldShowSplash) {
    rootEl.classList.remove("pwa-launch-pending");
    rootEl.classList.add("pwa-launch-ready");
  }

  if (shouldShowSplash) {
    rootEl.classList.add("pwa-launch-pending");
    rootEl.classList.remove("pwa-launch-ready");
    // Tandai sejak splash ditampilkan agar dalam sesi yang sama tidak tampil lagi.
    markSplashShown();
    let splashStyle = null;
    const existingSplash = document.getElementById("pwaBootSplash");
    const splashEl = existingSplash || document.createElement("div");

    if (!existingSplash) {
      splashStyle = document.createElement("style");
      splashStyle.textContent = `
        .pwa-launch-splash {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          background: linear-gradient(150deg, #10352a, #1f7a3e);
          color: #f3fbf8;
          font-family: "Plus Jakarta Sans", "Segoe UI", sans-serif;
          opacity: 1;
          transition: opacity 0.32s ease;
        }
        .pwa-launch-splash.is-hide {
          opacity: 0;
          pointer-events: none;
        }
        .pwa-launch-splash__inner {
          display: grid;
          justify-items: center;
          gap: 10px;
          text-align: center;
          padding: 18px;
        }
        .pwa-launch-splash__logo {
          width: 72px;
          height: 72px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.35);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.26);
          background: rgba(255, 255, 255, 0.16);
          object-fit: cover;
          animation: pwaLogoPulse 1.4s ease-in-out infinite;
        }
        .pwa-launch-splash__title {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.2px;
        }
        .pwa-launch-splash__loading {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: rgba(243, 251, 248, 0.92);
        }
        .pwa-launch-splash__spinner {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.28);
          border-top-color: #ffffff;
          animation: pwaSpin 0.9s linear infinite;
        }
        @keyframes pwaSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes pwaLogoPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.045); }
        }
      `;
      document.head.appendChild(splashStyle);

      splashEl.className = "pwa-launch-splash";
      splashEl.innerHTML = `
        <div class="pwa-launch-splash__inner">
          <img class="pwa-launch-splash__logo" src="assets/icons/icon-192.png" alt="Logo TOGA" />
          <div class="pwa-launch-splash__title">TOGA RT 09</div>
          <div class="pwa-launch-splash__loading" aria-live="polite">
            <span class="pwa-launch-splash__spinner" aria-hidden="true"></span>
            <span>Memuat aplikasi...</span>
          </div>
        </div>
      `;
      document.body.appendChild(splashEl);
    }

    const hideSplash = () => {
      if (splashHidden) return;
      splashHidden = true;
      splashEl.classList.add("is-hide");
      setTimeout(() => {
        splashEl.remove();
        if (splashStyle) splashStyle.remove();
        rootEl.classList.remove("pwa-launch-pending");
        rootEl.classList.add("pwa-launch-ready");
      }, 380);
    };

    window.addEventListener("load", () => {
      const minVisibleMs = 2000;
      const waitMs = Math.max(0, minVisibleMs - (Date.now() - splashShownAt));
      setTimeout(hideSplash, waitMs);
    });

    setTimeout(hideSplash, 5000);
  }

  let refreshingAfterUpdate = false;

  function promptServiceWorkerUpdate(registration) {
    if (!registration || !registration.waiting) return;
    const shouldUpdate = window.confirm(
      "Versi terbaru aplikasi tersedia. Muat ulang sekarang?"
    );
    if (!shouldUpdate) return;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  function bindServiceWorkerUpdates(registration) {
    if (!registration) return;

    if (registration.waiting) {
      promptServiceWorkerUpdate(registration);
    }

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state !== "installed") return;
        if (!navigator.serviceWorker.controller) return;
        promptServiceWorkerUpdate(registration);
      });
    });

    setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 60 * 1000);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshingAfterUpdate) return;
      refreshingAfterUpdate = true;
      window.location.reload();
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then((registration) => {
          console.log("SW registered:", registration.scope);
          bindServiceWorkerUpdates(registration);
        })
        .catch((error) => {
          console.log("SW registration failed:", error);
        });
    });
  }

  function initConnectionBanner() {
    const banner = document.createElement("div");
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.style.position = "fixed";
    banner.style.left = "50%";
    banner.style.top = "12px";
    banner.style.transform = "translateX(-50%)";
    banner.style.zIndex = "10001";
    banner.style.padding = "8px 12px";
    banner.style.borderRadius = "999px";
    banner.style.fontSize = "12px";
    banner.style.fontWeight = "700";
    banner.style.transition = "opacity 180ms ease";
    banner.style.pointerEvents = "none";
    banner.style.opacity = "0";
    banner.style.display = "none";
    document.body.appendChild(banner);

    let hideTimer = null;

    const show = (message, kind, autoHideMs = 0) => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      banner.textContent = message;
      if (kind === "offline") {
        banner.style.background = "rgba(140, 35, 35, 0.92)";
        banner.style.color = "#fff";
      } else {
        banner.style.background = "rgba(31, 122, 62, 0.92)";
        banner.style.color = "#fff";
      }
      banner.style.display = "block";
      banner.style.opacity = "1";

      if (autoHideMs > 0) {
        hideTimer = setTimeout(() => {
          banner.style.opacity = "0";
          setTimeout(() => {
            banner.style.display = "none";
          }, 220);
        }, autoHideMs);
      }
    };

    const sync = () => {
      if (navigator.onLine) {
        show("Koneksi kembali online.", "online", 2400);
        return;
      }
      show("Anda sedang offline. Data mungkin terbatas dari cache.", "offline");
    };

    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    if (!navigator.onLine) sync();
  }

  initConnectionBanner();

  const bannerEl = document.getElementById("installBanner");
  const installBtn = document.getElementById("installBtn");
  const dismissBtn = document.getElementById("dismissInstallBtn");

  if (!bannerEl || !installBtn || !dismissBtn) return;

  const isIosSafari = () => {
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    return isIos && isSafari;
  };

  let deferredPrompt = null;

  const showBanner = () => {
    bannerEl.classList.remove("hidden");
  };

  const hideBanner = () => {
    bannerEl.classList.add("hidden");
  };

  if (isInstalledApp()) {
    hideBanner();
    return;
  }

  if (isIosSafari()) {
    const textEl = bannerEl.querySelector(".install-text");
    if (textEl) {
      textEl.textContent =
        "Untuk memasang aplikasi, buka menu Share lalu pilih Add to Home Screen.";
    }
    installBtn.classList.add("hidden");
    showBanner();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showBanner();
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    hideBanner();
  });

  dismissBtn.addEventListener("click", () => {
    hideBanner();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideBanner();
  });
})();
