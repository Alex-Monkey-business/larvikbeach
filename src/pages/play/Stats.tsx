import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { PageState } from '../../components/PageState'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { useCountUp } from '../../lib/useCountUp'
import { compactDate, longDate } from '../../lib/format'
import { Avatar } from '../../components/Avatar'
import { Ball } from '../../components/Ball'
import type { Profile, Session } from '../../lib/types'
import { splitQueue } from './useSessions'
import './Stats.css'

/** «+12», «−4», «0». Differansen er poenget, ikke fortegnet alene. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'
}

const stille = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Navn på norsk: komma mellom, «og» før den siste. */
function navneliste(navn: string[]): string {
  if (navn.length < 2) return navn[0] ?? ''
  return `${navn.slice(0, -1).join(', ')} og ${navn[navn.length - 1]}`
}

/**
 * Ballen serves inn over hjørnet når plakaten lastes, og kan slås på nytt.
 * Retningen veksler, slik at to slag på rad ikke er samme bevegelse.
 */
function LederBall() {
  const ball = useRef<HTMLButtonElement>(null)
  const spilt = useRef(0)
  const anim = useRef<Animation | null>(null)

  useEffect(() => {
    if (!ball.current || stille()) return
    anim.current = ball.current.animate([
      { opacity: 0, transform: 'translate(64px, -104px) rotate(-260deg) scale(.45)', easing: 'cubic-bezier(.16,.7,.28,1)' },
      { opacity: 1, transform: 'translate(-9px, 11px) rotate(16deg) scale(1.08)', offset: .64, easing: 'cubic-bezier(.4,0,.45,1)' },
      { opacity: 1, transform: 'translate(0, 0) rotate(0deg) scale(1)' },
    ], { duration: 1250, delay: 160, fill: 'both' })
    return () => anim.current?.cancel()
  }, [])

  function slag() {
    if (!ball.current || stille()) return
    anim.current?.cancel()
    const vei = ++spilt.current % 2 ? 1 : -1
    anim.current = ball.current.animate([
      { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
      { transform: `translate(${vei * -13}px, 20px) rotate(${vei * 200}deg) scale(.92)`, offset: .5, easing: 'cubic-bezier(.35,0,.4,1)' },
      { transform: `translate(0, 0) rotate(${vei * 360}deg) scale(1)` },
    ], { duration: 820, easing: 'cubic-bezier(.2,.7,.3,1)' })
  }

  return (
    <button ref={ball} type="button" className="plakat-ball" onClick={slag} aria-hidden="true" tabIndex={-1}>
      <Ball />
    </button>
  )
}

/**
 * Plakaten. Personen er saken, ikke tallet: navnet står i display-serif og
 * tallet under. Har alle vært på alt, krones ingen — å utrope en vinner da
 * ville vært å lyve om dataene.
 */
function Plakat({ ledere, okter, totalt, seire }: {
  ledere: Profile[]; okter: number; totalt: number
  seire: { tekst: string; antall: number } | null
}) {
  const n = useCountUp(okter)
  const en = ledere.length === 1
  const alle = ledere.length === 0
  const deler = en ? ledere[0].name.split(' ') : []

  return (
    <section className="plakat">
      <LederBall />
      <p className="caption plakat-hatt">{alle ? 'Oppmøte' : ledere.length > 1 ? 'Ledere på oppmøte' : 'Leder på oppmøte'}</p>
      <p className="plakat-fakta">
        <span className="num">{n}</span>
        <span>av {totalt} {totalt === 1 ? 'økt' : 'økter'}</span>
      </p>
      {alle
        ? <p className="plakat-navn plakat-flere"><span className="h2">Alle har vært på alt</span></p>
        : en
          ? <p className="plakat-navn">
              <span className="display">{deler[0]}</span>
              {deler.length > 1 && <span className="display">{deler.slice(1).join(' ')}</span>}
            </p>
          : <p className="plakat-navn plakat-flere">
              {ledere.map(p => <span key={p.id} className="h2">{p.name.split(' ')[0]}</span>)}
            </p>}
      {seire && (
        <p className="plakat-fot">
          <span className="caption">Flest seire</span>
          <span>{seire.tekst} · {seire.antall}</span>
        </p>
      )}
    </section>
  )
}

/**
 * Sesongen spilles av: ett steg per økt, eldste først. Ledelsen bytter rad
 * underveis, så løpet er synlig uten at noe flytter seg — rader som bytter
 * plass mens du leser dem er uleselig.
 *
 * Redusert bevegelse må sjekkes i JS. CSS-regelen som slår av animasjoner
 * biter ikke på et intervall, og sluttilstanden er fasiten.
 */
function useLop(steg: number): number {
  const rolig = stille()
  const kjor = !rolig && steg > 1
  const [i, setI] = useState(0)

  useEffect(() => {
    if (!kjor) return
    // Hele løpet tar det samme enten sesongen er fire økter eller trettifire.
    const pause = Math.max(90, Math.min(300, 2300 / steg))
    let n = 0
    const id = window.setInterval(() => {
      n += 1
      setI(n)
      if (n >= steg - 1) window.clearInterval(id)
    }, pause)
    return () => window.clearInterval(id)
  }, [kjor, steg])

  return kjor ? Math.min(i, steg - 1) : Math.max(0, steg - 1)
}

function Oppmotelop({ rader, totalt, kumulativt, meg, onReplay }: {
  rader: { p: Profile }[]; totalt: number
  kumulativt: Map<string, number>[]
  meg: string | undefined
  onReplay: () => void
}) {
  const steg = useLop(kumulativt.length)
  const na = kumulativt[steg] ?? new Map<string, number>()
  const ledende = Math.max(0, ...rader.map(r => na.get(r.p.id) ?? 0))
  const ferdig = steg >= kumulativt.length - 1

  return (
    <section className="card stack">
      <div className="row between">
        <h2 className="h3">Oppmøte</h2>
        <button type="button" className="lenke caption" onClick={onReplay}>Spill av sesongen</button>
      </div>
      <table className="lop">
        <caption className="visually-hidden">Antall økter spilt av {totalt} mulige, flest først.</caption>
        {/* Breddene MÅ ligge på <col>. En visually-hidden <caption> er
            position:absolute, og da ignorerer fixed-layouten px-bredder på
            cellene og gir alle kolonnene like mye. */}
        <colgroup><col className="kol-fjes" /><col className="kol-navn" /><col /><col className="kol-tall" /></colgroup>
        <tbody>
          {rader.map(r => {
            const antall = na.get(r.p.id) ?? 0
            const front = antall > 0 && antall === ledende
            return (
              <tr key={r.p.id} className={[r.p.id === meg && 'lop-meg', front && 'lop-front'].filter(Boolean).join(' ') || undefined}>
                <td className="lop-fjes"><Avatar profile={r.p} size={26} /></td>
                <th scope="row" className="lop-navn">{r.p.name.split(' ')[0]}</th>
                <td className="lop-spor-celle">
                  <span className="lop-spor" aria-hidden="true">
                    <span className="lop-fyll" style={{ width: `${totalt ? (antall / totalt) * 100 : 0}%` }} />
                  </span>
                </td>
                <td className="lop-tall">{antall}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="caption" aria-live="polite">
        {ferdig ? `Hele sesongen, ${totalt} ${totalt === 1 ? 'økt' : 'økter'}.` : `Etter ${steg + 1} av ${totalt} økter.`}
      </p>
    </section>
  )
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
              <tr key={r.p.id} className={r.p.id === meg ? 'lop-meg' : undefined} style={{ '--y': y } as CSSProperties}>
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
  const [replay, setReplay] = useState(0)
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
  // Eldste først: løpet og rutenettet leses kronologisk, lista motsatt.
  const kronologisk = useMemo(() => [...(d?.held ?? [])].reverse(), [d?.held])
  /**
   * Hvem som faktisk spilte, med samme regel som `season_stats` bruker:
   * påmeldt og innenfor plassgrensa. Ellers ender løpet på et annet tall
   * enn tabellen viser.
   */
  const spilte = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const s of kronologisk) {
      m.set(s.id, new Set(splitQueue(d?.attendance ?? [], s, byId).withSpot.map(p => p.id)))
    }
    return m
  }, [kronologisk, d?.attendance, byId])
  const kumulativt = useMemo(() => {
    const teller = new Map<string, number>()
    return kronologisk.map(s => {
      for (const id of spilte.get(s.id) ?? []) teller.set(id, (teller.get(id) ?? 0) + 1)
      return new Map(teller)
    })
  }, [kronologisk, spilte])

  if (!d) return <PageState title="Statistikk" loading={q.loading} error={q.error} empty="Statistikken kommer når den første sesongen er lagt inn." onRetry={() => void q.reload()} />
  const { season, stats, held } = d
  const rows = stats.map(s => ({ ...s, p: byId.get(s.profile_id)! })).filter(r => r.p)
  const oppmote = [...rows].sort((a, b) => b.sessions - a.sessions || a.p.name.localeCompare(b.p.name, 'nb'))
  const kamper = [...rows].filter(r => r.games > 0).sort((a, b) => b.wins - a.wins || b.points_diff - a.points_diff)
  const anyPoints = rows.some(r => r.points_for > 0 || r.points_against > 0)

  const flest = oppmote[0]?.sessions ?? 0
  const ledere = oppmote.filter(r => r.sessions === flest)
  // Har alle vært på alt, finnes ingen leder å krone.
  const likt = ledere.length === oppmote.length && oppmote.length > 1
  const flestSeire = Math.max(0, ...rows.map(r => r.wins))
  const seiersledere = rows.filter(r => r.wins === flestSeire)
  const seire = flestSeire > 0 && seiersledere.length < rows.length
    ? { tekst: navneliste(seiersledere.map(r => r.p.name.split(' ')[0])), antall: flestSeire }
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
        <Plakat ledere={likt ? [] : ledere.map(r => r.p)} okter={flest} totalt={held.length} seire={seire} />
      )}

      {rows.length > 0 && held.length > 0 && (
        <Oppmotelop key={replay} rader={oppmote} totalt={held.length} kumulativt={kumulativt}
          meg={profile?.id} onReplay={() => setReplay(r => r + 1)} />
      )}

      {kamper.length > 0 && (
        <section className="card stack">
          <h2 className="h3">Kamper</h2>
          <table className="stats-table">
            <caption className="visually-hidden">Kamper og seire, flest seire først.</caption>
            <thead><tr>
              <th scope="col">Spiller</th><th scope="col">Kamper</th><th scope="col">Seire</th>
              {anyPoints && <th scope="col"><abbr title="Poengforskjell">+/−</abbr></th>}
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
  )
}
