import { Link } from 'react-router'
import type { Profile, Session } from '../lib/types'
import { AvatarStack } from './Avatar'
import { longDate, isPast, signupOpen } from '../lib/format'
import { payerCount, statusLine, type MyState } from '../pages/play/useSessions'
import './SessionCard.css'

interface Props {
  session: Session
  goingCount: number
  withSpot?: Profile[]
  waitlist?: Profile[]
  mine: MyState
  busy?: boolean
  signupWindowDays: number
  winners?: Profile[]          // flest seire på en spilt økt
  subtitle?: string | null     // bare når økta avviker fra det vanlige
  onToggle?: (going: boolean) => void
}

export function SessionCard({ session, goingCount, withSpot = [], waitlist = [], mine, busy, signupWindowDays, winners = [], subtitle, onToggle }: Props) {
  const full = session.capacity != null && goingCount >= session.capacity
  const played = isPast(session.starts_at) && session.status !== 'cancelled'
  // «Dagens» holder bare det første døgnet; etter det er det forrige økt.
  const ferskt = Date.now() - new Date(session.starts_at).getTime() < 24 * 3600_000
  const hasSpot = mine.going === true && !mine.waitlisted
  return (
    <article className={`session-card card ${hasSpot ? 'is-going' : ''}`}>
      <div className="session-card-main">
        <Link to={`/spill/okter/${session.id}`} className="session-card-title">
          <span className="h3">{longDate(session.starts_at)}</span>
          {subtitle && <span className="muted">{subtitle}</span>}
          {session.note && <span className="muted">{session.note}</span>}
        </Link>
        {(withSpot.length + waitlist.length) > 0 && (
          <Link to={`/spill/okter/${session.id}`} className="session-card-people" aria-label="Se hvem som kommer">
            <AvatarStack people={withSpot} waitlisted={played ? [] : waitlist} />
          </Link>
        )}
        <div className="row">
          {played
            ? <span className="badge badge-forest">{payerCount(session, goingCount)} spilte</span>
            : <span className={`badge ${full ? 'badge-ember' : 'badge-stone'}`}>{statusLine(session, goingCount)}</span>}
          {session.status === 'cancelled' && <span className="badge badge-ember">Avlyst</span>}
        </div>
        {played && winners.length > 0 && winners.length <= 2 && (
          <p className="row" style={{ gap: 8 }}>
            <AvatarStack people={winners} size={28} />
            <span>{ferskt ? (winners.length === 1 ? 'Dagens vinner' : 'Dagens vinnere') : (winners.length === 1 ? 'Vinner' : 'Vinnere')}: {names(winners)}</span>
          </p>
        )}
      </div>
      {onToggle && session.status === 'planned' && signupOpen(session.starts_at, signupWindowDays) && (
        <div className="session-card-actions">
          <AttendButton session={session} goingCount={goingCount} mine={mine} busy={busy} onToggle={onToggle} />
        </div>
      )}
    </article>
  )
}

/** «Kari», «Kari og Ola», «Kari, Ola og Per». */
function names(people: Profile[]): string {
  const f = people.map(p => p.name.split(' ')[0])
  return f.length < 2 ? (f[0] ?? '') : `${f.slice(0, -1).join(', ')} og ${f[f.length - 1]}`
}

/**
 * Én knapp som viser tilstanden og bytter ved trykk. Har du plass på en full
 * økt, spør den én gang: noen i køen tar plassen din.
 */
export function AttendButton({ session, goingCount, mine, busy, onToggle, block }: {
  session: Session; goingCount: number; mine: MyState; busy?: boolean; onToggle: (going: boolean) => void; block?: boolean
}) {
  const full = session.capacity != null && goingCount >= session.capacity
  const hasSpot = mine.going === true && !mine.waitlisted
  const label = hasSpot ? 'Du har plass'
    : mine.going === true ? `Venteliste nr. ${mine.spot - (session.capacity ?? 0)}`
    : full ? 'Sett meg på venteliste' : 'Jeg kommer'
  const cls = hasSpot ? 'btn-forest' : mine.going === true ? 'btn-dark' : 'btn-primary'
  function click() {
    if (mine.going !== true) return onToggle(true)
    // Knappen viser tilstanden, så trykket avmelder. Det er den store grønne
    // knappen på kortet: den skal ikke kunne treffes ved uhell.
    const kø = hasSpot && goingCount > (session.capacity ?? Infinity)
    if (!confirm(kø ? 'Melde deg av? Den første på ventelista får plassen din.' : 'Melde deg av økta?')) return
    onToggle(false)
  }
  return (
    <button type="button" className={`btn ${cls} ${block ? 'btn-block' : ''}`} disabled={busy} onClick={click}
      aria-pressed={mine.going === true} title={mine.going === true ? 'Trykk for å melde deg av' : undefined}>
      {label}
    </button>
  )
}