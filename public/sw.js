const BUILD_VERSION = '__BUILD_VERSION__'
const CACHE_PREFIX = 'beskar-shelf'
const CACHE_NAME = `${CACHE_PREFIX}-${BUILD_VERSION}`
const COVER_CACHE = 'beskar-covers'

const cachePutSafe = async (cacheName, request, response) => {
  if (!response || response.bodyUsed) return
  if (response.status === 206) return
  try {
    const cache = await caches.open(cacheName)
    await cache.put(request, response.clone())
  } catch (_) {}
}

const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/robots.txt',
  ...__PRECACHE_ASSETS__,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SKIP_WAITING') return
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => (
              key === 'beskar-api' ||
              key.startsWith(`${CACHE_PREFIX}-`) && key !== CACHE_NAME
            ))
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim(),
    ])
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  // Keep media on WebKit's native loader. Intercepting audio or byte-range
  // requests routes playback through the service worker, which can be
  // suspended when an installed iOS app is locked. It can also interfere
  // with Safari's probing and subsequent 206 range requests.
  if (request.destination === 'audio' || request.headers.has('range')) return

  // Cover images: cache-first in a long-lived cache (survives app updates)
  // Strip query params (token) from cache key so covers survive token rotation
  if (/\/(?:abs\/)?api\/items\/[^/]+\/cover$/.test(url.pathname)) {
    const cacheKey = new Request(url.origin + url.pathname, { method: 'GET' })
    event.respondWith(
      caches.open(COVER_CACHE).then((cache) =>
        cache.match(cacheKey).then((cached) => {
          if (cached) return cached
          return fetch(request).then((response) => {
            if (response.ok) event.waitUntil(cachePutSafe(COVER_CACHE, cacheKey, response))
            return response
          }).catch(() => cache.match(cacheKey)
            .then((fallback) => fallback || new Response('', { status: 404 })))
        })
      )
    )
    return
  }

  // ABS API and media: network-only. Offline books and progress belong to IndexedDB.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/abs/')) {
    event.respondWith(
      fetch(request)
        .catch(() => new Response('Offline', { status: 503, statusText: 'Service Unavailable' }))
    )
    return
  }

  // Navigation: network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          event.waitUntil(cachePutSafe(CACHE_NAME, request, response))
          return response
        })
        .catch(() =>
          caches.match(request)
            .then((cached) => cached || caches.match('/'))
            .then((r) => r || new Response('Offline', { status: 503, statusText: 'Service Unavailable' }))
        )
    )
    return
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) event.waitUntil(cachePutSafe(CACHE_NAME, request, response))
          return response
        })
        .catch(() => cached)

      return Promise.resolve(cached || networkFetch)
        .then((r) => r || new Response('Not Found', { status: 404 }))
    })
  )
})
