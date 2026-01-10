/* FC26 Manager Service Worker
   - App-shell caching for faster Xbox/TV startup
   - Same-origin only (avoids caching CDN/Firebase modules)
*/

const CACHE_VERSION = 'fc26mgr-v20260110-2';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.map((k) => (k === CACHE_VERSION ? null : caches.delete(k))))),
      self.clients.claim()
    ])
  );
});

function isSameOrigin(requestUrl) {
  try {
    return requestUrl.origin === self.location.origin;
  } catch {
    return false;
  }
}

function normalizePath(url) {
  // Ignore cache-busting query (e.g., script.js?v=...)
  return url.pathname;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!isSameOrigin(url)) return;

  const path = normalizePath(url);
  const isNav = req.mode === 'navigate' || (req.destination === 'document');

  // HTML: network-first (so updates arrive), fallback to cache
  if (isNav) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets: cache-first, then network
  const isAsset = (
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg') ||
    path.endsWith('.svg') ||
    path.endsWith('.webp') ||
    path.endsWith('.woff') ||
    path.endsWith('.woff2') ||
    path.endsWith('/manifest.json')
  );

  if (isAsset) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        });
      })
    );
  }
});
