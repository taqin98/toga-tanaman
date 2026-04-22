(() => {
  function createMenuItem(href, label, activeKey, currentKey, extraAttributes = "") {
    const isActive = activeKey && activeKey === currentKey ? " is-active" : "";
    return `<a class="profile-menu__item${isActive}" href="${href}"${extraAttributes}>${label}</a>`;
  }

  function createProfileMenu(activeMenu) {
    return `
      <details class="profile-menu">
        <summary class="profile-menu__trigger" aria-label="Buka menu pengguna">
          <svg class="profile-menu__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.7" />
            <path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
        </summary>
        <div class="profile-menu__dropdown">
          ${createMenuItem("profile.html", "Profile", activeMenu, "profile")}
          ${createMenuItem("account.html", "Akun", activeMenu, "account", ' data-auth-account-link="true"')}
          ${createMenuItem("settings.html", "Settings", activeMenu, "settings")}
        </div>
      </details>
    `;
  }

  function renderDefaultTopbar(root, options) {
    const header = document.createElement("header");
    header.className = "topbar";
    header.innerHTML = `
      <div class="top-wrap">
        <div class="top-wrap__main">
          <a class="back-btn" href="${options.backHref}" aria-label="Kembali ke Home">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="m15 6-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </a>
          <div>
            <h1 class="title"></h1>
            <p class="subtitle"${options.subtitleId ? ` id="${options.subtitleId}"` : ""}></p>
          </div>
        </div>
        <div class="top-wrap__actions">
          ${createProfileMenu(options.activeMenu)}
        </div>
      </div>
    `;

    header.querySelector(".title").textContent = options.title;
    header.querySelector(".subtitle").textContent = options.subtitle;
    return header;
  }

  function renderHomeTopbar(root, options) {
    const logoSrc =
      String(root.dataset.topbarLogoSrc || "").trim() || "assets/icons/icon-192.png";
    const logoAlt = String(root.dataset.topbarLogoAlt || "").trim() || "Logo TOGA";

    const header = document.createElement("header");
    header.className = "topbar";
    header.innerHTML = `
      <div class="brand">
        <div class="brand__main">
          <div class="logo">
            <img class="logo-mark" src="${logoSrc}" alt="${logoAlt}" />
          </div>
          <div class="brand__copy">
            <div class="title"></div>
            <div class="subtitle"${options.subtitleId ? ` id="${options.subtitleId}"` : ""}></div>
          </div>
        </div>
        <div class="brand__actions">
          ${createProfileMenu(options.activeMenu)}
        </div>
      </div>
    `;

    header.querySelector(".title").textContent = options.title;
    header.querySelector(".subtitle").textContent = options.subtitle;
    return header;
  }

  function renderTopbar(root) {
    const options = {
      variant: String(root.dataset.topbarVariant || "default").trim() || "default",
      title: String(root.dataset.topbarTitle || "").trim() || "TOGA RT 09",
      subtitle: String(root.dataset.topbarSubtitle || "").trim(),
      subtitleId: String(root.dataset.topbarSubtitleId || "").trim(),
      backHref: String(root.dataset.topbarBackHref || "index.html").trim() || "index.html",
      activeMenu: String(root.dataset.topbarActive || "").trim(),
    };

    const header =
      options.variant === "home"
        ? renderHomeTopbar(root, options)
        : renderDefaultTopbar(root, options);

    root.replaceWith(header);
  }

  document.querySelectorAll("[data-topbar]").forEach(renderTopbar);
})();
