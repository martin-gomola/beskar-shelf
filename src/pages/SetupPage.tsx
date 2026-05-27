import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'
import { resolveServerMode } from '../lib/utils'

const proxyBase = import.meta.env.VITE_ABS_PROXY_BASE?.trim()
const dynamicProxyEnabled = import.meta.env.VITE_DYNAMIC_PROXY_ENABLED

export function SetupPage() {
  const { setServer } = useAppContext()
  const navigate = useNavigate()
  const [baseUrl, setBaseUrl] = useState(
    import.meta.env.VITE_DEFAULT_SERVER_URL?.trim() ?? '',
  )

  return (
    <main className="screen setup-screen">
      <section className="welcome-panel">
        <div className="brand-lockup brand-lockup-compact">
          <img
            className="brand-mark brand-mark-small"
            src="/pwa-icon.svg"
            alt=""
            aria-hidden="true"
          />
          <div>
            <h1>Beskar Shelf</h1>
            <p className="muted welcome-subline">Your audiobooks, anywhere.</p>
          </div>
        </div>
      </section>

      <section className="card form-card" style={{ width: '100%' }}>
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
              mode: resolveServerMode(proxyBase, dynamicProxyEnabled),
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
