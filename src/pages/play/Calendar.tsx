import { Link } from 'react-router'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { compactDate, time, shortDate, signupOpen, signupOpensAt } from '../../lib/format'
import { Notice } from '../../components/Notice'
import { goingCount, statusLine } from './useSessions'
import type { Session } from '../../lib/types'

// Hele sesongen, til å planlegge etter. Ingen påmelding her: den hører til de
// to øktene på forsiden, slik at ingen tar plasser i mars i september.
export function Calendar() {
  const q = useQuery(async () => {
    const settings = await api.settings()
    const seasons = await api.seasons()
    const today = new Date().toISOString().slice(0, 10)
    const season = seasons.find(s => s.starts_on <= today && s.ends_on >= today) ?? seasons[0]
    if (!season) return null
    const sessions = await api.sessions({ seasonId: season.id })
    const attendance = await api.attendance(sessions.map(s => s.id))
    return { settings, season, sessions, attendance }
  }, [])

  if (q.error) return <Notice>{q.error}</Notice>
  if (!q.data) return null
  const { settings, season, sessions, attendance } = q.data
  const windowDays = settings.signup_window_days
  const months = groupByMonth(sessions)

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 720 }}>
      <Link to="/spill" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>← Hjem</Link>
      <header className="stack">
        <h1 className="h1">{season.name}</h1>
        <p className="muted">{sessions.length} økter. Påmeldingen åpner {windowDays} dager før hver økt.</p>
      </header>

      {months.map(([label, rows]) => (
        <section key={label} className="card stack">
          <h2 className="h3">{label}</h2>
          <ul className="list">
            {rows.map(s => {
              const going = goingCount(attendance, s.id)
              const open = s.status === 'planned' && signupOpen(s.starts_at, windowDays)
              return (
                <li key={s.id}>
                  <Link to={`/spill/okter/${s.id}`} className="row between" style={{ textDecoration: 'none', gap: 12 }}>
                    <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                      <span style={{ fontWeight: 500 }}>{compactDate(s.starts_at)} <span className="muted">{time(s.starts_at)}</span></span>
                      {s.note && <span className="caption">{s.note.split(':')[0]}</span>}
                    </span>
                    {s.status === 'cancelled' ? <span className="badge badge-ember">Avlyst</span>
                      : s.status === 'held' ? <span className="muted" style={{ whiteSpace: 'nowrap' }}>{going} spilte</span>
                      : open ? <span className="badge badge-stone">{statusLine(s, going)}</span>
                      : <span className="caption" style={{ whiteSpace: 'nowrap' }}>Åpner {shortDate(signupOpensAt(s.starts_at, windowDays).toISOString())}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function groupByMonth(sessions: Session[]): [string, Session[]][] {
  const out = new Map<string, Session[]>()
  for (const s of sessions) {
    const d = new Date(s.starts_at)
    const label = d.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' })
    const key = label.charAt(0).toUpperCase() + label.slice(1)
    out.set(key, [...(out.get(key) ?? []), s])
  }
  return [...out.entries()]
}
