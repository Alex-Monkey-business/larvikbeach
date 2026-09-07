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
      await api.saveSettings({ ...patch, vipps_number: patch.vipps_number || null, vipps_display_name: patch.vipps_display_name || null, admin_email: patch.admin_email || null })
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
        <label className="field"><span className="label">Regning sendes den (dag i måneden)</span><input className="input" type="number" min={1} max={28} value={f.billing_day} onChange={e => set({ billing_day: Number(e.target.value) })} /></label>
        <label className="field"><span className="label">Regn ut økta automatisk, minutter etter slutt</span><input className="input" type="number" min={0} max={1440} step={15} value={f.settle_after_minutes} onChange={e => set({ settle_after_minutes: Number(e.target.value) })} /></label>
        <label className="field"><span className="label">Påmeldingen åpner, dager før økta</span><input className="input" type="number" min={1} max={365} value={f.signup_window_days} onChange={e => set({ signup_window_days: Number(e.target.value) })} /></label>
      </div>
      <label className="check">
        <input type="checkbox" checked={f.email_invoices} onChange={e => set({ email_invoices: e.target.checked })} />
        <span><strong>Send regningen på e-post</strong><br /><span className="caption">Av: regningene lages som før, men ingenting sendes. Da deler du påminnelsen selv fra Betaling.</span></span>
      </label>
      <label className="field"><span className="label">E-post som får samle-oversikten («be om penger»-lista)</span><input className="input" type="email" value={f.admin_email ?? ''} onChange={e => set({ admin_email: e.target.value })} /></label>
      {error && <Notice>{error}</Notice>}
      {state === 'saved' && <Notice kind="ok">Lagret</Notice>}
      <button className="btn btn-primary" disabled={state === 'saving'}>Lagre</button>
    </form>
  )
}
