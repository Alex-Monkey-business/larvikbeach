// invite-member: admin godkjenner en e-postadresse og personen får beskjed.
//
// Ingen bruker opprettes her. Første innlogging (kode, Google eller Microsoft)
// oppretter brukeren, og triggeren handle_new_user finner e-posten i invites
// og aktiverer profilen. Har personen alt logget inn (og er inaktiv), aktiveres
// profilen direkte.
import { adminClient, authorize, CORS, esc, fail, json, sendMail, shell, SITE_URL } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('Bare POST', 405)

  const admin = adminClient()
  const who = await authorize(req, admin)
  if (!who || who.kind !== 'admin') return fail('Kun admin', 403)

  let body: { name?: string; email?: string; phone?: string; role?: string; join_request_id?: string }
  try { body = await req.json() } catch { return fail('Ugyldig JSON') }

  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const phone = (body.phone ?? '').trim() || null
  const role = body.role === 'admin' ? 'admin' : 'player'
  if (name.length < 2) return fail('Navn mangler')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Ugyldig e-post')

  const { error: invErr } = await admin.from('invites')
    .upsert({ email, name, phone, role, invited_by: who.userId, created_at: new Date().toISOString() }, { onConflict: 'email' })
    .select('email')
  if (invErr) return fail(invErr.message, 500)

  // Finnes alt som bruker: slipp inn nå.
  const { data: existing } = await admin.from('profiles')
    .update({ active: true, role }).eq('email', email).select('id, active')
  if (existing?.length) {
    await admin.from('invites').update({ accepted_at: new Date().toISOString() }).eq('email', email).select('email')
  }

  if (body.join_request_id) {
    await admin.from('join_requests')
      .update({ status: 'approved', handled_at: new Date().toISOString(), handled_by: who.userId })
      .eq('id', body.join_request_id).select('id')
  }

  const { data: settings } = await admin.from('settings').select('group_name').single()
  const mail = await sendMail({
    to: email,
    subject: `Du er med i ${settings?.group_name ?? 'Larvik Beach Volley'}`,
    html: shell(`Hei ${esc(name.split(' ')[0])}, du er med.`, `
      <p style="margin:0 0 16px">Logg inn med <strong>${esc(email)}</strong>: Google, Microsoft eller en kode på e-post. Ingen passord.</p>
      <p style="margin:0 0 24px"><a href="${SITE_URL}/logg-inn" style="display:inline-block;padding:14px 24px;background:#f0d7ff;border:2px solid #1a1a1a;border-radius:12px;color:#1a1a1a;font-weight:500;text-decoration:none">Logg inn</a></p>
      <p style="margin:0;color:#8a8a80;font-size:14px">Der melder du deg på økter og ser hva du skal betale for hallen.</p>`),
  })

  return json({ email, activated: Boolean(existing?.length), mail })
})
