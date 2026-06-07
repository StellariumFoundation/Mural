const CACHE_NAME = 'stellarium-mural-static-v5';
const API_CACHE_NAME = 'stellarium-mural-api-v5';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/main.js',
  '/index.css',
  '/manifest.json',
  '/neue_frutiger_world_regular.ttf',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== API_CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Exclude POST requests and any non-GET requests from service worker caching
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle Static Assets (CSS, JS, Fonts, Images, Manifest)
  const isStaticAsset = (
    requestUrl.pathname.endsWith('.css') || 
    requestUrl.pathname.endsWith('.js') || 
    requestUrl.pathname.endsWith('.ttf') || 
    requestUrl.pathname.endsWith('.svg') || 
    requestUrl.pathname.endsWith('.png') ||
    requestUrl.pathname.endsWith('.json')
  );

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseCopy);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Handle API Requests: Network First, Fallback to Cache
  if (requestUrl.pathname.startsWith('/api/')) {
    // Exclude actual media download/stream endpoints to avoid massive memory caching
    if (requestUrl.pathname.includes('/api/media/')) {
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseCopy = networkResponse.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseCopy);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Handle Static Pages & "/" Navigation: Network First with Integrity Validation
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache the latest version of index/home page only if it's our real app
        if (networkResponse.status === 200 && (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html')) {
          const responseCopy = networkResponse.clone();
          responseCopy.text().then((text) => {
            // Guarantee we don't cache sandboxed/transit cookie compliance checks
            if (text.includes('id="root"')) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
              });
            } else {
              console.warn('[Service Worker] Bypassed caching non-application loading page context.');
            }
          }).catch(() => {});
        }
        return networkResponse;
      })
      .catch(() => {
        // Retrieve from cache if completely offline
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match('/');
        });
      })
  );
});
