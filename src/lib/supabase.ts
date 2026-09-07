import { PostgrestClient } from '@supabase/postgrest-js'
import { GoTrueClient } from '@supabase/auth-js'
import { FunctionsClient } from '@supabase/functions-js'

// Slank Supabase-klient: postgrest (from/rpc), auth og functions. Ikke
// realtime og storage, som `createClient` alltid drar med.
//
// storageKey er `sb-<prosjektref>-auth-token`, samme som supabase-js.
// flowType 'implicit' fordi PKCE feiler når koden verifiseres i en annen
// nettleser enn den som ba om den (iOS: e-post åpner Safari, appen er PWA).
// Kode-innloggingen bruker ikke URL, men Google/Microsoft returnerer med
// tokenene i URL-fragmentet, så detectSessionInUrl må stå på. AuthProvider
// rydder fragmentet etterpå.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function makeClient(url: string, key: string) {
  const base = new URL(url)
  const storageKey = `sb-${base.hostname.split('.')[0]}-auth-token`

  const auth = new GoTrueClient({
    url: new URL('auth/v1', base).href,
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    storageKey,
    flowType: 'implicit',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  })

  async function accessToken() {
    const { data } = await auth.getSession()
    return data?.session?.access_token ?? key
  }

  const fetchWithAuth: typeof fetch = async (input, init = {}) => {
    const headers = new Headers(init.headers)
    if (!headers.has('apikey')) headers.set('apikey', key)
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${await accessToken()}`)
    return fetch(input, { ...init, headers })
  }

  const rest = new PostgrestClient(new URL('rest/v1', base).href, {
    headers: {},
    schema: 'public',
    fetch: fetchWithAuth,
  })

  const functionsUrl = new URL('functions/v1', base).href

  return {
    auth,
    from: (relation: string) => rest.from(relation),
    rpc: (fn: string, args?: Record<string, unknown>) => rest.rpc(fn, args),
    get functions() {
      return new FunctionsClient(functionsUrl, { headers: {}, customFetch: fetchWithAuth })
    },
  }
}

if (!url || !key) {
  throw new Error('Mangler VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Se .env.example.')
}

export const supabase = makeClient(url, key)
export type Supabase = typeof supabase
