import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'

import { useAppContext } from '../contexts/AppContext'
import { usePlayerContext } from '../contexts/PlayerContext'
import { useSleepTimer } from '../hooks/useSleepTimer'
import { formatDuration, formatProgress } from '../lib/utils'

function PlayerPage() {
  const { client } = useAppContext()
  const queryClient = useQueryClient()
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
  } = usePlayerContext()

  const [bookmarkTitle, setBookmarkTitle] = useState('')
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showSleepTimer, setShowSleepTimer] = useState(false)

  const currentChapterEnd = useMemo(() => {
    if (!activePlayback) {
      return null
    }
    const chapter = activePlayback.item.chapters.find(
      (ch) => playbackTime >= ch.start && playbackTime < ch.end,
    )
    return chapter?.end ?? null
  }, [activePlayback, playbackTime])

  const pausePlayback = useMemo(() => {
    return async () => {
      if (isPlaying) {
        await togglePlayback()
      }
    }
  }, [isPlaying, togglePlayback])

  const { sleepTimer, setSleepMinutes, setSleepEndOfChapter, cancelSleepTimer } = useSleepTimer(
    pausePlayback,
    currentChapterEnd,
    playbackTime,
  )

  const bookmarksQuery = useQuery({
    queryKey: ['bookmarks', activePlayback?.item.id],
    queryFn: () => client.getBookmarks(activePlayback!.item.id),
    enabled: Boolean(activePlayback?.item.id) && showBookmarks,
    staleTime: 30 * 1000,
  })

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

  async function addBookmark() {
    const title = bookmarkTitle.trim() || `Bookmark at ${formatDuration(playbackTime)}`
    try {
      await client.createBookmark(activePlayback!.item.id, playbackTime, title)
      setBookmarkTitle('')
      await queryClient.invalidateQueries({ queryKey: ['bookmarks', activePlayback!.item.id] })
    } catch (error) {
      console.error(error)
    }
  }

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

        <div className="button-row">
          <button className="ghost-button" onClick={() => setShowSleepTimer(!showSleepTimer)}>
            {sleepTimer.mode === 'off'
              ? 'Sleep timer'
              : sleepTimer.mode === 'end-of-chapter'
                ? 'Sleep: end of chapter'
                : `Sleep: ${formatDuration(sleepTimer.remainingMs / 1000)}`}
          </button>
          <button className="ghost-button" onClick={() => setShowBookmarks(!showBookmarks)}>
            Bookmarks
          </button>
        </div>
      </section>

      {showSleepTimer ? (
        <section className="card">
          <div className="section-heading">
            <h2>Sleep timer</h2>
          </div>
          <div className="button-row">
            {[5, 10, 15, 30, 60].map((min) => (
              <button
                key={min}
                className={clsx('ghost-button', { active: sleepTimer.mode === 'minutes' && sleepTimer.minutes === min })}
                onClick={() => setSleepMinutes(min)}
              >
                {min}m
              </button>
            ))}
            <button
              className={clsx('ghost-button', { active: sleepTimer.mode === 'end-of-chapter' })}
              onClick={setSleepEndOfChapter}
            >
              End of chapter
            </button>
            {sleepTimer.mode !== 'off' ? (
              <button className="ghost-button" onClick={cancelSleepTimer}>Cancel</button>
            ) : null}
          </div>
        </section>
      ) : null}

      {showBookmarks ? (
        <section className="card">
          <div className="section-heading">
            <h2>Bookmarks</h2>
          </div>
          <div className="button-row">
            <input
              className="field"
              value={bookmarkTitle}
              onChange={(event) => setBookmarkTitle(event.target.value)}
              placeholder="Bookmark title (optional)"
              style={{ flex: 1, borderRadius: '16px', border: '1px solid var(--line)', background: 'rgba(255,255,255,0.04)', color: 'var(--text)', padding: '10px 14px' }}
            />
            <button className="ghost-button" onClick={() => void addBookmark()}>Add</button>
          </div>
          <div className="chapter-list">
            {(bookmarksQuery.data ?? []).length === 0 ? (
              <p className="muted">No bookmarks yet.</p>
            ) : (bookmarksQuery.data ?? []).map((bm) => (
              <button
                key={`${bm.time}-${bm.title}`}
                className="chapter-row"
                onClick={() => seekTo(bm.time)}
              >
                <strong>{bm.title}</strong>
                <span>{formatDuration(bm.time)}</span>
              </button>
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
