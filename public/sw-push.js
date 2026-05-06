/**
 * Service worker for web push notifications — Phase G.
 *
 * Handles two events:
 *   push       — Meta-equivalent for browsers. Shows a notification.
 *   notificationclick — when user taps the notification, focus existing
 *                       tab or open a new one.
 *
 * The actual subscribe/unsubscribe logic lives in pushNotifications.ts;
 * this file just receives push payloads and renders them.
 */

self.addEventListener('install', (event) => {
  // Activate this SW as soon as it's installed — no waiting for tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of any tabs already open before this SW activated.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: 'EdenTrack', body: event.data ? event.data.text() : '' };
  }

  const {
    title = 'EdenTrack',
    body = '',
    icon = '/icon-192.png',
    badge = '/icon-192.png',
    tag,
    data,
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: data || {},
      requireInteraction: false,
      // Use timestamp so multiple notifications stack visibly with their own time
      timestamp: Date.now(),
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      // Try to focus an existing tab. If none open, open a new one.
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Navigate to the target hash route if needed
          if (targetUrl !== '/') {
            try { client.navigate(targetUrl); } catch (_) {}
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })()
  );
});
