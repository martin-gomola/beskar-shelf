import {
  createContext,
  startTransition,
  useContext,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import clsx from 'clsx'
import ePub from 'epubjs'

import { AudiobookshelfClient } from './lib/api'
import { downloadBook } from './lib/downloads'
import {
  deleteOfflineBook,
  getOfflineBook,
  listOfflineBooks,
  loadPlaybackState,
  loadServerConfig,
  loadUserSession,
  savePlaybackState,
  saveServerConfig,
  saveUserSession,
} from './lib/storage'
import type {
  AudioTrack,
  BookItem,
  OfflineBook,
  PlaybackSession,
  PersistedPlaybackState,
  ProgressPayload,
  ServerConfig,
  UserSession,
} from './lib/types'
import { clamp, formatDuration, formatProgress } from './lib/utils'

const proxyBase = import.meta.env.VITE_ABS_PROXY_BASE?.trim() ?? ''

interface ActivePlayback {
  item: BookItem
  session: PlaybackSession
  sources: string[]
  trackIndex: number
  duration: number
}

interface AppContextValue {
  server: ServerConfig | null
  setServer: (server: ServerConfig | null) => void
  session: UserSession | null
  setSession: (session: UserSession | null) => void
  client: AudiobookshelfClient
  offlineBooks: OfflineBook[]
  refreshOfflineBooks: () => Promise<void>
  activePlayback: ActivePlayback | null
  playbackState: PersistedPlaybackState | null
  playbackTime: number
  isPlaying: boolean
  playbackRate: number
  currentTrackDuration: number
  startBook: (item: BookItem) => Promise<void>
  togglePlayback: () => Promise<void>
  seekTo: (seconds: number) => void
  seekBy: (delta: number) => void
  setPlaybackRate: (rate: number) => void
  jumpToTrack: (index: number) => void
  downloadCurrentBook: (item: BookItem) => Promise<void>
  removeOfflineBook: (itemId: string) => Promise<void>
  audioRef: React.RefObject<HTMLAudioElement | null>
}

const AppContext = createContext<AppContextValue | null>(null)

function useAppContext() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('App context is not available.')
  }
  return context
}

function useRequiredParams<T extends Record<string, string>>() {
  return useParams() as T
}

function trackForTime(tracks: AudioTrack[], currentTime: number) {
  const target = clamp(currentTime, 0, Math.max(currentTime, tracks.at(-1)?.startOffset ?? 0))
  const found = tracks.findIndex((track) => {
    const end = track.startOffset + track.duration
    return target >= track.startOffset && target < end
  })
  return found === -1 ? 0 : found
}

function totalTimeFromTrack(activePlayback: ActivePlayback | null, audioTime: number) {
  if (!activePlayback) {
    return 0
  }

  const track = activePlayback.session.audioTracks[activePlayback.trackIndex]
  return (track?.startOffset ?? 0) + audioTime
}

function compactDescription(text: string) {
  return text.trim().replace(/\s+/g, ' ')
}

function useLibraries() {
  const { client, session } = useAppContext()
  return useQuery({
    queryKey: ['libraries', session?.user.id, client.hasServer()],
    queryFn: () => client.getLibraries(),
    enabled: client.hasServer() && client.hasSession(),
  })
}

function usePrimaryLibrary() {
  const librariesQuery = useLibraries()
  const primary = librariesQuery.data?.find((library) => library.audiobooksOnly)
    ?? librariesQuery.data?.[0]
  return { librariesQuery, primary }
}

function App() {
  const [server, setServerState] = useState<ServerConfig | null>(() => loadServerConfig())
  const [session, setSessionState] = useState<UserSession | null>(() => loadUserSession())
  const [activePlayback, setActivePlayback] = useState<ActivePlayback | null>(null)
  const [playbackState, setPlaybackState] = useState<PersistedPlaybackState | null>(() => loadPlaybackState())
  const [playbackTime, setPlaybackTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRateState] = useState(1)
  const [currentTrackDuration, setCurrentTrackDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const client = useMemo(() => new AudiobookshelfClient(server, session), [server, session])
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const offlineBooksQuery = useQuery({
    queryKey: ['offline-books'],
    queryFn: listOfflineBooks,
  })
  const offlineBooks = offlineBooksQuery.data ?? []

  function setServer(next: ServerConfig | null) {
    setServerState(next)
    saveServerConfig(next)
  }

  function setSession(next: UserSession | null) {
    setSessionState(next)
    saveUserSession(next)
  }

  async function refreshOfflineBooks() {
    await queryClient.invalidateQueries({ queryKey: ['offline-books'] })
  }

  async function createSourcesForItem(itemId: string, sessionValue: PlaybackSession) {
    const offline = await getOfflineBook(itemId)
    if (offline?.status === 'downloaded') {
      return sessionValue.audioTracks.map((track) => {
        const stored = offline.tracks.find((savedTrack) => savedTrack.trackIndex === track.index)
        if (!stored) {
          return client.streamUrl(track.contentUrl)
        }
        return URL.createObjectURL(stored.blob)
      })
    }

    return sessionValue.audioTracks.map((track) => client.streamUrl(track.contentUrl))
  }

  async function startBook(item: BookItem) {
    const playbackSession = await client.startPlayback(item.id)
    const sources = await createSourcesForItem(item.id, playbackSession)
    const initialTime = item.currentTime || playbackState?.itemId === item.id
      ? playbackState?.currentTime ?? item.currentTime
      : item.currentTime
    const initialTrackIndex = trackForTime(playbackSession.audioTracks, initialTime)
    const nextPlayback: ActivePlayback = {
      item,
      session: playbackSession,
      sources,
      trackIndex: initialTrackIndex,
      duration: playbackSession.duration,
    }

    setActivePlayback((current) => {
      current?.sources.forEach((source) => {
        if (source.startsWith('blob:')) {
          URL.revokeObjectURL(source)
        }
      })
      return nextPlayback
    })
    setPlaybackRateState(playbackState?.itemId === item.id ? playbackState.rate : 1)
    setPlaybackState({
      itemId: item.id,
      sessionId: playbackSession.id,
      currentTime: initialTime,
      duration: playbackSession.duration,
      rate: playbackState?.itemId === item.id ? playbackState.rate : 1,
      updatedAt: Date.now(),
    })
    startTransition(() => navigate('/player'))
  }

  async function togglePlayback() {
    if (!audioRef.current) {
      return
    }

    if (audioRef.current.paused) {
      try {
        await audioRef.current.play()
      } catch {
        // Browser blocked autoplay — state stays paused via the 'play' event listener
      }
      return
    }

    audioRef.current.pause()
  }

  function seekTo(seconds: number) {
    if (!activePlayback || !audioRef.current) {
      return
    }

    const clamped = clamp(seconds, 0, activePlayback.duration)
    const nextTrackIndex = trackForTime(activePlayback.session.audioTracks, clamped)
    const track = activePlayback.session.audioTracks[nextTrackIndex]
    setActivePlayback({ ...activePlayback, trackIndex: nextTrackIndex })
    audioRef.current.src = activePlayback.sources[nextTrackIndex]
    audioRef.current.currentTime = clamped - track.startOffset
  }

  function seekBy(delta: number) {
    seekTo(playbackTime + delta)
  }

  function setPlaybackRate(rate: number) {
    setPlaybackRateState(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
    setPlaybackState((current) => {
      if (!current) {
        return current
      }
      const next = { ...current, rate, updatedAt: Date.now() }
      savePlaybackState(next)
      return next
    })
  }

  function jumpToTrack(index: number) {
    if (!activePlayback || !audioRef.current) {
      return
    }
    const track = activePlayback.session.audioTracks[index]
    if (!track) {
      return
    }

    setActivePlayback({ ...activePlayback, trackIndex: index })
    audioRef.current.src = activePlayback.sources[index]
    audioRef.current.currentTime = 0
    void audioRef.current.play()
  }

  async function downloadCurrentBook(item: BookItem) {
    await downloadBook(client, item, async () => {
      await refreshOfflineBooks()
    })
    await refreshOfflineBooks()
  }

  async function removeOfflineBook(itemId: string) {
    await deleteOfflineBook(itemId)
    await refreshOfflineBooks()
  }

  const commitProgress = useEffectEvent(async (isFinished = false) => {
    if (!activePlayback || !session) {
      return
    }

    const payload: ProgressPayload = {
      duration: activePlayback.duration,
      progress: activePlayback.duration > 0 ? clamp(playbackTime / activePlayback.duration, 0, 1) : 0,
      currentTime: playbackTime,
      isFinished,
      startedAt: playbackState?.updatedAt ?? Date.now(),
      finishedAt: isFinished ? Date.now() : null,
    }

    setPlaybackState(() => {
      const next = {
        itemId: activePlayback.item.id,
        sessionId: activePlayback.session.id,
        currentTime: payload.currentTime,
        duration: payload.duration,
        rate: playbackRate,
        updatedAt: Date.now(),
      }
      savePlaybackState(next)
      return next
    })

    try {
      await client.updateProgress(activePlayback.item.id, payload)
      await queryClient.invalidateQueries({ queryKey: ['item', activePlayback.item.id] })
      await queryClient.invalidateQueries({ queryKey: ['personalized'] })
    } catch (error) {
      console.error(error)
    }
  })

  useEffect(() => {
    if (!activePlayback || !audioRef.current) {
      return
    }

    const audio = audioRef.current
    const currentSource = activePlayback.sources[activePlayback.trackIndex]
    if (audio.src !== currentSource) {
      audio.src = currentSource
      audio.currentTime = Math.max(
        0,
        (playbackState?.itemId === activePlayback.item.id ? playbackState.currentTime : activePlayback.item.currentTime)
          - (activePlayback.session.audioTracks[activePlayback.trackIndex]?.startOffset ?? 0),
      )
    }

    audio.playbackRate = playbackRate

    const onPlay = () => setIsPlaying(true)
    const onPause = () => {
      setIsPlaying(false)
      void commitProgress(false)
    }
    const onLoaded = () => setCurrentTrackDuration(audio.duration || 0)
    const onTimeUpdate = () => setPlaybackTime(totalTimeFromTrack(activePlayback, audio.currentTime))
    const onEnded = () => {
      const nextIndex = activePlayback.trackIndex + 1
      if (nextIndex < activePlayback.sources.length) {
        const next = { ...activePlayback, trackIndex: nextIndex }
        setActivePlayback(next)
        audio.src = next.sources[nextIndex]
        audio.currentTime = 0
        void audio.play()
        return
      }

      setIsPlaying(false)
      void commitProgress(true)
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)

    void audio.play().catch(() => undefined)

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
    }
  // playbackState intentionally excluded — it is only read for the initial
  // currentTime when src changes.  Including it would re-run the effect
  // (and call audio.play()) every time commitProgress updates the state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayback, playbackRate])

  useEffect(() => {
    if (!activePlayback) {
      return
    }

    const interval = window.setInterval(() => {
      void commitProgress(false)
    }, 15000)

    const handleVisibility = () => {
      if (document.hidden) {
        void commitProgress(false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [activePlayback])

  useEffect(() => {
    return () => {
      activePlayback?.sources.forEach((source) => {
        if (source.startsWith('blob:')) {
          URL.revokeObjectURL(source)
        }
      })
    }
  }, [activePlayback])

  const restorePlayback = useEffectEvent(async () => {
    if (!playbackState || activePlayback) {
      return
    }

    try {
      const item = await client.getItem(playbackState.itemId)
      await startBook(item)
      if (audioRef.current) {
        audioRef.current.currentTime = playbackState.currentTime
      }
    } catch (error) {
      console.error(error)
    }
  })

  useEffect(() => {
    if (!client.hasSession() || !playbackState || activePlayback) {
      return
    }

    void restorePlayback()
  }, [activePlayback, client, playbackState])

  const contextValue: AppContextValue = {
    server,
    setServer,
    session,
    setSession,
    client,
    offlineBooks,
    refreshOfflineBooks,
    activePlayback,
    playbackState,
    playbackTime,
    isPlaying,
    playbackRate,
    currentTrackDuration,
    startBook,
    togglePlayback,
    seekTo,
    seekBy,
    setPlaybackRate,
    jumpToTrack,
    downloadCurrentBook,
    removeOfflineBook,
    audioRef,
  }

  return (
    <AppContext.Provider value={contextValue}>
      <audio ref={audioRef} preload="metadata" />
      <Shell />
    </AppContext.Provider>
  )
}

function QueryState({
  isPending,
  error,
  children,
}: {
  isPending: boolean
  error: Error | null
  children: React.ReactNode
}) {
  if (isPending) {
    return <section className="card"><p className="muted">Loading…</p></section>
  }

  if (error) {
    return (
      <section className="card">
        <h2>Request failed</h2>
        <p className="muted">{error.message}</p>
      </section>
    )
  }

  return <>{children}</>
}

function Shell() {
  const { server, session, activePlayback } = useAppContext()
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
      <Routes>
        <Route path="/" element={needsSetup ? <SetupPage /> : <Navigate to="/home" replace />} />
        <Route path="/login" element={needsLogin ? <LoginPage /> : <Navigate to="/home" replace />} />
        <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
        <Route path="/library/:libraryId" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
        <Route path="/book/:itemId" element={<ProtectedRoute><BookPage /></ProtectedRoute>} />
        <Route path="/read/:itemId" element={<ProtectedRoute><ReaderPage /></ProtectedRoute>} />
        <Route path="/player" element={<ProtectedRoute><PlayerPage /></ProtectedRoute>} />
        <Route path="/downloads" element={<ProtectedRoute><DownloadsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      </Routes>

      {!publicRoute && <BottomNav />}
      {!publicRoute && activePlayback && <MiniPlayer />}
    </div>
  )
}

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

function SetupPage() {
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

function LoginPage() {
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

function HomePage() {
  const { librariesQuery, primary } = usePrimaryLibrary()
  const { client, playbackState } = useAppContext()
  const personalizedQuery = useQuery({
    queryKey: ['personalized', primary?.id],
    queryFn: () => client.getPersonalized(primary!.id),
    enabled: Boolean(primary?.id),
  })

  return (
    <main className="screen home-screen">
      <section className="screen-header">
        <div>
          <p className="eyebrow">Home</p>
          <h1>Pick up where you left off.</h1>
        </div>
        {primary ? <Link className="ghost-button" to={`/library/${primary.id}`}>Browse library</Link> : null}
      </section>

      <section className="library-pills">
        {(librariesQuery.data ?? []).map((library) => (
          <Link key={library.id} className="pill-link" to={`/library/${library.id}`}>
            {library.name}
            {library.audiobooksOnly ? ' • Listen' : ' • Read'}
          </Link>
        ))}
      </section>

      {playbackState ? (
        <section className="resume-banner card">
          <p className="eyebrow">Resume</p>
          <p>{formatDuration(playbackState.currentTime)} listened recently.</p>
          <Link className="primary-button" to="/player">Open player</Link>
        </section>
      ) : null}

      <QueryState
        isPending={personalizedQuery.isPending}
        error={personalizedQuery.error as Error | null}
      >
        <ShelfSection title="Your library" shelves={personalizedQuery.data ?? []} />
      </QueryState>
    </main>
  )
}

function ShelfSection({ title, shelves }: { title: string; shelves: { id: string; label: string; entities: BookItem[] }[] }) {
  return (
    <section className="shelf-section">
      <div className="section-heading">
        <h2>{title}</h2>
      </div>
      {shelves.map((shelf) => (
        <div key={shelf.id} className="shelf-block">
          <div className="section-heading">
            <h3>{shelf.label}</h3>
          </div>
          <div className="cover-row">
            {shelf.entities.slice(0, 8).map((item) => (
              <BookCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

function BookCard({ item }: { item: BookItem }) {
  const { client } = useAppContext()
  return (
    <Link className="book-card" to={`/book/${item.id}`}>
      <div
        className="cover"
        style={{ backgroundImage: item.coverPath ? `url(${client.assetUrl(item.coverPath)})` : undefined }}
      />
      <strong>{item.title}</strong>
      <span>{item.author}</span>
    </Link>
  )
}

function LibraryPage() {
  const { libraryId } = useRequiredParams<{ libraryId: string }>()
  const { client } = useAppContext()
  const { librariesQuery } = usePrimaryLibrary()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const query = useQuery({
    queryKey: ['library', libraryId],
    queryFn: () => client.getLibraryItems(libraryId),
  })

  const filtered = (query.data ?? []).filter((item) => {
    const haystack = `${item.title} ${item.author}`.toLowerCase()
    return haystack.includes(deferredSearch.toLowerCase())
  })
  const libraryName = librariesQuery.data?.find((library) => library.id === libraryId)?.name ?? 'Library'

  return (
    <main className="screen library-screen">
      <section className="screen-header">
        <div>
          <p className="eyebrow">Library</p>
          <h1>{libraryName}</h1>
        </div>
      </section>
      <section className="library-pills">
        {(librariesQuery.data ?? []).map((library) => (
          <Link
            key={library.id}
            className={clsx('pill-link', { active: library.id === libraryId })}
            to={`/library/${library.id}`}
          >
            {library.name}
          </Link>
        ))}
      </section>
      <label className="field search-field">
        <span>Search</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Author or title" />
      </label>
      <QueryState isPending={query.isPending} error={query.error as Error | null}>
        <section className="book-grid">
          {filtered.map((item) => (
            <BookCard key={item.id} item={item} />
          ))}
        </section>
      </QueryState>
    </main>
  )
}

function BookPage() {
  const { itemId } = useRequiredParams<{ itemId: string }>()
  const { client, startBook, downloadCurrentBook, offlineBooks } = useAppContext()
  const query = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => client.getItem(itemId),
  })
  const item = query.data
  const offline = offlineBooks.find((book) => book.itemId === itemId)
  const canPlay = item ? item.audioTracks.length > 0 || item.duration > 0 : false
  const canRead = item ? Boolean(item.ebookFormat) : false

  if (query.isPending) {
    return <main className="screen"><section className="card"><p className="muted">Loading…</p></section></main>
  }

  if (query.error || !item) {
    return (
      <main className="screen">
        <section className="card">
          <h2>Book unavailable</h2>
          <p className="muted">{(query.error as Error | null)?.message ?? 'The item could not be loaded.'}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="screen book-screen">
      <section className="book-hero">
        <div
          className="cover cover-large"
          style={{ backgroundImage: item.coverPath ? `url(${client.assetUrl(item.coverPath)})` : undefined }}
        />
        <div className="book-meta">
          <p className="eyebrow">Book</p>
          <h1>{item.title}</h1>
          <p className="author-line">{item.author}</p>
          <p className="muted">
            {canPlay ? `${formatDuration(item.duration)} total` : 'Reading item'}
            {item.ebookFormat ? ` • ${item.ebookFormat.toUpperCase()} available on server` : ''}
          </p>
          <div className="button-row">
            {canPlay ? (
              <button className="primary-button" onClick={() => void startBook(item)}>
                {item.currentTime > 0 ? `Resume from ${formatDuration(item.currentTime)}` : 'Play now'}
              </button>
            ) : null}
            {canRead ? (
              <Link className={clsx(canPlay ? 'ghost-button' : 'primary-button')} to={`/read/${item.id}`}>
                {item.ebookLocation ? 'Resume reading' : 'Read now'}
              </Link>
            ) : null}
            {canPlay ? (
              <button className="ghost-button" onClick={() => void downloadCurrentBook(item)}>
                {offline?.status === 'downloaded' ? 'Redownload' : 'Download offline'}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="stats-row">
          <div>
            <span className="stat-label">Progress</span>
            <strong>{formatProgress(item.progress)}</strong>
          </div>
          <div>
            <span className="stat-label">{canPlay ? 'Chapters' : 'Reader'}</span>
            <strong>{canPlay ? item.chapters.length : item.ebookFormat?.toUpperCase()}</strong>
          </div>
          <div>
            <span className="stat-label">{canPlay ? 'Offline' : 'Reading progress'}</span>
            <strong>{canPlay ? (offline?.status === 'downloaded' ? 'Ready' : 'Streaming') : formatProgress(item.ebookProgress)}</strong>
          </div>
        </div>
        <p>{compactDescription(item.description) || 'No description from Audiobookshelf.'}</p>
      </section>

      {canPlay ? <section className="card">
        <div className="section-heading">
          <h2>Chapters</h2>
        </div>
        <div className="chapter-list">
          {item.chapters.length > 0 ? item.chapters.map((chapter) => (
            <div key={chapter.id} className="chapter-row">
              <strong>{chapter.title}</strong>
              <span>{formatDuration(chapter.start)}</span>
            </div>
          )) : <p className="muted">No chapter markers on this item.</p>}
        </div>
      </section> : null}
    </main>
  )
}

function ReaderPage() {
  const { itemId } = useRequiredParams<{ itemId: string }>()
  const { client } = useAppContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [locationLabel, setLocationLabel] = useState('')
  const [readerProgress, setReaderProgress] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [readerApi, setReaderApi] = useState<{ next: () => void; prev: () => void } | null>(null)
  const query = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => client.getItem(itemId),
  })
  const item = query.data
  const isPdf = item?.ebookFormat === 'pdf'

  const commitReaderProgress = useEffectEvent(async (payload: { cfi: string; progress: number }) => {
    if (!item) {
      return
    }

    try {
      await client.updateProgress(item.id, {
        duration: item.duration,
        progress: item.progress,
        currentTime: item.currentTime,
        isFinished: item.isFinished,
        ebookLocation: payload.cfi,
        ebookProgress: payload.progress,
        startedAt: Date.now(),
      })
      await queryClient.invalidateQueries({ queryKey: ['item', item.id] })
    } catch (error) {
      console.error(error)
    }
  })

  useEffect(() => {
    const isPdfFormat = item?.ebookFormat === 'pdf'
    if (!item || !containerRef.current || !item.ebookFormat || isPdfFormat) {
      return
    }

    let cancelled = false
    let book: ReturnType<typeof ePub> | null = null
    let rendition: ReturnType<ReturnType<typeof ePub>['renderTo']> | null = null

    void (async () => {
      const response = await fetch(client.ebookUrl(item.id))
      const epubBuffer = await response.arrayBuffer()
      if (cancelled) {
        return
      }

      book = ePub(epubBuffer)
      rendition = book.renderTo(containerRef.current!, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
      })
      const readyBook = book
      const readyRendition = rendition

      await readyBook.ready
      await readyBook.locations.generate(1200)
      if (cancelled) {
        return
      }

      readyRendition.themes.default({
        body: {
          background: '#f5efe4',
          color: '#1f1a15',
          'font-family': 'Georgia, serif',
          'line-height': '1.7',
        },
      })

      readyRendition.on('relocated', (location: { start?: { cfi?: string; href?: string } }) => {
        const cfi = location.start?.cfi ?? null
        const href = location.start?.href ?? ''
        const progress = cfi ? Number(readyBook.locations.percentageFromCfi(cfi) || 0) : 0
        setReaderProgress(progress)
        setLocationLabel(href || cfi || 'Beginning')
        if (cfi) {
          void commitReaderProgress({ cfi, progress })
        }
      })

      await readyRendition.display(item.ebookLocation || undefined)
      setReaderApi({
        next: () => void readyRendition.next(),
        prev: () => void readyRendition.prev(),
      })
      setIsReady(true)
    })()

    return () => {
      cancelled = true
      rendition?.destroy()
      book?.destroy()
      setReaderApi(null)
    }
  }, [client, item])

  if (query.isPending) {
    return <main className="screen"><section className="card"><p className="muted">Loading reader…</p></section></main>
  }

  if (query.error || !item || !item.ebookFormat) {
    return (
      <main className="screen">
        <section className="card">
          <h2>Reader unavailable</h2>
          <p className="muted">{(query.error as Error | null)?.message ?? 'This item does not have a readable ebook file.'}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="screen reader-screen">
      <section className="reader-toolbar card">
        <div>
          <p className="eyebrow">Reading</p>
          <h2>{item.title}</h2>
          <p className="muted">{item.author}</p>
        </div>
        <div className="reader-actions">
          <button className="ghost-button" onClick={() => navigate(`/book/${item.id}`)}>Details</button>
          <a className="ghost-button" href={client.ebookUrl(item.id)} target="_blank" rel="noreferrer">Open file</a>
        </div>
      </section>

      <section className="reader-meta">
        <div className="card reader-stat">
          <span className="stat-label">Format</span>
          <strong>{item.ebookFormat.toUpperCase()}</strong>
        </div>
        <div className="card reader-stat">
          <span className="stat-label">Progress</span>
          <strong>{formatProgress(readerProgress || item.ebookProgress)}</strong>
        </div>
        <div className="card reader-stat">
          <span className="stat-label">Location</span>
          <strong>{locationLabel || item.ebookLocation || 'Start'}</strong>
        </div>
      </section>

      <section className="reader-stage card">
        {item.ebookFormat === 'pdf' ? (
          <iframe className="reader-frame" src={client.ebookUrl(item.id)} title={item.title} />
        ) : (
          <div ref={containerRef} className="reader-frame" />
        )}
      </section>

      <section className="reader-controls">
        <button className="ghost-button" disabled={!(isPdf || isReady)} onClick={() => readerApi?.prev()}>Previous</button>
        <button className="ghost-button" disabled={!(isPdf || isReady)} onClick={() => readerApi?.next()}>Next</button>
      </section>
    </main>
  )
}

function PlayerPage() {
  const {
    activePlayback,
    playbackTime,
    isPlaying,
    playbackRate,
    currentTrackDuration,
    togglePlayback,
    seekBy,
    seekTo,
    setPlaybackRate,
    jumpToTrack,
  } = useAppContext()

  if (!activePlayback) {
    return (
      <main className="screen">
        <section className="card">
          <h1>No active session</h1>
          <p className="muted">Pick a book to begin a listening session.</p>
        </section>
      </main>
    )
  }

  const progress = activePlayback.duration > 0 ? playbackTime / activePlayback.duration : 0

  return (
    <main className="screen player-screen">
      <section className="player-card">
        <div className="player-cover">
          <div className="cover cover-player" />
        </div>
        <p className="eyebrow">Now playing</p>
        <h1>{activePlayback.item.title}</h1>
        <p className="author-line">{activePlayback.item.author}</p>
        <label className="scrubber">
          <input
            type="range"
            min={0}
            max={Math.max(activePlayback.duration, 1)}
            value={playbackTime}
            onChange={(event) => seekTo(Number(event.target.value))}
          />
          <div className="time-row">
            <span>{formatDuration(playbackTime)}</span>
            <span>{formatDuration(activePlayback.duration)}</span>
          </div>
        </label>

        <div className="player-controls">
          <button className="icon-button" onClick={() => seekBy(-30)}>−30</button>
          <button className="primary-button large-button" onClick={() => void togglePlayback()}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button className="icon-button" onClick={() => seekBy(30)}>+30</button>
        </div>

        <div className="stats-row">
          <div>
            <span className="stat-label">Progress</span>
            <strong>{formatProgress(progress)}</strong>
          </div>
          <div>
            <span className="stat-label">Rate</span>
            <select value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))}>
              {[0.8, 1, 1.2, 1.5, 1.75, 2].map((rate) => (
                <option key={rate} value={rate}>{rate}x</option>
              ))}
            </select>
          </div>
          <div>
            <span className="stat-label">Current track</span>
            <strong>{formatDuration(currentTrackDuration)}</strong>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <h2>Track queue</h2>
        </div>
        <div className="chapter-list">
          {activePlayback.session.audioTracks.map((track) => (
            <button
              key={`${track.index}-${track.title}`}
              className={clsx('chapter-row', {
                active: track.index === activePlayback.trackIndex,
              })}
              onClick={() => jumpToTrack(track.index)}
            >
              <strong>{track.title}</strong>
              <span>{formatDuration(track.duration)}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

function DownloadsPage() {
  const { offlineBooks, removeOfflineBook } = useAppContext()

  return (
    <main className="screen downloads-screen">
      <section className="screen-header">
        <div>
          <p className="eyebrow">Downloads</p>
          <h1>Offline books</h1>
        </div>
      </section>
      <section className="card">
        {offlineBooks.length === 0 ? (
          <p className="muted">No offline books yet.</p>
        ) : (
          <div className="download-list">
            {offlineBooks.map((book) => (
              <div key={book.itemId} className="download-row">
                <div>
                  <strong>{book.title}</strong>
                  <p>{book.author}</p>
                  <span className="muted">{Math.round(book.totalBytes / 1024 / 1024)} MB</span>
                </div>
                <button className="ghost-button" onClick={() => void removeOfflineBook(book.itemId)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

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

function BottomNav() {
  const location = useLocation()

  return (
    <nav className="bottom-nav">
      {[
        ['/home', 'Home'],
        ['/downloads', 'Downloads'],
        ['/player', 'Player'],
        ['/settings', 'Settings'],
      ].map(([href, label]) => (
        <Link key={href} className={clsx('nav-link', { active: location.pathname === href })} to={href}>
          {label}
        </Link>
      ))}
    </nav>
  )
}

function MiniPlayer() {
  const { activePlayback, playbackTime, isPlaying, togglePlayback } = useAppContext()
  if (!activePlayback) {
    return null
  }

  return (
    <Link className="mini-player" to="/player">
      <div>
        <strong>{activePlayback.item.title}</strong>
        <span>{formatDuration(playbackTime)} listened</span>
      </div>
      <button
        className="icon-button"
        onClick={(event) => {
          event.preventDefault()
          void togglePlayback()
        }}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
    </Link>
  )
}

export default App
