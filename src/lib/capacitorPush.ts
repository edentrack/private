/**
 * Native push notifications via Capacitor.
 *
 * This file is a thin wrapper around @capacitor/push-notifications that
 * (a) only loads on a Capacitor-native platform (iOS/Android shell), and
 * (b) registers the device token with Supabase so the ai-chat edge
 *     function and our cron jobs can push to specific users by farm.
 *
 * On the web (browser), this whole module no-ops. The existing
 * src/lib/pushNotifications.ts handles browser push there.
 *
 * Usage from src/main.tsx:
 *   import { initCapacitorPush } from './lib/capacitorPush';
 *   initCapacitorPush();
 */

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import type { Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { supabase } from './supabaseClient';

let initialised = false;

export async function initCapacitorPush(): Promise<void> {
  // Web/PWA path: do nothing. The existing browser-push code handles it.
  if (!Capacitor.isNativePlatform()) return;
  if (initialised) return;
  initialised = true;

  // Permission flow. On iOS this triggers the system prompt. On Android
  // 13+ it asks for POST_NOTIFICATIONS. Older Android grants by default.
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') {
    console.warn('[CapacitorPush] User denied push permission');
    return;
  }

  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token: Token) => {
    // Store the device token under the current user's profile so the
    // server can push to it. The token is an APNs token on iOS and an
    // FCM token on Android. Supabase distinguishes by `platform`.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
    await supabase.from('push_tokens').upsert({
      user_id: user.id,
      token: token.value,
      platform,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' });
    console.log('[CapacitorPush] Registered', platform, token.value.slice(0, 12) + '...');
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('[CapacitorPush] Registration error:', err);
  });

  // Notification arrived while the app is in the foreground. The OS
  // doesn't show a banner in that case, so we can hand it off to a
  // toast or in-app modal here.
  PushNotifications.addListener('pushNotificationReceived', (notif: PushNotificationSchema) => {
    console.log('[CapacitorPush] Foreground push:', notif.title, notif.body);
    // TODO: integrate with ToastContext if we want in-app surfacing
  });

  // User tapped a notification and the app opened/foregrounded.
  // notification.data.route is set by our server when sending so we can
  // deep-link the user to the relevant screen.
  PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    const route = (action.notification.data as any)?.route;
    if (route && typeof route === 'string') {
      window.location.hash = route.startsWith('#') ? route : `#${route}`;
    }
  });
}

/**
 * Whether the current runtime is a Capacitor native shell. Use this to
 * branch UI: e.g. show "Open in Safari" vs the back button, or show
 * native push opt-in instead of the browser push toggle.
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Removes the registered token. Call when the user signs out so push
 * stops landing on their device.
 */
export async function unregisterCapacitorPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await PushNotifications.removeAllListeners();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('push_tokens').delete().eq('user_id', user.id);
    }
  } catch (err) {
    console.warn('[CapacitorPush] Unregister failed:', err);
  }
}
