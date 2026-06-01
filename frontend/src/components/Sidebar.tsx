import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, ClipboardList, GitCompare,
  Settings, LogOut, ChevronRight, Shield
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { Logo } from './Logo'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients', icon: Users, label: 'Clientes' },
  { to: '/audits', icon: ClipboardList, label: 'Auditorías' },
  { to: '/comparatives', icon: GitCompare, label: 'Comparativas' },
  { to: '/settings', icon: Settings, label: 'Configuración' },
]

export function Sidebar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    toast.success('Sesión cerrada')
    navigate('/login')
  }

  return (
    <aside className="w-64 h-screen flex flex-col bg-surface border-r border-border fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="h-24 flex items-center px-4 border-b border-border">
        <Logo size="md" showText />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              }`
            }
          >
            <Icon size={18} />
            <span className="flex-1">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg mb-1">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Shield size={14} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{user?.full_name}</p>
            <p className="text-xs text-text-muted truncate">
              {user?.is_admin ? 'Administrador' : 'Técnico'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-muted hover:text-danger hover:bg-danger/10 transition-all"
        >
          <LogOut size={16} />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
