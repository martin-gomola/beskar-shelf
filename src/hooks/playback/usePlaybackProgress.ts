import { useCallback, useEffect, useRef } from 'react'
import type { QueryClient } from '@tanstack/react-query'

import { enqueueProgress, loadProgressQueue, savePlaybackState, saveProgressQueue } from '../../lib/storage'
import type { PersistedPlaybackState, ProgressPayload } from '../../lib/types'
import { clamp } from '../../lib/utils'
import type { AudiobookshelfClient } from '../../lib/api'
import type { ActivePlayback } from './shared'

const PROGRESS_DEBOUNCE_MS = 5000

interface UsePlaybackProgressOptions {
  client: AudiobookshelfClient
  queryClient: QueryClient
  setPlaybackState: React.Dispatch<React.SetStateAction<PersistedPlaybackState | null>>
  activePlaybackRef: React.RefObject<ActivePlayback | null>
  sessionRef: React.RefObject<{ token: string } | null>
  playbackStateRef: React.RefObject<PersistedPlaybackState | null>
  playbackTimeRef: React.RefObject<number>
  playbackRateRef: React.RefObject<number>
  isSeekingRef: React.RefObject<boolean>
}

export function usePlaybackProgress({
  client,
  queryClient,
  setPlaybackState,
  activePlaybackRef,
  sessionRef,
  playbackStateRef,
  playbackTimeRef,
  playbackRateRef,
  isSeekingRef,
}: UsePlaybackProgressOptions) {
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCommitRef = useRef(0)

  useEffect(() => {
    return () => {
      if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current)
    }
  }, [])

  const drainProgressQueue = useCallback(async () => {
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
  }, [client])

  const commitProgressNow = useCallback(async (isFinished = false) => {
    const currentPlayback = activePlaybackRef.current
    const currentSession = sessionRef.current
    const currentPlaybackState = playbackStateRef.current
    const currentPlaybackTime = playbackTimeRef.current
    const currentPlaybackRate = playbackRateRef.current

    if (!currentPlayback || !currentSession) {
      return
    }

    // Skip syncs for the first 10s — avoids polluting server with session-start noise
    if (!isFinished && currentPlaybackTime < 10) {
      return
    }

    lastCommitRef.current = Date.now()

    const payload: ProgressPayload = {
      duration: currentPlayback.duration,
      progress: currentPlayback.duration > 0 ? clamp(currentPlaybackTime / currentPlayback.duration, 0, 1) : 0,
      currentTime: currentPlaybackTime,
      isFinished,
      startedAt: currentPlaybackState?.updatedAt ?? Date.now(),
      finishedAt: isFinished ? Date.now() : null,
    }

    setPlaybackState(() => {
      const next = {
        itemId: currentPlayback.item.id,
        sessionId: currentPlayback.session.id,
        currentTime: payload.currentTime,
        duration: payload.duration,
        rate: currentPlaybackRate,
        updatedAt: Date.now(),
      }
      savePlaybackState(next)
      return next
    })

    try {
      await client.updateProgress(currentPlayback.item.id, payload)
      queryClient.setQueryData(['item', currentPlayback.item.id], (old: unknown) => {
        if (!old || typeof old !== 'object') {
          return old
        }
        return {
          ...(old as Record<string, unknown>),
          currentTime: payload.currentTime,
          progress: payload.progress,
        }
      })
      if (isFinished) {
        if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current)
        invalidateTimerRef.current = setTimeout(() => {
          invalidateTimerRef.current = null
          void queryClient.invalidateQueries({ queryKey: ['personalized'] })
        }, 600)
      }
      void drainProgressQueue()
    } catch (error) {
      enqueueProgress(currentPlayback.item.id, payload as unknown as Record<string, unknown>)
      console.error(error)
    }
  }, [
    activePlaybackRef,
    client,
    drainProgressQueue,
    playbackRateRef,
    playbackStateRef,
    playbackTimeRef,
    queryClient,
    sessionRef,
    setPlaybackState,
  ])

  const scheduleProgressCommit = useCallback(() => {
    if (progressTimerRef.current || isSeekingRef.current) {
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

  return {
    drainProgressQueue,
    scheduleProgressCommit,
    flushProgress,
  }
}
