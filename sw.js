const CACHE = "schedule-shell-v9";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles.css?v=9",
  "./app.js",
  "./app.js?v=9",
  "./manifest.json",
  "./schedule.json",
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

function isScheduleRequest(url) {
  return url.pathname.endsWith("/schedule.json") || url.pathname.endsWith("schedule.json");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  if (isScheduleRequest(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cleanReq = new Request(new URL("schedule.json", self.registration.scope).href, {
          credentials: "same-origin",
        });
        try {
          const res = await fetch(cleanReq, { cache: "no-cache" });
          if (res && res.ok) {
            await cache.put(cleanReq, res.clone());
            return res;
          }
        } catch {
          /* offline */
        }
        const hit =
          (await cache.match(cleanReq)) ||
          (await cache.match("./schedule.json")) ||
          (await cache.match(event.request));
        if (hit) return hit;
        return new Response(JSON.stringify({ error: "offline", weeks: [], lessons: [] }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      })()
    );
    return;
  }

  // App shell: cache first, then network
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
