import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { Notice } from '../../components/Notice'

export function Me() {
  const { profile, reloadProfile } = useAuth()
  const [name, setName] = useState(profile?.name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setState('saving'); setError(null)
    try { await api.updateMyProfile(name, phone); await reloadProfile(); setState('saved') }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt'); setState('idle') }
  }

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 560 }}>
      <h1 className="h1">{profile?.name}</h1>

      <form className="card stack" onSubmit={save}>
        <label className="field"><span className="label">Navn</span>
          <input className="input" value={name} onChange={e => { setName(e.target.value); setState('idle') }} required /></label>
        <label className="field"><span className="label">Telefon</span>
          <input className="input" type="tel" value={phone} onChange={e => { setPhone(e.target.value); setState('idle') }} /></label>
        <p className="caption">E-post: {profile?.email}. Den er innloggingen din og endres av admin.</p>
        {error && <Notice>{error}</Notice>}
        {state === 'saved' && <Notice kind="ok">Lagret</Notice>}
        <button className="btn btn-primary" disabled={state === 'saving'}>Lagre</button>
      </form>

      <p className="caption">
        <a href="https://alexmonkeybusiness.com" target="_blank" rel="noreferrer">Laget av alexmonkeybusiness.com</a>
        {' · '}
        <Link to="/personvern">Personvern</Link>
      </p>
    </div>
  )
}
