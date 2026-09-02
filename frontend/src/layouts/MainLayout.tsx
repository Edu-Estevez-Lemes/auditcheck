import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sun, Moon, TerminalSquare } from 'lucide-react'
import { Sidebar } from '../components/Sidebar'
import { Avatar } from '../components/Avatar'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { useBrandTheme } from '../hooks/useBrandTheme'
import { useConsoleStore } from '../store/consoleStore'
import { useVaultStore } from '../store/vaultStore'
import { ConsoleDrawer } from '../components/ConsoleDrawer'
import { NetworkConsole } from '../components/NetworkConsole'
import { VaultUnlockModal } from '../components/vault/VaultUnlockModal'
import { VaultSetupModal } from '../components/vault/VaultSetupModal'
import { VaultMigrationModal } from '../components/vault/VaultMigrationModal'

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
  useBrandTheme(theme)
  const consoleOpen = useConsoleStore((s) => s.open)
  const openConsole = useConsoleStore((s) => s.openWithContext)
  const closeConsole = useConsoleStore((s) => s.close)
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'AUDITCHECK'

  const { needsSetup, needsMigration, checked, checkStatus } = useVaultStore()
  useEffect(() => { checkStatus() }, [checkStatus])
  const isSuperadmin = user?.role === 'superadmin'

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
            {checked && (needsSetup || needsMigration) && !isSuperadmin && (
              <span className="text-xs text-warning bg-warning/10 border border-warning/30 px-3 py-1 rounded-full">
                Vault de credenciales pendiente de configurar por un administrador
              </span>
            )}
            <span className="text-sm text-text-secondary">{user?.full_name}</span>
            <Avatar user={user} size={28} />
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

      {/* Consola de Red — lanzador flotante, visible en toda la app */}
      <button
        onClick={() => openConsole()}
        title="Consola de Red"
        className="btn-primary fixed bottom-6 right-6 z-40 p-3 rounded-full shadow-2xl"
      >
        <TerminalSquare size={20} />
      </button>
      <ConsoleDrawer open={consoleOpen} onClose={closeConsole}>
        <NetworkConsole />
      </ConsoleDrawer>

      <VaultUnlockModal />
      {isSuperadmin && checked && needsSetup && <VaultSetupModal open />}
      {isSuperadmin && checked && !needsSetup && needsMigration && <VaultMigrationModal open />}
    </div>
  )
}
