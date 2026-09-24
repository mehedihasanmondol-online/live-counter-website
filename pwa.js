/**
 * PWA Controller - Live Arena Counter Assistant
 * Manages Service Worker lifecycle, install prompt, offline detection, and update toasts
 */

(function () {
  'use strict';

  let deferredInstallPrompt = null;
  let newWorkerWaiting = false;

  // DOM Elements
  const offlineBadge = document.getElementById('pwa-offline-badge');
  const updateToast = document.getElementById('pwa-update-toast');
  const updateActionBtn = document.getElementById('pwa-update-btn');

  // Automatic Cache Purge: Wipes legacy caches on client whenever version bumps
  const APP_VERSION = 'v1.2.2';
  try {
    const storedVersion = localStorage.getItem('arena_counter_version');
    if (storedVersion !== APP_VERSION) {
      localStorage.setItem('arena_counter_version', APP_VERSION);
      if ('caches' in window) {
        caches.keys().then((names) => {
          return Promise.all(names.map((name) => caches.delete(name)));
        }).then(() => {
          console.log('[PWA] Stale caches purged for version:', APP_VERSION);
        });
      }
    }
  } catch (e) {}

  // 1. Register Service Worker with instant updates
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // updateViaCache: 'none' bypasses HTTP caching for sw.js itself
      navigator.serviceWorker
        .register('./sw.js', { scope: './', updateViaCache: 'none' })
        .then((registration) => {
          console.log('[PWA] Service Worker registered with scope:', registration.scope);

          // Actively check for updates immediately
          registration.update().catch(() => {});

          // If a new worker is waiting, activate it immediately
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          // Check if an update was found while registering
          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;

            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New version ready, activating immediately...');
                installingWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });

      // Reload page once the new service worker takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    });
  }

  // 2. Display Update Toast
  function showUpdateToast(worker) {
    if (!updateToast) return;
    newWorkerWaiting = true;
    updateToast.classList.add('visible');

    if (updateActionBtn) {
      updateActionBtn.onclick = () => {
        if (worker) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      };
    }
  }

  // 3. Handle Install Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent browser default mini-infobar
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  // 4. Handle Successful Installation
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Arena Counter was installed successfully!');
    showToast('🎉 Arena Counter installed! Scoreboard & shootout work 100% offline.');
  });

  // 5. Connectivity Status (Online / Offline Monitor)
  function updateOnlineStatus() {
    const isOnline = navigator.onLine;

    if (!offlineBadge) return;

    if (!isOnline) {
      offlineBadge.classList.add('visible', 'offline');
      offlineBadge.classList.remove('online-restored');
      offlineBadge.innerHTML = `
        <span class="offline-dot"></span>
        <span>⚡ OFFLINE MODE (Cached)</span>
      `;
    } else {
      // If was previously showing offline
      if (offlineBadge.classList.contains('offline')) {
        offlineBadge.classList.remove('offline');
        offlineBadge.classList.add('online-restored');
        offlineBadge.innerHTML = `
          <span class="online-dot"></span>
          <span>🟢 BACK ONLINE</span>
        `;
        setTimeout(() => {
          offlineBadge.classList.remove('visible', 'online-restored');
        }, 3200);
      } else {
        offlineBadge.classList.remove('visible');
      }
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  // Initial check on load
  if (!navigator.onLine) {
    updateOnlineStatus();
  }

  // 6. Helper: Check iOS Safari
  function isIos() {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
  }

  // 7. Temporary Floating Toast Helper
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'pwa-transient-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  // 8. Handle PWA Shortcuts from URL Search Params
  window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    if (action) {
      setTimeout(() => {
        if (action === 'shootout') {
          const shootoutBtn = document.getElementById('penalty-arena-btn') || document.querySelector('.penalty-arena-btn');
          if (shootoutBtn) shootoutBtn.click();
        } else if (action === 'stream') {
          const streamBtn = document.getElementById('stream-mode-btn') || document.querySelector('.stream-mode-btn');
          if (streamBtn) streamBtn.click();
        } else if (action === 'reset') {
          const resetBtn = document.getElementById('reset-btn');
          if (resetBtn) resetBtn.click();
        }

        // Clean query params from URL without refreshing
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }, 350);
    }
  });

})();
