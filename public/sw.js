// Service worker focused on preventing "stale index.html" issues.
// Key idea: never serve app navigations (HTML) cache-first.

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `edentrack-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `edentrack-runtime-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  // Keep this list tiny to avoid caching old HTML that references removed chunks.
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== STATIC_CACHE && name !== RUNTIME_CACHE) {
              return caches.delete(name);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  // For SPA navigations, always try network first so HTML stays fresh.
  // This prevents a cached index.html from pointing at missing hashed chunks after deploys.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // For other requests (JS/CSS/images), use cache-first with runtime population.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // Only cache successful, same-origin basic responses.
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => undefined)
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
