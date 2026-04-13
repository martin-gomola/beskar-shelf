import type { AudiobookshelfClient } from './api'
import { getOfflineBook, putOfflineBook } from './storage'
import type { BookItem, OfflineBook } from './types'

interface DownloadProgress {
  completedBytes: number
  totalBytes: number
}

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
  onProgress?.({
    completedBytes: 0,
    totalBytes: shell.totalBytes,
  })

  const playback = await client.startPlayback(item.id)
  const tracks = []
  let completedBytes = 0

  for (const track of playback.audioTracks) {
    const response = await fetch(client.streamUrl(track.contentUrl))
    if (!response.ok) {
      throw new Error(`Failed downloading ${track.title}`)
    }

    const blob = await response.blob()
    completedBytes += blob.size

    tracks.push({
      trackIndex: track.index,
      title: track.title,
      duration: track.duration,
      mimeType: track.mimeType,
      blob,
    })

    onProgress?.({
      completedBytes,
      totalBytes: completedBytes,
    })
  }

  const result: OfflineBook = {
    itemId: item.id,
    title: item.title,
    author: item.author,
    coverPath: item.coverPath,
    status: 'downloaded',
    totalBytes: completedBytes,
    updatedAt: Date.now(),
    tracks,
  }

  await putOfflineBook(result)
  return result
}
