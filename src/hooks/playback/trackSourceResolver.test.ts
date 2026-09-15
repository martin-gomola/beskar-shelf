import { describe, expect, it, vi } from 'vitest'

import type { AudiobookshelfClient } from '../../lib/api'
import type { AudioTrack, BookItem, PlaybackSession } from '../../lib/types'
import type { ActivePlayback } from './shared'
import { TrackSourceResolver } from './trackSourceResolver'

function buildPlayback(): ActivePlayback {
  const tracks: AudioTrack[] = [
    { index: 0, title: 'One', duration: 60, startOffset: 0, mimeType: 'audio/mpeg', contentUrl: '/one.mp3' },
    { index: 1, title: 'Two', duration: 60, startOffset: 60, mimeType: 'audio/mpeg', contentUrl: '/two.mp3' },
  ]
  const item = {
    id: 'book-1',
    libraryId: 'library-1',
    title: 'Book',
    author: 'Author',
    narrator: null,
    description: '',
    coverPath: null,
    duration: 120,
    size: 0,
    genres: [],
    progress: 0,
    currentTime: 0,
    isFinished: false,
    chapters: [],
    audioTracks: tracks,
    ebookFormat: null,
    ebookLocation: null,
    ebookProgress: 0,
  } satisfies BookItem
  const session = {
    id: 'session-1',
    libraryItemId: item.id,
    duration: item.duration,
    displayTitle: item.title,
    displayAuthor: item.author,
    coverPath: null,
    chapters: [],
    audioTracks: tracks,
  } satisfies PlaybackSession

  return {
    item,
    session,
    sources: ['https://example.test/one.mp3', 'https://example.test/two.mp3'],
    trackIndex: 0,
    duration: 120,
  }
}

describe('TrackSourceResolver', () => {
  it('prefetches through the cache port and consumes a local blob source once', async () => {
    const playback = buildPlayback()
    const blob = new Blob(['track-two'], { type: 'audio/mpeg' })
    const loadTrackBlob = vi.fn().mockResolvedValue(blob)
    const objectUrls = {
      create: vi.fn().mockReturnValue('blob:track-two'),
      revoke: vi.fn(),
    }
    const resolver = new TrackSourceResolver(loadTrackBlob, objectUrls)
    resolver.activateSession(playback.session.id)

    await expect(resolver.prefetch({} as AudiobookshelfClient, playback, 1)).resolves.toBe(true)
    expect(loadTrackBlob).toHaveBeenCalledWith({}, playback, 1)

    expect(resolver.consume(playback, 1)).toEqual([
      playback.sources[0],
      'blob:track-two',
    ])
    expect(resolver.consume(playback, 1)).toBe(playback.sources)
    expect(objectUrls.revoke).not.toHaveBeenCalled()
  })

  it('revokes unconsumed sources when the playback session changes', async () => {
    const playback = buildPlayback()
    const objectUrls = {
      create: vi.fn().mockReturnValue('blob:track-two'),
      revoke: vi.fn(),
    }
    const resolver = new TrackSourceResolver(
      vi.fn().mockResolvedValue(new Blob(['track-two'])),
      objectUrls,
    )
    resolver.activateSession(playback.session.id)
    await resolver.prefetch({} as AudiobookshelfClient, playback, 1)

    resolver.activateSession('session-2')

    expect(objectUrls.revoke).toHaveBeenCalledWith('blob:track-two')
  })
})
