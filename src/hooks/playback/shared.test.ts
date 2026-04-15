import { describe, expect, it } from 'vitest'

import type { AudioTrack, BookItem, PlaybackSession } from '../../lib/types'
import { totalTimeFromTrack, trackForTime, type ActivePlayback } from './shared'

function buildTrack(index: number, startOffset: number, duration: number): AudioTrack {
  return {
    index,
    startOffset,
    duration,
    title: `Track ${index + 1}`,
    contentUrl: `/track-${index + 1}.mp3`,
    mimeType: 'audio/mpeg',
  }
}

function buildActivePlayback(trackIndex = 0): ActivePlayback {
  const audioTracks = [
    buildTrack(0, 0, 120),
    buildTrack(1, 120, 180),
  ]
  const session: PlaybackSession = {
    id: 'session-1',
    libraryItemId: 'book-1',
    duration: 300,
    displayTitle: 'Test Book',
    displayAuthor: 'Test Author',
    coverPath: null,
    chapters: [],
    audioTracks,
  }
  const item: BookItem = {
    id: 'book-1',
    libraryId: 'library-1',
    title: 'Test Book',
    author: 'Test Author',
    narrator: null,
    description: '',
    coverPath: null,
    duration: 300,
    size: 0,
    genres: [],
    progress: 0,
    currentTime: 0,
    isFinished: false,
    chapters: [],
    audioTracks,
    ebookFormat: null,
    ebookLocation: null,
    ebookProgress: 0,
  }

  return {
    item,
    session,
    sources: ['/track-1.mp3', '/track-2.mp3'],
    trackIndex,
    duration: session.duration,
  }
}

describe('playback shared helpers', () => {
  it('maps times to the correct track and clamps out-of-range values', () => {
    const tracks = [
      buildTrack(0, 0, 120),
      buildTrack(1, 120, 180),
    ]

    expect(trackForTime(tracks, -10)).toBe(0)
    expect(trackForTime(tracks, 0)).toBe(0)
    expect(trackForTime(tracks, 119.9)).toBe(0)
    expect(trackForTime(tracks, 120)).toBe(1)
    expect(trackForTime(tracks, 999)).toBe(0)
  })

  it('converts the active track time back to the full-book playback time', () => {
    expect(totalTimeFromTrack(buildActivePlayback(0), 32)).toBe(32)
    expect(totalTimeFromTrack(buildActivePlayback(1), 15)).toBe(135)
    expect(totalTimeFromTrack(null, 20)).toBe(0)
  })
})
