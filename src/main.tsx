import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './lib/i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Only register Service Worker in production - it caches JS and can serve stale code during dev
if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw-enhanced.js')
      .then((registration) => {
        if (import.meta.env.DEV) console.log('Service Worker registered');

        // Check for updates less frequently (every 10 minutes instead of 1 minute)
        setInterval(() => {
          registration.update();
        }, 600000); // Check every 10 minutes instead of every minute

        let updatePromptShown = false;
        const updatePromptKey = 'sw-update-prompt-shown';
        const updateDismissedKey = 'sw-update-dismissed';
        const sessionPromptKey = 'sw-update-session-prompt';

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Only show update prompt in production
                if (import.meta.env.PROD && !updatePromptShown) {
                  const lastPromptTime = localStorage.getItem(updatePromptKey);
                  const lastDismissedTime = localStorage.getItem(updateDismissedKey);
                  const sessionPrompted = sessionStorage.getItem(sessionPromptKey);
                  const now = Date.now();
                  
                  // Don't show if:
                  // 1. Already shown in this session
                  // 2. Dismissed in the last few hours
                  // 3. Prompt shown in the last few hours
                  const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
                  const dismissedRecently = lastDismissedTime && (now - parseInt(lastDismissedTime)) < COOLDOWN_MS;
                  const promptedRecently = lastPromptTime && (now - parseInt(lastPromptTime)) < COOLDOWN_MS;
                  
                  if (!sessionPrompted && !dismissedRecently && !promptedRecently) {
                    updatePromptShown = true;
                    localStorage.setItem(updatePromptKey, now.toString());
                    sessionStorage.setItem(sessionPromptKey, 'true');

                    // Silently activate the new service worker without showing a banner
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                    setTimeout(() => {
                      window.location.reload();
                    }, 100);
                  }
                }
              }
            });
          }
        });

        // Listen for service worker controlling this page
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // Service worker updated, clear the prompt flag
          localStorage.removeItem(updatePromptKey);
        });
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.warn('Service Worker registration failed:', error);
      });
  });
}

// Show non-blocking update notification banner
function showUpdateNotification(onReload: () => void, onDismiss?: () => void) {
  // Remove any existing notification
  const existing = document.getElementById('sw-update-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification banner
  const banner = document.createElement('div');
  banner.id = 'sw-update-notification';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #4B3D24 0%, #2d2415 100%);
    color: white;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    z-index: 99999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    animation: slideDown 0.3s ease-out;
  `;

  // Add animation keyframes
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  const message = document.createElement('span');
  message.textContent = 'New version available!';
  message.style.flex = '1';

  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.gap = '8px';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload Now';
  reloadBtn.style.cssText = `
    background: #FFDD00;
    color: #1a1a1a;
    border: none;
    padding: 6px 16px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  `;
  reloadBtn.onmouseover = () => {
    reloadBtn.style.background = '#FFE640';
    reloadBtn.style.transform = 'scale(1.05)';
  };
  reloadBtn.onmouseout = () => {
    reloadBtn.style.background = '#FFDD00';
    reloadBtn.style.transform = 'scale(1)';
  };
  reloadBtn.onclick = () => {
    onReload();
  };

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Later';
  dismissBtn.style.cssText = `
    background: transparent;
    color: white;
    border: 1px solid rgba(255,255,255,0.3);
    padding: 6px 16px;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  `;
  dismissBtn.onmouseover = () => {
    dismissBtn.style.background = 'rgba(255,255,255,0.1)';
  };
  dismissBtn.onmouseout = () => {
    dismissBtn.style.background = 'transparent';
  };
  dismissBtn.onclick = () => {
    banner.style.animation = 'slideUp 0.3s ease-out';
    setTimeout(() => {
      banner.remove();
      if (onDismiss) {
        onDismiss();
      }
    }, 300);
  };

  // Add slideUp animation
  style.textContent += `
    @keyframes slideUp {
      from {
        transform: translateY(0);
        opacity: 1;
      }
      to {
        transform: translateY(-100%);
        opacity: 0;
      }
    }
  `;

  buttonContainer.appendChild(reloadBtn);
  buttonContainer.appendChild(dismissBtn);
  banner.appendChild(message);
  banner.appendChild(buttonContainer);
  document.body.appendChild(banner);

  // Add padding to body to prevent content jump
  document.body.style.paddingTop = '52px';
  
  // Clean up padding when banner is removed
  const observer = new MutationObserver(() => {
    if (!document.getElementById('sw-update-notification')) {
      document.body.style.paddingTop = '';
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });
}

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });

    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((key) => caches.delete(key));
      });
    }
  });
}
