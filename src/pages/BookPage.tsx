import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'

import { useAppContext } from '../contexts/AppContext'
import { useClient } from '../contexts/ClientContext'
import { usePlayerContext } from '../contexts/PlayerContext'
import type { AudioTrack } from '../lib/types'
import { formatDuration, formatProgress, formatBytes } from '../lib/utils'

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function IconRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconSquare() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
    </svg>
  )
}

function trackIndexForChapterStart(tracks: AudioTrack[], start: number, fallbackIndex: number) {
  if (tracks.length === 0) {
    return fallbackIndex
  }

  const track = tracks.find((entry) => start >= entry.startOffset && start < entry.startOffset + entry.duration)
  return track?.index ?? fallbackIndex
}

export function BookPage() {
  const { itemId } = useParams() as { itemId: string }
  const client = useClient()
  const navigate = useNavigate()
  const { startBook, downloadCurrentBook, removeOfflineTracks, offlineBooks, isOnline } = useAppContext()
  const { activePlayback, seekTo } = usePlayerContext()
  const [descExpanded, setDescExpanded] = useState(false)
  const [showDownloadPicker, setShowDownloadPicker] = useState(false)
  const [selectedTrackIndices, setSelectedTrackIndices] = useState<number[]>([])
  const [downloadTracks, setDownloadTracks] = useState<AudioTrack[]>([])
  const query = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => client.getItem(itemId),
    staleTime: 60 * 1000,
  })
  const item = query.data
  const offline = offlineBooks.find((book) => book.itemId === itemId)
  const isDownloaded = offline?.status === 'downloaded'
  const canPlay = item ? item.audioTracks.length > 0 || item.duration > 0 : false
  const canRead = item ? Boolean(item.ebookFormat) : false
  const playBlocked = !isOnline && !isDownloaded

  if (query.isPending) {
    return <main className="screen"><p className="muted" style={{ textAlign: 'center', padding: '48px 0' }}>Loading…</p></main>
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

  const currentItem = item
  const progressPct = Math.round((item.progress ?? 0) * 100)
  const hasProgress = progressPct > 0
  const downloadedTrackIndices = new Set(offline?.tracks.map((track) => track.trackIndex) ?? [])
  const downloadedTrackCount = offline?.tracks.length ?? 0
  const knownDownloadableTrackCount = offline?.totalTracks
    ?? (currentItem.audioTracks.length > 0 ? currentItem.audioTracks.length : currentItem.chapters.length)
  const downloadableTrackCount = Math.max(knownDownloadableTrackCount, downloadedTrackCount)
  const offlineProgressPct = downloadableTrackCount > 0
    ? Math.min(100, Math.round((downloadedTrackCount / downloadableTrackCount) * 100))
    : isDownloaded ? 100 : 0
  const hasOfflineProgress = canPlay && Boolean(offline) && (offline?.status === 'downloading' || downloadedTrackCount > 0)
  const downloadUnit = downloadableTrackCount === currentItem.chapters.length ? 'chapters' : 'tracks'
  const offlineProgressLabel = offline?.status === 'downloading'
    ? `Downloading ${downloadedTrackCount} of ${downloadableTrackCount} ${downloadUnit}`
    : `${downloadedTrackCount} of ${downloadableTrackCount} ${downloadUnit} saved`

  function toggleTrack(index: number) {
    setSelectedTrackIndices((current) => (
      current.includes(index)
        ? current.filter((value) => value !== index)
        : [...current, index].sort((a, b) => a - b)
    ))
  }

  async function handleDownload() {
    if (!canPlay) {
      await downloadCurrentBook(currentItem)
      return
    }

    const tracks = currentItem.audioTracks.length > 0
      ? currentItem.audioTracks
      : (await client.startPlayback(currentItem.id)).audioTracks

    setDownloadTracks(tracks)
    setSelectedTrackIndices([])
    setShowDownloadPicker(true)
  }

  async function confirmSelectedDownload() {
    await downloadCurrentBook(currentItem, { selectedTrackIndices })
    setShowDownloadPicker(false)
    setSelectedTrackIndices([])
    setDownloadTracks([])
  }

  async function handleRemoveDownloadedTrack(track: AudioTrack) {
    setSelectedTrackIndices((current) => current.filter((index) => downloadTracks[index]?.index !== track.index))
    await removeOfflineTracks(currentItem.id, [track.index])
  }

  return (
    <main className="screen book-detail">
      <button className="bd-back" onClick={() => navigate(-1)}>
        <IconChevronLeft />
        Back
      </button>

      {/* Cover hero — full-width, centered. Two <img> tags so non-1:1 covers
          get the same blurred-backdrop fill as the library grid and player,
          instead of the bare --surface-dark letterbox bars. */}
      <div className="bd-cover-wrap">
        <div className="bd-cover">
          {item.coverPath ? (
            <>
              <img className="cover-img-bg" src={client.coverUrl(item.id)} alt="" aria-hidden="true" />
              <img className="cover-img cover-img-loaded" src={client.coverUrl(item.id)} alt={item.title} />
            </>
          ) : null}
        </div>
      </div>

      {/* Title block */}
      <div className="bd-title-block">
        <h1 className="bd-title">{item.title}</h1>
        <p className="bd-author">{item.author}</p>
        <p className="bd-format">
          {canPlay ? formatDuration(item.duration) : 'Ebook'}
          {item.ebookFormat ? ` · ${item.ebookFormat.toUpperCase()}` : ''}
        </p>
      </div>

      {/* Actions */}
      <div className="bd-actions">
        {canPlay ? (
          <button
            className="primary-button bd-action-main"
            onClick={() => void startBook(item)}
            disabled={playBlocked}
            title={playBlocked ? 'Not available offline — download first' : undefined}
          >
            {playBlocked
              ? 'Offline — not downloaded'
              : item.currentTime > 0 ? `Resume · ${formatDuration(item.currentTime)}` : 'Play'}
          </button>
        ) : null}
        {canRead ? (
          playBlocked ? (
            <button
              className={clsx(canPlay ? 'ghost-button' : 'primary-button', 'bd-action-main')}
              disabled
              title="Not available offline — download first"
            >
              Offline — not downloaded
            </button>
          ) : (
            <Link className={clsx(canPlay ? 'ghost-button' : 'primary-button', 'bd-action-main')} to={`/read/${item.id}`} replace>
              {item.ebookLocation ? 'Continue reading' : 'Read'}
            </Link>
          )
        ) : null}
        {canPlay || canRead ? (
          showDownloadPicker ? (
            <div className="bd-download-actions">
              <button
                className="primary-button bd-action-secondary"
                disabled={selectedTrackIndices.length === 0}
                onClick={() => void confirmSelectedDownload()}
              >
                Download selected
              </button>
              <button
                className="ghost-button bd-action-secondary"
                onClick={() => {
                  setShowDownloadPicker(false)
                  setSelectedTrackIndices([])
                  setDownloadTracks([])
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button className="ghost-button bd-action-secondary" onClick={() => void handleDownload()}>
              {offline?.status === 'downloaded'
                ? <><IconRefresh /> Redownload</>
                : <><IconDownload /> Download</>}
            </button>
          )
        ) : null}
      </div>

      {canPlay && showDownloadPicker ? (
        <div className="bd-track-picker">
          <div className="section-heading">
            <h3 className="bd-section-title">Select tracks to download</h3>
            <span className="muted">
              {selectedTrackIndices.length} selected
              {downloadedTrackCount > 0 ? ` · ${downloadedTrackCount} downloaded` : ''}
            </span>
          </div>
          <div className="chapter-list">
            {downloadTracks.map((track, index) => {
              const isSelected = selectedTrackIndices.includes(index)
              const isSaved = downloadedTrackIndices.has(track.index)

              if (isSaved) {
                return (
                  <div
                    key={`${track.index}-${track.title}`}
                    className="chapter-row bd-download-row downloaded"
                  >
                    <span className="bd-download-copywrap">
                      <strong>{track.title}</strong>
                      <span>{formatDuration(track.duration)} · Downloaded</span>
                    </span>
                    <button
                      type="button"
                      className="ghost-button danger-button bd-download-remove"
                      onClick={() => void handleRemoveDownloadedTrack(track)}
                    >
                      Remove
                    </button>
                  </div>
                )
              }

              return (
                <button
                  key={`${track.index}-${track.title}`}
                  className={clsx('chapter-row', 'bd-download-row', {
                    active: isSelected,
                  })}
                  onClick={() => toggleTrack(index)}
                >
                  <span className="bd-download-copywrap">
                    <strong>{track.title}</strong>
                    <span>{formatDuration(track.duration)}</span>
                  </span>
                  <span className="bd-download-check" aria-hidden="true">
                    {isSelected ? <IconCheck /> : <IconSquare />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {hasOfflineProgress ? (
        <div className="bd-progress-section bd-offline-progress-section" aria-label="Offline download progress">
          <div className="bd-progress-track">
            <div className="bd-progress-fill" style={{ width: `${offlineProgressPct}%` }} />
          </div>
          <span className="bd-progress-label">{offlineProgressPct}% offline · {offlineProgressLabel}</span>
        </div>
      ) : null}

      {/* Progress bar (only if started) */}
      {hasProgress ? (
        <div className="bd-progress-section">
          <div className="bd-progress-track">
            <div className="bd-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="bd-progress-label">{progressPct}% complete</span>
        </div>
      ) : null}

      {/* Stats strip */}
      <div className="bd-stats">
        <div className="bd-stat">
          <span className="bd-stat-value">{formatProgress(item.progress)}</span>
          <span className="bd-stat-label">Progress</span>
        </div>
        <div className="bd-stat-divider" />
        <div className="bd-stat">
          <span className="bd-stat-value">{canPlay ? item.chapters.length : item.ebookFormat?.toUpperCase()}</span>
          <span className="bd-stat-label">{canPlay ? 'Chapters' : 'Format'}</span>
        </div>
        <div className="bd-stat-divider" />
        <div className="bd-stat">
          <span className="bd-stat-value">
            {canPlay
              ? (hasOfflineProgress ? `${offlineProgressPct}%` : (offline?.status === 'downloaded' ? '✓' : '—'))
              : formatProgress(item.ebookProgress)}
          </span>
          <span className="bd-stat-label">{canPlay ? 'Offline' : 'Read'}</span>
        </div>
      </div>

      {/* Synopsis */}
      {item.description?.trim() ? (
        <div className={clsx('bd-description', { expanded: descExpanded })}>
          <h3 className="bd-section-title">Synopsis</h3>
          <p>{item.description.trim().replace(/\s+/g, ' ')}</p>
          <button className="bd-description-toggle" onClick={() => setDescExpanded(!descExpanded)}>
            {descExpanded ? 'Show less' : '... more'}
          </button>
        </div>
      ) : null}

      {/* Narration & Media */}
      {canPlay ? (
        <div className="bd-info-section">
          <h3 className="bd-section-title">Narration &amp; Media</h3>
          <dl className="bd-info-grid">
            {item.narrator ? (
              <div className="bd-info-row">
                <dt>Narrator</dt>
                <dd>{item.narrator}</dd>
              </div>
            ) : null}
            <div className="bd-info-row">
              <dt>Duration</dt>
              <dd>{formatDuration(item.duration)}</dd>
            </div>
            {item.size ? (
              <div className="bd-info-row">
                <dt>Size</dt>
                <dd>{formatBytes(item.size)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {/* Chapters */}
      {canPlay && item.chapters.length > 0 ? (
        <div className="bd-chapters">
          <h3 className="bd-section-title">Chapters</h3>
          <div className="chapter-list">
            {item.chapters.map((chapter, index) => {
              const chapterTrackIndex = trackIndexForChapterStart(currentItem.audioTracks, chapter.start, index)
              const isChapterSaved = downloadedTrackIndices.has(chapterTrackIndex)

              return (
                <button
                  key={chapter.id}
                  className={clsx('chapter-row', { downloaded: isChapterSaved })}
                  onClick={() => {
                    if (activePlayback?.item.id === item.id) {
                      seekTo(chapter.start)
                    } else {
                      void startBook(item, chapter.start)
                    }
                  }}
                >
                  <strong>{chapter.title}</strong>
                  <span className="bd-chapter-meta">
                    {isChapterSaved ? (
                      <span className="bd-chapter-saved">
                        <IconCheck />
                        Downloaded
                      </span>
                    ) : null}
                    <span>{formatDuration(chapter.start)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </main>
  )
}
