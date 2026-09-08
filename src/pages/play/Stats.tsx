import { useMemo, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { PageState } from '../../components/PageState'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { compactDate, longDate } from '../../lib/format'
import { Avatar } from '../../components/Avatar'
import { Leaderboard } from '../../components/Leaderboard'
import type { Profile, Session } from '../../lib/types'
import { splitQueue } from './useSessions'
import './Stats.css'

/** «+12», «−4», «0». Differansen er poenget, ikke fortegnet alene. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'
}

/**
 * Rutenettet: én rute per økt per spiller. Det er den ene visningen som viser
 * mønster — hvem som er der hver uke, og hvem som kommer og går.
 */
function Rutenett({ rader, okter, spilte, meg }: {
  rader: { p: Profile }[]; okter: Session[]
  spilte: Map<string, Set<string>>
  meg: string | undefined
}) {
  return (
    <section className="stack">
      <h2 className="h3">Økt for økt</h2>
      <div className="rutenett-skall">
        <table className="rutenett">
          <caption className="visually-hidden">Én rute per økt, eldste til venstre. Fylt rute betyr at spilleren var med.</caption>
          <tbody>
            {rader.map((r, y) => (
              <tr key={r.p.id} className={r.p.id === meg ? 'rutenett-meg' : undefined} style={{ '--y': y } as CSSProperties}>
                <th scope="row" className="rutenett-navn">{r.p.name.split(' ')[0]}</th>
                {okter.map((s, x) => {
                  const med = spilte.get(s.id)?.has(r.p.id) ?? false
                  return (
                    <td key={s.id} style={{ '--x': x } as CSSProperties}>
                      <span className={`rute ${med ? 'rute-med' : ''}`}
                        title={`${compactDate(s.starts_at)} · ${med ? 'var med' : 'ikke med'}`} />
                      <span className="visually-hidden">{compactDate(s.starts_at)}: {med ? 'var med' : 'ikke med'}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption">Eldste økt til venstre.</p>
    </section>
  )
}

// Denne sesongen: oppmøte, kamper, mønster og historikk.
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

  const d = q.data
  const byId = useMemo(() => new Map<string, Profile>((d?.profiles ?? []).map(p => [p.id, p])), [d?.profiles])
  // Eldste først i rutenettet, nyeste først i historikken.
  const kronologisk = useMemo(() => [...(d?.held ?? [])].reverse(), [d?.held])
  /**
   * Hvem som faktisk spilte, med samme regel som `season_stats` bruker:
   * påmeldt og innenfor plassgrensa.
   */
  const spilte = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const s of kronologisk) {
      m.set(s.id, new Set(splitQueue(d?.attendance ?? [], s, byId).withSpot.map(p => p.id)))
    }
    return m
  }, [kronologisk, d?.attendance, byId])

  if (!d) return <PageState title="Statistikk" loading={q.loading} error={q.error} empty="Statistikken kommer når den første sesongen er lagt inn." onRetry={() => void q.reload()} />
  const { season, stats, held } = d
  const rows = stats.map(s => ({ ...s, p: byId.get(s.profile_id)! })).filter(r => r.p)
  const oppmote = [...rows].sort((a, b) => b.sessions - a.sessions || a.p.name.localeCompare(b.p.name, 'nb'))
  const kamper = [...rows].filter(r => r.games > 0).sort((a, b) => b.wins - a.wins || b.points_diff - a.points_diff)
  const anyPoints = rows.some(r => r.points_for > 0 || r.points_against > 0)

  return (
    <div className="stack-lg stats-side" style={{ paddingTop: 'var(--space-4)', maxWidth: 800 }}>
      <header>
        <p className="caption">{season.name}</p>
        <h1 className="h1">Statistikk</h1>
        <p className="caption">{held.length} {held.length === 1 ? 'økt' : 'økter'} spilt</p>
      </header>

      {rows.length === 0 && <p className="muted">Ingen økter er gjennomført ennå.</p>}

      {rows.length > 0 && <Leaderboard rows={rows} me={profile?.id} />}

      {(held.length > 0 || kamper.length > 0) && <details className="stats-details">
        <summary><span>Mer fra sesongen<small>Kamper, oppmøte og historikk</small></span><span className="stats-details-plus" aria-hidden="true">+</span></summary>
        <div className="stats-details-body stack-lg">
          {kamper.length > 0 && (
            <section className="card stack">
              <h2 className="h3">Kamper</h2>
              <table className="stats-table">
                <caption className="visually-hidden">Kamper og seire, flest seire først.</caption>
                <thead><tr>
                  <th scope="col">Spiller</th><th scope="col">Kamper</th><th scope="col">Seire</th>
                  {anyPoints && <th scope="col"><abbr title="Poengdifferanse">+/−</abbr></th>}
                </tr></thead>
                <tbody>{kamper.map(r => (
                  <tr key={r.profile_id} className={r.profile_id === profile?.id ? 'stats-me' : undefined}>
                    <th scope="row"><span className="stats-player">
                      <Avatar profile={r.p} size={28} />
                      <span>{r.p.name}{r.profile_id === profile?.id && <span className="visually-hidden"> (deg)</span>}</span>
                    </span></th>
                    <td>{r.games}</td>
                    <td>{r.wins}</td>
                    {anyPoints && <td title={`${r.points_for} scoret, ${r.points_against} sluppet inn`}>{signed(r.points_diff)}</td>}
                  </tr>
                ))}</tbody>
              </table>
              {anyPoints && <p className="caption">+/− er poeng scoret minus poeng sluppet inn.</p>}
            </section>
          )}

          {rows.length > 0 && kronologisk.length > 0 && (
            <Rutenett rader={oppmote} okter={kronologisk} spilte={spilte} meg={profile?.id} />
          )}

          {held.length > 0 && (
            <section className="stack">
              <h2 className="h3">Historikk</h2>
              <ul className="list">
                {held.map(s => (
                  <li key={s.id}>
                    <Link to={`/spill/okter/${s.id}`} className="row between" style={{ textDecoration: 'none' }}>
                      <span style={{ fontWeight: 500 }}>{longDate(s.starts_at)}</span>
                      <span className="muted">{spilte.get(s.id)?.size ?? 0} spilte</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </details>}
    </div>
  )
}
