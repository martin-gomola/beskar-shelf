import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PlayerPage from './PlayerPage'
import { AppContext, type AppContextValue } from '../contexts/AppContext'
import { ClientContext } from '../contexts/ClientContext'
import { PlayerContext, PlayerTimeContext, type PlayerContextValue } from '../contexts/PlayerContext'
import { ToastContext } from '../contexts/ToastContext'
import type { AudiobookshelfClient } from '../lib/api'
import type { BookItem, PlaybackSession } from '../lib/types'
import type { ActivePlayback } from '../hooks/usePlayback'

const audioTracks = [
  { index: 0, title: 'Track 1', duration: 120, startOffset: 0, mimeType: 'audio/mpeg', contentUrl: '/stream/1.mp3' },
  { index: 1, title: 'Track 2', duration: 180, startOffset: 120, mimeType: 'audio/mpeg', contentUrl: '/stream/2.mp3' },
]

const item: BookItem = {
  id: 'audio-1',
  libraryId: 'lib-audio',
  title: 'Beskar Rising',
  author: 'Archivist',
  narrator: 'Din',
  description: 'Audio mission log.',
  coverPath: null,
  duration: 300,
  size: 0,
  genres: [],
  progress: 0.5,
  currentTime: 123,
  isFinished: false,
  chapters: [{ id: 1, title: 'Chapter 1', start: 0, end: 300 }],
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
  coverPath: item.coverPath,
  chapters: item.chapters,
  audioTracks,
}

const activePlayback: ActivePlayback = {
  item,
  session: playbackSession,
  sources: ['https://example.test/1.mp3', 'https://example.test/2.mp3'],
  trackIndex: 0,
  duration: playbackSession.duration,
}

function renderPlayerPage({
  isPlaying = true,
  playbackTime = 123,
  appOverrides = {},
}: {
  isPlaying?: boolean
  playbackTime?: number
  appOverrides?: Partial<AppContextValue>
} = {}) {
  const queryClient = new QueryClient()
  const client = {
    coverUrl: vi.fn().mockReturnValue('/cover.jpg'),
    getBookmarks: vi.fn().mockResolvedValue([]),
    createBookmark: vi.fn().mockResolvedValue(undefined),
    deleteBookmark: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudiobookshelfClient
  const showToast = vi.fn()
  const playerContextValue: PlayerContextValue = {
    activePlayback,
    isPlaying,
    playbackRate: 1,
    togglePlayback: vi.fn().mockResolvedValue(undefined),
    stopPlayback: vi.fn(),
    seekTo: vi.fn(),
    seekBy: vi.fn(),
    setPlaybackRate: vi.fn(),
    jumpToTrack: vi.fn(),
    setIsSeeking: vi.fn(),
    audioRef: { current: null },
  }
  const appContextValue: AppContextValue = {
    server: null,
    setServer: vi.fn(),
    session: null,
    setSession: vi.fn(),
    isOnline: true,
    offlineBooks: [],
    refreshBooks: vi.fn().mockResolvedValue(undefined),
    refreshOfflineBooks: vi.fn().mockResolvedValue(undefined),
    playbackState: null,
    startBook: vi.fn().mockResolvedValue(undefined),
    downloadCurrentBook: vi.fn().mockResolvedValue(undefined),
    removeOfflineBook: vi.fn().mockResolvedValue(undefined),
    removeOfflineTracks: vi.fn().mockResolvedValue(undefined),
    ...appOverrides,
  }

  render(
    <QueryClientProvider client={queryClient}>
      <ClientContext.Provider value={client}>
        <AppContext.Provider value={appContextValue}>
          <ToastContext.Provider value={{ showToast }}>
            <PlayerContext.Provider value={playerContextValue}>
              <PlayerTimeContext.Provider value={{ playbackTime, currentTrackDuration: 120 }}>
                <MemoryRouter>
                  <PlayerPage />
                </MemoryRouter>
              </PlayerTimeContext.Provider>
            </PlayerContext.Provider>
          </ToastContext.Provider>
        </AppContext.Provider>
      </ClientContext.Provider>
    </QueryClientProvider>,
  )

  return { client, playerContextValue, showToast }
}

describe('PlayerPage sleep timer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('saves a bookmark when the sleep timer ends', async () => {
    const { client, playerContextValue, showToast } = renderPlayerPage()

    fireEvent.click(screen.getByRole('button', { name: /sleep timer/i }))
    fireEvent.click(screen.getByRole('button', { name: '5m' }))

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(client.createBookmark).toHaveBeenCalledWith(item.id, 123, 'Sleep timer at 2:03')
    expect(playerContextValue.togglePlayback).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Sleep bookmark saved', 'success')
  })

  it('keeps every queue track visible and marks the downloaded ones', () => {
    renderPlayerPage({
      appOverrides: {
        offlineBooks: [
          {
            itemId: item.id,
            title: item.title,
            author: item.author,
            coverPath: null,
            status: 'downloaded',
            totalBytes: 5,
            totalTracks: 2,
            updatedAt: Date.now(),
            tracks: [
              {
                trackIndex: 1,
                title: 'Track 2',
                duration: 180,
                mimeType: 'audio/mpeg',
                blob: new Blob(['track'], { type: 'audio/mpeg' }),
              },
            ],
          },
        ],
      },
    })

    expect(screen.getByRole('button', { name: /track 1.*2:00/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /track 2.*downloaded.*3:00/i })).toBeInTheDocument()
  })
})
