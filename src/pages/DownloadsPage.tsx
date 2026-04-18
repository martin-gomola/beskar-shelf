import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAppContext } from '../contexts/AppContext'
import { useClient } from '../contexts/ClientContext'
import { usePrimaryLibrary } from '../hooks/useLibraries'
import { formatBytes, getOfflineBookBytes } from '../lib/utils'

function IconBook() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function IconCloudOff() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 2l20 20" />
      <path d="M5.78 5.78A6 6 0 0 0 8 17h11" />
      <path d="M9 4a6 6 0 0 1 11 4 4 4 0 0 1-1.7 7.6" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function DownloadsPage() {
  const client = useClient()
  const { offlineBooks, removeOfflineBook } = useAppContext()
  const { primary } = usePrimaryLibrary()

  const [editing, setEditing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [removing, setRemoving] = useState(false)

  const summary = useMemo(() => {
    const downloaded = offlineBooks.filter((book) => book.status === 'downloaded')
    const totalBytes = downloaded.reduce((sum, book) => sum + getOfflineBookBytes(book), 0)
    return { count: downloaded.length, totalBytes }
  }, [offlineBooks])

  // Reconcile selection set against book list (in case items disappear).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const ids = new Set(offlineBooks.map((book) => book.itemId))
      const next = new Set<string>()
      for (const id of prev) {
        if (ids.has(id)) next.add(id)
      }
      return next.size === prev.size ? prev : next
    })
  }, [offlineBooks])

  // Exit edit mode automatically when the list becomes empty.
  useEffect(() => {
    if (offlineBooks.length === 0 && editing) {
      setEditing(false)
      setSelectedIds(new Set())
    }
  }, [offlineBooks.length, editing])

  const allSelected = offlineBooks.length > 0 && selectedIds.size === offlineBooks.length

  const toggleEdit = useCallback(() => {
    setEditing((prev) => {
      const next = !prev
      if (!next) setSelectedIds(new Set())
      return next
    })
  }, [])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === offlineBooks.length) return new Set()
      return new Set(offlineBooks.map((book) => book.itemId))
    })
  }, [offlineBooks])

  const removeSelected = useCallback(async () => {
    if (selectedIds.size === 0) return
    const message = selectedIds.size === 1
      ? 'Remove 1 downloaded book from this device?'
      : `Remove ${selectedIds.size} downloaded books from this device?`
    if (!window.confirm(message)) return

    setRemoving(true)
    try {
      // Sequential removal keeps IndexedDB writes well-ordered and
      // avoids hammering storage on slower devices.
      for (const id of selectedIds) {
        await removeOfflineBook(id)
      }
      setSelectedIds(new Set())
      setEditing(false)
    } finally {
      setRemoving(false)
    }
  }, [removeOfflineBook, selectedIds])

  const removeOne = useCallback(async (id: string, title: string) => {
    if (!window.confirm(`Remove "${title}" from this device?`)) return
    await removeOfflineBook(id)
  }, [removeOfflineBook])

  return (
    <main className="screen downloads-screen">
      <section className="screen-header downloads-header">
        <div>
          <p className="eyebrow">Downloads</p>
          <h1>Offline books</h1>
        </div>
        <div className="downloads-header-meta">
          {summary.count > 0 ? (
            <div className="downloads-summary" aria-label="Offline storage usage">
              <strong>{formatBytes(summary.totalBytes)}</strong>
              <span className="muted">
                {summary.count} book{summary.count === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
          {offlineBooks.length > 0 ? (
            <button
              type="button"
              className="ghost-button downloads-edit-btn"
              onClick={toggleEdit}
              aria-pressed={editing}
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          ) : null}
        </div>
      </section>

      {offlineBooks.length === 0 ? (
        <section className="card downloads-empty">
          <div className="downloads-empty-icon" aria-hidden="true">
            <IconCloudOff />
          </div>
          <h2>Nothing saved for offline yet</h2>
          <p className="muted">
            Open any book and tap “Download” to keep it on this device. Saved books play and read
            without a connection.
          </p>
          {primary ? (
            <Link className="primary-button" to={`/library/${primary.id}`}>
              Browse library
            </Link>
          ) : (
            <Link className="primary-button" to="/home">
              Go home
            </Link>
          )}
        </section>
      ) : (
        <section className="card downloads-card">
          {editing ? (
            <button
              type="button"
              className="downloads-select-all"
              onClick={toggleSelectAll}
              aria-pressed={allSelected}
            >
              <span
                className={`downloads-checkbox ${allSelected ? 'checked' : ''}`}
                aria-hidden="true"
              >
                {allSelected ? <IconCheck /> : null}
              </span>
              <span>{allSelected ? 'Deselect all' : 'Select all'}</span>
              <span className="muted downloads-select-count">
                {selectedIds.size} of {offlineBooks.length}
              </span>
            </button>
          ) : null}

          <ul className="downloads-list" role="list">
            {offlineBooks.map((book) => {
              const coverUrl = book.coverPath ? client.coverUrl(book.itemId) : null
              const isSelected = selectedIds.has(book.itemId)
              const sizeLabel = formatBytes(getOfflineBookBytes(book))

              const inner = (
                <>
                  {editing ? (
                    <span
                      className={`downloads-checkbox ${isSelected ? 'checked' : ''}`}
                      aria-hidden="true"
                    >
                      {isSelected ? <IconCheck /> : null}
                    </span>
                  ) : null}
                  <span className="downloads-cover">
                    {coverUrl ? (
                      <img src={coverUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="downloads-cover-fallback">
                        <IconBook />
                      </span>
                    )}
                  </span>
                  <span className="downloads-info">
                    <strong>{book.title}</strong>
                    <span className="muted">{book.author}</span>
                    <span className="muted downloads-size">{sizeLabel}</span>
                  </span>
                </>
              )

              return (
                <li key={book.itemId} className={`downloads-item ${isSelected ? 'selected' : ''}`}>
                  {editing ? (
                    <button
                      type="button"
                      className="downloads-row"
                      onClick={() => toggleSelected(book.itemId)}
                      aria-pressed={isSelected}
                      aria-label={`${isSelected ? 'Deselect' : 'Select'} ${book.title}`}
                    >
                      {inner}
                    </button>
                  ) : (
                    <Link
                      to={`/book/${book.itemId}`}
                      className="downloads-row"
                      aria-label={`Open ${book.title}`}
                    >
                      {inner}
                    </Link>
                  )}

                  {!editing ? (
                    <button
                      type="button"
                      className="ghost-button downloads-row-remove"
                      onClick={() => void removeOne(book.itemId, book.title)}
                      aria-label={`Remove ${book.title}`}
                      title="Remove download"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {editing && offlineBooks.length > 0 ? (
        <div className="downloads-action-bar" role="region" aria-label="Selection actions">
          <span className="downloads-action-count">
            {selectedIds.size === 0 ? 'Tap books to select' : `${selectedIds.size} selected`}
          </span>
          <div className="downloads-action-buttons">
            <button
              type="button"
              className="ghost-button"
              onClick={toggleEdit}
              disabled={removing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-button danger-button"
              onClick={() => void removeSelected()}
              disabled={selectedIds.size === 0 || removing}
            >
              {removing ? 'Removing…' : `Remove ${selectedIds.size || ''}`.trim()}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default DownloadsPage
