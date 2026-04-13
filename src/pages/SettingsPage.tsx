import { useNavigate } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'

function SettingsPage() {
  const { server, session, setSession, setServer, refreshOfflineBooks } = useAppContext()
  const navigate = useNavigate()

  return (
    <main className="screen settings-screen">
      <h1>Settings</h1>

      {/* Connection */}
      <section className="settings-group">
        <h3 className="settings-group-label">Connection</h3>
        <div className="settings-card">
          <div className="settings-item">
            <span className="settings-key">Server</span>
            <span className="settings-value">{server?.baseUrl}</span>
          </div>
          <div className="settings-divider" />
          <div className="settings-item">
            <span className="settings-key">User</span>
            <span className="settings-value">{session?.user.username}</span>
          </div>
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

      {/* About */}
      <p className="settings-footer">Beskar Shelf · Audiobooks & ebooks</p>
    </main>
  )
}

export default SettingsPage
