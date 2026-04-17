import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { AudiobookshelfClient } from '../lib/api'
import type { AudioTrack, BookItem, PlaybackSession } from '../lib/types'
import { usePlayback } from './usePlayback'

const storageMocks = vi.hoisted(() => ({
  getOfflineBook: vi.fn(),
  savePlaybackState: vi.fn(),
}))

vi.mock('../lib/storage', async () => {
  const actual = await vi.importActual<typeof import('../lib/storage')>('../lib/storage')
  return {
    ...actual,
    getOfflineBook: storageMocks.getOfflineBook,
    savePlaybackState: storageMocks.savePlaybackState,
  }
})

vi.mock('./playback/usePlaybackEffects', () => ({
  usePlaybackEffects: vi.fn(),
}))

vi.mock('./playback/usePlaybackProgress', () => ({
  usePlaybackProgress: vi.fn(() => ({
    drainProgressQueue: vi.fn().mockResolvedValue(undefined),
    scheduleProgressCommit: vi.fn(),
    flushProgress: vi.fn(),
  })),
}))

function buildTrack(index: number, startOffset: number, duration: number): AudioTrack {
  return {
    index,
    startOffset,
    duration,
    title: `Track ${index + 1}`,
    contentUrl: `/track-${index + 1}.mp3`,
    mimeType: 'audio/mpeg',
  }
}

function buildBook(): BookItem {
  const audioTracks = [
    buildTrack(0, 0, 120),
    buildTrack(1, 120, 180),
  ]

  return {
    id: 'book-1',
    libraryId: 'library-1',
    title: 'Test Book',
    author: 'Test Author',
    narrator: null,
    description: '',
    coverPath: null,
    duration: 300,
    size: 0,
    genres: [],
    progress: 0,
    currentTime: 42,
    isFinished: false,
    chapters: [],
    audioTracks,
    ebookFormat: null,
    ebookLocation: null,
    ebookProgress: 0,
  }
}

function buildSession(): PlaybackSession {
  return {
    id: 'session-1',
    libraryItemId: 'book-1',
    duration: 300,
    displayTitle: 'Test Book',
    displayAuthor: 'Test Author',
    coverPath: null,
    chapters: [],
    audioTracks: [
      buildTrack(0, 0, 120),
      buildTrack(1, 120, 180),
    ],
  }
}

function buildWrapper() {
  const queryClient = new QueryClient()

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

describe('usePlayback', () => {
  it('persists playback state immediately when a book starts', async () => {
    storageMocks.getOfflineBook.mockResolvedValue(undefined)
    storageMocks.savePlaybackState.mockReset()

    const client = {
      startPlayback: vi.fn().mockResolvedValue(buildSession()),
      streamUrl: vi.fn((path: string) => `https://example.test${path}`),
      getItem: vi.fn(),
      hasSession: vi.fn().mockReturnValue(true),
    } as unknown as AudiobookshelfClient

    const setPlaybackState = vi.fn()
    const { result } = renderHook(
      () => usePlayback(client, { token: 'demo-token' }, null, setPlaybackState),
      { wrapper: buildWrapper() },
    )

    await act(async () => {
      await result.current.startBook(buildBook())
    })

    expect(storageMocks.savePlaybackState).toHaveBeenCalledTimes(1)
    expect(storageMocks.savePlaybackState).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'book-1',
        sessionId: 'session-1',
        currentTime: 42,
        duration: 300,
        rate: 1,
      }),
    )
  })
})
