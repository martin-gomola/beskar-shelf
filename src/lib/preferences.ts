export type ThemeChoice = 'light' | 'dark' | 'system'
export type RemainingTimeMode = 'book' | 'track' | 'elapsed'

export const SKIP_SECONDS_OPTIONS = [10, 15, 30, 45, 60] as const
export type SkipSeconds = (typeof SKIP_SECONDS_OPTIONS)[number]

const DEFAULT_SKIP_SECONDS: SkipSeconds = 30
const DEFAULT_REMAINING_MODE: RemainingTimeMode = 'book'

interface PreferencesState {
  version: 1
  theme: ThemeChoice
  skipSeconds: SkipSeconds
  remainingTimeMode: RemainingTimeMode
}

const LEGACY_THEME_KEY = 'beskar:pwa:theme'
const PREFERENCES_KEY = 'beskar:pwa:preferences'
const PREFERENCES_VERSION = 1
const DEFAULT_PREFERENCES: PreferencesState = {
  version: PREFERENCES_VERSION,
  theme: 'system',
  skipSeconds: DEFAULT_SKIP_SECONDS,
  remainingTimeMode: DEFAULT_REMAINING_MODE,
}

function normalizeThemeChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

function normalizeSkipSeconds(value: unknown): SkipSeconds {
  return (SKIP_SECONDS_OPTIONS as readonly number[]).includes(value as number)
    ? (value as SkipSeconds)
    : DEFAULT_SKIP_SECONDS
}

function normalizeRemainingTimeMode(value: unknown): RemainingTimeMode {
  return value === 'book' || value === 'track' || value === 'elapsed'
    ? value
    : DEFAULT_REMAINING_MODE
}

function readPreferences(): PreferencesState {
  try {
    const rawPreferences = window.localStorage.getItem(PREFERENCES_KEY)
    if (rawPreferences) {
      const parsed = JSON.parse(rawPreferences) as Partial<PreferencesState> | null
      return {
        version: PREFERENCES_VERSION,
        theme: normalizeThemeChoice(parsed?.theme),
        skipSeconds: normalizeSkipSeconds(parsed?.skipSeconds),
        remainingTimeMode: normalizeRemainingTimeMode(parsed?.remainingTimeMode),
      }
    }

    const legacyTheme = window.localStorage.getItem(LEGACY_THEME_KEY)
    return {
      ...DEFAULT_PREFERENCES,
      theme: normalizeThemeChoice(legacyTheme),
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function writePreferences(next: PreferencesState) {
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next))
    window.localStorage.removeItem(LEGACY_THEME_KEY)
  } catch {
    // localStorage can be unavailable in private browsing or test shims
  }
}

let listeners: Array<() => void> = []

export function subscribePreferences(listener: () => void) {
  listeners.push(listener)
  return () => {
    listeners = listeners.filter((entry) => entry !== listener)
  }
}

function emitChange() {
  listeners.forEach((listener) => listener())
}

export function getThemePreference(): ThemeChoice {
  return readPreferences().theme
}

export function setThemePreference(theme: ThemeChoice) {
  const current = readPreferences()
  writePreferences({
    ...current,
    theme: normalizeThemeChoice(theme),
  })
  emitChange()
}

export function getSkipSecondsPreference(): SkipSeconds {
  return readPreferences().skipSeconds
}

export function setSkipSecondsPreference(skipSeconds: SkipSeconds) {
  const current = readPreferences()
  writePreferences({
    ...current,
    skipSeconds: normalizeSkipSeconds(skipSeconds),
  })
  emitChange()
}

export function getRemainingTimeModePreference(): RemainingTimeMode {
  return readPreferences().remainingTimeMode
}

export function setRemainingTimeModePreference(mode: RemainingTimeMode) {
  const current = readPreferences()
  writePreferences({
    ...current,
    remainingTimeMode: normalizeRemainingTimeMode(mode),
  })
  emitChange()
}
