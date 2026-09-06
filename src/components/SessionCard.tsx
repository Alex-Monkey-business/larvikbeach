import { Link } from 'react-router'
import type { Session } from '../lib/types'
import { longDate, time, endTime } from '../lib/format'
import { kr, shareOre } from '../lib/money'
import './SessionCard.css'

interface Props {
  session: Session
  goingCount: number
  mine: boolean | null           // null = ikke svart
  busy?: boolean
  onToggle?: (going: boolean) => void
}

export function SessionCard({ session, goingCount, mine, busy, onToggle }: Props) {
  const paid = session.cost > 0
  const heads = goingCount + (mine === true ? 0 : 1)   // «hvis du kommer»
  return (
    <article className={`session-card card ${mine === true ? 'is-going' : ''}`}>
      <div className="session-card-main">
        <Link to={`/spill/okter/${session.id}`} className="session-card-title">
          <span className="h3">{longDate(session.starts_at)}</span>
          <span className="muted">{time(session.starts_at)}–{endTime(session.starts_at, session.duration_min)}{session.location ? ` · ${session.location}` : ''}</span>
        </Link>
        <div className="row">
          <span className="badge badge-stone">{goingCount} påmeldt</span>
          {paid && <span className="badge badge-outline">{kr(shareOre(session.cost, Math.max(heads, 1)))} hver</span>}
          {session.status === 'cancelled' && <span className="badge badge-ember">Avlyst</span>}
        </div>
      </div>
      {onToggle && session.status === 'planned' && (
        <div className="session-card-actions">
          <button type="button" className={`btn ${mine === true ? 'btn-forest' : 'btn-primary'}`} disabled={busy} onClick={() => onToggle(true)}>
            {mine === true ? 'Du kommer' : 'Jeg kommer'}
          </button>
          <button type="button" className={`btn ${mine === false ? 'btn-dark' : ''}`} disabled={busy} onClick={() => onToggle(false)}>
            {mine === false ? 'Kan ikke' : 'Kan ikke'}
          </button>
        </div>
      )}
    </article>
  )
}
