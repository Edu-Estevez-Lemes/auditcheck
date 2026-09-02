import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, User, Users, Key, Info, Upload, Shield, History, RotateCcw, Eye, Copy, Lock, ShieldAlert, Database, ListChecks, FileEdit, Trash2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi, auditLogApi, appBrandingApi, uiThemeApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useVaultStore } from '../store/vaultStore'
import { Modal } from '../components/Modal'
import { Logo } from '../components/Logo'
import { Avatar, AVATAR_PRESETS } from '../components/Avatar'
import { DatabaseTab } from '../components/database/DatabaseTab'
import { ChecklistSettingsTab } from '../components/review/ChecklistSettingsTab'
import { ReportBrandingTab } from '../components/reports/ReportBrandingTab'
import type { AuditLogEntry, UserRole, UIThemeConfig } from '../types'

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
  const [avatarBusy, setAvatarBusy] = useState(false)

  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [changingPw, setChangingPw] = useState(false)

  const handlePickPreset = async (key: string) => {
    setAvatarBusy(true)
    try {
      const { data } = await authApi.setAvatarPreset(key)
      updateUser(data)
    } catch { toast.error('Error al guardar el avatar') }
    finally { setAvatarBusy(false) }
  }

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede superar 5 MB')
      e.target.value = ''
      return
    }
    setAvatarBusy(true)
    try {
      const { data } = await authApi.uploadAvatar(file)
      updateUser(data)
      toast.success('Avatar actualizado')
    } catch {
      toast.error('Error al subir el avatar')
    } finally {
      setAvatarBusy(false)
      e.target.value = ''
    }
  }

  const handleRemoveAvatar = async () => {
    setAvatarBusy(true)
    try {
      const { data } = await authApi.deleteAvatar()
      updateUser(data)
    } catch { toast.error('Error al quitar el avatar') }
    finally { setAvatarBusy(false) }
  }

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
        <h3 className="section-title">Avatar</h3>
        <div className="flex items-center gap-4">
          <Avatar user={user} size={64} />
          <div className="flex-1 flex flex-wrap items-center gap-2">
            <label className="btn-secondary cursor-pointer text-xs">
              <Upload size={13} /> Subir imagen
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
                onChange={handleUploadAvatar} disabled={avatarBusy} />
            </label>
            {user?.avatar && (
              <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={handleRemoveAvatar} disabled={avatarBusy}>
                <Trash2 size={13} /> Quitar
              </button>
            )}
            {avatarBusy && <Loader2 size={14} className="animate-spin text-text-muted" />}
          </div>
        </div>
        <p className="text-xs text-text-muted">Foto o GIF, máximo 5 MB. O elige uno de los predefinidos:</p>
        <div className="flex flex-wrap gap-2">
          {AVATAR_PRESETS.map(({ key, icon: Icon, bg }) => {
            const active = user?.avatar === `preset:${key}`
            return (
              <button
                key={key}
                onClick={() => handlePickPreset(key)}
                disabled={avatarBusy}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  active ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : 'opacity-80 hover:opacity-100'
                }`}
                style={{ background: bg }}
                title={key}
              >
                <Icon size={18} color="white" />
              </button>
            )
          })}
        </div>
      </div>

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
  avatar?: string | null
  updated_at?: string
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
          <thead><tr>{['', 'Usuario', 'Nombre', 'Email', 'Rol', 'Estado', ''].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><Avatar user={u} size={28} /></td>
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

const UI_THEME_EMPTY: UIThemeConfig = {
  dark_background: null, dark_text: null, dark_accent: null,
  light_background: null, light_text: null, light_accent: null,
}

// Paleta violeta por defecto de index.css — solo para mostrar algo coherente
// en el selector de color y el placeholder cuando el campo no está personalizado.
const UI_THEME_FALLBACK: Record<'dark' | 'light', { background: string; text: string; accent: string }> = {
  dark: { background: '0E0C14', text: 'EDE9FE', accent: '8B5CF6' },
  light: { background: 'F5F3FF', text: '1E0B3E', accent: '7C3AED' },
}

const UI_THEME_FIELDS: { field: 'background' | 'text' | 'accent'; label: string; desc: string }[] = [
  { field: 'background', label: 'Fondo', desc: 'Fondo general de la app (las tarjetas y superficies se derivan de este color).' },
  { field: 'text', label: 'Texto', desc: 'Texto principal (los tonos secundario y atenuado se derivan de este).' },
  { field: 'accent', label: 'Acento', desc: 'Botones, enlaces y elementos destacados; también colorea la cabecera del menú lateral.' },
]

/** Mensaje de error del backend si lo trae: string (HTTPException) o, en un 422 de
 * Pydantic, una lista de errores de validación — si no, un genérico. */
function apiErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string }
    if (typeof first?.msg === 'string') return first.msg.replace(/^Value error,\s*/, '')
  }
  return fallback
}

const HEX_RE = /^[0-9A-Fa-f]{6}$/
const UI_THEME_FIELD_LABELS: Record<keyof UIThemeConfig, string> = {
  dark_background: 'Fondo (oscuro)', dark_text: 'Texto (oscuro)', dark_accent: 'Acento (oscuro)',
  light_background: 'Fondo (claro)', light_text: 'Texto (claro)', light_accent: 'Acento (claro)',
}

/** null si todos los colores son válidos (o están vacíos); si no, el mensaje del primero inválido. */
function validateUiTheme(form: UIThemeConfig): string | null {
  for (const key of Object.keys(form) as (keyof UIThemeConfig)[]) {
    const v = form[key]
    if (v && !HEX_RE.test(v)) {
      return `Color "${UI_THEME_FIELD_LABELS[key]}" inválido: debe ser un hexadecimal de 6 dígitos (ej. 7C3AED).`
    }
  }
  return null
}

/** URL de objeto para previsualizar un File elegido pero aún sin guardar; se revoca sola al cambiar/desmontar. */
function usePreviewUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) { setUrl(null); return }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  return url
}

function BrandingTab() {
  const qc = useQueryClient()
  const [logoBust, setLogoBust] = useState(Date.now())
  const [iconBust, setIconBust] = useState(Date.now())
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [form, setForm] = useState<UIThemeConfig>(UI_THEME_EMPTY)

  const { data } = useQuery<UIThemeConfig>({
    queryKey: ['ui-theme-config'],
    queryFn: () => uiThemeApi.getConfig().then((r) => r.data),
  })

  useEffect(() => { if (data) setForm(data) }, [data])

  // Object URLs de vista previa local para el logo/icono elegidos y todavía sin
  // guardar; se liberan al cambiar de archivo o desmontar para no fugar memoria.
  const logoPreviewUrl = usePreviewUrl(logoFile)
  const iconPreviewUrl = usePreviewUrl(iconFile)

  const saveAllMut = useMutation({
    mutationFn: async () => {
      if (logoFile) await appBrandingApi.uploadLogo(logoFile)
      if (iconFile) await appBrandingApi.uploadIcon(iconFile)
      await uiThemeApi.updateConfig(form)
    },
    onSuccess: () => {
      toast.success('Identidad visual guardada')
      if (logoFile) { setLogoFile(null); setLogoBust(Date.now()) }
      if (iconFile) { setIconFile(null); setIconBust(Date.now()) }
      qc.invalidateQueries({ queryKey: ['ui-theme-config'] })
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Error al guardar identidad visual')),
  })

  const handleSelectFile = (type: 'logo' | 'icon') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (type === 'logo') setLogoFile(file)
    else setIconFile(file)
  }

  const handleSaveAll = () => {
    const error = validateUiTheme(form)
    if (error) { toast.error(error); return }
    saveAllMut.mutate()
  }

  const setColor = (mode: 'dark' | 'light', field: 'background' | 'text' | 'accent', value: string) => {
    const key = `${mode}_${field}` as keyof UIThemeConfig
    setForm((prev) => ({ ...prev, [key]: value.replace(/^#/, '').toUpperCase() }))
  }

  const resetTheme = (mode: 'dark' | 'light') => {
    setForm((prev) => ({
      ...prev,
      [`${mode}_background`]: null, [`${mode}_text`]: null, [`${mode}_accent`]: null,
    }))
  }

  const renderThemeSection = (mode: 'dark' | 'light', title: string) => {
    const fallback = UI_THEME_FALLBACK[mode]
    return (
      <div className="card space-y-4">
        <h3 className="section-title">{title}</h3>
        <div className="space-y-3">
          {UI_THEME_FIELDS.map(({ field, label, desc }) => {
            const key = `${mode}_${field}` as keyof UIThemeConfig
            const current = form[key]
            return (
              <div key={field} className="flex items-center gap-3">
                <input
                  type="color"
                  value={`#${current ?? fallback[field]}`}
                  onChange={(e) => setColor(mode, field, e.target.value)}
                  className="w-10 h-10 rounded border border-border bg-transparent cursor-pointer shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{label}</p>
                  <p className="text-xs text-text-muted">{desc}</p>
                </div>
                <input
                  type="text"
                  value={current ?? ''}
                  placeholder={fallback[field]}
                  onChange={(e) => setColor(mode, field, e.target.value)}
                  maxLength={6}
                  className="input w-24 text-sm font-mono uppercase shrink-0"
                />
              </div>
            )
          })}
        </div>
        <button onClick={() => resetTheme(mode)} className="btn-ghost text-xs flex items-center gap-1.5 pt-2 border-t border-border w-full">
          <RotateCcw size={13} /> Restaurar valores por defecto
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="card max-w-lg space-y-6">
        <h3 className="section-title">Logo e icono</h3>
        <p className="text-sm text-text-muted">
          Comunes a modo oscuro y claro. Elige un archivo nuevo y pulsa <strong>Guardar</strong> abajo para aplicarlo;
          hasta entonces solo es una vista previa.
        </p>
        <div className="space-y-4">
          {[
            { type: 'logo' as const, label: 'Logo principal', desc: 'Aparece en Login, Dashboard, Navbar. PNG recomendado, fondo transparente.', bust: logoBust, file: logoFile, previewUrl: logoPreviewUrl },
            { type: 'icon' as const, label: 'Icono de aplicación', desc: 'Usado como favicon y en la barra de título. PNG cuadrado (min 64x64).', bust: iconBust, file: iconFile, previewUrl: iconPreviewUrl },
          ].map(({ type, label, desc, bust, file, previewUrl }) => (
            <div key={type} className="flex items-center gap-4 p-4 bg-surface-2 rounded-lg border border-border">
              <img
                key={previewUrl ?? bust}
                src={previewUrl ?? `/api/v1/branding/${type}?t=${bust}`}
                alt={label}
                className="h-12 w-12 object-contain bg-white rounded p-1 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
              />
              <div className="flex-1">
                <p className="font-medium text-text-primary text-sm">{label}</p>
                <p className="text-xs text-text-muted mt-0.5">{file ? `Pendiente de guardar: ${file.name}` : desc}</p>
              </div>
              <label className="btn-secondary cursor-pointer shrink-0">
                <Upload size={13} /> Elegir
                <input type="file" accept="image/png" className="hidden" onChange={handleSelectFile(type)} />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
        {renderThemeSection('dark', 'Colores — modo oscuro')}
        {renderThemeSection('light', 'Colores — modo claro')}
      </div>

      <div className="flex justify-end max-w-4xl">
        <button
          onClick={handleSaveAll}
          disabled={saveAllMut.isPending}
          className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40"
        >
          {saveAllMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar
        </button>
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
