import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cachePlayedTrack, downloadBook } from './downloads'
import type { AudiobookshelfClient } from './api'
import type { ActivePlayback } from '../hooks/playback/shared'
import type { BookItem } from './types'

const storageMocks = vi.hoisted(() => ({
  getOfflineBook: vi.fn(),
  getOfflineBookSummary: vi.fn(),
  getOfflineTrackBlob: vi.fn(),
  putOfflineBookSummary: vi.fn(),
  putOfflineTrack: vi.fn(),
  putOfflineEbook: vi.fn(),
}))

vi.mock('./storage', () => storageMocks)

describe('downloadBook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    storageMocks.getOfflineBook.mockReset()
    storageMocks.getOfflineBookSummary.mockReset()
    storageMocks.getOfflineTrackBlob.mockReset()
    storageMocks.putOfflineBookSummary.mockReset()
    storageMocks.putOfflineTrack.mockReset()
    storageMocks.putOfflineEbook.mockReset()
    storageMocks.getOfflineBook.mockResolvedValue(undefined)
    storageMocks.getOfflineBookSummary.mockResolvedValue(undefined)
    storageMocks.getOfflineTrackBlob.mockResolvedValue(undefined)
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
    expect(client.downloadEbook).toHaveBeenCalledWith('ebook-1', undefined)
    expect(result).toMatchObject({
      itemId: 'ebook-1',
      status: 'downloaded',
      totalBytes: ebookBlob.size,
      tracks: [],
      ebookFormat: 'epub',
      ebookBlob,
    })
    expect(storageMocks.putOfflineEbook).toHaveBeenCalledWith(item.id, ebookBlob)
    expect(storageMocks.putOfflineBookSummary).toHaveBeenLastCalledWith(expect.objectContaining({
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
    expect(fetchMock).toHaveBeenCalledWith(
      'https://books.example.com/stream/chapter-1.mp3',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(client.downloadEbook).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      itemId: 'audio-1',
      status: 'downloaded',
      totalBytes: trackBlob.size,
      ebookBlob: null,
    })
    expect(result.tracks).toHaveLength(1)
  })

  it('persists an error state when a download fails before any track is saved', async () => {
    const client = {
      startPlayback: vi.fn().mockRejectedValue(new Error('session unavailable')),
      downloadEbook: vi.fn(),
      streamUrl: vi.fn(),
    }
    const item: BookItem = {
      id: 'failed-download',
      libraryId: 'lib-audio',
      title: 'Interrupted Book',
      author: 'Archivist',
      narrator: null,
      description: '',
      coverPath: null,
      duration: 60,
      size: 0,
      genres: [],
      progress: 0,
      currentTime: 0,
      isFinished: false,
      chapters: [],
      audioTracks: [{
        index: 0,
        title: 'Chapter 1',
        duration: 60,
        startOffset: 0,
        mimeType: 'audio/mpeg',
        contentUrl: '/stream/chapter-1.mp3',
      }],
      ebookFormat: null,
      ebookLocation: null,
      ebookProgress: 0,
    }

    await expect(
      downloadBook(client as unknown as AudiobookshelfClient, item),
    ).rejects.toThrow('session unavailable')

    expect(storageMocks.putOfflineBookSummary).toHaveBeenLastCalledWith(expect.objectContaining({
      itemId: item.id,
      status: 'error',
      tracks: [],
    }))
  })

  it('aborts a transfer that stops receiving data and makes it retryable', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => (
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    ))
    vi.stubGlobal('fetch', fetchMock)
    const client = {
      startPlayback: vi.fn().mockResolvedValue({
        audioTracks: [{
          index: 0,
          title: 'Stalled chapter',
          duration: 60,
          mimeType: 'audio/mpeg',
          contentUrl: '/stream/stalled.mp3',
        }],
      }),
      downloadEbook: vi.fn(),
      streamUrl: vi.fn((path: string) => `https://books.example.com${path}`),
    }
    const item: BookItem = {
      id: 'stalled-download',
      libraryId: 'lib-audio',
      title: 'Stalled Download',
      author: 'Archivist',
      narrator: null,
      description: '',
      coverPath: null,
      duration: 60,
      size: 0,
      genres: [],
      progress: 0,
      currentTime: 0,
      isFinished: false,
      chapters: [],
      audioTracks: [{
        index: 0,
        title: 'Stalled chapter',
        duration: 60,
        startOffset: 0,
        mimeType: 'audio/mpeg',
        contentUrl: '/stream/stalled.mp3',
      }],
      ebookFormat: null,
      ebookLocation: null,
      ebookProgress: 0,
    }

    try {
      const result = expect(
        downloadBook(client as unknown as AudiobookshelfClient, item),
      ).rejects.toThrow('stopped receiving data')
      await vi.advanceTimersByTimeAsync(30_000)
      await result

      expect(storageMocks.putOfflineBookSummary).toHaveBeenLastCalledWith(expect.objectContaining({
        itemId: item.id,
        status: 'error',
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops on request and preserves completed progress as idle', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => (
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })
    ))
    vi.stubGlobal('fetch', fetchMock)
    const client = {
      startPlayback: vi.fn().mockResolvedValue({
        audioTracks: [{
          index: 0,
          title: 'Chapter 1',
          duration: 60,
          mimeType: 'audio/mpeg',
          contentUrl: '/stream/ch1.mp3',
        }],
      }),
      downloadEbook: vi.fn(),
      streamUrl: vi.fn((path: string) => `https://books.example.com${path}`),
    }
    const item: BookItem = {
      id: 'cancelled-download',
      libraryId: 'lib-audio',
      title: 'Cancelled Download',
      author: 'Archivist',
      narrator: null,
      description: '',
      coverPath: null,
      duration: 60,
      size: 0,
      genres: [],
      progress: 0,
      currentTime: 0,
      isFinished: false,
      chapters: [],
      audioTracks: [{
        index: 0,
        title: 'Chapter 1',
        duration: 60,
        startOffset: 0,
        mimeType: 'audio/mpeg',
        contentUrl: '/stream/ch1.mp3',
      }],
      ebookFormat: null,
      ebookLocation: null,
      ebookProgress: 0,
    }

    const promise = downloadBook(
      client as unknown as AudiobookshelfClient,
      item,
      { signal: controller.signal },
    )
    void promise.catch(() => undefined)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    controller.abort()

    await expect(promise).rejects.toThrow('Download stopped')
    expect(storageMocks.putOfflineBookSummary).toHaveBeenLastCalledWith(expect.objectContaining({
      itemId: item.id,
      status: 'idle',
    }))
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
    const storedBooks = storageMocks.putOfflineBookSummary.mock.calls.map(([book]) => book)

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
    expect(storageMocks.putOfflineTrack).toHaveBeenCalledTimes(2)
    expect(storedBooks.flatMap((book) => book.tracks).every((track) => !track.blob)).toBe(true)
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

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://books.example.com/stream/ch2.mp3',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://books.example.com/stream/ch3.mp3',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(result.tracks.map((track) => track.trackIndex)).toEqual([1, 2])
  })

  it('resumes after many tracks without hydrating or rewriting their binary data', async () => {
    const existingTracks = Array.from({ length: 10 }, (_, index) => ({
      trackIndex: index,
      title: `Chapter ${index + 1}`,
      duration: 60,
      mimeType: 'audio/mpeg',
      size: 20_000_000,
    }))
    storageMocks.getOfflineBookSummary.mockResolvedValue({
      itemId: 'large-book',
      title: 'Large Book',
      author: 'Archivist',
      coverPath: null,
      status: 'error',
      source: 'download',
      totalBytes: 200_000_000,
      totalTracks: 11,
      updatedAt: Date.now(),
      tracks: existingTracks,
      ebookBlob: null,
      ebookFormat: null,
    })
    const playbackTracks = Array.from({ length: 11 }, (_, index) => ({
      index,
      title: `Chapter ${index + 1}`,
      duration: 60,
      mimeType: 'audio/mpeg',
      contentUrl: `/stream/ch${index + 1}.mp3`,
    }))
    const trackBlob = new Blob(['last-track'], { type: 'audio/mpeg' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => trackBlob,
    }))
    const client = {
      startPlayback: vi.fn().mockResolvedValue({ audioTracks: playbackTracks }),
      downloadEbook: vi.fn(),
      streamUrl: vi.fn((path: string) => `https://books.example.com${path}`),
    }
    const item: BookItem = {
      id: 'large-book',
      libraryId: 'lib-audio',
      title: 'Large Book',
      author: 'Archivist',
      narrator: null,
      description: '',
      coverPath: null,
      duration: 660,
      size: 200_000_000 + trackBlob.size,
      genres: [],
      progress: 0,
      currentTime: 0,
      isFinished: false,
      chapters: [],
      audioTracks: playbackTracks.map((track, index) => ({ ...track, startOffset: index * 60 })),
      ebookFormat: null,
      ebookLocation: null,
      ebookProgress: 0,
    }

    const result = await downloadBook(
      client as unknown as AudiobookshelfClient,
      item,
      { selectedTrackIndices: [10] },
    )

    expect(storageMocks.getOfflineBook).not.toHaveBeenCalled()
    expect(storageMocks.getOfflineBookSummary).toHaveBeenCalledWith(item.id)
    expect(storageMocks.putOfflineTrack).toHaveBeenCalledTimes(1)
    expect(storageMocks.putOfflineTrack).toHaveBeenCalledWith(
      item.id,
      expect.objectContaining({ trackIndex: 10, blob: trackBlob }),
    )
    expect(storageMocks.putOfflineBookSummary).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'downloaded',
      totalBytes: 200_000_000 + trackBlob.size,
    }))
    expect(result.tracks).toHaveLength(11)
    expect(result.tracks.every((track) => !track.blob)).toBe(true)
  })

  it('returns persisted track bytes for ahead-of-playback prefetching', async () => {
    const trackBlob = new Blob(['cached-chapter'], { type: 'audio/mpeg' })
    const audioTrack = {
      index: 1,
      title: 'Chapter 2',
      duration: 60,
      startOffset: 60,
      mimeType: 'audio/mpeg',
      contentUrl: '/stream/ch2.mp3',
    }
    const item: BookItem = {
      id: 'prefetch-book',
      libraryId: 'lib-audio',
      title: 'Prefetched Book',
      author: 'Archivist',
      narrator: null,
      description: '',
      coverPath: null,
      duration: 120,
      size: trackBlob.size,
      genres: [],
      progress: 0,
      currentTime: 0,
      isFinished: false,
      chapters: [],
      audioTracks: [audioTrack],
      ebookFormat: null,
      ebookLocation: null,
      ebookProgress: 0,
    }
    const activePlayback: ActivePlayback = {
      item,
      session: {
        id: 'prefetch-session',
        libraryItemId: item.id,
        duration: item.duration,
        displayTitle: item.title,
        displayAuthor: item.author,
        coverPath: null,
        chapters: [],
        audioTracks: [audioTrack],
      },
      sources: ['https://books.example.com/stream/ch2.mp3'],
      trackIndex: 0,
      duration: item.duration,
    }
    storageMocks.getOfflineBookSummary.mockResolvedValue({
      itemId: item.id,
      title: item.title,
      author: item.author,
      coverPath: null,
      status: 'downloaded',
      source: 'cache',
      totalBytes: trackBlob.size,
      totalTracks: 1,
      updatedAt: Date.now(),
      tracks: [{
        trackIndex: audioTrack.index,
        title: audioTrack.title,
        duration: audioTrack.duration,
        mimeType: audioTrack.mimeType,
        size: trackBlob.size,
      }],
      ebookBlob: null,
      ebookFormat: null,
    })
    storageMocks.getOfflineTrackBlob.mockResolvedValue(trackBlob)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = {
      streamUrl: vi.fn((path: string) => `https://books.example.com${path}`),
    } as unknown as AudiobookshelfClient

    await expect(cachePlayedTrack(client, activePlayback, 0)).resolves.toBe(trackBlob)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(storageMocks.putOfflineTrack).not.toHaveBeenCalled()
    expect(storageMocks.putOfflineBookSummary).not.toHaveBeenCalled()
  })
})
