import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getThemePreference, setThemePreference, subscribePreferences } from './preferences'

describe('preferences', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('falls back to the legacy theme key when structured preferences are missing', () => {
    window.localStorage.setItem('beskar:pwa:theme', 'dark')

    expect(getThemePreference()).toBe('dark')
  })

  it('normalizes invalid stored values back to system', () => {
    window.localStorage.setItem('beskar:pwa:preferences', JSON.stringify({
      version: 1,
      theme: 'sepia',
    }))

    expect(getThemePreference()).toBe('system')
  })

  it('writes structured preferences, removes the legacy key, and notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePreferences(listener)
    window.localStorage.setItem('beskar:pwa:theme', 'light')

    setThemePreference('dark')

    expect(JSON.parse(window.localStorage.getItem('beskar:pwa:preferences') ?? 'null')).toEqual({
      version: 1,
      theme: 'dark',
    })
    expect(window.localStorage.getItem('beskar:pwa:theme')).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })
})
