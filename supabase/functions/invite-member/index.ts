// invite-member: admin oppretter et medlem. Brukeren lages med service-nøkkel
// (enable_signup er av), profilen kommer via trigger, og personen får en
// velkomst-e-post med lenke til innlogging. Ingen passord, ingen lenke som
// logger inn av seg selv.
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
  const role = body.role === 'admin' ? 'admin' : 'player'
  if (name.length < 2) return fail('Navn mangler')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Ugyldig e-post')

  const { data: existing } = await admin.from('profiles').select('id, active').eq('email', email).maybeSingle()
  let userId: string
  if (existing) {
    // Finnes fra før: reaktiver og oppdater heller enn å feile.
    const { error } = await admin.from('profiles').update({ active: true, name, phone: body.phone ?? null }).eq('id', existing.id).select('id').single()
    if (error) return fail(error.message, 500)
    userId = existing.id
  } else {
    // app_metadata kan ikke settes fra klienten. Det er dette triggeren
    // handle_new_user leser for å gjøre profilen aktiv.
    const { data, error } = await admin.auth.admin.createUser({
      email, email_confirm: true,
      user_metadata: { name, phone: body.phone ?? null, role },
      app_metadata: { invited: true },
    })
    if (error || !data.user) return fail(error?.message ?? 'Kunne ikke opprette bruker', 500)
    userId = data.user.id
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
      <p style="margin:0 0 16px">Du er lagt inn som spiller. Logg inn med denne e-postadressen, så får du en kode tilbake. Ingen passord.</p>
      <p style="margin:0 0 24px"><a href="${SITE_URL}/logg-inn" style="display:inline-block;padding:14px 24px;background:#f0d7ff;border:2px solid #1a1a1a;border-radius:12px;color:#1a1a1a;font-weight:500;text-decoration:none">Logg inn</a></p>
      <p style="margin:0;color:#8a8a80;font-size:14px">Der melder du deg på økter og ser hva du skal betale for hallen.</p>`),
  })

  return json({ id: userId, mail })
})
