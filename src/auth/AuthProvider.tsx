import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Provider, Session } from '@supabase/auth-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  ready: boolean
  isAdmin: boolean
  requestCode: (email: string) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<void>
  signInWith: (provider: 'google' | 'azure') => Promise<void>
  signOut: () => Promise<void>
  reloadProfile: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      // Etter Google/Microsoft ligger tokenene i #fragmentet. Sesjonen er lest
      // nå, så fragmentet skal ut av adressefeltet og historikken.
      if (window.location.hash.includes('access_token=')) {
        history.replaceState(null, '', window.location.pathname + window.location.search)
      }
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // ready går ned til profilen er lest, så vaktene ikke ser «null profil»
      // og tolker det som inaktiv i det korte mellomrommet.
      setReady(false)
      void loadProfile(s?.user.id).then(() => setReady(true))
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const value = useMemo<AuthState>(() => ({
    session,
    profile,
    ready,
    isAdmin: profile?.role === 'admin' && profile.active,
    // Første innlogging oppretter brukeren, uansett metode. Er e-posten ikke
    // invitert, blir profilen inaktiv og hen ser ingenting (se handle_new_user).
    requestCode: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
      if (error) throw new Error(mapAuthError(error.message))
    },
    signInWith: async (provider) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider as Provider,
        options: {
          redirectTo: `${window.location.origin}/logg-inn`,
          // Microsoft: «common» dekker både jobbkontoer og privat Outlook/Hotmail.
          ...(provider === 'azure' ? { scopes: 'email openid profile', queryParams: { prompt: 'select_account' } } : { queryParams: { prompt: 'select_account' } }),
        },
      })
      if (error) throw new Error(mapAuthError(error.message))
    },
    verifyCode: async (email, code) => {
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
      if (error) throw new Error(mapAuthError(error.message))
    },
    signOut: async () => { await supabase.auth.signOut() },
    reloadProfile: () => loadProfile(session?.user.id),
  }), [session, profile, ready, loadProfile])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function mapAuthError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('signups not allowed') || m.includes('user not found')) {
    return 'Denne e-posten er ikke registrert. Be om å bli med, så inviterer vi deg.'
  }
  if (m.includes('expired') || m.includes('invalid')) return 'Koden er feil eller utløpt. Be om en ny.'
  if (m.includes('rate limit')) return 'Litt for mange forsøk. Vent et minutt og prøv igjen.'
  return msg
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth utenfor AuthProvider')
  return v
}
