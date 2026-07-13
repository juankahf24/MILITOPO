/* MILITOPO Orientación · caché estable y separada · 2026-07-12 */
const CACHE_NAME = "militopo-orientacion-stable-v20260712-1";
const LEGACY_CACHE_PREFIXES = ["militopo-orientacion-", "militopo-page-snapshot-"];
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./js/app.js",
  "./js/live/live-phase2.js",
  "./js/core/app-main.js",
  "./js/pdf/pdf-professional.js",
  "./js/results/results-v16.js",
  "./js/results/results-classification-fix.js",
  "./css/styles.css",
  "./js/vendor/qr.js"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(
      CORE_ASSETS.map(url => new Request(url, { cache: "reload" }))
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

function belongsToParticipant(url) {
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return false;
  const relativePath = url.pathname.slice(scopePath.length);
  return relativePath === "participante" || relativePath.startsWith("participante/");
}

async function matchCurrentCache(cache, request) {
  return (await cache.match(request, { ignoreSearch: false })) ||
         (await cache.match(request, { ignoreSearch: true }));
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || belongsToParticipant(url)) return;

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
        return new Response(
          "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>MILITOPO offline</title><body style='font-family:monospace;background:#10190b;color:#f5e6c8;padding:24px'><h1>MILITOPO sin cobertura</h1><p>Esta página todavía no estaba guardada en este dispositivo. Ábrela una vez con cobertura antes de utilizarla sin conexión.</p></body>",
          { headers: { "Content-Type": "text/html;charset=utf-8" } }
        );
      }

      return new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});
