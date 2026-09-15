import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { AudiobookshelfClient } from '../lib/api'
import { downloadBook } from '../lib/downloads'
import { deleteOfflineBook, listOfflineBooks, removeOfflineTracks as removeStoredOfflineTracks } from '../lib/storage'
import type { BookItem, DownloadBookOptions, OfflineBook } from '../lib/types'

export function useOffline(client: AudiobookshelfClient) {
  const queryClient = useQueryClient()
  const resumedRef = useRef(false)
  const activeDownloadsRef = useRef(new Map<string, Promise<void>>())
  const [downloadingItemIds, setDownloadingItemIds] = useState<string[]>([])

  const offlineBooksQuery = useQuery({
    queryKey: ['offline-books'],
    queryFn: listOfflineBooks,
    staleTime: Infinity,
  })

  const offlineBooks: OfflineBook[] = offlineBooksQuery.data ?? []

  const refreshOfflineBooks = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['offline-books'] })
  }, [queryClient])

  const downloadCurrentBook = useCallback(async (item: BookItem, options?: DownloadBookOptions) => {
    const activeDownload = activeDownloadsRef.current.get(item.id)
    if (activeDownload) {
      return activeDownload
    }

    const task = (async () => {
      setDownloadingItemIds((current) => (
        current.includes(item.id) ? current : [...current, item.id]
      ))
      try {
        await downloadBook(client, item, options, async () => {
          await refreshOfflineBooks()
        })
      } finally {
        await refreshOfflineBooks()
        activeDownloadsRef.current.delete(item.id)
        setDownloadingItemIds((current) => current.filter((id) => id !== item.id))
      }
    })()

    activeDownloadsRef.current.set(item.id, task)
    return task
  }, [client, refreshOfflineBooks])

  // On first load, resume downloads that iOS interrupted while backgrounded.
  // The in-memory registry, rather than the persisted status, is the source of
  // truth for whether a transfer is currently active.
  useEffect(() => {
    if (resumedRef.current || !offlineBooksQuery.data || !client.hasSession()) return
    resumedRef.current = true

    const interrupted = offlineBooksQuery.data.filter((book) => book.status === 'downloading')
    if (interrupted.length === 0) return

    void (async () => {
      for (const book of interrupted) {
        try {
          const item = await client.getItem(book.itemId)
          await downloadCurrentBook(item)
        } catch {
          // downloadBook persists a terminal error state that remains retryable.
        }
      }
    })()
  }, [client, downloadCurrentBook, offlineBooksQuery.data])

  async function removeOfflineBook(itemId: string) {
    await deleteOfflineBook(itemId)
    await refreshOfflineBooks()
  }

  async function removeOfflineTracks(itemId: string, trackIndices: number[]) {
    await removeStoredOfflineTracks(itemId, trackIndices)
    await refreshOfflineBooks()
  }

  async function clearCachedBooks() {
    const cached = offlineBooks.filter((book) => book.source === 'cache')
    for (const book of cached) {
      await deleteOfflineBook(book.itemId)
    }
    await refreshOfflineBooks()
  }

  return {
    offlineBooks,
    downloadingItemIds,
    refreshOfflineBooks,
    downloadCurrentBook,
    removeOfflineBook,
    removeOfflineTracks,
    clearCachedBooks,
  }
}
