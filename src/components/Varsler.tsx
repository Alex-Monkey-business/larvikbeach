import { useEffect, useState } from 'react'
import { erPa, slaAv, slaPa, stottes } from '../lib/push'
import { Notice } from './Notice'

/**
 * Står på Meg under «Appen på mobilen». Finnes bare der telefonen kan ta
 * imot push: på iPhone betyr det appen på hjemskjermen.
 */
export function Varsler() {
  const [pa, setPa] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (stottes()) void erPa().then(setPa).catch(() => setPa(false)) }, [])
  if (!stottes() || pa === null) return null

  async function bytt() {
    setBusy(true); setError(null)
    try { if (pa) await slaAv(); else await slaPa(); setPa(!pa) }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt') }
    finally { setBusy(false) }
  }

  return (
    <section className="card stack">
      <div className="row between">
        <h2 className="h3">Varsler</h2>
        <span className="caption">{pa ? 'På' : 'Av'}</span>
      </div>
      <p>{pa ? 'Du får varsel på telefonen fra gjengen.' : 'Få beskjed på telefonen, ikke bare på e-post.'}</p>
      {error && <Notice>{error}</Notice>}
      <button type="button" className={`btn btn-sm ${pa ? 'btn-ghost' : 'btn-forest'}`} style={{ justifySelf: 'start', ...(pa ? { paddingLeft: 0 } : {}) }} disabled={busy} onClick={() => void bytt()}>
        {busy ? 'Et øyeblikk…' : pa ? 'Skru av' : 'Slå på varsler'}
      </button>
    </section>
  )
}
