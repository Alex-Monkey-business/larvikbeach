/**
 * Volleyballen fra navnetrekket. Samme ball i logoen og på ledertavla, slik at
 * en fargeendring ikke må gjøres to steder.
 */
export function Ball({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="var(--color-cream)" />
      <path d="M30 2C19 13 17 27 24 39C35 43 49 40 59 31C58 15 46 3 30 2Z" fill="var(--color-lavender)" />
      <path d="M4 23C12 27 18 32 24 39C23 47 22 54 25 61C10 57 0 41 4 23Z" fill="var(--color-ember)" />
      <g stroke="var(--color-forest)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="32" cy="32" r="30" />
        <path d="M30 2C18 14 17 28 24 39C36 44 51 39 62 29M24 39C22 47 23 55 26 61M3 23C11 24 19 31 24 39" />
        <path d="M41 4C29 14 25 24 28 33C39 35 48 31 58 21M5 43C10 44 15 48 17 57M36 61C32 55 30 50 30 42" opacity=".65" />
      </g>
    </svg>
  )
}
