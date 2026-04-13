import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'

import { useAppContext } from '../contexts/AppContext'
import { usePrimaryLibrary } from '../hooks/useLibraries'
import { BookCard } from '../components/BookCard'

const PAGE_SIZE = 40
const COLUMNS_ESTIMATE = 4
const ROW_HEIGHT = 260

export function LibraryPage() {
  const { libraryId } = useParams() as { libraryId: string }
  const { client } = useAppContext()
  const { librariesQuery } = usePrimaryLibrary()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const parentRef = useRef<HTMLDivElement>(null)

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
    if (!deferredSearch) {
      return allItems
    }
    const needle = deferredSearch.toLowerCase()
    return allItems.filter((item) => {
      const haystack = `${item.title} ${item.author}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [allItems, deferredSearch])

  const rows = useMemo(() => {
    const result: (typeof filtered[number])[][] = []
    for (let i = 0; i < filtered.length; i += COLUMNS_ESTIMATE) {
      result.push(filtered.slice(i, i + COLUMNS_ESTIMATE))
    }
    return result
  }, [filtered])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  })

  const fetchMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage()
    }
  }, [query])

  useEffect(() => {
    const items = virtualizer.getVirtualItems()
    const lastItem = items[items.length - 1]
    if (lastItem && lastItem.index >= rows.length - 2) {
      fetchMore()
    }
  }, [virtualizer.getVirtualItems(), rows.length, fetchMore])

  const libraryName = librariesQuery.data?.find((library) => library.id === libraryId)?.name ?? 'Library'

  return (
    <main className="screen library-screen">
      <section className="screen-header">
        <div>
          <p className="eyebrow">Library</p>
          <h1>{libraryName}</h1>
        </div>
      </section>
      <section className="library-pills">
        {(librariesQuery.data ?? []).map((library) => (
          <Link
            key={library.id}
            className={clsx('pill-link', { active: library.id === libraryId })}
            to={`/library/${library.id}`}
          >
            {library.name}
          </Link>
        ))}
      </section>
      <label className="field search-field">
        <span>Search</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Author or title" />
      </label>

      {query.isPending ? (
        <section className="card"><p className="muted">Loading…</p></section>
      ) : query.error ? (
        <section className="card">
          <h2>Request failed</h2>
          <p className="muted">{(query.error as Error).message}</p>
        </section>
      ) : (
        <div ref={parentRef} className="library-scroll-container">
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                className="book-grid"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {rows[virtualRow.index].map((item) => (
                  <BookCard key={item.id} item={item} />
                ))}
              </div>
            ))}
          </div>
          {query.isFetchingNextPage ? (
            <p className="muted" style={{ textAlign: 'center', padding: '16px' }}>Loading more…</p>
          ) : null}
        </div>
      )}
    </main>
  )
}
