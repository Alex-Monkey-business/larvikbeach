import { memo, useEffect, useRef, useState } from 'react'
import './LogoVolley.css'

export const LogoVolley = memo(function LogoVolley({ showHint = false }: { showHint?: boolean }) {
  const stage = useRef<HTMLButtonElement>(null)
  const ball = useRef<HTMLSpanElement>(null)
  const logo = useRef<HTMLImageElement>(null)
  const animations = useRef<Animation[]>([])
  const hits = useRef(0)
  const [hint, setHint] = useState<'waiting' | 'visible' | 'dismissed'>('waiting')

  useEffect(() => {
    if (!showHint) return
    const reveal = window.setTimeout(() => setHint(current => current === 'waiting' ? 'visible' : current), 1800)
    const dismiss = window.setTimeout(() => setHint('dismissed'), 6800)
    return () => { window.clearTimeout(reveal); window.clearTimeout(dismiss) }
  }, [showHint])

  useEffect(() => () => animations.current.forEach(animation => animation.cancel()), [])

  function hit() {
    setHint('dismissed')
    if (!ball.current || !logo.current || !stage.current) return
    const start = getComputedStyle(ball.current).transform
    animations.current.forEach(animation => animation.cancel())
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animations.current = [ball.current.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 180 })]
      return
    }
    const width = stage.current.clientWidth
    const direction = ++hits.current % 2 ? 1 : -1
    const x = width * .09 * direction
    const y = width * .23
    animations.current = [
      ball.current.animate([
        { transform: start === 'none' ? 'translate(0, 0) rotate(0deg)' : start, offset: 0, easing: 'cubic-bezier(.12,.65,.3,1)' },
        { transform: `translate(${x}px, ${-y}px) rotate(${direction * 150}deg)`, offset: .43, easing: 'cubic-bezier(.55,0,.85,.4)' },
        { transform: `translate(0, 0) rotate(${direction * 330}deg) scale(1.1,.9)`, offset: .77, easing: 'cubic-bezier(.2,.65,.3,1)' },
        { transform: `translate(0, ${-width * .026}px) rotate(${direction * 350}deg)`, offset: .87, easing: 'ease-in' },
        { transform: `translate(0, 0) rotate(${direction * 360}deg)`, offset: 1 },
      ], { duration: 1150 }),
      logo.current.animate([
        { transform: 'translateY(0) scale(1)' },
        { transform: 'translateY(3px) scale(.985,1.025)', offset: .12 },
        { transform: 'translateY(-1px) scale(1.005,.995)', offset: .5 },
        { transform: 'translateY(0) scale(1)' },
      ], { duration: 480, easing: 'ease-out' }),
    ]
  }

  return (
    <button ref={stage} type="button" className="logo-volley" onClick={hit}
      aria-label={showHint ? 'Slå volleyballen' : undefined}
      aria-hidden={showHint ? undefined : true} tabIndex={showHint ? undefined : -1}>
      {showHint && hint === 'visible' && (
        <span className="logo-volley-tip" aria-hidden="true">
          Tæpp på ballen
          <svg width="24" height="23" viewBox="0 0 24 23" fill="none">
            <path d="M2 2c12-2 18 4 17 17m-5-5 5 5 4-6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      <img ref={logo} className="logo-volley-mark" src="/brand/lbv-wordmark.svg" alt="" draggable="false" />
      <span ref={ball} className="logo-volley-ball">
        <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <circle cx="32" cy="32" r="30" fill="var(--color-cream)" />
          <path d="M30 2C19 13 17 27 24 39C35 43 49 40 59 31C58 15 46 3 30 2Z" fill="var(--color-lavender)" />
          <path d="M4 23C12 27 18 32 24 39C23 47 22 54 25 61C10 57 0 41 4 23Z" fill="var(--color-ember)" />
          <g stroke="var(--color-forest)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="32" cy="32" r="30" />
            <path d="M30 2C18 14 17 28 24 39C36 44 51 39 62 29M24 39C22 47 23 55 26 61M3 23C11 24 19 31 24 39" />
            <path d="M41 4C29 14 25 24 28 33C39 35 48 31 58 21M5 43C10 44 15 48 17 57M36 61C32 55 30 50 30 42" opacity=".65" />
          </g>
        </svg>
      </span>
    </button>
  )
})
