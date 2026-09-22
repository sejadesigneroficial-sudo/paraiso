const CACHE = 'paraiso-v2';
const ASSETS = [
  '/', '/index.html',
  '/logo.png', '/chihuahua.png', '/poodle.webp', '/shihtzu.jpg',
  '/bulldog.avif', '/spitz.jpg', '/pekinese.jpg', '/papillon.jpg',
  '/maltese.webp', '/british.jpg', '/bengal.jpg', '/mainecoon.avif', '/siames.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  if (url.includes('supabase') || url.includes('fonts.g') || url.includes('cdn.')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
