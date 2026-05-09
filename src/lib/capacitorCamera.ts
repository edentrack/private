/**
 * Native camera helper for Eden's photo diagnosis (sick fish, dropping
 * inspection, water-color check). Falls back to the existing HTML
 * file-input flow when running in a browser.
 *
 * Why this matters: the HTML <input type="file" capture="environment">
 * approach works but on iOS it opens an awkward action sheet first
 * ("Photo Library / Take Photo / Choose File") which adds 2 taps.
 * The Capacitor camera plugin opens the native camera UI directly.
 *
 * Usage:
 *   import { takeFarmPhoto } from '../../lib/capacitorCamera';
 *   const file = await takeFarmPhoto();
 *   if (file) setPhoto(file);
 */

import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/**
 * Show the native camera and return a File the existing upload code
 * can consume. Returns null if the user cancelled.
 *
 * On the web this falls back to a hidden <input type="file"> click —
 * the existing photo-upload UIs already use that pattern, so prefer
 * passing this through only when isNativePlatform() is true and let
 * the existing input handle the web case.
 */
export async function takeFarmPhoto(opts?: { allowGallery?: boolean }): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) {
    // Web: caller should use the existing <input type="file"> flow.
    return null;
  }

  try {
    const result = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: opts?.allowGallery ? CameraSource.Prompt : CameraSource.Camera,
      // Compress aggressively — Eden vision works fine at 1280px and
      // the rural data-cap users save real money on uploads.
      width: 1280,
      saveToGallery: false,
    });

    if (!result.dataUrl) return null;

    // Convert data URL to a File. The rest of EdenTrack's upload code
    // already handles File objects (Supabase storage, FormData, etc.).
    const blob = await (await fetch(result.dataUrl)).blob();
    const ext = result.format || 'jpg';
    return new File([blob], `farm-photo-${Date.now()}.${ext}`, {
      type: blob.type || `image/${ext}`,
    });
  } catch (err: any) {
    // The plugin throws on user cancel — that's not an error from our
    // perspective. Swallow it and return null. Real errors get logged.
    if (String(err?.message || err).toLowerCase().includes('cancel')) {
      return null;
    }
    console.error('[CapacitorCamera] takePhoto error:', err);
    return null;
  }
}
