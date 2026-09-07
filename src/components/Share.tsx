import { useState } from 'react'

/**
 * Del en ferdigskrevet melding. På mobil åpner telefonens delemeny, der
 * Messenger ligger. Ellers kopieres teksten. Går ingen av delene, vises den
 * så den kan merkes for hånd.
 */
export function ShareButton({ text, label = 'Del påminnelse', className = 'btn', onShared }: {
  text: string; label?: string; className?: string; onShared?: () => void
}) {
  const [state, setState] = useState<'idle' | 'delt' | 'kopiert' | 'manuelt'>('idle')

  async function go() {
    if (navigator.share) {
      try { await navigator.share({ text }); setState('delt'); onShared?.(); return }
      catch { return }                       // avbrutt av brukeren: ikke gjør noe
    }
    try { await navigator.clipboard.writeText(text); setState('kopiert'); onShared?.() }
    catch { setState('manuelt'); onShared?.() }
  }

  return (
    <div className="stack" style={{ minWidth: 0 }}>
      <div className="row">
        <button type="button" className={className} onClick={() => void go()}>{label}</button>
        {state === 'kopiert' && <span className="caption">Kopiert. Lim inn i Messenger.</span>}
        {state === 'delt' && <span className="caption">Delt.</span>}
      </div>
      {state === 'manuelt' && (
        <textarea className="textarea share-text" readOnly value={text} onFocus={e => e.currentTarget.select()} />
      )}
    </div>
  )
}
