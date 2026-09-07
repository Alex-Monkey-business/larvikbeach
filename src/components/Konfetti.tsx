import { useEffect, useMemo, useState } from 'react'
import './Konfetti.css'

const FARGER = ['var(--color-lavender)', 'var(--color-forest)', 'var(--color-ember)', 'var(--color-stone)', 'var(--color-ink)']

/**
 * Én gang per nøkkel, aldri mer. Nøkkelen er økta man vant, så feiringen
 * kommer når appen åpnes etterpå og ikke igjen ved neste trykk.
 */
export function Konfetti({ nokkel }: { nokkel: string }) {
  const [vis, setVis] = useState(() => {
    if (typeof window === 'undefined') return false
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
    try { return localStorage.getItem(nokkel) === null } catch { return false }   // privat vindu
  })

  useEffect(() => {
    if (!vis) return
    try { localStorage.setItem(nokkel, '1') } catch { /* ingen lagring, feires denne gangen */ }
    const t = setTimeout(() => setVis(false), 3600)
    return () => clearTimeout(t)
  }, [vis, nokkel])

  const biter = useMemo(() => Array.from({ length: 64 }, (_, i) => ({
    venstre: (i * 97) % 100 + Math.random() * 4,
    forsinkelse: Math.random() * 0.7,
    varighet: 2 + Math.random() * 1.2,
    farge: FARGER[i % FARGER.length],
    bredde: 6 + Math.round(Math.random() * 6),
    hoyde: 9 + Math.round(Math.random() * 9),
    snurr: Math.round(360 + Math.random() * 720),
  })), [])

  if (!vis) return null
  return (
    <div className="konfetti" aria-hidden="true">
      {biter.map((b, i) => (
        <span key={i} style={{
          left: `${b.venstre}%`, width: b.bredde, height: b.hoyde, background: b.farge,
          animationDelay: `${b.forsinkelse}s`, animationDuration: `${b.varighet}s`,
          ['--snurr' as string]: `${b.snurr}deg`,
        }} />
      ))}
    </div>
  )
}
