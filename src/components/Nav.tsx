import { Link, NavLink, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import './Nav.css'

// Innlogget på mobil er fanelinja hele navigasjonen, så toppen tas bort.
// «Logg ut» bor på Meg: ingen skal logge ut ved et uhell. På desktop er
// pillen fortsatt navigasjonen.
export function Nav() {
  const { session, isAdmin } = useAuth()
  // «Logg inn» er en oppfordring, ikke et menypunkt. Står du der alt, er en
  // lilla knapp til samme side bare støy ved siden av de ekte knappene.
  const påLoggInn = useLocation().pathname === '/logg-inn'
  return (
    <>
      <header className={`nav-wrap ${session ? 'nav-app' : ''}`}>
        <nav className="nav" aria-label="Hovedmeny">
          <Link to="/" className="nav-brand" aria-label="Larvik Beach Volley – forsiden">
            <img src="/brand/lbv-wordmark.svg" alt="Larvik Beach Volley" width="79" height="22" />
          </Link>
          <div className={`nav-links ${session ? 'nav-links-app' : ''}`}>
            {session ? (
              <>
                <NavLink to="/spill" end>Hjem</NavLink>
                <NavLink to="/spill/statistikk">Stats</NavLink>
                <NavLink to="/spill/betaling">Betaling</NavLink>
                <NavLink to="/spill/meg">Meg</NavLink>
                {isAdmin && <NavLink to="/admin">Admin</NavLink>}
              </>
            ) : (
              <>
                <NavLink to="/om-oss">Om oss</NavLink>
                <NavLink to="/bli-med">Bli med</NavLink>
                {!påLoggInn && <Link to="/logg-inn" className="btn btn-primary btn-sm">Logg inn</Link>}
              </>
            )}
          </div>
        </nav>
      </header>
      {session && (
        <nav className="tabbar" aria-label="Sider">
          <NavLink to="/spill" end>Hjem</NavLink>
          <NavLink to="/spill/statistikk">Stats</NavLink>
          <NavLink to="/spill/betaling">Betaling</NavLink>
          <NavLink to="/spill/meg">Meg</NavLink>
          {isAdmin && <NavLink to="/admin">Admin</NavLink>}
        </nav>
      )}
    </>
  )
}
