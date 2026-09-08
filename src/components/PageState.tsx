import { Notice } from './Notice'

export function PageState({ title, loading, error, empty, onRetry }: {
  title: string; loading?: boolean; error?: string | null; empty?: string; onRetry?: () => void
}) {
  return (
    <section className="stack-lg page-state">
      <h1 className="h1">{title}</h1>
      {error ? <div className="stack"><Notice>{error}</Notice>{onRetry && <button className="btn" onClick={onRetry}>Prøv igjen</button>}</div>
        : loading ? <div role="status"><span className="visually-hidden">Laster {title.toLowerCase()}…</span><div className="skeleton" aria-hidden="true" /><div className="skeleton skeleton-short" aria-hidden="true" /></div>
        : <p className="muted">{empty}</p>}
    </section>
  )
}
