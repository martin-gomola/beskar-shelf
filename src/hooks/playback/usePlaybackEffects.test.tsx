import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { AudioTrack, BookItem, PersistedPlaybackState, PlaybackSession } from '../../lib/types'
import type { AudiobookshelfClient } from '../../lib/api'
import { usePlaybackEffects } from './usePlaybackEffects'
import type { ActivePlayback } from './shared'

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

function buildActivePlayback(): ActivePlayback {
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
    sources: ['https://example.test/track-1.mp3', 'https://example.test/track-2.mp3'],
    trackIndex: 0,
    duration: session.duration,
  }
}

describe('usePlaybackEffects', () => {
  it('does not replay audio when persisted playback state changes after pausing', async () => {
    const activePlayback = buildActivePlayback()
    const playbackStateRef = {
      current: {
        itemId: activePlayback.item.id,
        sessionId: activePlayback.session.id,
        currentTime: 42,
        duration: activePlayback.duration,
        rate: 1,
        updatedAt: Date.now(),
      } satisfies PersistedPlaybackState,
    }
    const audio = document.createElement('audio')
    const play = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(audio, 'play', { configurable: true, value: play })

    const props = {
      activePlayback,
      setActivePlayback: vi.fn(),
      audioRef: { current: audio },
      playbackStateRef,
      playbackRate: 1,
      setPlaybackTime: vi.fn(),
      setCurrentTrackDuration: vi.fn(),
      setIsPlaying: vi.fn(),
      scheduleProgressCommit: vi.fn(),
      flushProgress: vi.fn(),
      client: {
        coverUrl: vi.fn().mockReturnValue('https://example.test/cover.jpg'),
        getItem: vi.fn(),
      } as unknown as AudiobookshelfClient,
      seekBy: vi.fn(),
      togglePlayback: vi.fn().mockResolvedValue(undefined),
      drainProgressQueue: vi.fn().mockResolvedValue(undefined),
      playbackTimeRef: { current: 42 },
      setPlaybackState: vi.fn(),
    }

    const { rerender } = renderHook((hookProps) => usePlaybackEffects(hookProps), {
      initialProps: props,
    })

    expect(play).toHaveBeenCalledTimes(1)

    await act(async () => {
      audio.dispatchEvent(new Event('pause'))
    })

    playbackStateRef.current = {
      ...playbackStateRef.current,
      currentTime: 43,
      updatedAt: Date.now(),
    }

    rerender({
      ...props,
      playbackStateRef,
    })

    expect(play).toHaveBeenCalledTimes(1)
  })
})
