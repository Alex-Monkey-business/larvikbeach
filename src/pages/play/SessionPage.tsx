import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { longDate, time, endTime, isPast } from '../../lib/format'
import { kr, shareOre } from '../../lib/money'
import { Notice } from '../../components/Notice'
import { useSessions, goingQueue, mineFor, payerCount, statusLine } from './useSessions'
import type { Profile } from '../../lib/types'
import { Avatar } from '../../components/Avatar'

export function SessionPage() {
  const { id = '' } = useParams()
  const { profile, isAdmin } = useAuth()
  const one = useQuery(() => api.session(id), [id])
  const s = useSessions({ from: one.data?.starts_at, to: one.data ? new Date(new Date(one.data.starts_at).getTime() + 1).toISOString() : undefined }, [one.data?.starts_at])
  const people = useQuery(() => api.profiles(), [])
  const charges = useQuery(() => api.charges({ sessionId: id }), [id, s.data])

  const session = one.data
  if (one.error) return <Notice>{one.error}</Notice>
  if (!session || !s.data || !people.data) return null

  const att = s.data.attendance.filter(a => a.session_id === id)
  const byId = new Map<string, Profile>(people.data.map(p => [p.id, p]))
  const queue = goingQueue(att, id).map(a => byId.get(a.profile_id)).filter(Boolean) as Profile[]
  const cap = session.capacity ?? queue.length
  const withSpot = queue.slice(0, cap)
  const waitlist = queue.slice(cap)
  const notGoing = att.filter(a => !a.going).map(a => byId.get(a.profile_id)).filter(Boolean) as Profile[]
  const mine = mineFor(att, session, profile?.id)
  const n = queue.length
  const payers = payerCount(session, n)
  const full = session.capacity != null && n >= session.capacity
  const hasSpot = mine.going === true && !mine.waitlisted
  const open = session.status === 'planned' && !isPast(session.starts_at)
  const myCharge = charges.data?.find(c => c.profile_id === profile?.id)

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 720 }}>
      <Link to="/spill" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>← Alle økter</Link>
      <header className="stack">
        <h1 className="h1">{longDate(session.starts_at)}</h1>
        <p className="lede">{time(session.starts_at)}–{endTime(session.starts_at, session.duration_min)}{session.location ? ` · ${session.location}` : ''}</p>
        {session.note && <p>{session.note}</p>}
        <div className="row">
          {session.status === 'held' && <span className="badge badge-forest">Gjennomført</span>}
          {session.status === 'cancelled' && <span className="badge badge-ember">Avlyst</span>}
          {session.status === 'planned' && !open && <span className="badge badge-stone">Påmelding stengt</span>}
          {session.status === 'planned' && <span className={`badge ${full ? 'badge-ember' : 'badge-stone'}`}>{statusLine(session, n)}</span>}
        </div>
      </header>

      {session.cost > 0 && (
        <section className="card card-lavender stack">
          {session.status === 'held' ? (
            myCharge
              ? <><p className="caption" style={{ color: 'var(--color-ink)' }}>Din andel</p><p className="num">{kr(myCharge.amount)}</p><p>Hallen kostet {kr(session.cost)}, delt på {payers}.</p></>
              : <><p className="caption" style={{ color: 'var(--color-ink)' }}>Hallen kostet</p><p className="num">{kr(session.cost)}</p><p>Delt på {payers}. Du var ikke med.</p></>
          ) : (
            <><p className="caption" style={{ color: 'var(--color-ink)' }}>Pris per person</p>
              <p className="num">{kr(shareOre(session.cost, Math.max(payers, 1)))}</p>
              <p>Hallen koster {kr(session.cost)} og deles på de som har plass{session.capacity ? `, maks ${session.capacity}` : ''}.</p></>
          )}
        </section>
      )}

      {open && (
        <div className="row">
          <button type="button" className={`btn ${hasSpot ? 'btn-forest' : mine.going === true ? 'btn-dark' : 'btn-primary'}`} disabled={s.busyId === id} onClick={() => void s.toggle(id, true)}>
            {hasSpot ? 'Du har plass' : mine.going === true ? `Venteliste nr. ${mine.spot - cap}` : full ? 'Sett meg på venteliste' : 'Jeg kommer'}
          </button>
          <button type="button" className={`btn ${mine.going === false ? 'btn-dark' : ''}`} disabled={s.busyId === id} onClick={() => void s.toggle(id, false)}>Kan ikke</button>
        </div>
      )}
      {s.error && <Notice>{s.error}</Notice>}

      <section className="grid-2">
        <div className="card stack">
          <h2 className="h3">{session.status === 'held' ? 'Var med' : 'Har plass'} <span className="muted">{withSpot.length}{session.capacity ? ` av ${session.capacity}` : ''}</span></h2>
          <ul className="list">{withSpot.map(p => <li key={p.id} className="row"><Avatar profile={p} />{p.name}</li>)}{withSpot.length === 0 && <li className="muted">Ingen ennå</li>}</ul>
        </div>
        {waitlist.length > 0 && (
          <div className="card stack">
            <h2 className="h3">Venteliste <span className="muted">{waitlist.length}</span></h2>
            <ul className="list">{waitlist.map((p, i) => <li key={p.id} className="row"><Avatar profile={p} dim />{i + 1}. {p.name}</li>)}</ul>
          </div>
        )}
        {notGoing.length > 0 && (
          <div className="card stack">
            <h2 className="h3">Kan ikke <span className="muted">{notGoing.length}</span></h2>
            <ul className="list">{notGoing.map(p => <li key={p.id}>{p.name}</li>)}</ul>
          </div>
        )}
      </section>

      {isAdmin && <Link to={`/admin/okter/${id}`} className="btn">Rediger som admin</Link>}
    </div>
  )
}
