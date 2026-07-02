/* MILITOPO Participante · PWA independiente */
const CACHE_NAME="militopo-participante-v2-ui";
const APP_SHELL=["./","./index.html","./runner.html","./styles.css","./app.js","./manifest.webmanifest","./icons/participante-192.png","./icons/participante-512.png","../js/live/live-phase2.js"];
self.addEventListener("install",event=>{self.skipWaiting();event.waitUntil((async()=>{const cache=await caches.open(CACHE_NAME);await Promise.allSettled(APP_SHELL.map(url=>cache.add(new Request(url,{cache:"reload"}))));})())});
self.addEventListener("activate",event=>{event.waitUntil((async()=>{const names=await caches.keys();await Promise.all(names.filter(name=>name.startsWith("militopo-participante-")&&name!==CACHE_NAME).map(name=>caches.delete(name)));await self.clients.claim();})())});
self.addEventListener("fetch",event=>{
  const request=event.request;if(request.method!=="GET")return;const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==="navigate"){
    event.respondWith((async()=>{try{const response=await fetch(request);const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone()).catch(()=>{});return response}catch(_){return (await caches.match("./index.html"))||(await caches.match("./"))}})());return;
  }
  event.respondWith((async()=>{const cached=await caches.match(request,{ignoreSearch:true});const network=fetch(request).then(async response=>{if(response&&response.ok){const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone()).catch(()=>{})}return response}).catch(()=>null);return cached||(await network)||new Response("",{status:503,statusText:"Offline"})})());
});
