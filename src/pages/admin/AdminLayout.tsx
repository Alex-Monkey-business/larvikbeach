import { NavLink, Outlet } from 'react-router'

export function AdminLayout() {
  return (
    <div className="stack-lg" style={{ paddingTop: 'var(--space-6)' }}>
      <nav className="admin-nav" aria-label="Administrasjon">
        <NavLink to="/admin" end className={({ isActive }) => isActive ? 'active' : ''}>Økter</NavLink>
        <NavLink to="/admin/medlemmer" className={({ isActive }) => isActive ? 'active' : ''}>Medlemmer</NavLink>
        <NavLink to="/admin/betaling" className={({ isActive }) => isActive ? 'active' : ''}>Betaling</NavLink>
        <NavLink to="/admin/innstillinger" className={({ isActive }) => isActive ? 'active' : ''}>Innstillinger</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
