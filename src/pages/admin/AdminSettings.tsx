import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { Notice } from '../../components/Notice'
import type { Settings } from '../../lib/types'

export function AdminSettings() {
  const q = useQuery(() => api.settings(), [])
  const [f, setF] = useState<Settings | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (q.data && !f) setF(q.data) }, [q.data, f])

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!f) return
    setState('saving'); setError(null)
    try {
      const { id: _id, ...patch } = f
      await api.saveSettings({ ...patch, vipps_number: patch.vipps_number || null, vipps_display_name: patch.vipps_display_name || null })
      setState('saved')
    } catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt'); setState('idle') }
  }

  if (!f) return null
  const set = (patch: Partial<Settings>) => { setF({ ...f, ...patch }); setState('idle') }

  return (
    <form className="card stack" style={{ maxWidth: 640 }} onSubmit={submit}>
      <h1 className="h2">Innstillinger</h1>
      <label className="field"><span className="label">Navn på gjengen</span><input className="input" value={f.group_name} onChange={e => set({ group_name: e.target.value })} /></label>
      <div className="grid-2">
        <label className="field"><span className="label">Vipps-nummer det skal betales til</span><input className="input" inputMode="tel" value={f.vipps_number ?? ''} onChange={e => set({ vipps_number: e.target.value })} /></label>
        <label className="field"><span className="label">Navn som vises i Vipps</span><input className="input" value={f.vipps_display_name ?? ''} onChange={e => set({ vipps_display_name: e.target.value })} /></label>
        <label className="field"><span className="label">Regn ut økta automatisk, minutter etter slutt</span><input className="input" type="number" min={0} max={1440} step={15} value={f.settle_after_minutes} onChange={e => set({ settle_after_minutes: Number(e.target.value) })} /></label>
        <label className="field"><span className="label">Påmeldingen åpner, dager før økta</span><input className="input" type="number" min={1} max={365} value={f.signup_window_days} onChange={e => set({ signup_window_days: Number(e.target.value) })} /></label>
      </div>
      {error && <Notice>{error}</Notice>}
      <button className={`btn ${state === 'saved' ? 'btn-forest' : 'btn-primary'}`} disabled={state !== 'idle'}>{state === 'saving' ? 'Lagrer…' : state === 'saved' ? 'Lagret' : 'Lagre'}</button>
    </form>
  )
}
