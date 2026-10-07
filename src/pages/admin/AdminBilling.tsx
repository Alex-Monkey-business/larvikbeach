import { useState } from 'react'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { kr } from '../../lib/money'
import { compactDate, shortDate } from '../../lib/format'
import { openVipps, prettyPhone } from '../../lib/phone'
import { Notice } from '../../components/Notice'
import { ShareButton } from '../../components/Share'
import type { Balance, Charge, Invoice, InvoiceStatus, Profile, Session, Settings } from '../../lib/types'
import './AdminBilling.css'

const UBETALT: InvoiceStatus[] = ['open', 'notified', 'claimed']

/**
 * Én person, én saldo: alt som er spilt og ikke betalt. «Betalt» nuller den,
 * og den teller fra null igjen ved neste økt.
 */
interface Row {
  profile: Profile
  owed: number
  claimed: boolean
  lastPaid: string | null
  invoices: Invoice[]
  lines: { key: string; session: Session | undefined; amount: number }[]
  guest: boolean
}

function rowsFrom(profiles: Profile[], balances: Balance[], invoices: Invoice[], charges: Charge[], sessions: Session[]): Row[] {
  const rows: Row[] = []
  for (const profile of profiles) {
    const b = balances.find(x => x.profile_id === profile.id)
    const mine = invoices.filter(i => i.profile_id === profile.id)
    const owed = b ? b.invoiced_open + b.claimed + b.uninvoiced : 0
    const guest = profile.role === 'guest'
    // Med: alle som skylder, og medlemmer som har betalt noe en gang.
    if (owed === 0 && (guest || mine.length === 0)) continue
    const unpaid = new Set(mine.filter(i => UBETALT.includes(i.status)).map(i => i.id))
    const lines = charges
      .filter(c => c.profile_id === profile.id && (c.invoice_id == null || unpaid.has(c.invoice_id)))
      .map(c => ({ key: c.id, session: sessions.find(s => s.id === c.session_id), amount: c.amount }))
      .sort((x, y) => (y.session?.starts_at ?? '').localeCompare(x.session?.starts_at ?? ''))
    const paidAt = mine.map(i => i.confirmed_at).filter(Boolean) as string[]
    rows.push({
      profile, owed, guest, invoices: mine, lines,
      claimed: (b?.claimed ?? 0) > 0,
      lastPaid: paidAt.sort().at(-1) ?? null,
    })
  }
  // De som sier de har vippset først: der venter du. Så største beløp.
  return rows.sort((a, b) => Number(b.claimed) - Number(a.claimed) || b.owed - a.owed || a.profile.name.localeCompare(b.profile.name, 'nb'))
}

export function AdminBilling() {
  const q = useQuery(async () => {
    const [invoices, profiles, balances, settings, charges] = await Promise.all([
      api.invoices(), api.profiles(), api.balances(), api.settings(), api.charges(),
    ])
    return { invoices, profiles, balances, settings, charges, sessions: await api.sessionsById([...new Set(charges.map(c => c.session_id))]) }
  }, [])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [openRow, setOpenRow] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null); setMsg(null)
    try { const m = await fn(); if (typeof m === 'string') setMsg(m); await q.reload() }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt') }
    finally { setBusy(null) }
  }

  if (q.error) return <Notice>{q.error}</Notice>
  if (!q.data) return null
  const { invoices, profiles, balances, settings, charges, sessions } = q.data

  const rows = rowsFrom(profiles, balances, invoices, charges, sessions)
  const skylder = rows.filter(r => r.owed > 0)
  const total = skylder.reduce((s, r) => s + r.owed, 0)
  const meldt = skylder.filter(r => r.claimed).length

  return (
    <div className="stack-lg" style={{ maxWidth: 640 }}>
      <h1 className="h2">Betaling</h1>
      {error && <Notice>{error}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}

      <section className={`card stack ${total > 0 ? 'card-lavender' : ''}`}>
        <p className="caption ink">{total > 0 ? 'Ikke betalt' : 'Alt er betalt'}</p>
        <p className="num" style={{ lineHeight: 1 }}>{kr(total)}</p>
        {total > 0 && (
          <p>{skylder.length} {skylder.length === 1 ? 'person skylder' : 'personer skylder'}{meldt > 0 ? `. ${meldt} sier ${meldt === 1 ? 'hen' : 'de'} har vippset, bekreft når du ser pengene.` : '.'}</p>
        )}
        {skylder.some(r => !r.guest) && (
          <div className="row">
            <ShareButton className="btn" label="Del påminnelse"
              text={reminderText(skylder.filter(r => !r.guest), settings, window.location.origin)} />
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <ul className="pay-list">
          {rows.map(r => (
            <PersonRow key={r.profile.id} row={r}
              open={openRow === r.profile.id} onToggle={() => setOpenRow(openRow === r.profile.id ? null : r.profile.id)}
              busy={busy === r.profile.id}
              onPaid={() => void run(r.profile.id, () => api.markPaid(r.profile.id))}
              onVipps={() => void run(r.profile.id, async () => {
                const copied = await openVipps(r.profile.phone!)
                return copied
                  ? `${prettyPhone(r.profile.phone)} er kopiert. Lim inn i Vipps og be om ${kr(r.owed)}.`
                  : `Be om ${kr(r.owed)} fra ${prettyPhone(r.profile.phone)} i Vipps.`
              })}
              onNotReceived={() => void run(r.profile.id, async () => {
                for (const i of r.invoices.filter(x => x.status === 'claimed')) await api.setInvoiceStatus(i.id, 'notified')
              })}
              onUndo={() => void run(r.profile.id, async () => {
                for (const i of r.invoices.filter(x => x.confirmed_at === r.lastPaid)) await api.setInvoiceStatus(i.id, 'notified')
              })} />
          ))}
        </ul>
      )}
      {rows.length === 0 && <p className="muted">Ingen har spilt ennå.</p>}
    </div>
  )
}

/**
 * Én person. Navn og tilstand til venstre, saldo og den ene handlingen til
 * høyre. Trykk på navnet for øktene saldoen består av, og de sjeldne valgene.
 */
function PersonRow({ row: r, open, onToggle, busy, onPaid, onVipps, onNotReceived, onUndo }: {
  row: Row; open: boolean; onToggle: () => void; busy: boolean
  onPaid: () => void; onVipps: () => void; onNotReceived: () => void; onUndo: () => void
}) {
  const done = r.owed === 0
  const tilstand = done
    ? (r.lastPaid ? `Betalt ${shortDate(r.lastPaid)}` : 'Betalt')
    : r.claimed ? 'Sier hen har vippset' : 'Ikke betalt'

  return (
    <li className={`pay-row${done ? ' is-done' : ''}${open ? ' is-open' : ''}`}>
      <div className="pay-main">
        <button type="button" className="pay-who" aria-expanded={open} onClick={onToggle}>
          <span className="pay-name">{r.profile.name}{r.guest && <span className="caption"> · gjest</span>}</span>
          <span className={`pay-state${r.claimed && !done ? ' is-claimed' : ''}`}>{tilstand}</span>
        </button>
        <span className="pay-amount">{done ? '' : kr(r.owed)}</span>
        <span className="pay-act">
          {done
            ? <span className="pay-check" aria-hidden="true" />
            : <button type="button" className={`btn btn-sm${r.claimed ? ' btn-forest' : ''}`} disabled={busy} onClick={onPaid}>{r.claimed ? 'Bekreft' : 'Betalt'}</button>}
        </span>
      </div>

      {open && (
        <div className="pay-detail stack">
          {r.lines.length > 0 && (
            <ul className="pay-lines">
              {r.lines.map(l => (
                <li key={l.key}>
                  <span>{l.session ? compactDate(l.session.starts_at) : 'Økt'}</span>
                  <span />
                  <span className="tab">{kr(l.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="caption">{r.profile.phone ? prettyPhone(r.profile.phone) : 'Mangler telefonnummer'}</p>
          <div className="row">
            {!done && r.profile.phone && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onVipps}>Be om {kr(r.owed)} i Vipps</button>}
            {r.claimed && !done && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onNotReceived}>Ikke mottatt</button>}
            {r.lastPaid && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onUndo}>Angre siste betaling</button>}
          </div>
        </div>
      )}
    </li>
  )
}

/** Meldingen som deles: hvem skylder hva, hvor det vippses, og lenke inn. */
function reminderText(rows: Row[], settings: Settings, origin: string): string {
  const vipps = settings.vipps_number
    ? `Vipps til ${settings.vipps_number}${settings.vipps_display_name ? ` (${settings.vipps_display_name})` : ''}.`
    : 'Vipps som vanlig.'
  return [
    `${settings.group_name}, ikke betalt`,
    '',
    ...rows.slice().sort((a, b) => a.profile.name.localeCompare(b.profile.name, 'nb')).map(r => `${r.profile.name} ${kr(r.owed)}`),
    '',
    vipps,
    'Si fra i appen når du har betalt:',
    `${origin}/spill/betaling`,
  ].join('\n')
}
