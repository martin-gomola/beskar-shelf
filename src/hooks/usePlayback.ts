import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import type { AudiobookshelfClient } from '../lib/api'
import { enqueueProgress, getOfflineBook, loadProgressQueue, savePlaybackState, saveProgressQueue } from '../lib/storage'
import type { AudioTrack, BookItem, PersistedPlaybackState, PlaybackSession, ProgressPayload } from '../lib/types'
import { clamp } from '../lib/utils'

export interface ActivePlayback {
  item: BookItem
  session: PlaybackSession
  sources: string[]
  trackIndex: number
  duration: number
}

function trackForTime(tracks: AudioTrack[], currentTime: number) {
  const target = clamp(currentTime, 0, Math.max(currentTime, tracks.at(-1)?.startOffset ?? 0))
  const found = tracks.findIndex((track) => {
    const end = track.startOffset + track.duration
    return target >= track.startOffset && target < end
  })
  return found === -1 ? 0 : found
}

function totalTimeFromTrack(activePlayback: ActivePlayback | null, audioTime: number) {
  if (!activePlayback) {
    return 0
  }
  const track = activePlayback.session.audioTracks[activePlayback.trackIndex]
  return (track?.startOffset ?? 0) + audioTime
}

const PROGRESS_DEBOUNCE_MS = 5000

export function usePlayback(
  client: AudiobookshelfClient,
  session: { token: string } | null,
  playbackState: PersistedPlaybackState | null,
  setPlaybackState: React.Dispatch<React.SetStateAction<PersistedPlaybackState | null>>,
) {
  const [activePlayback, setActivePlayback] = useState<ActivePlayback | null>(null)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRateState] = useState(() => playbackState?.rate ?? 1)
  const [currentTrackDuration, setCurrentTrackDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCommitRef = useRef(0)

  async function createSourcesForItem(itemId: string, sessionValue: PlaybackSession) {
    const offline = await getOfflineBook(itemId)
    if (offline?.status === 'downloaded') {
      return sessionValue.audioTracks.map((track) => {
        const stored = offline.tracks.find((savedTrack) => savedTrack.trackIndex === track.index)
        if (!stored) {
          return client.streamUrl(track.contentUrl)
        }
        return URL.createObjectURL(stored.blob)
      })
    }
    return sessionValue.audioTracks.map((track) => client.streamUrl(track.contentUrl))
  }

  const commitProgressNow = useEffectEvent(async (isFinished = false) => {
    if (!activePlayback || !session) {
      return
    }

    lastCommitRef.current = Date.now()

    const payload: ProgressPayload = {
      duration: activePlayback.duration,
      progress: activePlayback.duration > 0 ? clamp(playbackTime / activePlayback.duration, 0, 1) : 0,
      currentTime: playbackTime,
      isFinished,
      startedAt: playbackState?.updatedAt ?? Date.now(),
      finishedAt: isFinished ? Date.now() : null,
    }

    setPlaybackState(() => {
      const next = {
        itemId: activePlayback.item.id,
        sessionId: activePlayback.session.id,
        currentTime: payload.currentTime,
        duration: payload.duration,
        rate: playbackRate,
        updatedAt: Date.now(),
      }
      savePlaybackState(next)
      return next
    })

    try {
      await client.updateProgress(activePlayback.item.id, payload)
      await queryClient.invalidateQueries({ queryKey: ['item', activePlayback.item.id] })
      await queryClient.invalidateQueries({ queryKey: ['personalized'] })
      void drainProgressQueue()
    } catch (error) {
      enqueueProgress(activePlayback.item.id, payload as unknown as Record<string, unknown>)
      console.error(error)
    }
  })

  async function drainProgressQueue() {
    const queue = loadProgressQueue()
    if (queue.length === 0) {
      return
    }
    const remaining = []
    for (const entry of queue) {
      try {
        await client.updateProgress(entry.itemId, entry.payload as unknown as ProgressPayload)
      } catch {
        remaining.push(entry)
      }
    }
    saveProgressQueue(remaining)
  }

  const scheduleProgressCommit = useCallback(() => {
    if (progressTimerRef.current) {
      return
    }
    const elapsed = Date.now() - lastCommitRef.current
    const delay = Math.max(0, PROGRESS_DEBOUNCE_MS - elapsed)
    progressTimerRef.current = setTimeout(() => {
      progressTimerRef.current = null
      void commitProgressNow(false)
    }, delay)
  }, [commitProgressNow])

  const flushProgress = useCallback((isFinished = false) => {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current)
      progressTimerRef.current = null
    }
    void commitProgressNow(isFinished)
  }, [commitProgressNow])

  // Audio element event wiring
  useEffect(() => {
    if (!activePlayback || !audioRef.current) {
      return
    }

    const audio = audioRef.current
    const currentSource = activePlayback.sources[activePlayback.trackIndex]
    if (audio.src !== currentSource) {
      audio.src = currentSource
      audio.currentTime = Math.max(
        0,
        (playbackState?.itemId === activePlayback.item.id ? playbackState.currentTime : activePlayback.item.currentTime)
          - (activePlayback.session.audioTracks[activePlayback.trackIndex]?.startOffset ?? 0),
      )
    }

    audio.playbackRate = playbackRate

    const onPlay = () => setIsPlaying(true)
    const onPause = () => {
      setIsPlaying(false)
      flushProgress(false)
    }
    const onLoaded = () => setCurrentTrackDuration(audio.duration || 0)
    const onEnded = () => {
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayback, playbackRate])

  // Throttled time updates via 1s interval instead of raw timeupdate
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

    // Immediate sync on seek/load
    const onSeeked = () => setPlaybackTime(totalTimeFromTrack(activePlayback, audio.currentTime))
    audio.addEventListener('seeked', onSeeked)

    return () => {
      window.clearInterval(interval)
      audio.removeEventListener('seeked', onSeeked)
    }
  }, [activePlayback, scheduleProgressCommit])

  // Flush progress on hide, refresh from server on resume after long background
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
            if (fresh.currentTime > playbackTime + 5) {
              setPlaybackState((prev) => prev ? {
                ...prev,
                currentTime: fresh.currentTime,
                updatedAt: Date.now(),
              } : prev)
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
  }, [activePlayback, flushProgress, client, playbackTime, setPlaybackState])

  // MediaSession API for lock screen / notification controls
  useEffect(() => {
    if (!activePlayback || !('mediaSession' in navigator)) {
      return
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: activePlayback.item.title,
      artist: activePlayback.item.author,
      artwork: activePlayback.item.coverPath
        ? [{ src: client.coverUrl(activePlayback.item.id), sizes: '512x512', type: 'image/jpeg' }]
        : [],
    })

    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => void togglePlayback()],
      ['pause', () => void togglePlayback()],
      ['seekbackward', () => seekBy(-30)],
      ['seekforward', () => seekBy(30)],
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
  }, [activePlayback, client])

  // Revoke blob URLs on cleanup
  useEffect(() => {
    return () => {
      activePlayback?.sources.forEach((source) => {
        if (source.startsWith('blob:')) {
          URL.revokeObjectURL(source)
        }
      })
    }
  }, [activePlayback])

  // Restore playback from persisted state
  const restorePlayback = useEffectEvent(async () => {
    if (!playbackState || activePlayback) {
      return
    }
    try {
      const item = await client.getItem(playbackState.itemId)
      await startBook(item)
      if (audioRef.current) {
        audioRef.current.currentTime = playbackState.currentTime
      }
    } catch (error) {
      console.error(error)
    }
  })

  useEffect(() => {
    if (!client.hasSession() || !playbackState || activePlayback) {
      return
    }
    void restorePlayback()
  }, [activePlayback, client, playbackState])

  async function startBook(item: BookItem) {
    const playbackSession = await client.startPlayback(item.id)
    const sources = await createSourcesForItem(item.id, playbackSession)
    const initialTime = item.currentTime || playbackState?.itemId === item.id
      ? playbackState?.currentTime ?? item.currentTime
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
      current?.sources.forEach((source) => {
        if (source.startsWith('blob:')) {
          URL.revokeObjectURL(source)
        }
      })
      return nextPlayback
    })
    setPlaybackRateState(playbackState?.itemId === item.id ? playbackState.rate : 1)
    setPlaybackState({
      itemId: item.id,
      sessionId: playbackSession.id,
      currentTime: initialTime,
      duration: playbackSession.duration,
      rate: playbackState?.itemId === item.id ? playbackState.rate : 1,
      updatedAt: Date.now(),
    })
    startTransition(() => navigate('/player'))
  }

  async function togglePlayback() {
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
  }

  function seekTo(seconds: number) {
    if (!activePlayback || !audioRef.current) {
      return
    }
    const clamped = clamp(seconds, 0, activePlayback.duration)
    const nextTrackIndex = trackForTime(activePlayback.session.audioTracks, clamped)
    const track = activePlayback.session.audioTracks[nextTrackIndex]
    setActivePlayback({ ...activePlayback, trackIndex: nextTrackIndex })
    audioRef.current.src = activePlayback.sources[nextTrackIndex]
    audioRef.current.currentTime = clamped - track.startOffset
  }

  function seekBy(delta: number) {
    seekTo(playbackTime + delta)
  }

  function setPlaybackRate(rate: number) {
    setPlaybackRateState(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
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
      current?.sources.forEach((source) => {
        if (source.startsWith('blob:')) {
          URL.revokeObjectURL(source)
        }
      })
      return null
    })
    setIsPlaying(false)
    setPlaybackTime(0)
    setCurrentTrackDuration(0)
    setPlaybackState(null)
    savePlaybackState(null)
  }

  function jumpToTrack(index: number) {
    if (!activePlayback || !audioRef.current) {
      return
    }
    const track = activePlayback.session.audioTracks[index]
    if (!track) {
      return
    }
    setActivePlayback({ ...activePlayback, trackIndex: index })
    audioRef.current.src = activePlayback.sources[index]
    audioRef.current.currentTime = 0
    void audioRef.current.play()
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
    audioRef,
  }
}
