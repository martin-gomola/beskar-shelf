import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AudiobookshelfClient } from '../lib/api'
import type { BookItem, OfflineBook } from '../lib/types'
import { useOffline } from './useOffline'

const mocks = vi.hoisted(() => ({
  downloadBook: vi.fn(),
  listOfflineBooks: vi.fn(),
  deleteOfflineBook: vi.fn(),
  removeOfflineTracks: vi.fn(),
}))

vi.mock('../lib/downloads', () => ({ downloadBook: mocks.downloadBook }))
vi.mock('../lib/storage', () => ({
  listOfflineBooks: mocks.listOfflineBooks,
  deleteOfflineBook: mocks.deleteOfflineBook,
  removeOfflineTracks: mocks.removeOfflineTracks,
}))

const item: BookItem = {
  id: 'interrupted-book',
  libraryId: 'library-1',
  title: 'Interrupted Book',
  author: 'Archivist',
  narrator: null,
  description: '',
  coverPath: null,
  duration: 60,
  size: 0,
  genres: [],
  progress: 0,
  currentTime: 0,
  isFinished: false,
  chapters: [],
  audioTracks: [{
    index: 0,
    title: 'Chapter 1',
    duration: 60,
    startOffset: 0,
    mimeType: 'audio/mpeg',
    contentUrl: '',
  }],
  ebookFormat: null,
  ebookLocation: null,
  ebookProgress: 0,
}

const interruptedBook: OfflineBook = {
  itemId: item.id,
  title: item.title,
  author: item.author,
  coverPath: null,
  status: 'downloading',
  source: 'download',
  totalBytes: 0,
  totalTracks: 1,
  updatedAt: Date.now(),
  tracks: [],
  ebookBlob: null,
  ebookFormat: null,
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listOfflineBooks.mockResolvedValue([interruptedBook])
  })

  it('tracks an automatically resumed download only while its promise is active', async () => {
    let finishDownload!: () => void
    mocks.downloadBook.mockImplementation(() => new Promise<void>((resolve) => {
      finishDownload = resolve
    }))
    const client = {
      hasSession: vi.fn().mockReturnValue(true),
      getItem: vi.fn().mockResolvedValue(item),
    } as unknown as AudiobookshelfClient

    const { result } = renderHook(() => useOffline(client), { wrapper: createWrapper() })

    await waitFor(() => expect(mocks.downloadBook).toHaveBeenCalledTimes(1))
    expect(result.current.downloadingItemIds).toEqual([item.id])

    await act(async () => finishDownload())

    await waitFor(() => expect(result.current.downloadingItemIds).toEqual([]))
  })

  it('deduplicates attempts to download the same book concurrently', async () => {
    mocks.listOfflineBooks.mockResolvedValue([])
    let finishDownload!: () => void
    mocks.downloadBook.mockImplementation(() => new Promise<void>((resolve) => {
      finishDownload = resolve
    }))
    const client = {
      hasSession: vi.fn().mockReturnValue(true),
      getItem: vi.fn(),
    } as unknown as AudiobookshelfClient

    const { result } = renderHook(() => useOffline(client), { wrapper: createWrapper() })

    await act(async () => {
      void result.current.downloadCurrentBook(item)
      void result.current.downloadCurrentBook(item)
    })

    expect(mocks.downloadBook).toHaveBeenCalledTimes(1)
    expect(result.current.downloadingItemIds).toEqual([item.id])

    await act(async () => finishDownload())
    await waitFor(() => expect(result.current.downloadingItemIds).toEqual([]))
  })
})
