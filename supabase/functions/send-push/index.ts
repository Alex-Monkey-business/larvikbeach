// send-push: admin (eller service-nøkkelen) sender et varsel til én person.
//
// Alle telefonene personen har sagt ja på får det. Svarer Apple/Google 404
// eller 410, er abonnementet dødt (appen slettet, varsler skrudd av) og raden
// fjernes.
import webpush from 'npm:web-push@3.6.7'
import { adminClient, authorize, CORS, fail, json } from '../_shared/common.ts'
import { lagBillett } from '../_shared/billett.ts'

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ikke-svar@larvikbeach.no',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('Bare POST', 405)

  const admin = adminClient()
  const who = await authorize(req, admin)
  if (!who) return fail('Kun admin', 403)

  let body: { profile_id?: string; title?: string; body?: string; url?: string; session_id?: string }
  try { body = await req.json() } catch { return fail('Ugyldig JSON') }
  if (!body.profile_id || !body.title) return fail('profile_id og title må med')

  const { data: subs, error } = await admin.from('push_abonnement')
    .select('endpoint, p256dh, auth').eq('profile_id', body.profile_id)
  if (error) return fail(error.message, 500)
  if (!subs?.length) return json({ sent: 0, reason: 'Ingen telefoner med varsler på' })

  // Med økt: knappene «Kommer» og «Kommer ikke», som svarer uten å åpne appen.
  const svar = body.session_id ? {
    billett: await lagBillett(body.profile_id, body.session_id),
    url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/svar`,
  } : null
  const payload = JSON.stringify({
    title: body.title, body: body.body ?? '',
    url: body.url ?? (body.session_id ? `/spill/okter/${body.session_id}` : '/spill'),
    svar,
  })
  const results = await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 })
      return { ok: true }
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await admin.from('push_abonnement').delete().eq('endpoint', s.endpoint).select('endpoint')
      }
      return { ok: false, status, error: String((e as Error).message ?? e) }
    }
  }))

  return json({ sent: results.filter(r => r.ok).length, results })
})
