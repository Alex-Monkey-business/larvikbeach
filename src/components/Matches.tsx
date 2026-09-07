import { useState } from 'react'
import { api } from '../lib/api'
import { useQuery } from '../lib/useQuery'
import type { Match, Profile, Session } from '../lib/types'
import { Avatar } from './Avatar'
import { Notice } from './Notice'
import './Matches.css'

interface Props {
  session: Session
  players: Profile[]          // de som har plass, i kørekkefølge
  canAct: boolean             // har plass eller admin
}

/**
 * Kamper for økta. Vises på øktdagen og etterpå, når det er 4–6 med plass.
 * Trykk på laget som vant. Trykk igjen for å nullstille.
 */
export function Matches({ session, players, canAct }: Props) {
  const q = useQuery(() => api.matches(session.id), [session.id])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const byId = new Map(players.map(p => [p.id, p]))
  const n = players.length
  const today = new Date(session.starts_at).toDateString() === new Date().toDateString()
  const show = session.status === 'held' || today || (q.data?.length ?? 0) > 0
  if (!show || n < 4 || n > 6) return null

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); await q.reload() }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt') }
    finally { setBusy(false) }
  }

  const matches = q.data ?? []
  const anyResult = matches.some(m => m.winner)
  const format = n === 5 ? 'King of the beach: alle spiller med alle, én sitter per runde.' : n === 6 ? 'Tre lag, alle møter alle.' : 'To lag.'

  return (
    <section className="card stack">
      <div className="row between">
        <h2 className="h3">Kamper</h2>
        {canAct && (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(() => api.drawMatches(session.id))}>
            {matches.length ? 'Trekk på nytt' : 'Trekk lag'}
          </button>
        )}
      </div>
      {error && <Notice>{error}</Notice>}
      {matches.length === 0
        ? <p className="muted">{n} spillere. {format}</p>
        : <ol className="matches">
            {matches.map(m => <MatchRow key={m.id} m={m} byId={byId} canAct={canAct} busy={busy} showRound={matches.length > 1}
              onWin={w => void run(() => api.setMatchWinner(m.id, m.winner === w ? null : w))} />)}
          </ol>}
      {anyResult && <Standings matches={matches} byId={byId} />}
    </section>
  )
}

function MatchRow({ m, byId, canAct, busy, showRound, onWin }: { m: Match; byId: Map<string, Profile>; canAct: boolean; busy: boolean; showRound: boolean; onWin: (w: 'a' | 'b') => void }) {
  const team = (ids: string[]) => ids.map(id => byId.get(id)).filter(Boolean) as Profile[]
  const Team = ({ ids, side }: { ids: string[]; side: 'a' | 'b' }) => {
    const won = m.winner === side
    const lost = m.winner && !won
    return (
      <button type="button" className={`team ${won ? 'team-won' : ''} ${lost ? 'team-lost' : ''}`} disabled={!canAct || busy} onClick={() => onWin(side)} aria-pressed={won}>
        {team(ids).map(p => <span key={p.id} className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Avatar profile={p} size={28} /><span>{p.name.split(' ')[0]}</span></span>)}
      </button>
    )
  }
  return (
    <li className="match">
      {showRound && <span className="caption">Runde {m.round}{m.resting.length ? ` · ${team(m.resting).map(p => p.name.split(' ')[0]).join(' og ')} sitter` : ''}</span>}
      <div className="match-teams">
        <Team ids={m.team_a} side="a" />
        <span className="match-vs">mot</span>
        <Team ids={m.team_b} side="b" />
      </div>
    </li>
  )
}

function Standings({ matches, byId }: { matches: Match[]; byId: Map<string, Profile> }) {
  const wins = new Map<string, number>()
  for (const m of matches) {
    if (!m.winner) continue
    for (const id of m.winner === 'a' ? m.team_a : m.team_b) wins.set(id, (wins.get(id) ?? 0) + 1)
  }
  const rows = [...byId.values()].map(p => ({ p, w: wins.get(p.id) ?? 0 })).sort((a, b) => b.w - a.w)
  if (matches.length === 1) return null   // to lag: resultatet står på kampen
  return (
    <ul className="list" aria-label="Seire">
      {rows.map(({ p, w }) => <li key={p.id} className="row between"><span className="row" style={{ gap: 8 }}><Avatar profile={p} size={28} />{p.name}</span><span className="num" style={{ fontSize: 24 }}>{w}</span></li>)}
    </ul>
  )
}
