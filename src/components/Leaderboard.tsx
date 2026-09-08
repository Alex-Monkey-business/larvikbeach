import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Avatar } from './Avatar'
import { useCountUp } from '../lib/useCountUp'
import type { Profile, SeasonStat } from '../lib/types'
import './Leaderboard.css'

type Entry = SeasonStat & { p: Profile }
type Metric = 'wins' | 'sessions'

/** «seier»/«seire», «økt»/«økter» — bøyd etter tallet. */
function enhetsord(n: number, metric: Metric): string {
  return metric === 'wins' ? (n === 1 ? 'seier' : 'seire') : (n === 1 ? 'økt' : 'økter')
}
/** «1 seier», «3 seire», «1 økt», «4 økter». */
function enhet(n: number, metric: Metric): string {
  return `${n} ${enhetsord(n, metric)}`
}

function Crown() {
  return <svg viewBox="0 0 32 26" fill="none" aria-hidden="true"><path d="m3 7 7 6 6-10 6 10 7-6-3 15H6L3 7Z" fill="currentColor" /><path d="M8 25h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
}

function Spotlight({ leaders, metric, score, gap }: { leaders: Entry[]; metric: Metric; score: number; gap: number }) {
  const count = useCountUp(score, 1100)
  return (
    <div className="leader-spotlight">
      <span className="leader-watermark" aria-hidden="true">01</span>
      <div className="leader-spotlight-top">
        <span className="leader-eyebrow">{leaders.length > 1 ? 'Delt førsteplass' : 'I føringen'}</span>
        <span className="leader-crown"><Crown /></span>
      </div>
      <div className="leader-winners">
        {leaders.map(r => <div className="leader-winner" key={r.profile_id}>
          <span className="leader-portrait"><Avatar profile={r.p} size={68} /></span>
          <p className="leader-name">{r.p.name}</p>
        </div>)}
      </div>
      <div className="leader-spotlight-bottom">
        <p className="leader-total"><strong>{count}</strong><span>{enhetsord(score, metric)}</span></p>
        <span className="leader-gap">{gap > 0 ? `${enhet(gap, metric)} foran neste` : 'Helt likt i toppen'}</span>
      </div>
    </div>
  )
}

export function Leaderboard({ rows, me, total }: { rows: Entry[]; me?: string; total: number }) {
  const [metric, setMetric] = useState<Metric>(rows.some(r => r.games > 0) ? 'wins' : 'sessions')
  const [replay, setReplay] = useState(0)
  const list = useRef<HTMLOListElement>(null)
  const positions = useRef(new Map<string, number>())
  // Delt plassering er konkurranserangering: like tall gir samme nummer, og
  // den neste hopper over plassene som er brukt opp (1, 1, 3). Navnet avgjør
  // bare rekkefølgen i visninga, aldri plasseringen.
  const ranked = useMemo(() => {
    const sorted = [...rows].sort((a, b) => b[metric] - a[metric] || a.p.name.localeCompare(b.p.name, 'nb'))
    return sorted.map(r => ({ ...r, rank: sorted.findIndex(x => x[metric] === r[metric]) + 1 }))
  }, [rows, metric])
  const order = ranked.map(r => r.profile_id).join(',')
  useLayoutEffect(() => {
    const next = new Map<string, number>()
    const animations: Animation[] = []
    for (const row of list.current?.querySelectorAll<HTMLElement>('[data-player]') ?? []) {
      const id = row.dataset.player!
      const top = row.offsetTop
      next.set(id, top)
      const previous = positions.current.get(id)
      if (previous !== undefined && previous !== top && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animations.push(row.animate([{ transform: `translateY(${previous - top}px)` }, { transform: 'translateY(0)' }], { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)' }))
      }
    }
    positions.current = next
    return () => animations.forEach(animation => animation.cancel())
  }, [order])
  const score = ranked[0]?.[metric] ?? 0
  const leaders = score > 0 ? ranked.filter(r => r.rank === 1) : []
  const runnerUp = ranked.find(r => r.rank !== 1)
  const mine = ranked.find(r => r.profile_id === me)

  return (
    <section className="leaderboard" aria-labelledby="leaderboard-title">
      <h2 id="leaderboard-title" className="visually-hidden">Rangering</h2>
      <div className="leader-controls">
        <div className="leader-switch" role="group" aria-label="Ranger etter">
          <span className={`leader-switch-track ${metric === 'sessions' ? 'is-attendance' : ''}`} aria-hidden="true" />
          <button type="button" aria-pressed={metric === 'wins'} onClick={() => setMetric('wins')}>Seire</button>
          <button type="button" aria-pressed={metric === 'sessions'} onClick={() => setMetric('sessions')}>Oppmøte</button>
        </div>
        <button type="button" className="leader-replay" onClick={() => setReplay(n => n + 1)} aria-label="Spill lederanimasjonen på nytt" title="Spill animasjonen på nytt">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16 7a7 7 0 1 0 1 5M12 7h5V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {leaders.length > 0 ? <Spotlight key={`${metric}-${replay}`} leaders={leaders} metric={metric} score={score} gap={runnerUp ? score - runnerUp[metric] : 0} />
        : <div className="leader-empty"><p>Ingen leder ennå.</p><span>{metric === 'wins' ? 'Ingen seire er registrert.' : 'Ingen oppmøter er registrert.'}</span></div>}
      {mine && <p className="leader-personal">
        {mine[metric] > 0
          ? <>
              <strong>Du er på {mine.rank}. plass</strong>
              {mine.rank !== 1 && <span>{enhet(score - mine[metric], metric)} opp til toppen.</span>}
            </>
          : <span>Ingen {metric === 'wins' ? 'seire' : 'oppmøter'} er registrert på deg.</span>}
      </p>}
      <div className="leader-list-heading"><span>Plassering</span><span className={`leader-numbers ${metric === 'wins' ? 'with-diff' : ''}`}><span>{metric === 'wins' ? 'Seire' : 'Økter'}</span>{metric === 'wins' && <abbr title="Poengdifferanse: poeng scoret minus poeng sluppet inn">+/−</abbr>}</span></div>
      <ol ref={list} className="leader-list" aria-label={metric === 'wins' ? 'Rangering etter seire' : 'Rangering etter oppmøte'}>
        {ranked.map((r, index) => <li key={r.profile_id} data-player={r.profile_id} className={`leader-row ${r.rank <= 3 && r[metric] > 0 ? `leader-rank-${r.rank}` : ''} ${r.profile_id === me ? 'leader-is-me' : ''}`}>
          <div className="leader-row-content" key={`${metric}-${replay}`} style={{ '--row': Math.min(index, 12) } as CSSProperties}>
            <span className="leader-rank"><span aria-hidden="true">{String(r.rank).padStart(2, '0')}</span><span className="visually-hidden">{r.rank}. plass</span></span>
            <Avatar profile={r.p} size={40} />
            <div className="leader-player"><p>{r.p.name}{r.profile_id === me && <span className="leader-you">du</span>}</p><span>{metric === 'wins' ? `${r.games} ${r.games === 1 ? 'kamp' : 'kamper'} spilt` : `${total} ${total === 1 ? 'økt' : 'økter'} i sesongen`}</span></div>
            <span className={`leader-numbers ${metric === 'wins' ? 'with-diff' : ''}`}>
              <strong className="leader-score">{r[metric]}</strong>
              {metric === 'wins' && <span className={`leader-diff ${r.points_diff > 0 ? 'is-positive' : ''}`} title={`Poengdifferanse: ${r.points_for} scoret, ${r.points_against} sluppet inn`}>{r.points_diff > 0 ? `+${r.points_diff}` : r.points_diff < 0 ? `−${Math.abs(r.points_diff)}` : '0'}</span>}
            </span>
            <span className="leader-meter" aria-hidden="true"><span style={{ transform: `scaleX(${score ? r[metric] / score : 0})` }} /></span>
          </div>
        </li>)}
      </ol>
      <p className="leader-footnote">Like tall gir delt plassering.{metric === 'wins' && ' +/− viser poeng scoret minus poeng sluppet inn.'}</p>
    </section>
  )
}
