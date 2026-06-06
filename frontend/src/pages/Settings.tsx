import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, User, Users, Key, Info, Upload, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { Modal } from '../components/Modal'
import { Logo } from '../components/Logo'

export function SettingsPage() {
  const [tab, setTab] = useState<'profile' | 'users' | 'branding' | 'about'>('profile')

  const tabs = [
    { key: 'profile', label: 'Mi perfil', icon: User },
    { key: 'users', label: 'Usuarios', icon: Users },
    { key: 'branding', label: 'Identidad visual', icon: Shield },
    { key: 'about', label: 'Acerca de', icon: Info },
  ] as const

  return (
    <div className="space-y-5">
      <h1 className="page-title">Configuración</h1>

      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'branding' && <BrandingTab />}
      {tab === 'about' && <AboutTab />}
    </div>
  )
}

function ProfileTab() {
  const { user, updateUser } = useAuthStore()
  const [form, setForm] = useState({
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    password: '',
    confirm_password: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (form.password && form.password !== form.confirm_password) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, string> = { full_name: form.full_name, email: form.email }
      if (form.password) payload.password = form.password
      const { data } = await authApi.updateMe(payload)
      updateUser(data)
      toast.success('Perfil actualizado')
      setForm({ ...form, password: '', confirm_password: '' })
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  return (
    <div className="card max-w-lg space-y-4">
      <h3 className="section-title">Mi perfil</h3>
      <div className="form-group">
        <label className="label">Nombre completo</label>
        <input type="text" className="input" value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
      </div>
      <div className="form-group">
        <label className="label">Email</label>
        <input type="email" className="input" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="border-t border-border pt-4">
        <p className="text-sm font-medium text-text-primary mb-3">Cambiar contraseña</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="form-group">
            <label className="label">Nueva contraseña</label>
            <input type="password" className="input" placeholder="Mínimo 8 caracteres"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="label">Confirmar contraseña</label>
            <input type="password" className="input" placeholder="Repite la contraseña"
              value={form.confirm_password}
              onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} />
          </div>
        </div>
      </div>
      <button className="btn-primary" onClick={handleSave} disabled={saving}>
        <Save size={14} /> {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  )
}

function UsersTab() {
  const qc = useQueryClient()
  const { user: me } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', email: '', full_name: '', password: '', is_admin: false })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => authApi.listUsers().then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: () => authApi.createUser(newUser),
    onSuccess: () => {
      toast.success('Usuario creado')
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowForm(false)
      setNewUser({ username: '', email: '', full_name: '', password: '', is_admin: false })
    },
    onError: () => toast.error('Error al crear usuario'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => authApi.deleteUser(id),
    onSuccess: () => { toast.success('Usuario eliminado'); qc.invalidateQueries({ queryKey: ['users'] }) },
  })

  if (!me?.is_admin) {
    return <div className="card text-center py-8 text-text-muted"><Shield size={32} className="mx-auto mb-2 opacity-40" /><p>Requiere permisos de administrador</p></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Users size={14} /> Nuevo usuario
        </button>
      </div>
      <div className="table-container">
        <table className="table">
          <thead><tr>{['Usuario', 'Nombre', 'Email', 'Rol', 'Estado', ''].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {users.map((u: { id: number; username: string; full_name: string; email: string; is_admin: boolean; is_active: boolean }) => (
              <tr key={u.id}>
                <td className="font-mono text-sm">{u.username}</td>
                <td>{u.full_name}</td>
                <td className="text-text-muted text-sm">{u.email}</td>
                <td><span className={`badge ${u.is_admin ? 'badge-warning' : 'badge-info'}`}>{u.is_admin ? 'Admin' : 'Técnico'}</span></td>
                <td><span className={`badge ${u.is_active ? 'badge-success' : 'badge-error'}`}>{u.is_active ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  {u.id !== me.id && (
                    <button onClick={() => deleteMut.mutate(u.id)} className="btn-ghost p-1 hover:text-danger text-xs">Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuevo usuario">
        <div className="space-y-3">
          {[
            { label: 'Usuario', field: 'username', type: 'text' },
            { label: 'Nombre completo', field: 'full_name', type: 'text' },
            { label: 'Email', field: 'email', type: 'email' },
            { label: 'Contraseña', field: 'password', type: 'password' },
          ].map(({ label, field, type }) => (
            <div key={field} className="form-group">
              <label className="label">{label}</label>
              <input type={type} className="input" value={(newUser as Record<string, unknown>)[field] as string}
                onChange={(e) => setNewUser({ ...newUser, [field]: e.target.value })} />
            </div>
          ))}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={newUser.is_admin}
              onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })} />
            <span className="text-sm text-text-secondary">Administrador</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button className="btn-primary" onClick={() => createMut.mutate()} disabled={createMut.isPending}>Crear</button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function BrandingTab() {
  const handleUpload = (type: 'logo' | 'icon') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`/api/v1/branding/${type}`, { method: 'POST', body: form })
      if (res.ok) toast.success(`${type === 'logo' ? 'Logo' : 'Icono'} actualizado. Recarga la página.`)
      else toast.error('Error al subir')
    } catch { toast.error('Error al subir') }
  }

  return (
    <div className="card max-w-lg space-y-6">
      <h3 className="section-title">Identidad visual corporativa</h3>
      <p className="text-sm text-text-muted">
        Los archivos se guardan en <code className="text-primary font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">assets/branding/</code>.
        También puedes copiarlos directamente a esa carpeta.
      </p>
      <div className="space-y-4">
        {[
          { type: 'logo' as const, label: 'Logo principal', desc: 'Aparece en Login, Dashboard, Navbar. PNG recomendado, fondo transparente.' },
          { type: 'icon' as const, label: 'Icono de aplicación', desc: 'Usado como favicon y en la barra de título. PNG cuadrado (min 64x64).' },
        ].map(({ type, label, desc }) => (
          <div key={type} className="flex items-start gap-4 p-4 bg-surface-2 rounded-lg border border-border">
            <div className="flex-1">
              <p className="font-medium text-text-primary text-sm">{label}</p>
              <p className="text-xs text-text-muted mt-0.5">{desc}</p>
              <p className="text-xs text-primary font-mono mt-1">assets/branding/{type}.png</p>
            </div>
            <label className="btn-secondary cursor-pointer shrink-0">
              <Upload size={13} /> Subir
              <input type="file" accept="image/png" className="hidden" onChange={handleUpload(type)} />
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}

function AboutTab() {
  const { data: info } = useQuery({
    queryKey: ['app-info'],
    queryFn: () => fetch('/api/v1/info').then((r) => r.json()),
  })

  return (
    <div className="card max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <Logo size="sm" showText={false} />
        <div>
          <h2 className="text-xl font-bold text-text-primary">AUDITCHECK</h2>
          <p className="text-text-muted text-sm">v{info?.version ?? '1.0.0'}</p>
        </div>
      </div>
      <p className="text-text-secondary text-sm">
        Plataforma profesional de auditoría técnica para MSP y departamentos IT.
        Desarrollada para técnicos de soporte y administradores de sistemas.
      </p>
      <div className="space-y-2 pt-2 border-t border-border">
        {[
          ['Versión', info?.version ?? '1.0.0'],
          ['Estado del servidor', info?.status ?? 'running'],
          ['Logo corporativo', info?.branding?.logo ? 'Cargado' : 'No configurado — sube logo.png en Identidad visual'],
          ['Icono', info?.branding?.icon ? 'Cargado' : 'No configurado — sube icon.png en Identidad visual'],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3 text-sm">
            <span className="text-text-muted w-36 shrink-0">{k}:</span>
            <span className="text-text-primary">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
