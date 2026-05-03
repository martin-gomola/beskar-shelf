import { openDB } from 'idb'

import type {
  Bookmark,
  OfflineBook,
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
} as const

const DB_NAME = 'beskar-shelf'
const DB_VERSION = 1
const BOOK_STORE = 'offline-books'

function readJson<T>(key: string) {
  const value = window.localStorage.getItem(key)
  if (!value) {
    return null
  }

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

interface QueuedProgress {
  itemId: string
  payload: Record<string, unknown>
  queuedAt: number
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

async function openOfflineDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(BOOK_STORE)) {
        db.createObjectStore(BOOK_STORE, { keyPath: 'itemId' })
      }
    },
  })
}

export async function listOfflineBooks() {
  const db = await openOfflineDb()
  return db.getAll(BOOK_STORE) as Promise<OfflineBook[]>
}

export async function getOfflineBook(itemId: string) {
  const db = await openOfflineDb()
  return db.get(BOOK_STORE, itemId) as Promise<OfflineBook | undefined>
}

export async function putOfflineBook(book: OfflineBook) {
  const db = await openOfflineDb()
  await db.put(BOOK_STORE, book)
}

export function removeOfflineTracksFromBook(book: OfflineBook, trackIndices: number[]) {
  const removeSet = new Set(trackIndices)
  const tracks = book.tracks.filter((track) => !removeSet.has(track.trackIndex))

  if (tracks.length === book.tracks.length) {
    return book
  }

  const ebookBlob = book.ebookBlob ?? null
  if (tracks.length === 0 && !ebookBlob) {
    return null
  }

  return {
    ...book,
    totalBytes: tracks.reduce((total, track) => total + track.blob.size, 0) + (ebookBlob?.size ?? 0),
    updatedAt: Date.now(),
    tracks,
    ebookBlob,
  } satisfies OfflineBook
}

export async function removeOfflineTracks(itemId: string, trackIndices: number[]) {
  const db = await openOfflineDb()
  const book = await db.get(BOOK_STORE, itemId) as OfflineBook | undefined
  if (!book) {
    return
  }

  const next = removeOfflineTracksFromBook(book, trackIndices)
  if (next) {
    await db.put(BOOK_STORE, next)
  } else {
    await db.delete(BOOK_STORE, itemId)
  }
}

export async function deleteOfflineBook(itemId: string) {
  const db = await openOfflineDb()
  await db.delete(BOOK_STORE, itemId)
}
