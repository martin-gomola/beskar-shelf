import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'

import { useClient } from '../contexts/ClientContext'
import { usePlayerContext, usePlayerTime } from '../contexts/PlayerContext'
import { useToast } from '../contexts/ToastContext'
import { useSleepTimer } from '../hooks/useSleepTimer'
import { deleteBookmark as deleteLocalBookmark, loadBookmarks, upsertBookmark } from '../lib/storage'
import type { Bookmark } from '../lib/types'
import { formatDuration, formatProgress } from '../lib/utils'

function IconRewind() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 19l-7-7 7-7" />
      <text x="15" y="15" fill="currentColor" stroke="none" fontSize="8" fontWeight="700" textAnchor="middle">30</text>
    </svg>
  )
}

function IconForward() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5l7 7-7 7" />
      <text x="9" y="15" fill="currentColor" stroke="none" fontSize="8" fontWeight="700" textAnchor="middle">30</text>
    </svg>
  )
}

function IconPlay() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  )
}

function IconPause() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="5" y="3" width="4" height="18" rx="1" />
      <rect x="15" y="3" width="4" height="18" rx="1" />
    </svg>
  )
}

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function IconBookmark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconStop() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  )
}

function PlayerPage() {
  const client = useClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const {
    activePlayback,
    isPlaying,
    playbackRate,
    togglePlayback,
    stopPlayback,
    seekBy,
    seekTo,
    setPlaybackRate,
    jumpToTrack,
    setIsSeeking,
  } = usePlayerContext()
  const { playbackTime } = usePlayerTime()

  const [bookmarkTitle, setBookmarkTitle] = useState('')
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showSleepTimer, setShowSleepTimer] = useState(false)
  const [seekPreview, setSeekPreview] = useState<number | null>(null)
  const [localBookmarkVersion, setLocalBookmarkVersion] = useState(0)

  const currentChapterEnd = useMemo(() => {
    if (!activePlayback) {
      return null
    }
    const chapter = activePlayback.item.chapters.find(
      (ch) => playbackTime >= ch.start && playbackTime < ch.end,
    )
    return chapter?.end ?? null
  }, [activePlayback, playbackTime])

  const bookmarksQuery = useQuery({
    queryKey: ['bookmarks', activePlayback?.item.id],
    queryFn: () => client.getBookmarks(activePlayback!.item.id),
    enabled: Boolean(activePlayback?.item.id) && showBookmarks,
    staleTime: 30 * 1000,
  })
  const activeItemId = activePlayback?.item.id ?? null
  const localBookmarks = useMemo(() => {
    void localBookmarkVersion
    return activeItemId ? loadBookmarks(activeItemId) : []
  }, [activeItemId, localBookmarkVersion])
  const mergedBookmarks = useMemo(() => {
    const byTime = new Map<number, Bookmark & { source: 'local' | 'server' | 'both' }>()

    for (const bookmark of localBookmarks) {
      byTime.set(bookmark.time, { ...bookmark, source: 'local' })
    }

    for (const bookmark of bookmarksQuery.data ?? []) {
      const existing = byTime.get(bookmark.time)
      if (existing) {
        byTime.set(bookmark.time, {
          title: existing.title || bookmark.title,
          time: bookmark.time,
          createdAt: Math.max(existing.createdAt, bookmark.createdAt),
          source: 'both',
        })
      } else {
        byTime.set(bookmark.time, { ...bookmark, source: 'server' })
      }
    }

    return [...byTime.values()].sort((a, b) => a.time - b.time)
  }, [bookmarksQuery.data, localBookmarks])

  const saveBookmark = useCallback(async (
    bookmark: Bookmark,
    messages: { success: string, fallback: string },
  ) => {
    if (!activeItemId) {
      return
    }

    upsertBookmark(activeItemId, bookmark)
    setLocalBookmarkVersion((value) => value + 1)

    try {
      await client.createBookmark(activeItemId, bookmark.time, bookmark.title)
      await queryClient.invalidateQueries({ queryKey: ['bookmarks', activeItemId] })
      showToast(messages.success, 'success')
    } catch (error) {
      showToast(messages.fallback, 'info')
      console.error(error)
    }
  }, [activeItemId, client, queryClient, showToast])

  const handleSleepTimerComplete = useCallback(async () => {
    const bookmark: Bookmark = {
      title: `Sleep timer at ${formatDuration(playbackTime)}`,
      time: Math.floor(playbackTime),
      createdAt: Date.now(),
    }

    await saveBookmark(bookmark, {
      success: 'Sleep bookmark saved',
      fallback: 'Sleep bookmark saved on this device',
    })

    if (isPlaying) {
      await togglePlayback()
    }
  }, [isPlaying, playbackTime, saveBookmark, togglePlayback])

  const { sleepTimer, setSleepMinutes, setSleepEndOfChapter, cancelSleepTimer } = useSleepTimer(
    handleSleepTimerComplete,
    currentChapterEnd,
    playbackTime,
  )

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
  const activeItem = activePlayback.item
  const coverUrl = activePlayback.item.coverPath
    ? client.coverUrl(activePlayback.item.id)
    : null

  async function addBookmark() {
    const bookmark: Bookmark = {
      title: bookmarkTitle.trim() || `Bookmark at ${formatDuration(playbackTime)}`,
      time: Math.floor(playbackTime),
      createdAt: Date.now(),
    }

    await saveBookmark(bookmark, {
      success: 'Bookmark saved',
      fallback: 'Bookmark saved on this device',
    })
    setBookmarkTitle('')
  }

  async function removeBookmark(bookmark: Bookmark & { source: 'local' | 'server' | 'both' }) {
    deleteLocalBookmark(activeItem.id, bookmark.time)
    setLocalBookmarkVersion((value) => value + 1)

    if (bookmark.source === 'local') {
      showToast('Local bookmark removed', 'info')
      return
    }

    try {
      await client.deleteBookmark(activeItem.id, bookmark.time)
      await queryClient.invalidateQueries({ queryKey: ['bookmarks', activeItem.id] })
      showToast('Bookmark removed', 'success')
    } catch (error) {
      upsertBookmark(activeItem.id, bookmark)
      setLocalBookmarkVersion((value) => value + 1)
      showToast('Could not remove bookmark from server', 'error')
      console.error(error)
    }
  }

  return (
    <main className="screen player-screen">
      <section className="player-card">
        <div className="player-cover">
          <div className="cover cover-player">
            {coverUrl ? <img className="cover-img cover-img-loaded" src={coverUrl} alt={activePlayback.item.title} /> : null}
          </div>
        </div>
        <h1>{activePlayback.item.title}</h1>
        <p className="author-line">{activePlayback.item.author}</p>
        <label className="scrubber">
          <input
            type="range"
            min={0}
            max={Math.max(activePlayback.duration, 1)}
            value={seekPreview ?? playbackTime}
            onInput={(event) => {
              setIsSeeking(true)
              setSeekPreview(Number((event.target as HTMLInputElement).value))
            }}
            onChange={(event) => {
              const value = Number(event.target.value)
              setIsSeeking(false)
              seekTo(value)
              setSeekPreview(null)
            }}
          />
          <div className="time-row">
            <span>{formatDuration(seekPreview ?? playbackTime)}</span>
            <span>{formatDuration(activePlayback.duration)}</span>
          </div>
        </label>

        <div className="player-controls">
          <button className="player-seek-btn" onClick={() => seekBy(-30)} aria-label="Rewind 30 seconds">
            <IconRewind />
          </button>
          <button className="player-play-btn" onClick={() => void togglePlayback()} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button className="player-seek-btn" onClick={() => seekBy(30)} aria-label="Forward 30 seconds">
            <IconForward />
          </button>
        </div>

        <div className="player-actions">
          <button className="player-action-btn" onClick={() => setShowSleepTimer(!showSleepTimer)} aria-label="Sleep timer">
            <IconMoon />
            <span>
              {sleepTimer.mode === 'off'
                ? 'Sleep'
                : sleepTimer.mode === 'end-of-chapter'
                  ? 'End of ch.'
                  : formatDuration(sleepTimer.remainingMs / 1000)}
            </span>
          </button>
          <button className="player-action-btn" onClick={() => setShowBookmarks(!showBookmarks)} aria-label="Bookmarks">
            <IconBookmark />
            <span>Bookmarks</span>
          </button>
          <button
            className="player-action-btn"
            onClick={() => {
              stopPlayback()
              navigate('/')
            }}
            aria-label="Stop and close"
          >
            <IconStop />
            <span>Stop</span>
          </button>
        </div>

        <div className="stats-row">
          <div className="player-stat player-utility-card">
            <span className="stat-label">Progress</span>
            <strong className="player-stat-value">{formatProgress(progress)}</strong>
          </div>
          <label className="player-stat player-stat-rate player-utility-card">
            <span className="stat-label">Rate</span>
            <select value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))}>
              {[0.8, 1, 1.2, 1.5, 1.75, 2].map((rate) => (
                <option key={rate} value={rate}>{rate}x</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {showSleepTimer ? (
        <section className="card">
          <div className="section-heading">
            <h2>Sleep timer</h2>
          </div>
          <div className="sleep-timer-row">
            {[5, 10, 15, 30, 60].map((min) => (
              <button
                key={min}
                className={clsx('ghost-button sleep-timer-btn', { active: sleepTimer.mode === 'minutes' && sleepTimer.minutes === min })}
                onClick={() => setSleepMinutes(min)}
              >
                {min}m
              </button>
            ))}
            <button
              className={clsx('ghost-button sleep-timer-btn', { active: sleepTimer.mode === 'end-of-chapter' })}
              onClick={setSleepEndOfChapter}
            >
              End of chapter
            </button>
            {sleepTimer.mode !== 'off' ? (
              <button className="ghost-button sleep-timer-btn" onClick={cancelSleepTimer}>Cancel</button>
            ) : null}
          </div>
        </section>
      ) : null}

      {showBookmarks ? (
        <section className="card">
          <div className="section-heading">
            <h2>Bookmarks</h2>
            <span className="muted bookmark-meta">{mergedBookmarks.length} saved</span>
          </div>
          <div className="bookmark-form">
            <input
              value={bookmarkTitle}
              onChange={(event) => setBookmarkTitle(event.target.value)}
              placeholder="Name this moment"
              className="bookmark-input"
            />
            <button className="primary-button bookmark-add-btn" onClick={() => void addBookmark()}>
              Save {formatDuration(playbackTime)}
            </button>
          </div>
          <p className="bookmark-help muted">
            Bookmarks save instantly on this device and sync to Audiobookshelf when available.
          </p>
          <div className="chapter-list">
            {mergedBookmarks.length === 0 ? (
              <div className="bookmark-empty">
                <strong>Save important moments as you listen.</strong>
                <p className="muted">Your first bookmark will appear here for quick jump-back access.</p>
              </div>
            ) : mergedBookmarks.map((bm) => (
              <div key={`${bm.time}-${bm.title}`} className="bookmark-row">
                <button
                  className="chapter-row bookmark-jump-btn"
                  onClick={() => seekTo(bm.time)}
                >
                  <span className="bookmark-copy">
                    <strong>{bm.title}</strong>
                    <span className="bookmark-source">
                      {bm.source === 'local' ? 'Local only' : bm.source === 'both' ? 'Synced' : 'Server'}
                    </span>
                  </span>
                  <span>{formatDuration(bm.time)}</span>
                </button>
                <button
                  className="ghost-button bookmark-delete-btn"
                  onClick={() => void removeBookmark(bm)}
                  aria-label={`Delete bookmark ${bm.title}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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

export default PlayerPage
