import { Link, Outlet, useLocation } from 'react-router'
import { Nav } from './Nav'
import { useAuth } from '../auth/AuthProvider'

export function Layout() {
  const { pathname } = useLocation()
  const { session } = useAuth()
  // Appen har fanelinje nederst og skal være støyfri. Bunnteksten hører til
  // de åpne sidene, der personvernlenka også må være for Google.
  // Forsiden og innloggingen er hele skjermer: ingen meny, ingen bunntekst.
  // «Ikke tilgang ennå» rendres av samme rute med session satt, og der SKAL
  // menyen stå — ellers er man låst inne.
  const landing = (pathname === '/' || pathname === '/logg-inn') && !session
  const showFooter = !landing && !pathname.startsWith('/spill') && !pathname.startsWith('/admin')
  return (
    <>
      <a className="skip-link" href="#main-content">Hopp til innhold</a>
      {!landing && <Nav />}
      <main id="main-content" tabIndex={-1} className={`page ${session ? 'page-app' : ''}`} style={{ paddingBottom: landing ? 0 : 'calc(var(--space-12) + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>
      {showFooter && (
        <footer className="page site-footer">
          <span className="caption">Larvik Beach Volley</span>
          <Link to="/om-oss" className="caption">Om oss</Link>
          <Link to="/personvern" className="caption">Personvern</Link>
          <a className="caption footer-by" href="https://alexmonkeybusiness.com" target="_blank" rel="noreferrer">Laget av alexmonkeybusiness.com</a>
        </footer>
      )}
    </>
  )
}
