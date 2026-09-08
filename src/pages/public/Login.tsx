import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { Notice } from '../../components/Notice'
import { LogoVolley } from '../../components/LogoVolley'
import './Login.css'
import './Home.css'

// Microsoft krever en Entra-leier (Azure-konto) for appregistreringen. Parkert
// 7. sep 2026; Outlook/Hotmail-folk bruker koden. Slå på når leverandøren er
// konfigurert i Supabase (external_azure_*).
const MICROSOFT_ENABLED = false
// Den lokale Supabase-stacken har ingen Google-nøkler, så koden er eneste vei
// inn her. Hintet peker på testinnboksen. Skjermen skal ellers se HELT lik ut
// lokalt og i prod: dette er den ene flyten som aldri får lov til å knekke, og
// da må testene se det brukerne ser.
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://ukjent.invalid'
const LOKAL_INNBOKS = import.meta.env.DEV
  && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(supabaseUrl).hostname)

export function Login() {
  const { session, profile, ready, requestCode, verifyCode, signInWith, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [sent, setSent] = useState(0)
  // Koden er reserven: feltet ligger bak en lenke til noen ber om det.
  const [kode, setKode] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const from = (loc.state as { from?: string } | null)?.from ?? '/spill'

  const inactive = ready && !!session && (!profile || !profile.active)
  useEffect(() => { if (ready && session && profile?.active) nav(from, { replace: true }) }, [ready, session, profile, nav, from])
  useEffect(() => { if (step === 'code') codeRef.current?.focus() }, [step])
  // Logget ut (fra denne siden eller menyen): tilbake til første steg.
  useEffect(() => { if (ready && !session) { setStep('email'); setCode('') } }, [ready, session])
  // Feil fra Google/Microsoft kommer tilbake i URL-en.
  useEffect(() => {
    const desc = params.get('error_description') ?? new URLSearchParams(window.location.hash.slice(1)).get('error_description')
    if (desc) setError(decodeURIComponent(desc.replace(/\+/g, ' ')))
  }, [params])

  async function oauth(provider: 'google' | 'azure') {
    setError(null); setBusy(provider)
    try { await signInWith(provider) }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt'); setBusy(null) }
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    setError(null); setBusy('code')
    try { await requestCode(email.trim().toLowerCase()); setSent(Date.now()); setStep('code') }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
    finally { setBusy(null) }
  }

  // Koden sendes med som argument: setCode har ikke slått gjennom ennå når
  // siste siffer utløser innsendingen, og `code` er da fortsatt det forrige.
  async function verify(e?: FormEvent, kode = code) {
    e?.preventDefault()
    if (busy) return
    setError(null); setBusy('verify')
    try { await verifyCode(email.trim().toLowerCase(), kode.replace(/\s/g, '')) }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
    finally { setBusy(null) }
  }

  // Seks siffer inne = ferdig utfylt. Da er «Logg inn»-trykket bare et
  // ekstra hinder; koden sendes selv, og feltet aksepterer ikke mer.
  function onCode(value: string) {
    const bare = value.replace(/\D/g, '').slice(0, 6)
    setCode(bare)
    if (bare.length === 6) void verify(undefined, bare)
  }

  // «Be om en ny» må være en knapp, ikke en oppfordring uten sted å trykke.
  async function resend() {
    setError(null); setCode(''); setBusy('code')
    try { await requestCode(email.trim().toLowerCase()); setSent(Date.now()) }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
    finally { setBusy(null); codeRef.current?.focus() }
  }

  // Innlogget, men ikke invitert eller satt inaktiv.
  if (inactive || (session && params.get('inaktiv'))) {
    return (
      <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 480 }}>
        <h1 className="h1">Ikke tilgang ennå</h1>
        <div className="card stack">
          <p>{session?.user.email ? <><strong>{session.user.email}</strong> er ikke invitert.</> : 'Denne kontoen har ikke tilgang.'} Er du ny, be om å bli med. Er du satt inaktiv, snakk med den som styrer gjengen.</p>
          <div className="row">
            <Link to="/bli-med" className="btn btn-primary">Bli med</Link>
            {session && <button type="button" className="btn btn-ghost" onClick={() => void signOut().then(() => nav('/logg-inn', { replace: true }))}>Logg ut</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="home hero">
      <div className="hero-content">
        <div className="hero-art"><LogoVolley /></div>
        <div className="hero-copy login-copy">
          {/* Skjermen har én handling, så en stor «Logg inn»-tittel er bare
              støy. Overskriften finnes for skjermlesere og søk. */}
          <h1 className="visually-hidden">Logg inn</h1>

          {LOKAL_INNBOKS && <p className="caption">Lokal forhåndsvisning: Google er ikke satt opp. Bruk «Annen e-post» og hent koden i <a href="http://127.0.0.1:55324" target="_blank" rel="noreferrer">testinnboksen</a>.</p>}
          {step === 'email' ? (
            <div className="login-valg">
              <button type="button" className="btn btn-provider" disabled={busy !== null} onClick={() => void oauth('google')}>
                <GoogleMark /> {busy === 'google' ? 'Åpner Google…' : 'Fortsett med Google'}
              </button>
              {MICROSOFT_ENABLED && (
                <button type="button" className="btn btn-provider" disabled={busy !== null} onClick={() => void oauth('azure')}>
                  <MicrosoftMark /> Fortsett med Microsoft
                </button>
              )}
              {kode ? (
                <form className="login-felt" onSubmit={sendCode}>
                  <label className="field">
                    <span className="label">E-post</span>
                    <input className="input" type="email" required autoFocus autoComplete="email" inputMode="email"
                      value={email} onChange={e => setEmail(e.target.value)} />
                  </label>
                  <button className="btn" disabled={busy !== null}>{busy === 'code' ? 'Sender…' : 'Send kode'}</button>
                </form>
              ) : (
                <button type="button" className="lenke login-annen" onClick={() => setKode(true)}>Annen e-post</button>
              )}
              {error && <Notice>{error}</Notice>}
            </div>
          ) : (
            <form className="login-felt" onSubmit={verify}>
              <p key={sent} className="caption">Kode sendt til <strong>{email}</strong>. Den varer i 10 minutter.</p>
              <label className="field">
                <span className="visually-hidden">Sekssifret kode</span>
                <input ref={codeRef} className="input code-input" inputMode="numeric" autoComplete="one-time-code"
                  pattern="[0-9]*" required placeholder="000000" aria-label="Sekssifret kode"
                  value={code} onChange={e => onCode(e.target.value)} />
              </label>
              {error && <Notice>{error}</Notice>}
              <button className="btn btn-primary" disabled={busy !== null || code.length < 6}>{busy === 'verify' ? 'Sjekker…' : 'Logg inn'}</button>
              <div className="row" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => void resend()}>{busy === 'code' ? 'Sender…' : 'Send ny kode'}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStep('email'); setCode(''); setError(null) }}>Annen e-post</button>
              </div>
            </form>
          )}
        </div>
      </div>
      {/* Ikke en blindvei: den som trykket feil finner veien videre. */}
      <p className="hero-fin"><Link to="/bli-med">Bli med</Link> · <Link to="/personvern">Personvern</Link></p>
    </section>
  )
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6C12.3 13.2 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
      <path fill="#FBBC05" d="M10.4 28.8A14.5 14.5 0 0 1 9.5 24c0-1.7.3-3.3.8-4.8l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6z"/>
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-3.7-13.6-8.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  )
}

function MicrosoftMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  )
}
