import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'

const proxyBase = import.meta.env.VITE_ABS_PROXY_BASE?.trim() ?? ''

export function SetupPage() {
  const { setServer } = useAppContext()
  const navigate = useNavigate()
  const [baseUrl, setBaseUrl] = useState('')

  return (
    <main className="screen setup-screen">
      <section className="hero-panel">
        <p className="eyebrow">Beskar Shelf</p>
        <h1>Spotify-style playback for your Audiobookshelf server.</h1>
        <p className="lede">
          Connect one self-hosted Audiobookshelf server, sync your position, and take books offline for flights,
          trains, and dead zones.
        </p>
      </section>

      <section className="card form-card">
        <h2>Connect your server</h2>
        <p className="muted">Enter the public URL that serves Audiobookshelf.</p>
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
