import { beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadBook } from './downloads'
import type { AudiobookshelfClient } from './api'
import type { BookItem } from './types'

const storageMocks = vi.hoisted(() => ({
  getOfflineBook: vi.fn(),
  putOfflineBook: vi.fn(),
}))

vi.mock('./storage', () => storageMocks)

describe('downloadBook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    storageMocks.getOfflineBook.mockReset()
    storageMocks.putOfflineBook.mockReset()
    storageMocks.getOfflineBook.mockResolvedValue(undefined)
  })

  it('downloads ebook-only items without starting audio playback', async () => {
    const ebookBlob = new Blob(['epub-bytes'], { type: 'application/epub+zip' })
    const client = {
      startPlayback: vi.fn(),
      downloadEbook: vi.fn().mockResolvedValue(ebookBlob),
      streamUrl: vi.fn(),
    }

    const item: BookItem = {
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
    }

    const result = await downloadBook(client as unknown as AudiobookshelfClient, item)

    expect(client.startPlayback).not.toHaveBeenCalled()
    expect(client.downloadEbook).toHaveBeenCalledWith('ebook-1')
    expect(result).toMatchObject({
      itemId: 'ebook-1',
      status: 'downloaded',
      totalBytes: ebookBlob.size,
      tracks: [],
      ebookFormat: 'epub',
      ebookBlob,
    })
    expect(storageMocks.putOfflineBook).toHaveBeenLastCalledWith(expect.objectContaining({
      itemId: 'ebook-1',
      status: 'downloaded',
      tracks: [],
      ebookBlob,
    }))
  })

  it('keeps audiobook downloads working for tracked media', async () => {
    const trackBlob = new Blob(['audio-bytes'], { type: 'audio/mpeg' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => trackBlob,
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = {
      startPlayback: vi.fn().mockResolvedValue({
        audioTracks: [
          {
            index: 0,
            title: 'Chapter 1',
            duration: 60,
            mimeType: 'audio/mpeg',
            contentUrl: '/stream/chapter-1.mp3',
          },
        ],
      }),
      downloadEbook: vi.fn(),
      streamUrl: vi.fn((path: string) => `https://books.example.com${path}`),
    }

    const item: BookItem = {
      id: 'audio-1',
      libraryId: 'lib-audio',
      title: 'Beskar Rising',
      author: 'Archivist',
      narrator: 'Din',
      description: '',
      coverPath: null,
      duration: 60,
      size: 0,
      genres: [],
      progress: 0,
      currentTime: 0,
      isFinished: false,
      chapters: [],
      audioTracks: [
        {
          index: 0,
          title: 'Chapter 1',
          duration: 60,
          startOffset: 0,
          mimeType: 'audio/mpeg',
          contentUrl: '/stream/chapter-1.mp3',
        },
      ],
      ebookFormat: null,
      ebookLocation: null,
      ebookProgress: 0,
    }

    const result = await downloadBook(client as unknown as AudiobookshelfClient, item)

    expect(client.startPlayback).toHaveBeenCalledWith('audio-1')
    expect(fetchMock).toHaveBeenCalledWith('https://books.example.com/stream/chapter-1.mp3')
    expect(client.downloadEbook).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      itemId: 'audio-1',
      status: 'downloaded',
      totalBytes: trackBlob.size,
      ebookBlob: null,
    })
    expect(result.tracks).toHaveLength(1)
  })

  it('persists completed tracks while an audiobook is still downloading', async () => {
    const firstBlob = new Blob(['first-track'], { type: 'audio/mpeg' })
    const secondBlob = new Blob(['second-track'], { type: 'audio/mpeg' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => firstBlob,
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => secondBlob,
      })
    vi.stubGlobal('fetch', fetchMock)

    const client = {
      startPlayback: vi.fn().mockResolvedValue({
        audioTracks: [
          { index: 0, title: 'Chapter 1', duration: 60, mimeType: 'audio/mpeg', contentUrl: '/stream/ch1.mp3' },
          { index: 1, title: 'Chapter 2', duration: 60, mimeType: 'audio/mpeg', contentUrl: '/stream/ch2.mp3' },
        ],
      }),
      downloadEbook: vi.fn(),
      streamUrl: vi.fn((path: string) => `https://books.example.com${path}`),
    }

    const item: BookItem = {
      id: 'audio-progress',
      libraryId: 'lib-audio',
      title: 'Progressive Download',
      author: 'Archivist',
      narrator: 'Din',
      description: '',
      coverPath: null,
      duration: 120,
      size: 0,
      genres: [],
      progress: 0,
      currentTime: 0,
      isFinished: false,
      chapters: [],
      audioTracks: [
        { index: 0, title: 'Chapter 1', duration: 60, startOffset: 0, mimeType: 'audio/mpeg', contentUrl: '/stream/ch1.mp3' },
        { index: 1, title: 'Chapter 2', duration: 60, startOffset: 60, mimeType: 'audio/mpeg', contentUrl: '/stream/ch2.mp3' },
      ],
      ebookFormat: null,
      ebookLocation: null,
      ebookProgress: 0,
    }

    const progressSpy = vi.fn()
    const result = await downloadBook(client as unknown as AudiobookshelfClient, item, undefined, progressSpy)
    const storedBooks = storageMocks.putOfflineBook.mock.calls.map(([book]) => book)

    expect(storedBooks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'downloading',
        totalTracks: 2,
        tracks: expect.arrayContaining([
          expect.objectContaining({ trackIndex: 0 }),
        ]),
      }),
      expect.objectContaining({
        status: 'downloading',
        totalTracks: 2,
        tracks: expect.arrayContaining([
          expect.objectContaining({ trackIndex: 1 }),
        ]),
      }),
    ]))
    expect(result).toMatchObject({
      status: 'downloaded',
      totalTracks: 2,
    })
    expect(result.tracks).toHaveLength(2)
    expect(progressSpy).toHaveBeenCalledWith(expect.objectContaining({
      completedTracks: 2,
      totalTracks: 2,
      completedTrackIndices: [0, 1],
    }))
  })

  it('downloads only the selected audiobook tracks', async () => {
    const firstBlob = new Blob(['first'], { type: 'audio/mpeg' })
    const secondBlob = new Blob(['second'], { type: 'audio/mpeg' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => firstBlob,
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => secondBlob,
      })
    vi.stubGlobal('fetch', fetchMock)

    const client = {
      startPlayback: vi.fn().mockResolvedValue({
        audioTracks: [
          { index: 0, title: 'Chapter 1', duration: 60, mimeType: 'audio/mpeg', contentUrl: '/stream/ch1.mp3' },
          { index: 1, title: 'Chapter 2', duration: 60, mimeType: 'audio/mpeg', contentUrl: '/stream/ch2.mp3' },
          { index: 2, title: 'Chapter 3', duration: 60, mimeType: 'audio/mpeg', contentUrl: '/stream/ch3.mp3' },
        ],
      }),
      downloadEbook: vi.fn(),
      streamUrl: vi.fn((path: string) => `https://books.example.com${path}`),
    }

    const item: BookItem = {
      id: 'audio-2',
      libraryId: 'lib-audio',
      title: 'Selective Download',
      author: 'Archivist',
      narrator: 'Din',
      description: '',
      coverPath: null,
      duration: 180,
      size: 0,
      genres: [],
      progress: 0,
      currentTime: 0,
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

    const result = await downloadBook(client as unknown as AudiobookshelfClient, item, { selectedTrackIndices: [1, 2] })

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://books.example.com/stream/ch2.mp3')
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://books.example.com/stream/ch3.mp3')
    expect(result.tracks.map((track) => track.trackIndex)).toEqual([1, 2])
  })
})
