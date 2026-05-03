import type { AudiobookshelfClient } from './api'
import { getOfflineBook, putOfflineBook } from './storage'
import type { BookItem, DownloadBookOptions, OfflineBook, OfflineTrack } from './types'

interface DownloadProgress {
  completedTracks: number
  totalTracks: number
  completedBytes: number
  totalBytes: number
  completedTrackIndices: number[]
}

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
  onProgress?.({
    completedTracks: savedTracks.size,
    totalTracks: shell.totalTracks ?? 0,
    completedBytes: shell.totalBytes,
    totalBytes: item.size || shell.totalBytes,
    completedTrackIndices: Array.from(savedTracks.keys()).sort((a, b) => a - b),
  })

  const shouldDownloadAudio = item.audioTracks.length > 0 || !item.ebookFormat
  const playback = shouldDownloadAudio
    ? await client.startPlayback(item.id)
    : { audioTracks: [] }
  const selectedTrackIndices = shouldDownloadAudio
    ? Array.from(new Set(options?.selectedTrackIndices?.filter((index) => index >= 0 && index < playback.audioTracks.length) ?? playback.audioTracks.map((_, index) => index)))
    : []
  const totalTracks = playback.audioTracks.length
  const selectedTracks = selectedTrackIndices.map((selectedIndex) => ({ selectedIndex }))

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
    const trackBytes = orderedTracks().reduce((total, track) => total + track.blob.size, 0)
    return trackBytes + (ebookBlob?.size ?? 0)
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
    onProgress?.({
      completedTracks: partial.tracks.length,
      totalTracks,
      completedBytes: partial.totalBytes,
      totalBytes: item.size || partial.totalBytes,
      completedTrackIndices: partial.tracks.map((track) => track.trackIndex),
    })
  }

  await persistProgress('downloading')

  async function downloadTrack(selectedIndex: number) {
    const track = playback.audioTracks[selectedIndex]
    const response = await fetch(client.streamUrl(track.contentUrl))
    if (!response.ok) {
      throw new Error(`Failed downloading ${track.title}`)
    }

    const blob = await response.blob()

    savedTracks.set(track.index, {
      trackIndex: track.index,
      title: track.title,
      duration: track.duration,
      mimeType: track.mimeType,
      blob,
    })

    await persistProgress('downloading')
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
