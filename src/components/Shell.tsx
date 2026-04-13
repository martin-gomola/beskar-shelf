import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'
import { usePlayerContext } from '../contexts/PlayerContext'
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate'
import { BottomNav } from './BottomNav'
import { MiniPlayer } from './MiniPlayer'

import { SetupPage } from '../pages/SetupPage'
import { LoginPage } from '../pages/LoginPage'
import { HomePage } from '../pages/HomePage'

const LibraryPage = lazy(() => import('../pages/LibraryPage').then((m) => ({ default: m.LibraryPage })))
const BookPage = lazy(() => import('../pages/BookPage').then((m) => ({ default: m.BookPage })))
const ReaderPage = lazy(() => import('../pages/ReaderPage'))
const PlayerPage = lazy(() => import('../pages/PlayerPage'))
const DownloadsPage = lazy(() => import('../pages/DownloadsPage'))
const SettingsPage = lazy(() => import('../pages/SettingsPage'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { server, session } = useAppContext()
  if (!server?.baseUrl) {
    return <Navigate to="/" replace />
  }
  if (!session) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<main className="screen"><section className="card"><p className="muted">Loading…</p></section></main>}>
      {children}
    </Suspense>
  )
}

export function Shell() {
  const { server, session } = useAppContext()
  const { activePlayback } = usePlayerContext()
  const { updateAvailable, reload } = useServiceWorkerUpdate()
  const location = useLocation()

  const needsSetup = !server?.baseUrl
  const needsLogin = Boolean(server?.baseUrl) && !session
  const publicRoute = location.pathname === '/' || location.pathname === '/login'

  if (needsSetup && location.pathname !== '/') {
    return <Navigate to="/" replace />
  }

  if (needsLogin && location.pathname !== '/login') {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="app-shell">
      {updateAvailable && (
        <div className="update-banner">
          <span>A new version is available</span>
          <button onClick={reload}>Reload</button>
        </div>
      )}

      <Routes>
        <Route path="/" element={needsSetup ? <SetupPage /> : <Navigate to="/home" replace />} />
        <Route path="/login" element={needsLogin ? <LoginPage /> : <Navigate to="/home" replace />} />
        <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/library/:libraryId" element={<ProtectedRoute><LazyRoute><LibraryPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/book/:itemId" element={<ProtectedRoute><LazyRoute><BookPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/read/:itemId" element={<ProtectedRoute><LazyRoute><ReaderPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/player" element={<ProtectedRoute><LazyRoute><PlayerPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/downloads" element={<ProtectedRoute><LazyRoute><DownloadsPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><LazyRoute><SettingsPage /></LazyRoute></ProtectedRoute>} />
      </Routes>

      {!publicRoute && <BottomNav />}
      {!publicRoute && activePlayback && <MiniPlayer />}
    </div>
  )
}
