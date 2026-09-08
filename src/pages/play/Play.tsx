import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { SessionCard } from '../../components/SessionCard'
import { Notice } from '../../components/Notice'
import { Konfetti } from '../../components/Konfetti'
import { goingCount, mineFor, splitQueue, useSessions } from './useSessions'
import type { Match, Profile, Season, Session } from '../../lib/types'
import { time, endTime } from '../../lib/format'
import { PageState } from '../../components/PageState'

/**
 * Forrige økt ligger øverst i 24 timer fra start, deretter kommer neste først.
 */
export function Play() {
  const { profile } = useAuth()
  const settings = useQuery(() => api.settings(), [])
  const windowDays = settings.data?.signup_window_days ?? 14
  // Bakover: nok til å finne forrige økt selv etter en ferie.
  const from = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const to = new Date(Date.now() + windowDays * 86_400_000).toISOString()
  const s = useSessions({ from, to }, [windowDays])
  const people = useQuery(() => api.profiles(), [])
  const seasons = useQuery(() => api.seasons(), [])
  const byId = new Map<string, Profile>((people.data ?? []).map(p => [p.id, p]))

  const alle = (s.data?.sessions ?? []).filter(x => x.status !== 'cancelled')
  const na = Date.now()
  const forrige = alle.filter(x => new Date(x.starts_at).getTime() < na).pop()
  const neste = alle.find(x => new Date(x.starts_at).getTime() >= na)
  const ferskt = forrige != null && na - new Date(forrige.starts_at).getTime() < 24 * 3600_000
  const vist = (ferskt ? [forrige, neste] : [neste, forrige]).filter(Boolean) as Session[]

  const matches = useQuery(() => api.matchesFor(forrige ? [forrige.id] : []), [forrige?.id])
  const notice = seasons.data?.find(se => se.id === (neste ?? forrige)?.season_id)?.notice
  const vinnere = forrige ? topWinners(matches.data ?? [], forrige.id, byId) : []
  const feir = profile && forrige && vinnere.some(w => w.id === profile.id) ? forrige.id : null

  return (
    <div className="stack-lg play-home" style={{ paddingTop: 'var(--space-6)' }}>
      {feir && <Konfetti nokkel={`lbv-vinner-${feir}`} />}
      <h1 className="h1">Hei, {profile?.name.split(' ')[0] || 'du'}.</h1>

      {notice && <p className="lede" style={{ fontSize: 'var(--text-body-sm)' }}>{notice}</p>}
      {s.loading && !s.data && <PageState title="Øktene dine" loading />}
      {(s.error || s.actionError) && <Notice>{s.error ?? s.actionError}</Notice>}
      {s.data && vist.length === 0 && <p className="muted">Ingen økter er lagt inn ennå.</p>}

      <div className="stack-lg">
        {vist.map(x => (
          <section key={x.id} className="stack">
            <p className="caption">{x.id === forrige?.id ? 'Forrige økt' : 'Neste økt'}</p>
            <SessionCard session={x}
              goingCount={goingCount(s.data!.attendance, x.id)}
              {...splitQueue(s.data!.attendance, x, byId)}
              mine={mineFor(s.data!.attendance, x, profile?.id)}
              busy={s.busyId === x.id}
              signupWindowDays={windowDays}
              winners={x.id === forrige?.id ? vinnere : []}
              subtitle={avvik(x, seasons.data ?? [], alle)}
              onToggle={going => void s.toggle(x.id, going)} />
          </section>
        ))}
      </div>

      <Link to="/spill/kalender" className="btn btn-ghost" style={{ justifySelf: 'start', paddingLeft: 0 }}>Hele terminlisten →</Link>
    </div>
  )
}

/**
 * Alle vet at det er mandag 19–21 i hallen. Undertittelen sier bare fra når
 * økta ikke er som de andre: annet sted, eller annen tid enn resten av sesongen.
 */
function avvik(x: Session, seasons: Season[], alle: Session[]): string | null {
  const sted = x.location && x.location !== seasons.find(s => s.id === x.season_id)?.default_location ? x.location : null
  const vanlig = vanligTid(alle.filter(a => a.season_id === x.season_id))
  const tid = vanlig && time(x.starts_at) !== vanlig ? `${time(x.starts_at)}–${endTime(x.starts_at, x.duration_min)}` : null
  return [tid, sted].filter(Boolean).join(' · ') || null
}

function vanligTid(sesongen: Session[]): string | null {
  const teller = new Map<string, number>()
  for (const s of sesongen) { const t = time(s.starts_at); teller.set(t, (teller.get(t) ?? 0) + 1) }
  let best: string | null = null, n = 0
  for (const [t, c] of teller) if (c > n) { best = t; n = c }
  return n > 1 ? best : null
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
