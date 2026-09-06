import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { longDate, time, fromLocalInput, toLocalInput } from '../../lib/format'
import { kr } from '../../lib/money'
import { Notice } from '../../components/Notice'
import type { Session } from '../../lib/types'

export function AdminSession() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const q = useQuery(async () => {
    const session = await api.session(id)
    const [attendance, profiles, charges] = await Promise.all([api.attendance([id]), api.profiles(), api.charges({ sessionId: id })])
    return { session, attendance, profiles: profiles.filter(p => p.active), charges }
  }, [id])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null)
    try { await fn(); await q.reload() }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt') }
    finally { setBusy(null) }
  }

  if (q.error) return <Notice>{q.error}</Notice>
  if (!q.data) return null
  const { session, attendance, profiles, charges } = q.data
  const going = new Set(attendance.filter(a => a.going).map(a => a.profile_id))
  const answered = new Set(attendance.map(a => a.profile_id))
  const invoiced = charges.some(c => c.invoice_id)

  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <Link to="/admin" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}>← Alle økter</Link>
      <h1 className="h2">{longDate(session.starts_at)} {time(session.starts_at)}</h1>
      {invoiced && <Notice kind="ok">Andelene fra denne økta står på en regning som er sendt. Oppmøtet er låst.</Notice>}
      {error && <Notice>{error}</Notice>}

      <section className="card stack">
        <div className="row between">
          <h2 className="h3">Oppmøte <span className="muted">{going.size}</span></h2>
          {session.cost > 0 && going.size > 0 && <span className="badge badge-lavender">{kr(Math.ceil(session.cost / going.size / 100) * 100)} hver</span>}
        </div>
        <ul className="list">
          {profiles.map(p => {
            const isGoing = going.has(p.id)
            return (
              <li key={p.id} className="row between">
                <span>{p.name}{!answered.has(p.id) && <span className="caption"> · ikke svart</span>}</span>
                <button type="button" className={`btn btn-sm ${isGoing ? 'btn-forest' : ''}`} disabled={invoiced || busy === p.id}
                  onClick={() => void run(p.id, () => api.setAttendance(id, !isGoing, p.id))}>
                  {isGoing ? (session.status === 'held' ? 'Var med' : 'Kommer') : 'Ikke med'}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <SessionForm session={session} locked={invoiced} onSaved={q.reload} />

      <div className="row">
        {session.status !== 'held' && <button type="button" className="btn btn-forest" onClick={() => void run('status', () => api.setSessionStatus(id, 'held'))}>Merk som gjennomført</button>}
        {session.status !== 'cancelled' && <button type="button" className="btn" disabled={invoiced} onClick={() => void run('status', () => api.setSessionStatus(id, 'cancelled'))}>Avlys</button>}
        {session.status !== 'planned' && <button type="button" className="btn" disabled={invoiced} onClick={() => void run('status', () => api.setSessionStatus(id, 'planned'))}>Tilbake til planlagt</button>}
        <button type="button" className="btn btn-ghost" disabled={invoiced} onClick={() => { if (confirm('Slette økta? Påmeldinger forsvinner.')) void run('delete', async () => { await api.deleteSession(id); nav('/admin') }) }}>Slett</button>
      </div>
    </div>
  )
}

function SessionForm({ session, locked, onSaved }: { session: Session; locked: boolean; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ when: toLocalInput(session.starts_at), duration: String(session.duration_min), location: session.location ?? '', cost: String(session.cost / 100), note: session.note ?? '' })
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null); setState('saving')
    try {
      await api.saveSession({ id: session.id, starts_at: fromLocalInput(f.when), duration_min: Number(f.duration), location: f.location || null, cost: Math.round(Number(f.cost) * 100), note: f.note || null })
      if (session.status === 'held') await api.setSessionStatus(session.id, 'held')  // ny pris → regn om
      await onSaved(); setState('saved')
    } catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt'); setState('idle') }
  }
  return (
    <form className="card stack" onSubmit={submit}>
      <h2 className="h3">Detaljer</h2>
      <div className="grid-2">
        <label className="field"><span className="label">Når</span><input className="input" type="datetime-local" required disabled={locked} value={f.when} onChange={e => { setF({ ...f, when: e.target.value }); setState('idle') }} /></label>
        <label className="field"><span className="label">Varighet (min)</span><input className="input" type="number" min={15} step={15} disabled={locked} value={f.duration} onChange={e => { setF({ ...f, duration: e.target.value }); setState('idle') }} /></label>
        <label className="field"><span className="label">Sted</span><input className="input" value={f.location} onChange={e => { setF({ ...f, location: e.target.value }); setState('idle') }} /></label>
        <label className="field"><span className="label">Hallpris (kr)</span><input className="input" type="number" min={0} disabled={locked} value={f.cost} onChange={e => { setF({ ...f, cost: e.target.value }); setState('idle') }} /></label>
        <label className="field" style={{ gridColumn: '1 / -1' }}><span className="label">Notat til spillerne</span><input className="input" value={f.note} onChange={e => { setF({ ...f, note: e.target.value }); setState('idle') }} /></label>
      </div>
      {error && <Notice>{error}</Notice>}
      {state === 'saved' && <Notice kind="ok">Lagret</Notice>}
      <button className="btn btn-primary" disabled={state === 'saving'}>Lagre</button>
    </form>
  )
}
