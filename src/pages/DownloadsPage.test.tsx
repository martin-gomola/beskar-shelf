import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import DownloadsPage from './DownloadsPage'
import { AppContext, type AppContextValue } from '../contexts/AppContext'
import { ClientContext } from '../contexts/ClientContext'
import type { AudiobookshelfClient } from '../lib/api'
import type { OfflineBook } from '../lib/types'

function makeBook(overrides: Partial<OfflineBook> = {}): OfflineBook {
  return {
    itemId: 'book-1',
    title: 'Mucha',
    author: 'Dominik Dan',
    coverPath: null,
    status: 'downloaded',
    totalBytes: 0,
    updatedAt: Date.now(),
    tracks: [],
    ebookBlob: new Blob(['123456789'], { type: 'application/epub+zip' }),
    ebookFormat: 'epub',
    ...overrides,
  }
}

function renderDownloadsPage(
  offlineBooks: OfflineBook[],
  appOverrides: Partial<AppContextValue> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const client = {
    coverUrl: vi.fn().mockReturnValue('/cover.jpg'),
    getLibraries: vi.fn().mockResolvedValue([]),
    hasServer: vi.fn().mockReturnValue(false),
  } as unknown as AudiobookshelfClient

  const appContextValue: AppContextValue = {
    server: null,
    setServer: vi.fn(),
    session: null,
    setSession: vi.fn(),
    isOnline: true,
    offlineBooks,
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
        <MemoryRouter>
          <AppContext.Provider value={appContextValue}>
            <DownloadsPage />
          </AppContext.Provider>
        </MemoryRouter>
      </ClientContext.Provider>
    </QueryClientProvider>,
  )

  return appContextValue
}

describe('DownloadsPage', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows derived size from stored blobs and a tappable row that opens the book', () => {
    renderDownloadsPage([makeBook()])

    expect(screen.getAllByText('9 B').length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/offline storage usage/i)).toHaveTextContent('9 B')
    expect(screen.getByRole('link', { name: /open mucha/i })).toHaveAttribute('href', '/book/book-1')
  })

  it('renders an empty-state CTA when there are no offline books', () => {
    renderDownloadsPage([])

    expect(screen.getByText(/nothing saved for offline yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/home')
  })

  it('removes a single book through the inline action with confirmation', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const ctx = renderDownloadsPage([makeBook()])

    await user.click(screen.getByRole('button', { name: /remove mucha/i }))

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('"Mucha"'))
    await waitFor(() => {
      expect(ctx.removeOfflineBook).toHaveBeenCalledWith('book-1')
    })
  })

  it('bulk-removes multiple books through selection mode', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const ctx = renderDownloadsPage([
      makeBook({ itemId: 'a', title: 'Alpha' }),
      makeBook({ itemId: 'b', title: 'Beta' }),
      makeBook({ itemId: 'c', title: 'Gamma' }),
    ])

    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    await user.click(screen.getByRole('button', { name: /select alpha/i }))
    await user.click(screen.getByRole('button', { name: /select gamma/i }))

    const removeBtn = screen.getByRole('button', { name: /^remove 2$/i })
    expect(removeBtn).toBeEnabled()

    await user.click(removeBtn)

    await waitFor(() => {
      expect(ctx.removeOfflineBook).toHaveBeenCalledTimes(2)
    })
    expect(ctx.removeOfflineBook).toHaveBeenCalledWith('a')
    expect(ctx.removeOfflineBook).toHaveBeenCalledWith('c')
  })
})
