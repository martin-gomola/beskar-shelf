import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'

import { useAppContext } from '../contexts/AppContext'
import { formatDuration, formatProgress } from '../lib/utils'

function compactDescription(text: string) {
  return text.trim().replace(/\s+/g, ' ')
}

export function BookPage() {
  const { itemId } = useParams() as { itemId: string }
  const { client, startBook, downloadCurrentBook, offlineBooks } = useAppContext()
  const query = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => client.getItem(itemId),
    staleTime: 60 * 1000,
  })
  const item = query.data
  const offline = offlineBooks.find((book) => book.itemId === itemId)
  const canPlay = item ? item.audioTracks.length > 0 || item.duration > 0 : false
  const canRead = item ? Boolean(item.ebookFormat) : false

  if (query.isPending) {
    return <main className="screen"><section className="card"><p className="muted">Loading…</p></section></main>
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

  return (
    <main className="screen book-screen">
      <section className="book-hero">
        <div
          className="cover cover-large"
          style={{ backgroundImage: item.coverPath ? `url(${client.assetUrl(item.coverPath)})` : undefined }}
        />
        <div className="book-meta">
          <p className="eyebrow">Book</p>
          <h1>{item.title}</h1>
          <p className="author-line">{item.author}</p>
          <p className="muted">
            {canPlay ? `${formatDuration(item.duration)} total` : 'Reading item'}
            {item.ebookFormat ? ` • ${item.ebookFormat.toUpperCase()} available on server` : ''}
          </p>
          <div className="button-row">
            {canPlay ? (
              <button className="primary-button" onClick={() => void startBook(item)}>
                {item.currentTime > 0 ? `Resume from ${formatDuration(item.currentTime)}` : 'Play now'}
              </button>
            ) : null}
            {canRead ? (
              <Link className={clsx(canPlay ? 'ghost-button' : 'primary-button')} to={`/read/${item.id}`}>
                {item.ebookLocation ? 'Resume reading' : 'Read now'}
              </Link>
            ) : null}
            {canPlay ? (
              <button className="ghost-button" onClick={() => void downloadCurrentBook(item)}>
                {offline?.status === 'downloaded' ? 'Redownload' : 'Download offline'}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="stats-row">
          <div>
            <span className="stat-label">Progress</span>
            <strong>{formatProgress(item.progress)}</strong>
          </div>
          <div>
            <span className="stat-label">{canPlay ? 'Chapters' : 'Reader'}</span>
            <strong>{canPlay ? item.chapters.length : item.ebookFormat?.toUpperCase()}</strong>
          </div>
          <div>
            <span className="stat-label">{canPlay ? 'Offline' : 'Reading progress'}</span>
            <strong>{canPlay ? (offline?.status === 'downloaded' ? 'Ready' : 'Streaming') : formatProgress(item.ebookProgress)}</strong>
          </div>
        </div>
        <p>{compactDescription(item.description) || 'No description from Audiobookshelf.'}</p>
      </section>

      {canPlay ? <section className="card">
        <div className="section-heading">
          <h2>Chapters</h2>
        </div>
        <div className="chapter-list">
          {item.chapters.length > 0 ? item.chapters.map((chapter) => (
            <div key={chapter.id} className="chapter-row">
              <strong>{chapter.title}</strong>
              <span>{formatDuration(chapter.start)}</span>
            </div>
          )) : <p className="muted">No chapter markers on this item.</p>}
        </div>
      </section> : null}
    </main>
  )
}
