(function () {
  const KEY = "ucheba-flip-nb";
  const NOW_FLAG = "ucheba-flip-now";

  function appBase() {
    const p = location.pathname;
    if (p.includes("/notebooks/")) {
      return p.replace(/\/notebooks\/[^/]*$/, "/");
    }
    return p.replace(/[^/]*$/, "");
  }

  function hereRel() {
    const base = appBase();
    let rel = location.pathname.slice(base.length);
    if (!rel) rel = "index.html";
    return rel + location.search + location.hash;
  }

  function absFromRel(rel) {
    return appBase() + String(rel || "notebooks.html").replace(/^\//, "");
  }

  function onSchedule() {
    const p = location.pathname;
    return (
      /\/index\.html$/i.test(p) ||
      /\/timetable\/?$/i.test(p) ||
      (p.endsWith("/") && !p.includes("/notebooks"))
    );
  }

  function saveNotebookSpot() {
    if (onSchedule()) return;
    try {
      localStorage.setItem(KEY, hereRel());
    } catch (_) {}
  }

  function go() {
    if (onSchedule()) {
      let rel = "notebooks.html";
      try {
        rel = localStorage.getItem(KEY) || rel;
      } catch (_) {}
      location.href = absFromRel(rel);
      return;
    }
    saveNotebookSpot();
    try {
      sessionStorage.setItem(NOW_FLAG, "1");
    } catch (_) {}
    location.href = absFromRel("index.html");
  }

  function mount() {
    if (document.getElementById("fab-flip")) return;
    if (!onSchedule()) saveNotebookSpot();

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "fab-flip";
    btn.className = "fab-flip";
    btn.textContent = "⇄";
    btn.title = onSchedule()
      ? "В тетрадь (то же место)"
      : "В расписание · к сейчас";
    btn.setAttribute(
      "aria-label",
      onSchedule()
        ? "Перейти в тетрадь"
        : "Перейти в расписание к текущему времени"
    );
    btn.addEventListener("click", go);
    document.body.appendChild(btn);

    window.addEventListener("pagehide", saveNotebookSpot);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveNotebookSpot();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
