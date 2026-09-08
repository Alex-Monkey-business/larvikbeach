import { PageState } from '../../components/PageState'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { longDate } from '../../lib/format'
import { Avatar, AvatarStack } from '../../components/Avatar'
import type { Profile } from '../../lib/types'
import { splitQueue } from './useSessions'

/** «+12», «−4», «0». Differansen er poenget, ikke fortegnet alene. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `\u2212${Math.abs(n)}` : '0'
}

// Denne sesongen: oppmøte, seire, og hvem som var med når.
export function Stats() {
  const { profile } = useAuth()
  const q = useQuery(async () => {
    const seasons = await api.seasons()
    const today = new Date().toISOString().slice(0, 10)
    const season = seasons.find(s => s.starts_on <= today && s.ends_on >= today) ?? seasons[0]
    if (!season) return null
    const [stats, profiles, sessions] = await Promise.all([
      api.seasonStats(season.id), api.profiles(), api.sessions({ seasonId: season.id, to: new Date().toISOString() }),
    ])
    const held = sessions.filter(s => s.status === 'held').reverse()
    const attendance = await api.attendance(held.map(s => s.id))
    return { season, stats, profiles, held, attendance }
  }, [])

  if (!q.data) return <PageState title="Statistikk" loading={q.loading} error={q.error} empty="Statistikken kommer når den første sesongen er lagt inn." onRetry={() => void q.reload()} />
  const { season, stats, profiles, held, attendance } = q.data
  const byId = new Map<string, Profile>(profiles.map(p => [p.id, p]))
  const rows = stats.map(s => ({ ...s, p: byId.get(s.profile_id) })).filter(r => r.p).sort((a, b) => b.sessions - a.sessions || b.wins - a.wins)
  const anyWins = rows.some(r => r.games > 0)
  const anyPoints = rows.some(r => r.points_for > 0 || r.points_against > 0)

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 720 }}>
      <header>
        <p className="caption">{season.name}</p>
        <h1 className="h1">Statistikk</h1>
        <p className="muted">{held.length} {held.length === 1 ? 'økt' : 'økter'} spilt</p>
      </header>

      {rows.length === 0 && <p className="muted">Ingen økter er gjennomført ennå.</p>}

      {rows.length > 0 && (
        <section className="card stack">
          <h2 className="h3">Oppmøte</h2>
          <table className="stats-table">
            <caption className="visually-hidden">Oppmøte og resultater. Sortert etter flest økter, deretter seire.</caption>
            <thead><tr><th scope="col">Spiller</th><th scope="col">Økter</th>{anyWins && <th scope="col">Seire</th>}{anyPoints && <th scope="col"><abbr title="Poengforskjell">+/−</abbr></th>}</tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.profile_id} className={r.profile_id === profile?.id ? 'stats-me' : undefined}>
                <th scope="row"><span className="stats-player"><Avatar profile={r.p!} size={28} /><span>{r.p!.name}{r.profile_id === profile?.id && <span className="visually-hidden"> (deg)</span>}</span></span></th>
                <td>{r.sessions}</td>
                {anyWins && <td>{r.wins}</td>}
                {anyPoints && <td title={`${r.points_for} scoret, ${r.points_against} sluppet inn`}>{signed(r.points_diff)}</td>}
              </tr>
            ))}</tbody>
          </table>
          {anyPoints && <p className="caption">+/− er poeng scoret minus poeng sluppet inn.</p>}
        </section>
      )}

      {held.length > 0 && (
        <section className="stack">
          <h2 className="h3">Historikk</h2>
          <ul className="list">
            {held.map(s => {
              const { withSpot } = splitQueue(attendance, s, byId)
              return (
                <li key={s.id} className="stack" style={{ gap: 8 }}>
                  <Link to={`/spill/okter/${s.id}`} className="row between" style={{ textDecoration: 'none' }}>
                    <span style={{ fontWeight: 500 }}>{longDate(s.starts_at)}</span>
                    <span className="muted">{withSpot.length} spilte</span>
                  </Link>
                  <AvatarStack people={withSpot} size={28} />
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
