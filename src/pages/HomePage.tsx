import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { useAppContext } from '../contexts/AppContext'
import { useClient } from '../contexts/ClientContext'
import { usePrimaryLibrary } from '../hooks/useLibraries'
import { BookCard } from '../components/BookCard'
import { QueryState } from '../components/QueryState'
import type { BookItem } from '../lib/types'
import { formatDuration } from '../lib/utils'

/**
 * Loading state placeholder that mimics the final shelf shape. Showing two
 * skeleton rows (instead of "Loading…" text) means the layout doesn't shift
 * on first paint and the user can already see *where* content will land.
 * Repeats are static so the shimmer comes from CSS animation, not React.
 */
function ShelfSkeleton() {
  return (
    <>
      {[0, 1].map((row) => (
        <section key={row} className="shelf-block" aria-busy="true">
          <div className="section-heading">
            <div className="skeleton skeleton-heading" />
          </div>
          <div className="cover-row">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton-card">
                <div className="skeleton skeleton-cover" />
                <div className="skeleton skeleton-line skeleton-line-title" />
                <div className="skeleton skeleton-line skeleton-line-author" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

function ShelfSection({ shelves }: { shelves: { id: string; label: string; entities: BookItem[] }[] }) {
  return (
    <>
      {shelves.map((shelf) => {
        // Cap matches the .cover-row .slice(0, 12) below — shows "12+" when
        // truncated so the user knows there's more than what's visible.
        const total = shelf.entities.length
        const display = total > 12 ? '12+' : String(total)
        return (
          <section key={shelf.id} className="shelf-block">
            <div className="section-heading">
              <h3>{shelf.label}</h3>
              {total > 0 ? <span className="shelf-count">{display}</span> : null}
            </div>
            <div className="cover-row">
              {shelf.entities.slice(0, 12).map((item) => (
                <BookCard key={item.id} item={item} eager />
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}

export function HomePage() {
  const { librariesQuery, primary } = usePrimaryLibrary()
  const client = useClient()
  const { playbackState } = useAppContext()
  const personalizedQuery = useQuery({
    queryKey: ['personalized', primary?.id],
    queryFn: () => client.getPersonalized(primary!.id),
    enabled: Boolean(primary?.id),
    staleTime: 2 * 60 * 1000,
  })

  return (
    <main className="screen home-screen">
      <section className="home-header">
        <div className="home-header-copy">
          <div className="brand-lockup brand-lockup-compact home-brand">
            <img className="brand-mark brand-mark-small" src="/pwa-icon.svg" alt="" aria-hidden="true" />
            <div>
              <p className="eyebrow">Beskar Shelf</p>
              <h1>Discovery</h1>
            </div>
          </div>
          {/* <p className="home-subtitle">Pick a library and get back to listening.</p> */}
        </div>
      </section>

      {playbackState ? (
        <section className="resume-banner card">
          <div>
            <p className="eyebrow">Resume listening</p>
            <p style={{ fontWeight: 600 }}>{formatDuration(playbackState.currentTime)} logged</p>
            <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Jump straight back into your current session.</p>
          </div>
          <Link className="primary-button" to="/player">Open player</Link>
        </section>
      ) : null}

      <QueryState
        isPending={librariesQuery.isPending || personalizedQuery.isPending && !personalizedQuery.isError}
        error={librariesQuery.error ?? personalizedQuery.error as Error | null}
        pendingFallback={<ShelfSkeleton />}
      >
        {personalizedQuery.data?.length
          ? <ShelfSection shelves={personalizedQuery.data} />
          : <section className="card"><p className="muted">No books found. Add some to your Audiobookshelf library.</p></section>
        }
      </QueryState>
    </main>
  )
}
