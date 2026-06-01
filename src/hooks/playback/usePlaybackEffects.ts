import { useEffect, useRef } from 'react'

import type { PersistedPlaybackState } from '../../lib/types'
import type { AudiobookshelfClient } from '../../lib/api'
import { cachePlayedTrack } from '../../lib/downloads'
import { revokePlaybackSources, totalTimeFromTrack, type ActivePlayback } from './shared'

interface UsePlaybackEffectsOptions {
  activePlayback: ActivePlayback | null
  setActivePlayback: React.Dispatch<React.SetStateAction<ActivePlayback | null>>
  audioRef: React.RefObject<HTMLAudioElement | null>
  playbackStateRef: React.RefObject<PersistedPlaybackState | null>
  playbackRate: number
  playbackTime: number
  setPlaybackTime: React.Dispatch<React.SetStateAction<number>>
  setCurrentTrackDuration: React.Dispatch<React.SetStateAction<number>>
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>
  scheduleProgressCommit: () => void
  flushProgress: (isFinished?: boolean) => void
  client: AudiobookshelfClient
  seekBy: (delta: number) => void
  seekTo: (seconds: number) => void
  togglePlayback: () => Promise<void>
  jumpToPreviousTrack: () => void
  jumpToNextTrack: () => void
  drainProgressQueue: () => Promise<void>
  playbackTimeRef: React.RefObject<number>
  setPlaybackState: React.Dispatch<React.SetStateAction<PersistedPlaybackState | null>>
  refreshOfflineBooks?: () => Promise<void>
  skipSeconds?: number
}

export function usePlaybackEffects({
  activePlayback,
  setActivePlayback,
  audioRef,
  playbackStateRef,
  playbackRate,
  playbackTime,
  setPlaybackTime,
  setCurrentTrackDuration,
  setIsPlaying,
  scheduleProgressCommit,
  flushProgress,
  client,
  seekBy,
  seekTo,
  togglePlayback,
  jumpToPreviousTrack,
  jumpToNextTrack,
  drainProgressQueue,
  playbackTimeRef,
  setPlaybackState,
  refreshOfflineBooks,
  skipSeconds = 30,
}: UsePlaybackEffectsOptions) {
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!activePlayback || !audioRef.current) {
      return
    }

    const audio = audioRef.current
    audio.preload = 'auto'
    const currentSource = activePlayback.sources[activePlayback.trackIndex]
    if (audio.src !== currentSource) {
      const playbackState = playbackStateRef.current
      audio.src = currentSource
      audio.currentTime = Math.max(
        0,
        (playbackState?.itemId === activePlayback.item.id ? playbackState.currentTime : activePlayback.item.currentTime)
          - (activePlayback.session.audioTracks[activePlayback.trackIndex]?.startOffset ?? 0),
      )
    }

    audio.playbackRate = playbackRate

    const baseTitle = document.title.replace(/^▶\s+/, '')
    const playingTitle = `▶ ${activePlayback.item.title} — ${baseTitle}`
    const onPlay = () => {
      setIsPlaying(true)
      document.title = playingTitle
    }
    const onPause = () => {
      setIsPlaying(false)
      flushProgress(false)
      document.title = baseTitle
    }
    const onLoaded = () => setCurrentTrackDuration(audio.duration || 0)
    const onEnded = () => {
      const finishedSource = activePlayback.sources[activePlayback.trackIndex]
      if (finishedSource && !finishedSource.startsWith('blob:')) {
        void cachePlayedTrack(client, activePlayback, activePlayback.trackIndex)
          .then(() => refreshOfflineBooks?.())
          .catch(() => {})
      }

      const nextIndex = activePlayback.trackIndex + 1
      if (nextIndex < activePlayback.sources.length) {
        const next = { ...activePlayback, trackIndex: nextIndex }
        setActivePlayback(next)
        audio.src = next.sources[nextIndex]
        audio.currentTime = 0
        void audio.play()
        return
      }
      setIsPlaying(false)
      flushProgress(true)
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('ended', onEnded)

    void audio.play().catch(() => undefined)

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('ended', onEnded)
      document.title = baseTitle
    }
  }, [
    activePlayback,
    audioRef,
    flushProgress,
    playbackRate,
    playbackStateRef,
    setActivePlayback,
    setCurrentTrackDuration,
    setIsPlaying,
  ])

  useEffect(() => {
    let preloadAudio = preloadAudioRef.current
    if (!preloadAudio) {
      preloadAudio = document.createElement('audio')
      preloadAudio.preload = 'auto'
      preloadAudioRef.current = preloadAudio
    }
    const nextSource = activePlayback?.sources[activePlayback.trackIndex + 1] ?? ''

    if (!nextSource) {
      preloadAudio.removeAttribute('src')
      preloadAudio.load()
      return
    }

    if (preloadAudio.src !== nextSource) {
      preloadAudio.src = nextSource
      preloadAudio.load()
    }
  }, [activePlayback?.sources, activePlayback?.trackIndex])

  useEffect(() => {
    if (!activePlayback || !audioRef.current) {
      return
    }

    const audio = audioRef.current
    const interval = window.setInterval(() => {
      if (!audio.paused) {
        setPlaybackTime(totalTimeFromTrack(activePlayback, audio.currentTime))
        scheduleProgressCommit()
      }
    }, 1000)

    const onSeeked = () => setPlaybackTime(totalTimeFromTrack(activePlayback, audio.currentTime))
    audio.addEventListener('seeked', onSeeked)

    return () => {
      window.clearInterval(interval)
      audio.removeEventListener('seeked', onSeeked)
    }
  }, [activePlayback, audioRef, scheduleProgressCommit, setPlaybackTime])

  useEffect(() => {
    if (!activePlayback) {
      return
    }

    let hiddenAt = 0

    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        flushProgress(false)
      } else if (hiddenAt > 0 && Date.now() - hiddenAt > 30_000) {
        void (async () => {
          try {
            const fresh = await client.getItem(activePlayback.item.id)
            if (fresh.currentTime > playbackTimeRef.current + 5) {
              setPlaybackState((prev) => prev
                ? {
                    ...prev,
                    currentTime: fresh.currentTime,
                    updatedAt: Date.now(),
                  }
                : prev)
            }
          } catch {
            // offline or server error — keep local state
          }
          void drainProgressQueue()
        })()
      }
    }

    const handleOnline = () => void drainProgressQueue()

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
    }
  }, [activePlayback, client, drainProgressQueue, flushProgress, playbackTimeRef, setPlaybackState])

  useEffect(() => {
    if (!activePlayback || !('mediaSession' in navigator)) {
      return
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: activePlayback.item.title,
      artist: activePlayback.item.author,
      album: activePlayback.session.audioTracks[activePlayback.trackIndex]?.title,
      artwork: activePlayback.item.coverPath
        ? [{ src: client.coverUrl(activePlayback.item.id), sizes: '512x512', type: 'image/jpeg' }]
        : [],
    })

    const canGoPrevious = activePlayback.trackIndex > 0
    const canGoNext = activePlayback.trackIndex < activePlayback.session.audioTracks.length - 1

    const actions: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play', () => void togglePlayback()],
      ['pause', () => void togglePlayback()],
      ['seekbackward', (details) => seekBy(-(details?.seekOffset ?? skipSeconds))],
      ['seekforward', (details) => seekBy(details?.seekOffset ?? skipSeconds)],
      ['seekto', (details) => {
        if (typeof details.seekTime !== 'number') {
          return
        }
        seekTo(details.seekTime)
      }],
      ['previoustrack', canGoPrevious ? () => jumpToPreviousTrack() : null],
      ['nexttrack', canGoNext ? () => jumpToNextTrack() : null],
    ]

    for (const [action, handler] of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // action not supported
      }
    }

    return () => {
      for (const [action] of actions) {
        try {
          navigator.mediaSession.setActionHandler(action, null)
        } catch {
          // ignore
        }
      }
    }
  }, [activePlayback, client, jumpToNextTrack, jumpToPreviousTrack, seekBy, seekTo, skipSeconds, togglePlayback])

  // Lock screen scrubber: setPositionState lets the OS render a draggable
  // progress bar and "X seconds elapsed" instead of just play/pause. Throttled
  // to every render of `playbackTime` (already 1Hz) so we don't spam the API.
  useEffect(() => {
    if (!activePlayback || !('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) {
      return
    }
    try {
      navigator.mediaSession.setPositionState({
        duration: activePlayback.duration,
        position: Math.min(playbackTime, activePlayback.duration),
        playbackRate,
      })
    } catch {
      // some browsers throw on invalid duration (e.g. 0); ignore
    }
  }, [activePlayback, playbackTime, playbackRate])

  useEffect(() => {
    return () => {
      revokePlaybackSources(activePlayback)
    }
  }, [activePlayback])
}
