(function () {
  const THEME_KEY = "ucheba-theme";
  const nbId =
    document.documentElement.getAttribute("data-nb-id") ||
    (location.pathname.split("/").pop() || "notebook").replace(/\.html$/i, "");
  const SCROLL_KEY = "nb-scroll:" + nbId;
  const SIDE_KEY = "nb-side:" + nbId;
  const title =
    document.documentElement.getAttribute("data-nb-title") ||
    document.title ||
    "Тетрадь";

  function themeNow() {
    try {
      const s = localStorage.getItem(THEME_KEY);
      if (s === "light" || s === "dark") return s;
    } catch (_) {}
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function applyTheme(t) {
    const theme = t === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f6f8fa" : "#0d1117");
    const btn = document.getElementById("nb-btn-theme");
    if (btn) btn.textContent = theme === "light" ? "◐" : "◑";
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {}
  }

  function readScroll() {
    try {
      return JSON.parse(localStorage.getItem(SCROLL_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function saveScroll() {
    try {
      localStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({
          y: Math.round(window.scrollY || window.pageYOffset || 0),
          hash: location.hash || "",
          side: document.documentElement.getAttribute("data-nb-side") || "",
          t: Date.now(),
        })
      );
    } catch (_) {}
  }

  let scrollTimer = null;
  function onScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(saveScroll, 250);
  }

  function restoreSide(side) {
    if (!side) return;
    const btn = document.querySelector(`#sides button[data-side="${side}"]`);
    if (btn) btn.click();
    document.documentElement.setAttribute("data-nb-side", side);
  }

  function wireGeometrySides() {
    const nav = document.getElementById("sides");
    if (!nav) return;
    nav.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-side]");
      if (!b) return;
      const side = b.getAttribute("data-side");
      document.documentElement.setAttribute("data-nb-side", side);
      try {
        localStorage.setItem(SIDE_KEY, side);
      } catch (_) {}
      saveScroll();
    });
  }

  function buildChrome(saved) {
    const bar = document.createElement("div");
    bar.className = "nb-chrome";
    bar.innerHTML = `
      <a href="../notebooks.html">← Тетради</a>
      <a href="../index.html">Расписание</a>
      <span class="nb-chrome-title">${escapeHtml(title)}</span>
      <div class="nb-chrome-actions">
        <button type="button" class="nb-resume" id="nb-btn-resume" hidden>Продолжить</button>
        <button type="button" id="nb-btn-theme" title="Тема">◑</button>
      </div>`;
    document.body.prepend(bar);

    document.getElementById("nb-btn-theme")?.addEventListener("click", () => {
      applyTheme(themeNow() === "light" ? "dark" : "light");
    });

    const resume = document.getElementById("nb-btn-resume");
    if (saved && (saved.y > 120 || saved.hash)) {
      resume.hidden = false;
      resume.addEventListener("click", () => {
        if (saved.side) restoreSide(saved.side);
        if (saved.hash) {
          try {
            location.hash = saved.hash;
          } catch (_) {}
        }
        window.scrollTo({ top: saved.y || 0, behavior: "smooth" });
        resume.hidden = true;
      });
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function autoRestore(saved) {
    if (!saved) return;
    if (saved.side) restoreSide(saved.side);
    // Не прыгать, если открыли по якорю извне
    if (location.hash && location.hash.length > 1) return;
    if (saved.hash) {
      try {
        history.replaceState(null, "", saved.hash);
      } catch (_) {}
    }
    if (saved.y > 40) {
      requestAnimationFrame(() => {
        window.scrollTo(0, saved.y);
        setTimeout(() => window.scrollTo(0, saved.y), 50);
      });
    }
  }

  applyTheme(themeNow());
  const saved = readScroll();
  let sideSaved = null;
  try {
    sideSaved = localStorage.getItem(SIDE_KEY);
  } catch (_) {}

  function boot() {
    if (!document.body) return;
    buildChrome(saved);
    wireGeometrySides();
    const side = (saved && saved.side) || sideSaved;
    if (side) restoreSide(side);
    autoRestore(saved);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("hashchange", saveScroll);
    window.addEventListener("pagehide", saveScroll);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveScroll();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
