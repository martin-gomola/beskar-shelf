import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import type { AudiobookshelfClient } from '../lib/api'
import { getOfflineBook, loadBookRate, saveBookRate, savePlaybackState } from '../lib/storage'
import type { BookItem, PersistedPlaybackState, PlaybackSession } from '../lib/types'
import { clamp } from '../lib/utils'
import { buildOfflineSession, hasCompleteOfflineTracks, revokePlaybackSources, trackForTime, type ActivePlayback } from './playback/shared'
import { usePlaybackEffects } from './playback/usePlaybackEffects'
import { usePlaybackProgress } from './playback/usePlaybackProgress'
import { useSkipSeconds } from './usePlaybackPrefs'

export type { ActivePlayback } from './playback/shared'

export function usePlayback(
  client: AudiobookshelfClient,
  session: { token: string } | null,
  playbackState: PersistedPlaybackState | null,
  setPlaybackState: React.Dispatch<React.SetStateAction<PersistedPlaybackState | null>>,
  refreshOfflineBooks?: () => Promise<void>,
) {
  const [activePlayback, setActivePlayback] = useState<ActivePlayback | null>(null)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRateState] = useState(() => playbackState?.rate ?? 1)
  const [currentTrackDuration, setCurrentTrackDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const isSeekingRef = useRef(false)
  const activePlaybackRef = useRef(activePlayback)
  const sessionRef = useRef(session)
  const playbackStateRef = useRef(playbackState)
  const playbackTimeRef = useRef(playbackTime)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const playbackRateRef = useRef(playbackRate)

  useEffect(() => {
    activePlaybackRef.current = activePlayback
    sessionRef.current = session
    playbackStateRef.current = playbackState
    playbackTimeRef.current = playbackTime
    playbackRateRef.current = playbackRate
  }, [activePlayback, playbackRate, playbackState, playbackTime, session])

  const createSourcesForItem = useCallback((sessionValue: PlaybackSession, offline: Awaited<ReturnType<typeof getOfflineBook>>) => {
    if (offline?.status === 'downloaded') {
      return sessionValue.audioTracks.map((track) => {
        const stored = offline.tracks.find((savedTrack) => savedTrack.trackIndex === track.index)
        if (!stored) {
          return client.streamUrl(track.contentUrl)
        }
        if (!stored.blob) {
          return client.streamUrl(track.contentUrl)
        }
        return URL.createObjectURL(stored.blob)
      })
    }
    return sessionValue.audioTracks.map((track) => client.streamUrl(track.contentUrl))
  }, [client])

  const { drainProgressQueue, scheduleProgressCommit, flushProgress } = usePlaybackProgress({
    isSeekingRef,
    client,
    queryClient,
    setPlaybackState,
    activePlaybackRef,
    sessionRef,
    playbackStateRef,
    playbackTimeRef,
    playbackRateRef,
  })

  const togglePlayback = useCallback(async () => {
    if (!audioRef.current) {
      return
    }
    if (audioRef.current.paused) {
      try {
        await audioRef.current.play()
      } catch {
        // Browser blocked autoplay
      }
      return
    }
    audioRef.current.pause()
  }, [])

  const seekTo = useCallback((seconds: number) => {
    const ap = activePlaybackRef.current
    const audio = audioRef.current
    if (!ap || !audio) {
      return
    }
    const clamped = clamp(seconds, 0, ap.duration)
    const nextTrackIndex = trackForTime(ap.session.audioTracks, clamped)
    const track = ap.session.audioTracks[nextTrackIndex]
    const nextSource = ap.sources[nextTrackIndex]
    const nextTime = clamped - track.startOffset
    const wasPlaying = !audio.paused
    const isChangingTrack = nextTrackIndex !== ap.trackIndex

    playbackTimeRef.current = clamped
    setPlaybackTime(clamped)

    if (!isChangingTrack) {
      audio.currentTime = nextTime
      return
    }

    // Cross-track seek: assigning a new src resets the element to readyState 0,
    // so currentTime/play must wait for loadedmetadata. We also defer the
    // setActivePlayback() call until after the source is wired up — calling it
    // first would re-run the main playback effect which unconditionally calls
    // audio.play(), producing a spurious play() on a still-loading element.
    if (sourcesMatch(audio.src, nextSource)) {
      setActivePlayback({ ...ap, trackIndex: nextTrackIndex })
      audio.currentTime = nextTime
      if (wasPlaying) {
        void audio.play().catch(() => undefined)
      }
      return
    }

    const onLoaded = () => {
      audio.currentTime = nextTime
      setActivePlayback({ ...ap, trackIndex: nextTrackIndex })
      if (wasPlaying) {
        void audio.play().catch(() => undefined)
      }
    }
    audio.addEventListener('loadedmetadata', onLoaded, { once: true })
    audio.src = nextSource
    audio.load()
  }, [])

  const seekBy = useCallback((delta: number) => {
    const currentTime = playbackTimeRef.current
    seekTo(currentTime + delta)
  }, [seekTo])

  // jumpToTrack/jumpToPreviousTrack/jumpToNextTrack are memoised so the
  // Media Session effect (in usePlaybackEffects) keeps stable handler
  // identities across renders. They sit above usePlaybackEffects so they
  // can be passed in as stable callbacks rather than fresh arrow wrappers.
  const jumpToTrack = useCallback((index: number) => {
    const ap = activePlaybackRef.current
    const audio = audioRef.current
    if (!ap || !audio) {
      return
    }
    const track = ap.session.audioTracks[index]
    if (!track) {
      return
    }
    setActivePlayback({ ...ap, trackIndex: index })
    audio.src = ap.sources[index]
    audio.currentTime = 0
    void audio.play()
  }, [])

  const jumpToPreviousTrack = useCallback(() => {
    const ap = activePlaybackRef.current
    if (!ap) {
      return
    }
    jumpToTrack(Math.max(0, ap.trackIndex - 1))
  }, [jumpToTrack])

  const jumpToNextTrack = useCallback(() => {
    const ap = activePlaybackRef.current
    if (!ap) {
      return
    }
    jumpToTrack(Math.min(ap.session.audioTracks.length - 1, ap.trackIndex + 1))
  }, [jumpToTrack])

  const [skipSeconds] = useSkipSeconds()

  usePlaybackEffects({
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
    skipSeconds,
  })

  const startBook = useCallback(async (item: BookItem, startTime?: number) => {
    const offline = await getOfflineBook(item.id)
    let playbackSession
    if (offline && hasCompleteOfflineTracks(item, offline)) {
      playbackSession = buildOfflineSession(item, offline)
    } else {
      playbackSession = await client.startPlayback(item.id)
    }
    if (playbackSession.audioTracks.length === 0) {
      return
    }
    const sources = createSourcesForItem(playbackSession, offline)
    const hasSavedPosition = playbackState?.itemId === item.id && playbackState.currentTime > 0
    const initialTime = startTime != null
      ? startTime
      : hasSavedPosition
        ? playbackState.currentTime
        : item.currentTime
    const initialTrackIndex = trackForTime(playbackSession.audioTracks, initialTime)
    const nextPlayback: ActivePlayback = {
      item,
      session: playbackSession,
      sources,
      trackIndex: initialTrackIndex,
      duration: playbackSession.duration,
    }

    setActivePlayback((current) => {
      revokePlaybackSources(current)
      return nextPlayback
    })
    // Per-book speed memory: prefer last-played rate (still in playbackState
    // for the recent book), then a previously-saved rate for this book,
    // then default 1×.
    const restoredRate = playbackState?.itemId === item.id
      ? playbackState.rate
      : loadBookRate(item.id) ?? 1
    setPlaybackRateState(restoredRate)
    setPlaybackState({
      itemId: item.id,
      sessionId: playbackSession.id,
      currentTime: initialTime,
      duration: playbackSession.duration,
      rate: restoredRate,
      updatedAt: Date.now(),
    })
    startTransition(() => navigate('/player'))
  }, [client, createSourcesForItem, navigate, playbackState, setPlaybackState])

  // No auto-resume on mount: saved playback state stays in localStorage
  // so the UI can offer a "Resume" affordance, but we never reopen the
  // session or navigate to /player without explicit user intent.

  function setPlaybackRate(rate: number) {
    setPlaybackRateState(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
    const ap = activePlaybackRef.current
    if (ap) {
      saveBookRate(ap.item.id, rate)
    }
    setPlaybackState((current) => {
      if (!current) {
        return current
      }
      const next = { ...current, rate, updatedAt: Date.now() }
      savePlaybackState(next)
      return next
    })
  }

  function stopPlayback() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
    }
    flushProgress(false)
    setActivePlayback((current) => {
      revokePlaybackSources(current)
      return null
    })
    setIsPlaying(false)
    setPlaybackTime(0)
    setCurrentTrackDuration(0)
    setPlaybackState(null)
    savePlaybackState(null)
  }


  function setIsSeeking(value: boolean) {
    isSeekingRef.current = value
  }

  return {
    activePlayback,
    playbackTime,
    isPlaying,
    playbackRate,
    currentTrackDuration,
    startBook,
    togglePlayback,
    stopPlayback,
    seekTo,
    seekBy,
    setPlaybackRate,
    jumpToTrack,
    jumpToPreviousTrack,
    jumpToNextTrack,
    setIsSeeking,
    audioRef,
  }
}

function sourcesMatch(currentSource: string, nextSource: string) {
  if (currentSource === nextSource) {
    return true
  }

  try {
    return currentSource === new URL(nextSource, window.location.href).href
  } catch {
    return false
  }
}
