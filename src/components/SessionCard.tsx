import { Link } from 'react-router'
import type { Profile, Session } from '../lib/types'
import { AvatarStack } from './Avatar'
import { longDate, time, endTime, signupOpen } from '../lib/format'
import { kr, shareOre } from '../lib/money'
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
  onToggle?: (going: boolean) => void
}

export function SessionCard({ session, goingCount, withSpot = [], waitlist = [], mine, busy, signupWindowDays, onToggle }: Props) {
  const paid = session.cost > 0
  const full = session.capacity != null && goingCount >= session.capacity
  const heads = payerCount(session, goingCount + (mine.going === true ? 0 : 1))   // «hvis du kommer»
  const hasSpot = mine.going === true && !mine.waitlisted
  return (
    <article className={`session-card card ${hasSpot ? 'is-going' : ''}`}>
      <div className="session-card-main">
        <Link to={`/spill/okter/${session.id}`} className="session-card-title">
          <span className="h3">{longDate(session.starts_at)}</span>
          <span className="muted">{time(session.starts_at)}–{endTime(session.starts_at, session.duration_min)}{session.location ? ` · ${session.location}` : ''}</span>
        </Link>
        {(withSpot.length + waitlist.length) > 0 && (
          <Link to={`/spill/okter/${session.id}`} className="session-card-people" aria-label="Se hvem som kommer">
            <AvatarStack people={withSpot} waitlisted={waitlist} />
          </Link>
        )}
        <div className="row">
          <span className={`badge ${full ? 'badge-ember' : 'badge-stone'}`}>{statusLine(session, goingCount)}</span>
          {paid && !full && <span className="badge badge-outline">{kr(shareOre(session.cost, Math.max(heads, 1)))} hver</span>}
          {session.status === 'cancelled' && <span className="badge badge-ember">Avlyst</span>}
        </div>
      </div>
      {onToggle && session.status === 'planned' && signupOpen(session.starts_at, signupWindowDays) && (
        <div className="session-card-actions">
          <AttendButton session={session} goingCount={goingCount} mine={mine} busy={busy} onToggle={onToggle} />
        </div>
      )}
    </article>
  )
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
    if (hasSpot && goingCount > (session.capacity ?? Infinity) && !confirm('Melde deg av? Den første på ventelista får plassen din.')) return
    onToggle(false)
  }
  return (
    <button type="button" className={`btn ${cls} ${block ? 'btn-block' : ''}`} disabled={busy} onClick={click}
      aria-pressed={mine.going === true} title={mine.going === true ? 'Trykk for å melde deg av' : undefined}>
      {label}
    </button>
  )
}