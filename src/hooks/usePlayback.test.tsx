import type { PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { usePlayback } from './usePlayback'
import type { AudiobookshelfClient } from '../lib/api'
import type { AudioTrack, BookItem, PlaybackSession, PersistedPlaybackState } from '../lib/types'

vi.mock('../lib/storage', () => ({
  getOfflineBook: vi.fn().mockResolvedValue(undefined),
  savePlaybackState: vi.fn(),
  enqueueProgress: vi.fn(),
  loadProgressQueue: vi.fn().mockReturnValue([]),
  saveProgressQueue: vi.fn(),
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

const audioTracks = [
  buildTrack(0, 0, 120),
  buildTrack(1, 120, 180),
]

const item: BookItem = {
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
  currentTime: 0,
  isFinished: false,
  chapters: [],
  audioTracks,
  ebookFormat: null,
  ebookLocation: null,
  ebookProgress: 0,
}

const playbackSession: PlaybackSession = {
  id: 'session-1',
  libraryItemId: item.id,
  duration: item.duration,
  displayTitle: item.title,
  displayAuthor: item.author,
  coverPath: null,
  chapters: [],
  audioTracks,
}

function wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('usePlayback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('seeks within the current track without reloading the audio source', async () => {
    const client = {
      startPlayback: vi.fn().mockResolvedValue(playbackSession),
      streamUrl: vi.fn((path: string) => `https://example.test${path}`),
      getItem: vi.fn(),
    } as unknown as AudiobookshelfClient
    const setPlaybackState = vi.fn()
    const audio = document.createElement('audio')
    const play = vi.fn().mockResolvedValue(undefined)
    let src = ''
    let srcAssignments = 0

    Object.defineProperty(audio, 'src', {
      configurable: true,
      get: () => src,
      set: (value: string) => {
        src = value
        srcAssignments += 1
      },
    })
    Object.defineProperty(audio, 'paused', {
      configurable: true,
      get: () => false,
    })
    Object.defineProperty(audio, 'play', {
      configurable: true,
      value: play,
    })

    const { result } = renderHook(() => usePlayback(
      client,
      { token: 'fixture-session' },
      null,
      setPlaybackState as React.Dispatch<React.SetStateAction<PersistedPlaybackState | null>>,
    ), { wrapper })

    result.current.audioRef.current = audio

    await act(async () => {
      await result.current.startBook(item, 0)
    })

    await waitFor(() => {
      expect(src).toBe('https://example.test/track-1.mp3')
    })
    const assignmentsAfterStart = srcAssignments

    act(() => {
      result.current.seekTo(30)
    })

    expect(srcAssignments).toBe(assignmentsAfterStart)
    expect(audio.currentTime).toBe(30)
    expect(play).toHaveBeenCalledTimes(1)
  })
})
