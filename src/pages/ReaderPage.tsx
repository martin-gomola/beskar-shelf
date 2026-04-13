import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import ePub from 'epubjs'

import { useAppContext } from '../contexts/AppContext'
import { formatProgress } from '../lib/utils'

function ReaderPage() {
  const { itemId } = useParams() as { itemId: string }
  const { client } = useAppContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [locationLabel, setLocationLabel] = useState('')
  const [readerProgress, setReaderProgress] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [readerApi, setReaderApi] = useState<{ next: () => void; prev: () => void } | null>(null)
  const query = useQuery({
    queryKey: ['item', itemId],
    queryFn: () => client.getItem(itemId),
    staleTime: 60 * 1000,
  })
  const item = query.data
  const isPdf = item?.ebookFormat === 'pdf'

  const commitReaderProgress = useEffectEvent(async (payload: { cfi: string; progress: number }) => {
    if (!item) {
      return
    }

    try {
      await client.updateProgress(item.id, {
        duration: item.duration,
        progress: item.progress,
        currentTime: item.currentTime,
        isFinished: item.isFinished,
        ebookLocation: payload.cfi,
        ebookProgress: payload.progress,
        startedAt: Date.now(),
      })
      await queryClient.invalidateQueries({ queryKey: ['item', item.id] })
    } catch (error) {
      console.error(error)
    }
  })

  useEffect(() => {
    const isPdfFormat = item?.ebookFormat === 'pdf'
    if (!item || !containerRef.current || !item.ebookFormat || isPdfFormat) {
      return
    }

    let cancelled = false
    let book: ReturnType<typeof ePub> | null = null
    let rendition: ReturnType<ReturnType<typeof ePub>['renderTo']> | null = null

    void (async () => {
      const response = await fetch(client.ebookUrl(item.id))
      const epubBuffer = await response.arrayBuffer()
      if (cancelled) {
        return
      }

      book = ePub(epubBuffer)
      rendition = book.renderTo(containerRef.current!, {
        width: '100%',
        height: '100%',
        flow: 'paginated',
      })
      const readyBook = book
      const readyRendition = rendition

      await readyBook.ready
      await readyBook.locations.generate(1200)
      if (cancelled) {
        return
      }

      readyRendition.themes.default({
        body: {
          background: '#f5efe4',
          color: '#1f1a15',
          'font-family': 'Georgia, serif',
          'line-height': '1.7',
        },
      })

      readyRendition.on('relocated', (location: { start?: { cfi?: string; href?: string } }) => {
        const cfi = location.start?.cfi ?? null
        const href = location.start?.href ?? ''
        const progress = cfi ? Number(readyBook.locations.percentageFromCfi(cfi) || 0) : 0
        setReaderProgress(progress)
        setLocationLabel(href || cfi || 'Beginning')
        if (cfi) {
          void commitReaderProgress({ cfi, progress })
        }
      })

      await readyRendition.display(item.ebookLocation || undefined)
      setReaderApi({
        next: () => void readyRendition.next(),
        prev: () => void readyRendition.prev(),
      })
      setIsReady(true)
    })()

    return () => {
      cancelled = true
      rendition?.destroy()
      book?.destroy()
      setReaderApi(null)
    }
  }, [client, item])

  if (query.isPending) {
    return <main className="screen"><section className="card"><p className="muted">Loading reader…</p></section></main>
  }

  if (query.error || !item || !item.ebookFormat) {
    return (
      <main className="screen">
        <section className="card">
          <h2>Reader unavailable</h2>
          <p className="muted">{(query.error as Error | null)?.message ?? 'This item does not have a readable ebook file.'}</p>
        </section>
      </main>
    )
  }

  return (
    <main className="screen reader-screen">
      <section className="reader-toolbar card">
        <div>
          <p className="eyebrow">Reading</p>
          <h2>{item.title}</h2>
          <p className="muted">{item.author}</p>
        </div>
        <div className="reader-actions">
          <button className="ghost-button" onClick={() => navigate(`/book/${item.id}`)}>Details</button>
          <a className="ghost-button" href={client.ebookUrl(item.id)} target="_blank" rel="noreferrer">Open file</a>
        </div>
      </section>

      <section className="reader-meta">
        <div className="card reader-stat">
          <span className="stat-label">Format</span>
          <strong>{item.ebookFormat.toUpperCase()}</strong>
        </div>
        <div className="card reader-stat">
          <span className="stat-label">Progress</span>
          <strong>{formatProgress(readerProgress || item.ebookProgress)}</strong>
        </div>
        <div className="card reader-stat">
          <span className="stat-label">Location</span>
          <strong>{locationLabel || item.ebookLocation || 'Start'}</strong>
        </div>
      </section>

      <section className="reader-stage card">
        {item.ebookFormat === 'pdf' ? (
          <iframe className="reader-frame" src={client.ebookUrl(item.id)} title={item.title} />
        ) : (
          <div ref={containerRef} className="reader-frame" />
        )}
      </section>

      <section className="reader-controls">
        <button className="ghost-button" disabled={!(isPdf || isReady)} onClick={() => readerApi?.prev()}>Previous</button>
        <button className="ghost-button" disabled={!(isPdf || isReady)} onClick={() => readerApi?.next()}>Next</button>
      </section>
    </main>
  )
}

export default ReaderPage
