import { useAppContext } from '../contexts/AppContext'

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
                <div>
                  <strong>{book.title}</strong>
                  <p>{book.author}</p>
                  <span className="muted">{Math.round(book.totalBytes / 1024 / 1024)} MB</span>
                </div>
                <button className="ghost-button" onClick={() => void removeOfflineBook(book.itemId)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default DownloadsPage
