import { Outlet, useLocation } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { Sidebar } from '../components/Sidebar'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'

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
  const { theme, toggleTheme } = useThemeStore()
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'AUDITCHECK'

  document.title = `AUDITCHECK - ${pageTitle}`

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col min-h-0">
        {/* Top bar */}
        <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-6 shrink-0">
          <h1 className="text-base font-semibold text-text-primary">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            {user?.must_change_password && (
              <span className="text-xs text-warning bg-warning/10 border border-warning/30 px-3 py-1 rounded-full">
                Cambia tu contraseña en Configuración
              </span>
            )}
            <span className="text-sm text-text-secondary">{user?.full_name}</span>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
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
