import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { MainLayout } from './layouts/MainLayout'
import { Login } from './pages/Login'
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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
