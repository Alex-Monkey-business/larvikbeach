import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const { session, profile, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return null
  if (!session) return <Navigate to="/logg-inn" state={{ from: loc.pathname }} replace />
  // Ingen profil å lese = RLS skjuler den = ikke invitert eller satt inaktiv.
  if (!profile || !profile.active) return <Navigate to="/logg-inn?inaktiv=1" replace />
  return <Outlet />
}

export function RequireAdmin() {
  const { isAdmin, ready, session } = useAuth()
  if (!ready) return null
  if (!session) return <Navigate to="/logg-inn" replace />
  if (!isAdmin) return <Navigate to="/spill" replace />
  return <Outlet />
}
