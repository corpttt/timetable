const CACHE = "schedule-shell-v30";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles.css?v=30",
  "./app.js",
  "./app.js?v=30",
  "./theme.js",
  "./theme.js?v=30",
  "./manifest.json",
  "./groups.json",
  "./schedule.json",
  "./schedules/Б81.json",
  "./schedules/Б82.json",
  "./schedules/Б83.json",
  "./schedules/Б84.json",
  "./overrides.json",
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

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isLiveJson(url) {
  const p = url.pathname;
  return (
    p.endsWith("/schedule.json") ||
    p.endsWith("schedule.json") ||
    p.endsWith("/groups.json") ||
    p.endsWith("groups.json") ||
    p.endsWith("/overrides.json") ||
    p.endsWith("overrides.json") ||
    /\/schedules\/[^/]+\.json$/i.test(p)
  );
}

function isShellHtml(url) {
  const p = url.pathname;
  return /\/index\.html$/i.test(p) || /\/timetable\/?$/i.test(p);
}

function isShellAsset(url) {
  const p = url.pathname;
  return /\/(styles\.css|app\.js|theme\.js|sw\.js)$/i.test(p);
}

async function putBoth(cache, request, res) {
  await cache.put(request, res.clone());
  try {
    const u = new URL(request.url);
    if (u.search) {
      await cache.put(new Request(u.origin + u.pathname), res.clone());
    }
  } catch (_) {}
}

/** Отдать кэш сразу, обновить в фоне — быстрый старт при медленной сети. */
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached =
    (await cache.match(event.request)) ||
    (await cache.match(event.request, { ignoreSearch: true }));

  const networkPromise = fetch(event.request, { cache: "no-cache" })
    .then(async (res) => {
      if (res && res.ok) await putBoth(cache, event.request, res);
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }
  return (await networkPromise) || Response.error();
}

async function networkFirst(event) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(event.request, { cache: "no-cache" });
    if (res && res.ok) {
      await putBoth(cache, event.request, res);
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

  // JSON расписания: кэш сразу (иначе 260 КБ с GitHub Pages тормозят старт)
  if (isLiveJson(url)) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  // HTML / JS / CSS: network-first, чтобы ↻ и смена версии доходили
  if (isShellHtml(url) || isShellAsset(url) || event.request.mode === "navigate") {
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
