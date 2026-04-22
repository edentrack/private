// Service worker — network-first for HTML, cache-first for assets.
// Key rule: NEVER cache index.html (it references hashed chunks that change on deploy).

const CACHE_VERSION = 'v4';
const STATIC_CACHE = `edentrack-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `edentrack-runtime-${CACHE_VERSION}`;

const STATIC_ASSETS = ['/offline.html'];

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
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Navigation requests (HTML): always network-first.
  // Falls back to offline.html only when truly offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Supabase API: network-first, no caching (data must be fresh).
  if (url.hostname.includes('supabase')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'Offline — data will sync when reconnected' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Static assets (JS/CSS/images): cache-first, populate on miss.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => undefined);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notifications (for future task reminders / alerts)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Edentrack';
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.tag || 'notification',
    requireInteraction: data.requireInteraction || false,
    data: data.data || {},
    vibrate: [200, 100, 200],
    actions: data.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const data = event.notification.data;
  let urlToOpen = data?.actionUrl || '/';
  if (!urlToOpen.startsWith('http')) {
    urlToOpen = '#' + (urlToOpen.startsWith('/') ? urlToOpen : '/' + urlToOpen);
  }

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        if (clientList.length > 0) {
          const client = clientList[0];
          if ('focus' in client) client.focus();
          client.postMessage({ type: 'notification-click', actionUrl: urlToOpen, data });
          return;
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen.startsWith('#') ? '/' : urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', () => {});
