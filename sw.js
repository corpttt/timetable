/* Schedule PWA — offline-first shell + JSON. */
const CACHE = "schedule-shell-v31";
const NETWORK_MS = 2500;

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles.css?v=31",
  "./app.js",
  "./app.js?v=31",
  "./theme.js",
  "./theme.js?v=31",
  "./manifest.json",
  "./groups.json",
  "./schedule.json",
  "./schedules/%D0%9181.json",
  "./schedules/%D0%9182.json",
  "./schedules/%D0%9183.json",
  "./schedules/%D0%9184.json",
  "./schedules/Б81.json",
  "./schedules/Б82.json",
  "./schedules/Б83.json",
  "./schedules/Б84.json",
  "./overrides.json",
  "./favicon.ico",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

function toAbs(url) {
  try {
    return new URL(url, self.location.href).href;
  } catch {
    return url;
  }
}

async function putAll(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const abs = toAbs(url);
        const res = await fetch(abs, { cache: "reload" });
        if (res && res.ok) {
          await cache.put(abs, res.clone());
          // also store without query / with decoded path variants
          const u = new URL(abs);
          if (u.search) {
            await cache.put(u.origin + u.pathname, res.clone());
          }
        }
      } catch (_) {
        /* skip one failed asset — do not fail whole install */
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await putAll(cache, SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ).then(() => self.clients.claim())
    )
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isLiveJson(url) {
  const p = decodeURIComponent(url.pathname);
  return (
    /\/(schedule|groups|overrides)\.json$/i.test(p) ||
    /\/schedules\/[^/]+\.json$/i.test(p)
  );
}

function isShellAsset(url) {
  const p = url.pathname;
  return /\/(styles\.css|app\.js|theme\.js|sw\.js|manifest\.json)$/i.test(p);
}

function isAppNavigate(url) {
  const p = url.pathname.replace(/\/+$/, "") || "/";
  return (
    /\/timetable$/i.test(p) ||
    /\/index\.html$/i.test(url.pathname) ||
    /\/timetable\/?$/i.test(url.pathname)
  );
}

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  const direct =
    (await cache.match(request)) ||
    (await cache.match(request, { ignoreSearch: true, ignoreVary: true }));
  if (direct) return direct;

  try {
    const url = new URL(request.url);
    const base = url.origin + url.pathname.replace(/\/index\.html$/i, "/");
    const candidates = [
      url.origin + url.pathname,
      url.origin + url.pathname.replace(/\/$/, "") + "/",
      url.origin + url.pathname.replace(/\/$/, "") + "/index.html",
      base,
      base.replace(/\/?$/, "/") + "index.html",
      toAbs("./"),
      toAbs("./index.html"),
    ];
    for (const href of [...new Set(candidates)]) {
      const hit =
        (await cache.match(href)) ||
        (await cache.match(href, { ignoreSearch: true }));
      if (hit) return hit;
    }
  } catch (_) {}
  return null;
}

async function putBoth(cache, request, res) {
  await cache.put(request, res.clone());
  try {
    const u = new URL(request.url);
    if (u.search) {
      await cache.put(u.origin + u.pathname, res.clone());
    }
  } catch (_) {}
}

async function fetchWithTimeout(request, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(request, { cache: "no-cache", signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Cache immediately; refresh in background when possible. */
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await fromCache(event.request);

  const networkPromise = fetchWithTimeout(event.request, NETWORK_MS)
    .then(async (res) => {
      if (res && res.ok) await putBoth(cache, event.request, res);
      return res;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }

  const net = await networkPromise;
  if (net && net.ok) return net;

  if (event.request.mode === "navigate" || isAppNavigate(new URL(event.request.url))) {
    return (
      (await fromCache(toAbs("./index.html"))) ||
      (await fromCache(toAbs("./"))) ||
      new Response("<!doctype html><meta charset=utf-8><title>Офлайн</title><p>Нет кэша. Открой расписание один раз онлайн.</p>", {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  }
  return new Response("", { status: 503, statusText: "Offline" });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (
    isLiveJson(url) ||
    isShellAsset(url) ||
    isAppNavigate(url) ||
    event.request.mode === "navigate" ||
    url.pathname.includes("/icons/")
  ) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  event.respondWith(staleWhileRevalidate(event));
});
