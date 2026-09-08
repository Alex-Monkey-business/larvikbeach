import { useEffect, useState } from 'react'

const stille = () => typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Teller opp til `mal` med requestAnimationFrame.
 *
 * Redusert bevegelse må sjekkes her, i JS: CSS-regelen som slår av animasjoner
 * biter ikke på rAF eller `element.animate()`. Da leveres tallet direkte, i
 * stedet for å settes fra en effekt — det er samme verdi én render tidligere.
 */
export function useCountUp(mal: number, ms = 900): number {
  const rolig = stille()
  const [n, setN] = useState(0)

  useEffect(() => {
    if (rolig) return
    let raf = 0
    const start = performance.now()
    const tikk = (na: number) => {
      const p = Math.min(1, (na - start) / ms)
      // Bremser mot slutten, så det siste tallet lander i stedet for å bli kappet.
      setN(Math.round(mal * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tikk)
    }
    raf = requestAnimationFrame(tikk)
    return () => cancelAnimationFrame(raf)
  }, [mal, ms, rolig])

  return rolig ? mal : n
}
