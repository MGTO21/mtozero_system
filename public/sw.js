/**
 * Mtozero Shop service worker.
 *
 * Job: make every screen of the app open with no connection, on a phone that
 * may have never visited that screen before. Business DATA is not handled
 * here — Firestore's own IndexedDB persistence and the app's offline queue
 * (src/lib/offline) own that, and duplicating it would serve stale stock.
 *
 * The version comes from the registration URL (`/sw.js?v=<build>`), so every
 * deploy installs a fresh worker that precaches that build's pages and code.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL_CACHE = `mtozero-shell-${VERSION}`;
const ASSET_CACHE = `mtozero-assets-${VERSION}`;
const OFFLINE_URL = '/offline';

/** Every route the app has. Precached at install so none is "not saved offline". */
const ROUTES = [
  '/',
  '/login',
  OFFLINE_URL,
  '/dashboard',
  '/sell',
  '/sales',
  '/close',
  '/customers',
  '/campaigns',
  '/debts',
  '/inventory',
  '/shipments',
  '/stocktake',
  '/expenses',
  '/reports',
  '/activity',
  '/team',
  '/settings',
  '/sync',
  '/invoice',
];

const STATIC_URLS = ['/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

/** How long a navigation waits on a weak signal before falling back to the cache. */
const NAV_TIMEOUT_MS = 3500;

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

/** Pulls the build's script and style URLs out of a page so they can be cached too. */
function assetUrls(html) {
  const found = new Set();
  const pattern = /["'(](\/_next\/static\/[^"')\s]+)["')]/g;
  let match;
  while ((match = pattern.exec(html))) found.add(match[1]);
  return [...found];
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      const assets = await caches.open(ASSET_CACHE);
      await Promise.allSettled(STATIC_URLS.map((url) => assets.add(new Request(url, { cache: 'reload' }))));

      // Each page and everything it loads. Individual failures must not abort
      // the install — a page that failed is fetched again on first visit.
      await Promise.allSettled(
        ROUTES.map(async (route) => {
          const response = await fetch(new Request(route, { cache: 'reload', credentials: 'same-origin' }));
          if (!response.ok) return;
          await shell.put(route, response.clone());
          const html = await response.text();
          await Promise.allSettled(
            assetUrls(html).map(async (url) => {
              if (await assets.match(url)) return;
              const asset = await fetch(url);
              if (asset.ok) await assets.put(url, asset);
            }),
          );
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

/**
 * Old caches are pruned, but the previous build's code is kept one generation:
 * a page that was already open when this worker took over still runs the old
 * build and may lazily load one of its chunks — deleting them immediately would
 * break that page the next time it is offline.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const meta = await caches.open('mtozero-meta');
      const stored = await meta.match('/__versions');
      const history = stored ? await stored.json() : [];
      const versions = [...history.filter((v) => v !== VERSION), VERSION].slice(-2);
      await meta.put('/__versions', new Response(JSON.stringify(versions)));

      const keep = new Set([SHELL_CACHE, 'mtozero-meta', ...versions.map((v) => `mtozero-assets-${v}`)]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('mtozero-') && !keep.has(k)).map((k) => caches.delete(k)));
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

function isRscRequest(request, url) {
  return request.headers.get('RSC') === '1' || url.searchParams.has('_rsc');
}

/** Cached page for a path. Query strings are ignored: /invoice?id=… is one page. */
async function cachedPage(pathname) {
  const shell = await caches.open(SHELL_CACHE);
  return (
    (await shell.match(pathname, { ignoreSearch: true })) ??
    (await shell.match(pathname.replace(/\/$/, '') || '/', { ignoreSearch: true })) ??
    null
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

  // In-app navigation data. Not cached — its key changes with router state. When
  // it fails, Next falls back to a full page load, which the branch below serves
  // from the cache. The timeout makes that fallback happen on a weak signal too,
  // instead of the tap hanging.
  if (isRscRequest(request, url)) {
    event.respondWith(Promise.race([fetch(request), timeout(NAV_TIMEOUT_MS)]).catch(() => Response.error()));
    return;
  }

  // Full page loads: network first with a short fuse, then the cached page.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await Promise.race([fetch(request), timeout(NAV_TIMEOUT_MS)]);
          if (fresh.ok) {
            const shell = await caches.open(SHELL_CACHE);
            shell.put(url.pathname, fresh.clone());
          }
          return fresh;
        } catch {
          return (
            (await cachedPage(url.pathname)) ??
            (await cachedPage(OFFLINE_URL)) ??
            new Response('غير متصل', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
          );
        }
      })(),
    );
    return;
  }

  // Build output, fonts and icons are content-hashed or stable: cache first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        // Any generation still kept: an older open page asks for its own chunks.
        const hit = (await cache.match(request)) ?? (await caches.match(request));
        if (hit) return hit;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })(),
    );
    return;
  }

  // Anything else on our origin: serve the cached copy at once and refresh it
  // in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(request);
      const refresh = fetch(request)
        .then((fresh) => {
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        })
        .catch(() => null);
      if (hit) {
        event.waitUntil(refresh);
        return hit;
      }
      const fresh = await refresh;
      return fresh ?? Response.error();
    })(),
  );
});
