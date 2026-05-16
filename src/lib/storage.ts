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
const DB_VERSION = 2
const BOOK_STORE = 'offline-books'
const TRACK_BLOB_STORE = 'offline-track-blobs'
const EBOOK_BLOB_STORE = 'offline-ebook-blobs'

interface OfflineTrackBlobRecord {
  id: string
  itemId: string
  trackIndex: number
  blob: Blob
}

interface OfflineEbookBlobRecord {
  itemId: string
  blob: Blob
}

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
  const db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(BOOK_STORE)) {
        db.createObjectStore(BOOK_STORE, { keyPath: 'itemId' })
      }
      if (!db.objectStoreNames.contains(TRACK_BLOB_STORE)) {
        const store = db.createObjectStore(TRACK_BLOB_STORE, { keyPath: 'id' })
        store.createIndex('itemId', 'itemId')
      }
      if (!db.objectStoreNames.contains(EBOOK_BLOB_STORE)) {
        db.createObjectStore(EBOOK_BLOB_STORE, { keyPath: 'itemId' })
      }
    },
  })

  await migrateLegacyOfflineMedia(db)
  return db
}

export async function listOfflineBooks() {
  const db = await openOfflineDb()
  return db.getAll(BOOK_STORE) as Promise<OfflineBook[]>
}

export async function getOfflineBook(itemId: string) {
  const db = await openOfflineDb()
  const book = await db.get(BOOK_STORE, itemId) as OfflineBook | undefined
  if (!book) {
    return undefined
  }

  const trackRecords = await getTrackBlobRecords(db, itemId)
  const ebookRecord = await db.get(EBOOK_BLOB_STORE, itemId) as OfflineEbookBlobRecord | undefined
  const trackBlobs = new Map(trackRecords.map((record) => [record.trackIndex, record.blob]))

  return {
    ...book,
    tracks: book.tracks.map((track) => ({
      ...track,
      blob: trackBlobs.get(track.trackIndex) ?? track.blob,
    })),
    ebookBlob: ebookRecord?.blob ?? book.ebookBlob ?? null,
  }
}

export function summarizeOfflineBook(book: OfflineBook): OfflineBook {
  return {
    ...book,
    tracks: book.tracks.map((track) => ({
      trackIndex: track.trackIndex,
      title: track.title,
      duration: track.duration,
      mimeType: track.mimeType,
    })),
    ebookBlob: book.ebookBlob ? null : book.ebookBlob,
  }
}

export async function putOfflineBook(book: OfflineBook) {
  const db = await openOfflineDb()
  const existingTrackRecords = await getTrackBlobRecords(db, book.itemId)
  const nextTrackIndices = new Set(book.tracks.map((track) => track.trackIndex))
  const tx = db.transaction([BOOK_STORE, TRACK_BLOB_STORE, EBOOK_BLOB_STORE], 'readwrite')
  const metadata = summarizeOfflineBook(book)
  const bookStore = tx.objectStore(BOOK_STORE)
  const trackStore = tx.objectStore(TRACK_BLOB_STORE)
  const ebookStore = tx.objectStore(EBOOK_BLOB_STORE)
  const writes = [
    bookStore.put(metadata),
    ...existingTrackRecords
      .filter((track) => !nextTrackIndices.has(track.trackIndex))
      .map((track) => trackStore.delete(track.id)),
    ...book.tracks.map((track) => (
      track.blob
        ? trackStore.put({
            id: trackBlobKey(book.itemId, track.trackIndex),
            itemId: book.itemId,
            trackIndex: track.trackIndex,
            blob: track.blob,
          } satisfies OfflineTrackBlobRecord)
        : Promise.resolve()
    )),
    book.ebookBlob
      ? ebookStore.put({
          itemId: book.itemId,
          blob: book.ebookBlob,
        } satisfies OfflineEbookBlobRecord)
      : ebookStore.delete(book.itemId),
  ]

  await Promise.all(writes)
  await tx.done
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
    totalBytes: tracks.reduce((total, track) => total + (track.blob?.size ?? 0), 0) + (ebookBlob?.size ?? 0),
    updatedAt: Date.now(),
    tracks,
    ebookBlob,
  } satisfies OfflineBook
}

export async function removeOfflineTracks(itemId: string, trackIndices: number[]) {
  const db = await openOfflineDb()
  const book = await getOfflineBook(itemId)
  if (!book) {
    return
  }

  const next = removeOfflineTracksFromBook(book, trackIndices)
  if (next) {
    const tx = db.transaction([BOOK_STORE, TRACK_BLOB_STORE, EBOOK_BLOB_STORE], 'readwrite')
    const bookStore = tx.objectStore(BOOK_STORE)
    const trackStore = tx.objectStore(TRACK_BLOB_STORE)
    await Promise.all([
      bookStore.put(summarizeOfflineBook(next)),
      ...trackIndices.map((trackIndex) => trackStore.delete(trackBlobKey(itemId, trackIndex))),
    ])
    await tx.done
  } else {
    await deleteOfflineBook(itemId)
  }
}

export async function deleteOfflineBook(itemId: string) {
  const db = await openOfflineDb()
  const trackRecords = await getTrackBlobRecords(db, itemId)
  const tx = db.transaction([BOOK_STORE, TRACK_BLOB_STORE, EBOOK_BLOB_STORE], 'readwrite')
  const bookStore = tx.objectStore(BOOK_STORE)
  const trackStore = tx.objectStore(TRACK_BLOB_STORE)
  const ebookStore = tx.objectStore(EBOOK_BLOB_STORE)
  await Promise.all([
    bookStore.delete(itemId),
    ebookStore.delete(itemId),
    ...trackRecords.map((track) => trackStore.delete(track.id)),
  ])
  await tx.done
}

function trackBlobKey(itemId: string, trackIndex: number) {
  return `${itemId}::${trackIndex}`
}

async function getTrackBlobRecords(db: Awaited<ReturnType<typeof openDB>>, itemId: string) {
  const tx = db.transaction(TRACK_BLOB_STORE, 'readonly')
  const index = tx.objectStore(TRACK_BLOB_STORE).index('itemId')
  return index.getAll(itemId) as Promise<OfflineTrackBlobRecord[]>
}

async function migrateLegacyOfflineMedia(db: Awaited<ReturnType<typeof openDB>>) {
  const books = await db.getAll(BOOK_STORE) as OfflineBook[]
  const legacyBooks = books.filter((book) => (
    book.ebookBlob || book.tracks.some((track) => track.blob)
  ))

  if (legacyBooks.length === 0) {
    return
  }

  const tx = db.transaction([BOOK_STORE, TRACK_BLOB_STORE, EBOOK_BLOB_STORE], 'readwrite')
  await Promise.all(legacyBooks.flatMap((book) => [
    tx.objectStore(BOOK_STORE).put(summarizeOfflineBook(book)),
    ...book.tracks.map((track) => (
      track.blob
        ? tx.objectStore(TRACK_BLOB_STORE).put({
            id: trackBlobKey(book.itemId, track.trackIndex),
            itemId: book.itemId,
            trackIndex: track.trackIndex,
            blob: track.blob,
          } satisfies OfflineTrackBlobRecord)
        : Promise.resolve()
    )),
    book.ebookBlob
      ? tx.objectStore(EBOOK_BLOB_STORE).put({
          itemId: book.itemId,
          blob: book.ebookBlob,
        } satisfies OfflineEbookBlobRecord)
      : Promise.resolve(),
  ]))
  await tx.done
}
