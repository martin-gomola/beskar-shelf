import type { AudiobookshelfClient } from './api'
import {
  getOfflineBookSummary,
  getOfflineTrackBlob,
  putOfflineBookSummary,
  putOfflineEbook,
  putOfflineTrack,
} from './storage'
import type { ActivePlayback } from '../hooks/playback/shared'
import type { BookItem, DownloadBookOptions, DownloadProgress, OfflineBook, OfflineTrack } from './types'

// WebKit holds a complete response while IndexedDB prepares its binary value.
// Keep one track in memory, persist it, then retain metadata only before the
// next transfer starts.
const CONCURRENCY = 1
const DOWNLOAD_STALL_TIMEOUT_MS = 30_000

function stoppedDownloadError() {
  const error = new Error('Download stopped. Completed tracks were kept.')
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError'
}

export async function downloadBook(
  client: AudiobookshelfClient,
  item: BookItem,
  options?: DownloadBookOptions,
  onProgress?: (progress: DownloadProgress) => void,
) {
  try {
    return await downloadBookAttempt(client, item, options, onProgress)
  } catch (error) {
    try {
      const existing = await getOfflineBookSummary(item.id)
      await putOfflineBookSummary({
        itemId: item.id,
        title: existing?.title ?? item.title,
        author: existing?.author ?? item.author,
        coverPath: existing?.coverPath ?? item.coverPath,
        status: isAbortError(error) ? 'idle' : 'error',
        source: existing?.source ?? 'download',
        totalBytes: existing?.totalBytes ?? 0,
        totalTracks: existing?.totalTracks ?? item.audioTracks.length,
        updatedAt: Date.now(),
        tracks: existing?.tracks ?? [],
        ebookBlob: null,
        ebookSize: existing?.ebookSize,
        ebookFormat: existing?.ebookFormat ?? item.ebookFormat,
      })
    } catch {
      // If IndexedDB itself is unavailable, preserve the original download error.
    }
    throw error
  }
}

async function downloadBookAttempt(
  client: AudiobookshelfClient,
  item: BookItem,
  options?: DownloadBookOptions,
  onProgress?: (progress: DownloadProgress) => void,
) {
  const existing = await getOfflineBookSummary(item.id)
  const savedTracks = new Map<number, OfflineTrack>(
    (existing?.tracks ?? []).map((track) => [track.trackIndex, track]),
  )
  const downloadedTrackBytes = new Map<number, number>()
  const inFlightTrackBytes = new Map<number, number>()
  const expectedTrackBytes = new Map<number, number>()

  const shell: OfflineBook = {
    itemId: item.id,
    title: item.title,
    author: item.author,
    coverPath: item.coverPath,
    status: 'downloading',
    source: 'download',
    totalBytes: existing?.totalBytes ?? 0,
    totalTracks: existing?.totalTracks,
    updatedAt: Date.now(),
    tracks: existing?.tracks ?? [],
    ebookBlob: null,
    ebookSize: existing?.ebookSize,
    ebookFormat: item.ebookFormat,
  }

  await putOfflineBookSummary(shell)

  const shouldDownloadAudio = item.audioTracks.length > 0 || !item.ebookFormat
  const playback = shouldDownloadAudio
    ? await client.startPlayback(item.id)
    : { audioTracks: [] }
  const selectedTrackIndices = shouldDownloadAudio
    ? Array.from(new Set(options?.selectedTrackIndices?.filter((index) => index >= 0 && index < playback.audioTracks.length) ?? playback.audioTracks.map((_, index) => index)))
    : []
  const totalTracks = playback.audioTracks.length
  const selectedTracks = selectedTrackIndices
    .map((selectedIndex) => ({ selectedIndex }))
    .filter(({ selectedIndex }) => !savedTracks.has(playback.audioTracks[selectedIndex].index))

  for (const track of savedTracks.values()) {
    if (track.size) {
      expectedTrackBytes.set(track.trackIndex, track.size)
    }
  }

  function orderedTracks() {
    const playbackOrder = playback.audioTracks
      .map((track) => savedTracks.get(track.index))
      .filter((track): track is OfflineTrack => Boolean(track))
    const playbackTrackIndices = new Set(playback.audioTracks.map((track) => track.index))
    const legacyTracks = Array.from(savedTracks.values())
      .filter((track) => !playbackTrackIndices.has(track.trackIndex))
      .sort((a, b) => a.trackIndex - b.trackIndex)

    return [...playbackOrder, ...legacyTracks]
  }

  function currentBytes(ebookBlob: Blob | null = null) {
    const downloadedBytes = Array.from(downloadedTrackBytes.values()).reduce((total, bytes) => total + bytes, 0)
    return (existing?.totalBytes ?? 0) + downloadedBytes + (ebookBlob?.size ?? 0)
  }

  function currentProgressBytes(ebookBlob: Blob | null = null) {
    const inFlightBytes = Array.from(inFlightTrackBytes.values()).reduce((total, bytes) => total + bytes, 0)
    return currentBytes(ebookBlob) + inFlightBytes
  }

  function knownTotalBytes(ebookBlob: Blob | null = null) {
    const expectedBytes = Array.from(expectedTrackBytes.values()).reduce((total, bytes) => total + bytes, 0) + (ebookBlob?.size ?? 0)
    return Math.max(expectedBytes, currentProgressBytes(ebookBlob), selectedTrackIndices.length === totalTracks ? item.size : 0)
  }

  function buildProgress(ebookBlob: Blob | null = null): DownloadProgress {
    return {
      completedTracks: orderedTracks().length,
      totalTracks,
      completedBytes: currentProgressBytes(ebookBlob),
      totalBytes: knownTotalBytes(ebookBlob),
      completedTrackIndices: orderedTracks().map((track) => track.trackIndex),
    }
  }

  function emitProgress(ebookBlob: Blob | null = null, persisted = false) {
    const progress = buildProgress(ebookBlob)
    options?.onProgress?.(progress)
    if (persisted) {
      onProgress?.(progress)
    }
  }

  async function persistProgress(status: OfflineBook['status'], ebookBlob: Blob | null = null) {
    const partial: OfflineBook = {
      ...shell,
      status,
      totalBytes: currentBytes(ebookBlob),
      totalTracks,
      updatedAt: Date.now(),
      tracks: orderedTracks(),
      ebookBlob: null,
      ebookSize: ebookBlob?.size ?? existing?.ebookSize,
      ebookFormat: item.ebookFormat,
    }

    await putOfflineBookSummary(partial)
    emitProgress(ebookBlob, true)
  }

  await persistProgress('downloading')

  async function downloadTrack(selectedIndex: number) {
    const track = playback.audioTracks[selectedIndex]
    const controller = new AbortController()
    const stopRequested = () => controller.abort()
    let stallTimer: ReturnType<typeof setTimeout> | undefined
    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => controller.abort(), DOWNLOAD_STALL_TIMEOUT_MS)
    }

    try {
      if (options?.signal?.aborted) {
        throw stoppedDownloadError()
      }
      options?.signal?.addEventListener('abort', stopRequested, { once: true })
      resetStallTimer()
      const response = await fetch(client.streamUrl(track.contentUrl), { signal: controller.signal })
      if (!response.ok) {
        throw new Error(`Failed downloading ${track.title}`)
      }

      const contentLength = Number(response.headers?.get('content-length') ?? 0)
      if (contentLength > 0) {
        expectedTrackBytes.set(track.index, contentLength)
        emitProgress()
      }

      const blob = await readResponseBlob(response, track.index, track.mimeType, resetStallTimer)

      const offlineTrack: OfflineTrack = {
        trackIndex: track.index,
        title: track.title,
        duration: track.duration,
        mimeType: track.mimeType,
        size: blob.size,
        blob,
      }
      await putOfflineTrack(item.id, offlineTrack)
      savedTracks.set(track.index, {
        trackIndex: offlineTrack.trackIndex,
        title: offlineTrack.title,
        duration: offlineTrack.duration,
        mimeType: offlineTrack.mimeType,
        size: blob.size,
      })
      downloadedTrackBytes.set(track.index, blob.size)
      expectedTrackBytes.set(track.index, blob.size)
      inFlightTrackBytes.delete(track.index)

      await persistProgress('downloading')
    } catch (error) {
      if (options?.signal?.aborted) {
        throw stoppedDownloadError()
      }
      if (controller.signal.aborted) {
        throw new Error(`${track.title} stopped receiving data. Retry the download.`)
      }
      throw error
    } finally {
      if (stallTimer) clearTimeout(stallTimer)
      options?.signal?.removeEventListener('abort', stopRequested)
    }
  }

  async function readResponseBlob(
    response: Response,
    trackIndex: number,
    mimeType: string,
    resetStallTimer: () => void,
  ) {
    if (!response.body) {
      resetStallTimer()
      const blob = await response.blob()
      inFlightTrackBytes.set(trackIndex, blob.size)
      emitProgress()
      return blob
    }

    const reader = response.body.getReader()
    const chunks: ArrayBuffer[] = []
    let receivedBytes = 0

    while (true) {
      resetStallTimer()
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      const chunk = new ArrayBuffer(value.byteLength)
      new Uint8Array(chunk).set(value)
      chunks.push(chunk)
      receivedBytes += value.byteLength
      inFlightTrackBytes.set(trackIndex, receivedBytes)
      emitProgress()
    }

    return new Blob(chunks, {
      type: response.headers?.get('content-type') || mimeType,
    })
  }

  let nextTrack = 0
  async function worker() {
    while (nextTrack < selectedTracks.length) {
      if (options?.signal?.aborted) {
        throw stoppedDownloadError()
      }
      const task = selectedTracks[nextTrack]
      nextTrack++
      await downloadTrack(task.selectedIndex)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, selectedTracks.length) }, () => worker()),
  )

  // Optionally download ebook
  let ebookBlob: Blob | null = null
  if (item.ebookFormat) {
    try {
      if (options?.signal?.aborted) {
        throw stoppedDownloadError()
      }
      ebookBlob = await client.downloadEbook(item.id, options?.signal)
      await putOfflineEbook(item.id, ebookBlob)
      await persistProgress('downloading', ebookBlob)
    } catch (error) {
      if (options?.signal?.aborted || isAbortError(error)) {
        throw stoppedDownloadError()
      }
      // ebook download is best-effort
    }
  }

  const finalTracks = orderedTracks()
  const totalBytes = currentBytes(ebookBlob)
  const result: OfflineBook = {
    itemId: item.id,
    title: item.title,
    author: item.author,
    coverPath: item.coverPath,
    status: 'downloaded',
    source: 'download',
    totalBytes,
    totalTracks,
    updatedAt: Date.now(),
    tracks: finalTracks,
    ebookBlob,
    ebookSize: ebookBlob?.size ?? existing?.ebookSize,
    ebookFormat: item.ebookFormat,
  }

  await putOfflineBookSummary(result)
  return result
}

const trackCacheQueues = new Map<string, Promise<Blob | null>>()

export function cachePlayedTrack(
  client: AudiobookshelfClient,
  activePlayback: ActivePlayback,
  trackIndex: number,
) {
  const itemId = activePlayback.item.id
  const previous = trackCacheQueues.get(itemId) ?? Promise.resolve(null)
  const task = previous
    .catch(() => null)
    .then(() => cachePlayedTrackNow(client, activePlayback, trackIndex))

  trackCacheQueues.set(itemId, task)
  void task.then(
    () => {
      if (trackCacheQueues.get(itemId) === task) trackCacheQueues.delete(itemId)
    },
    () => {
      if (trackCacheQueues.get(itemId) === task) trackCacheQueues.delete(itemId)
    },
  )
  return task
}

async function cachePlayedTrackNow(
  client: AudiobookshelfClient,
  activePlayback: ActivePlayback,
  trackIndex: number,
) {
  const track = activePlayback.session.audioTracks[trackIndex]
  if (!track?.contentUrl) {
    return null
  }

  const existing = await getOfflineBookSummary(activePlayback.item.id)
  const cachedTrack = existing?.tracks.find((t) => t.trackIndex === track.index)
  if (cachedTrack) {
    const cachedBlob = await getOfflineTrackBlob(activePlayback.item.id, track.index)
    if (cachedBlob) {
      return cachedBlob
    }
  }

  const response = await fetch(client.streamUrl(track.contentUrl))
  if (!response.ok) {
    return null
  }

  const blob = await response.blob()
  const offlineTrack: OfflineTrack = {
    trackIndex: track.index,
    title: track.title,
    duration: track.duration,
    mimeType: track.mimeType,
    size: blob.size,
    blob,
  }

  await putOfflineTrack(activePlayback.item.id, offlineTrack)

  const item = activePlayback.item
  const tracks = [
    ...(existing?.tracks ?? []).filter((t) => t.trackIndex !== track.index),
    {
      trackIndex: offlineTrack.trackIndex,
      title: offlineTrack.title,
      duration: offlineTrack.duration,
      mimeType: offlineTrack.mimeType,
      size: blob.size,
    },
  ]
  const totalBytes = Math.max(0, (existing?.totalBytes ?? 0) - (cachedTrack?.size ?? 0)) + blob.size

  const book: OfflineBook = {
    itemId: item.id,
    title: item.title,
    author: item.author,
    coverPath: item.coverPath,
    status: 'downloaded',
    source: existing?.source ?? 'cache',
    totalBytes,
    totalTracks: existing?.totalTracks ?? activePlayback.session.audioTracks.length,
    updatedAt: Date.now(),
    tracks,
    ebookBlob: null,
    ebookSize: existing?.ebookSize,
    ebookFormat: item.ebookFormat,
  }

  await putOfflineBookSummary(book)
  return blob
}
