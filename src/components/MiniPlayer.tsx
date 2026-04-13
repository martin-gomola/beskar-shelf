import { Link } from 'react-router-dom'

import { useClient } from '../contexts/ClientContext'
import { usePlayerContext, usePlayerTime } from '../contexts/PlayerContext'

function IconPlay() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  )
}

function IconPause() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="5" y="3" width="4" height="18" rx="1" />
      <rect x="15" y="3" width="4" height="18" rx="1" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function MiniPlayer() {
  const client = useClient()
  const { activePlayback, isPlaying, togglePlayback, stopPlayback } = usePlayerContext()
  const { playbackTime } = usePlayerTime()
  if (!activePlayback) {
    return null
  }

  const progress = activePlayback.duration > 0
    ? (playbackTime / activePlayback.duration) * 100
    : 0
  const coverUrl = activePlayback.item.coverPath
    ? client.coverUrl(activePlayback.item.id)
    : null

  return (
    <Link className="mini-player" to="/player">
      <div className="mini-player-progress">
        <div className="mini-player-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="mini-player-body">
        <div className="mini-player-cover">
          {coverUrl ? <img src={coverUrl} alt="" /> : null}
        </div>
        <div className="mini-player-info">
          <strong>{activePlayback.item.title}</strong>
          <span>{activePlayback.item.author}</span>
        </div>
        <div className="mini-player-controls">
          <button
            className="mini-player-play"
            onClick={(event) => {
              event.preventDefault()
              void togglePlayback()
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button
            className="mini-player-close"
            onClick={(event) => {
              event.preventDefault()
              stopPlayback()
            }}
            aria-label="Close player"
          >
            <IconClose />
          </button>
        </div>
      </div>
    </Link>
  )
}
