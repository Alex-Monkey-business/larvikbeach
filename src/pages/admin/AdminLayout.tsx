import { NavLink, Outlet } from 'react-router'

export function AdminLayout() {
  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)' }}>
      <nav className="row" aria-label="Admin">
        <NavLink to="/admin" end className={({ isActive }) => `btn btn-sm ${isActive ? 'btn-dark' : ''}`}>Økter</NavLink>
        <NavLink to="/admin/medlemmer" className={({ isActive }) => `btn btn-sm ${isActive ? 'btn-dark' : ''}`}>Medlemmer</NavLink>
        <NavLink to="/admin/betaling" className={({ isActive }) => `btn btn-sm ${isActive ? 'btn-dark' : ''}`}>Betaling</NavLink>
        <NavLink to="/admin/innstillinger" className={({ isActive }) => `btn btn-sm ${isActive ? 'btn-dark' : ''}`}>Innstillinger</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
