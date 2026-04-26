// Workout PWA service worker.
//
// Strategy:
//   • Same-origin GET /_next/static/*  → cache-first (immutable hashed assets)
//   • Same-origin GET navigation       → network-first, falling back to cached
//                                        index for offline boot
//   • Same-origin GET assets (json/svg/css/js outside /_next/static, manifest)
//                                      → stale-while-revalidate
//   • Same-origin GET icons + manifest → cache-first
//   • Anything else (Supabase REST/realtime, auth) → network-only
//                                      (writes are buffered in IndexedDB by
//                                      the app's own dirty queue, so we
//                                      explicitly do NOT touch them here.)
//
// Bump CACHE_VERSION to force clients to drop the old shell cache after
// a deploy that changes shell behavior.

const CACHE_VERSION = 'v1';
const SHELL = `workout-shell-${CACHE_VERSION}`;
const STATIC = `workout-static-${CACHE_VERSION}`;
const RUNTIME = `workout-runtime-${CACHE_VERSION}`;

const SHELL_URLS = ['/', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_URLS).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![SHELL, STATIC, RUNTIME].includes(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never cache cross-origin

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(STATIC, request));
    return;
  }
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(cacheFirst(SHELL, request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (/\.(?:js|mjs|css|svg|png|jpg|jpeg|woff2?)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(RUNTIME, request));
    return;
  }
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return hit || Response.error();
  }
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fetchPromise;
}

async function networkFirstShell(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(SHELL);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(SHELL);
    const cached = await cache.match(request);
    if (cached) return cached;
    const root = await cache.match('/');
    if (root) return root;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

// Allow the page to ping us, e.g. to trigger an immediate skipWaiting on a
// new SW install if we ever wire that up from the AppShell.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
