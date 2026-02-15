(function () {
  const splashShownAt = Date.now();
  let splashHidden = false;

  const splashStyle = document.createElement("style");
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
    }
    .pwa-launch-splash__title {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.2px;
    }
  `;
  document.head.appendChild(splashStyle);

  const splashEl = document.createElement("div");
  splashEl.className = "pwa-launch-splash";
  splashEl.innerHTML = `
    <div class="pwa-launch-splash__inner">
      <img class="pwa-launch-splash__logo" src="assets/icons/icon-192.png" alt="Logo TOGA" />
      <div class="pwa-launch-splash__title">TOGA RT 09</div>
    </div>
  `;
  document.body.appendChild(splashEl);

  const hideSplash = () => {
    if (splashHidden) return;
    splashHidden = true;
    splashEl.classList.add("is-hide");
    setTimeout(() => {
      splashEl.remove();
      splashStyle.remove();
    }, 380);
  };

  window.addEventListener("load", () => {
    const minVisibleMs = 3000;
    const waitMs = Math.max(0, minVisibleMs - (Date.now() - splashShownAt));
    setTimeout(hideSplash, waitMs);
  });

  setTimeout(hideSplash, 5000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js")
        .then((registration) => {
          console.log("SW registered:", registration.scope);
        })
        .catch((error) => {
          console.log("SW registration failed:", error);
        });
    });
  }

  const bannerEl = document.getElementById("installBanner");
  const installBtn = document.getElementById("installBtn");
  const dismissBtn = document.getElementById("dismissInstallBtn");

  if (!bannerEl || !installBtn || !dismissBtn) return;

  const isInstalled = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    document.referrer.startsWith("android-app://");

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

  if (isInstalled()) {
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
