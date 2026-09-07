import { Link, NavLink } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import './Nav.css'

// Innlogget på mobil: lenkene flytter ned i en fanelinje, pillen beholder
// bare navn og «Logg ut». På desktop ligger alt i pillen.
export function Nav() {
  const { session, isAdmin, signOut } = useAuth()
  return (
    <>
      <header className="nav-wrap">
        <nav className="nav" aria-label="Hovedmeny">
          <Link to="/" className="nav-brand">Larvik Beach Volley</Link>
          <div className={`nav-links ${session ? 'nav-links-app' : ''}`}>
            {session ? (
              <>
                <NavLink to="/spill" end>Økter</NavLink>
                <NavLink to="/spill/statistikk">Statistikk</NavLink>
                <NavLink to="/spill/betaling">Betaling</NavLink>
                <NavLink to="/spill/meg">Meg</NavLink>
                {isAdmin && <NavLink to="/admin">Admin</NavLink>}
              </>
            ) : (
              <>
                <NavLink to="/om-oss">Om oss</NavLink>
                <NavLink to="/bli-med">Bli med</NavLink>
                <Link to="/logg-inn" className="btn btn-primary btn-sm">Logg inn</Link>
              </>
            )}
          </div>
          {session && <button type="button" className="nav-link-btn" onClick={() => void signOut()}>Logg ut</button>}
        </nav>
      </header>
      {session && (
        <nav className="tabbar" aria-label="Sider">
          <NavLink to="/spill" end>Økter</NavLink>
          <NavLink to="/spill/statistikk">Stats</NavLink>
          <NavLink to="/spill/betaling">Betaling</NavLink>
          <NavLink to="/spill/meg">Meg</NavLink>
          {isAdmin && <NavLink to="/admin">Admin</NavLink>}
        </nav>
      )}
    </>
  )
}
