import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wrapper config for Edentrack iOS / Android.
 *
 * Bundle identifier: app.edentrack
 *   - Used by both Apple (App Store Connect) and Google Play
 *   - Reverse-DNS form, all lowercase, no underscores
 *   - You CANNOT change this after first App Store submission, so
 *     pick once and commit. We chose `app.edentrack` to match the
 *     edentrack.app domain (Universal Links + App Links rely on it).
 *
 * webDir: 'dist' is where Vite outputs the bundle. `npm run build`
 * produces dist/, then `npx cap sync` copies it into ios/ and
 * android/ for the native shell to load.
 */
const config: CapacitorConfig = {
  appId: 'app.edentrack',
  appName: 'Edentrack',
  webDir: 'dist',

  /**
   * server: { androidScheme: 'https' } makes Android treat the in-app
   * URLs as HTTPS, which is required for service-worker-style features
   * and matches iOS behaviour. Without this, Android uses http:// which
   * blocks some browser APIs.
   *
   * Do NOT set `url` here — that's for live-reload during development
   * (we have a separate npm script for that).
   */
  server: {
    androidScheme: 'https',
  },

  plugins: {
    /**
     * Splash screen: shown while the WebView boots. Without this, the
     * user sees a blank white screen for ~1 second on cold start which
     * looks broken. Keep it short — too long feels slow.
     */
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#ffdd00',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    /**
     * Push notifications: we register on app launch via the
     * @capacitor/push-notifications plugin. The token gets sent to
     * Supabase so Eden can push alerts (mortality spike, vaccine due,
     * water quality alarm, etc.). APNs key + FCM config are set up
     * separately in Apple Developer + Firebase consoles.
     */
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    /**
     * Status bar: match the brand yellow at the top of the screen so
     * the iOS status bar doesn't clash with the EdenTrack header.
     */
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffdd00',
    },
  },

  /**
   * iOS-specific overrides.
   * `contentInset: 'always'` makes iOS respect the safe-area insets
   * automatically so content doesn't slide under the notch/home bar.
   */
  ios: {
    contentInset: 'always',
    backgroundColor: '#ffffff',
    /**
     * Allow webview to load https://edentrack.app for the existing
     * auth flow. iOS App Transport Security is on by default so this
     * is redundant but explicit.
     */
    allowsLinkPreview: false,
    scrollEnabled: true,
    /**
     * limitsNavigationsToAppBoundDomains stays OFF — we deliberately
     * allow navigation to https://supabase.co and https://*.vercel.app
     * for the auth callback redirect.
     */
  },

  android: {
    backgroundColor: '#ffffff',
    /**
     * allowMixedContent stays default false. If you ever serve any
     * http:// asset from the bundle, switch to true — but Edentrack
     * is HTTPS-only, so leave it.
     */
  },
};

export default config;
