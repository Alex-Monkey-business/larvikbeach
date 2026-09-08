import { useEffect, useRef, type CSSProperties } from 'react'
import { PageState } from '../../components/PageState'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { useCountUp } from '../../lib/useCountUp'
import { longDate } from '../../lib/format'
import { Avatar, AvatarStack } from '../../components/Avatar'
import { Ball } from '../../components/Ball'
import type { Profile } from '../../lib/types'
import { splitQueue } from './useSessions'
import './Stats.css'

/** «+12», «−4», «0». Differansen er poenget, ikke fortegnet alene. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'
}

const stille = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Navn på norsk: komma mellom, «og» før den siste. Flere enn én: fornavn. */
function navneliste(folk: Profile[]): string {
  const navn = folk.map(p => folk.length > 1 ? p.name.split(' ')[0] : p.name)
  if (navn.length < 2) return navn[0] ?? ''
  return `${navn.slice(0, -1).join(', ')} og ${navn[navn.length - 1]}`
}

/**
 * Ballen serves inn over hjørnet når tavla lastes, og kan slås på nytt.
 * Retningen veksler, slik at to slag på rad ikke er samme bevegelse.
 */
function LederBall() {
  const ball = useRef<HTMLButtonElement>(null)
  const spilt = useRef(0)
  const anim = useRef<Animation | null>(null)

  useEffect(() => {
    if (!ball.current || stille()) return
    anim.current = ball.current.animate([
      { opacity: 0, transform: 'translate(52px, -84px) rotate(-220deg) scale(.5)', easing: 'cubic-bezier(.18,.7,.3,1)' },
      { opacity: 1, transform: 'translate(-7px, 9px) rotate(14deg) scale(1.07)', offset: .66, easing: 'cubic-bezier(.4,0,.45,1)' },
      { opacity: 1, transform: 'translate(0, 0) rotate(0deg) scale(1)' },
    ], { duration: 1150, delay: 140, fill: 'both' })
    return () => anim.current?.cancel()
  }, [])

  function slag() {
    if (!ball.current || stille()) return
    anim.current?.cancel()
    const vei = ++spilt.current % 2 ? 1 : -1
    anim.current = ball.current.animate([
      { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
      { transform: `translate(${vei * -11}px, 17px) rotate(${vei * 195}deg) scale(.93)`, offset: .5, easing: 'cubic-bezier(.35,0,.4,1)' },
      { transform: `translate(0, 0) rotate(${vei * 360}deg) scale(1)` },
    ], { duration: 780, easing: 'cubic-bezier(.2,.7,.3,1)' })
  }

  return (
    <button ref={ball} type="button" className="leder-ball" onClick={slag} aria-hidden="true" tabIndex={-1}>
      <Ball />
    </button>
  )
}

/** Tavla på toppen: hvor mange økter lederen har av alle, og hvem det er. */
function Ledertavle({ caption, folk, tekst, okter, totalt, seire }: {
  caption: string; folk: Profile[]; tekst: string; okter: number; totalt: number
  seire: { tekst: string; antall: number } | null
}) {
  const n = useCountUp(okter)
  return (
    <section className="card leder on-dark">
      <LederBall />
      <p className="caption">{caption}</p>
      <p className="leder-tall">
        <span className="num">{n}</span>
        <span className="leder-av">av {totalt} {totalt === 1 ? 'økt' : 'økter'}</span>
      </p>
      <p className="leder-navn">
        {folk.slice(0, 3).map(p => <Avatar key={p.id} profile={p} size={40} />)}
        <span>{tekst}</span>
      </p>
      {seire && (
        <p className="leder-seire">
          <span className="badge badge-ember">Flest seire: {seire.tekst} · {seire.antall}</span>
        </p>
      )}
    </section>
  )
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

  // Sortert på økter, så første rad har maksimum. Ledere i flertall er vanlig
  // tidlig i sesongen — da er det flere navn, ikke en tilfeldig vinner.
  const flest = rows[0]?.sessions ?? 0
  const ledere = rows.filter(r => r.sessions === flest)
  const ledet = new Set(ledere.map(r => r.profile_id))
  // Har alle vært på alt, finnes ingen leder. Å krone noen da er å lyve.
  const likt = ledere.length === rows.length && rows.length > 1
  const flestSeire = Math.max(0, ...rows.map(r => r.wins))
  const seiersledere = rows.filter(r => r.wins === flestSeire)
  const seire = flestSeire > 0 && seiersledere.length < rows.length
    ? { tekst: navneliste(seiersledere.map(r => r.p!)), antall: flestSeire }
    : null

  return (
    <div className="stack-lg stats-side" style={{ paddingTop: 'var(--space-6)', maxWidth: 720 }}>
      <header>
        <p className="caption">{season.name}</p>
        <h1 className="h1">Statistikk</h1>
        <p className="muted">{held.length} {held.length === 1 ? 'økt' : 'økter'} spilt</p>
      </header>

      {rows.length === 0 && <p className="muted">Ingen økter er gjennomført ennå.</p>}

      {rows.length > 0 && held.length > 0 && (
        <Ledertavle
          caption={likt ? 'Oppmøte' : ledere.length > 1 ? 'Ledere på oppmøte' : 'Leder på oppmøte'}
          folk={likt ? [] : ledere.map(r => r.p!)}
          tekst={likt ? 'Alle har vært på alt' : navneliste(ledere.map(r => r.p!))}
          okter={flest} totalt={held.length} seire={seire} />
      )}

      {rows.length > 0 && (
        <section className="card stack">
          <h2 className="h3">Oppmøte</h2>
          <table className="stats-table">
            <caption className="visually-hidden">Oppmøte og resultater. Sortert etter flest økter, deretter seire.</caption>
            <thead><tr><th scope="col">Spiller</th><th scope="col">Økter</th>{anyWins && <th scope="col">Seire</th>}{anyPoints && <th scope="col"><abbr title="Poengforskjell">+/−</abbr></th>}</tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={r.profile_id} style={{ '--i': i } as CSSProperties}
                className={[r.profile_id === profile?.id && 'stats-me', !likt && ledet.has(r.profile_id) && 'stats-leder'].filter(Boolean).join(' ') || undefined}>
                <th scope="row">
                  <span className="stats-bar" aria-hidden="true"
                    style={{ '--andel': held.length ? r.sessions / held.length : 0 } as CSSProperties} />
                  <span className="stats-player">
                    <Avatar profile={r.p!} size={28} />
                    <span>{r.p!.name}{r.profile_id === profile?.id && <span className="visually-hidden"> (deg)</span>}</span>
                  </span>
                </th>
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
