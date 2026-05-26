import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getRemainingTimeModePreference,
  getSkipSecondsPreference,
  getThemePreference,
  setRemainingTimeModePreference,
  setSkipSecondsPreference,
  setThemePreference,
  subscribePreferences,
} from './preferences'

describe('preferences', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('falls back to the legacy theme key when structured preferences are missing', () => {
    window.localStorage.setItem('beskar:pwa:theme', 'dark')

    expect(getThemePreference()).toBe('dark')
  })

  it('normalizes invalid stored values back to defaults', () => {
    window.localStorage.setItem('beskar:pwa:preferences', JSON.stringify({
      version: 1,
      theme: 'sepia',
      skipSeconds: 7,
      remainingTimeMode: 'bogus',
    }))

    expect(getThemePreference()).toBe('system')
    expect(getSkipSecondsPreference()).toBe(30)
    expect(getRemainingTimeModePreference()).toBe('book')
  })

  it('writes structured preferences, removes the legacy key, and notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePreferences(listener)
    window.localStorage.setItem('beskar:pwa:theme', 'light')

    setThemePreference('dark')

    expect(JSON.parse(window.localStorage.getItem('beskar:pwa:preferences') ?? 'null')).toEqual({
      version: 1,
      theme: 'dark',
      skipSeconds: 30,
      remainingTimeMode: 'book',
    })
    expect(window.localStorage.getItem('beskar:pwa:theme')).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('persists skip seconds and remaining-time mode independently of theme', () => {
    setThemePreference('dark')
    setSkipSecondsPreference(15)
    setRemainingTimeModePreference('elapsed')

    expect(getThemePreference()).toBe('dark')
    expect(getSkipSecondsPreference()).toBe(15)
    expect(getRemainingTimeModePreference()).toBe('elapsed')
  })

  it('clamps invalid skip seconds to the default', () => {
    setSkipSecondsPreference(15)
    setSkipSecondsPreference(7 as unknown as 15)
    expect(getSkipSecondsPreference()).toBe(30)
  })
})
