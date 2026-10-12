import type { Match } from './types'

export interface StandingRow {
  id: string
  rank: number          // delt plass når alt som teller er likt
  diff: number          // poeng for minus poeng mot
  pointsFor: number
  wins: number
}

type M = Pick<Match, 'team_a' | 'team_b' | 'winner' | 'score_a' | 'score_b' | 'resting'>

/**
 * King of the beach: parene roterer, så den som har spilt med flere enn én
 * makker er i en king-økt. Faste lag (seks, eller fire satt opp for hånd før)
 * har én makker hele kvelden. Leses av kampene som er lagt ut, ikke av
 * resultatene, så formatet er kjent før første poeng.
 */
export function isKing(matches: M[]): boolean {
  const partner = new Map<string, string>()
  for (const m of matches) {
    if (m.resting.length === 1) return true
    for (const team of [m.team_a, m.team_b]) {
      for (const id of team) {
        const other = team.find(x => x !== id)
        if (!other) continue
        const before = partner.get(id)
        if (before && before !== other) return true
        partner.set(id, other)
      }
    }
  }
  return false
}

/**
 * Stillingen for en økt. King: differanse, så poeng scoret, ellers delt plass.
 * Seire teller ikke. Faste lag: seire, så differanse. Bare kamper med begge
 * poengene gir poeng; en vinner satt med et trykk gir bare en seier.
 */
export function standings(matches: M[], ids: string[], king = isKing(matches)): StandingRow[] {
  const rows = new Map(ids.map(id => [id, { id, rank: 0, diff: 0, pointsFor: 0, wins: 0 }]))
  for (const m of matches) {
    if (m.winner) for (const id of m.winner === 'a' ? m.team_a : m.team_b) { const r = rows.get(id); if (r) r.wins++ }
    if (m.score_a == null || m.score_b == null) continue
    for (const [team, f, a] of [[m.team_a, m.score_a, m.score_b], [m.team_b, m.score_b, m.score_a]] as const) {
      for (const id of team) { const r = rows.get(id); if (r) { r.pointsFor += f; r.diff += f - a } }
    }
  }
  const key = (r: StandingRow) => king ? [r.diff, r.pointsFor] : [r.wins, r.diff]
  const cmp = (a: StandingRow, b: StandingRow) => {
    const ka = key(a), kb = key(b)
    return kb[0] - ka[0] || kb[1] - ka[1]
  }
  const list = [...rows.values()].sort(cmp)
  list.forEach((r, i) => { r.rank = i > 0 && cmp(list[i - 1], r) === 0 ? list[i - 1].rank : i + 1 })
  return list
}

/** Kamper per runde: fire og seks spiller tre, fem spiller fem. */
export const roundSize = (players: number) => players === 5 ? 5 : 3
