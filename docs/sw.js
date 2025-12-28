/*
 * Service Worker for RP Voice Logger
 *
 * This service worker implements a very simple offline strategy: it pre‑caches
 * the application shell (HTML, JS, manifest and icons) when installed and
 * serves those cached resources when offline. Non‑cached requests fall back
 * to the network when available. This is sufficient for an offline‑first PWA
 * but could be enhanced with runtime caching strategies as the app grows.
 */

const CACHE_NAME = 'rp-voice-logger-cache-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.webmanifest',
  '/sw.js',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

self.addEventListener('activate', (event) => {
  // Clean up old caches if we bump CACHE_NAME
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Use cache‑first strategy for same‑origin requests
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        // If offline and resource not cached, optionally return a fallback
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});