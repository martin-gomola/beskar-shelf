import { useCallback, useEffect, useRef, useState } from 'react'

export type SleepTimerMode = 'off' | 'minutes' | 'end-of-chapter'

interface SleepTimerState {
  mode: SleepTimerMode
  minutes: number
  remainingMs: number
}

const STORAGE_KEY = 'beskar:pwa:sleep-timer-minutes'

function loadLastMinutes(): number {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored ? Number(stored) || 15 : 15
}

export function useSleepTimer(
  pause: () => void,
  chapterEndTime: number | null,
  currentTime: number,
) {
  const [state, setState] = useState<SleepTimerState>({
    mode: 'off',
    minutes: loadLastMinutes(),
    remainingMs: 0,
  })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineRef = useRef(0)

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    deadlineRef.current = 0
    setState((prev) => ({ ...prev, mode: 'off', remainingMs: 0 }))
  }, [])

  const startMinutes = useCallback((minutes: number) => {
    clear()
    window.localStorage.setItem(STORAGE_KEY, String(minutes))
    deadlineRef.current = Date.now() + minutes * 60 * 1000
    setState({ mode: 'minutes', minutes, remainingMs: minutes * 60 * 1000 })

    timerRef.current = setInterval(() => {
      const remaining = deadlineRef.current - Date.now()
      if (remaining <= 0) {
        pause()
        clear()
      } else {
        setState((prev) => ({ ...prev, remainingMs: remaining }))
      }
    }, 1000)
  }, [clear, pause])

  const startEndOfChapter = useCallback(() => {
    clear()
    setState((prev) => ({ ...prev, mode: 'end-of-chapter', remainingMs: 0 }))
  }, [clear])

  // End-of-chapter mode: pause when currentTime crosses chapterEndTime
  useEffect(() => {
    if (state.mode !== 'end-of-chapter' || chapterEndTime === null) {
      return
    }
    if (currentTime >= chapterEndTime) {
      pause()
      const timeoutId = window.setTimeout(() => {
        clear()
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }
  }, [state.mode, currentTime, chapterEndTime, pause, clear])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  return {
    sleepTimer: state,
    setSleepMinutes: startMinutes,
    setSleepEndOfChapter: startEndOfChapter,
    cancelSleepTimer: clear,
  }
}
