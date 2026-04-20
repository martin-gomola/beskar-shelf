import { memo, useCallback, useState } from 'react'
import { Link } from 'react-router-dom'

import { useClient } from '../contexts/ClientContext'
import type { BookItem } from '../lib/types'

export const BookCard = memo(function BookCard({ item, eager }: { item: BookItem; eager?: boolean }) {
  const client = useClient()
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const coverUrl = item.coverPath ? client.coverUrl(item.id) : null

  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true)
  }, [])

  return (
    <Link className="book-card" to={`/book/${item.id}`}>
      <div className="cover">
        {coverUrl && !failed ? (
          <>
            {/* Decorative blurred copy of the cover that fills any letterbox
                bars on non-1:1 art. Same src as the foreground img so the
                browser only does one network fetch per card. */}
            <img
              className="cover-img-bg"
              src={coverUrl}
              alt=""
              aria-hidden="true"
              loading={eager ? 'eager' : 'lazy'}
            />
            <img
              ref={imgRef}
              className={`cover-img${loaded ? ' cover-img-loaded' : ''}`}
              src={coverUrl}
              alt={item.title}
              loading={eager ? 'eager' : 'lazy'}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          </>
        ) : null}
      </div>
      <strong>{item.title}</strong>
      <span>{item.author}</span>
    </Link>
  )
})
