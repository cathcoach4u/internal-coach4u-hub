const CACHE_NAME = 'coach4u-crm-v611';
const ASSETS = [
  '/internal-coach4u-hub/',
  '/internal-coach4u-hub/index.html',
  '/internal-coach4u-hub/manifest.json',
  '/internal-coach4u-hub/icon-192.png',
  '/internal-coach4u-hub/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if(url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
