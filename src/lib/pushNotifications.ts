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
