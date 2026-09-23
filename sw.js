/**
 * Service Worker - Live Arena Counter Assistant
 * Version: arena-counter-v1.0.1
 * Provides 100% offline access, instant loading, and asset caching
 */

const CACHE_NAME = 'arena-counter-v1.1.0';
const FONT_CACHE_NAME = 'arena-counter-fonts-v1';

// Essential static resources for offline execution
const CORE_PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './audio.js',
  './confetti.js',
  './penalty-game.js',
  './pwa.js',
  './manifest.webmanifest',
  './manifest.json',
  './assets/icon.svg',
  './assets/icon-maskable.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable.png',
  './assets/apple-touch-icon.png',
  './assets/favicon-32.png',
  './assets/favicon-16.png',
  './assets/messi.jpg',
  './assets/ronaldo.jpg'
];

// Install: Pre-cache static shell & activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[Service Worker] Pre-caching offline arena shell assets...');
      try {
        await cache.addAll(CORE_PRECACHE_URLS);
        console.log('[Service Worker] Pre-cache complete.');
      } catch (err) {
        console.warn('[Service Worker] Pre-cache partial failure:', err);
        // Fallback: Cache files individually to avoid one failure aborting all
        for (const url of CORE_PRECACHE_URLS) {
          try {
            await cache.add(url);
          } catch (e) {
            console.warn(`[Service Worker] Failed to cache: ${url}`, e);
          }
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up stale caches & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== FONT_CACHE_NAME) {
            console.log(`[Service Worker] Removing outdated cache: ${name}`);
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients for instant control.');
      return self.clients.claim();
    })
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== 'GET') {
    return;
  }

  // 1. Google Fonts requests (CSS & WOFF2): Cache-First
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(handleFontRequest(req));
    return;
  }

  // 2. Scripts (.js), Stylesheets (.css), HTML pages, Manifests: NETWORK-FIRST
  // This guarantees that any script or style update is fetched and applied immediately!
  const isCodeOrMarkup = 
    req.mode === 'navigate' ||
    req.destination === 'script' ||
    req.destination === 'style' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.webmanifest');

  if (isCodeOrMarkup) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline fallback when no internet/server connection
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;
          if (req.mode === 'navigate') {
            const fallback = (await caches.match('./index.html', { ignoreSearch: true })) || (await caches.match('./', { ignoreSearch: true }));
            if (fallback) return fallback;
            return new Response('Arena Counter is currently offline. Please reconnect to load the app.', {
              headers: { 'Content-Type': 'text/plain' }
            });
          }
          return new Response('Offline resource unavailable', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // 3. Static Media Assets (Images, Audio, Icons): Cache-First with Network Fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, responseToCache));
          }
          return networkResponse;
        });
      })
    );
  }
});

// Font caching helper: Cache-First with long TTL
async function handleFontRequest(request) {
  const fontCache = await caches.open(FONT_CACHE_NAME);
  const cachedFont = await fontCache.match(request);
  if (cachedFont) {
    return cachedFont;
  }
  try {
    const networkFont = await fetch(request);
    if (networkFont && networkFont.status === 200) {
      fontCache.put(request, networkFont.clone());
    }
    return networkFont;
  } catch (err) {
    return cachedFont || new Response('', { status: 408, statusText: 'Font Fetch Offline' });
  }
}

// User-triggered update listener
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
