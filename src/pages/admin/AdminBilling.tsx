import { useState } from 'react'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { kr } from '../../lib/money'
import { periodLabel } from '../../lib/format'
import { Notice } from '../../components/Notice'
import { InvoiceBadge } from '../../components/InvoiceBadge'
import type { Invoice, Profile } from '../../lib/types'

export function AdminBilling() {
  const q = useQuery(async () => {
    const [invoices, profiles, balances, settings] = await Promise.all([api.invoices(), api.profiles(), api.balances(), api.settings()])
    return { invoices, profiles, balances, settings }
  }, [])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null); setMsg(null)
    try { const m = await fn(); if (typeof m === 'string') setMsg(m); await q.reload() }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt') }
    finally { setBusy(null) }
  }

  if (q.error) return <Notice>{q.error}</Notice>
  if (!q.data) return null
  const { invoices, profiles, balances } = q.data
  const name = (id: string) => profiles.find(p => p.id === id)?.name ?? '?'
  const uninvoiced = balances.reduce((s, b) => s + b.uninvoiced, 0)
  const lastMonth = prevPeriod()

  const toCollect = invoices.filter(i => i.status === 'open' || i.status === 'notified')
  const claimed = invoices.filter(i => i.status === 'claimed')
  const byAmount = groupByAmount(toCollect, profiles)
  const periods = [...new Set(invoices.map(i => i.period))].sort().reverse()

  return (
    <div className="stack-lg" style={{ maxWidth: 800 }}>
      <h1 className="h2">Betaling</h1>
      {error && <Notice>{error}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}

      <section className="card stack">
        <h2 className="h3">Månedsregning</h2>
        <p>Ufakturert akkurat nå: <strong>{kr(uninvoiced)}</strong>. Regningene lages og sendes automatisk den {q.data.settings.billing_day}. hver måned. Du kan også gjøre det nå.</p>
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={busy !== null}
            onClick={() => void run('send', async () => { const r = await api.sendInvoices({ period: lastMonth }); return `${r.created} regninger laget, ${r.sent} e-poster sendt.` })}>
            Lag og send regninger for {periodLabel(lastMonth)}
          </button>
          <button type="button" className="btn" disabled={busy !== null}
            onClick={() => void run('create', async () => { const n = await api.createInvoices(lastMonth); return `${n} regninger laget, ingen sendt.` })}>
            Bare lag, ikke send
          </button>
        </div>
      </section>

      {byAmount.length > 0 && (
        <section className="card card-dark on-dark stack">
          <h2 className="h3">Be om penger i Vipps</h2>
          <p className="muted">Vipps tar samme beløp til flere på én gang. Én runde per beløp:</p>
          <ul className="list">
            {byAmount.map(g => (
              <li key={g.amount} className="stack" style={{ gap: 4 }}>
                <p className="h3">{kr(g.amount)}</p>
                <p>{g.names.join(', ')}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {claimed.length > 0 && (
        <section className="stack">
          <h2 className="h3">Meldt betalt, venter på deg <span className="muted">{claimed.length}</span></h2>
          {claimed.map(i => (
            <div key={i.id} className="card row between">
              <div><p style={{ fontWeight: 500 }}>{name(i.profile_id)}</p><p className="caption">{periodLabel(i.period)} · {kr(i.amount)}</p></div>
              <div className="row">
                <button type="button" className="btn btn-forest btn-sm" disabled={busy === i.id} onClick={() => void run(i.id, () => api.setInvoiceStatus(i.id, 'confirmed'))}>Bekreft</button>
                <button type="button" className="btn btn-sm" disabled={busy === i.id} onClick={() => void run(i.id, () => api.setInvoiceStatus(i.id, 'notified'))}>Ikke mottatt</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {periods.map(p => {
        const rows = invoices.filter(i => i.period === p)
        return (
          <section key={p} className="card stack">
            <div className="row between">
              <h2 className="h3">{periodLabel(p)}</h2>
              <span className="muted">{kr(rows.reduce((s, i) => s + i.amount, 0))} · {rows.filter(i => i.status === 'confirmed').length}/{rows.length} betalt</span>
            </div>
            <ul className="list">
              {rows.sort((a, b) => name(a.profile_id).localeCompare(name(b.profile_id))).map(i => (
                <li key={i.id} className="row between">
                  <div className="stack" style={{ gap: 4 }}>
                    <span style={{ fontWeight: 500 }}>{name(i.profile_id)}</span>
                    <span className="row"><span className="muted">{kr(i.amount)}</span><InvoiceBadge status={i.status} /></span>
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    {i.status !== 'confirmed' && i.status !== 'waived' ? (
                      <>
                        <button type="button" className="btn btn-sm" disabled={busy === i.id} onClick={() => void run(i.id, () => api.setInvoiceStatus(i.id, 'confirmed'))}>Betalt</button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy === i.id} onClick={() => void run(i.id, () => api.setInvoiceStatus(i.id, 'waived'))}>Frafall</button>
                      </>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy === i.id} onClick={() => void run(i.id, () => api.setInvoiceStatus(i.id, 'notified'))}>Angre</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function prevPeriod(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function groupByAmount(invoices: Invoice[], profiles: Profile[]) {
  const m = new Map<number, string[]>()
  for (const i of invoices) {
    const n = profiles.find(p => p.id === i.profile_id)?.name ?? '?'
    m.set(i.amount, [...(m.get(i.amount) ?? []), n])
  }
  return [...m.entries()].map(([amount, names]) => ({ amount, names: names.sort() })).sort((a, b) => b.amount - a.amount)
}
