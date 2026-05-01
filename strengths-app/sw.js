const CACHE_NAME = 'coach4u-strengths-v11';
const ASSETS = ['manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Never cache HTML — always fetch fresh so version updates are picked up immediately.
// Only cache the small static manifest/icons.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // HTML / navigation: always go to network. No cache fallback (would just serve stale).
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Other static assets: cache-first.
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
