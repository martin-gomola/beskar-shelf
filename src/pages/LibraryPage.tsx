import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import clsx from 'clsx'

import { useAppContext } from '../contexts/AppContext'
import { useClient } from '../contexts/ClientContext'
import { usePrimaryLibrary } from '../hooks/useLibraries'
import { BookCard } from '../components/BookCard'

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}

const PAGE_SIZE = 40

export function LibraryPage() {
  const { libraryId } = useParams() as { libraryId: string }
  const client = useClient()
  const { offlineBooks } = useAppContext()
  const { librariesQuery } = usePrimaryLibrary()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const deferredSearch = useDeferredValue(search)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const query = useInfiniteQuery({
    queryKey: ['library-paginated', libraryId],
    queryFn: ({ pageParam }) => client.getLibraryItemsPaginated(libraryId, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.results.length, 0)
      return loaded < lastPage.total ? allPages.length : undefined
    },
    staleTime: 5 * 60 * 1000,
  })

  const allItems = useMemo(
    () => query.data?.pages.flatMap((page) => page.results) ?? [],
    [query.data],
  )

  const filtered = useMemo(() => {
    if (!deferredSearch) return allItems
    const needle = deferredSearch.toLowerCase()
    return allItems.filter((item) =>
      `${item.title} ${item.author}`.toLowerCase().includes(needle),
    )
  }, [allItems, deferredSearch])

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query

  const fetchMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) fetchMore() },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [fetchMore])

  const libraryName = librariesQuery.data?.find((library) => library.id === libraryId)?.name ?? 'Library'
  const totalLoaded = allItems.length
  const totalAvailable = query.data?.pages[0]?.total ?? 0

  return (
    <main className="screen library-screen">
      <section className="screen-header">
        <h2>{libraryName}</h2>
      </section>

      <section className="library-toolbar">
        <div className="library-pills">
          {(librariesQuery.data ?? []).map((library) => (
            <Link
              key={library.id}
              className={clsx('pill-link', { active: library.id === libraryId })}
              to={`/library/${library.id}`}
            >
              {library.name}
            </Link>
          ))}
        </div>
        <div className="view-toggle">
          <button
            className={clsx('view-toggle-btn', { active: viewMode === 'grid' })}
            onClick={() => setViewMode('grid')}
            aria-label="Grid view"
          >
            <IconGrid />
          </button>
          <button
            className={clsx('view-toggle-btn', { active: viewMode === 'list' })}
            onClick={() => setViewMode('list')}
            aria-label="List view"
          >
            <IconList />
          </button>
        </div>
      </section>

      <label className="field search-field">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by author or title…" />
      </label>

      {query.isPending ? (
        <p className="muted" style={{ textAlign: 'center', padding: '40px 0' }}>Loading…</p>
      ) : query.error ? (
        <section className="card">
          <h2>Request failed</h2>
          <p className="muted">{(query.error as Error).message}</p>
        </section>
      ) : viewMode === 'grid' ? (
        <>
          <div className="book-grid">
            {filtered.map((item) => (
              <BookCard key={item.id} item={item} />
            ))}
          </div>
          <div ref={sentinelRef} style={{ height: 1 }} />
          {query.isFetchingNextPage ? (
            <p className="muted" style={{ textAlign: 'center', padding: '16px' }}>Loading more…</p>
          ) : null}
          {!query.hasNextPage && totalLoaded > 0 ? (
            <p className="muted" style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem' }}>
              {totalLoaded} of {totalAvailable} books
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="book-list">
            {filtered.map((item) => (
              <BookListItem key={item.id} item={item} isOffline={offlineBooks.some((b) => b.itemId === item.id && b.status === 'downloaded')} />
            ))}
          </div>
          <div ref={sentinelRef} style={{ height: 1 }} />
          {query.isFetchingNextPage ? (
            <p className="muted" style={{ textAlign: 'center', padding: '16px' }}>Loading more…</p>
          ) : null}
          {!query.hasNextPage && totalLoaded > 0 ? (
            <p className="muted" style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem' }}>
              {totalLoaded} of {totalAvailable} books
            </p>
          ) : null}
        </>
      )}
    </main>
  )
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function BookListItem({ item, isOffline }: { item: { id: string; title: string; author: string; coverPath: string | null }; isOffline?: boolean }) {
  const client = useClient()
  const coverUrl = item.coverPath ? client.coverUrl(item.id) : null

  return (
    <Link className="book-list-item" to={`/book/${item.id}`}>
      <div className="book-list-cover">
        {coverUrl ? <img src={coverUrl} alt="" loading="lazy" /> : null}
      </div>
      <div className="book-list-info">
        <strong>{item.title}</strong>
        <span>{item.author}</span>
      </div>
      {isOffline ? <span className="book-list-check"><IconCheck /></span> : null}
    </Link>
  )
}
