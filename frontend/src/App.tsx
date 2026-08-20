import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { MainLayout } from './layouts/MainLayout'
import { Login } from './pages/Login'
import { Setup } from './pages/Setup'
import { authApi } from './lib/api'
import { Dashboard } from './pages/Dashboard'
import { ClientsPage } from './pages/Clients'
import { ClientDetail } from './pages/ClientDetail'
import { AuditsPage } from './pages/Audits'
import { AuditDetail } from './pages/AuditDetail'
import { ComparativesPage } from './pages/Comparatives'
import { SettingsPage } from './pages/Settings'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

function SetupGate({ children }: { children: React.ReactNode }) {
  const [hasUsers, setHasUsers] = useState<boolean | null>(null)

  useEffect(() => {
    authApi.bootstrapStatus()
      .then((r) => setHasUsers(r.data.has_users))
      .catch(() => setHasUsers(true))
  }, [])

  if (hasUsers === null) return null
  if (!hasUsers) return <Navigate to="/setup" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<Setup />} />
      <Route path="/login" element={<SetupGate><Login /></SetupGate>} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="audits" element={<AuditsPage />} />
        <Route path="audits/:id" element={<AuditDetail />} />
        <Route path="comparatives" element={<ComparativesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
