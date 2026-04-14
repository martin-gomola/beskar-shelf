import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import ReaderPage from './ReaderPage'
import { ClientContext } from '../contexts/ClientContext'
import type { AudiobookshelfClient } from '../lib/api'

vi.mock('foliate-js/view.js', () => ({}))

const storageMocks = vi.hoisted(() => ({
  getOfflineBook: vi.fn(),
}))

vi.mock('../lib/storage', async () => {
  const actual = await vi.importActual<typeof import('../lib/storage')>('../lib/storage')
  return {
    ...actual,
    getOfflineBook: storageMocks.getOfflineBook,
  }
})

function renderReaderPage() {
  const queryClient = new QueryClient()
  const client = {
    getItem: vi.fn().mockResolvedValue({
      id: 'ebook-1',
      libraryId: 'lib-ebooks',
      title: 'The Book of Boba Fett',
      author: 'Archivist',
      narrator: null,
      description: '',
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
    }),
    downloadEbook: vi.fn().mockImplementation(() => new Promise(() => {})),
    ebookUrl: vi.fn().mockReturnValue('/ebook/ebook-1'),
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudiobookshelfClient

  render(
    <QueryClientProvider client={queryClient}>
      <ClientContext.Provider value={client}>
        <MemoryRouter initialEntries={['/read/ebook-1']}>
          <Routes>
            <Route path="/read/:itemId" element={<ReaderPage />} />
          </Routes>
        </MemoryRouter>
      </ClientContext.Provider>
    </QueryClientProvider>,
  )

  return client
}

describe('ReaderPage', () => {
  it('shows bottom loading progress while an epub is opening', async () => {
    storageMocks.getOfflineBook.mockResolvedValue(undefined)

    renderReaderPage()

    expect(await screen.findByText('Opening book…')).toBeInTheDocument()
    expect(screen.getByText(/\d+%/)).toBeInTheDocument()
  })
})
