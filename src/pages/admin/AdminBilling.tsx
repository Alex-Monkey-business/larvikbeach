import { useState } from 'react'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { kr } from '../../lib/money'
import { periodLabel, shortDate } from '../../lib/format'
import { openVipps, prettyPhone } from '../../lib/phone'
import { Notice } from '../../components/Notice'
import { InvoiceBadge } from '../../components/InvoiceBadge'
import { ShareButton } from '../../components/Share'
import type { Invoice, Profile, Settings } from '../../lib/types'

export function AdminBilling() {
  const q = useQuery(async () => {
    const [invoices, profiles, balances, settings] = await Promise.all([api.invoices(), api.profiles(), api.balances(), api.settings()])
    // Gjesteregningene gjelder én økt hver; datoen er det gjesten kjenner dem på.
    const sessions = await api.sessionsById([...new Set(invoices.map(i => i.session_id).filter(Boolean) as string[])])
    return { invoices, profiles, balances, settings, sessions }
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
  const { invoices, profiles, balances, settings, sessions } = q.data
  const name = (id: string) => profiles.find(p => p.id === id)?.name ?? '?'
  const isGuest = (i: Invoice) => i.session_id != null
  // Gjestene kreves inn én og én, med SMS, og hører ikke i medlemslistene.
  const guestOpen = invoices.filter(i => isGuest(i) && (i.status === 'open' || i.status === 'notified'))
  const memberInvoices = invoices.filter(i => !isGuest(i))
  // Månedslistene: medlemmene, pluss gjesteregninger som er gjort opp. En
  // ubetalt gjesteregning står bare i «Gjester», ikke to steder.
  const listed = invoices.filter(i => !guestOpen.includes(i))
  const uninvoiced = balances.reduce((s, b) => s + b.uninvoiced, 0)
  const lastMonth = prevPeriod()
  // Bryteren i innstillingene styrer hele språket her: lover vi e-post eller ikke?
  const sender = settings.email_invoices

  const toCollect = memberInvoices.filter(i => i.status === 'open' || i.status === 'notified')
  const claimed = memberInvoices.filter(i => i.status === 'claimed')
  const periods = [...new Set(listed.map(i => i.period))].sort().reverse()

  return (
    <div className="stack-lg" style={{ maxWidth: 800 }}>
      <h1 className="h2">Betaling</h1>
      {error && <Notice>{error}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}

      {guestOpen.length > 0 && (
        <section className="card stack">
          <h2 className="h3">Gjester <span className="muted">{guestOpen.length}</span></h2>
          <p className="muted">Én økt, én regning. «Vipps» kopierer nummeret og åpner appen: lim inn, skriv beløpet, be om penger.</p>
          <ul className="list">
            {guestOpen.map(i => {
              const p = profiles.find(x => x.id === i.profile_id)
              const s = sessions.find(x => x.id === i.session_id)
              return (
                <li key={i.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 12 }}>
                  <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{p?.name ?? '?'}</span>
                    <span className="row"><span className="muted">{kr(i.amount)}{s ? ` · ${shortDate(s.starts_at)}` : ''}</span><InvoiceBadge status={i.status} /></span>
                    {p?.phone && <span className="caption">{prettyPhone(p.phone)}</span>}
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    {p?.phone && <VippsButton phone={p.phone} amount={i.amount} busy={busy === i.id}
                      onClick={() => void run(i.id, async () => {
                        const copied = await openVipps(p.phone!)
                        if (i.status === 'open') await api.setInvoiceStatus(i.id, 'notified')
                        return copied ? `${prettyPhone(p.phone)} er kopiert. Lim inn i Vipps og be om ${kr(i.amount)}.` : `Be om ${kr(i.amount)} fra ${prettyPhone(p.phone)} i Vipps.`
                      })} />}
                    <button type="button" className="btn btn-sm" disabled={busy === i.id} onClick={() => void run(i.id, () => api.setInvoiceStatus(i.id, 'confirmed'))}>Betalt</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="card stack">
        <h2 className="h3">Månedsregning</h2>
        <p>Ufakturert akkurat nå: <strong>{kr(uninvoiced)}</strong>. Regningene lages automatisk den {q.data.settings.billing_day}. hver måned{sender ? ' og sendes på e-post' : ', og du deler påminnelsen selv'}. Du kan også gjøre det nå.</p>
        <div className="row">
          <button type="button" className="btn btn-primary btn-wrap" disabled={busy !== null}
            onClick={() => void run('send', async () => { const r = await api.sendInvoices({ period: lastMonth }); return `${r.created} regninger laget, ${r.sent} e-poster sendt.` })}>
            {sender ? 'Lag og send' : 'Lag'} regninger for {periodLabel(lastMonth).toLowerCase()}
          </button>
          {sender && (
            <button type="button" className="btn" disabled={busy !== null}
              onClick={() => void run('create', async () => { const n = await api.createInvoices(lastMonth); return `${n} regninger laget, ingen sendt.` })}>
              Bare lag, ikke send
            </button>
          )}
        </div>
      </section>

      {toCollect.length > 0 && (
        <section className="card stack">
          <h2 className="h3">Påminnelse</h2>
          <p className="muted">Del lista i Messenger-gruppa. Regningene merkes som varslet.</p>
          <ShareButton className="btn btn-primary" label="Del påminnelse"
            text={reminderText(toCollect, profiles, settings, window.location.origin)}
            onShared={() => void run('varsle', async () => {
              for (const i of toCollect.filter(x => x.status === 'open')) await api.setInvoiceStatus(i.id, 'notified')
              return `${toCollect.filter(x => x.status === 'open').length} regninger merket som varslet.`
            })} />
        </section>
      )}

      {toCollect.length > 0 && (
        <section className="card card-dark on-dark stack">
          <h2 className="h3">Be om penger i Vipps <span className="muted">{toCollect.length}</span></h2>
          <p className="muted">«Vipps» kopierer nummeret og åpner appen: lim inn, skriv beløpet, be om penger.</p>
          <ul className="list">
            {[...toCollect].sort((a, b) => b.amount - a.amount || name(a.profile_id).localeCompare(name(b.profile_id), 'nb')).map(i => {
              const p = profiles.find(x => x.id === i.profile_id)
              return (
                <li key={i.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 12 }}>
                  <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{p?.name ?? '?'}</span>
                    <span className="row"><span className="muted">{kr(i.amount)}</span><InvoiceBadge status={i.status} /></span>
                    <span className="caption">{p?.phone ? prettyPhone(p.phone) : 'Mangler telefonnummer'}</span>
                  </div>
                  {p?.phone && <VippsButton phone={p.phone} amount={i.amount} busy={busy === i.id}
                    onClick={() => void run(i.id, async () => {
                      const copied = await openVipps(p.phone!)
                      if (i.status === 'open') await api.setInvoiceStatus(i.id, 'notified')
                      return copied ? `${prettyPhone(p.phone)} er kopiert. Lim inn i Vipps og be om ${kr(i.amount)}.` : `Be om ${kr(i.amount)} fra ${prettyPhone(p.phone)} i Vipps.`
                    })} />}
                </li>
              )
            })}
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
        const rows = listed.filter(i => i.period === p)
        return (
          <section key={p} className="card stack">
            <div className="row between">
              <h2 className="h3">{periodLabel(p)}</h2>
              <span className="muted">{kr(rows.reduce((s, i) => s + i.amount, 0))} · {rows.filter(i => i.status === 'confirmed').length}/{rows.length} betalt</span>
            </div>
            {/* Radene er rutenett, ikke flex: ellers hopper knappene ned på egen
                linje for de radene der merket er langt, og lista blir ujevn. */}
            <ul className="list">
              {rows.sort((a, b) => name(a.profile_id).localeCompare(name(b.profile_id))).map(i => (
                <li key={i.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 12 }}>
                  <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{name(i.profile_id)}{isGuest(i) && <span className="caption"> · gjest</span>}</span>
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

/** Meldingen som deles: hvem skylder hva, hvor det vippses, og lenke inn. */
function reminderText(open: Invoice[], profiles: Profile[], settings: Settings, origin: string): string {
  const name = (id: string) => profiles.find(p => p.id === id)?.name ?? '?'
  const perioder = [...new Set(open.map(i => i.period))]
  const rows = open.slice().sort((a, b) => name(a.profile_id).localeCompare(name(b.profile_id)))
    .map(i => `${name(i.profile_id)} ${kr(i.amount)}`)
  const vipps = settings.vipps_number
    ? `Vipps til ${settings.vipps_number}${settings.vipps_display_name ? ` (${settings.vipps_display_name})` : ''}.`
    : 'Vipps som vanlig.'
  return [
    `${settings.group_name}, ${perioder.length === 1 ? periodLabel(perioder[0]).toLowerCase() : 'utestående'}`,
    '',
    ...rows,
    '',
    vipps,
    'Si fra i appen når du har betalt:',
    `${origin}/spill/betaling`,
  ].join('\n')
}

function prevPeriod(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Én knapp for alle krav: nummeret på utklippstavla, Vipps åpnes, regningen merkes som sendt. */
function VippsButton({ busy, onClick }: { phone: string; amount: number; busy: boolean; onClick: () => void }) {
  return <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onClick}>Vipps</button>
}
