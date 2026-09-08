import { PageState } from '../../components/PageState'
import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { kr } from '../../lib/money'
import { periodLabel } from '../../lib/format'
import { Notice } from '../../components/Notice'
import { InvoiceBadge } from '../../components/InvoiceBadge'

export function Billing() {
  const { profile } = useAuth()
  const inv = useQuery(() => api.invoices({ profileId: profile!.id }), [profile?.id])
  const bal = useQuery(() => api.myBalance(profile!.id), [profile?.id])
  const settings = useQuery(() => api.settings(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function claim(id: string) {
    setBusy(id); setError(null)
    try { await api.claimInvoice(id); await inv.reload(); await bal.reload() }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt') }
    finally { setBusy(null) }
  }

  const open = (inv.data ?? []).filter(i => i.status === 'open' || i.status === 'notified')
  const rest = (inv.data ?? []).filter(i => !(i.status === 'open' || i.status === 'notified'))
  const faktura = bal.data?.invoiced_open ?? 0     // regning sendt, betal nå
  const palopt = bal.data?.uninvoiced ?? 0          // økter spilt, ikke fakturert ennå
  const meldt = bal.data?.claimed ?? 0              // meldt betalt, venter på admin
  const owed = faktura + palopt

  if (!bal.data || !inv.data || !settings.data) return <PageState title="Betaling"
    loading={bal.loading || inv.loading || settings.loading} error={bal.error || inv.error || settings.error}
    onRetry={() => { void bal.reload(); void inv.reload(); void settings.reload() }} />

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 720 }}>
      <h1 className="h1">Betaling</h1>

      <section className={`card stack ${owed > 0 ? 'card-lavender' : ''}`}>
        <p className="caption" style={{ color: owed > 0 ? 'var(--color-ink)' : undefined }}>{owed > 0 ? 'Du skylder' : 'Utestående'}</p>
        <p className="num">{kr(owed)}</p>
        {faktura > 0 && settings.data?.vipps_number && (
          <p>Vipps <strong>{kr(faktura)}</strong> til <strong>{settings.data.vipps_number}</strong>{settings.data.vipps_display_name ? ` (${settings.data.vipps_display_name})` : ''}, og trykk «Jeg har vippset» under.</p>
        )}
        {palopt > 0 && (
          <p style={{ color: owed > 0 ? 'var(--color-ink)' : undefined }}>
            {faktura > 0 ? `Av dette er ${kr(palopt)} økter du har spilt siden forrige regning.` : `${kr(palopt)} for økter du har spilt.`} Det kommer på regningen den {settings.data?.billing_day ?? 1}.
          </p>
        )}
        {meldt > 0 && <p className="muted">{kr(meldt)} er meldt betalt og venter på bekreftelse.</p>}
      </section>

      {error && <Notice>{error}</Notice>}

      {open.length > 0 && (
        <section className="stack">
          <h2 className="h3">Å betale</h2>
          {open.map(i => (
            <div key={i.id} className="card row between">
              <div>
                <p style={{ fontWeight: 500 }}>{periodLabel(i.period)}</p>
                <p className="muted">{kr(i.amount)}</p>
              </div>
              <button type="button" className="btn btn-primary" disabled={busy === i.id} onClick={() => void claim(i.id)}>{busy === i.id ? 'Lagrer…' : 'Jeg har vippset'}</button>
            </div>
          ))}
        </section>
      )}

      {inv.data && (rest.length > 0 || inv.data.length === 0) && <section className="stack">
        <h2 className="h3">Historikk</h2>
        {inv.data.length === 0 && <p className="muted">Ingen regninger ennå.</p>}
        <ul className="list">
          {rest.map(i => (
            <li key={i.id} className="row between">
              <span>{periodLabel(i.period)}</span>
              <span className="row"><span>{kr(i.amount)}</span><InvoiceBadge status={i.status} /></span>
            </li>
          ))}
        </ul>
      </section>}
    </div>
  )
}
