import { Link } from 'react-router-dom'

import { usePlayerContext } from '../contexts/PlayerContext'
import { formatDuration } from '../lib/utils'

export function MiniPlayer() {
  const { activePlayback, playbackTime, isPlaying, togglePlayback } = usePlayerContext()
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
