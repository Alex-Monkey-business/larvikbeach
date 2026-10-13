// push-kvittering: tjenestearbeideren melder hva som skjedde med et push.
// Ingen innlogging (arbeideren har ingen). Sendings-id-en er tilfeldig og
// kjent bare av den som fikk pushet, og raden må finnes fra før (send-push
// skrev «sendt»), så ingen kan fylle tabellen med søppel.
// Deployes med --no-verify-jwt (se config.toml).
import { adminClient, CORS, fail, json } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('Bare POST', 405)
  let body: { sending?: string; hendelse?: string; detalj?: string }
  try { body = await req.json() } catch { return fail('Ugyldig JSON') }
  if (!body.sending || !body.hendelse) return fail('Mangler felt')

  const admin = adminClient()
  const { data: sendt } = await admin.from('push_logg').select('profile_id').eq('sending', body.sending).eq('hendelse', 'sendt').limit(1).maybeSingle()
  if (!sendt) return fail('Ukjent sending', 404)
  const { error } = await admin.from('push_logg').insert({
    sending: body.sending, profile_id: sendt.profile_id,
    hendelse: body.hendelse.slice(0, 40), detalj: body.detalj?.slice(0, 500) ?? null,
  })
  if (error) return fail(error.message, 500)
  return json({ ok: true })
})
