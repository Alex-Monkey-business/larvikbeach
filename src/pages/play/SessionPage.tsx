import { PageState } from '../../components/PageState'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { longDate, time, endTime, isPast, shortDate, signupOpen, signupOpensAt } from '../../lib/format'
import { Notice } from '../../components/Notice'
import { AttendButton } from '../../components/SessionCard'
import { useSessions, goingQueue, mineFor, statusLine } from './useSessions'
import type { Profile } from '../../lib/types'
import { Avatar } from '../../components/Avatar'
import { Matches } from '../../components/Matches'

export function SessionPage() {
  const { id = '' } = useParams()
  const { profile, isAdmin } = useAuth()
  const s = useSessions({ id }, [id])
  const settings = useQuery(() => api.settings(), [])
  const people = useQuery(() => api.profiles(), [])

  const session = s.data?.sessions[0]
  if (s.error || people.error) return <PageState title="Økt" error={s.error || people.error} onRetry={() => { void s.reload(); void people.reload() }} />
  if (s.data && !session) return <Notice>Fant ikke økta</Notice>
  if (!session || !s.data || !people.data) return <PageState title="Økt" loading />

  const att = s.data.attendance.filter(a => a.session_id === id)
  const byId = new Map<string, Profile>(people.data.map(p => [p.id, p]))
  const queue = goingQueue(att, id).map(a => byId.get(a.profile_id)).filter(Boolean) as Profile[]
  const cap = session.capacity ?? queue.length
  const withSpot = queue.slice(0, cap)
  const waitlist = queue.slice(cap)
  const mine = mineFor(att, session, profile?.id)
  const n = queue.length
  const full = session.capacity != null && n >= session.capacity
  const windowDays = settings.data?.signup_window_days ?? 14
  const open = session.status === 'planned' && signupOpen(session.starts_at, windowDays)
  const notYet = session.status === 'planned' && !isPast(session.starts_at) && !open

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 720 }}>
      <Link to="/spill" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>← Hjem</Link>
      <header className="stack">
        <h1 className="h1">{longDate(session.starts_at)}</h1>
        <p className="lede">{time(session.starts_at)}–{endTime(session.starts_at, session.duration_min)}{session.location ? ` · ${session.location}` : ''}</p>
        {session.note && <p>{session.note}</p>}
        <div className="row">
          {session.status === 'held' && <span className="badge badge-forest">Gjennomført</span>}
          {session.status === 'cancelled' && <span className="badge badge-ember">Avlyst</span>}
          {notYet && <span className="badge badge-stone">Påmelding åpner {shortDate(signupOpensAt(session.starts_at, windowDays).toISOString())}</span>}
          {session.status === 'planned' && !open && !notYet && <span className="badge badge-stone">Påmelding stengt</span>}
          {session.status === 'planned' && <span className={`badge ${full ? 'badge-ember' : 'badge-stone'}`}>{statusLine(session, n)}</span>}
        </div>
      </header>


      {open && (
        <div className="row">
          <AttendButton session={session} goingCount={n} mine={mine} busy={s.busyId === id} onToggle={going => void s.toggle(id, going)} />
        </div>
      )}
      {notYet && <p className="muted">Påmeldingen åpner {shortDate(signupOpensAt(session.starts_at, windowDays).toISOString())}, {windowDays} dager før økta.</p>}
      {s.actionError && <Notice>{s.actionError}</Notice>}

      <section className="grid-2">
        <div className="card stack">
          <h2 className="h3">{session.status === 'held' ? 'Var med' : 'Påmeldt'} <span className="muted">{withSpot.length}{session.capacity ? ` av ${session.capacity}` : ''}</span></h2>
          <ul className="list">{withSpot.map(p => <li key={p.id} className="row"><Avatar profile={p} />{p.name}</li>)}{withSpot.length === 0 && <li className="muted">Ingen ennå</li>}</ul>
        </div>
        {waitlist.length > 0 && session.status === 'planned' && (
          <div className="card stack">
            <h2 className="h3">Venteliste <span className="muted">{waitlist.length}</span></h2>
            <ul className="list">{waitlist.map((p, i) => <li key={p.id} className="row"><Avatar profile={p} dim />{i + 1}. {p.name}</li>)}</ul>
          </div>
        )}

      </section>

      {session.status !== 'cancelled' && (
        <Matches session={session} players={withSpot} canAct={isAdmin || (mine.going === true && !mine.waitlisted)} />
      )}

      {isAdmin && <Link to={`/admin/okter/${id}`} className="btn">Rediger som admin</Link>}
    </div>
  )
}
