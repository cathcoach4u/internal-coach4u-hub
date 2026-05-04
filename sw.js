const CACHE_NAME = 'coach4u-crm-v395';
const ASSETS = [
  '/internal-coach4u-hub/',
  '/internal-coach4u-hub/index.html',
  '/internal-coach4u-hub/intake.html',
  '/internal-coach4u-hub/intake/thrivehq/',
  '/internal-coach4u-hub/intake/couples/',
  '/internal-coach4u-hub/intake/individual/',
  '/internal-coach4u-hub/portal/',
  '/internal-coach4u-hub/brain-pulse/',
  '/internal-coach4u-hub/connection-pulse/',
  '/internal-coach4u-hub/writing-partner/',
  '/internal-coach4u-hub/policies/cancellation/',
  '/internal-coach4u-hub/icon-192.png',
  '/internal-coach4u-hub/icon-512.png',
  '/internal-coach4u-hub/manifest.json'
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
