import { Outlet } from 'react-router'
import { Nav } from './Nav'

export function Layout() {
  return (
    <>
      <Nav />
      <main className="page" style={{ paddingBottom: 'var(--space-12)' }}>
        <Outlet />
      </main>
    </>
  )
}
