// Signert billett for svar fra et varsel: «denne personen, denne økta».
// HMAC med en hemmelighet bare funksjonene kjenner. Den kan ikke endres til en
// annen person eller økt uten at signaturen brekker.
const SECRET = Deno.env.get('PUSH_SVAR_SECRET') ?? ''

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
}

export async function lagBillett(profileId: string, sessionId: string): Promise<string> {
  if (!SECRET) throw new Error('PUSH_SVAR_SECRET mangler')
  const data = `${profileId}.${sessionId}`
  return `${data}.${await sign(data)}`
}

export async function lesBillett(billett: string): Promise<{ profileId: string; sessionId: string } | null> {
  if (!SECRET) return null
  const [profileId, sessionId, sig] = billett.split('.')
  if (!profileId || !sessionId || !sig) return null
  return (await sign(`${profileId}.${sessionId}`)) === sig ? { profileId, sessionId } : null
}
