import type { AudiobookshelfClient } from './api'
import { getOfflineBook, putOfflineBook } from './storage'
import type { BookItem, OfflineBook, OfflineTrack } from './types'

interface DownloadProgress {
  completedTracks: number
  totalTracks: number
  completedBytes: number
  totalBytes: number
}

const CONCURRENCY = 3

export async function downloadBook(
  client: AudiobookshelfClient,
  item: BookItem,
  onProgress?: (progress: DownloadProgress) => void,
) {
  const existing = await getOfflineBook(item.id)

  const shell: OfflineBook = {
    itemId: item.id,
    title: item.title,
    author: item.author,
    coverPath: item.coverPath,
    status: 'downloading',
    totalBytes: existing?.totalBytes ?? 0,
    updatedAt: Date.now(),
    tracks: existing?.tracks ?? [],
  }

  await putOfflineBook(shell)
  onProgress?.({ completedTracks: 0, totalTracks: 0, completedBytes: 0, totalBytes: shell.totalBytes })

  const shouldDownloadAudio = item.audioTracks.length > 0 || !item.ebookFormat
  const playback = shouldDownloadAudio
    ? await client.startPlayback(item.id)
    : { audioTracks: [] }
  const totalTracks = playback.audioTracks.length
  const results: OfflineTrack[] = new Array(totalTracks)
  let completedBytes = 0
  let completedTracks = 0

  async function downloadTrack(index: number) {
    const track = playback.audioTracks[index]
    const response = await fetch(client.streamUrl(track.contentUrl))
    if (!response.ok) {
      throw new Error(`Failed downloading ${track.title}`)
    }

    const blob = await response.blob()
    completedBytes += blob.size
    completedTracks++

    results[index] = {
      trackIndex: track.index,
      title: track.title,
      duration: track.duration,
      mimeType: track.mimeType,
      blob,
    }

    onProgress?.({
      completedTracks,
      totalTracks,
      completedBytes,
      totalBytes: completedBytes,
    })
  }

  const indices = Array.from({ length: totalTracks }, (_, i) => i)
  const pool: Promise<void>[] = []

  for (const index of indices) {
    const task = downloadTrack(index)
    pool.push(task)

    if (pool.length >= CONCURRENCY) {
      await Promise.race(pool)
      pool.splice(0, pool.length, ...pool.filter((p) => {
        let settled = false
        void p.then(() => { settled = true }, () => { settled = true })
        return !settled
      }))
    }
  }

  await Promise.all(pool)

  // Optionally download ebook
  let ebookBlob: Blob | null = null
  if (item.ebookFormat) {
    try {
      ebookBlob = await client.downloadEbook(item.id)
      completedBytes += ebookBlob.size
    } catch {
      // ebook download is best-effort
    }
  }

  const result: OfflineBook = {
    itemId: item.id,
    title: item.title,
    author: item.author,
    coverPath: item.coverPath,
    status: 'downloaded',
    totalBytes: completedBytes,
    updatedAt: Date.now(),
    tracks: results.filter(Boolean),
    ebookBlob,
    ebookFormat: item.ebookFormat,
  }

  await putOfflineBook(result)
  return result
}
