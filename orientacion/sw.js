/* MILITOPO Orientación · QR salida/llegada compacto */
const MILITOPO_CACHE = "militopo-orientacion-v37-fase3b-inteligencia";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./js/app.js",
  "./js/live/live-phase2.js",
  "./js/config/iof-symbols-f.js",
  "./js/core/app-main.js",
  "./js/pdf/pdf-professional.js",
  "./js/results/results-v16.js",
  "./js/results/results-classification-fix.js",
  "./css/styles.css",
  "./js/vendor/qr.js",
  "./maps/index.json",
  "./js/qr.js",
  "./participante/",
  "./participante/index.html",
  "./participante/manifest.webmanifest"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(MILITOPO_CACHE);
    await Promise.allSettled(
      CORE_ASSETS.map(url => cache.add(new Request(url, { cache: "reload" })))
    );
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

async function cachedResponse(request) {
  return (await caches.match(request, { ignoreSearch: false })) ||
         (await caches.match(request, { ignoreSearch: true }));
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(MILITOPO_CACHE);
    try {
      const preload = await event.preloadResponse;
      const response = preload || await fetch(request);
      if (response && response.status !== 206) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch (err) {
      const cached = await cachedResponse(request);
      if (cached) return cached;

      if (request.mode === "navigate") {
        const fallback = await cachedResponse(new Request("./index.html")) ||
                         await cachedResponse(new Request("./"));
        if (fallback) return fallback;
        return new Response(
          "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>MILITOPO offline</title><body style='font-family:monospace;background:#10190b;color:#f5e6c8;padding:24px'><h1>MILITOPO sin cobertura</h1><p>Esta página todavía no estaba guardada en este dispositivo. Vuelve a abrirla una vez con cobertura antes de iniciar la carrera.</p></body>",
          { headers: { "Content-Type": "text/html;charset=utf-8" } }
        );
      }

      return new Response("", { status: 503, statusText: "Offline" });
    }
  })());
});
