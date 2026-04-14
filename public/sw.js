const BUILD_VERSION = '__BUILD_VERSION__'
const CACHE_NAME = `beskar-shelf-${BUILD_VERSION}`
const COVER_CACHE = 'beskar-covers'

const cachePutSafe = async (cacheName, request, response) => {
  if (!response || response.bodyUsed) return
  if (response.status === 206) return
  try {
    const cache = await caches.open(cacheName)
    await cache.put(request, response.clone())
  } catch (_) {}
}

const PRECACHE = ['/', '/favicon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== COVER_CACHE && key.startsWith('beskar-'))
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return

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

  // API JSON: network-only (authenticated, don't cache)
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
