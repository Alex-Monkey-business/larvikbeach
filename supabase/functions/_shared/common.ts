import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
export function fail(message: string, status = 400) {
  return json({ error: message }, status)
}

export const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Klient med service-nøkkel. Ser alt, omgår RLS. Bare her. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

/**
 * Hvem kaller? Enten en innlogget bruker (JWT fra appen) eller service-nøkkelen
 * selv (cron via pg_net). Rollen slås opp i basen, aldri lest fra klienten.
 */
export async function authorize(req: Request, admin: SupabaseClient): Promise<{ kind: 'service' } | { kind: 'admin'; userId: string } | null> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '')
  if (!token) return null
  if (token === SERVICE_KEY) return { kind: 'service' }
  // Nøkkelen i vault kan ha et annet format enn den runtime får i env (legacy
  // JWT vs. sb_secret). Spør GoTrue: bare en service-nøkkel får lese admin-API-et.
  if (looksLikeServiceKey(token)) {
    const probe = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1`, {
      headers: { apikey: token, Authorization: `Bearer ${token}` },
    })
    if (probe.ok) return { kind: 'service' }
  }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  const { data: profile } = await admin.from('profiles').select('role, active').eq('id', data.user.id).maybeSingle()
  if (profile?.role === 'admin' && profile.active) return { kind: 'admin', userId: data.user.id }
  return null
}

function looksLikeServiceKey(token: string): boolean {
  if (token.startsWith('sb_secret_')) return true
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload?.role === 'service_role'
  } catch { return false }
}

export function kr(ore: number): string {
  return `${Math.round(ore / 100).toLocaleString('nb-NO')} kr`
}

// E-post via Resend. Uten nøkkel (lokalt) sendes ingenting; meldingene
// returneres i svaret så de kan sjekkes.
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_URL = Deno.env.get('RESEND_URL') ?? 'https://api.resend.com/emails'
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'Larvik Beach Volley <ikke-svar@larvikbeach.no>'

export interface Mail { to: string; subject: string; html: string }

export async function sendMail(mail: Mail): Promise<{ sent: boolean; id?: string; error?: string }> {
  if (!RESEND_KEY) return { sent: false, error: 'RESEND_API_KEY mangler; ikke sendt' }
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [mail.to], subject: mail.subject, html: mail.html }),
  })
  if (!res.ok) return { sent: false, error: `Resend ${res.status}: ${await res.text()}` }
  const j = await res.json().catch(() => ({}))
  return { sent: true, id: j.id }
}

export function shell(title: string, body: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;max-width:480px;line-height:1.4">
  <h2 style="font-size:20px;font-weight:600;margin:0 0 20px">${title}</h2>
  ${body}
  <hr style="border:none;border-top:1px solid #e4e4d0;margin:26px 0">
  <p style="margin:0;color:#8a8a80;font-size:13px">Larvik Beach Volley · <a href="${SITE_URL}" style="color:#8a8a80">${SITE_URL.replace(/^https?:\/\//, '')}</a></p>
</div>`
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
