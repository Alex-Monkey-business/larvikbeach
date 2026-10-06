import { useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { kr } from '../../lib/money'
import { runLabel, shortDate } from '../../lib/format'
import { openVipps, prettyPhone } from '../../lib/phone'
import { Notice } from '../../components/Notice'
import { InvoiceBadge } from '../../components/InvoiceBadge'
import { ShareButton } from '../../components/Share'
import type { BillingRun, Charge, Invoice, InvoiceStatus, Profile, Session, Settings } from '../../lib/types'
import './AdminBilling.css'

const UBETALT: InvoiceStatus[] = ['open', 'notified', 'claimed']

/** Én person, én rad: alt hen skylder, uansett hvor mange økter eller runder. */
interface Row {
  profile: Profile
  invoices: Invoice[]
  amount: number
  status: InvoiceStatus
  guest: boolean
}

function rowsFrom(invoices: Invoice[], profiles: Profile[]): Row[] {
  const byPerson = new Map<string, Invoice[]>()
  for (const i of invoices) byPerson.set(i.profile_id, [...(byPerson.get(i.profile_id) ?? []), i])
  const rows: Row[] = []
  for (const [id, list] of byPerson) {
    const profile = profiles.find(p => p.id === id)
    if (!profile) continue
    // Verste status vinner: én regning som ikke er sendt gjør hele raden usendt.
    const status: InvoiceStatus = list.some(i => i.status === 'open') ? 'open'
      : list.some(i => i.status === 'notified') ? 'notified'
      : list.some(i => i.status === 'claimed') ? 'claimed'
      : list[0].status
    rows.push({ profile, invoices: list, amount: list.reduce((s, i) => s + i.amount, 0), status, guest: profile.role === 'guest' })
  }
  return rows.sort((a, b) => b.amount - a.amount || a.profile.name.localeCompare(b.profile.name, 'nb'))
}

export function AdminBilling() {
  const q = useQuery(async () => {
    const [invoices, profiles, balances, settings, runs, charges] = await Promise.all([
      api.invoices(), api.profiles(), api.balances(), api.settings(), api.billingRuns(), api.charges(),
    ])
    const ids = [...new Set([
      ...(invoices.map(i => i.session_id).filter(Boolean) as string[]),
      ...charges.map(c => c.session_id),
    ])]
    return { invoices, profiles, balances, settings, runs, charges, sessions: await api.sessionsById(ids) }
  }, [])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [openRun, setOpenRun] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(key); setError(null); setMsg(null)
    try { const m = await fn(); if (typeof m === 'string') setMsg(m); await q.reload(); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'Noe gikk galt'); return false }
    finally { setBusy(null) }
  }

  if (q.error) return <Notice>{q.error}</Notice>
  if (!q.data) return null
  const { invoices, profiles, balances, settings, runs, charges, sessions } = q.data

  const ubetalt = invoices.filter(i => UBETALT.includes(i.status))
  const rows = rowsFrom(ubetalt, profiles)
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const uninvoiced = balances.reduce((s, b) => s + b.uninvoiced, 0)
  // Øktene som venter på et oppgjør: spilt, men ikke med i noen runde.
  const venter = sessions.filter(s => s.status === 'held' && s.run_id == null && s.cost > 0)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const usendte = ubetalt.filter(i => i.status === 'open' && !i.session_id)

  async function closeRun(amount: number | null, note: string) {
    const ok = await run('close', async () => {
      const r = await api.closeBillingRun(amount, note)
      return `Oppgjøret ${runLabel(r.from_date, r.to_date, r.closed_at).toLowerCase()} er lukket.`
    })
    if (ok) setClosing(false)
  }

  return (
    <div className="stack-lg" style={{ maxWidth: 860 }}>
      <h1 className="h2">Betaling</h1>
      {error && <Notice>{error}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}

      <section className="card stack">
        <h2 className="h3">Ikke gjort opp</h2>
        {venter.length === 0
          ? <p className="muted">Alt som er spilt er gjort opp. Neste runde starter med neste økt.</p>
          : <>
              <p className="num" style={{ lineHeight: 1 }}>{kr(uninvoiced)}</p>
              <p>{venter.length} {venter.length === 1 ? 'økt' : 'økter'} siden forrige oppgjør, {shortDate(venter[0].starts_at)}–{shortDate(venter[venter.length - 1].starts_at)}. Lukk runden når fakturaen fra skolen kommer.</p>
              {closing
                ? <CloseForm busy={busy === 'close'} onCancel={() => setClosing(false)} onClose={(a, n) => void closeRun(a, n)} />
                : <div className="row"><button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => setClosing(true)}>Lukk runde og krev inn</button></div>}
            </>}
      </section>

      {rows.length > 0 && (
        <section className="stack">
          <div className="row between">
            <h2 className="h3">Å kreve inn <span className="muted">{kr(total)}</span></h2>
            {usendte.length > 0 && (
              <ShareButton className="btn btn-sm" label="Del påminnelse"
                text={reminderText(rows.filter(r => !r.guest), settings, window.location.origin)}
                onShared={() => void run('varsle', async () => {
                  for (const i of usendte) await api.setInvoiceStatus(i.id, 'notified')
                  return `${usendte.length} regninger merket som varslet.`
                })} />
            )}
          </div>
          <MoneyTable rows={rows} runs={runs} sessions={sessions} charges={charges}
            openRow={openRow} setOpenRow={setOpenRow} busy={busy}
            onVipps={r => void run(r.profile.id, async () => {
              const copied = await openVipps(r.profile.phone!)
              for (const i of r.invoices.filter(x => x.status === 'open')) await api.setInvoiceStatus(i.id, 'notified')
              return copied
                ? `${prettyPhone(r.profile.phone)} er kopiert. Lim inn i Vipps og be om ${kr(r.amount)}.`
                : `Be om ${kr(r.amount)} fra ${prettyPhone(r.profile.phone)} i Vipps.`
            })}
            onStatus={(r, status) => void run(r.profile.id, async () => {
              for (const i of r.invoices) await api.setInvoiceStatus(i.id, status)
            })} />
        </section>
      )}

      {runs.length > 0 && (
        <section className="stack">
          <h2 className="h3">Oppgjør</h2>
          {runs.map(b => (
            <RunCard key={b.id} run={b} invoices={invoices.filter(i => i.run_id === b.id)}
              sessions={sessions.filter(s => s.run_id === b.id)} profiles={profiles}
              open={openRun === b.id} onToggle={() => setOpenRun(openRun === b.id ? null : b.id)}
              busy={busy === b.id}
              onSave={(a, n) => void run(b.id, () => api.updateBillingRun(b.id, a, n))} />
          ))}
        </section>
      )}
    </div>
  )
}

/** Tabellen. Én rad per person, trykk på navnet for å se hva beløpet består av. */
function MoneyTable({ rows, runs, sessions, charges, openRow, setOpenRow, busy, onVipps, onStatus }: {
  rows: Row[]; runs: BillingRun[]; sessions: Session[]; charges: Charge[]
  openRow: string | null; setOpenRow: (id: string | null) => void; busy: string | null
  onVipps: (r: Row) => void; onStatus: (r: Row, s: 'confirmed' | 'notified') => void
}) {
  return (
    <div className="table-wrap">
      <table className="money">
        <thead>
          <tr><th scope="col">Navn</th><th scope="col" className="num-col">Beløp</th><th scope="col" className="status-col">Status</th><th scope="col"><span className="sr-only">Handling</span></th></tr>
        </thead>
        <tbody>
          {rows.flatMap(r => {
            const on = openRow === r.profile.id
            const travel = busy === r.profile.id
            const rad = (
              <tr key={r.profile.id} className={on ? 'is-open' : ''}>
                <th scope="row">
                  <button type="button" className="row-name" aria-expanded={on}
                    onClick={() => setOpenRow(on ? null : r.profile.id)}>
                    {r.profile.name}{r.guest && <span className="caption"> · gjest</span>}
                  </button>
                  <span className="status-inline"><InvoiceBadge status={r.status} /></span>
                </th>
                <td className="num-col num">{kr(r.amount)}</td>
                <td className="status-col"><InvoiceBadge status={r.status} /></td>
                <td className="act-col">
                  <div className="row acts">
                    {r.status === 'claimed'
                      ? <>
                          <button type="button" className="btn btn-forest btn-sm" disabled={travel} onClick={() => onStatus(r, 'confirmed')}>Bekreft</button>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={travel} onClick={() => onStatus(r, 'notified')}>Ikke mottatt</button>
                        </>
                      : <>
                          {r.profile.phone && <button type="button" className="btn btn-primary btn-sm" disabled={travel} onClick={() => onVipps(r)}>Vipps</button>}
                          <button type="button" className="btn btn-sm" disabled={travel} onClick={() => onStatus(r, 'confirmed')}>Betalt</button>
                        </>}
                  </div>
                </td>
              </tr>
            )
            if (!on) return [rad]
            return [rad, (
              <tr key={`${r.profile.id}-detalj`} className="detail">
                <td colSpan={4}>
                  <ul className="list">
                    {r.invoices.map(i => {
                      const b = runs.find(x => x.id === i.run_id)
                      const s = i.session_id ? sessions.find(x => x.id === i.session_id) : undefined
                      const okter = charges.filter(c => c.invoice_id === i.id)
                        .map(c => sessions.find(x => x.id === c.session_id)).filter(Boolean) as Session[]
                      return (
                        <li key={i.id} className="stack" style={{ gap: 4 }}>
                          <span className="row between">
                            <span>{s ? shortDate(s.starts_at) : b ? runLabel(b.from_date, b.to_date, b.closed_at) : 'Uten oppgjør'}</span>
                            <span className="row"><span className="num">{kr(i.amount)}</span><InvoiceBadge status={i.status} /></span>
                          </span>
                          {okter.length > 0 && (
                            <span className="caption">{okter.slice().sort((a, c) => a.starts_at.localeCompare(c.starts_at)).map(x => shortDate(x.starts_at)).join(' · ')}</span>
                          )}
                        </li>
                      )
                    })}
                    <li className="caption">{r.profile.phone ? prettyPhone(r.profile.phone) : 'Mangler telefonnummer'}</li>
                  </ul>
                </td>
              </tr>
            )]
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Skjemaet som lukker runden: beløpet fra skolen, og et notat til deg selv. */
function CloseForm({ busy, onClose, onCancel }: { busy: boolean; onClose: (amount: number | null, note: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const ore = oreFra(amount)
  function submit(e: FormEvent) {
    e.preventDefault()
    if (ore === 'ugyldig') return
    onClose(ore, note)
  }
  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span className="label">Hva tok skolen?</span>
        <input className="input num" inputMode="decimal" autoFocus value={amount}
          onChange={e => setAmount(e.target.value)} placeholder="Kroner. Kan fylles inn senere." />
      </label>
      <label className="field">
        <span className="label">Notat</span>
        <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Fakturanummer, for eksempel" />
      </label>
      <div className="row">
        <button className="btn btn-primary" disabled={busy || ore === 'ugyldig'}>{busy ? 'Lukker…' : 'Lukk runde'}</button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>Avbryt</button>
      </div>
    </form>
  )
}

/** Ett lukket oppgjør: tok skolen det samme som du krever inn? */
function RunCard({ run, invoices, sessions, profiles, open, onToggle, busy, onSave }: {
  run: BillingRun; invoices: Invoice[]; sessions: Session[]; profiles: Profile[]
  open: boolean; onToggle: () => void; busy: boolean; onSave: (amount: number | null, note: string) => void
}) {
  const [edit, setEdit] = useState(false)
  const [amount, setAmount] = useState(run.school_amount == null ? '' : (run.school_amount / 100).toString())
  const [note, setNote] = useState(run.note ?? '')
  const krevd = invoices.reduce((s, i) => s + i.amount, 0)
  const priset = sessions.reduce((s, x) => s + x.cost, 0)
  const betalt = invoices.filter(i => i.status === 'confirmed' || i.status === 'waived').length
  const avvik = run.school_amount == null ? null : krevd - run.school_amount
  const name = (id: string) => profiles.find(p => p.id === id)?.name ?? '?'
  const ore = oreFra(amount)

  return (
    <div className="card stack">
      <button type="button" className="row between run-head" aria-expanded={open} onClick={onToggle}>
        <span className="stack" style={{ gap: 4, textAlign: 'left' }}>
          <span className="h3">{runLabel(run.from_date, run.to_date, run.closed_at)}</span>
          <span className="caption">{sessions.length} økter · {betalt} av {invoices.length} betalt{run.note ? ` · ${run.note}` : ''}</span>
        </span>
        <span className="num" style={{ fontSize: 24 }}>{kr(krevd)}</span>
      </button>

      {open && (
        <>
          <dl className="run-sums">
            <div><dt className="caption">Skolen tok</dt><dd className="num">{run.school_amount == null ? '–' : kr(run.school_amount)}</dd></div>
            <div><dt className="caption">Øktene er priset til</dt><dd className="num">{kr(priset)}</dd></div>
            <div><dt className="caption">Krevd inn</dt><dd className="num">{kr(krevd)}</dd></div>
          </dl>
          {avvik !== null && avvik !== 0 && (
            <p className="caption">{avvik > 0
              ? `${kr(avvik)} mer enn skolen tok. Andelene rundes opp til hel krone, så litt over er normalt.`
              : `${kr(-avvik)} mindre enn skolen tok. Sjekk prisen på øktene i runden.`}</p>
          )}
          {edit
            ? <form className="stack" onSubmit={e => { e.preventDefault(); if (ore === 'ugyldig') return; onSave(ore, note); setEdit(false) }}>
                <label className="field"><span className="label">Hva tok skolen?</span>
                  <input className="input num" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Kroner" /></label>
                <label className="field"><span className="label">Notat</span>
                  <input className="input" value={note} onChange={e => setNote(e.target.value)} /></label>
                <div className="row">
                  <button className="btn btn-primary btn-sm" disabled={busy || ore === 'ugyldig'}>Lagre</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(false)}>Avbryt</button>
                </div>
              </form>
            : <div className="row"><button type="button" className="btn btn-sm" onClick={() => setEdit(true)}>{run.school_amount == null ? 'Legg inn beløpet fra skolen' : 'Rett beløpet'}</button></div>}

          <div className="table-wrap">
            <table className="money">
              <tbody>
                {invoices.slice().sort((a, b) => name(a.profile_id).localeCompare(name(b.profile_id), 'nb')).map(i => (
                  <tr key={i.id}>
                    <th scope="row">{name(i.profile_id)}{i.session_id && <span className="caption"> · gjest</span>}</th>
                    <td className="num-col num">{kr(i.amount)}</td>
                    <td className="act-col"><InvoiceBadge status={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

/** Kroner inn, øre ut. Tomt felt er lov: beløpet kan komme senere. */
function oreFra(s: string): number | null | 'ugyldig' {
  if (s.trim() === '') return null
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return 'ugyldig'
  return Math.round(n * 100)
}

/** Meldingen som deles: hvem skylder hva, hvor det vippses, og lenke inn. */
function reminderText(rows: Row[], settings: Settings, origin: string): string {
  const vipps = settings.vipps_number
    ? `Vipps til ${settings.vipps_number}${settings.vipps_display_name ? ` (${settings.vipps_display_name})` : ''}.`
    : 'Vipps som vanlig.'
  return [
    `${settings.group_name}, utestående`,
    '',
    ...rows.slice().sort((a, b) => a.profile.name.localeCompare(b.profile.name, 'nb')).map(r => `${r.profile.name} ${kr(r.amount)}`),
    '',
    vipps,
    'Si fra i appen når du har betalt:',
    `${origin}/spill/betaling`,
  ].join('\n')
}
