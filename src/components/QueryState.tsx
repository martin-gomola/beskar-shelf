export function QueryState({
  isPending,
  error,
  children,
}: {
  isPending: boolean
  error: Error | null
  children: React.ReactNode
}) {
  if (isPending) {
    return <section className="card"><p className="muted">Loading…</p></section>
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
