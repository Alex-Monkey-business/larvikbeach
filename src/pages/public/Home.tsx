import { Link, Navigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useQuery, unwrap } from '../../lib/useQuery'
import { longDate, time } from '../../lib/format'
import { useAuth } from '../../auth/AuthProvider'
import './Home.css'

interface Upcoming { id: string; starts_at: string; duration_min: number; location: string | null; kind: string; going_count: number }

export function Home() {
  const { session, ready } = useAuth()
  const next = useQuery(async () => unwrap<Upcoming[]>(await supabase.from('public_upcoming_sessions').select('*')))
  const first = next.data?.[0]

  // Innlogget: rett på øktene. Forsiden er for de som ikke er med ennå.
  if (!ready) return null
  if (session) return <Navigate to="/spill" replace />

  return (
    <div className="home">
      <section className="hero">
        <h1 className="display">Beachvolley i Larvik.<br /><em>Hele året.</em></h1>
        <p className="lede">
          En fast gjeng på 10–15 som spiller ute om sommeren og i hall om vinteren.
          Nivået er blandet, humøret er ikke.
        </p>
        <div className="row">
          <Link to="/bli-med" className="btn btn-primary">Bli med</Link>
          <Link to="/logg-inn" className="btn">Logg inn</Link>
        </div>
      </section>

      {first && (
        <section className="card card-lavender next-card" aria-label="Neste økt">
          <p className="caption" style={{ color: 'var(--color-ink)' }}>Neste økt</p>
          <p className="h3">{longDate(first.starts_at)}</p>
          <p>{time(first.starts_at)} · {first.location ?? (first.kind === 'indoor' ? 'Hall' : 'Stranda')} · {first.going_count} påmeldt</p>
        </section>
      )}

      <section className="chamber on-dark how">
        <h2 className="h2">Slik fungerer det</h2>
        <ol className="how-list">
          <li><span className="num">1</span><div><strong>Meld deg på</strong><p className="muted">Hver økt ligger i appen. Trykk «Jeg kommer», så vet alle hvor mange som blir.</p></div></li>
          <li><span className="num">2</span><div><strong>Hallen deles likt</strong><p className="muted">Om vinteren deles hallprisen på de som var med. Sommeren er gratis.</p></div></li>
          <li><span className="num">3</span><div><strong>Én regning i måneden</strong><p className="muted">Du får summen på e-post og vippser. Ferdig.</p></div></li>
        </ol>
      </section>
    </div>
  )
}
