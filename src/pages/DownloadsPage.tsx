import { Link } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'
import { formatBytes, getOfflineBookBytes } from '../lib/utils'

function DownloadsPage() {
  const { offlineBooks, removeOfflineBook } = useAppContext()

  return (
    <main className="screen downloads-screen">
      <section className="screen-header">
        <div>
          <p className="eyebrow">Downloads</p>
          <h1>Offline books</h1>
        </div>
      </section>
      <section className="card">
        {offlineBooks.length === 0 ? (
          <p className="muted">No offline books yet.</p>
        ) : (
          <div className="download-list">
            {offlineBooks.map((book) => (
              <div key={book.itemId} className="download-row">
                <Link className="download-link" to={`/book/${book.itemId}`}>
                  <strong>{book.title}</strong>
                  <p>{book.author}</p>
                  <span className="muted">{formatBytes(getOfflineBookBytes(book))}</span>
                </Link>
                <div className="download-actions">
                  <Link className="ghost-button" to={`/book/${book.itemId}`}>Open</Link>
                  <button className="ghost-button" onClick={() => void removeOfflineBook(book.itemId)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default DownloadsPage
