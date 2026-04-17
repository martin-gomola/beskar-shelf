import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { useAppContext } from '../contexts/AppContext'
import { useClient } from '../contexts/ClientContext'
import { usePrimaryLibrary } from '../hooks/useLibraries'
import { BookCard } from '../components/BookCard'
import { QueryState } from '../components/QueryState'
import type { BookItem } from '../lib/types'
import { formatDuration } from '../lib/utils'

function ShelfSection({ shelves }: { shelves: { id: string; label: string; entities: BookItem[] }[] }) {
  return (
    <>
      {shelves.map((shelf) => (
        <section key={shelf.id} className="shelf-block">
          <div className="section-heading">
            <h3>{shelf.label}</h3>
          </div>
          <div className="cover-row">
            {shelf.entities.slice(0, 12).map((item) => (
              <BookCard key={item.id} item={item} eager />
            ))}
          </div>
        </section>
      ))}
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

      <section className="library-toolbar">
        <div className="library-pills">
          {(librariesQuery.data ?? []).map((library) => (
            <Link key={library.id} className="pill-link" to={`/library/${library.id}`}>
              {library.name}
            </Link>
          ))}
        </div>
        {primary ? <Link className="text-link" to={`/library/${primary.id}`}>Browse all</Link> : null}
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
      >
        {personalizedQuery.data?.length
          ? <ShelfSection shelves={personalizedQuery.data} />
          : <section className="card"><p className="muted">No books found. Add some to your Audiobookshelf library.</p></section>
        }
      </QueryState>
    </main>
  )
}
