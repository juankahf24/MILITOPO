/* MILITOPO Participante · caché separada · lector QR optimizado · 2026-07-12 */
const CACHE_NAME="militopo-participante-qr-optimizado-v20260712-1";
const APP_SHELL=[
  "./",
  "./index.html",
  "./runner.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/participante-192.png",
  "./icons/participante-512.png",
  "./icons/apple-touch-icon.png",
  "../js/live/live-phase2.js"
];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.map(url=>new Request(url,{cache:"reload"})));
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(
      names
        .filter(name=>name.startsWith("militopo-participante-")&&name!==CACHE_NAME)
        .map(name=>caches.delete(name))
    );
    await self.clients.claim();
  })());
});

async function matchCurrentCache(cache,request){
  return (await cache.match(request,{ignoreSearch:false}))||
         (await cache.match(request,{ignoreSearch:true}));
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;

  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==="navigate"){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME);
      try{
        const response=await fetch(request);
        if(response&&response.ok&&response.status!==206){
          cache.put(request,response.clone()).catch(()=>{});
        }
        return response;
      }catch(_){
        return (await matchCurrentCache(cache,request))||
               (await cache.match("./runner.html"))||
               (await cache.match("./index.html"))||
               (await cache.match("./"))||
               new Response("",{status:503,statusText:"Offline"});
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const cached=await matchCurrentCache(cache,request);
    const network=fetch(request).then(async response=>{
      if(response&&response.ok&&response.status!==206){
        cache.put(request,response.clone()).catch(()=>{});
      }
      return response;
    }).catch(()=>null);
    return cached||(await network)||new Response("",{status:503,statusText:"Offline"});
  })());
});
