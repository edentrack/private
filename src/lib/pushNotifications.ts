/**
 * Push Notification Service
 * Handles browser push notifications for alerts
 */

interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: any;
  actions?: NotificationAction[];
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    return permission;
  }

  return Notification.permission;
}

/**
 * Check if notifications are supported and enabled
 */
export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

/**
 * Check if notifications are permitted
 */
export function isNotificationPermitted(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

/**
 * Show a browser notification
 */
export async function showNotification(options: PushNotificationOptions): Promise<void> {
  if (!isNotificationSupported()) {
    console.warn('Notifications not supported');
    return;
  }

  const permission = await requestNotificationPermission();
  
  if (permission !== 'granted') {
    console.warn('Notification permission not granted');
    return;
  }

  // Register service worker if needed
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      await registration.showNotification(options.title, {
        body: options.body,
        icon: options.icon || '/icon-192x192.png',
        badge: options.badge || '/icon-192x192.png',
        tag: options.tag,
        requireInteraction: options.requireInteraction || false,
        data: options.data || {},
        actions: options.actions || [],
        vibrate: [200, 100, 200], // Vibration pattern for mobile
        sound: true, // Play sound on mobile
      });
    } catch (error) {
      console.error('Error showing notification:', error);
      // Fallback to regular notification if service worker fails
      new Notification(options.title, {
        body: options.body,
        icon: options.icon,
        tag: options.tag,
      });
    }
  } else {
    // Fallback for browsers without service worker
    new Notification(options.title, {
      body: options.body,
      icon: options.icon,
      tag: options.tag,
    });
  }
}

/**
 * Show alert notification
 */
export async function showAlertNotification(
  title: string,
  message: string,
  severity: 'critical' | 'warning' | 'info' = 'info',
  actionUrl?: string
): Promise<void> {
  const icon = severity === 'critical' 
    ? '/icon-critical.png' 
    : severity === 'warning'
    ? '/icon-warning.png'
    : '/icon-192x192.png';

  await showNotification({
    title: `🚨 ${title}`,
    body: message,
    icon,
    tag: `alert-${severity}-${Date.now()}`,
    requireInteraction: severity === 'critical',
    data: {
      type: 'alert',
      severity,
      actionUrl,
      timestamp: Date.now(),
    },
    actions: actionUrl ? [
      {
        action: 'open',
        title: 'View Details',
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
      },
    ] : [],
  });
}

/**
 * Show task notification
 */
export async function showTaskNotification(
  title: string,
  message: string,
  taskId?: string
): Promise<void> {
  await showNotification({
    title: `📋 ${title}`,
    body: message,
    icon: '/icon-192x192.png',
    tag: `task-${taskId || Date.now()}`,
    data: {
      type: 'task',
      taskId,
      timestamp: Date.now(),
    },
    actions: taskId ? [
      {
        action: 'open',
        title: 'View Task',
      },
    ] : [],
  });
}

/**
 * Initialize push notification service
 */
export function initPushNotifications(): void {
  if (!isNotificationSupported()) {
    return;
  }

  // Handle notification clicks
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'notification-click') {
        const { actionUrl } = event.data;
        if (actionUrl) {
          // Ensure proper hash format
          const hash = actionUrl.startsWith('#') ? actionUrl : `#/${actionUrl}`;
          window.location.hash = hash;
          window.focus();
          // Trigger hash change event to ensure navigation works
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      }
    });
  }

  // Also handle browser notification clicks directly
  if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then((registration) => {
      // Listen for notification clicks when service worker is ready
      registration.addEventListener('notificationclick', (event: any) => {
        event.notification.close();
        const data = event.notification.data;
        if (data && data.actionUrl) {
          const hash = data.actionUrl.startsWith('#') ? data.actionUrl : `#/${data.actionUrl}`;
          window.location.hash = hash;
          window.focus();
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      });
    });
  }
}

// ─── Web Push (Phase G) ─────────────────────────────────────────────────
//
// Subscribes the current browser to the push service identified by the
// VAPID public key. The subscription endpoint + keys get persisted to
// `push_subscriptions` so the server-side `send-push-notification` edge
// function can fan out alerts.

import { supabase } from './supabaseClient';

const VAPID_PUBLIC_KEY = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY || '';
const PUSH_SW_PATH = '/sw-push.js';

/**
 * Convert a base64url string to Uint8Array — required by pushManager.subscribe.
 * The VAPID public key from `web-push generate-vapid-keys` is base64url.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Register the push service worker. Idempotent — does nothing if already
 * registered. Returns the ServiceWorkerRegistration.
 */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register(PUSH_SW_PATH, { scope: '/' });
    return reg;
  } catch (err) {
    console.error('Push SW registration failed', err);
    return null;
  }
}

/**
 * Subscribe this browser to web push and persist the subscription server-side.
 * Returns true on success.
 */
export async function subscribeToPushNotifications(): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('VITE_VAPID_PUBLIC_KEY not configured — push notifications disabled');
    return false;
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  // 1. Permission
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') return false;

  // 2. SW registration (own scope to avoid clashing with the existing /sw.js if any)
  const reg = await registerPushServiceWorker();
  if (!reg) return false;

  // 3. PushSubscription — re-uses existing if already subscribed.
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast around DOM Uint8Array<ArrayBufferLike> vs BufferSource lib mismatch.
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    } catch (err) {
      console.error('Push subscribe failed', err);
      return false;
    }
  }

  // 4. Persist to Supabase. Endpoint is unique per device → upsert on conflict.
  const json = subscription.toJSON();
  const endpoint = json.endpoint!;
  const p256dh = json.keys?.p256dh || arrayBufferToBase64(subscription.getKey('p256dh'));
  const auth_key = json.keys?.auth || arrayBufferToBase64(subscription.getKey('auth'));

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user?.id) return false;

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userData.user.id,
        endpoint,
        p256dh,
        auth_key,
        user_agent: navigator.userAgent.slice(0, 200),
        enabled: true,
        consecutive_failures: 0,
      },
      { onConflict: 'endpoint' },
    );
  if (error) {
    console.error('Persist push subscription failed', error);
    return false;
  }
  return true;
}

/**
 * Unsubscribe this browser from web push and remove the row server-side.
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_PATH);
  if (!reg) return true;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return true;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  // Best-effort remove from server.
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  return true;
}

/**
 * Check current push subscription status. Returns one of:
 *   'unsupported' — browser doesn't support push or notifications
 *   'denied'      — user explicitly denied notification permission
 *   'inactive'    — supported and granted, but no active subscription
 *   'active'      — subscribed and enabled
 */
export async function getPushSubscriptionStatus(): Promise<'unsupported' | 'denied' | 'inactive' | 'active'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_PATH);
  if (!reg) return 'inactive';
  const subscription = await reg.pushManager.getSubscription();
  return subscription ? 'active' : 'inactive';
}
