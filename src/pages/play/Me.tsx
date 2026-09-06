import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { Notice } from '../../components/Notice'

export function Me() {
  const { profile, reloadProfile } = useAuth()
  const [name, setName] = useState(profile?.name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  const year = new Date().getFullYear()
  const stats = useQuery(async () => {
    const sessions = await api.sessions({ from: `${year}-01-01`, to: new Date().toISOString() })
    const held = sessions.filter(s => s.status === 'held')
    const att = await api.attendance(held.map(s => s.id))
    const mine = att.filter(a => a.profile_id === profile?.id && a.going).length
    return { held: held.length, mine }
  }, [profile?.id])

  async function save(e: FormEvent) {
    e.preventDefault()
    setState('saving'); setError(null)
    try { await api.updateMyProfile(name, phone); await reloadProfile(); setState('saved') }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt'); setState('idle') }
  }

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 560 }}>
      <h1 className="h1">{profile?.name}</h1>

      {stats.data && stats.data.held > 0 && (
        <section className="card card-dark on-dark stack">
          <p className="caption">Oppmøte i {year}</p>
          <p className="num">{stats.data.mine} av {stats.data.held}</p>
          <p className="muted">økter du var med på</p>
        </section>
      )}

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
    </div>
  )
}
