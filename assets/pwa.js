(function () {
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
