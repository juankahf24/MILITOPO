/* MILITOPO Topografía · caché estable y separada · 2026-07-12 */
const CACHE_NAME = "militopo-topografia-stable-v20260712-1";
const LEGACY_CACHE_PREFIXES = ["militopo-topografia-", "militopo-pwa-"];
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/militopo-192.png",
  "./icons/militopo-512.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(
      APP_SHELL.map(url => new Request(url, { cache: "reload" }))
    );
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name !== CACHE_NAME && LEGACY_CACHE_PREFIXES.some(prefix => name.startsWith(prefix)))
        .map(name => caches.delete(name))
    );
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

function belongsToOrientation(url) {
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return false;
  const relativePath = url.pathname.slice(scopePath.length);
  return relativePath === "orientacion" || relativePath.startsWith("orientacion/");
}

async function matchCurrentCache(cache, request) {
  return (await cache.match(request, { ignoreSearch: false })) ||
         (await cache.match(request, { ignoreSearch: true }));
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || belongsToOrientation(url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const preload = request.mode === "navigate" ? await event.preloadResponse : null;
      const response = preload || await fetch(request);
      if (response && response.ok && response.status !== 206) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (_) {
      const cached = await matchCurrentCache(cache, request);
      if (cached) return cached;

      if (request.mode === "navigate") {
        const fallback = (await cache.match("./index.html")) || (await cache.match("./"));
        if (fallback) return fallback;
      }

      return new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});
