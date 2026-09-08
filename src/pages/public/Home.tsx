import { Link, Navigate } from 'react-router'
import { useAuth } from '../../auth/AuthProvider'
import { BeachServe } from '../../components/BeachServe'
import './Home.css'

export function Home() {
  const { session, ready } = useAuth()
  if (!ready) return null
  if (session) return <Navigate to="/spill" replace />

  return (
    <section className="home hero">
      <div className="hero-copy">
        <h1 className="display">Larvik Beach Volley</h1>
        <div className="row">
          <Link to="/bli-med" className="btn btn-primary">Bli med</Link>
          <Link to="/logg-inn" className="btn btn-ghost">Logg inn</Link>
        </div>
      </div>
      <div className="hero-art"><BeachServe /></div>
      <Link to="/personvern" className="hero-fin">Personvern</Link>
    </section>
  )
}
