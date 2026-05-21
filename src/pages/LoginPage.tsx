import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'

import { useAppContext } from '../contexts/AppContext'
import { AudiobookshelfClient } from '../lib/api'

// Optional prefill for public demo deployments. These values are inlined
// into the bundle at build time, so only ever set them to a published
// demo account (e.g. audiobooks.dev demo/demo), never real credentials.
const DEMO_USERNAME = import.meta.env.VITE_DEMO_USERNAME?.trim() ?? ''
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD?.trim() ?? ''
const HAS_DEMO_CREDENTIALS = Boolean(DEMO_USERNAME && DEMO_PASSWORD)

export function LoginPage() {
  const { server, setSession, setServer } = useAppContext()
  const navigate = useNavigate()
  const [username, setUsername] = useState(DEMO_USERNAME)
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [error, setError] = useState('')

  const passwordMutation = useMutation({
    mutationFn: async () => {
      const client = new AudiobookshelfClient(server, null)
      return client.login(username, password)
    },
    onSuccess: (nextSession) => {
      setSession(nextSession)
      navigate('/home')
    },
    onError: (failure) => {
      setError(failure instanceof Error ? failure.message : 'Login failed.')
    },
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (passwordMutation.isPending) return
    passwordMutation.mutate()
  }

  return (
    <main className="screen auth-screen">
      <section className="card form-card" style={{ width: '100%' }}>
        <div className="auth-intro">
          <div className="brand-lockup brand-lockup-compact">
            <img className="brand-mark brand-mark-small" src="/pwa-icon.svg" alt="" aria-hidden="true" />
            <div>
              <p className="eyebrow">Server</p>
              <h2 className="auth-server-url">{server?.baseUrl}</h2>
              <button
                type="button"
                className="link-inline-button"
                onClick={() => setServer(null)}
              >
                Change server
              </button>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field">
            <span>Username</span>
            <input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {HAS_DEMO_CREDENTIALS ? (
            <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              Demo account pre-filled — just press Sign in.
            </p>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
          <button
            type="submit"
            className="primary-button"
            disabled={passwordMutation.isPending}
          >
            {passwordMutation.isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
