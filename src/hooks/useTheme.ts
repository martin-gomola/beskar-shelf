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

// Must match --canvas in index.css for the two themes. iOS uses this to tint
// the standalone-mode status bar; the luminance also drives status bar text
// color (dark text on light bg, light text on dark bg).
const THEME_COLORS = { light: '#f3ede3', dark: '#050a10' } as const

// When the user picks an explicit theme, override the two scheme-scoped
// meta tags from index.html with a single unconditional one so the OS
// follows our choice instead of the system preference. When 'system',
// remove the override and let the scheme-scoped tags do their job.
function syncThemeColorMeta(choice: ThemeChoice, resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  const head = document.head
  let override = head.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-override="1"]')
  if (choice === 'system') {
    override?.remove()
    return
  }
  if (!override) {
    override = document.createElement('meta')
    override.setAttribute('name', 'theme-color')
    override.setAttribute('data-override', '1')
    head.appendChild(override)
  }
  override.setAttribute('content', THEME_COLORS[resolved])
}

function applyTheme(choice: ThemeChoice) {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(choice)
  document.documentElement.setAttribute('data-theme', resolved)
  syncThemeColorMeta(choice, resolved)
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
