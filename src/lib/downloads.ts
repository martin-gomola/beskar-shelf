import type { AudiobookshelfClient } from './api'
import { getOfflineBook, putOfflineBook } from './storage'
import type { BookItem, DownloadBookOptions, DownloadProgress, OfflineBook, OfflineTrack } from './types'

const CONCURRENCY = 3

export async function downloadBook(
  client: AudiobookshelfClient,
  item: BookItem,
  options?: DownloadBookOptions,
  onProgress?: (progress: DownloadProgress) => void,
) {
  const existing = await getOfflineBook(item.id)
  const savedTracks = new Map<number, OfflineTrack>(
    (existing?.tracks ?? []).map((track) => [track.trackIndex, track]),
  )
  const inFlightTrackBytes = new Map<number, number>()
  const expectedTrackBytes = new Map<number, number>()

  const shell: OfflineBook = {
    itemId: item.id,
    title: item.title,
    author: item.author,
    coverPath: item.coverPath,
    status: 'downloading',
    totalBytes: existing?.totalBytes ?? 0,
    totalTracks: existing?.totalTracks,
    updatedAt: Date.now(),
    tracks: existing?.tracks ?? [],
    ebookBlob: existing?.ebookBlob ?? null,
    ebookFormat: item.ebookFormat,
  }

  await putOfflineBook(shell)

  const shouldDownloadAudio = item.audioTracks.length > 0 || !item.ebookFormat
  const playback = shouldDownloadAudio
    ? await client.startPlayback(item.id)
    : { audioTracks: [] }
  const selectedTrackIndices = shouldDownloadAudio
    ? Array.from(new Set(options?.selectedTrackIndices?.filter((index) => index >= 0 && index < playback.audioTracks.length) ?? playback.audioTracks.map((_, index) => index)))
    : []
  const totalTracks = playback.audioTracks.length
  const selectedTracks = selectedTrackIndices.map((selectedIndex) => ({ selectedIndex }))

  for (const track of savedTracks.values()) {
    if (track.blob) {
      expectedTrackBytes.set(track.trackIndex, track.blob.size)
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

  function currentBytes(ebookBlob: Blob | null = shell.ebookBlob ?? null) {
    const trackBytes = orderedTracks().reduce((total, track) => total + (track.blob?.size ?? 0), 0)
    return trackBytes + (ebookBlob?.size ?? 0)
  }

  function currentProgressBytes(ebookBlob: Blob | null = shell.ebookBlob ?? null) {
    const inFlightBytes = Array.from(inFlightTrackBytes.values()).reduce((total, bytes) => total + bytes, 0)
    return currentBytes(ebookBlob) + inFlightBytes
  }

  function knownTotalBytes(ebookBlob: Blob | null = shell.ebookBlob ?? null) {
    const expectedBytes = Array.from(expectedTrackBytes.values()).reduce((total, bytes) => total + bytes, 0) + (ebookBlob?.size ?? 0)
    return Math.max(expectedBytes, currentProgressBytes(ebookBlob), selectedTrackIndices.length === totalTracks ? item.size : 0)
  }

  function buildProgress(ebookBlob: Blob | null = shell.ebookBlob ?? null): DownloadProgress {
    return {
      completedTracks: orderedTracks().length,
      totalTracks,
      completedBytes: currentProgressBytes(ebookBlob),
      totalBytes: knownTotalBytes(ebookBlob),
      completedTrackIndices: orderedTracks().map((track) => track.trackIndex),
    }
  }

  function emitProgress(ebookBlob: Blob | null = shell.ebookBlob ?? null, persisted = false) {
    const progress = buildProgress(ebookBlob)
    options?.onProgress?.(progress)
    if (persisted) {
      onProgress?.(progress)
    }
  }

  async function persistProgress(status: OfflineBook['status'], ebookBlob: Blob | null = shell.ebookBlob ?? null) {
    const partial: OfflineBook = {
      ...shell,
      status,
      totalBytes: currentBytes(ebookBlob),
      totalTracks,
      updatedAt: Date.now(),
      tracks: orderedTracks(),
      ebookBlob,
      ebookFormat: item.ebookFormat,
    }

    await putOfflineBook(partial)
    emitProgress(ebookBlob, true)
  }

  await persistProgress('downloading')

  async function downloadTrack(selectedIndex: number) {
    const track = playback.audioTracks[selectedIndex]
    const response = await fetch(client.streamUrl(track.contentUrl))
    if (!response.ok) {
      throw new Error(`Failed downloading ${track.title}`)
    }

    const contentLength = Number(response.headers?.get('content-length') ?? 0)
    if (contentLength > 0) {
      expectedTrackBytes.set(track.index, contentLength)
      emitProgress()
    }

    const blob = await readResponseBlob(response, track.index, track.mimeType)

    savedTracks.set(track.index, {
      trackIndex: track.index,
      title: track.title,
      duration: track.duration,
      mimeType: track.mimeType,
      blob,
    })
    expectedTrackBytes.set(track.index, blob.size)
    inFlightTrackBytes.delete(track.index)

    await persistProgress('downloading')
  }

  async function readResponseBlob(response: Response, trackIndex: number, mimeType: string) {
    if (!response.body) {
      const blob = await response.blob()
      inFlightTrackBytes.set(trackIndex, blob.size)
      emitProgress()
      return blob
    }

    const reader = response.body.getReader()
    const chunks: ArrayBuffer[] = []
    let receivedBytes = 0

    while (true) {
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
      const task = selectedTracks[nextTrack]
      nextTrack++
      await downloadTrack(task.selectedIndex)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, selectedTracks.length) }, () => worker()),
  )

  // Optionally download ebook
  let ebookBlob: Blob | null = shell.ebookBlob ?? null
  if (item.ebookFormat) {
    try {
      ebookBlob = await client.downloadEbook(item.id)
      await persistProgress('downloading', ebookBlob)
    } catch {
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
    totalBytes,
    totalTracks,
    updatedAt: Date.now(),
    tracks: finalTracks,
    ebookBlob,
    ebookFormat: item.ebookFormat,
  }

  await putOfflineBook(result)
  return result
}
