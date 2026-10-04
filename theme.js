(function () {
  const KEY = "ucheba-theme";
  const meta = document.querySelector('meta[name="theme-color"]');

  function apply(theme) {
    const t = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    if (meta) meta.setAttribute("content", t === "light" ? "#f6f8fa" : "#0d1117");
    const btn = document.getElementById("btn-theme");
    if (btn) btn.textContent = t === "light" ? "◐" : "◑";
    try {
      localStorage.setItem(KEY, t);
    } catch (_) {}
  }

  function current() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (_) {}
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function toggle() {
    apply(current() === "light" ? "dark" : "light");
  }

  apply(current());
  document.addEventListener("DOMContentLoaded", () => {
    apply(current());
    document.getElementById("btn-theme")?.addEventListener("click", toggle);
  });
})();
