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

const first = (p: Profile) => p.name.split(' ')[0]

/**
 * Kamper for økta. Vises på øktdagen og etterpå, når det er 4–6 med plass.
 * Lagene settes opp for hånd eller trekkes. Trykk på laget som vant, eller
 * skriv poengene. «Ny runde» legger nye kamper under – med lag satt opp for
 * hånd er det de samme lagene igjen, ellers nye trekk.
 */
export function Matches({ session, players, canAct }: Props) {
  const q = useQuery(() => api.matches(session.id), [session.id])
  const t = useQuery(() => api.sessionTeams(session.id), [session.id])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const byId = new Map(players.map(p => [p.id, p]))
  const n = players.length
  const today = new Date(session.starts_at).toDateString() === new Date().toDateString()
  const show = session.status === 'held' || today || (q.data?.length ?? 0) > 0
  if (!show || n < 4 || n > 6) return null

  /** Kjør, hent på nytt, og si om det gikk – kalleren kan lukke skjema. */
  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true); setError(null)
    try { await fn(); await Promise.all([q.reload(), t.reload()]); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt'); return false }
    finally { setBusy(false) }
  }

  const matches = q.data ?? []
  const anyResult = matches.some(m => m.winner)
  const format = n === 5 ? 'King of the beach: alle spiller med alle, én sitter per runde.' : n === 6 ? 'Tre lag, alle møter alle.' : 'To lag.'
  // Med fem spilles hvert par nøyaktig én gang uansett, så da er det ingenting
  // å sette opp.
  const canPick = n === 4 || n === 6
  const saved = (t.data ?? []).filter(x => x.members.every(id => byId.has(id))).map(x => x.members)
  const hasTeams = saved.length === n / 2

  // Går det galt står feilen i kortet, og oppsettet blir stående til retting.
  async function savePairs(pairs: string[][]) {
    if (await run(() => api.setSessionTeams(session.id, pairs))) setPicking(false)
  }

  return (
    <section className="card stack">
      <div className="row between">
        <h2 className="h3">Kamper</h2>
        {canAct && !picking && matches.length > 0 && (
          <div className="row">
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void run(() => api.drawMatches(session.id, true))}>Ny runde</button>
            {canPick && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setPicking(true)}>{hasTeams ? 'Endre lag' : 'Sett opp lag'}</button>}
            {!anyResult && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run(() => api.drawMatches(session.id))}>Trekk på nytt</button>}
          </div>
        )}
      </div>
      {error && <Notice>{error}</Notice>}

      {picking
        ? <TeamPicker players={players} initial={hasTeams ? saved : []} busy={busy} hasMatches={matches.length > 0}
            onSave={pairs => void savePairs(pairs)} onCancel={() => { setPicking(false); setError(null) }} />
        : matches.length === 0
          ? <div className="stack">
              <p className="muted">{n} spillere. {format}</p>
              {canAct && (
                <div className="row">
                  {canPick && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setPicking(true)}>Sett opp lag</button>}
                  <button type="button" className="btn" disabled={busy} onClick={() => void run(() => api.drawMatches(session.id))}>Trekk tilfeldig</button>
                </div>
              )}
            </div>
          : <ol className="matches">
              {matches.map(m => <MatchRow key={m.id} m={m} byId={byId} canAct={canAct} busy={busy}
                onWin={w => void run(() => api.setMatchWinner(m.id, m.winner === w ? null : w))}
                onScore={(a, b) => void run(() => api.setMatchScore(m.id, a, b))} />)}
            </ol>}

      {!picking && anyResult && <Standings matches={matches} byId={byId} />}
    </section>
  )
}

/**
 * Sett opp lagene selv: tapp to som skal spille sammen. Lagene har ingen
 * rekkefølge – alle møter alle – så det er parene som er valget, ikke hvem som
 * er lag 1.
 */
function TeamPicker({ players, initial, busy, hasMatches, onSave, onCancel }: {
  players: Profile[]; initial: string[][]; busy: boolean; hasMatches: boolean
  onSave: (pairs: string[][]) => void; onCancel: () => void
}) {
  const [pairs, setPairs] = useState<string[][]>(initial)
  const [sel, setSel] = useState<string | null>(null)
  const byId = new Map(players.map(p => [p.id, p]))
  const taken = new Set(pairs.flat())
  const pool = players.filter(p => !taken.has(p.id))

  function tap(id: string) {
    if (sel === id) { setSel(null); return }
    if (sel === null) { setSel(id); return }
    setPairs([...pairs, [sel, id]])
    setSel(null)
  }

  const selected = sel ? byId.get(sel) : undefined
  const hint = selected
    ? `Tapp den som skal spille med ${first(selected)}.`
    : pool.length === 0 ? 'Alle er satt opp.' : 'Tapp to som skal spille sammen.'

  return (
    <div className="stack">
      <p className="caption">{hint}</p>
      {pool.length > 0 && (
        <ul className="pick-pool">
          {pool.map(p => (
            <li key={p.id}>
              <button type="button" className={`btn pick ${sel === p.id ? 'pick-on' : ''}`} disabled={busy}
                aria-pressed={sel === p.id} onClick={() => tap(p.id)}>
                <Avatar profile={p} size={32} />{first(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {pairs.length > 0 && (
        <ul className="list" aria-label="Lag">
          {pairs.map((pair, i) => {
            const people = pair.map(id => byId.get(id)).filter(Boolean) as Profile[]
            return (
              <li key={pair.join()} className="row between">
                <span className="row">
                  {people.map(p => <Avatar key={p.id} profile={p} size={32} />)}
                  {people.map(first).join(' og ')}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                  onClick={() => setPairs(pairs.filter((_, j) => j !== i))}>Løs opp</button>
              </li>
            )
          })}
        </ul>
      )}
      {hasMatches && <p className="caption">Kamper som er spilt blir stående. Runder uten resultat byttes ut med de nye lagene.</p>}
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={busy || pool.length > 0} onClick={() => onSave(pairs)}>Lagre lag</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>Avbryt</button>
      </div>
    </div>
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
      <span className="caption">Runde {m.round}{m.resting.length ? ` · ${team(m.resting).map(first).join(' og ')} sitter` : ''}</span>
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
        {players.map(p => <span key={p.id} className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Avatar profile={p} size={28} /><span className="team-name">{first(p)}</span></span>)}
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
