import { useCallback, useSyncExternalStore } from 'react'

import {
  getRemainingTimeModePreference,
  getSkipSecondsPreference,
  setRemainingTimeModePreference,
  setSkipSecondsPreference,
  subscribePreferences,
  type RemainingTimeMode,
  type SkipSeconds,
} from '../lib/preferences'

const DEFAULT_SKIP_SECONDS = 30 as const

export function useSkipSeconds() {
  const value = useSyncExternalStore(
    subscribePreferences,
    getSkipSecondsPreference,
    () => DEFAULT_SKIP_SECONDS,
  )
  const setValue = useCallback((next: SkipSeconds) => {
    setSkipSecondsPreference(next)
  }, [])
  return [value, setValue] as const
}

export function useRemainingTimeMode() {
  const value = useSyncExternalStore(
    subscribePreferences,
    getRemainingTimeModePreference,
    () => 'book' as RemainingTimeMode,
  )
  const setValue = useCallback((next: RemainingTimeMode) => {
    setRemainingTimeModePreference(next)
  }, [])
  return [value, setValue] as const
}
