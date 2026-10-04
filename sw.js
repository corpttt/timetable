const CACHE = "schedule-shell-v22";
const SHELL = [
  "./",
  "./index.html",
  "./notebooks.html",
  "./styles.css",
  "./styles.css?v=22",
  "./app.js",
  "./app.js?v=22",
  "./notebooks.js",
  "./notebooks.js?v=22",
  "./notebooks-chrome.js",
  "./notebooks-chrome.js?v=22",
  "./notebooks-chrome.css",
  "./notebooks-chrome.css?v=22",
  "./flip.js",
  "./flip.js?v=22",
  "./theme.js",
  "./theme.js?v=22",
  "./manifest.json",
  "./schedule.json",
  "./overrides.json",
  "./notebooks.json",
  "./favicon.ico",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))).then(
        () => self.clients.claim()
      )
    )
  );
});

function isLiveJson(url) {
  const p = url.pathname;
  return (
    p.endsWith("/schedule.json") ||
    p.endsWith("schedule.json") ||
    p.endsWith("/overrides.json") ||
    p.endsWith("overrides.json") ||
    p.endsWith("/notebooks.json") ||
    p.endsWith("notebooks.json")
  );
}

function isNotebookHtml(url) {
  return url.pathname.includes("/notebooks/") && url.pathname.endsWith(".html");
}

function isShellHtml(url) {
  const p = url.pathname;
  return (
    /\/index\.html$/i.test(p) ||
    /\/notebooks\.html$/i.test(p) ||
    /\/timetable\/?$/i.test(p)
  );
}

function isShellAsset(url) {
  const p = url.pathname;
  return /\/(styles\.css|app\.js|notebooks\.js|notebooks-chrome\.(js|css)|flip\.js|theme\.js|sw\.js)$/i.test(
    p
  );
}

async function networkFirst(event) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(event.request, { cache: "no-cache" });
    if (res && res.ok) {
      await cache.put(event.request, res.clone());
      // also store bare path without query for offline
      try {
        const u = new URL(event.request.url);
        if (u.search) {
          const bare = new Request(u.origin + u.pathname);
          await cache.put(bare, res.clone());
        }
      } catch (_) {}
      return res;
    }
  } catch {
    /* offline */
  }
  return (
    (await cache.match(event.request)) ||
    (await cache.match(event.request, { ignoreSearch: true })) ||
    Response.error()
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  if (
    isLiveJson(url) ||
    isNotebookHtml(url) ||
    isShellHtml(url) ||
    isShellAsset(url) ||
    event.request.mode === "navigate"
  ) {
    event.respondWith(networkFirst(event));
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(event.request, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(event.request);
        if (res && res.ok && url.origin === self.location.origin) {
          cache.put(event.request, res.clone());
        }
        return res;
      } catch {
        if (event.request.mode === "navigate") {
          return (
            (await cache.match("./index.html")) ||
            (await cache.match("./")) ||
            Response.error()
          );
        }
        return Response.error();
      }
    })()
  );
});
