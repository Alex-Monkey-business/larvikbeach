import { PageState } from '../../components/PageState'
import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { kr } from '../../lib/money'
import { compactDate } from '../../lib/format'
import { Notice } from '../../components/Notice'
import type { InvoiceStatus } from '../../lib/types'
import '../admin/AdminBilling.css'

const STATE: Record<InvoiceStatus | 'none', string> = {
  // Ubetalt er det vanlige og trenger ingen merkelapp.
  none: '', open: '', notified: '', claimed: 'meldt betalt', confirmed: 'betalt', waived: 'frafalt',
}

export function Billing() {
  const { profile } = useAuth()
  const q = useQuery(async () => {
    const [invoices, balance, settings, charges] = await Promise.all([
      api.invoices({ profileId: profile!.id }), api.myBalance(profile!.id), api.settings(), api.charges({ profileId: profile!.id }),
    ])
    return { invoices, balance, settings, charges, sessions: await api.sessionsById([...new Set(charges.map(c => c.session_id))]) }
  }, [profile?.id])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!q.data) return <PageState title="Betaling" loading={q.loading} error={q.error} onRetry={() => void q.reload()} />
  const { invoices, balance, settings, charges, sessions } = q.data

  // Saldoen: alt som er spilt og ikke betalt. Det som er meldt betalt står for seg.
  const owed = balance.invoiced_open + balance.uninvoiced
  const meldt = balance.claimed

  async function claim() {
    setBusy(true); setError(null)
    try { await api.claimBalance(); await q.reload() }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt') }
    finally { setBusy(false) }
  }

  const lines = charges
    .map(c => ({
      charge: c,
      session: sessions.find(s => s.id === c.session_id),
      status: (invoices.find(i => i.id === c.invoice_id)?.status ?? 'none') as InvoiceStatus | 'none',
    }))
    .sort((a, b) => (b.session?.starts_at ?? '').localeCompare(a.session?.starts_at ?? ''))
  const totalt = charges.reduce((s, c) => s + c.amount, 0)

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 640 }}>
      <h1 className="h1">Betaling</h1>

      {owed > 0
        ? <section className="card card-lavender stack">
            <p className="caption ink">Du skylder</p>
            <p className="num">{kr(owed)}</p>
            {settings.vipps_number && (
              <p>Vipps til <strong>{settings.vipps_number}</strong>{settings.vipps_display_name ? ` (${settings.vipps_display_name})` : ''}.</p>
            )}
            <div className="row">
              <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void claim()}>{busy ? 'Lagrer…' : 'Jeg har vippset'}</button>
            </div>
            {meldt > 0 && <p className="ink">{kr(meldt)} er meldt betalt og venter på bekreftelse.</p>}
          </section>
        : <section className="card stack">
            <p className="caption">{meldt > 0 ? 'Meldt betalt' : 'Du skylder'}</p>
            <p className="num">{kr(meldt)}</p>
            <p className="muted">{meldt > 0 ? 'Venter på at admin bekrefter.' : 'Du skylder ingenting nå.'}</p>
          </section>}

      {error && <Notice>{error}</Notice>}

      {lines.length > 0
        ? <section className="stack">
            <div>
              <h2 className="h3">Øktene dine</h2>
              <p className="caption">{lines.length} {lines.length === 1 ? 'økt' : 'økter'}, {kr(totalt)} til sammen.</p>
            </div>
            <ul className="pay-lines">
              {lines.map(({ charge, session, status }) => (
                <li key={charge.id} className={status === 'confirmed' || status === 'waived' ? 'is-paid' : ''}>
                  <span>
                    {session ? compactDate(session.starts_at) : 'Økt'}
                    {session && <span className="caption"> · hallen {kr(session.cost)}</span>}
                  </span>
                  <span className="muted">{STATE[status]}</span>
                  <span className="tab">{kr(charge.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        : <p className="muted">Ingen økter spilt ennå.</p>}
    </div>
  )
}
