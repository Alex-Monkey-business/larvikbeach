import { memo } from 'react'
import './BeachServe.css'

/** One quiet serve, then stillness. SVG + CSS keeps the illustration lightweight. */
export const BeachServe = memo(function BeachServe() {
  return (
    <svg className="beach-serve-scene" viewBox="0 0 360 220" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="184" cy="177" rx="151" ry="28" fill="var(--color-stone)" opacity=".42" />
      <g stroke="var(--color-forest)" strokeLinecap="round" strokeLinejoin="round">
        <path d="m36 169 110-44 174 40-108 46Z" strokeWidth="1.3" opacity=".3" />
        <path d="m67 179 12 3m196-12 9 2m-142 15 5 1M99 151l6-2" opacity=".2" />
        <g strokeWidth="1.6">
          <path d="M128 164V78m131 117V109" />
          <path d="m128 84 131 31v38l-131-31Z" fill="var(--color-cream)" fillOpacity=".6" />
          <path d="m128 96 131 31m-131-19 131 31m-115-51v38m19-33v38m19-33v38m19-34v38m19-33v38m19-33v38" opacity=".25" strokeWidth="1" />
          <path d="m128 84 131 31" strokeWidth="3" />
        </g>
      </g>
      <g className="serve-shadow-travel">
        <ellipse className="serve-shadow" cx="0" cy="184" rx="13" ry="3.2" fill="var(--color-forest)" />
      </g>
      <g transform="translate(277 182)" stroke="var(--color-ember)" strokeWidth="1.8" strokeLinecap="round">
        <g className="serve-sand serve-sand-left"><path d="m-9-2-4-2m-3 6-3 1" /></g>
        <g className="serve-sand serve-sand-right"><path d="m9-2 4-3m3 7 3 1" /></g>
      </g>
      <g className="serve-ball-travel">
        <g className="serve-ball-height">
          <g className="serve-ball-spin" stroke="var(--color-forest)" strokeWidth="1.25">
            <circle r="15" fill="var(--color-cream)" />
            <path d="M-13-7C-3-11 8-5 10 11A15 15 0 0 0 13-7C4-9-1-12-2-15" fill="var(--color-ember)" />
            <path d="M-2-15C-7-5-5 4 10 11M-14 5C-5 8 1 4 3-4M-7 13C-1 9 1 5 1 0" />
          </g>
        </g>
      </g>
    </svg>
  )
})
