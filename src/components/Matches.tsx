import { useEffect, useState } from 'react'
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
 * Trykk på laget som vant, eller skriv poengene. «Ny runde» trekker nye lag
 * og legger kampene under.
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
          <div className="row">
            {matches.length > 0 && <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void run(() => api.drawMatches(session.id, true))}>Ny runde</button>}
            {(matches.length === 0 || !anyResult) && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(() => api.drawMatches(session.id))}>{matches.length ? 'Trekk på nytt' : 'Trekk lag'}</button>}
          </div>
        )}
      </div>
      {error && <Notice>{error}</Notice>}
      {matches.length === 0
        ? <p className="muted">{n} spillere. {format}</p>
        : <ol className="matches">
            {matches.map(m => <MatchRow key={m.id} m={m} byId={byId} canAct={canAct} busy={busy}
              onWin={w => void run(() => api.setMatchWinner(m.id, m.winner === w ? null : w))}
              onScore={(a, b) => void run(() => api.setMatchScore(m.id, a, b))} />)}
          </ol>}
      {anyResult && <Standings matches={matches} byId={byId} />}
    </section>
  )
}

function MatchRow({ m, byId, canAct, busy, onWin, onScore }: {
  m: Match; byId: Map<string, Profile>; canAct: boolean; busy: boolean
  onWin: (w: 'a' | 'b') => void; onScore: (a: number | null, b: number | null) => void
}) {
  const team = (ids: string[]) => ids.map(id => byId.get(id)).filter(Boolean) as Profile[]
  const [a, setA] = useState(m.score_a?.toString() ?? '')
  const [b, setB] = useState(m.score_b?.toString() ?? '')
  useEffect(() => { setA(m.score_a?.toString() ?? ''); setB(m.score_b?.toString() ?? '') }, [m.score_a, m.score_b])
  function commit() {
    const na = a === '' ? null : Number(a), nb = b === '' ? null : Number(b)
    if (na === m.score_a && nb === m.score_b) return
    if ((na === null) !== (nb === null)) return          // vent til begge er fylt ut
    onScore(na, nb)
  }
  return (
    <li className="match">
      <span className="caption">Runde {m.round}{m.resting.length ? ` · ${team(m.resting).map(p => p.name.split(' ')[0]).join(' og ')} sitter` : ''}</span>
      <div className="match-teams">
        <TeamBox players={team(m.team_a)} won={m.winner === 'a'} lost={m.winner === 'b'} value={a} onChange={setA} onCommit={commit} onWin={() => onWin('a')} canAct={canAct} busy={busy} label="Poeng lag 1" />
        <TeamBox players={team(m.team_b)} won={m.winner === 'b'} lost={m.winner === 'a'} value={b} onChange={setB} onCommit={commit} onWin={() => onWin('b')} canAct={canAct} busy={busy} label="Poeng lag 2" />
      </div>
    </li>
  )
}

// Egen komponent på toppnivå: definert inne i raden ville React bygget den på
// nytt for hvert tastetrykk, og feltet mistet fokus før poengene ble lagret.
function TeamBox({ players, won, lost, value, onChange, onCommit, onWin, canAct, busy, label }: {
  players: Profile[]; won: boolean; lost: boolean; value: string
  onChange: (s: string) => void; onCommit: () => void; onWin: () => void; canAct: boolean; busy: boolean; label: string
}) {
  return (
    <div className={`team ${won ? 'team-won' : ''} ${lost ? 'team-lost' : ''}`}>
      <button type="button" className="team-names" disabled={!canAct || busy} onClick={onWin} aria-pressed={won}
        title={canAct ? 'Trykk for å markere som vinner' : undefined}>
        {players.map(p => <span key={p.id} className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Avatar profile={p} size={28} /><span>{p.name.split(' ')[0]}</span></span>)}
      </button>
      <input className="score num" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label={label}
        disabled={!canAct || busy} placeholder={canAct ? '–' : ''}
        value={value} onChange={e => onChange(e.target.value.replace(/\D/g, ''))} onBlur={onCommit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
    </div>
  )
}

function Standings({ matches, byId }: { matches: Match[]; byId: Map<string, Profile> }) {
  const wins = new Map<string, number>()
  for (const m of matches) {
    if (!m.winner) continue
    for (const id of m.winner === 'a' ? m.team_a : m.team_b) wins.set(id, (wins.get(id) ?? 0) + 1)
  }
  const rows = [...byId.values()].map(p => ({ p, w: wins.get(p.id) ?? 0 })).sort((a, b) => b.w - a.w)
  if (matches.length === 1) return null
  return (
    <ul className="list" aria-label="Seire">
      {rows.map(({ p, w }) => <li key={p.id} className="row between"><span className="row" style={{ gap: 8 }}><Avatar profile={p} size={28} />{p.name}</span><span className="num" style={{ fontSize: 24 }}>{w}</span></li>)}
    </ul>
  )
}
