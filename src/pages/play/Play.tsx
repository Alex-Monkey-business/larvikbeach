import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { kr } from '../../lib/money'
import { SessionCard } from '../../components/SessionCard'
import { Notice } from '../../components/Notice'
import { goingCount, mineFor, splitQueue, useSessions } from './useSessions'
import type { Match, Profile } from '../../lib/types'
import { sessionsFrom } from '../../lib/format'

export function Play() {
  const { profile } = useAuth()
  const settings = useQuery(() => api.settings(), [])
  // Påmeldingsvinduet. 14 som utgangspunkt, så lista ikke blafrer før
  // innstillingene er lest.
  const windowDays = settings.data?.signup_window_days ?? 14
  // Kveldens økt blir stående med resultat til midt på dagen etter.
  const from = sessionsFrom()
  const to = new Date(Date.now() + windowDays * 86_400_000).toISOString()
  const s = useSessions({ from, to }, [windowDays])
  const bal = useQuery(() => profile ? api.myBalance(profile.id) : Promise.resolve(null), [profile?.id])
  const people = useQuery(() => api.profiles(), [])
  const played = (s.data?.sessions ?? []).filter(x => new Date(x.starts_at).getTime() < Date.now()).map(x => x.id)
  const matches = useQuery(() => api.matchesFor(played), [played.join(',')])
  const seasons = useQuery(() => api.seasons(), [])
  const byId = new Map<string, Profile>((people.data ?? []).map(p => [p.id, p]))

  const upcoming = (s.data?.sessions ?? []).filter(x => x.status !== 'cancelled')
  const notice = seasons.data?.find(se => se.id === upcoming[0]?.season_id)?.notice
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
        {notice && <p className="lede" style={{ fontSize: 'var(--text-body-sm)' }}>{notice}</p>}
        {(s.error || s.actionError) && <Notice>{s.error ?? s.actionError}</Notice>}
        {s.data && upcoming.length === 0 && <p className="muted">Ingen økter de neste {windowDays} dagene.</p>}
        {upcoming.map(x => (
          <SessionCard key={x.id} session={x}
            goingCount={goingCount(s.data!.attendance, x.id)}
            {...splitQueue(s.data!.attendance, x, byId)}
            mine={mineFor(s.data!.attendance, x, profile?.id)}
            busy={s.busyId === x.id}
            signupWindowDays={windowDays}
            winners={topWinners(matches.data ?? [], x.id, byId)}
            onToggle={going => void s.toggle(x.id, going)} />
        ))}
        <Link to="/spill/kalender" className="btn btn-ghost" style={{ justifySelf: 'start', paddingLeft: 0 }}>Hele terminlisten →</Link>
      </section>
    </div>
  )
}

/** De med flest seire på økta. Ingen resultater gir ingen vinnere. */
function topWinners(matches: Match[], sessionId: string, byId: Map<string, Profile>): Profile[] {
  const wins = new Map<string, number>()
  for (const m of matches) {
    if (m.session_id !== sessionId || !m.winner) continue
    for (const id of m.winner === 'a' ? m.team_a : m.team_b) wins.set(id, (wins.get(id) ?? 0) + 1)
  }
  const best = Math.max(0, ...wins.values())
  if (best === 0) return []
  return [...wins.entries()].filter(([, n]) => n === best).map(([id]) => byId.get(id)).filter(Boolean) as Profile[]
}
