import { useEffect, useRef, useState } from 'react'

import type { PersistedPlaybackState } from '../../lib/types'
import type { AudiobookshelfClient } from '../../lib/api'
import { cachePlayedTrack } from '../../lib/downloads'
import { enableBackgroundAudio, revokePlaybackSources, totalTimeFromTrack, type ActivePlayback } from './shared'
import { TrackSourceResolver } from './trackSourceResolver'
import {
  canAttemptTransition,
  createTransitionState,
  reduceTransition,
  type TransitionState,
} from './transitionMachine'

interface UsePlaybackEffectsOptions {
  activePlayback: ActivePlayback | null
  setActivePlayback: React.Dispatch<React.SetStateAction<ActivePlayback | null>>
  audioRef: React.RefObject<HTMLAudioElement | null>
  playbackStateRef: React.RefObject<PersistedPlaybackState | null>
  playbackRate: number
  setPlaybackTime: React.Dispatch<React.SetStateAction<number>>
  setCurrentTrackDuration: React.Dispatch<React.SetStateAction<number>>
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>
  scheduleProgressCommit: () => void
  flushProgress: (isFinished?: boolean) => void
  client: AudiobookshelfClient
  seekBy: (delta: number) => void
  seekTo: (seconds: number) => void
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
  setPlaybackTime,
  setCurrentTrackDuration,
  setIsPlaying,
  scheduleProgressCommit,
  flushProgress,
  client,
  seekBy,
  seekTo,
  jumpToPreviousTrack,
  jumpToNextTrack,
  drainProgressQueue,
  playbackTimeRef,
  setPlaybackState,
  refreshOfflineBooks,
  skipSeconds = 30,
}: UsePlaybackEffectsOptions) {
  const activePlaybackCleanupRef = useRef<ActivePlayback | null>(activePlayback)
  const autoplayPlaybackRef = useRef<ActivePlayback | null>(null)
  const transitionStateRef = useRef<TransitionState | null>(null)
  const [trackSourceResolver] = useState(() => new TrackSourceResolver())

  useEffect(() => {
    if (!activePlayback || !audioRef.current) {
      return
    }

    const playbackChanged = activePlayback !== autoplayPlaybackRef.current
    autoplayPlaybackRef.current = activePlayback
    const audio = audioRef.current
    const transitionState = transitionStateRef.current
    if (
      !transitionState
      || transitionState.sessionId !== activePlayback.session.id
      || transitionState.targetTrackIndex == null
      || transitionState.targetTrackIndex !== activePlayback.trackIndex
    ) {
      transitionStateRef.current = createTransitionState(
        activePlayback.session.id,
        activePlayback.trackIndex,
      )
    }
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
      // iOS can return the audio session to an ambient category after a
      // lock-screen pause. Its native Media Session handler restarts the
      // media clock, so reassert the playback category from the resulting
      // play event to restore the audible route as well.
      enableBackgroundAudio()
      if (transitionStateRef.current?.sessionId === activePlayback.session.id) {
        transitionStateRef.current = reduceTransition(
          transitionStateRef.current,
          { type: 'playing' },
        )
      }
      setIsPlaying(true)
      document.title = playingTitle
      syncMediaSession(activePlayback, audio)
    }
    const onPause = () => {
      setIsPlaying(false)
      flushProgress(false)
      document.title = baseTitle
      syncMediaSession(activePlayback, audio)
    }
    const onLoaded = () => {
      setCurrentTrackDuration(audio.duration || 0)
      syncMediaSession(activePlayback, audio)
    }
    const onCanPlay = () => attemptTrackTransition(audio, transitionStateRef)
    const onError = () => {
      const current = transitionStateRef.current
      if (current?.targetTrackIndex != null) {
        transitionStateRef.current = reduceTransition(current, { type: 'play-failed' })
      }
    }
    const onMediaStateChange = () => syncMediaSession(activePlayback, audio)
    const onEnded = () => {
      const finishedSource = activePlayback.sources[activePlayback.trackIndex]
      if (finishedSource && !finishedSource.startsWith('blob:')) {
        void cachePlayedTrack(client, activePlayback, activePlayback.trackIndex)
          .then(() => refreshOfflineBooks?.())
          .catch(() => {})
      }

      const currentTransition = transitionStateRef.current
        ?? createTransitionState(activePlayback.session.id, activePlayback.trackIndex)
      const transition = reduceTransition(currentTransition, {
        type: 'track-ended',
        totalTracks: activePlayback.sources.length,
      })
      transitionStateRef.current = transition
      const nextIndex = transition.targetTrackIndex
      if (nextIndex != null) {
        // iOS may suspend the PWA again as soon as this ended callback
        // returns. Start the next source synchronously instead of waiting for
        // loadedmetadata in the interactive track-navigation path.
        const sources = trackSourceResolver.consume(activePlayback, nextIndex)
        const next = { ...activePlayback, sources, trackIndex: nextIndex }
        autoplayPlaybackRef.current = next
        setActivePlayback(next)
        audio.src = next.sources[nextIndex]
        audio.currentTime = 0
        transitionStateRef.current = reduceTransition(transition, { type: 'source-assigned' })
        attemptTrackTransition(audio, transitionStateRef)
        return
      }
      setIsPlaying(false)
      flushProgress(true)
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none'
      }
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('error', onError)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('timeupdate', onMediaStateChange)
    audio.addEventListener('durationchange', onMediaStateChange)
    audio.addEventListener('ratechange', onMediaStateChange)
    audio.addEventListener('seeked', onMediaStateChange)

    syncMediaSession(activePlayback, audio)

    if (playbackChanged) {
      enableBackgroundAudio()
      void audio.play().catch(() => undefined)
    }

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onMediaStateChange)
      audio.removeEventListener('durationchange', onMediaStateChange)
      audio.removeEventListener('ratechange', onMediaStateChange)
      audio.removeEventListener('seeked', onMediaStateChange)
      document.title = baseTitle
    }
  }, [
    activePlayback,
    audioRef,
    client,
    flushProgress,
    jumpToNextTrack,
    playbackRate,
    playbackStateRef,
    refreshOfflineBooks,
    setActivePlayback,
    setCurrentTrackDuration,
    setIsPlaying,
    trackSourceResolver,
  ])

  const activeSessionId = activePlayback?.session.id ?? null
  useEffect(() => {
    trackSourceResolver.activateSession(activeSessionId)
    return () => {
      trackSourceResolver.activateSession(null)
    }
  }, [activeSessionId, trackSourceResolver])

  useEffect(() => {
    if (!activePlayback) {
      return
    }

    trackSourceResolver.activateSession(
      activePlayback.session.id,
      activePlayback.trackIndex,
    )

    const nextIndex = activePlayback.trackIndex + 1
    const nextSource = activePlayback.sources[nextIndex]
    if (!nextSource || nextSource.startsWith('blob:')) {
      return
    }

    void trackSourceResolver.prefetch(client, activePlayback, nextIndex)
      .then((prefetched) => {
        if (prefetched) void refreshOfflineBooks?.()
      })
      .catch(() => {})
  }, [activePlayback, client, refreshOfflineBooks, trackSourceResolver])

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
      } else {
        const transition = transitionStateRef.current
        if (transition?.targetTrackIndex != null && audioRef.current) {
          transitionStateRef.current = reduceTransition(transition, { type: 'foregrounded' })
          attemptTrackTransition(audioRef.current, transitionStateRef)
        }
      }
      if (!document.hidden && hiddenAt > 0 && Date.now() - hiddenAt > 30_000) {
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
  }, [activePlayback, audioRef, client, drainProgressQueue, flushProgress, playbackTimeRef, setPlaybackState])

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
      // Use explicit remote handlers so lock-screen Play can restore iOS's
      // playback category before restarting the media element. The default
      // handler may advance the media clock silently while the PWA is locked.
      ['play', () => {
        enableBackgroundAudio()
        void audioRef.current?.play().catch(() => undefined)
      }],
      ['pause', () => audioRef.current?.pause()],
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
  }, [activePlayback, audioRef, client, jumpToNextTrack, jumpToPreviousTrack, seekBy, seekTo, skipSeconds])

  useEffect(() => {
    if (activePlayback || !('mediaSession' in navigator)) {
      return
    }
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
  }, [activePlayback])

  useEffect(() => {
    activePlaybackCleanupRef.current = activePlayback
  }, [activePlayback])

  useEffect(() => {
    return () => {
      revokePlaybackSources(activePlaybackCleanupRef.current)
    }
  }, [])
}

function attemptTrackTransition(
  audio: HTMLAudioElement,
  transitionStateRef: React.RefObject<TransitionState | null>,
) {
  const current = transitionStateRef.current
  if (!current || !canAttemptTransition(current)) {
    return
  }

  transitionStateRef.current = reduceTransition(current, { type: 'play-attempted' })
  enableBackgroundAudio()
  void audio.play().catch(() => {
    const latest = transitionStateRef.current
    if (latest?.targetTrackIndex != null) {
      transitionStateRef.current = reduceTransition(latest, { type: 'play-failed' })
    }
  })
}

function syncMediaSession(activePlayback: ActivePlayback, audio: HTMLAudioElement) {
  if (!('mediaSession' in navigator)) {
    return
  }

  navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing'
  if (!navigator.mediaSession.setPositionState || !Number.isFinite(activePlayback.duration) || activePlayback.duration <= 0) {
    return
  }

  const position = totalTimeFromTrack(activePlayback, audio.currentTime)
  if (!Number.isFinite(position)) {
    return
  }

  try {
    navigator.mediaSession.setPositionState({
      duration: activePlayback.duration,
      position: Math.min(Math.max(position, 0), activePlayback.duration),
      playbackRate: audio.playbackRate,
    })
  } catch {
    // Some browsers reject position state while media metadata is incomplete.
  }
}
