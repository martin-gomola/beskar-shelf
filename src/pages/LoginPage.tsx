import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'

import { useAppContext } from '../contexts/AppContext'
import { AudiobookshelfClient } from '../lib/api'

export function LoginPage() {
  const { server, setSession, setServer } = useAppContext()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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

  return (
    <main className="screen auth-screen">
      <section className="card form-card" style={{ width: '100%' }}>
        <div className="auth-intro">
          <div className="brand-lockup brand-lockup-compact">
            <img className="brand-mark brand-mark-small" src="/pwa-icon.svg" alt="" aria-hidden="true" />
            <div>
              <p className="eyebrow">Server</p>
              <h2>{server?.baseUrl}</h2>
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
        <label className="field">
          <span>Username</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="primary-button" disabled={passwordMutation.isPending} onClick={() => passwordMutation.mutate()}>
          {passwordMutation.isPending ? 'Signing in...' : 'Sign in'}
        </button>
      </section>
    </main>
  )
}
