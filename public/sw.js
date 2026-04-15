const BUILD_VERSION = '__BUILD_VERSION__'
const CACHE_NAME = `beskar-shelf-${BUILD_VERSION}`
const COVER_CACHE = 'beskar-covers'
const API_CACHE = 'beskar-api'

const cachePutSafe = async (cacheName, request, response) => {
  if (!response || response.bodyUsed) return
  if (response.status === 206) return
  try {
    const cache = await caches.open(cacheName)
    await cache.put(request, response.clone())
  } catch (_) {}
}

const PRECACHE = ['/', '/favicon.svg', '/manifest.webmanifest', '/pwa-icon.svg', ...__PRECACHE_ASSETS__]

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
          .filter((key) => key !== CACHE_NAME && key !== COVER_CACHE && key !== API_CACHE && key.startsWith('beskar-'))
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

  // API JSON: stale-while-revalidate for GETs; pass-through for mutations
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/abs/')) {
    if (request.method !== 'GET') return

    // Strip volatile params (auth token) so cache key is stable across token rotations
    const stableUrl = new URL(request.url)
    stableUrl.searchParams.delete('token')
    const cacheKey = new Request(stableUrl.toString(), { method: 'GET' })

    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(cacheKey)
        const networkFetch = fetch(request)
          .then((res) => {
            if (res.ok) event.waitUntil(cachePutSafe(API_CACHE, cacheKey, res))
            return res
          })
          .catch(() => cached ?? new Response('Offline', { status: 503, statusText: 'Service Unavailable' }))
        return cached ?? networkFetch
      })
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
