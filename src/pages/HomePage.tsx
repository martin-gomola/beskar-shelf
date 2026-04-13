import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { useAppContext } from '../contexts/AppContext'
import { usePrimaryLibrary } from '../hooks/useLibraries'
import { BookCard } from '../components/BookCard'
import { QueryState } from '../components/QueryState'
import type { BookItem } from '../lib/types'
import { formatDuration } from '../lib/utils'

function ShelfSection({ title, shelves }: { title: string; shelves: { id: string; label: string; entities: BookItem[] }[] }) {
  return (
    <section className="shelf-section">
      <div className="section-heading">
        <h2>{title}</h2>
      </div>
      {shelves.map((shelf) => (
        <div key={shelf.id} className="shelf-block">
          <div className="section-heading">
            <h3>{shelf.label}</h3>
          </div>
          <div className="cover-row">
            {shelf.entities.slice(0, 8).map((item) => (
              <BookCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

export function HomePage() {
  const { librariesQuery, primary } = usePrimaryLibrary()
  const { client, playbackState } = useAppContext()
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
          <p className="eyebrow">Home</p>
          <h1>Pick up where you left off.</h1>
        </div>
        {primary ? <Link className="ghost-button" to={`/library/${primary.id}`}>Browse library</Link> : null}
      </section>

      <section className="library-pills">
        {(librariesQuery.data ?? []).map((library) => (
          <Link key={library.id} className="pill-link" to={`/library/${library.id}`}>
            {library.name}
            {library.audiobooksOnly ? ' • Listen' : ' • Read'}
          </Link>
        ))}
      </section>

      {playbackState ? (
        <section className="resume-banner card">
          <p className="eyebrow">Resume</p>
          <p>{formatDuration(playbackState.currentTime)} listened recently.</p>
          <Link className="primary-button" to="/player">Open player</Link>
        </section>
      ) : null}

      <QueryState
        isPending={personalizedQuery.isPending}
        error={personalizedQuery.error as Error | null}
      >
        <ShelfSection title="Your library" shelves={personalizedQuery.data ?? []} />
      </QueryState>
    </main>
  )
}
