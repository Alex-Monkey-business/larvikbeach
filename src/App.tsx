import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { RequireAdmin, RequireAuth } from './auth/guards'
import { Home } from './pages/public/Home'
import { About } from './pages/public/About'
import { Join } from './pages/public/Join'
import { Login } from './pages/public/Login'
import { Privacy } from './pages/public/Privacy'
import { Play } from './pages/play/Play'
import { SessionPage } from './pages/play/SessionPage'
import { Billing } from './pages/play/Billing'
import { Me } from './pages/play/Me'
import { Stats } from './pages/play/Stats'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminSessions } from './pages/admin/AdminSessions'
import { AdminSession } from './pages/admin/AdminSession'
import { AdminMembers } from './pages/admin/AdminMembers'
import { AdminBilling } from './pages/admin/AdminBilling'
import { AdminSettings } from './pages/admin/AdminSettings'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="om-oss" element={<About />} />
        <Route path="bli-med" element={<Join />} />
        <Route path="logg-inn" element={<Login />} />
        <Route path="personvern" element={<Privacy />} />

        <Route path="spill" element={<RequireAuth />}>
          <Route index element={<Play />} />
          <Route path="okter/:id" element={<SessionPage />} />
          <Route path="statistikk" element={<Stats />} />
          <Route path="betaling" element={<Billing />} />
          <Route path="meg" element={<Me />} />
        </Route>

        <Route path="admin" element={<RequireAdmin />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminSessions />} />
            <Route path="okter/:id" element={<AdminSession />} />
            <Route path="medlemmer" element={<AdminMembers />} />
            <Route path="betaling" element={<AdminBilling />} />
            <Route path="innstillinger" element={<AdminSettings />} />
          </Route>
        </Route>

        <Route path="*" element={<div style={{ paddingTop: 'var(--space-6)' }}><h1 className="h1">Fant ikke siden</h1></div>} />
      </Route>
    </Routes>
  )
}
