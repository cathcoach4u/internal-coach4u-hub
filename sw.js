const CACHE_NAME = 'coach4u-crm-v81';
const ASSETS = [
  '/internal-coach4u-hub/',
  '/internal-coach4u-hub/index.html',
  '/internal-coach4u-hub/intake.html',
  '/internal-coach4u-hub/bot.html',
  '/internal-coach4u-hub/icon-192.png',
  '/internal-coach4u-hub/icon-512.png',
  '/internal-coach4u-hub/manifest.json',
  '/internal-coach4u-hub/bot-icon-192.svg',
  '/internal-coach4u-hub/bot-icon-512.svg',
  '/internal-coach4u-hub/bot-manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
