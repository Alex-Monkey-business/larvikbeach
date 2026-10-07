import { PageState } from '../../components/PageState'
import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { kr } from '../../lib/money'
import { compactDate, periodLabel, runLabel } from '../../lib/format'
import { Notice } from '../../components/Notice'
import type { BillingRun, Charge, Invoice, InvoiceStatus, Session } from '../../lib/types'
import '../admin/AdminBilling.css'

const STATE: Record<InvoiceStatus, string> = {
  open: 'Å betale', notified: 'Å betale', claimed: 'Meldt betalt', confirmed: 'Betalt', waived: 'Frafalt',
}

/** Én regning med øktene den består av, eller øktene som ikke er krevd inn ennå. */
interface Group {
  key: string
  label: string
  state: string
  amount: number
  lines: { charge: Charge; session: Session | undefined }[]
}

export function Billing() {
  const { profile } = useAuth()
  const q = useQuery(async () => {
    const [invoices, balance, settings, runs, charges] = await Promise.all([
      api.invoices({ profileId: profile!.id }), api.myBalance(profile!.id), api.settings(),
      api.billingRuns(), api.charges({ profileId: profile!.id }),
    ])
    return { invoices, balance, settings, runs, charges, sessions: await api.sessionsById([...new Set(charges.map(c => c.session_id))]) }
  }, [profile?.id])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!q.data) return <PageState title="Betaling" loading={q.loading} error={q.error} onRetry={() => void q.reload()} />
  const { invoices, balance, settings, runs, charges, sessions } = q.data

  const aBetale = invoices.filter(i => i.status === 'open' || i.status === 'notified')
  const toPay = balance.invoiced_open
  const meldt = balance.claimed
  const neste = balance.uninvoiced

  async function claimAll() {
    setBusy(true); setError(null)
    try { for (const i of aBetale) await api.claimInvoice(i.id); await q.reload() }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt') }
    finally { setBusy(false) }
  }

  const groups = groupsFrom(invoices, charges, sessions, runs)
  const spilt = charges.length
  const totalt = charges.reduce((s, c) => s + c.amount, 0)

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 640 }}>
      <h1 className="h1">Betaling</h1>

      {toPay > 0
        ? <section className="card card-lavender stack">
            <p className="caption ink">Å betale</p>
            <p className="num">{kr(toPay)}</p>
            {settings.vipps_number && (
              <p>Vipps til <strong>{settings.vipps_number}</strong>{settings.vipps_display_name ? ` (${settings.vipps_display_name})` : ''}.</p>
            )}
            <div className="row">
              <button type="button" className="btn btn-dark" disabled={busy} onClick={() => void claimAll()}>{busy ? 'Lagrer…' : 'Jeg har vippset'}</button>
            </div>
          </section>
        : <section className="card stack">
            <p className="caption">{meldt > 0 ? 'Meldt betalt' : 'Å betale'}</p>
            <p className="num">{kr(meldt)}</p>
            <p className="muted">{meldt > 0 ? 'Venter på at admin bekrefter.' : 'Du skylder ingenting nå.'}</p>
          </section>}

      {error && <Notice>{error}</Notice>}
      {toPay > 0 && meldt > 0 && <p className="muted">{kr(meldt)} er meldt betalt og venter på bekreftelse.</p>}

      {groups.length > 0 && (
        <section className="stack">
          <div className="stack" style={{ gap: 4 }}>
            <h2 className="h3">Øktene dine</h2>
            <p className="caption">{spilt} {spilt === 1 ? 'økt' : 'økter'}, {kr(totalt)} til sammen.{neste > 0 ? ` ${kr(neste)} er ikke krevd inn ennå.` : ''}</p>
          </div>
          {groups.map(g => (
            <div key={g.key} className="card stack" style={{ gap: 'var(--space-2)' }}>
              <div className="row between" style={{ alignItems: 'baseline' }}>
                <div>
                  <p style={{ fontWeight: 500 }}>{g.label}</p>
                  <p className="caption">{g.state}</p>
                </div>
                <span className="pay-amount">{kr(g.amount)}</span>
              </div>
              {g.lines.length > 0 && (
                <ul className="pay-lines">
                  {g.lines.map(({ charge, session }) => (
                    <li key={charge.id}>
                      <span>{session ? compactDate(session.starts_at) : 'Økt'}</span>
                      <span className="muted">{session && session.cost !== charge.amount ? `hallen ${kr(session.cost)}` : ''}</span>
                      <span className="tab">{kr(charge.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {groups.length === 0 && <p className="muted">Ingen økter spilt ennå.</p>}
    </div>
  )
}

/** Nyeste først: det som ikke er krevd inn, så regningene bakover. */
function groupsFrom(invoices: Invoice[], charges: Charge[], sessions: Session[], runs: BillingRun[]): Group[] {
  const lines = (list: Charge[]) => list
    .map(charge => ({ charge, session: sessions.find(s => s.id === charge.session_id) }))
    .sort((a, b) => (b.session?.starts_at ?? '').localeCompare(a.session?.starts_at ?? ''))
  const groups: Group[] = []
  const ikkeKrevd = charges.filter(c => c.invoice_id == null)
  if (ikkeKrevd.length > 0) {
    groups.push({ key: 'neste', label: 'Neste regning', state: 'Ikke krevd inn ennå', amount: ikkeKrevd.reduce((s, c) => s + c.amount, 0), lines: lines(ikkeKrevd) })
  }
  for (const i of invoices.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const b = runs.find(x => x.id === i.run_id)
    groups.push({
      key: i.id,
      label: b ? runLabel(b.from_date, b.to_date, b.closed_at) : periodLabel(i.period),
      state: STATE[i.status],
      amount: i.amount,
      lines: lines(charges.filter(c => c.invoice_id === i.id)),
    })
  }
  return groups
}
