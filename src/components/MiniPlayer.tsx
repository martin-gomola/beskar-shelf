import { Link } from 'react-router-dom'

import { usePlayerContext } from '../contexts/PlayerContext'
import { formatDuration } from '../lib/utils'

export function MiniPlayer() {
  const { activePlayback, playbackTime, isPlaying, togglePlayback, stopPlayback } = usePlayerContext()
  if (!activePlayback) {
    return null
  }

  return (
    <Link className="mini-player" to="/player">
      <div className="mini-player-info">
        <strong>{activePlayback.item.title}</strong>
        <span>{formatDuration(playbackTime)} listened</span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
