/**
 * Mtozero Shop service worker.
 *
 * Scope of responsibility is deliberately narrow: cache the app shell and static
 * assets so the PWA launches with no connection. Business DATA is not cached here —
 * Firestore's own IndexedDB persistence handles that, and duplicating it would risk
 * serving stale stock counts.
 */
const VERSION = 'v3';
const SHELL_CACHE = `mtozero-shell-${VERSION}`;
const ASSET_CACHE = `mtozero-assets-${VERSION}`;
const OFFLINE_URL = '/offline';

const SHELL_URLS = [
  '/',
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individual failures must not abort the whole install.
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('mtozero-') && !k.endsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isFirebaseTraffic(url) {
  return (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebaseinstallations') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('firebasestorage')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Firebase: auth, Firestore streams and Storage handle their own
  // offline behaviour and would break under a cache layer.
  if (isFirebaseTraffic(url)) return;
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached shell, then to /offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(request)) ??
            (await cache.match(OFFLINE_URL)) ??
            new Response('غير متصل', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
          );
        }
      })(),
    );
    return;
  }

  // Build output and icons are content-hashed or stable: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })(),
    );
    return;
  }

  // Everything else on our origin: try the network, fall back to any cached copy.
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        throw new Error('offline');
      }
    })(),
  );
});
