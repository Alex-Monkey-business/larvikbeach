import { Link, Outlet, useLocation } from 'react-router'
import { Nav } from './Nav'

export function Layout() {
  const { pathname } = useLocation()
  // Appen har fanelinje nederst og skal være støyfri. Bunnteksten hører til
  // de åpne sidene, der personvernlenka også må være for Google.
  const showFooter = !pathname.startsWith('/spill') && !pathname.startsWith('/admin')
  return (
    <>
      <Nav />
      <main className="page" style={{ paddingBottom: 'calc(var(--space-12) + env(safe-area-inset-bottom))' }}>
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
