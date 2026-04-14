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
  } as unknown as AudiobookshelfClient

  const appContextValue: AppContextValue = {
    server: null,
    setServer: vi.fn(),
    session: null,
    setSession: vi.fn(),
    offlineBooks: [],
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
})
