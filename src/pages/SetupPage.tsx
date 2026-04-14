import { useState } from 'react'
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

  return (
    <main className="screen setup-screen">
      <section className="hero-panel">
        <p className="eyebrow">Beskar Shelf</p>
        <h1>Your audiobooks,<br />anywhere.</h1>
      </section>

      <section className="card form-card" style={{ width: '100%' }}>
        <h2>Connect your server</h2>
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          {proxyBase
            ? 'Keep the current host if this Beskar Shelf deployment already proxies Audiobookshelf for you.'
            : 'Enter the public URL that serves Audiobookshelf.'}
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
              mode: proxyBase ? 'proxy' : 'direct',
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
