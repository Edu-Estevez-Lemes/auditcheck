import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { useAuthStore } from '../store/authStore'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/clients': 'Clientes',
  '/audits': 'Auditorías',
  '/comparatives': 'Comparativas',
  '/settings': 'Configuración',
}

export function MainLayout() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'ÃUDITCHECK'

  document.title = `ÃUDITCHECK - ${pageTitle}`

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col min-h-0">
        {/* Top bar */}
        <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-6 shrink-0">
          <h1 className="text-base font-semibold text-text-primary">{pageTitle}</h1>
          <div className="flex items-center gap-4">
            {user?.must_change_password && (
              <span className="text-xs text-warning bg-warning/10 border border-warning/30 px-3 py-1 rounded-full">
                Cambia tu contraseña en Configuración
              </span>
            )}
            <span className="text-sm text-text-secondary">
              {user?.full_name}
            </span>
          </div>
        </header>
        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
