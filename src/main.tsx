import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import posthog from 'posthog-js';
import App from './App.tsx';
import './index.css';
import './lib/i18n';
import { Capacitor } from '@capacitor/core';
import { initCapacitorPush } from './lib/capacitorPush';
import { wireKeyboard } from './lib/capacitorNative';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
  });
}

// When a lazy chunk fails to load (stale SW cache after deploy), force a fresh page load.
// Without this, users get "Failed to fetch dynamically imported module" errors indefinitely.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Native shell init: only fires inside the Capacitor iOS/Android wrapper.
// In a regular browser these are no-ops, so the web build is untouched.
if (Capacitor.isNativePlatform()) {
  initCapacitorPush();
  wireKeyboard();
  // Set the iOS status bar tint to match the brand. On Android this is
  // configured via capacitor.config.ts (StatusBar plugin).
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
  });
  // Auto-hide the splash once React has mounted. capacitor.config.ts
  // already sets a 1.5s ceiling but hiding earlier feels faster.
  import('@capacitor/splash-screen').then(({ SplashScreen }) => {
    setTimeout(() => SplashScreen.hide().catch(() => {}), 200);
  });
  // Live updates (Capgo): tells the updater plugin that this bundle
  // booted successfully. If we don't call this within ~10s of launch,
  // the plugin assumes the bundle crashed and auto-rolls back to the
  // previous good bundle on the next launch. So we MUST call it once
  // the React tree is up. The plugin handles background download +
  // install-on-next-cold-start automatically based on capacitor.config.ts.
  // No-ops gracefully if the package isn't configured with a Capgo account.
  import('@capgo/capacitor-updater')
    .then(({ CapacitorUpdater }) => CapacitorUpdater.notifyAppReady().catch(() => {}))
    .catch(() => {});
}

// Service worker is for the WEB build only. Inside the Capacitor shell
// the WebView ignores SW registration anyway, but skipping the call
// avoids noisy console errors on iOS.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.DEV) {
      // Unregister all SWs in dev so stale caches never interfere
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((r) => r.unregister());
      });
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Check for updates every 10 minutes
        setInterval(() => registration.update(), 600_000);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Silently activate the new SW and reload
              newWorker.postMessage({ type: 'SKIP_WAITING' });
              setTimeout(() => window.location.reload(), 100);
            }
          });
        });
      })
      .catch((err) => console.warn('SW registration failed:', err));
  });
}
