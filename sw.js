/**
 * CounterSync Offline PWA Service Worker
 * Bulletproof offline asset caching for outdoor festival tents & remote fairgrounds.
 */

const CACHE_NAME = 'countersync-cache-v12';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/qrcode.js',
  './js/seed.js',
  './js/store.js',
  './js/app.js',
  './icons/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg'
];

self.addEventListener('install', (evt) => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evt) => {
  // Network first with cache fallback for fresh updates, 100% offline resilient
  evt.respondWith(
    fetch(evt.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && evt.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(evt.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(evt.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (evt.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
