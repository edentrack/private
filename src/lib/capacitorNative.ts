/**
 * Edentrack native-platform helpers — one place for all the small
 * "do this on the device when running natively" wrappers.
 *
 * Every export is safe to call from the web build: the underlying
 * plugins detect they're not on a Capacitor platform and either
 * gracefully fall back or no-op. So callers don't have to wrap each
 * call in `if (Capacitor.isNativePlatform())` themselves.
 *
 * Why it lives in one file: the rest of EdenTrack should not have to
 * learn the Capacitor plugin APIs. Each helper is a thin wrapper that
 * hides plugin-specific quirks (e.g. permission-then-call, error
 * shapes) behind a domain-friendly function name.
 */

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { AppLauncher } from '@capacitor/app-launcher';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Dialog } from '@capacitor/dialog';
import { Browser } from '@capacitor/browser';
import { Device } from '@capacitor/device';
import { NativeBiometric, BiometryType } from '@capgo/capacitor-native-biometric';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

const native = () => Capacitor.isNativePlatform();

/* -------------------------------------------------------------------------
 * Geolocation
 * ----------------------------------------------------------------------- */

/**
 * Native GPS coordinates. Falls back to browser navigator.geolocation on web.
 *
 * Returns null if the user denies permission OR if the device can't get a
 * fix within timeoutMs. Callers should handle null gracefully (offer
 * manual entry of city/region instead).
 */
export async function getFarmCoordinates(
  timeoutMs = 10_000,
): Promise<{ latitude: number; longitude: number; accuracyMeters: number } | null> {
  try {
    if (native()) {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        const req = await Geolocation.requestPermissions({ permissions: ['location'] });
        if (req.location !== 'granted') return null;
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: timeoutMs,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
      };
    }
    // Web fallback — same shape as native, uses browser API.
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: timeoutMs },
      );
    });
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Local notifications — vaccine + withdrawal-period reminders
 * ----------------------------------------------------------------------- */

/**
 * Schedule a one-shot reminder that fires at the given date even if the
 * app is closed and there's no internet. Uses native local notifications,
 * not push — perfect for "vaccine due tomorrow" style alerts that the
 * user already knows about and just needs to be reminded of.
 *
 * On the web this no-ops (web push is the equivalent and lives in a
 * separate code path).
 *
 * @param id stable integer; passing the same id replaces a previous
 *           scheduled notif (so editing a vaccine date updates it
 *           cleanly instead of adding a duplicate)
 * @param title  Bold line shown in the lockscreen banner
 * @param body   Smaller line under it
 * @param at     When to fire. Past dates are silently dropped.
 * @param route  Optional in-app route. If set, tapping the notification
 *               sets `window.location.hash` to this when the app opens.
 */
export async function scheduleReminder(
  id: number,
  title: string,
  body: string,
  at: Date,
  route?: string,
): Promise<boolean> {
  if (!native()) return false;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return false;
    }
    if (at.getTime() < Date.now()) return false;
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          schedule: { at },
          extra: route ? { route } : undefined,
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('[CapacitorNative] scheduleReminder failed:', err);
    return false;
  }
}

/** Cancel a previously scheduled reminder by id. */
export async function cancelReminder(id: number): Promise<void> {
  if (!native()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {}
}

/* -------------------------------------------------------------------------
 * Haptics — tactile feedback on important actions
 * ----------------------------------------------------------------------- */

/** Light tap. Use on every successful save, mark-done, log entry. */
export async function tapLight(): Promise<void> {
  if (!native()) return;
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
}

/** Medium tap. Use on more meaningful actions: harvest logged, sale recorded. */
export async function tapMedium(): Promise<void> {
  if (!native()) return;
  try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
}

/** Warning buzz. Use on validation errors, network failures. */
export async function tapWarning(): Promise<void> {
  if (!native()) return;
  try { await Haptics.notification({ type: NotificationType.Warning }); } catch {}
}

/** Success chord. Use on big wins: payment received, harvest finalised. */
export async function tapSuccess(): Promise<void> {
  if (!native()) return;
  try { await Haptics.notification({ type: NotificationType.Success }); } catch {}
}

/* -------------------------------------------------------------------------
 * Keyboard — fix iOS pushing content out of view
 * ----------------------------------------------------------------------- */

/**
 * Wire keyboard listeners so the WebView resizes when the keyboard opens,
 * instead of overlaying form inputs. Call once at app start (already wired
 * in src/main.tsx).
 */
export function wireKeyboard(): void {
  if (!native()) return;
  try {
    Keyboard.addListener('keyboardWillShow', (info) => {
      document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
    });
    Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.style.setProperty('--keyboard-height', '0px');
    });
  } catch {}
}

/* -------------------------------------------------------------------------
 * App launcher — call buyers, open Maps, open WhatsApp
 * ----------------------------------------------------------------------- */

/**
 * Dial a phone number using the device's phone app. On web falls back to
 * `tel:` link which most browsers handle.
 */
export async function callPhone(phoneE164: string): Promise<void> {
  const cleaned = phoneE164.replace(/[^+\d]/g, '');
  const url = `tel:${cleaned}`;
  if (native()) {
    await AppLauncher.openUrl({ url });
  } else {
    window.location.href = url;
  }
}

/**
 * Open a phone number's WhatsApp chat. If WhatsApp isn't installed,
 * falls back to wa.me/ which works in the browser.
 */
export async function openWhatsApp(phoneE164: string, prefilledText?: string): Promise<void> {
  const cleaned = phoneE164.replace(/[^+\d]/g, '');
  const text = prefilledText ? `?text=${encodeURIComponent(prefilledText)}` : '';
  const url = `https://wa.me/${cleaned.replace(/^\+/, '')}${text}`;
  if (native()) {
    await AppLauncher.openUrl({ url });
  } else {
    window.open(url, '_blank');
  }
}

/**
 * Open a coordinate or address in the device's default map app
 * (Apple Maps on iOS, Google Maps on Android). Used by the farm-location
 * page to launch turn-by-turn directions.
 */
export async function openInMaps(opts: { lat?: number; lng?: number; query?: string }): Promise<void> {
  let url: string;
  if (typeof opts.lat === 'number' && typeof opts.lng === 'number') {
    url = `https://maps.google.com/?q=${opts.lat},${opts.lng}`;
  } else if (opts.query) {
    url = `https://maps.google.com/?q=${encodeURIComponent(opts.query)}`;
  } else {
    return;
  }
  if (native()) {
    await AppLauncher.openUrl({ url });
  } else {
    window.open(url, '_blank');
  }
}

/* -------------------------------------------------------------------------
 * Filesystem — cache photos before upload
 * ----------------------------------------------------------------------- */

/**
 * Save a base64-encoded image to the device cache so the upload can be
 * retried later if the network drops mid-upload.
 *
 * Returns the file URI which can be loaded back into a File object with
 * loadCachedPhoto(uri).
 */
export async function cachePhoto(base64: string, name: string): Promise<string | null> {
  if (!native()) return null;
  try {
    const result = await Filesystem.writeFile({
      path: `cache/${name}`,
      data: base64,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return result.uri;
  } catch (err) {
    console.warn('[CapacitorNative] cachePhoto failed:', err);
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Dialog — native confirm/alert
 * ----------------------------------------------------------------------- */

/**
 * Native confirm dialog. Use for destructive actions (delete farm,
 * archive flock, void receipt) where you want a system-level prompt that
 * matches the OS look. Falls back to window.confirm() on web.
 */
export async function nativeConfirm(message: string, title?: string): Promise<boolean> {
  if (!native()) return window.confirm(title ? `${title}\n\n${message}` : message);
  try {
    const result = await Dialog.confirm({ title, message });
    return result.value;
  } catch {
    return false;
  }
}

/** Native alert. Use for critical errors that need acknowledgement. */
export async function nativeAlert(message: string, title?: string): Promise<void> {
  if (!native()) {
    window.alert(title ? `${title}\n\n${message}` : message);
    return;
  }
  try {
    await Dialog.alert({ title, message });
  } catch {}
}

/* -------------------------------------------------------------------------
 * Browser — in-app browser for external links
 * ----------------------------------------------------------------------- */

/**
 * Open a URL in the in-app browser (SFSafariViewController on iOS,
 * Custom Tabs on Android). Keeps the user inside Edentrack while still
 * showing a real browser for external content (privacy policy, vet
 * articles, supplier sites).
 *
 * On web this just opens a new tab.
 */
export async function openInAppBrowser(
  url: string,
  opts: { fullscreen?: boolean } = {},
): Promise<void> {
  if (native()) {
    // popover presentation is right for casual links (privacy policy,
    // vet articles); fullscreen is right for committed flows like
    // payment where the user needs to feel they're in a separate
    // checkout context. iOS uses a sheet animation either way.
    await Browser.open({
      url,
      presentationStyle: opts.fullscreen ? 'fullscreen' : 'popover',
    });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/* -------------------------------------------------------------------------
 * Device info — for support tickets + analytics
 * ----------------------------------------------------------------------- */

/**
 * Minimal device fingerprint used in error reports, push token rows,
 * and "what device is the user on?" support tickets. Keep it small and
 * non-identifying.
 */
export async function getDeviceInfo(): Promise<{
  platform: string;
  model: string;
  osVersion: string;
  manufacturer: string;
  webViewVersion?: string;
}> {
  try {
    const info = await Device.getInfo();
    return {
      platform: info.platform,
      model: info.model || 'unknown',
      osVersion: info.osVersion || 'unknown',
      manufacturer: info.manufacturer || 'unknown',
      webViewVersion: info.webViewVersion,
    };
  } catch {
    return { platform: 'web', model: 'unknown', osVersion: 'unknown', manufacturer: 'unknown' };
  }
}

/* -------------------------------------------------------------------------
 * Biometric login — Face ID / Touch ID / Android fingerprint
 *
 * Why we want it: farmers re-open Edentrack many times a day. Typing the
 * Supabase email + password every cold-start is painful, especially with
 * gloves on. Biometrics let us cache the password in the OS keychain and
 * unlock it with a glance / fingerprint.
 *
 * Security model:
 *   1. User signs in normally with email+password (Supabase magic link or
 *      password). On success we call enableBiometricLogin().
 *   2. We store the *Supabase refresh token* (not the password) in the
 *      device keychain, gated behind biometry. Even if the phone is
 *      stolen and unlocked, an attacker can't read it without Face ID.
 *   3. On next cold-start the app calls biometricUnlock(). If the user
 *      authenticates, we fetch the refresh token and hand it to Supabase
 *      to start a fresh session.
 *
 * Works on free Apple ID — no special entitlement needed beyond the
 * NSFaceIDUsageDescription string in Info.plist.
 * ----------------------------------------------------------------------- */

const BIOMETRIC_SERVER = 'app.edentrack.session';

/** Probe whether the device has biometrics enrolled. */
export async function biometricAvailable(): Promise<{
  available: boolean;
  type: 'faceId' | 'touchId' | 'fingerprint' | 'multiple' | 'none';
}> {
  if (!native()) return { available: false, type: 'none' };
  try {
    const res = await NativeBiometric.isAvailable({ useFallback: false });
    let type: 'faceId' | 'touchId' | 'fingerprint' | 'multiple' | 'none' = 'none';
    if (res.biometryType === BiometryType.FACE_ID || res.biometryType === BiometryType.FACE_AUTHENTICATION) type = 'faceId';
    else if (res.biometryType === BiometryType.TOUCH_ID) type = 'touchId';
    else if (res.biometryType === BiometryType.FINGERPRINT) type = 'fingerprint';
    else if (res.biometryType === BiometryType.MULTIPLE) type = 'multiple';
    return { available: res.isAvailable, type };
  } catch {
    return { available: false, type: 'none' };
  }
}

/**
 * Save the user's session token behind biometry. Call once after a fresh
 * email+password login if the user opts in to biometric unlock.
 *
 * Pass the Supabase refresh token as `secret`. We never store passwords.
 */
export async function enableBiometricLogin(userEmail: string, secret: string): Promise<boolean> {
  if (!native()) return false;
  try {
    await NativeBiometric.setCredentials({
      username: userEmail,
      password: secret,
      server: BIOMETRIC_SERVER,
    });
    return true;
  } catch (err) {
    console.warn('[CapacitorNative] enableBiometricLogin failed:', err);
    return false;
  }
}

/**
 * Prompt for biometry. On success returns the cached email + refresh token
 * which the caller hands to supabase.auth.setSession(). Returns null if
 * the user cancelled or biometry failed.
 */
export async function biometricUnlock(): Promise<{ email: string; secret: string } | null> {
  if (!native()) return null;
  try {
    const saved = await NativeBiometric.isCredentialsSaved({ server: BIOMETRIC_SERVER });
    if (!saved.isSaved) return null;
    await NativeBiometric.verifyIdentity({
      reason: 'Unlock Edentrack',
      title: 'Unlock Edentrack',
      subtitle: 'Use Face ID or your fingerprint to sign in',
      negativeButtonText: 'Cancel',
    });
    const creds = await NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER });
    return { email: creds.username, secret: creds.password };
  } catch {
    return null;
  }
}

/** Clear stored biometric credentials (e.g. on logout). */
export async function disableBiometricLogin(): Promise<void> {
  if (!native()) return;
  try {
    await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER });
  } catch {}
}

/* -------------------------------------------------------------------------
 * Barcode / QR scanner
 *
 * Use cases on the farm:
 *   - Scan vaccine vial QR codes to auto-fill batch number + expiry
 *   - Scan feed bag barcodes to log incoming inventory
 *   - Scan a buyer's join-link QR to add them as a marketplace contact
 *   - Scan an invite QR to join a co-op farm without typing the URL
 *
 * Uses Google ML Kit on Android and iOS. The first time it's called on
 * Android, ML Kit may need to download a small model (~3MB) — that's
 * handled transparently by the plugin.
 * ----------------------------------------------------------------------- */

/**
 * Open the camera scanner full-screen and resolve with the first barcode
 * detected, or null if the user closes the scanner / denies camera.
 *
 * Returns the *raw value* of the barcode (a string). For QR codes that's
 * the encoded URL or text. For a UPC-A feed bag it's the 12-digit number.
 */
export async function scanBarcode(): Promise<string | null> {
  if (!native()) {
    // Web fallback: there's no good universal browser barcode API yet.
    // Caller should show a "barcode scanning is mobile-only" hint.
    return null;
  }
  try {
    const supported = await BarcodeScanner.isSupported();
    if (!supported.supported) return null;

    const perm = await BarcodeScanner.checkPermissions();
    if (perm.camera !== 'granted' && perm.camera !== 'limited') {
      const req = await BarcodeScanner.requestPermissions();
      if (req.camera !== 'granted' && req.camera !== 'limited') return null;
    }

    const result = await BarcodeScanner.scan();
    if (!result.barcodes.length) return null;
    return result.barcodes[0].rawValue ?? null;
  } catch (err) {
    console.warn('[CapacitorNative] scanBarcode failed:', err);
    return null;
  }
}
