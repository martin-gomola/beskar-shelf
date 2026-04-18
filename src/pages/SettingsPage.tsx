import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate'
import { useTheme } from '../hooks/useTheme'
import { formatBytes, getOfflineBookBytes } from '../lib/utils'
import { APP_VERSION } from '../utils/version'

const THEME_OPTIONS = [
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
  { value: 'system' as const, label: 'System' },
]

function SettingsPage() {
  const { server, session, setSession, setServer, refreshBooks, refreshOfflineBooks, offlineBooks } = useAppContext()
  const { updateAvailable, reload, checkForUpdate } = useServiceWorkerUpdate()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [refreshingBooks, setRefreshingBooks] = useState(false)
  const [checkingForUpdate, setCheckingForUpdate] = useState(false)

  const offlineSummary = useMemo(() => {
    const downloaded = offlineBooks.filter((book) => book.status === 'downloaded')
    const totalBytes = downloaded.reduce((sum, book) => sum + getOfflineBookBytes(book), 0)
    return { count: downloaded.length, totalBytes }
  }, [offlineBooks])

  async function handleRefreshBooks() {
    setRefreshingBooks(true)
    try {
      await refreshBooks()
    } finally {
      setRefreshingBooks(false)
    }
  }

  async function handleCheckForUpdates() {
    if (updateAvailable) {
      reload()
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
        <p className="eyebrow">Shelf tuning</p>
        <h1>Settings</h1>
        <p className="muted">
          Adjust the vibe, refresh your catalog, and manage how this device stays connected.
        </p>
      </section>

      {/* Appearance */}
      <section className="settings-group">
        <h3 className="settings-group-label">Appearance</h3>
        <div className="settings-card">
          <div className="settings-item settings-item-stack">
            <div className="settings-copy">
              <span className="settings-key">Theme</span>
              <span className="settings-action-hint">Choose light, dark, or follow the device.</span>
            </div>
            <div className="theme-toggle">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`theme-toggle-btn${theme === opt.value ? ' active' : ''}`}
                  onClick={() => setTheme(opt.value)}
                >
                  {opt.label}
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
            <div className="settings-copy">
              <span className="settings-key">Server</span>
              <span className="settings-value">{server?.baseUrl}</span>
            </div>
          </div>
          <div className="settings-divider" />
          <div className="settings-item">
            <div className="settings-copy">
              <span className="settings-key">User</span>
              <span className="settings-value">{session?.user.username}</span>
            </div>
          </div>
          <div className="settings-divider" />
          <button
            className="settings-action"
            onClick={() => void handleRefreshBooks()}
            disabled={refreshingBooks}
          >
            <span>{refreshingBooks ? 'Refreshing books…' : 'Refresh books'}</span>
            <span className="settings-action-hint">Refetch your libraries and titles</span>
          </button>
          <div className="settings-divider" />
          <button
            className="settings-action"
            onClick={() => void handleCheckForUpdates()}
            disabled={checkingForUpdate}
          >
            <span>
              {updateAvailable
                ? 'Reload to update'
                : checkingForUpdate
                  ? 'Checking for updates…'
                  : 'Check for updates'}
            </span>
            <span className="settings-action-hint">
              {updateAvailable
                ? 'A new version is ready'
                : 'Ask the app to look for a newer version'}
            </span>
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
            <span>Offline books</span>
            <span className="settings-action-hint">
              {offlineSummary.count === 0
                ? 'No books downloaded yet'
                : `${offlineSummary.count} book${offlineSummary.count === 1 ? '' : 's'} · ${formatBytes(offlineSummary.totalBytes)}`}
            </span>
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
            <span>Sign out</span>
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
            <span>Forget server</span>
            <span className="settings-action-hint">Remove all local data</span>
          </button>
        </div>
      </section>

      <p className="settings-footer">Beskar Shelf v{APP_VERSION}</p>
    </main>
  )
}

export default SettingsPage
