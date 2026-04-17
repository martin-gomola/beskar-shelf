import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { AudiobookshelfClient } from '../lib/api'
import { downloadBook } from '../lib/downloads'
import { deleteOfflineBook, listOfflineBooks } from '../lib/storage'
import type { BookItem, DownloadBookOptions, OfflineBook } from '../lib/types'

export function useOffline(client: AudiobookshelfClient) {
  const queryClient = useQueryClient()
  const resumedRef = useRef(false)

  const offlineBooksQuery = useQuery({
    queryKey: ['offline-books'],
    queryFn: listOfflineBooks,
    staleTime: Infinity,
  })

  const offlineBooks: OfflineBook[] = offlineBooksQuery.data ?? []

  // On first load, resume any downloads that were interrupted (status stuck at 'downloading')
  useEffect(() => {
    if (resumedRef.current || !offlineBooksQuery.data || !client.hasSession()) return
    resumedRef.current = true

    const interrupted = offlineBooksQuery.data.filter((b) => b.status === 'downloading')
    if (interrupted.length === 0) return

    void (async () => {
      for (const book of interrupted) {
        try {
          const item = await client.getItem(book.itemId)
          await downloadBook(client, item, undefined, async () => {
            await queryClient.invalidateQueries({ queryKey: ['offline-books'] })
          })
          await queryClient.invalidateQueries({ queryKey: ['offline-books'] })
        } catch {
          // best-effort — will be retried next app start
        }
      }
    })()
  }, [client, offlineBooksQuery.data, queryClient])

  async function refreshOfflineBooks() {
    await queryClient.invalidateQueries({ queryKey: ['offline-books'] })
  }

  async function downloadCurrentBook(item: BookItem, options?: DownloadBookOptions) {
    await downloadBook(client, item, options, async () => {
      await refreshOfflineBooks()
    })
    await refreshOfflineBooks()
  }

  async function removeOfflineBook(itemId: string) {
    await deleteOfflineBook(itemId)
    await refreshOfflineBooks()
  }

  return {
    offlineBooks,
    refreshOfflineBooks,
    downloadCurrentBook,
    removeOfflineBook,
  }
}
