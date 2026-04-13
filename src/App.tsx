import { useMemo, useState } from 'react'

import { AudiobookshelfClient } from './lib/api'
import {
  loadPlaybackState,
  loadServerConfig,
  loadUserSession,
  saveServerConfig,
  saveUserSession,
} from './lib/storage'
import type { PersistedPlaybackState, ServerConfig, UserSession } from './lib/types'

import { AppContext } from './contexts/AppContext'
import { ClientContext } from './contexts/ClientContext'
import { PlayerContext, PlayerTimeContext } from './contexts/PlayerContext'
import { usePlayback } from './hooks/usePlayback'
import { useOffline } from './hooks/useOffline'
import { Shell } from './components/Shell'

function App() {
  const [server, setServerState] = useState<ServerConfig | null>(() => loadServerConfig())
  const [session, setSessionState] = useState<UserSession | null>(() => loadUserSession())
  const [playbackState, setPlaybackState] = useState<PersistedPlaybackState | null>(() => loadPlaybackState())
  const client = useMemo(() => new AudiobookshelfClient(server, session), [server, session])

  function setServer(next: ServerConfig | null) {
    setServerState(next)
    saveServerConfig(next)
  }

  function setSession(next: UserSession | null) {
    setSessionState(next)
    saveUserSession(next)
  }

  const {
    offlineBooks,
    refreshOfflineBooks,
    downloadCurrentBook,
    removeOfflineBook,
  } = useOffline(client)

  const {
    activePlayback,
    playbackTime,
    isPlaying,
    playbackRate,
    currentTrackDuration,
    startBook,
    togglePlayback,
    stopPlayback,
    seekTo,
    seekBy,
    setPlaybackRate,
    jumpToTrack,
    audioRef,
  } = usePlayback(client, session, playbackState, setPlaybackState)

  const appContextValue = useMemo(() => ({
    server,
    setServer,
    session,
    setSession,
    offlineBooks,
    refreshOfflineBooks,
    playbackState,
    startBook,
    downloadCurrentBook,
    removeOfflineBook,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [server, session, offlineBooks, playbackState])

  const playerContextValue = useMemo(() => ({
    activePlayback,
    isPlaying,
    playbackRate,
    togglePlayback,
    stopPlayback,
    seekTo,
    seekBy,
    setPlaybackRate,
    jumpToTrack,
    audioRef,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [activePlayback, isPlaying, playbackRate])

  const playerTimeValue = useMemo(() => ({
    playbackTime,
    currentTrackDuration,
  }), [playbackTime, currentTrackDuration])

  return (
    <ClientContext.Provider value={client}>
      <AppContext.Provider value={appContextValue}>
        <PlayerContext.Provider value={playerContextValue}>
          <PlayerTimeContext.Provider value={playerTimeValue}>
            <audio ref={audioRef} preload="metadata" />
            <Shell />
          </PlayerTimeContext.Provider>
        </PlayerContext.Provider>
      </AppContext.Provider>
    </ClientContext.Provider>
  )
}

export default App
