import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'

import { useAppContext } from '../contexts/AppContext'
import { useClient } from '../contexts/ClientContext'
import { usePlayerContext, usePlayerTime } from '../contexts/PlayerContext'
import { useToast } from '../contexts/ToastContext'
import { useRemainingTimeMode, useSkipSeconds } from '../hooks/usePlaybackPrefs'
import { useSleepTimer } from '../hooks/useSleepTimer'
import { cachePlayedTrack } from '../lib/downloads'
import { deleteBookmark as deleteLocalBookmark, loadBookmarks, upsertBookmark } from '../lib/storage'
import type { Bookmark } from '../lib/types'
import { clamp, formatDuration, formatProgress } from '../lib/utils'

function IconRewind({ seconds }: { seconds: number }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 19l-7-7 7-7" />
      <text x="15" y="15" fill="currentColor" stroke="none" fontSize="8" fontWeight="700" textAnchor="middle">{seconds}</text>
    </svg>
  )
}

function IconForward({ seconds }: { seconds: number }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5l7 7-7 7" />
      <text x="9" y="15" fill="currentColor" stroke="none" fontSize="8" fontWeight="700" textAnchor="middle">{seconds}</text>
    </svg>
  )
}

function IconSkipBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="19 20 9 12 19 4 19 20" />
      <line x1="5" y1="19" x2="5" y2="5" />
    </svg>
  )
}

function IconSkipForward() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="5" x2="19" y2="19" />
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

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  )
}

interface ChapterListPanelProps {
  chapters: { start: number; end: number; title: string }[]
  playbackTime: number
  onJump: (start: number) => void
}

/**
 * Renders the chapter list inside the player. Auto-scrolls the active
 * chapter into view on open so users don't have to hunt for "where am I"
 * in long books. Active row gets the same .chapter-row .active treatment
 * already used by the track queue, keeping visual language consistent.
 */
function ChapterListPanel({ chapters, playbackTime, onJump }: ChapterListPanelProps) {
  const activeRowRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [])

  if (chapters.length === 0) {
    return (
      <div className="player-action-panel">
        <span className="muted">This book has no chapter markers.</span>
      </div>
    )
  }

  return (
    <div className="player-action-panel">
      <div className="player-action-panel-meta">
        <span className="muted">{chapters.length} chapters</span>
      </div>
      <div className="chapter-list">
        {chapters.map((chapter, index) => {
          const isActive = playbackTime >= chapter.start && playbackTime < chapter.end
          return (
            <button
              key={`${chapter.start}-${index}`}
              ref={isActive ? activeRowRef : null}
              className={clsx('chapter-row', { active: isActive })}
              onClick={() => onJump(chapter.start)}
            >
              <strong>{chapter.title || `Chapter ${index + 1}`}</strong>
              <span className="player-track-meta">
                <span>{formatDuration(chapter.end - chapter.start)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PlayerPage() {
  const client = useClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { offlineBooks } = useAppContext()
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
    jumpToPreviousTrack,
    jumpToNextTrack,
    setIsSeeking,
    audioRef,
  } = usePlayerContext()
  const { playbackTime, currentTrackDuration } = usePlayerTime()

  const [bookmarkTitle, setBookmarkTitle] = useState('')
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showSleepTimer, setShowSleepTimer] = useState(false)
  const [showChapters, setShowChapters] = useState(false)
  const [seekPreview, setSeekPreview] = useState<number | null>(null)
  const [bufferedTrackTime, setBufferedTrackTime] = useState(0)
  const [localBookmarkVersion, setLocalBookmarkVersion] = useState(0)
  const [skipSeconds] = useSkipSeconds()
  const [remainingMode, setRemainingMode] = useRemainingTimeMode()

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

  useEffect(() => {
    const audio = audioRef.current
    if (!activePlayback || !audio) {
      return
    }

    const activeTrack = activePlayback.session.audioTracks[activePlayback.trackIndex]
    const trackDuration = activeTrack?.duration ?? currentTrackDuration
    const currentSource = activePlayback.sources[activePlayback.trackIndex] ?? ''

    if (currentSource.startsWith('blob:')) {
      setBufferedTrackTime(trackDuration)
      return
    }

    let frame = 0

    function updateBufferedTime() {
      let nextBuffered = 0
      try {
        if (audio && audio.buffered.length > 0) {
          nextBuffered = audio.buffered.end(audio.buffered.length - 1)
        } else if (audio && audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
          nextBuffered = audio.duration || 0
        }
      } catch {
        nextBuffered = 0
      }
      setBufferedTrackTime(clamp(nextBuffered, 0, trackDuration))
    }

    frame = window.requestAnimationFrame(updateBufferedTime)
    audio.addEventListener('progress', updateBufferedTime)
    audio.addEventListener('loadedmetadata', updateBufferedTime)
    audio.addEventListener('canplay', updateBufferedTime)
    audio.addEventListener('canplaythrough', updateBufferedTime)
    audio.addEventListener('durationchange', updateBufferedTime)
    audio.addEventListener('emptied', updateBufferedTime)

    return () => {
      window.cancelAnimationFrame(frame)
      audio.removeEventListener('progress', updateBufferedTime)
      audio.removeEventListener('loadedmetadata', updateBufferedTime)
      audio.removeEventListener('canplay', updateBufferedTime)
      audio.removeEventListener('canplaythrough', updateBufferedTime)
      audio.removeEventListener('durationchange', updateBufferedTime)
      audio.removeEventListener('emptied', updateBufferedTime)
    }
  }, [activePlayback, audioRef, currentTrackDuration])

  // Persist track to IndexedDB once the browser has fully buffered it
  const cachedTrackRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activePlayback) return
    const trackKey = `${activePlayback.item.id}:${activePlayback.trackIndex}`
    if (cachedTrackRef.current === trackKey) return

    const source = activePlayback.sources[activePlayback.trackIndex] ?? ''
    if (source.startsWith('blob:')) return

    const trackDuration = activePlayback.session.audioTracks[activePlayback.trackIndex]?.duration ?? 0
    if (trackDuration <= 0 || bufferedTrackTime < trackDuration * 0.98) return

    cachedTrackRef.current = trackKey
    void cachePlayedTrack(client, activePlayback, activePlayback.trackIndex)
      .catch(() => {})
  }, [activePlayback, bufferedTrackTime, client])

  if (!activePlayback) {
    return <PlayerResumeGate />
  }

  const progress = activePlayback.duration > 0 ? playbackTime / activePlayback.duration : 0
  const activeItem = activePlayback.item
  const coverUrl = activePlayback.item.coverPath
    ? client.coverUrl(activePlayback.item.id)
    : null
  const offlineBook = offlineBooks.find((book) => book.itemId === activeItem.id)
  const downloadedTrackIndices = new Set(offlineBook?.tracks.map((track) => track.trackIndex) ?? [])
  const activeTrack = activePlayback.session.audioTracks[activePlayback.trackIndex]
  const activeTrackStart = activeTrack?.startOffset ?? 0
  const activeTrackDuration = activeTrack?.duration ?? currentTrackDuration
  const localPlaybackTime = clamp(playbackTime - activeTrackStart, 0, activeTrackDuration)
  const localSeekTime = seekPreview ?? localPlaybackTime
  const localSeekPct = activeTrackDuration > 0 ? Math.min(100, (localSeekTime / activeTrackDuration) * 100) : 0
  const bufferedPct = activeTrackDuration > 0 ? Math.min(100, (bufferedTrackTime / activeTrackDuration) * 100) : 0
  const activeChapter = activePlayback.item.chapters.find(
    (chapter) => playbackTime >= chapter.start && playbackTime < chapter.end,
  )
  const activeTrackTitle = activeTrack?.title ?? `Track ${activePlayback.trackIndex + 1}`
  const activePartLabel = activeChapter?.title ?? activeTrackTitle
  const bookRemaining = Math.max(activePlayback.duration - playbackTime, 0)
  const trackRemaining = Math.max(activeTrackDuration - localSeekTime, 0)
  const canGoPrevious = activePlayback.trackIndex > 0
  const canGoNext = activePlayback.trackIndex < activePlayback.session.audioTracks.length - 1

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
            {coverUrl ? (
              <>
                {/* Blurred ambient backdrop fills the letterbox on non-1:1 art
                    (e.g. wide audiobook banners) with colour from the cover
                    itself. Browser dedupes the fetch since src matches. */}
                <img className="cover-img-bg" src={coverUrl} alt="" aria-hidden="true" />
                <img className="cover-img cover-img-loaded" src={coverUrl} alt={activePlayback.item.title} />
              </>
            ) : null}
          </div>
        </div>
        {/* Title + author + current part live in one tight meta block so the
            hero reads as one identity unit instead of three competing rows.
            Part label is demoted to an inline kicker on the author line
            because it's positional metadata, not the book's identity. */}
        <div className="player-meta">
          <h1>
            <Link className="player-title-link" to={`/book/${activePlayback.item.id}`}>
              {activePlayback.item.title}
            </Link>
          </h1>
          <p className="author-line">
            <span>{activePlayback.item.author}</span>
            <span className="player-part-inline-sep" aria-hidden="true"> · </span>
            <span className="player-part-inline" aria-label="Current audiobook part">
              {activePartLabel}
            </span>
          </p>
        </div>

        <label className={clsx('scrubber', { seeking: seekPreview !== null })}>
          <div className="scrubber-track-wrapper">
            <span className="scrubber-track" aria-hidden="true">
              <span className="scrubber-buffer" style={{ width: `${Math.max(bufferedPct, localSeekPct)}%` }} />
              <span className="scrubber-progress" style={{ width: `${localSeekPct}%` }} />
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(activeTrackDuration, 1)}
              step={1}
              value={localSeekTime}
              aria-label="Seek position"
              onInput={(event) => {
                setIsSeeking(true)
                setSeekPreview(Number((event.target as HTMLInputElement).value))
              }}
              onChange={(event) => {
                const value = Number(event.target.value)
                setIsSeeking(false)
                seekTo(activeTrackStart + value)
                setSeekPreview(null)
              }}
            />
          </div>
          <div className="time-row player-time-row">
            <span>{formatDuration(localSeekTime)}</span>
            <button
              type="button"
              className="player-remaining-toggle"
              onClick={() => setRemainingMode(
                remainingMode === 'book'
                  ? 'track'
                  : remainingMode === 'track'
                    ? 'elapsed'
                    : 'book',
              )}
              aria-label={`Remaining display: ${remainingMode}. Tap to change.`}
            >
              {remainingMode === 'book'
                ? `${formatDuration(bookRemaining)} left`
                : remainingMode === 'track'
                  ? `${formatDuration(trackRemaining)} chapter left`
                  : `${formatDuration(playbackTime)} played`}
            </button>
            {remainingMode === 'book' ? (
              <span>-{formatDuration(trackRemaining)}</span>
            ) : (
              <span aria-hidden="true">&nbsp;</span>
            )}
          </div>
        </label>

        <div className="player-controls">
          <button
            className="player-skip-btn"
            onClick={jumpToPreviousTrack}
            aria-label="Previous track"
            disabled={!canGoPrevious}
          >
            <IconSkipBack />
          </button>
          <button
            className="player-seek-btn"
            onClick={() => seekBy(-skipSeconds)}
            aria-label={`Rewind ${skipSeconds} seconds`}
          >
            <IconRewind seconds={skipSeconds} />
          </button>
          <button className="player-play-btn" onClick={() => void togglePlayback()} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? <IconPause /> : <IconPlay />}
          </button>
          <button
            className="player-seek-btn"
            onClick={() => seekBy(skipSeconds)}
            aria-label={`Forward ${skipSeconds} seconds`}
          >
            <IconForward seconds={skipSeconds} />
          </button>
          <button
            className="player-skip-btn"
            onClick={jumpToNextTrack}
            aria-label="Next track"
            disabled={!canGoNext}
          >
            <IconSkipForward />
          </button>
        </div>

        <div className="player-stats-inline">
          <span className="player-stat-inline">
            <span className="stat-label">Progress</span>
            <strong>{formatProgress(progress)}</strong>
          </span>
          <span className="player-stat-divider" />
          <label className="player-stat-inline">
            <span className="stat-label">Rate</span>
            <select value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))}>
              {[0.8, 1, 1.1, 1.2, 1.25, 1.5, 1.75, 2].map((rate) => (
                <option key={rate} value={rate}>{rate}x</option>
              ))}
            </select>
          </label>
          <span className="player-stat-divider" />
          <span className="player-stat-inline">
            <span className="stat-label">Track</span>
            <strong>{activePlayback.trackIndex + 1}/{activePlayback.session.audioTracks.length}</strong>
          </span>
        </div>

        <div className="player-actions">
          <button
            className={clsx('player-action-btn', { active: showChapters })}
            onClick={() => setShowChapters(!showChapters)}
            aria-label="Chapters"
            aria-expanded={showChapters}
            disabled={activePlayback.item.chapters.length === 0}
          >
            <IconList />
            <span>Chapters</span>
          </button>
          <button
            className={clsx('player-action-btn', { active: showSleepTimer })}
            onClick={() => setShowSleepTimer(!showSleepTimer)}
            aria-label="Sleep timer"
            aria-expanded={showSleepTimer}
          >
            <IconMoon />
            <span>
              {sleepTimer.mode === 'off'
                ? 'Sleep'
                : sleepTimer.mode === 'end-of-chapter'
                  ? 'End of ch.'
                  : formatDuration(sleepTimer.remainingMs / 1000)}
            </span>
          </button>
          <button
            className={clsx('player-action-btn', { active: showBookmarks })}
            onClick={() => setShowBookmarks(!showBookmarks)}
            aria-label="Bookmarks"
            aria-expanded={showBookmarks}
          >
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

        {showChapters ? (
          <ChapterListPanel
            chapters={activePlayback.item.chapters}
            playbackTime={playbackTime}
            onJump={(start) => {
              seekTo(start)
              setShowChapters(false)
            }}
          />
        ) : null}

        {showSleepTimer ? (
          <div className="player-action-panel">
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
          </div>
        ) : null}

        {showBookmarks ? (
          <div className="player-action-panel">
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
            <div className="player-action-panel-meta">
              <span className="muted bookmark-meta">
                {mergedBookmarks.length === 0
                  ? 'No bookmarks yet'
                  : `${mergedBookmarks.length} saved`}
              </span>
            </div>
            {mergedBookmarks.length > 0 ? (
              <div className="chapter-list">
                {mergedBookmarks.map((bm) => (
                  <div key={`${bm.time}-${bm.title}`} className="bookmark-row">
                    <button
                      className="chapter-row bookmark-jump-btn"
                      onClick={() => seekTo(bm.time)}
                    >
                      <span className="bookmark-copy">
                        <strong>{bm.title}</strong>
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
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="section-heading">
          <h2>Track queue</h2>
        </div>
        <div className="chapter-list">
          {activePlayback.session.audioTracks.map((track, queueIndex) => {
            const isDownloaded = downloadedTrackIndices.has(track.index)

            return (
              <button
                key={`${track.index}-${track.title}`}
                className={clsx('chapter-row', {
                  active: queueIndex === activePlayback.trackIndex,
                  downloaded: isDownloaded,
                })}
                onClick={() => jumpToTrack(queueIndex)}
              >
                <strong>{track.title}</strong>
                <span className="player-track-meta">
                  {isDownloaded ? <span className="player-track-saved">Downloaded</span> : null}
                  <span>{formatDuration(track.duration)}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}

// Rendered on /player when no live session exists. If a saved position is
// in localStorage we use that as explicit user intent (they navigated to
// /player) and resume from it. Otherwise we show the empty-state card.
function PlayerResumeGate() {
  const client = useClient()
  const { playbackState, startBook } = useAppContext()
  const attemptedForItemRef = useRef<string | null>(null)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [isResuming, setIsResuming] = useState(false)

  const savedItemId = playbackState?.itemId ?? null
  const savedTime = playbackState?.currentTime ?? 0

  const itemQuery = useQuery({
    queryKey: ['item', savedItemId],
    queryFn: () => client.getItem(savedItemId as string),
    enabled: Boolean(savedItemId) && client.hasSession(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const attemptResume = useCallback(async () => {
    if (!savedItemId || !itemQuery.data) {
      return
    }
    if (itemQuery.data.audioTracks.length === 0) {
      setResumeError('This book has no audio tracks to resume.')
      return
    }
    setResumeError(null)
    setIsResuming(true)
    try {
      await startBook(itemQuery.data, savedTime)
    } catch (error) {
      console.error('Failed to resume playback', error)
      setResumeError(error instanceof Error ? error.message : 'Failed to resume playback.')
      // Allow the user to retry by clearing the guard.
      attemptedForItemRef.current = null
    } finally {
      setIsResuming(false)
    }
  }, [savedItemId, savedTime, itemQuery.data, startBook])

  useEffect(() => {
    if (!savedItemId || !itemQuery.data) {
      return
    }
    if (attemptedForItemRef.current === savedItemId) {
      return
    }
    attemptedForItemRef.current = savedItemId
    void attemptResume()
  }, [savedItemId, itemQuery.data, attemptResume])

  if (!savedItemId) {
    return (
      <main className="screen">
        <section className="card">
          <h1>No active session</h1>
          <p className="muted">Pick a book to begin a listening session.</p>
        </section>
      </main>
    )
  }

  if (itemQuery.isError) {
    return (
      <main className="screen">
        <section className="card">
          <h1>Couldn't load last book</h1>
          <p className="muted">We couldn't fetch the book details. Check your connection and try again.</p>
          <button
            className="primary-button"
            onClick={() => void itemQuery.refetch()}
            style={{ marginTop: 'var(--space-3)' }}
          >
            Retry
          </button>
        </section>
      </main>
    )
  }

  if (resumeError) {
    return (
      <main className="screen">
        <section className="card">
          <h1>Resume failed</h1>
          <p className="muted">{resumeError}</p>
          <button
            className="primary-button"
            onClick={() => void attemptResume()}
            style={{ marginTop: 'var(--space-3)' }}
          >
            Try again
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="screen">
      <section className="card">
        <h1>{isResuming || itemQuery.isPending ? 'Resuming…' : 'Opening last session…'}</h1>
        <p className="muted">Reopening {itemQuery.data?.title ?? 'your last book'}.</p>
      </section>
    </main>
  )
}

export default PlayerPage
