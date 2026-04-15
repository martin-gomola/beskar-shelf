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
import { getOfflineBook, savePlaybackState } from '../lib/storage'
import type { BookItem, PersistedPlaybackState, PlaybackSession } from '../lib/types'
import { clamp } from '../lib/utils'
import { buildOfflineSession, revokePlaybackSources, trackForTime, type ActivePlayback } from './playback/shared'
import { usePlaybackEffects } from './playback/usePlaybackEffects'
import { usePlaybackProgress } from './playback/usePlaybackProgress'

export type { ActivePlayback } from './playback/shared'

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
    if (!ap || !audioRef.current) {
      return
    }
    const clamped = clamp(seconds, 0, ap.duration)
    const nextTrackIndex = trackForTime(ap.session.audioTracks, clamped)
    const track = ap.session.audioTracks[nextTrackIndex]
    setActivePlayback({ ...ap, trackIndex: nextTrackIndex })
    audioRef.current.src = ap.sources[nextTrackIndex]
    audioRef.current.currentTime = clamped - track.startOffset
  }, [])

  const seekBy = useCallback((delta: number) => {
    const currentTime = playbackTimeRef.current
    seekTo(currentTime + delta)
  }, [seekTo])

  usePlaybackEffects({
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
    togglePlayback,
    drainProgressQueue,
    playbackTimeRef,
    setPlaybackState,
  })

  const startBook = useCallback(async (item: BookItem, startTime?: number) => {
    const offline = await getOfflineBook(item.id)
    let playbackSession
    if (offline?.status === 'downloaded' && offline.tracks.length > 0) {
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
  }, [client, createSourcesForItem, navigate, playbackState, setPlaybackState])

  useEffect(() => {
    if (!client.hasSession() || !playbackState || activePlayback) {
      return
    }

    void (async () => {
      try {
        const item = await client.getItem(playbackState.itemId)
        if (item.audioTracks.length === 0) {
          savePlaybackState(null)
          setPlaybackState(null)
          return
        }
        await startBook(item)
        if (audioRef.current) {
          audioRef.current.currentTime = playbackState.currentTime
        }
      } catch (error) {
        savePlaybackState(null)
        setPlaybackState(null)
        console.error(error)
      }
    })()
  }, [activePlayback, client, playbackState, setPlaybackState, startBook])

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
      revokePlaybackSources(current)
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
    setIsSeeking,
    audioRef,
  }
}
