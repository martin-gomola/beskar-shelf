import { memo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'
import type { BookItem } from '../lib/types'

export const BookCard = memo(function BookCard({ item }: { item: BookItem }) {
  const { client } = useAppContext()
  const [loaded, setLoaded] = useState(false)
  const coverUrl = item.coverPath ? client.assetUrl(item.coverPath) : null

  return (
    <Link className="book-card" to={`/book/${item.id}`}>
      <div className="cover">
        {coverUrl ? (
          <img
            className={`cover-img${loaded ? ' cover-img-loaded' : ''}`}
            src={coverUrl}
            alt={item.title}
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        ) : null}
      </div>
      <strong>{item.title}</strong>
      <span>{item.author}</span>
    </Link>
  )
})
