import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { Notice } from '../../components/Notice'
import './Login.css'

export function Login() {
  const { session, profile, ready, requestCode, verifyCode, signInWith, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const from = (loc.state as { from?: string } | null)?.from ?? '/spill'

  const inactive = ready && !!session && (!profile || !profile.active)
  useEffect(() => { if (ready && session && profile?.active) nav(from, { replace: true }) }, [ready, session, profile, nav, from])
  useEffect(() => { if (step === 'code') codeRef.current?.focus() }, [step])
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
    try { await requestCode(email.trim().toLowerCase()); setStep('code') }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
    finally { setBusy(null) }
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setError(null); setBusy('verify')
    try { await verifyCode(email.trim().toLowerCase(), code.replace(/\s/g, '')) }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
    finally { setBusy(null) }
  }

  // Innlogget, men ikke invitert eller satt inaktiv.
  if (inactive || params.get('inaktiv')) {
    return (
      <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 480 }}>
        <h1 className="h1">Ikke tilgang ennå</h1>
        <div className="card stack">
          <p>{session?.user.email ? <><strong>{session.user.email}</strong> er ikke invitert.</> : 'Denne kontoen har ikke tilgang.'} Er du ny, be om å bli med. Er du satt inaktiv, snakk med den som styrer gjengen.</p>
          <div className="row">
            <Link to="/bli-med" className="btn btn-primary">Bli med</Link>
            {session && <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>Logg ut</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 480 }}>
      <h1 className="h1">Logg inn</h1>
      <p className="lede">Bruk kontoen du har. Ingen passord å huske.</p>

      {step === 'email' && (
        <div className="stack">
          <button type="button" className="btn btn-block btn-provider" disabled={busy !== null} onClick={() => void oauth('google')}>
            <GoogleMark /> Fortsett med Google
          </button>
          <button type="button" className="btn btn-block btn-provider" disabled={busy !== null} onClick={() => void oauth('azure')}>
            <MicrosoftMark /> Fortsett med Microsoft
          </button>
          <p className="caption" style={{ textAlign: 'center' }}>Microsoft dekker Outlook, Hotmail og jobbkontoer.</p>
        </div>
      )}

      {step === 'email' ? (
        <form className="card stack" onSubmit={sendCode}>
          <p><strong>Annen e-post?</strong> Få en sekssifret kode.</p>
          <label className="field">
            <span className="label">E-post</span>
            <input className="input" type="email" required autoComplete="email" inputMode="email"
              value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          {error && <Notice>{error}</Notice>}
          <button className="btn btn-primary" disabled={busy !== null}>{busy === 'code' ? 'Sender…' : 'Send kode'}</button>
          <p className="caption">Ikke med ennå? <Link to="/bli-med">Bli med</Link></p>
        </form>
      ) : (
        <form className="card stack" onSubmit={verify}>
          <p>Koden er sendt til <strong>{email}</strong>. Den varer i 10 minutter.</p>
          <label className="field">
            <span className="label">Kode</span>
            <input ref={codeRef} className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" required
              style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }}
              value={code} onChange={e => setCode(e.target.value)} />
          </label>
          {error && <Notice>{error}</Notice>}
          <button className="btn btn-primary" disabled={busy !== null}>{busy === 'verify' ? 'Sjekker…' : 'Logg inn'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setStep('email'); setCode(''); setError(null) }}>Tilbake</button>
        </form>
      )}
    </div>
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
