/*
 * ПОЛКА · service worker.
 * Приложение должно открываться офлайн и обновляться без потери данных:
 * localStorage живёт отдельно от кэша.
 */

const VERSION = 'polka-app-v9';
const CACHE = VERSION;
const OFFLINE_URL = './index.html';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/shell.css',
  './css/screens/pantry.css',
  './css/screens/recipes.css',
  './css/screens/plan.css',
  './css/screens/shopping.css',
  './css/screens/more.css',
  './js/data.js',
  './js/engine.js',
  './js/app.js',
  './js/store.js',
  './js/router.js',
  './js/ui.js',
  './js/pwa.js',
  './js/version.js',
  './js/analytics.js',
  './js/scanner.js',
  './js/lookup.js',
  './js/screens/pantry.js',
  './js/screens/recipes.js',
  './js/screens/plan.js',
  './js/screens/shopping.js',
  './js/screens/more.js',
  './assets/fonts.css',
  './assets/favicon.svg',
  './assets/vendor/zxing.min.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/fonts/bitter-normal-cyrillic-ext.woff2',
  './assets/fonts/bitter-normal-cyrillic.woff2',
  './assets/fonts/bitter-normal-latin-ext.woff2',
  './assets/fonts/bitter-normal-latin.woff2',
  './assets/fonts/bitter-italic-cyrillic-ext.woff2',
  './assets/fonts/bitter-italic-cyrillic.woff2',
  './assets/fonts/bitter-italic-latin-ext.woff2',
  './assets/fonts/bitter-italic-latin.woff2',
  './assets/fonts/golos-text-cyrillic-ext.woff2',
  './assets/fonts/golos-text-cyrillic.woff2',
  './assets/fonts/golos-text-latin-ext.woff2',
  './assets/fonts/golos-text-latin.woff2',
  './assets/fonts/pt-mono-cyrillic-ext.woff2',
  './assets/fonts/pt-mono-cyrillic.woff2',
  './assets/fonts/pt-mono-latin-ext.woff2',
  './assets/fonts/pt-mono-latin.woff2'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key !== CACHE;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isCacheable(response) {
  return response && response.status === 200 && response.type === 'basic';
}

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        const copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(OFFLINE_URL, copy); });
        return response;
      }).catch(function () {
        return caches.match(OFFLINE_URL).then(function (cached) {
          return cached || caches.match('./');
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      const network = fetch(request).then(function (response) {
        if (isCacheable(response)) {
          const copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
