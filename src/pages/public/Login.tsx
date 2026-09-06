import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { Notice } from '../../components/Notice'

export function Login() {
  const { session, profile, ready, requestCode, verifyCode, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const from = (loc.state as { from?: string } | null)?.from ?? '/spill'

  const inactive = ready && !!session && (!profile || !profile.active)
  useEffect(() => { if (ready && session && profile?.active) nav(from, { replace: true }) }, [ready, session, profile, nav, from])
  useEffect(() => { if (step === 'code') codeRef.current?.focus() }, [step])

  async function sendCode(e: FormEvent) {
    e.preventDefault()
    setError(null); setBusy(true)
    try { await requestCode(email.trim().toLowerCase()); setStep('code') }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
    finally { setBusy(false) }
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setError(null); setBusy(true)
    try { await verifyCode(email.trim().toLowerCase(), code.replace(/\s/g, '')) }
    catch (err) { setError(err instanceof Error ? err.message : 'Noe gikk galt') }
    finally { setBusy(false) }
  }

  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)', maxWidth: 480 }}>
      <h1 className="h1">Logg inn</h1>
      {(params.get('inaktiv') || inactive) && (
        <div className="card stack">
          <Notice>Denne e-posten har ikke tilgang ennå. Er du ikke invitert, be om å bli med. Er du satt inaktiv, snakk med den som styrer gjengen.</Notice>
          <div className="row"><Link to="/bli-med" className="btn">Bli med</Link>{session && <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>Logg ut</button>}</div>
        </div>
      )}
      {inactive ? null : <>

      {step === 'email' ? (
        <form className="card stack" onSubmit={sendCode}>
          <p>Du får en sekssifret kode på e-post. Ingen passord.</p>
          <label className="field">
            <span className="label">E-post</span>
            <input className="input" type="email" required autoComplete="email" inputMode="email" autoFocus
              value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          {error && <Notice>{error}</Notice>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sender…' : 'Send kode'}</button>
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
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sjekker…' : 'Logg inn'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setStep('email'); setCode(''); setError(null) }}>Annen e-post</button>
        </form>
      )}
      </>}
    </div>
  )
}
