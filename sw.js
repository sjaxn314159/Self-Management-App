const CACHE='self-management-v3-3';
const ASSETS=['./','index.html','config.js','manifest.webmanifest','styles-base-a.css','styles-base-b.css','styles-mobile.css','app-core.js','app-views-a.js','app-views-b1.js','app-views-b2.js','app-bind.js','app-forms.js','app-boot.js','assets/icon.svg','assets/icon-180.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match('./'))));});
