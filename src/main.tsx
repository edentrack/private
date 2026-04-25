import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import posthog from 'posthog-js';
import App from './App.tsx';
import './index.css';
import './lib/i18n';

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

if ('serviceWorker' in navigator) {
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
