const CACHE='self-management-v3-2-goals-1';
const ASSETS=['./','index.html','config.js','manifest.webmanifest','styles-base-a.css','styles-base-b.css','styles-mobile.css','styles-notes.css','styles-v32-extra.css','app-v32-core.js','app-v32-views.js','app-v32-forms.js','app-v32-goals.js','app-v32-boot.js','assets/icon.svg','assets/icon-180.png','assets/icon-192.png','assets/icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request)))});
