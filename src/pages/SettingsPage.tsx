import { useNavigate } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'
import { formatDuration } from '../lib/utils'

function SettingsPage() {
  const { server, session, setSession, setServer, playbackState, refreshOfflineBooks } = useAppContext()
  const navigate = useNavigate()

  return (
    <main className="screen settings-screen">
      <section className="screen-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Server and session</h1>
        </div>
      </section>
      <section className="card">
        <div className="settings-row">
          <span>Server</span>
          <strong>{server?.baseUrl}</strong>
        </div>
        <div className="settings-row">
          <span>User</span>
          <strong>{session?.user.username}</strong>
        </div>
        <div className="settings-row">
          <span>Resume point</span>
          <strong>{playbackState ? formatDuration(playbackState.currentTime) : 'None'}</strong>
        </div>
        <div className="button-row">
          <button
            className="ghost-button"
            onClick={() => {
              setSession(null)
              navigate('/login')
            }}
          >
            Sign out
          </button>
          <button
            className="ghost-button"
            onClick={() => {
              setSession(null)
              setServer(null)
              void refreshOfflineBooks()
              navigate('/')
            }}
          >
            Forget server
          </button>
        </div>
      </section>
      <section className="card">
        <p className="eyebrow">Reading</p>
        <h2>Reader support is live.</h2>
        <p className="muted">
          Beskar Shelf now supports both audiobook playback and server-hosted EPUB/PDF reading through the same login,
          library, and progress-sync model.
        </p>
      </section>
    </main>
  )
}

export default SettingsPage
