import { describe, expect, it } from 'vitest'

import {
  removeOfflineTracksFromBook,
  restoreOfflineBlob,
  serializeOfflineBlob,
  summarizeOfflineBook,
} from './storage'
import type { OfflineBook } from './types'

function buildOfflineBook(trackIndices: number[], ebookBlob: Blob | null = null): OfflineBook {
  return {
    itemId: 'book-1',
    title: 'Test Book',
    author: 'Test Author',
    coverPath: null,
    status: 'downloaded',
    totalBytes: trackIndices.length,
    totalTracks: 3,
    updatedAt: 1,
    tracks: trackIndices.map((trackIndex) => ({
      trackIndex,
      title: `Track ${trackIndex}`,
      duration: 60,
      mimeType: 'audio/mpeg',
      size: 1,
      blob: new Blob([String(trackIndex)], { type: 'audio/mpeg' }),
    })),
    ebookBlob,
  }
}

describe('removeOfflineTracksFromBook', () => {
  it('removes selected tracks and recomputes stored bytes', () => {
    const book = buildOfflineBook([0, 1, 2])

    const next = removeOfflineTracksFromBook(book, [1])

    expect(next).toMatchObject({
      itemId: 'book-1',
      status: 'downloaded',
      totalBytes: 2,
      totalTracks: 3,
    })
    expect(next?.updatedAt).toBeGreaterThan(book.updatedAt)
    expect(next?.tracks.map((track) => track.trackIndex)).toEqual([0, 2])
  })

  it('deletes the offline record when the last track is removed and no ebook remains', () => {
    expect(removeOfflineTracksFromBook(buildOfflineBook([1]), [1])).toBeNull()
  })

  it('recomputes bytes from metadata without hydrating stored track blobs', () => {
    const book = buildOfflineBook([0, 1, 2])
    const metadataOnlyBook = {
      ...book,
      tracks: book.tracks.map((track) => ({
        trackIndex: track.trackIndex,
        title: track.title,
        duration: track.duration,
        mimeType: track.mimeType,
        size: track.size,
      })),
    }

    const next = removeOfflineTracksFromBook(metadataOnlyBook, [1])

    expect(next?.totalBytes).toBe(2)
    expect(next?.tracks.map((track) => track.trackIndex)).toEqual([0, 2])
    expect(next?.tracks.every((track) => !track.blob)).toBe(true)
  })

  it('keeps ebook-only offline data when the last audio track is removed', () => {
    const ebookBlob = new Blob(['ebook'], { type: 'application/epub+zip' })
    const next = removeOfflineTracksFromBook(buildOfflineBook([1], ebookBlob), [1])

    expect(next).toMatchObject({
      totalBytes: ebookBlob.size,
      tracks: [],
      ebookBlob,
    })
  })
})

describe('summarizeOfflineBook', () => {
  it('keeps metadata while removing stored media blobs from list results', () => {
    const ebookBlob = new Blob(['ebook'], { type: 'application/epub+zip' })
    const book = buildOfflineBook([0, 1], ebookBlob)

    const summary = summarizeOfflineBook(book)

    expect(summary).toMatchObject({
      itemId: 'book-1',
      title: 'Test Book',
      totalBytes: book.totalBytes,
      totalTracks: 3,
      ebookBlob: null,
    })
    expect(summary.tracks.map((track) => track.trackIndex)).toEqual([0, 1])
    expect(summary.tracks[0]).not.toHaveProperty('blob')
    expect(summary.tracks[0].size).toBe(1)
  })
})

describe('WebKit-compatible offline binary storage', () => {
  it('serializes media without storing a raw Blob and restores its MIME type', async () => {
    const source = new Blob(['audio-bytes'], { type: 'audio/mp4' })

    const stored = await serializeOfflineBlob(source)
    const restored = restoreOfflineBlob(stored.data, stored.mimeType)

    expect(stored.data).toBeInstanceOf(ArrayBuffer)
    expect(stored).not.toHaveProperty('blob')
    expect(restored.type).toBe('audio/mp4')
    expect(await restored.text()).toBe('audio-bytes')
  })
})
