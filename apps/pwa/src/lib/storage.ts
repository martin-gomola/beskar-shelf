import { openDB } from 'idb'

import type {
  OfflineBook,
  PersistedPlaybackState,
  ServerConfig,
  UserSession,
} from './types'

const STORAGE_KEYS = {
  server: 'beskar:pwa:server',
  session: 'beskar:pwa:session',
  playback: 'beskar:pwa:playback',
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

export async function deleteOfflineBook(itemId: string) {
  const db = await openOfflineDb()
  await db.delete(BOOK_STORE, itemId)
}
