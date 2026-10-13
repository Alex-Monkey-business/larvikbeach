// svar: «Kommer» / «Kommer ikke» trykket i et varsel.
//
// Kalles av tjenestearbeideren, som ikke har innlogging. Billetten er
// beviset: send-push lagde den for akkurat denne personen og økta.
// Deployes med --no-verify-jwt (se config.toml).
import { adminClient, CORS, fail, json } from '../_shared/common.ts'
import { lesBillett } from '../_shared/billett.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('Bare POST', 405)

  let body: { billett?: string; going?: boolean }
  try { body = await req.json() } catch { return fail('Ugyldig JSON') }
  const b = body.billett ? await lesBillett(body.billett) : null
  if (!b || typeof body.going !== 'boolean') return fail('Ugyldig billett', 403)

  const { data, error } = await adminClient().rpc('svar_fra_varsel', { p_session: b.sessionId, p_profile: b.profileId, p_going: body.going })
  if (error) return fail(error.message, 409)
  return json({ going: data.going })
})
