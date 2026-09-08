import { useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { Notice } from '../../components/Notice'

export function Join() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setState('sending')
    try {
      await api.submitJoinRequest(form)
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt')
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 560 }}>
        <h1 className="h1">Takk.</h1>
        <p className="lede">Vi tar kontakt på {form.email} når vi har sett på det. Når du er inne, logger du inn med samme e-post.</p>
      </div>
    )
  }

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 560 }}>
      <h1 className="h1">Bli med</h1>
      <p className="lede">Fortell litt om deg, så svarer vi.</p>
      <form className="card stack" onSubmit={submit}>
        <label className="field">
          <span className="label">Navn</span>
          <input className="input" required autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">E-post</span>
          <input className="input" type="email" required autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">Telefon (valgfritt)</span>
          <input className="input" type="tel" autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">Har du spilt før? Kjenner du noen av oss?</span>
          <textarea className="textarea" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
        </label>
        {error && <Notice>{error}</Notice>}
        <button className="btn btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Sender…' : 'Send forespørsel'}</button>
      </form>
    </div>
  )
}
