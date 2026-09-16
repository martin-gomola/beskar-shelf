import type { IDBPDatabase } from 'idb'
import {
  IndexedDbOfflineStorage,
  TransferOperationError,
  createOfflineMediaClient,
  type IndexedDbMigration,
  type OfflineAsset,
  type OfflineMediaClient,
  type RuntimeRequest,
  type StoredAsset,
  type StoredObject,
  type TransferSnapshot,
  type TransferState,
} from '@mgomola/pwa-offline-media'

import type { AudiobookshelfClient } from './api'
import type {
  ActivePlayback,
} from '../hooks/playback/shared'
import type {
  AudioTrack,
  BookItem,
  DownloadBookOptions,
  DownloadProgress,
  OfflineBook,
  OfflineTrack,
} from './types'

const DB_NAME = 'beskar-shelf'
const DB_VERSION = 3
const ASSET_STORE = 'offline-media-assets'
const CHUNK_STORE = 'offline-media-chunks'
const OBJECT_STORE = 'offline-media-objects'
const MIGRATION_STORE = 'offline-media-migrations'
const LEGACY_BOOK_STORE = 'offline-books'
const LEGACY_TRACK_STORE = 'offline-track-blobs'
const LEGACY_EBOOK_STORE = 'offline-ebook-blobs'
const MIGRATION_ID = 'beskar-shelf-offline-books-v1'

interface BookMetadata {
  kind: 'book'
  itemId: string
  title: string
  author: string
  coverPath: string | null
  totalTracks: number
  ebookFormat: string | null
  source: 'download' | 'cache'
  status: OfflineBook['status']
}

interface TrackMetadata {
  kind: 'track'
  trackIndex: number
  title: string
  duration: number
  mimeType: string
}

interface EbookMetadata {
  kind: 'ebook'
  format: string
}

type MediaMetadata = BookMetadata | TrackMetadata | EbookMetadata

interface LegacyTrackRecord {
  itemId: string
  trackIndex: number
  size?: number
  data?: ArrayBuffer
  mimeType?: string
  blob?: Blob
}

interface LegacyEbookRecord {
  itemId: string
  size?: number
  data?: ArrayBuffer
  mimeType?: string
  blob?: Blob
}

let mediaClient: OfflineMediaClient | undefined
let mediaStorage: IndexedDbOfflineStorage | undefined
const requestFactories = new Map<string, () => Promise<RuntimeRequest>>()

function getMediaClient() {
  if (mediaClient) return mediaClient
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable in this browser.')
  }

  const migration: IndexedDbMigration = {
    id: MIGRATION_ID,
    migrate: migrateLegacyRecords,
  }
  mediaStorage = new IndexedDbOfflineStorage({
    databaseName: DB_NAME,
    version: DB_VERSION,
    assetStoreName: ASSET_STORE,
    chunkStoreName: CHUNK_STORE,
    objectStoreName: OBJECT_STORE,
    migrationStoreName: MIGRATION_STORE,
    migration,
  })
  mediaClient = createOfflineMediaClient({
    namespace: 'beskar-shelf',
    storage: mediaStorage,
    requestFactory: async (asset) => {
      const factory = requestFactories.get(asset.id)
      if (!factory) {
        throw new TransferOperationError({
          code: 'network',
          message: 'A fresh authenticated request is required to retry this asset.',
          retryable: true,
        })
      }
      return factory()
    },
  })
  return mediaClient
}

export async function recoverOfflineMedia() {
  if (typeof indexedDB === 'undefined') return 0
  return getMediaClient().recoverAbandoned()
}

export async function listOfflineBooks() {
  if (typeof indexedDB === 'undefined') return []
  try {
    const snapshots = await getMediaClient().list()
    return groupSnapshots(snapshots)
  } catch {
    return []
  }
}

export async function getOfflineBookSummary(itemId: string) {
  if (typeof indexedDB === 'undefined') return undefined
  try {
    const snapshots = await getMediaClient().list(itemId)
    return snapshots.length > 0 ? groupSnapshots(snapshots)[0] : undefined
  } catch {
    return undefined
  }
}

export async function getOfflineBook(itemId: string) {
  if (typeof indexedDB === 'undefined') return undefined
  const client = getMediaClient()
  let snapshots: TransferSnapshot[]
  try {
    snapshots = await client.list(itemId)
  } catch {
    return undefined
  }
  if (snapshots.length === 0) return undefined

  const book = groupSnapshots(snapshots)[0]
  if (!book) return undefined

  const tracks = await Promise.all(book.tracks.map(async (track) => ({
    ...track,
    blob: await client.readBlob(trackAssetId(itemId, track.trackIndex)),
  })))
  const ebookBlob = book.ebookSize
    ? await client.readBlob(ebookAssetId(itemId))
    : undefined

  return {
    ...book,
    tracks,
    ebookBlob: ebookBlob ?? null,
  }
}

export function bookItemFromOffline(book: OfflineBook): BookItem {
  let startOffset = 0
  const audioTracks = book.tracks.map((track) => {
    const next = {
      index: track.trackIndex,
      duration: track.duration,
      startOffset,
      contentUrl: '',
      mimeType: track.mimeType,
      title: track.title,
    }
    startOffset += track.duration
    return next
  })
  const duration = audioTracks.reduce((total, track) => total + track.duration, 0)
  return {
    id: book.itemId,
    libraryId: '',
    title: book.title,
    author: book.author,
    narrator: null,
    description: '',
    coverPath: book.coverPath,
    duration,
    size: book.totalBytes,
    genres: [],
    progress: 0,
    currentTime: 0,
    isFinished: false,
    chapters: audioTracks.map((track) => ({
      id: track.index,
      title: track.title,
      start: track.startOffset,
      end: track.startOffset + track.duration,
    })),
    audioTracks,
    ebookFormat: book.ebookFormat ?? null,
    ebookLocation: null,
    ebookProgress: 0,
  }
}

export async function downloadBook(
  client: AudiobookshelfClient,
  item: BookItem,
  options?: DownloadBookOptions,
  onProgress?: (progress: DownloadProgress) => void,
) {
  const packageClient = getMediaClient()
  const shouldDownloadAudio = item.audioTracks.length > 0 || !item.ebookFormat
  const playback = shouldDownloadAudio
    ? await client.startPlayback(item.id)
    : { audioTracks: [] }
  const selectedTrackIndices = shouldDownloadAudio
    ? Array.from(new Set(options?.selectedTrackIndices?.filter((index) => index >= 0 && index < playback.audioTracks.length) ?? playback.audioTracks.map((_, index) => index)))
    : []
  const selectedTracks = selectedTrackIndices.map((index) => playback.audioTracks[index])
  const itemMetadata = bookMetadata(item, 'download', 'downloading')
  const marker = bookAsset(item.id, itemMetadata)
  await packageClient.enqueue(marker)

  const liveBytes = new Map<string, number>()
  const selectedAssetIds = new Set(selectedTracks.map((track) => trackAssetId(item.id, track.index)))
  if (item.ebookFormat) selectedAssetIds.add(ebookAssetId(item.id))
  const emitProgress = async (persisted: boolean) => {
    const snapshots = await packageClient.list(item.id)
    const completeTracks = snapshots
      .filter((snapshot) => metadata(snapshot)?.kind === 'track' && snapshot.state === 'complete')
      .map((snapshot) => metadata(snapshot) as TrackMetadata)
      .sort((a, b) => a.trackIndex - b.trackIndex)
    const persistedBytes = snapshots.reduce((total, snapshot) => total + snapshot.persistedBytes, 0)
    const inFlightBytes = Array.from(liveBytes.entries())
      .filter(([assetId]) => selectedAssetIds.has(assetId))
      .reduce((total, [, bytes]) => total + bytes, 0)
    const expectedBytes = snapshots.reduce((total, snapshot) => total + (snapshot.expectedBytes ?? 0), 0)
    const progress: DownloadProgress = {
      completedTracks: completeTracks.length,
      totalTracks: playback.audioTracks.length,
      completedBytes: persistedBytes + inFlightBytes,
      totalBytes: Math.max(expectedBytes, persistedBytes + inFlightBytes, selectedTrackIndices.length === playback.audioTracks.length ? item.size : 0),
      completedTrackIndices: completeTracks.map((track) => track.trackIndex),
    }
    options?.onProgress?.(progress)
    if (persisted) onProgress?.(progress)
  }
  const unsubscribe = packageClient.subscribe((event) => {
    if (!selectedAssetIds.has(event.assetId)) return
    if (event.type === 'progress') {
      liveBytes.set(event.assetId, event.receivedBytes)
      void emitProgress(false)
    }
    if (event.type === 'state' && ['complete', 'stopped', 'failed'].includes(event.to)) {
      void emitProgress(true)
    }
  })

  let currentAssetId: string | undefined
  const stopCurrent = () => {
    if (currentAssetId) packageClient.stop(currentAssetId)
  }
  options?.signal?.addEventListener('abort', stopCurrent)

  try {
    for (const track of selectedTracks) {
      if (options?.signal?.aborted) throw stoppedDownloadError()
      const asset = trackAsset(item, track)
      currentAssetId = asset.id
      requestFactories.set(asset.id, async () => ({ url: client.streamUrl(track.contentUrl) }))
      await packageClient.enqueue(asset)
      await packageClient.start(asset.id)
      await emitProgress(true)
      liveBytes.delete(asset.id)
    }

    if (item.ebookFormat) {
      if (options?.signal?.aborted) throw stoppedDownloadError()
      const asset = ebookAsset(item)
      currentAssetId = asset.id
      requestFactories.set(asset.id, async () => ({ url: client.ebookUrl(item.id) }))
      await packageClient.enqueue(asset)
      await packageClient.start(asset.id)
      await emitProgress(true)
    }

    await packageClient.enqueue(bookAsset(item.id, bookMetadata(item, 'download', 'downloaded')))
    return (await getOfflineBook(item.id))!
  } catch (error) {
    const status = isAbortError(error) || options?.signal?.aborted ? 'idle' : 'error'
    await packageClient.enqueue(bookAsset(item.id, bookMetadata(item, 'download', status)))
    await emitProgress(true)
    throw error
  } finally {
    options?.signal?.removeEventListener('abort', stopCurrent)
    unsubscribe()
    currentAssetId = undefined
  }
}

export async function cachePlayedTrack(
  client: AudiobookshelfClient,
  activePlayback: ActivePlayback,
  trackIndex: number,
) {
  const track = activePlayback.session.audioTracks[trackIndex]
  if (!track?.contentUrl) return null

  const packageClient = getMediaClient()
  const asset = trackAsset(activePlayback.item, track, 'cache')
  requestFactories.set(asset.id, async () => ({ url: client.streamUrl(track.contentUrl) }))
  await packageClient.enqueue(asset)
  const existing = await packageClient.status(asset.id)
  if (existing?.state !== 'complete') {
    await packageClient.start(asset.id)
  }

  await packageClient.enqueue(bookAsset(
    activePlayback.item.id,
    bookMetadata(activePlayback.item, 'cache', 'downloaded'),
  ))
  return packageClient.readBlob(asset.id)
}

export async function removeOfflineTracks(itemId: string, trackIndices: number[]) {
  const client = getMediaClient()
  const snapshots = await client.list(itemId)
  const removeSet = new Set(trackIndices)
  for (const snapshot of snapshots) {
    const data = metadata(snapshot)
    if (data?.kind === 'track' && removeSet.has(data.trackIndex)) {
      await client.remove(snapshot.id)
    }
  }

  const remaining = await client.list(itemId)
  const hasMedia = remaining.some((snapshot) => ['track', 'ebook'].includes(metadata(snapshot)?.kind ?? ''))
  if (!hasMedia) {
    await deleteOfflineBook(itemId)
  }
}

export async function deleteOfflineBook(itemId: string) {
  const client = getMediaClient()
  const snapshots = await client.list(itemId)
  for (const snapshot of snapshots) await client.remove(snapshot.id)
}

function bookAsset(itemId: string, data: BookMetadata): OfflineAsset {
  return { id: bookAssetId(itemId), groupId: itemId, metadata: { ...data } }
}

function trackAsset(item: BookItem, track: AudioTrack, source: 'download' | 'cache' = 'download'): OfflineAsset {
  return {
    id: trackAssetId(item.id, track.index),
    groupId: item.id,
    filename: track.title,
    mimeType: track.mimeType,
    metadata: {
      kind: 'track',
      trackIndex: track.index,
      title: track.title,
      duration: track.duration,
      mimeType: track.mimeType,
      source,
    },
  }
}

function ebookAsset(item: Pick<BookItem, 'id' | 'ebookFormat'>): OfflineAsset {
  return {
    id: ebookAssetId(item.id),
    groupId: item.id,
    filename: `${item.id}.${item.ebookFormat}`,
    mimeType: 'application/epub+zip',
    metadata: { kind: 'ebook', format: item.ebookFormat ?? 'epub' } satisfies EbookMetadata,
  }
}

function bookMetadata(item: BookItem, source: 'download' | 'cache', status: OfflineBook['status']): BookMetadata {
  return {
    kind: 'book',
    itemId: item.id,
    title: item.title,
    author: item.author,
    coverPath: item.coverPath,
    totalTracks: item.audioTracks.length,
    ebookFormat: item.ebookFormat,
    source,
    status,
  }
}

function groupSnapshots(snapshots: TransferSnapshot[]) {
  const byGroup = new Map<string, TransferSnapshot[]>()
  for (const snapshot of snapshots) {
    const snapshotMetadata = metadata(snapshot)
    const groupId = snapshot.groupId
      ?? (snapshotMetadata?.kind === 'book' ? snapshotMetadata.itemId : snapshot.id)
    const group = byGroup.get(groupId) ?? []
    group.push(snapshot)
    byGroup.set(groupId, group)
  }
  return Array.from(byGroup.values()).map(toOfflineBook)
}

function toOfflineBook(snapshots: TransferSnapshot[]): OfflineBook {
  const marker = snapshots.find((snapshot) => metadata(snapshot)?.kind === 'book')
  const markerData = metadata(marker) as BookMetadata | undefined
  const trackSnapshots = snapshots.filter((snapshot) => metadata(snapshot)?.kind === 'track' && snapshot.state === 'complete')
  const ebookSnapshot = snapshots.find((snapshot) => metadata(snapshot)?.kind === 'ebook' && snapshot.state === 'complete')
  const childSnapshots = snapshots.filter((snapshot) => metadata(snapshot)?.kind !== 'book')
  const active = markerData?.status === 'downloading'
    || childSnapshots.some((snapshot) => ['queued', 'downloading', 'stopping'].includes(snapshot.state))
  const failed = markerData?.status === 'error'
    || childSnapshots.some((snapshot) => ['failed', 'interrupted'].includes(snapshot.state))
    || (markerData?.status === 'downloading' && ['failed', 'interrupted'].includes(marker?.state ?? 'idle'))
  const status = active
    ? 'downloading'
    : failed || markerData?.status === 'error'
      ? 'error'
      : markerData?.status === 'idle'
        ? 'idle'
        : 'downloaded'
  const tracks = trackSnapshots.map((snapshot) => {
    const data = metadata(snapshot) as TrackMetadata
    return {
      trackIndex: data.trackIndex,
      title: data.title,
      duration: data.duration,
      mimeType: data.mimeType,
      size: snapshot.persistedBytes || snapshot.expectedBytes,
    } satisfies OfflineTrack
  })
  const totalBytes = snapshots.reduce((total, snapshot) => total + snapshot.persistedBytes, 0)
  return {
    itemId: markerData?.itemId ?? snapshots[0]?.groupId ?? snapshots[0]?.id ?? '',
    title: markerData?.title ?? '',
    author: markerData?.author ?? '',
    coverPath: markerData?.coverPath ?? null,
    status,
    source: markerData?.source ?? 'download',
    totalBytes,
    totalTracks: markerData?.totalTracks ?? tracks.length,
    updatedAt: Math.max(...snapshots.map((snapshot) => snapshot.updatedAt)),
    tracks,
    ebookBlob: null,
    ebookSize: ebookSnapshot?.persistedBytes || ebookSnapshot?.expectedBytes,
    ebookFormat: markerData?.ebookFormat ?? null,
  }
}

function metadata(snapshot: TransferSnapshot | undefined) {
  const value = snapshot?.metadata
  if (!value || typeof value !== 'object' || !('kind' in value)) return undefined
  return value as unknown as MediaMetadata
}

function bookAssetId(itemId: string) {
  return `book:${encodeURIComponent(itemId)}`
}

function trackAssetId(itemId: string, trackIndex: number) {
  return `track:${encodeURIComponent(itemId)}:${trackIndex}`
}

function ebookAssetId(itemId: string) {
  return `ebook:${encodeURIComponent(itemId)}`
}

function stoppedDownloadError() {
  const error = new Error('Download stopped. Completed assets were kept.')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

function legacyState(status: OfflineBook['status']): TransferState {
  if (status === 'downloaded') return 'complete'
  if (status === 'downloading') return 'downloading'
  if (status === 'error') return 'failed'
  return 'idle'
}

async function migrateLegacyRecords(db: IDBPDatabase) {
  if (!db.objectStoreNames.contains(LEGACY_BOOK_STORE)) return {}

  const books = await db.getAll(LEGACY_BOOK_STORE) as OfflineBook[]
  const trackRecords = db.objectStoreNames.contains(LEGACY_TRACK_STORE)
    ? await db.getAll(LEGACY_TRACK_STORE) as LegacyTrackRecord[]
    : []
  const ebookRecords = db.objectStoreNames.contains(LEGACY_EBOOK_STORE)
    ? await db.getAll(LEGACY_EBOOK_STORE) as LegacyEbookRecord[]
    : []
  const objects: StoredObject[] = []
  const assets: StoredAsset[] = []

  for (const book of books) {
    const now = Date.now()
    assets.push({
      ...bookAsset(book.itemId, {
        kind: 'book',
        itemId: book.itemId,
        title: book.title,
        author: book.author,
        coverPath: book.coverPath,
        totalTracks: book.totalTracks ?? book.tracks.length,
        ebookFormat: book.ebookFormat ?? null,
        source: book.source ?? 'download',
        status: book.status,
      }),
      state: legacyState(book.status),
      persistedBytes: 0,
      completedRanges: [],
      createdAt: book.updatedAt || now,
      updatedAt: book.updatedAt || now,
      schemaVersion: 1,
    })

    for (const track of book.tracks) {
      const record = trackRecords.find((candidate) => candidate.itemId === book.itemId && candidate.trackIndex === track.trackIndex)
      const data = record ? await legacyBinary(record) : undefined
      const size = track.size ?? record?.size ?? data?.byteLength ?? 0
      assets.push({
        ...trackAsset(
          {
            id: book.itemId,
            audioTracks: [],
          } as unknown as BookItem,
          {
            index: track.trackIndex,
            title: track.title,
            duration: track.duration,
            mimeType: track.mimeType,
            contentUrl: '',
            startOffset: 0,
          },
        ),
        state: 'complete',
        persistedBytes: size,
        expectedBytes: size,
        completedRanges: size > 0 ? [{ start: 0, end: size }] : [],
        createdAt: book.updatedAt || now,
        updatedAt: book.updatedAt || now,
        schemaVersion: 1,
      })
      if (data) {
        objects.push({
          assetId: trackAssetId(book.itemId, track.trackIndex),
          data,
          mimeType: record?.mimeType ?? track.mimeType,
          size,
        })
      }
    }

    if (book.ebookFormat) {
      const record = ebookRecords.find((candidate) => candidate.itemId === book.itemId)
      const data = record ? await legacyBinary(record) : undefined
      const size = book.ebookSize ?? record?.size ?? data?.byteLength ?? 0
      assets.push({
        ...ebookAsset({ id: book.itemId, ebookFormat: book.ebookFormat }),
        state: 'complete',
        persistedBytes: size,
        expectedBytes: size,
        completedRanges: size > 0 ? [{ start: 0, end: size }] : [],
        createdAt: book.updatedAt || now,
        updatedAt: book.updatedAt || now,
        schemaVersion: 1,
      })
      if (data) {
        objects.push({
          assetId: ebookAssetId(book.itemId),
          data,
          mimeType: record?.mimeType ?? 'application/epub+zip',
          size,
        })
      }
    }
  }

  return { assets, objects }
}

async function legacyBinary(record: LegacyTrackRecord | LegacyEbookRecord) {
  if (record.data) return record.data.slice(0)
  return record.blob?.arrayBuffer()
}
