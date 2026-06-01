import { useQuery } from '@tanstack/react-query'

import { useClient } from '../contexts/ClientContext'

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

function formatHoursMinutes(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0m'
  }
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${minutes}m`
}

/**
 * Listening stats sourced from ABS's /api/me/listening-stats endpoint. We
 * intentionally show only the fields the server already aggregates — totals,
 * today, by-day-of-week, top items — so this page costs a single request and
 * no client-side bookkeeping. If the user wants per-day history, ABS already
 * has a richer view in its own UI.
 */
function StatsPage() {
  const client = useClient()
  const statsQuery = useQuery({
    queryKey: ['listening-stats'],
    queryFn: () => client.getListeningStats(),
    staleTime: 60 * 1000,
  })

  if (statsQuery.isPending) {
    return (
      <main className="screen">
        <section className="card">
          <h1>Listening stats</h1>
          <p className="muted">Loading…</p>
        </section>
      </main>
    )
  }

  if (statsQuery.isError || !statsQuery.data) {
    return (
      <main className="screen">
        <section className="card">
          <h1>Listening stats</h1>
          <p className="muted">Couldn't load stats. Check your connection and try again.</p>
          <button className="primary-button" onClick={() => void statsQuery.refetch()} style={{ marginTop: 'var(--space-3)' }}>
            Retry
          </button>
        </section>
      </main>
    )
  }

  const stats = statsQuery.data

  // Sort items by time descending and keep top 5 — anything more is noise.
  const topItems = [...stats.itemsListened]
    .sort((a, b) => b.timeListening - a.timeListening)
    .slice(0, 5)

  const maxDayOfWeek = Math.max(0, ...Object.values(stats.dayOfWeek))

  return (
    <main className="screen">
      <section className="card">
        <h1>Listening stats</h1>
        <div className="player-stats-inline" style={{ marginTop: 'var(--space-3)' }}>
          <span className="player-stat-inline">
            <span className="stat-label">Today</span>
            <strong>{formatHoursMinutes(stats.today)}</strong>
          </span>
          <span className="player-stat-divider" />
          <span className="player-stat-inline">
            <span className="stat-label">All-time</span>
            <strong>{formatHoursMinutes(stats.totalTime)}</strong>
          </span>
          <span className="player-stat-divider" />
          <span className="player-stat-inline">
            <span className="stat-label">Books</span>
            <strong>{stats.itemsListened.length}</strong>
          </span>
        </div>
      </section>

      <section className="card">
        <h2>By day of week</h2>
        {maxDayOfWeek === 0 ? (
          <p className="muted">No listening recorded yet.</p>
        ) : (
          <div className="stats-day-grid">
            {DAY_ORDER.map((day) => {
              const seconds = stats.dayOfWeek[day] ?? 0
              const pct = maxDayOfWeek > 0 ? Math.max(2, (seconds / maxDayOfWeek) * 100) : 0
              return (
                <div key={day} className="stats-day-row">
                  <span className="stats-day-label">{day.slice(0, 3)}</span>
                  <span className="stats-day-bar" aria-hidden="true">
                    <span className="stats-day-bar-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="stats-day-value">{formatHoursMinutes(seconds)}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {topItems.length > 0 ? (
        <section className="card">
          <h2>Top books</h2>
          <div className="chapter-list">
            {topItems.map((item) => (
              <div key={item.id} className="chapter-row" role="presentation">
                <strong>{item.title || 'Untitled'}</strong>
                <span className="player-track-meta">
                  <span>{formatHoursMinutes(item.timeListening)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}

export default StatsPage
