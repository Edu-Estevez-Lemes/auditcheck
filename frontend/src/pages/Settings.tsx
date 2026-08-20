import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, User, Users, Key, Info, Upload, Shield, History, RotateCcw, Eye, Copy, Lock, ShieldAlert, Database, ListChecks, FileEdit } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi, auditLogApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useVaultStore } from '../store/vaultStore'
import { Modal } from '../components/Modal'
import { Logo } from '../components/Logo'
import { DatabaseTab } from '../components/database/DatabaseTab'
import { ChecklistSettingsTab } from '../components/review/ChecklistSettingsTab'
import { ReportBrandingTab } from '../components/reports/ReportBrandingTab'
import type { AuditLogEntry, UserRole } from '../types'

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Administrador',
  tecnico: 'Técnico',
}

export function SettingsPage() {
  const { user: me } = useAuthStore()
  const isAdminPlus = me?.role === 'superadmin' || me?.role === 'admin'
  const isSuperadmin = me?.role === 'superadmin'
  const [tab, setTab] = useState<'profile' | 'users' | 'activity' | 'vault' | 'database' | 'checklist' | 'reports' | 'branding' | 'about'>('profile')

  const tabs = [
    { key: 'profile', label: 'Mi perfil', icon: User },
    ...(isAdminPlus ? [{ key: 'users' as const, label: 'Usuarios', icon: Users }] : []),
    ...(isAdminPlus ? [{ key: 'activity' as const, label: 'Registro de actividad', icon: History }] : []),
    ...(isSuperadmin ? [{ key: 'vault' as const, label: 'Vault', icon: Lock }] : []),
    { key: 'database' as const, label: 'Base de Datos', icon: Database },
    { key: 'checklist' as const, label: 'Checklist', icon: ListChecks },
    { key: 'reports' as const, label: 'Edición de informes', icon: FileEdit },
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
      {tab === 'users' && isAdminPlus && <UsersTab />}
      {tab === 'activity' && isAdminPlus && <AuditLogTab />}
      {tab === 'vault' && isSuperadmin && <VaultTab />}
      {tab === 'database' && <DatabaseTab />}
      {tab === 'checklist' && <ChecklistSettingsTab />}
      {tab === 'reports' && <ReportBrandingTab />}
      {tab === 'branding' && <BrandingTab />}
      {tab === 'about' && <AboutTab />}
    </div>
  )
}

function ProfileTab() {
  const { user, updateUser } = useAuthStore()
  const [form, setForm] = useState({ full_name: user?.full_name ?? '', email: user?.email ?? '' })
  const [saving, setSaving] = useState(false)

  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [changingPw, setChangingPw] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const { data } = await authApi.updateMe({ full_name: form.full_name, email: form.email })
      updateUser(data)
      toast.success('Perfil actualizado')
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  const handleChangePassword = async () => {
    if (pwForm.new_password.length < 8) {
      toast.error('La nueva contraseña debe tener al menos 8 caracteres')
      return
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setChangingPw(true)
    try {
      await authApi.changePassword({
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      })
      toast.success('Contraseña actualizada')
      setPwForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al cambiar la contraseña')
    } finally { setChangingPw(false) }
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="card space-y-4">
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
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={14} /> {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div className="card space-y-4">
        <h3 className="section-title">Cambiar contraseña</h3>
        <div className="form-group">
          <label className="label">Contraseña actual</label>
          <input type="password" className="input" value={pwForm.current_password}
            onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="form-group">
            <label className="label">Nueva contraseña</label>
            <input type="password" className="input" placeholder="Mínimo 8 caracteres"
              value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="label">Confirmar contraseña</label>
            <input type="password" className="input" placeholder="Repite la contraseña"
              value={pwForm.confirm_password}
              onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })} />
          </div>
        </div>
        <button className="btn-primary" onClick={handleChangePassword} disabled={changingPw}>
          <Key size={14} /> {changingPw ? 'Cambiando...' : 'Cambiar contraseña'}
        </button>
      </div>
    </div>
  )
}

interface UserRow {
  id: number
  username: string
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
}

function UsersTab() {
  const qc = useQueryClient()
  const { user: me } = useAuthStore()
  const isSuperadmin = me?.role === 'superadmin'
  const [showForm, setShowForm] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', email: '', full_name: '', password: '', role: 'tecnico' as UserRole })
  const [tempPassword, setTempPassword] = useState<{ username: string; password: string } | null>(null)

  const { data: users = [] } = useQuery<UserRow[]>({
    queryKey: ['users'],
    queryFn: () => authApi.listUsers().then((r) => r.data),
  })

  const createMut = useMutation({
    mutationFn: () => authApi.createUser(newUser),
    onSuccess: () => {
      toast.success('Usuario creado')
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowForm(false)
      setNewUser({ username: '', email: '', full_name: '', password: '', role: 'tecnico' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al crear usuario')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => authApi.deleteUser(id),
    onSuccess: () => { toast.success('Usuario eliminado'); qc.invalidateQueries({ queryKey: ['users'] }) },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al eliminar usuario')
    },
  })

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => authApi.updateUser(id, { is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }) },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al actualizar usuario')
    },
  })

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: number; role: UserRole }) => authApi.updateUserRole(id, role),
    onSuccess: () => { toast.success('Rol actualizado'); qc.invalidateQueries({ queryKey: ['users'] }) },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al cambiar el rol')
    },
  })

  const resetMut = useMutation({
    mutationFn: (u: UserRow) => authApi.resetPassword(u.id).then((r) => ({ username: u.username, password: r.data.temporary_password })),
    onSuccess: (result) => setTempPassword(result),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al resetear la contraseña')
    },
  })

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
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-mono text-sm">{u.username}</td>
                <td>{u.full_name}</td>
                <td className="text-text-muted text-sm">{u.email}</td>
                <td>
                  {isSuperadmin ? (
                    <select
                      className="input py-1 text-xs"
                      value={u.role}
                      onChange={(e) => roleMut.mutate({ id: u.id, role: e.target.value as UserRole })}
                    >
                      {(['superadmin', 'admin', 'tecnico'] as UserRole[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`badge ${u.role === 'tecnico' ? 'badge-info' : 'badge-warning'}`}>{ROLE_LABELS[u.role]}</span>
                  )}
                </td>
                <td>
                  <button
                    className={`badge ${u.is_active ? 'badge-success' : 'badge-error'}`}
                    disabled={u.id === me?.id}
                    onClick={() => toggleActiveMut.mutate({ id: u.id, is_active: !u.is_active })}
                    title={u.id === me?.id ? 'No puedes desactivarte a ti mismo' : 'Cambiar estado'}
                  >
                    {u.is_active ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="flex items-center gap-2">
                  <button onClick={() => resetMut.mutate(u)} className="btn-ghost p-1 text-xs" title="Resetear contraseña">
                    <RotateCcw size={13} />
                  </button>
                  {u.id !== me?.id && (
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
          <div className="form-group">
            <label className="label">Rol</label>
            <select className="input" value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}>
              <option value="tecnico">Técnico</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button className="btn-primary" onClick={() => createMut.mutate()} disabled={createMut.isPending}>Crear</button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!tempPassword} onClose={() => setTempPassword(null)} title="Contraseña temporal generada">
        {tempPassword && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">
              Comunica esta contraseña a <strong>{tempPassword.username}</strong>. No volverá a mostrarse.
              Se le pedirá cambiarla en el primer inicio de sesión.
            </p>
            <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-2">
              <code className="font-mono text-sm flex-1">{tempPassword.password}</code>
              <button
                className="btn-ghost p-1"
                onClick={() => { navigator.clipboard.writeText(tempPassword.password); toast.success('Copiada al portapapeles') }}
              >
                <Copy size={14} />
              </button>
            </div>
            <button className="btn-primary w-full justify-center" onClick={() => setTempPassword(null)}>Cerrar</button>
          </div>
        )}
      </Modal>
    </div>
  )
}

function AuditLogTab() {
  const { data: logs = [] } = useQuery<AuditLogEntry[]>({
    queryKey: ['audit-log'],
    queryFn: () => auditLogApi.list().then((r) => r.data),
  })

  return (
    <div className="table-container">
      <table className="table">
        <thead><tr>{['Fecha', 'Usuario', 'Acción', 'Objetivo', 'IP'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="text-xs text-text-muted whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
              <td className="text-sm">{l.user_email ?? '—'}</td>
              <td className="text-sm font-mono">{l.action}</td>
              <td className="text-xs text-text-muted">{l.target_type ? `${l.target_type}${l.target_id ? ` #${l.target_id}` : ''}` : '—'}</td>
              <td className="text-xs text-text-muted">{l.ip_address ?? '—'}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr><td colSpan={5} className="text-center text-text-muted py-8"><Eye size={24} className="mx-auto mb-2 opacity-40" />Sin actividad registrada</td></tr>
          )}
        </tbody>
      </table>
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

function VaultTab() {
  const { isUnlocked, lock } = useVaultStore()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [changing, setChanging] = useState(false)

  const handleChange = async () => {
    if (form.next.length < 12) {
      toast.error('La nueva passphrase debe tener al menos 12 caracteres')
      return
    }
    if (form.next !== form.confirm) {
      toast.error('Las passphrases no coinciden')
      return
    }
    setChanging(true)
    try {
      await useVaultStore.getState().changePassphrase(form.current, form.next, form.confirm)
      toast.success('Passphrase cambiada. Todas las credenciales se han re-cifrado.')
      setForm({ current: '', next: '', confirm: '' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al cambiar la passphrase')
    } finally {
      setChanging(false)
    }
  }

  return (
    <div className="card max-w-lg space-y-4">
      <h3 className="section-title">Vault de credenciales</h3>
      <div className="flex items-center justify-between p-3 bg-surface-2 rounded-lg border border-border">
        <span className="text-sm text-text-secondary">Estado</span>
        <span className={`badge ${isUnlocked ? 'badge-success' : 'badge-error'}`}>
          {isUnlocked ? 'Desbloqueado' : 'Bloqueado'}
        </span>
      </div>
      {isUnlocked && (
        <button className="btn-secondary" onClick={() => lock()}>
          <Lock size={14} /> Bloquear vault ahora
        </button>
      )}

      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-sm font-medium text-text-primary">Cambiar passphrase maestra</p>
        <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
          <ShieldAlert size={16} className="text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary">
            Se generará un backup automático antes de re-cifrar todas las credenciales. Si algo falla,
            no se aplicará ningún cambio.
          </p>
        </div>
        <div className="form-group">
          <label className="label">Passphrase actual</label>
          <input type="password" className="input" value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="form-group">
            <label className="label">Nueva passphrase</label>
            <input type="password" className="input" value={form.next}
              onChange={(e) => setForm({ ...form, next: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="label">Confirmar</label>
            <input type="password" className="input" value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </div>
        </div>
        <button className="btn-primary" onClick={handleChange} disabled={changing}>
          <Key size={14} /> {changing ? 'Cambiando...' : 'Cambiar passphrase'}
        </button>
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
        AuditCheck - Auditoría IT Exhaustiva para MSPs.
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
