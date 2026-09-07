import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { kr } from '../../lib/money'
import { SessionCard } from '../../components/SessionCard'
import { Notice } from '../../components/Notice'
import { goingCount, mineFor, useSessions } from './useSessions'

export function Play() {
  const { profile } = useAuth()
  // Fra tre timer tilbake: en økt som pågår skal fortsatt stå øverst.
  const from = new Date(Date.now() - 3 * 3600_000).toISOString()
  const s = useSessions({ from })
  const bal = useQuery(() => profile ? api.myBalance(profile.id) : Promise.resolve(null), [profile?.id])

  const upcoming = (s.data?.sessions ?? []).filter(x => x.status !== 'cancelled')
  const owed = (bal.data?.invoiced_open ?? 0)
  const pending = (bal.data?.uninvoiced ?? 0)

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)' }}>
      <div className="row between">
        <h1 className="h1">Hei, {profile?.name.split(' ')[0]}.</h1>
      </div>

      {bal.data && (owed > 0 || pending > 0 || bal.data.claimed > 0) && (
        <Link to="/spill/betaling" className={`card stack ${owed > 0 ? 'card-lavender' : ''}`} style={{ textDecoration: 'none', maxWidth: 520 }}>
          {owed > 0
            ? <><p className="caption" style={{ color: 'var(--color-ink)' }}>Du skylder</p><p className="num">{kr(owed)}</p><p>Trykk for å se regningen og Vipps-nummeret.</p></>
            : bal.data.claimed > 0
              ? <><p className="caption">Venter på bekreftelse</p><p className="num">{kr(bal.data.claimed)}</p><p>Du har meldt betalt. Admin bekrefter.</p></>
              : <><p className="caption">Påløpt denne måneden</p><p className="num">{kr(pending)}</p><p>Kommer på regningen den 1.</p></>}
        </Link>
      )}

      <section className="stack">
        <h2 className="h3">Neste økter</h2>
        {s.error && <Notice>{s.error}</Notice>}
        {s.data && upcoming.length === 0 && <p className="muted">Ingen økter er lagt inn ennå.</p>}
        {upcoming.map(x => (
          <SessionCard key={x.id} session={x}
            goingCount={goingCount(s.data!.attendance, x.id)}
            mine={mineFor(s.data!.attendance, x, profile?.id)}
            busy={s.busyId === x.id}
            onToggle={going => void s.toggle(x.id, going)} />
        ))}
      </section>
    </div>
  )
}
