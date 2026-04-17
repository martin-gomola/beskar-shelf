import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BookPage } from './BookPage'
import { AppContext, type AppContextValue } from '../contexts/AppContext'
import { ClientContext } from '../contexts/ClientContext'
import { PlayerContext, type PlayerContextValue } from '../contexts/PlayerContext'
import type { AudiobookshelfClient } from '../lib/api'
import type { BookItem } from '../lib/types'

const ebookOnlyItem: BookItem = {
  id: 'ebook-1',
  libraryId: 'lib-ebooks',
  title: 'The Book of Boba Fett',
  author: 'Archivist',
  narrator: null,
  description: 'A field guide.',
  coverPath: null,
  duration: 0,
  size: 0,
  genres: [],
  progress: 0,
  currentTime: 0,
  isFinished: false,
  chapters: [],
  audioTracks: [],
  ebookFormat: 'epub',
  ebookLocation: null,
  ebookProgress: 0,
}

const audiobookItem: BookItem = {
  id: 'audio-1',
  libraryId: 'lib-audio',
  title: 'Beskar Rising',
  author: 'Archivist',
  narrator: 'Din',
  description: 'Audio mission log.',
  coverPath: null,
  duration: 180,
  size: 0,
  genres: [],
  progress: 0.5,
  currentTime: 70,
  isFinished: false,
  chapters: [],
  audioTracks: [
    { index: 0, title: 'Chapter 1', duration: 60, startOffset: 0, mimeType: 'audio/mpeg', contentUrl: '/stream/ch1.mp3' },
    { index: 1, title: 'Chapter 2', duration: 60, startOffset: 60, mimeType: 'audio/mpeg', contentUrl: '/stream/ch2.mp3' },
    { index: 2, title: 'Chapter 3', duration: 60, startOffset: 120, mimeType: 'audio/mpeg', contentUrl: '/stream/ch3.mp3' },
  ],
  ebookFormat: null,
  ebookLocation: null,
  ebookProgress: 0,
}

const audiobookItemWithoutTrackMetadata: BookItem = {
  ...audiobookItem,
  chapters: [
    { id: 1, title: 'Jurassic Park - Michael Crichton 1', start: 0, end: 1 },
    { id: 2, title: 'Jurassic Park - Michael Crichton 2', start: 1, end: 2 },
  ],
  audioTracks: [],
}

function renderBookPage({
  item = ebookOnlyItem,
  appOverrides = {},
}: {
  item?: BookItem
  appOverrides?: Partial<AppContextValue>
} = {}) {
  const queryClient = new QueryClient()
  const client = {
    getItem: vi.fn().mockResolvedValue(item),
    coverUrl: vi.fn().mockReturnValue('/cover.jpg'),
    startPlayback: vi.fn().mockResolvedValue({
      id: 'session-1',
      libraryItemId: item.id,
      duration: item.duration,
      displayTitle: item.title,
      displayAuthor: item.author,
      coverPath: item.coverPath,
      chapters: item.chapters,
      audioTracks: item.audioTracks,
    }),
  } as unknown as AudiobookshelfClient

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
    ...appOverrides,
  }

  const playerContextValue: PlayerContextValue = {
    activePlayback: null,
    isPlaying: false,
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

  render(
    <QueryClientProvider client={queryClient}>
      <ClientContext.Provider value={client}>
        <AppContext.Provider value={appContextValue}>
          <PlayerContext.Provider value={playerContextValue}>
            <MemoryRouter initialEntries={['/book/ebook-1']}>
              <Routes>
                <Route path="/book/:itemId" element={<BookPage />} />
              </Routes>
            </MemoryRouter>
          </PlayerContext.Provider>
        </AppContext.Provider>
      </ClientContext.Provider>
    </QueryClientProvider>,
  )

  return { client, appContextValue }
}

describe('BookPage', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows a download action for ebook-only titles', async () => {
    renderBookPage()

    expect(await screen.findByRole('link', { name: 'Read' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument()
  })

  it('uses the shared download action for ebook-only titles', async () => {
    const user = userEvent.setup()
    const { appContextValue } = renderBookPage()

    const [downloadButton] = await screen.findAllByRole('button', { name: /download/i })
    await user.click(downloadButton)

    await waitFor(() => {
      expect(appContextValue.downloadCurrentBook).toHaveBeenCalledWith(ebookOnlyItem)
    })
  })

  it('lets listeners choose audiobook chapters for offline download', async () => {
    const user = userEvent.setup()
    const { appContextValue } = renderBookPage({ item: audiobookItem })

    await user.click(await screen.findByRole('button', { name: /download/i }))

    expect(screen.getByText(/select tracks to download/i)).toBeInTheDocument()
    expect(screen.getByText(/0 selected/i)).toBeInTheDocument()

    const confirmButton = screen.getByRole('button', { name: /download selected/i })
    expect(confirmButton).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /chapter 2/i }))
    await user.click(screen.getByRole('button', { name: /chapter 3/i }))

    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)

    await waitFor(() => {
      expect(appContextValue.downloadCurrentBook).toHaveBeenCalledWith(
        audiobookItem,
        { selectedTrackIndices: [1, 2] },
      )
    })
  })

  it('loads downloadable tracks from playback when the item payload only contains chapters', async () => {
    const user = userEvent.setup()
    const { appContextValue, client } = renderBookPage({ item: audiobookItemWithoutTrackMetadata })

    vi.mocked(client.startPlayback).mockResolvedValue({
      id: 'session-2',
      libraryItemId: audiobookItemWithoutTrackMetadata.id,
      duration: audiobookItem.duration,
      displayTitle: audiobookItemWithoutTrackMetadata.title,
      displayAuthor: audiobookItemWithoutTrackMetadata.author,
      coverPath: audiobookItemWithoutTrackMetadata.coverPath,
      chapters: audiobookItemWithoutTrackMetadata.chapters,
      audioTracks: audiobookItem.audioTracks,
    })

    await user.click(await screen.findByRole('button', { name: /download/i }))

    expect(await screen.findByRole('button', { name: /chapter 2/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /chapter 2/i }))
    await user.click(screen.getByRole('button', { name: /download selected/i }))

    await waitFor(() => {
      expect(client.startPlayback).toHaveBeenCalledWith(audiobookItemWithoutTrackMetadata.id)
      expect(appContextValue.downloadCurrentBook).toHaveBeenCalledWith(
        audiobookItemWithoutTrackMetadata,
        { selectedTrackIndices: [1] },
      )
    })
  })
})
