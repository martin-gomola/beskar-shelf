import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { AudiobookshelfClient } from '../lib/api'
import {
  deleteOfflineBook,
  downloadBook,
  listOfflineBooks,
  recoverOfflineMedia,
  removeOfflineTracks as removeStoredOfflineTracks,
} from '../lib/offlineMedia'
import type { BookItem, DownloadBookOptions, OfflineBook } from '../lib/types'

export function useOffline(client: AudiobookshelfClient) {
  const queryClient = useQueryClient()
  const resumedRef = useRef(false)
  const activeDownloadsRef = useRef(new Map<string, { controller: AbortController, promise: Promise<void> }>())
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
      return activeDownload.promise
    }

    const controller = new AbortController()
    const task = (async () => {
      setDownloadingItemIds((current) => (
        current.includes(item.id) ? current : [...current, item.id]
      ))
      try {
        await downloadBook(client, item, { ...options, signal: controller.signal }, async () => {
          await refreshOfflineBooks()
        })
      } finally {
        await refreshOfflineBooks()
        activeDownloadsRef.current.delete(item.id)
        setDownloadingItemIds((current) => current.filter((id) => id !== item.id))
      }
    })()

    activeDownloadsRef.current.set(item.id, { controller, promise: task })
    return task
  }, [client, refreshOfflineBooks])

  const cancelDownload = useCallback((itemId: string) => {
    activeDownloadsRef.current.get(itemId)?.controller.abort()
  }, [])

  // A persisted "downloading" state cannot prove that WebKit still owns a
  // live request. Convert interrupted work to a manual retry so a crash cannot
  // create an automatic resume loop.
  useEffect(() => {
    if (resumedRef.current || !offlineBooksQuery.data) return
    resumedRef.current = true

    const interrupted = offlineBooksQuery.data.filter((book) => book.status === 'downloading')
    if (interrupted.length === 0) return

    void (async () => {
      await recoverOfflineMedia()
      await refreshOfflineBooks()
    })()
  }, [offlineBooksQuery.data, refreshOfflineBooks])

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
    offlineBooksLoaded: offlineBooksQuery.isSuccess || offlineBooksQuery.isError,
    downloadingItemIds,
    refreshOfflineBooks,
    downloadCurrentBook,
    cancelDownload,
    removeOfflineBook,
    removeOfflineTracks,
    clearCachedBooks,
  }
}
