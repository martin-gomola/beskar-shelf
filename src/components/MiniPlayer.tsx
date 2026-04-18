import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { useAppContext } from '../contexts/AppContext'
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
  const { activePlayback, isPlaying, togglePlayback } = usePlayerContext()
  const { playbackTime } = usePlayerTime()
  const { playbackState, startBook } = useAppContext()
  const [dismissedItemId, setDismissedItemId] = useState<string | null>(null)
  const [lastSeenItemId, setLastSeenItemId] = useState<string | null>(null)

  // The mini-player renders for either the live session or the saved one.
  // Live session wins if both exist (they should refer to the same item once
  // startBook runs, but activePlayback is authoritative for time/progress).
  const resumeItemId = !activePlayback ? playbackState?.itemId ?? null : null
  const currentItemId = activePlayback?.item.id ?? resumeItemId

  // Reset dismissal when the underlying item changes (new session or different
  // saved book). Uses the "update state during render" pattern from the React
  // docs to avoid the set-state-in-effect lint rule.
  if (currentItemId !== lastSeenItemId) {
    setLastSeenItemId(currentItemId)
    if (dismissedItemId && dismissedItemId !== currentItemId) {
      setDismissedItemId(null)
    }
  }

  if (!currentItemId) {
    return null
  }
  if (dismissedItemId === currentItemId) {
    return null
  }

  if (activePlayback) {
    return (
      <ActiveMiniPlayer
        progress={activePlayback.duration > 0 ? (playbackTime / activePlayback.duration) * 100 : 0}
        coverUrl={activePlayback.item.coverPath ? client.coverUrl(activePlayback.item.id) : null}
        title={activePlayback.item.title}
        author={activePlayback.item.author}
        isPlaying={isPlaying}
        onTogglePlay={() => void togglePlayback()}
        onDismiss={() => {
          if (isPlaying) {
            void togglePlayback()
          }
          setDismissedItemId(activePlayback.item.id)
        }}
      />
    )
  }

  return (
    <ResumeMiniPlayer
      itemId={resumeItemId as string}
      savedTime={playbackState?.currentTime ?? 0}
      savedDuration={playbackState?.duration ?? 0}
      onResume={(item) => {
        void startBook(item, playbackState?.currentTime)
      }}
      onDismiss={() => setDismissedItemId(resumeItemId)}
    />
  )
}

interface ActiveMiniPlayerProps {
  progress: number
  coverUrl: string | null
  title: string
  author: string
  isPlaying: boolean
  onTogglePlay: () => void
  onDismiss: () => void
}

function ActiveMiniPlayer({
  progress,
  coverUrl,
  title,
  author,
  isPlaying,
  onTogglePlay,
  onDismiss,
}: ActiveMiniPlayerProps) {
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
          <strong>{title}</strong>
          <span>{author}</span>
        </div>
        <div className="mini-player-controls">
          <button
            className="mini-player-play"
            onClick={(event) => {
              event.preventDefault()
              onTogglePlay()
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button
            className="mini-player-close"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onDismiss()
            }}
            aria-label="Dismiss mini player"
          >
            <IconClose />
          </button>
        </div>
      </div>
    </Link>
  )
}

interface ResumeMiniPlayerProps {
  itemId: string
  savedTime: number
  savedDuration: number
  onResume: (item: import('../lib/types').BookItem) => void
  onDismiss: () => void
}

function ResumeMiniPlayer({
  itemId,
  savedTime,
  savedDuration,
  onResume,
  onDismiss,
}: ResumeMiniPlayerProps) {
  const client = useClient()
  const itemQuery = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => client.getItem(itemId),
    enabled: Boolean(itemId) && client.hasSession(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  // If we can't load the item (offline and not cached, or the item was deleted),
  // don't show anything — the HomePage banner already surfaces the raw timestamp.
  if (!itemQuery.data) {
    return null
  }

  const item = itemQuery.data
  const progress = savedDuration > 0 ? (savedTime / savedDuration) * 100 : 0
  const coverUrl = item.coverPath ? client.coverUrl(item.id) : null

  return (
    <div className="mini-player" role="group" aria-label="Resume last book">
      <div className="mini-player-progress">
        <div className="mini-player-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="mini-player-body">
        <div className="mini-player-cover">
          {coverUrl ? <img src={coverUrl} alt="" /> : null}
        </div>
        <div className="mini-player-info">
          <strong>{item.title}</strong>
          <span>{item.author}</span>
        </div>
        <div className="mini-player-controls">
          <button
            className="mini-player-play"
            onClick={() => onResume(item)}
            aria-label="Resume playback"
          >
            <IconPlay />
          </button>
          <button
            className="mini-player-close"
            onClick={onDismiss}
            aria-label="Dismiss mini player"
          >
            <IconClose />
          </button>
        </div>
      </div>
    </div>
  )
}
