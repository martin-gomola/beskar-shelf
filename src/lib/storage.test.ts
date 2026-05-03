import { describe, expect, it } from 'vitest'

import { removeOfflineTracksFromBook } from './storage'
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
