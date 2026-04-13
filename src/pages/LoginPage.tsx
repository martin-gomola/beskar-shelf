import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'

import { useAppContext } from '../contexts/AppContext'
import { AudiobookshelfClient } from '../lib/api'

export function LoginPage() {
  const { server, setSession } = useAppContext()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiToken, setApiToken] = useState('')
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

  const tokenMutation = useMutation({
    mutationFn: async () => {
      const client = new AudiobookshelfClient(server, null)
      return client.loginWithToken(apiToken)
    },
    onSuccess: (nextSession) => {
      setSession(nextSession)
      navigate('/home')
    },
    onError: (failure) => {
      setError(failure instanceof Error ? failure.message : 'Token login failed.')
    },
  })

  return (
    <main className="screen auth-screen">
      <section className="card form-card">
        <p className="eyebrow">Server</p>
        <h1>{server?.baseUrl}</h1>
        <p className="muted">Sign in with your Audiobookshelf account.</p>
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
        <div className="token-divider">
          <span>or use an API token</span>
        </div>
        <label className="field">
          <span>API token</span>
          <textarea
            rows={4}
            value={apiToken}
            onChange={(event) => setApiToken(event.target.value)}
            placeholder="Paste an Audiobookshelf API token"
          />
        </label>
        <button className="ghost-button" disabled={tokenMutation.isPending} onClick={() => tokenMutation.mutate()}>
          {tokenMutation.isPending ? 'Validating token...' : 'Continue with token'}
        </button>
      </section>
    </main>
  )
}
