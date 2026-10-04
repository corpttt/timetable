const CACHE = "schedule-shell-v16";
const SHELL = [
  "./",
  "./index.html",
  "./notebooks.html",
  "./styles.css",
  "./styles.css?v=16",
  "./app.js",
  "./app.js?v=16",
  "./notebooks.js",
  "./notebooks.js?v=16",
  "./notebooks-chrome.js",
  "./notebooks-chrome.js?v=16",
  "./notebooks-chrome.css",
  "./notebooks-chrome.css?v=16",
  "./theme.js",
  "./theme.js?v=16",
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

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  if (isLiveJson(url) || isNotebookHtml(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(event.request, { cache: "no-cache" });
          if (res && res.ok) {
            await cache.put(event.request, res.clone());
            return res;
          }
        } catch {
          /* offline */
        }
        const hit =
          (await cache.match(event.request)) ||
          (await cache.match(event.request, { ignoreSearch: true }));
        if (hit) return hit;
        if (url.pathname.endsWith("overrides.json")) {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.pathname.endsWith("notebooks.json")) {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.pathname.endsWith("schedule.json")) {
          return new Response(JSON.stringify({ error: "offline", weeks: [], lessons: [] }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.error();
      })()
    );
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
