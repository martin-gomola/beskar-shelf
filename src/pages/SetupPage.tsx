import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'

const proxyBase = import.meta.env.VITE_ABS_PROXY_BASE?.trim() ?? ''

export function SetupPage() {
  const { setServer } = useAppContext()
  const navigate = useNavigate()
  const [baseUrl, setBaseUrl] = useState(
    import.meta.env.VITE_DEFAULT_SERVER_URL?.trim()
      ?? (proxyBase ? window.location.origin : ''),
  )

  useEffect(() => {
    if (!proxyBase) return
    setServer({ baseUrl: window.location.origin, mode: 'proxy' })
    navigate('/login', { replace: true })
  }, [setServer, navigate])

  if (proxyBase) return null

  return (
    <main className="screen setup-screen">
      <section className="hero-panel welcome-panel">
        <div className="brand-lockup">
          <img className="brand-mark" src="/pwa-icon.svg" alt="" aria-hidden="true" />
          <div>
            <p className="eyebrow">Beskar Shelf</p>
            <h1>Your audiobooks,<br />anywhere.</h1>
          </div>
        </div>
      </section>

      <section className="card form-card" style={{ width: '100%' }}>
        <h2>Connect your server</h2>
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          Enter your Audiobookshelf server URL to get started.
        </p>
        <label className="field">
          <span>Server URL</span>
          <input
            type="url"
            placeholder="https://books.example.com"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>
        <button
          className="primary-button"
          onClick={() => {
            setServer({
              baseUrl: baseUrl.trim(),
              mode: 'direct',
            })
            navigate('/login')
          }}
        >
          Continue
        </button>
      </section>
    </main>
  )
}
