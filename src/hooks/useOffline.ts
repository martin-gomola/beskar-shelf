import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { AudiobookshelfClient } from '../lib/api'
import { downloadBook } from '../lib/downloads'
import { deleteOfflineBook, listOfflineBooks } from '../lib/storage'
import type { BookItem, DownloadBookOptions, OfflineBook } from '../lib/types'

export function useOffline(client: AudiobookshelfClient) {
  const queryClient = useQueryClient()

  const offlineBooksQuery = useQuery({
    queryKey: ['offline-books'],
    queryFn: listOfflineBooks,
    staleTime: Infinity,
  })

  const offlineBooks: OfflineBook[] = offlineBooksQuery.data ?? []

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
