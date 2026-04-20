export function QueryState({
  isPending,
  error,
  children,
  pendingFallback,
}: {
  isPending: boolean
  error: Error | null
  children: React.ReactNode
  /**
   * Optional skeleton/placeholder rendered while `isPending`. When provided,
   * it replaces the default "Loading…" card so each call site can preview
   * the *shape* of the eventual content (e.g. a row of card silhouettes for
   * a shelf grid). Falls back to the generic loading card otherwise.
   */
  pendingFallback?: React.ReactNode
}) {
  if (isPending) {
    return <>{pendingFallback ?? <section className="card"><p className="muted">Loading…</p></section>}</>
  }

  if (error) {
    return (
      <section className="card">
        <h2>Request failed</h2>
        <p className="muted">{error.message}</p>
      </section>
    )
  }

  return <>{children}</>
}
