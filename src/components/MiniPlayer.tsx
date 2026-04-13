import { Link } from 'react-router-dom'

import { usePlayerContext, usePlayerTime } from '../contexts/PlayerContext'
import { formatDuration } from '../lib/utils'

export function MiniPlayer() {
  const { activePlayback, isPlaying, togglePlayback, stopPlayback } = usePlayerContext()
  const { playbackTime } = usePlayerTime()
  if (!activePlayback) {
    return null
  }

  return (
    <Link className="mini-player" to="/player">
      <div className="mini-player-info">
        <strong>{activePlayback.item.title}</strong>
        <span>{formatDuration(playbackTime)} listened</span>
      </div>
      <div className="mini-player-controls">
        <button
          className="icon-button"
          onClick={(event) => {
            event.preventDefault()
            void togglePlayback()
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          className="icon-button"
          onClick={(event) => {
            event.preventDefault()
            stopPlayback()
          }}
          aria-label="Close player"
        >
          ✕
        </button>
      </div>
    </Link>
  )
}
