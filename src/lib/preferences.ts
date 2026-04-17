export type ThemeChoice = 'light' | 'dark' | 'system'

interface PreferencesState {
  version: 1
  theme: ThemeChoice
}

const LEGACY_THEME_KEY = 'beskar:pwa:theme'
const PREFERENCES_KEY = 'beskar:pwa:preferences'
const PREFERENCES_VERSION = 1
const DEFAULT_PREFERENCES: PreferencesState = {
  version: PREFERENCES_VERSION,
  theme: 'system',
}

function normalizeThemeChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

function readPreferences(): PreferencesState {
  try {
    const rawPreferences = window.localStorage.getItem(PREFERENCES_KEY)
    if (rawPreferences) {
      const parsed = JSON.parse(rawPreferences) as Partial<PreferencesState> | null
      return {
        version: PREFERENCES_VERSION,
        theme: normalizeThemeChoice(parsed?.theme),
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
  writePreferences({
    version: PREFERENCES_VERSION,
    theme: normalizeThemeChoice(theme),
  })
  emitChange()
}
