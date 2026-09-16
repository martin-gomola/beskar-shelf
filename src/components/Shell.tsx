import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'
import { usePlayerContext } from '../contexts/PlayerContext'
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate'
import { useTheme } from '../hooks/useTheme'
import { BottomNav } from './BottomNav'
import { MiniPlayer } from './MiniPlayer'
import { PullToRefresh } from './PullToRefresh'

import { SetupPage } from '../pages/SetupPage'
import { LoginPage } from '../pages/LoginPage'
import { HomePage } from '../pages/HomePage'

const LibraryPage = lazy(() => import('../pages/LibraryPage').then((m) => ({ default: m.LibraryPage })))
const BookPage = lazy(() => import('../pages/BookPage').then((m) => ({ default: m.BookPage })))
const ReaderPage = lazy(() => import('../pages/ReaderPage'))
const PlayerPage = lazy(() => import('../pages/PlayerPage'))
const DownloadsPage = lazy(() => import('../pages/DownloadsPage'))
const SettingsPage = lazy(() => import('../pages/SettingsPage'))
const StatsPage = lazy(() => import('../pages/StatsPage'))

function ProtectedRoute({ children, allowOffline = false }: { children: React.ReactNode, allowOffline?: boolean }) {
  const { server, session } = useAppContext()
  if (!server?.baseUrl && !allowOffline) {
    return <Navigate to="/" replace />
  }
  if (!session && !allowOffline) {
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
  const { server, session, playbackState, offlineBooks, offlineBooksLoaded, refreshBooks, refreshOfflineBooks } = useAppContext()
  const { activePlayback, isPlaying } = usePlayerContext()
  const { updateAvailable, applyUpdate, checkForUpdate } = useServiceWorkerUpdate()
  useTheme()
  const location = useLocation()

  const offlineItemId = location.pathname.match(/^\/(?:book|read)\/([^/]+)$/)?.[1]
  const offlineRoute = location.pathname === '/downloads'
    || location.pathname === '/player'
    || location.pathname === '/home' && !session
    || Boolean(offlineItemId)
  const hasOfflineRouteData = offlineBooks.some((book) => book.itemId === offlineItemId)
    || (location.pathname === '/player' && Boolean(playbackState))
  const offlineRoutePending = offlineRoute && !offlineBooksLoaded && !session
  const canUseOffline = offlineRoutePending || hasOfflineRouteData || location.pathname === '/downloads' || offlineBooks.length > 0
  const needsSetup = !server?.baseUrl && !canUseOffline
  const needsLogin = Boolean(server?.baseUrl) && !session && !canUseOffline
  const publicRoute = location.pathname === '/' || location.pathname === '/login'
  const pullRefreshDisabled = publicRoute || location.pathname.startsWith('/read/')

  useEffect(() => {
    if (isPlaying) return
    const section = location.pathname.split('/')[1]
    const routeTitle = {
      home: 'Home',
      library: 'Library',
      book: 'Book',
      read: 'Reader',
      player: 'Player',
      downloads: 'Downloads',
      settings: 'Settings',
      stats: 'Listening stats',
      login: 'Sign in',
    }[section]
    document.title = routeTitle ? `${routeTitle} · Beskar Shelf` : 'Beskar Shelf'
  }, [isPlaying, location.pathname])

  async function refreshApp() {
    await Promise.all([
      refreshBooks(),
      refreshOfflineBooks(),
      checkForUpdate(),
    ])
  }

  if (needsSetup && location.pathname !== '/') {
    return <Navigate to="/" replace />
  }

  if (needsLogin && location.pathname !== '/login') {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="app-shell">
      <PullToRefresh disabled={pullRefreshDisabled} onRefresh={refreshApp} />

      {updateAvailable && (
        <div className="update-banner">
          <span>A new version is available</span>
          <button onClick={applyUpdate}>Update now</button>
        </div>
      )}

      <Routes>
        <Route path="/" element={needsSetup ? <SetupPage /> : <Navigate to="/home" replace />} />
        <Route path="/login" element={needsLogin ? <LoginPage /> : <Navigate to="/home" replace />} />
        <Route path="/home" element={<ProtectedRoute allowOffline={canUseOffline}><HomePage /></ProtectedRoute>} />
        <Route path="/library/:libraryId" element={<ProtectedRoute><LazyRoute><LibraryPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/book/:itemId" element={<ProtectedRoute allowOffline={canUseOffline}><LazyRoute><BookPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/read/:itemId" element={<ProtectedRoute allowOffline={canUseOffline}><LazyRoute><ReaderPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/player" element={<ProtectedRoute allowOffline={canUseOffline}><LazyRoute><PlayerPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/downloads" element={<ProtectedRoute allowOffline><LazyRoute><DownloadsPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><LazyRoute><SettingsPage /></LazyRoute></ProtectedRoute>} />
        <Route path="/stats" element={<ProtectedRoute><LazyRoute><StatsPage /></LazyRoute></ProtectedRoute>} />
      </Routes>

      {!publicRoute && <BottomNav />}
      {/* Hide the mini-player on the full Player page itself: it would link
          back to the page the user is already on and just doubles the
          identity (cover + title appear twice). The :has() rules in the
          stylesheet shrink the app-shell's bottom padding when no
          mini-player is rendered, so the page reclaims that space. */}
      {!publicRoute && location.pathname !== '/player' && (activePlayback || playbackState) && <MiniPlayer />}
    </div>
  )
}
