import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'
import { useSkipSeconds } from '../hooks/usePlaybackPrefs'
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate'
import { useTheme } from '../hooks/useTheme'
import { SKIP_SECONDS_OPTIONS } from '../lib/preferences'
import { clearNetworkCaches } from '../lib/appStorage'
import { formatBytes, getOfflineBookBytes } from '../lib/utils'
import { APP_VERSION } from '../utils/version'

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
  { value: 'system' as const, label: 'System' },
]

type SettingsIconName =
  | 'theme'
  | 'skip'
  | 'server'
  | 'user'
  | 'refresh'
  | 'update'
  | 'stats'
  | 'downloads'
  | 'cache'
  | 'sign-out'
  | 'forget'

function SettingsIcon({ name, tone = 'neutral' }: { name: SettingsIconName, tone?: 'neutral' | 'accent' | 'gold' | 'danger' }) {
  const glyph = (() => {
    switch (name) {
      case 'theme':
        return <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></>
      case 'skip':
        return <><path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" /><path d="M4 4v4.68h4.68" /><path d="M10 9.5h2v5M15 9.5v5" /></>
      case 'server':
        return <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v7c0 1.66 3.13 3 7 3s7-1.34 7-3V5M5 12v7c0 1.66 3.13 3 7 3s7-1.34 7-3v-7" /></>
      case 'user':
        return <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>
      case 'refresh':
        return <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.6-1.9L20 8M4 16l2.3 1.9A7 7 0 0 0 17.9 16" /></>
      case 'update':
        return <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>
      case 'stats':
        return <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>
      case 'downloads':
        return <><path d="M12 3v11" /><path d="m7 9 5 5 5-5" /><path d="M5 18v3h14v-3" /></>
      case 'cache':
        return <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" /><path d="M10 11v6M14 11v6" /></>
      case 'sign-out':
        return <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>
      case 'forget':
        return <><path d="M9.5 14.5 7 17a3.54 3.54 0 0 1-5-5l3-3a3.54 3.54 0 0 1 5 0" /><path d="m14.5 9.5 2.5-2.5a3.54 3.54 0 0 1 5 5l-3 3a3.54 3.54 0 0 1-5 0M8 2l8 20" /></>
    }
  })()

  return (
    <span className={`settings-icon settings-icon-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {glyph}
      </svg>
    </span>
  )
}

function SettingsLeading({
  icon,
  title,
  value,
  tone,
}: {
  icon: SettingsIconName
  title: string
  value?: string | null
  tone?: 'neutral' | 'accent' | 'gold' | 'danger'
}) {
  return (
    <span className="settings-leading">
      <SettingsIcon name={icon} tone={tone} />
      <span className="settings-copy">
        <span className="settings-key">{title}</span>
        {value ? <span className="settings-value" title={value}>{value}</span> : null}
      </span>
    </span>
  )
}

function SettingsChevron() {
  return (
    <svg className="settings-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function SettingsPage() {
  const {
    server,
    session,
    setSession,
    setServer,
    refreshBooks,
    refreshOfflineBooks,
    offlineBooks,
    clearCachedBooks,
  } = useAppContext()
  const { updateAvailable, applyUpdate, checkForUpdate } = useServiceWorkerUpdate()
  const { theme, setTheme } = useTheme()
  const [skipSeconds, setSkipSeconds] = useSkipSeconds()
  const navigate = useNavigate()
  const [refreshingBooks, setRefreshingBooks] = useState(false)
  const [checkingForUpdate, setCheckingForUpdate] = useState(false)
  const [purgingCache, setPurgingCache] = useState(false)

  const offlineSummary = useMemo(() => {
    const downloaded = offlineBooks.filter((book) => book.status === 'downloaded')
    const totalBytes = downloaded.reduce((sum, book) => sum + getOfflineBookBytes(book), 0)
    return { count: downloaded.length, totalBytes }
  }, [offlineBooks])

  const cacheSummary = useMemo(() => {
    const cached = offlineBooks.filter((book) => book.source === 'cache')
    const totalBytes = cached.reduce((sum, book) => sum + getOfflineBookBytes(book), 0)
    return { count: cached.length, totalBytes }
  }, [offlineBooks])

  async function handleRefreshBooks() {
    setRefreshingBooks(true)
    try {
      await refreshBooks()
    } finally {
      setRefreshingBooks(false)
    }
  }

  async function handlePurgeCache() {
    if (purgingCache) return

    const detail = cacheSummary.count > 0
      ? `${cacheSummary.count} auto-cached book${cacheSummary.count === 1 ? '' : 's'} (${formatBytes(cacheSummary.totalBytes)})`
      : 'cached library data and covers'
    if (!window.confirm(`Purge ${detail}? Books you downloaded yourself are kept.`)) {
      return
    }

    setPurgingCache(true)
    try {
      await clearCachedBooks()
      await clearNetworkCaches()
      await refreshBooks()
    } finally {
      setPurgingCache(false)
    }
  }

  async function handleCheckForUpdates() {
    if (updateAvailable) {
      applyUpdate()
      return
    }

    setCheckingForUpdate(true)
    try {
      await checkForUpdate()
    } finally {
      setCheckingForUpdate(false)
    }
  }

  return (
    <main className="screen settings-screen">
      <section className="settings-hero card">
        <h1>Settings</h1>
      </section>

      {/* Appearance */}
      <section className="settings-group">
        <h3 className="settings-group-label">Appearance</h3>
        <div className="settings-card">
          <div className="settings-item settings-control-row">
            <SettingsLeading icon="theme" title="Theme" tone="gold" />
            <div className="theme-toggle" role="group" aria-label="Theme">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`theme-toggle-btn${theme === opt.value ? ' active' : ''}`}
                  onClick={() => setTheme(opt.value)}
                  aria-pressed={theme === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Playback */}
      <section className="settings-group">
        <h3 className="settings-group-label">Playback</h3>
        <div className="settings-card">
          <div className="settings-item settings-control-row">
            <SettingsLeading icon="skip" title="Skip interval" tone="accent" />
            <div className="theme-toggle" role="group" aria-label="Skip interval">
              {SKIP_SECONDS_OPTIONS.map((value) => (
                <button
                  key={value}
                  className={`theme-toggle-btn${skipSeconds === value ? ' active' : ''}`}
                  onClick={() => setSkipSeconds(value)}
                  aria-pressed={skipSeconds === value}
                >
                  {value}s
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Connection */}
      <section className="settings-group">
        <h3 className="settings-group-label">Connection</h3>
        <div className="settings-card">
          <div className="settings-item">
            <SettingsLeading icon="server" title="Server" value={server?.baseUrl} tone="accent" />
          </div>
          <div className="settings-divider" />
          <div className="settings-item">
            <SettingsLeading icon="user" title="User" value={session?.user.username} />
          </div>
          <div className="settings-divider" />
          <button
            className="settings-action"
            onClick={() => void handleRefreshBooks()}
            disabled={refreshingBooks}
            aria-busy={refreshingBooks}
          >
            <SettingsLeading icon="refresh" title={refreshingBooks ? 'Refreshing books…' : 'Refresh books'} tone="accent" />
          </button>
          <div className="settings-divider" />
          <button
            className="settings-action"
            onClick={() => void handleCheckForUpdates()}
            disabled={checkingForUpdate}
            aria-busy={checkingForUpdate}
          >
            <SettingsLeading
              icon="update"
              tone="gold"
              title={updateAvailable
                ? 'Update now'
                : checkingForUpdate
                  ? 'Checking for updates…'
                  : 'Check for updates'}
            />
          </button>
        </div>
      </section>

      {/* Activity */}
      <section className="settings-group">
        <h3 className="settings-group-label">Activity</h3>
        <div className="settings-card">
          <button
            className="settings-action"
            onClick={() => navigate('/stats')}
          >
            <SettingsLeading icon="stats" title="Listening stats" tone="gold" />
            <SettingsChevron />
          </button>
        </div>
      </section>

      {/* Storage */}
      <section className="settings-group">
        <h3 className="settings-group-label">Storage</h3>
        <div className="settings-card">
          <button
            className="settings-action"
            onClick={() => navigate('/downloads')}
          >
            <SettingsLeading
              icon="downloads"
              title="Offline books"
              tone="accent"
              value={offlineSummary.count === 0
                ? 'No books downloaded yet'
                : `${offlineSummary.count} book${offlineSummary.count === 1 ? '' : 's'} · ${formatBytes(offlineSummary.totalBytes)}`}
            />
            <span className="settings-trailing">
              <SettingsChevron />
            </span>
          </button>
          <div className="settings-divider" />
          <button
            className="settings-action"
            onClick={() => void handlePurgeCache()}
            disabled={purgingCache}
            aria-busy={purgingCache}
          >
            <SettingsLeading icon="cache" title={purgingCache ? 'Purging cache…' : 'Purge cache'} />
          </button>
        </div>
      </section>

      {/* Account actions */}
      <section className="settings-group">
        <h3 className="settings-group-label">Account</h3>
        <div className="settings-card">
          <button
            className="settings-action"
            onClick={() => {
              setSession(null)
              navigate('/login')
            }}
          >
            <SettingsLeading icon="sign-out" title="Sign out" />
            <span className="settings-action-hint">Keep server, clear session</span>
          </button>
          <div className="settings-divider" />
          <button
            className="settings-action settings-action-danger"
            onClick={() => {
              setSession(null)
              setServer(null)
              void refreshOfflineBooks()
              navigate('/')
            }}
          >
            <SettingsLeading icon="forget" title="Forget server" tone="danger" />
            <span className="settings-action-hint">Remove all local data</span>
          </button>
        </div>
      </section>

      <p className="settings-footer">Beskar Shelf v{APP_VERSION}</p>
    </main>
  )
}

export default SettingsPage
