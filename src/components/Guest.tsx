import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import type { Attendance, Profile } from '../lib/types'
import { normPhone } from '../lib/phone'
import { Notice } from './Notice'

/**
 * Ta med en gjest. Nummeret først: kjenner appen det igjen, står navnet der
 * alt og gjesten legges til med ett trykk. Er nummeret et medlems, sier
 * skjemaet det i stedet for å lage en dobbeltperson.
 */
export function GuestForm({ sessionId, people, present, onDone }: { sessionId: string; people: Profile[]; present: Set<string>; onDone: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const key = normPhone(phone)
  const known = key ? people.find(p => p.phone_key === key) : undefined
  const member = known && known.role !== 'guest' ? known : undefined
  const guest = known && known.role === 'guest' ? known : undefined
  const complete = !!key && key.length >= 8 && !member && (!!guest || name.trim().length >= 2)
  // Gjester som har vært med før og ikke alt står på økta: ett trykk.
  const previous = people.filter(p => p.role === 'guest' && p.phone && !present.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'))

  function close() { setOpen(false); setPhone(''); setName(''); setError(null) }

  async function pick(g: Profile) {
    setBusy(true); setError(null)
    try { await api.addGuest(sessionId, g.phone!); await onDone(); close() }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
    finally { setBusy(false) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!complete) return
    setBusy(true); setError(null)
    try { await api.addGuest(sessionId, phone, guest ? undefined : name); await onDone(); close() }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
    finally { setBusy(false) }
  }

  if (!open) return <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Ta med en gjest</button>
  return (
    <form className="card stack guest-form" onSubmit={submit}>
      <h2 className="h3">Gjest</h2>
      {previous.length > 0 && (
        <div className="row guest-previous">
          {previous.map(g => (
            <button key={g.id} type="button" className="btn btn-sm" disabled={busy} onClick={() => void pick(g)}>{g.name}</button>
          ))}
        </div>
      )}
      <label className="field">
        <span className="label">{previous.length > 0 ? 'Eller en ny: telefon' : 'Telefon'}</span>
        {/* Tastaturet skal ikke sprette opp over knappene når valget står der. */}
        <input className="input" type="tel" autoComplete="off" inputMode="tel" autoFocus={previous.length === 0} required
          value={phone} onChange={e => setPhone(e.target.value)} />
      </label>
      {member && <p className="muted">{member.name.split(' ')[0]} er medlem og melder seg på selv.</p>}
      {guest && <p className="muted">{guest.name}. Har vært med før.</p>}
      {!known && (
        <label className="field">
          <span className="label">Navn</span>
          <input className="input" autoComplete="off" value={name} onChange={e => setName(e.target.value)} />
        </label>
      )}
      {error && <Notice>{error}</Notice>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy || !complete}>{busy ? 'Lagrer…' : 'Legg til'}</button>
        <button type="button" className="btn btn-ghost" onClick={close}>Avbryt</button>
      </div>
    </form>
  )
}

/** «gjest · med Ola» etter navnet. Verten er den som tok gjesten med. */
export function GuestTag({ att, byId }: { att: Attendance | undefined; byId: Map<string, Profile> }) {
  const host = att?.added_by ? byId.get(att.added_by) : undefined
  return <span className="caption"> · gjest{host ? `, med ${host.name.split(' ')[0]}` : ''}</span>
}
