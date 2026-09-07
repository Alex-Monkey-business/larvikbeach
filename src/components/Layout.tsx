import { Outlet } from 'react-router'
import { Nav } from './Nav'

export function Layout() {
  return (
    <>
      <Nav />
      <main className="page" style={{ paddingBottom: 'calc(var(--space-12) + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>
    </>
  )
}
