import { useCallback, useEffect, useSyncExternalStore } from 'react'

type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'beskar:pwa:theme'

function getStoredChoice(): ThemeChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch { /* private browsing */ }
  return 'system'
}

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

let listeners: Array<() => void> = []
function subscribe(cb: () => void) {
  listeners.push(cb)
  return () => { listeners = listeners.filter((l) => l !== cb) }
}
function emitChange() {
  listeners.forEach((cb) => cb())
}

function getSnapshot(): ThemeChoice {
  return getStoredChoice()
}

export function useTheme() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, () => 'system' as ThemeChoice)

  const setTheme = useCallback((next: ThemeChoice) => {
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* noop */ }
    applyTheme(next)
    emitChange()
  }, [])

  useEffect(() => {
    applyTheme(choice)
  }, [choice])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => { if (getStoredChoice() === 'system') applyTheme('system') }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return { theme: choice, resolved: resolveTheme(choice), setTheme } as const
}
