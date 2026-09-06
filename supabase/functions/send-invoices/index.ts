// send-invoices: lager månedsregningene og sender dem.
//
// Kalles av admin fra appen (når som helst) eller av pg_cron via pg_net daglig
// med { from_cron: true }; da gjør den bare noe på billing_day.
//
// 1. create_invoices(period)          alle ufakturerte andeler t.o.m. perioden
// 2. hver regning med status open      e-post til spilleren → notified
// 3. én samle-e-post til admin         gruppert per beløp, klar til «Be om penger»
import { adminClient, authorize, CORS, esc, fail, json, kr, sendMail, shell, SITE_URL } from '../_shared/common.ts'

interface Invoice { id: string; profile_id: string; period: string; amount: number; status: string }
interface Profile { id: string; name: string; email: string; role: string; active: boolean }

function previousPeriod(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Oslo' }))
  now.setDate(1); now.setMonth(now.getMonth() - 1)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
function periodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number)
  const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('nb-NO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('Bare POST', 405)

  const admin = adminClient()
  const who = await authorize(req, admin)
  if (!who) return fail('Kun admin', 403)

  let body: { period?: string; from_cron?: boolean; dry_run?: boolean } = {}
  try { body = await req.json() } catch { /* tom body er ok */ }

  const { data: settings, error: sErr } = await admin.from('settings').select('*').single()
  if (sErr || !settings) return fail('Fant ikke innstillinger', 500)

  if (body.from_cron) {
    const osloDay = Number(new Date().toLocaleString('en-US', { timeZone: 'Europe/Oslo', day: 'numeric' }))
    if (osloDay !== settings.billing_day) return json({ skipped: true, reason: `Ikke regningsdag (${osloDay} ≠ ${settings.billing_day})` })
  }

  const period = body.period && /^\d{4}-\d{2}$/.test(body.period) ? body.period : previousPeriod()

  const { data: created, error: cErr } = await admin.rpc('create_invoices', { p_period: period })
  if (cErr) return fail(`create_invoices: ${cErr.message}`, 500)

  const { data: open } = await admin.from('invoices').select('*').eq('status', 'open').gt('amount', 0)
  const { data: profiles } = await admin.from('profiles').select('id, name, email, role, active')
  const byId = new Map<string, Profile>((profiles ?? []).map((p: Profile) => [p.id, p]))
  const vipps = settings.vipps_number ? `${settings.vipps_number}${settings.vipps_display_name ? ` (${settings.vipps_display_name})` : ''}` : null

  let sent = 0
  const results: unknown[] = []
  for (const inv of (open ?? []) as Invoice[]) {
    const p = byId.get(inv.profile_id)
    if (!p?.email) continue
    const mail = {
      to: p.email,
      subject: `${kr(inv.amount)} for hallen i ${periodLabel(inv.period).toLowerCase()}`,
      html: shell(`Hei ${esc(p.name.split(' ')[0])}. ${kr(inv.amount)} for ${periodLabel(inv.period).toLowerCase()}.`, `
        <p style="margin:0 0 16px">Din andel av hallen i ${periodLabel(inv.period).toLowerCase()} er <strong>${kr(inv.amount)}</strong>.</p>
        ${vipps ? `<p style="margin:0 0 16px">Vipps til <strong>${esc(vipps)}</strong>, og trykk «Jeg har vippset» i appen.</p>` : ''}
        <p style="margin:0 0 24px"><a href="${SITE_URL}/spill/betaling" style="display:inline-block;padding:14px 24px;background:#f0d7ff;border:2px solid #1a1a1a;border-radius:12px;color:#1a1a1a;font-weight:500;text-decoration:none">Se regningen</a></p>
        <p style="margin:0;color:#8a8a80;font-size:14px">Der ser du hvilke økter beløpet gjelder.</p>`),
    }
    const r = body.dry_run ? { sent: false, error: 'dry_run' } : await sendMail(mail)
    results.push({ to: p.email, amount: inv.amount, ...r, ...(body.dry_run || !r.sent ? { html: mail.html } : {}) })
    if (r.sent) {
      sent++
      await admin.from('invoices').update({ status: 'notified', notified_at: new Date().toISOString() }).eq('id', inv.id).select('id')
    }
  }

  // Samle-oversikt til admin: alt som er utestående, gruppert per beløp.
  const { data: outstanding } = await admin.from('invoices').select('*').in('status', ['open', 'notified'])
  const groups = new Map<number, string[]>()
  for (const inv of (outstanding ?? []) as Invoice[]) {
    const n = byId.get(inv.profile_id)?.name ?? '?'
    groups.set(inv.amount, [...(groups.get(inv.amount) ?? []), n])
  }
  const summaryRows = [...groups.entries()].sort((a, b) => b[0] - a[0])
    .map(([amount, names]) => `<tr><td style="padding:6px 16px 6px 0;font-weight:600;white-space:nowrap;vertical-align:top">${kr(amount)}</td><td style="padding:6px 0">${esc(names.sort().join(', '))}</td></tr>`).join('')
  const total = (outstanding ?? []).reduce((s: number, i: Invoice) => s + i.amount, 0)
  const adminSummary = summaryRows
    ? `<p style="margin:0 0 16px">${created} regninger laget for ${periodLabel(period).toLowerCase()}, ${sent} e-poster sendt. Utestående totalt: <strong>${kr(total)}</strong>.</p>
       <p style="margin:0 0 8px">«Be om penger» i Vipps, én runde per beløp:</p>
       <table style="border-collapse:collapse;font-size:15px">${summaryRows}</table>`
    : `<p style="margin:0">${created} regninger laget, ${sent} sendt. Ingenting utestående.</p>`

  const adminTargets = settings.admin_email
    ? [settings.admin_email]
    : (profiles ?? []).filter((p: Profile) => p.role === 'admin' && p.active).map((p: Profile) => p.email)
  const adminMails = []
  for (const to of adminTargets) {
    const m = { to, subject: `Regninger ${periodLabel(period).toLowerCase()}: ${created} laget, ${kr(total)} utestående`, html: shell('Månedsregning', adminSummary) }
    adminMails.push(body.dry_run ? { to, html: m.html } : await sendMail(m))
  }

  return json({ period, created, sent, results, admin_summary: adminSummary, admin_mails: adminMails })
})
