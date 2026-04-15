import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import DownloadsPage from './DownloadsPage'
import { AppContext, type AppContextValue } from '../contexts/AppContext'
import type { OfflineBook } from '../lib/types'

function renderDownloadsPage(offlineBooks: OfflineBook[]) {
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
  }

  render(
    <MemoryRouter>
      <AppContext.Provider value={appContextValue}>
        <DownloadsPage />
      </AppContext.Provider>
    </MemoryRouter>,
  )
}

describe('DownloadsPage', () => {
  it('shows derived size from stored blobs and offers an open action', () => {
    renderDownloadsPage([
      {
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
      },
    ])

    expect(screen.getByText('9 B')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/book/book-1')
  })
})
