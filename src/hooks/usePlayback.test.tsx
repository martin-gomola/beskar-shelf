import type { PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { usePlayback } from './usePlayback'
import type { AudiobookshelfClient } from '../lib/api'
import { getOfflineBook } from '../lib/storage'
import type { AudioTrack, BookItem, PlaybackSession, PersistedPlaybackState } from '../lib/types'

vi.mock('../lib/storage', () => ({
  getOfflineBook: vi.fn().mockResolvedValue(undefined),
  savePlaybackState: vi.fn(),
  enqueueProgress: vi.fn(),
  loadProgressQueue: vi.fn().mockReturnValue([]),
  saveProgressQueue: vi.fn(),
  loadBookRate: vi.fn().mockReturnValue(null),
  saveBookRate: vi.fn(),
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
    vi.mocked(getOfflineBook).mockResolvedValue(undefined)
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

  it('defers currentTime and play until loadedmetadata when seeking across tracks', async () => {
    const client = {
      startPlayback: vi.fn().mockResolvedValue(playbackSession),
      streamUrl: vi.fn((path: string) => `https://example.test${path}`),
      getItem: vi.fn(),
    } as unknown as AudiobookshelfClient
    const setPlaybackState = vi.fn()
    const audio = document.createElement('audio')
    const play = vi.fn().mockResolvedValue(undefined)
    const load = vi.fn()
    let src = ''
    let currentTime = 0

    Object.defineProperty(audio, 'src', {
      configurable: true,
      get: () => src,
      set: (value: string) => { src = value },
    })
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => { currentTime = value },
    })
    Object.defineProperty(audio, 'paused', {
      configurable: true,
      get: () => false,
    })
    Object.defineProperty(audio, 'play', {
      configurable: true,
      value: play,
    })
    Object.defineProperty(audio, 'load', {
      configurable: true,
      value: load,
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

    // Seek from track 0 (0-120s) into track 1 (120-300s) at absolute time 150s.
    // The new track's startOffset is 120, so within-track time should be 30.
    play.mockClear()
    act(() => {
      result.current.seekTo(150)
    })

    // Source should be swapped to the new track and load() called, but
    // currentTime must wait for loadedmetadata so the seek doesn't get dropped
    // on a still-loading media element.
    expect(src).toBe('https://example.test/track-2.mp3')
    expect(load).toHaveBeenCalled()
    expect(currentTime).toBe(0)

    // Once metadata loads, currentTime is set to within-track time and play resumes.
    act(() => {
      audio.dispatchEvent(new Event('loadedmetadata'))
    })

    expect(currentTime).toBe(30)
    expect(play).toHaveBeenCalled()
  })

  it('keeps offline blob sources alive when skipping to the next track', async () => {
    const offlineBook: NonNullable<Awaited<ReturnType<typeof getOfflineBook>>> = {
      itemId: item.id,
      title: item.title,
      author: item.author,
      coverPath: null,
      status: 'downloaded',
      totalBytes: 2,
      totalTracks: 2,
      updatedAt: Date.now(),
      ebookBlob: null,
      tracks: audioTracks.map((track) => ({
        trackIndex: track.index,
        title: track.title,
        duration: track.duration,
        mimeType: track.mimeType,
        blob: new Blob([track.title], { type: track.mimeType }),
      })),
    }
    vi.mocked(getOfflineBook).mockResolvedValue(offlineBook)

    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:track-1')
      .mockReturnValueOnce('blob:track-2')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })

    const client = {
      startPlayback: vi.fn().mockResolvedValue(playbackSession),
      streamUrl: vi.fn((path: string) => `https://example.test${path}`),
      getItem: vi.fn(),
    } as unknown as AudiobookshelfClient
    const setPlaybackState = vi.fn()
    const audio = document.createElement('audio')
    const play = vi.fn().mockResolvedValue(undefined)
    let src = ''

    Object.defineProperty(audio, 'src', {
      configurable: true,
      get: () => src,
      set: (value: string) => { src = value },
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
      expect(src).toBe('blob:track-1')
    })

    act(() => {
      result.current.jumpToNextTrack()
    })

    await waitFor(() => {
      expect(src).toBe('blob:track-2')
      expect(result.current.activePlayback?.trackIndex).toBe(1)
    })
    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(client.startPlayback).not.toHaveBeenCalled()
  })
})
