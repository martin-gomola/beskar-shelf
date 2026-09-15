import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

function installMediaSession() {
  const actionHandlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>()
  const setPositionState = vi.fn()
  const mediaSession = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      actionHandlers.set(action, handler)
    }),
    setPositionState,
  } as unknown as MediaSession

  vi.stubGlobal('MediaMetadata', class {
    constructor(init: MediaMetadataInit) {
      Object.assign(this, init)
    }
  })
  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    value: mediaSession,
  })

  return { actionHandlers, mediaSession, setPositionState }
}

describe('usePlaybackEffects', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'mediaSession')
    Reflect.deleteProperty(navigator, 'audioSession')
  })

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
    vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)

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
      playbackTime: 0,
      seekBy: vi.fn(),
      seekTo: vi.fn(),
      togglePlayback: vi.fn().mockResolvedValue(undefined),
      jumpToPreviousTrack: vi.fn(),
      jumpToNextTrack: vi.fn(),
      drainProgressQueue: vi.fn().mockResolvedValue(undefined),
      playbackTimeRef: { current: 42 },
      setPlaybackState: vi.fn(),
      refreshOfflineBooks: vi.fn(),
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
      refreshOfflineBooks: vi.fn(),
    })

    expect(play).toHaveBeenCalledTimes(1)
    expect(audio.preload).toBe('auto')
  })

  it('maps lock-screen actions to audio state and updates position metadata', async () => {
    const { actionHandlers, mediaSession, setPositionState } = installMediaSession()
    const audioSession = { type: 'ambient' }
    Object.defineProperty(navigator, 'audioSession', {
      configurable: true,
      value: audioSession,
    })
    const activePlayback = buildActivePlayback()
    const audio = document.createElement('audio')
    let paused = true
    let currentTime = 42
    const play = vi.fn().mockImplementation(async () => {
      paused = false
      audio.dispatchEvent(new Event('play'))
    })
    const pause = vi.fn().mockImplementation(() => {
      paused = true
      audio.dispatchEvent(new Event('pause'))
    })

    Object.defineProperty(audio, 'paused', { configurable: true, get: () => paused })
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => { currentTime = value },
    })
    Object.defineProperty(audio, 'play', { configurable: true, value: play })
    Object.defineProperty(audio, 'pause', { configurable: true, value: pause })
    vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)

    const props = {
      activePlayback,
      setActivePlayback: vi.fn(),
      audioRef: { current: audio },
      playbackStateRef: { current: null },
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
      seekTo: vi.fn(),
      jumpToPreviousTrack: vi.fn(),
      jumpToNextTrack: vi.fn(),
      drainProgressQueue: vi.fn().mockResolvedValue(undefined),
      playbackTimeRef: { current: 42 },
      setPlaybackState: vi.fn(),
      refreshOfflineBooks: vi.fn(),
    }

    renderHook((hookProps) => usePlaybackEffects(hookProps), { initialProps: props })
    expect(audioSession.type).toBe('playback')
    play.mockClear()
    pause.mockClear()
    setPositionState.mockClear()

    await act(async () => {
      actionHandlers.get('play')?.({ action: 'play' } as MediaSessionActionDetails)
    })
    expect(play).toHaveBeenCalledTimes(1)
    expect(mediaSession.playbackState).toBe('playing')

    act(() => {
      actionHandlers.get('pause')?.({ action: 'pause' } as MediaSessionActionDetails)
    })
    expect(pause).toHaveBeenCalledTimes(1)
    expect(mediaSession.playbackState).toBe('paused')

    currentTime = 42
    act(() => {
      audio.dispatchEvent(new Event('timeupdate'))
    })
    expect(setPositionState).toHaveBeenCalledWith({
      duration: activePlayback.duration,
      position: 42,
      playbackRate: 1,
    })
  })

  it('keeps a single audio element as the iOS media-session owner', () => {
    const activePlayback = buildActivePlayback()
    const audio = document.createElement('audio')
    Object.defineProperty(audio, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    const createElement = vi.spyOn(document, 'createElement')

    const props = {
      activePlayback,
      setActivePlayback: vi.fn(),
      audioRef: { current: audio },
      playbackStateRef: { current: null },
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
      seekTo: vi.fn(),
      jumpToPreviousTrack: vi.fn(),
      jumpToNextTrack: vi.fn(),
      drainProgressQueue: vi.fn().mockResolvedValue(undefined),
      playbackTimeRef: { current: 42 },
      setPlaybackState: vi.fn(),
      refreshOfflineBooks: vi.fn(),
    }

    renderHook((hookProps) => usePlaybackEffects(hookProps), { initialProps: props })

    expect(createElement.mock.calls.filter(([tagName]) => tagName === 'audio')).toHaveLength(0)
  })

  it('delegates next-track playback to the shared track transition', () => {
    const activePlayback = buildActivePlayback()
    const audio = document.createElement('audio')
    Object.defineProperty(audio, 'play', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })

    const props = {
      activePlayback,
      setActivePlayback: vi.fn(),
      audioRef: { current: audio },
      playbackStateRef: { current: null },
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
      seekTo: vi.fn(),
      jumpToPreviousTrack: vi.fn(),
      jumpToNextTrack: vi.fn(),
      drainProgressQueue: vi.fn().mockResolvedValue(undefined),
      playbackTimeRef: { current: 119 },
      setPlaybackState: vi.fn(),
      refreshOfflineBooks: vi.fn(),
    }

    renderHook((hookProps) => usePlaybackEffects(hookProps), {
      initialProps: props,
    })

    act(() => {
      audio.dispatchEvent(new Event('ended'))
    })

    expect(props.jumpToNextTrack).toHaveBeenCalledTimes(1)
  })
})
