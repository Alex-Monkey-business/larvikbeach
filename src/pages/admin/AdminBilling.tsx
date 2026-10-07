import { useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { useQuery } from '../../lib/useQuery'
import { kr } from '../../lib/money'
import { compactDate, runLabel, shortDate } from '../../lib/format'
import { openVipps, prettyPhone } from '../../lib/phone'
import { Notice } from '../../components/Notice'
import { ShareButton } from '../../components/Share'
import type { BillingRun, Charge, Invoice, InvoiceStatus, Profile, Session, Settings } from '../../lib/types'
import './AdminBilling.css'

const UBETALT: InvoiceStatus[] = ['open', 'notified', 'claimed']
const ubetalt = (i: Invoice) => UBETALT.includes(i.status)
const STATUS: Record<InvoiceStatus, string> = {
  open: 'ikke betalt', notified: 'ikke betalt', claimed: 'sier betalt', confirmed: 'betalt', waived: 'frafalt',
}

/**
 * Én person, én rad. Raden samler regningene i oppgjørene som ikke er ferdige,
 * så den som har betalt blir stående (med hake) i stedet for å forsvinne.
 */
interface Row {
  profile: Profile
  invoices: Invoice[]
  owed: number      // det som ikke er betalt
  paid: number      // det som er betalt eller frafalt
  claimed: boolean  // sier selv at hen har vippset
  guest: boolean
}

function rowsFrom(invoices: Invoice[], profiles: Profile[]): Row[] {
  const byPerson = new Map<string, Invoice[]>()
  for (const i of invoices) byPerson.set(i.profile_id, [...(byPerson.get(i.profile_id) ?? []), i])
  const rows: Row[] = []
  for (const [id, list] of byPerson) {
    const profile = profiles.find(p => p.id === id)
    if (!profile) continue
    rows.push({
      profile, invoices: list,
      owed: list.filter(ubetalt).reduce((s, i) => s + i.amount, 0),
      paid: list.filter(i => !ubetalt(i)).reduce((s, i) => s + i.amount, 0),
      claimed: list.some(i => i.status === 'claimed'),
      guest: profile.role === 'guest',
    })
  }
  // De som sier de har betalt først: der venter du. Så største beløp.
  return rows.sort((a, b) => Number(b.claimed) - Number(a.claimed) || b.owed - a.owed || a.profile.name.localeCompare(b.profile.name, 'nb'))
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

  // Oppgjørene som ikke er ferdige: noen skylder fortsatt. Er alt betalt,
  // står det siste oppgjøret, så du ser at det gikk i null.
  const aktive = new Set(runs.filter(b => invoices.some(i => i.run_id === b.id && ubetalt(i))).map(b => b.id))
  if (aktive.size === 0 && runs[0]) aktive.add(runs[0].id)
  const iSpill = invoices.filter(i => ubetalt(i) || (i.run_id ? aktive.has(i.run_id) : true))
  const rows = rowsFrom(iSpill, profiles)
  const skylder = rows.filter(r => r.owed > 0)
  const ferdige = rows.filter(r => r.owed === 0)
  const owed = skylder.reduce((s, r) => s + r.owed, 0)
  const paid = rows.reduce((s, r) => s + r.paid, 0)
  const meldt = skylder.filter(r => r.claimed).length

  const uninvoiced = balances.reduce((s, b) => s + b.uninvoiced, 0)
  // Øktene som venter på et oppgjør: spilt, men ikke med i noen runde.
  const venter = sessions.filter(s => s.status === 'held' && s.run_id == null && s.cost > 0)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const varsles = skylder.flatMap(r => r.invoices).filter(i => i.status === 'open' && !i.session_id)
  const tidligere = runs.filter(b => !aktive.has(b.id))

  async function closeRun(amount: number | null, note: string) {
    const ok = await run('close', async () => {
      const r = await api.closeBillingRun(amount, note)
      return `Oppgjøret ${runLabel(r.from_date, r.to_date, r.closed_at).toLowerCase()} er lukket.`
    })
    if (ok) setClosing(false)
  }

  return (
    <div className="stack-lg" style={{ maxWidth: 640 }}>
      <h1 className="h2">Betaling</h1>
      {error && <Notice>{error}</Notice>}
      {msg && <Notice kind="ok">{msg}</Notice>}

      {rows.length > 0 && (
        <section className={`card stack ${owed > 0 ? 'card-lavender' : ''}`}>
          <p className="caption ink">{owed > 0 ? 'Utestående' : 'Alt er betalt'}</p>
          <p className="num" style={{ lineHeight: 1 }}>{kr(owed > 0 ? owed : paid)}</p>
          <Progress paid={paid} total={paid + owed} />
          <p>{ferdige.length} av {rows.length} har betalt{meldt > 0 ? `. ${meldt} sier ${meldt === 1 ? 'hen' : 'de'} har vippset, bekreft når du ser pengene.` : '.'}</p>
          {skylder.some(r => !r.guest) && (
            <div className="row">
              <ShareButton className="btn" label="Del påminnelse"
                text={reminderText(skylder.filter(r => !r.guest), settings, window.location.origin)}
                onShared={() => { if (varsles.length > 0) void run('varsle', async () => {
                  for (const i of varsles) await api.setInvoiceStatus(i.id, 'notified')
                  return `${varsles.length} ${varsles.length === 1 ? 'regning' : 'regninger'} merket som varslet.`
                }) }} />
            </div>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <section className="stack">
          <ul className="pay-list">
            {[...skylder, ...ferdige].map(r => (
              <PersonRow key={r.profile.id} row={r} runs={runs} sessions={sessions} charges={charges}
                open={openRow === r.profile.id} onToggle={() => setOpenRow(openRow === r.profile.id ? null : r.profile.id)}
                busy={busy === r.profile.id}
                onVipps={() => void run(r.profile.id, async () => {
                  const copied = await openVipps(r.profile.phone!)
                  for (const i of r.invoices.filter(x => x.status === 'open')) await api.setInvoiceStatus(i.id, 'notified')
                  return copied
                    ? `${prettyPhone(r.profile.phone)} er kopiert. Lim inn i Vipps og be om ${kr(r.owed)}.`
                    : `Be om ${kr(r.owed)} fra ${prettyPhone(r.profile.phone)} i Vipps.`
                })}
                onStatus={(status, only) => void run(r.profile.id, async () => {
                  for (const i of r.invoices.filter(only)) await api.setInvoiceStatus(i.id, status)
                })} />
            ))}
          </ul>
        </section>
      )}

      <section className="card stack">
        <h2 className="h3">Neste oppgjør</h2>
        {venter.length === 0
          ? <p className="muted">Alt som er spilt er gjort opp.</p>
          : <>
              <p className="num" style={{ lineHeight: 1 }}>{kr(uninvoiced)}</p>
              <p>{venter.length === 1
                ? `Økta ${shortDate(venter[0].starts_at)} er spilt, men ikke krevd inn.`
                : `${venter.length} økter fra ${shortDate(venter[0].starts_at)} til ${shortDate(venter[venter.length - 1].starts_at)} er spilt, men ikke krevd inn.`} Lukk runden når fakturaen fra skolen kommer.</p>
              {closing
                ? <CloseForm busy={busy === 'close'} onCancel={() => setClosing(false)} onClose={(a, n) => void closeRun(a, n)} />
                : <div className="row"><button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => setClosing(true)}>Lukk runde og krev inn</button></div>}
            </>}
      </section>

      {runs.length > 0 && (
        <section className="stack">
          <h2 className="h3">Oppgjør</h2>
          {[...runs.filter(b => aktive.has(b.id)), ...tidligere].map(b => (
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

/** Andelen som er betalt, som en strek. Skummes før tallene leses. */
function Progress({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0
  return (
    <div className="pay-bar" role="img" aria-label={`${pct} prosent betalt`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * Én person. Navn og tilstand til venstre, beløp og den ene handlingen til
 * høyre. Trykk på navnet for øktene beløpet består av, og de sjeldne valgene.
 */
function PersonRow({ row: r, runs, sessions, charges, open, onToggle, busy, onVipps, onStatus }: {
  row: Row; runs: BillingRun[]; sessions: Session[]; charges: Charge[]
  open: boolean; onToggle: () => void; busy: boolean
  onVipps: () => void; onStatus: (s: 'confirmed' | 'notified', only: (i: Invoice) => boolean) => void
}) {
  const done = r.owed === 0
  const tilstand = done
    ? (r.invoices.every(i => i.status === 'waived') ? 'Frafalt' : 'Betalt')
    : r.claimed ? 'Sier hen har vippset'
    : r.invoices.some(i => i.status === 'notified') ? 'Varslet' : 'Ikke varslet'
  const linjer = r.invoices.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).flatMap(i => {
    const egne = charges.filter(c => c.invoice_id === i.id)
    if (egne.length === 0) {
      const s = i.session_id ? sessions.find(x => x.id === i.session_id) : undefined
      const b = runs.find(x => x.id === i.run_id)
      return [{ key: i.id, label: s ? compactDate(s.starts_at) : b ? runLabel(b.from_date, b.to_date, b.closed_at) : 'Regning', amount: i.amount, inv: i }]
    }
    return egne.map(c => ({ key: c.id, s: sessions.find(x => x.id === c.session_id), amount: c.amount, inv: i }))
      .sort((a, b) => (a.s?.starts_at ?? '').localeCompare(b.s?.starts_at ?? ''))
      .map(x => ({ key: x.key, label: x.s ? compactDate(x.s.starts_at) : 'Økt', amount: x.amount, inv: x.inv }))
  })

  return (
    <li className={`pay-row${done ? ' is-done' : ''}${open ? ' is-open' : ''}`}>
      <div className="pay-main">
        <button type="button" className="pay-who" aria-expanded={open} onClick={onToggle}>
          <span className="pay-name">{r.profile.name}{r.guest && <span className="caption"> · gjest</span>}</span>
          <span className={`pay-state${r.claimed && !done ? ' is-claimed' : ''}`}>{tilstand}</span>
        </button>
        <span className="pay-amount">{kr(done ? r.paid : r.owed)}</span>
        <span className="pay-act">
          {done
            ? <span className="pay-check" aria-hidden="true" />
            : r.claimed
              ? <button type="button" className="btn btn-forest btn-sm" disabled={busy} onClick={() => onStatus('confirmed', i => i.status === 'claimed')}>Bekreft</button>
              : <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onStatus('confirmed', ubetalt)}>Betalt</button>}
        </span>
      </div>

      {open && (
        <div className="pay-detail stack">
          <ul className="pay-lines">
            {linjer.map(l => (
              <li key={l.key}>
                <span>{l.label}</span>
                <span className="muted">{ubetalt(l.inv) ? '' : 'betalt'}</span>
                <span className="tab">{kr(l.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="caption">{r.profile.phone ? prettyPhone(r.profile.phone) : 'Mangler telefonnummer'}</p>
          <div className="row">
            {!done && r.profile.phone && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onVipps}>Be om {kr(r.owed)} i Vipps</button>}
            {r.claimed && !done && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onStatus('notified', i => i.status === 'claimed')}>Ikke mottatt</button>}
            {done && r.invoices.some(i => i.status === 'confirmed') && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onStatus('notified', i => i.status === 'confirmed')}>Angre betalt</button>}
          </div>
        </div>
      )}
    </li>
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
        <input className="input" inputMode="decimal" autoFocus value={amount}
          onChange={e => setAmount(e.target.value)} placeholder="Kroner, kan fylles inn senere" />
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
                  <input className="input" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Kroner" /></label>
                <label className="field"><span className="label">Notat</span>
                  <input className="input" value={note} onChange={e => setNote(e.target.value)} /></label>
                <div className="row">
                  <button className="btn btn-primary btn-sm" disabled={busy || ore === 'ugyldig'}>Lagre</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(false)}>Avbryt</button>
                </div>
              </form>
            : <div className="row"><button type="button" className="btn btn-sm" onClick={() => setEdit(true)}>{run.school_amount == null ? 'Legg inn beløpet fra skolen' : 'Rett beløpet'}</button></div>}

          <ul className="pay-lines">
            {invoices.slice().sort((a, b) => name(a.profile_id).localeCompare(name(b.profile_id), 'nb')).map(i => (
              <li key={i.id}>
                <span>{name(i.profile_id)}{i.session_id && <span className="caption"> · gjest</span>}</span>
                <span className="muted">{STATUS[i.status]}</span>
                <span className="tab">{kr(i.amount)}</span>
              </li>
            ))}
          </ul>
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
    ...rows.slice().sort((a, b) => a.profile.name.localeCompare(b.profile.name, 'nb')).map(r => `${r.profile.name} ${kr(r.owed)}`),
    '',
    vipps,
    'Si fra i appen når du har betalt:',
    `${origin}/spill/betaling`,
  ].join('\n')
}
