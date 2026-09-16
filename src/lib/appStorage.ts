import type {
  Bookmark,
  PersistedPlaybackState,
  ServerConfig,
  UserSession,
} from './types'

const STORAGE_KEYS = {
  server: 'beskar:pwa:server',
  session: 'beskar:pwa:session',
  playback: 'beskar:pwa:playback',
  progressQueue: 'beskar:pwa:progress-queue',
  bookmarksPrefix: 'beskar:pwa:bookmarks:',
  bookRates: 'beskar:pwa:book-rates',
} as const

interface QueuedProgress {
  itemId: string
  payload: Record<string, unknown>
  queuedAt: number
}

function readJson<T>(key: string) {
  const value = window.localStorage.getItem(key)
  if (!value) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function writeJson<T>(key: string, value: T | null) {
  if (value === null) {
    window.localStorage.removeItem(key)
    return
  }

  window.localStorage.setItem(key, JSON.stringify(value))
}

export function loadServerConfig() {
  return readJson<ServerConfig>(STORAGE_KEYS.server)
}

export function saveServerConfig(config: ServerConfig | null) {
  writeJson(STORAGE_KEYS.server, config)
}

export function loadUserSession() {
  return readJson<UserSession>(STORAGE_KEYS.session)
}

export function saveUserSession(session: UserSession | null) {
  writeJson(STORAGE_KEYS.session, session)
}

export function loadPlaybackState() {
  return readJson<PersistedPlaybackState>(STORAGE_KEYS.playback)
}

export function savePlaybackState(state: PersistedPlaybackState | null) {
  writeJson(STORAGE_KEYS.playback, state)
}

export function loadProgressQueue(): QueuedProgress[] {
  return readJson<QueuedProgress[]>(STORAGE_KEYS.progressQueue) ?? []
}

export function saveProgressQueue(queue: QueuedProgress[]) {
  writeJson(STORAGE_KEYS.progressQueue, queue.length > 0 ? queue : null)
}

export function enqueueProgress(itemId: string, payload: Record<string, unknown>) {
  const queue = loadProgressQueue().filter((entry) => entry.itemId !== itemId)
  queue.push({ itemId, payload, queuedAt: Date.now() })
  saveProgressQueue(queue)
}

function bookmarkKey(itemId: string) {
  return `${STORAGE_KEYS.bookmarksPrefix}${itemId}`
}

export function loadBookmarks(itemId: string) {
  return readJson<Bookmark[]>(bookmarkKey(itemId)) ?? []
}

function saveBookmarks(itemId: string, bookmarks: Bookmark[]) {
  const sorted = [...bookmarks].sort((a, b) => a.time - b.time)
  writeJson(bookmarkKey(itemId), sorted.length > 0 ? sorted : null)
}

export function upsertBookmark(itemId: string, bookmark: Bookmark) {
  const bookmarks = loadBookmarks(itemId).filter((entry) => entry.time !== bookmark.time)
  bookmarks.push(bookmark)
  saveBookmarks(itemId, bookmarks)
}

export function deleteBookmark(itemId: string, time: number) {
  const bookmarks = loadBookmarks(itemId).filter((entry) => entry.time !== time)
  saveBookmarks(itemId, bookmarks)
}

export function loadBookRate(itemId: string): number | null {
  const map = readJson<Record<string, number>>(STORAGE_KEYS.bookRates) ?? {}
  const value = map[itemId]
  return typeof value === 'number' && value > 0 ? value : null
}

export function saveBookRate(itemId: string, rate: number) {
  const map = readJson<Record<string, number>>(STORAGE_KEYS.bookRates) ?? {}
  if (rate === 1) {
    delete map[itemId]
  } else {
    map[itemId] = rate
  }
  writeJson(STORAGE_KEYS.bookRates, Object.keys(map).length > 0 ? map : null)
}

export async function clearNetworkCaches() {
  if (typeof caches === 'undefined') return

  const cacheNames = ['beskar-api', 'beskar-covers'] as const
  await Promise.all(cacheNames.map(async (name) => {
    try {
      await caches.delete(name)
    } catch {
      // One cache failure must not block clearing the other cache.
    }
  }))
}
