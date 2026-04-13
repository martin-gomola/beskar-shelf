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
      <section className="screen-header">
        <div>
          <h1>Discovery</h1>
        </div>
        {primary ? <Link className="ghost-button" to={`/library/${primary.id}`}>Browse all</Link> : null}
      </section>

      <section className="library-pills">
        {(librariesQuery.data ?? []).map((library) => (
          <Link key={library.id} className="pill-link" to={`/library/${library.id}`}>
            {library.name}
          </Link>
        ))}
      </section>

      {playbackState ? (
        <section className="resume-banner card">
          <div>
            <p className="eyebrow">Resume listening</p>
            <p style={{ fontWeight: 500 }}>{formatDuration(playbackState.currentTime)} listened</p>
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
