(function () {
  const $ = (sel) => document.querySelector(sel);
  const statusEl = () => $("#nb-status");
  const listEl = () => $("#nb-list");

  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function progressHint(id) {
    try {
      const raw = localStorage.getItem("nb-scroll:" + id);
      if (!raw) return "";
      const s = JSON.parse(raw);
      if (!s || !(s.y > 120 || s.hash)) return "";
      return '<span class="nb-card-progress">есть место чтения</span>';
    } catch (_) {
      return "";
    }
  }

  function render(items) {
    const root = listEl();
    if (!root) return;
    if (!items.length) {
      root.innerHTML = "<p class=\"status-line\">Пока нет тетрадей в notebooks.json</p>";
      return;
    }
    root.innerHTML = items
      .map(
        (it) => `
      <a class="nb-card" href="${it.href}">
        <span class="nb-card-title">${escapeHtml(it.title)}</span>
        <span class="nb-card-sub">${escapeHtml(it.subject || "")}</span>
        ${progressHint(it.id)}
      </a>`
      )
      .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function loadList({ force } = {}) {
    const st = statusEl();
    if (st) st.textContent = "Обновление…";
    try {
      const url = "./notebooks.json" + (force ? `?t=${Date.now()}` : "");
      const res = await fetch(url, { cache: force ? "no-cache" : "default" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      render(items);
      if (st) st.textContent = items.length + " тетрад · открой в этой или новой вкладке";
      if (force) toast("Список обновлён");
    } catch (e) {
      if (st) st.innerHTML = '<span class="err">не удалось загрузить notebooks.json</span>';
      toast("Ошибка загрузки");
    }
  }

  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js?v=17").then((reg) => {
      reg.update().catch(() => {});
    }).catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("#btn-refresh-nb")?.addEventListener("click", () => loadList({ force: true }));
    loadList();
    registerSW();
  });
})();
