import { useCallback, useEffect, useSyncExternalStore } from 'react'

import {
  getThemePreference,
  setThemePreference,
  subscribePreferences,
  type ThemeChoice,
} from '../lib/preferences'

function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(choice: ThemeChoice) {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(choice)
  document.documentElement.setAttribute('data-theme', resolved)
}

export function useTheme() {
  const choice = useSyncExternalStore(
    subscribePreferences,
    getThemePreference,
    () => 'system' as ThemeChoice,
  )

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemePreference(next)
    applyTheme(next)
  }, [])

  useEffect(() => {
    applyTheme(choice)
  }, [choice])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => { if (getThemePreference() === 'system') applyTheme('system') }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return { theme: choice, resolved: resolveTheme(choice), setTheme } as const
}
