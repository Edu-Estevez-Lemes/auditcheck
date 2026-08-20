import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { Logo } from '../components/Logo'

export function Setup() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({ email: '', full_name: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email || !form.full_name || !form.password) {
      toast.error('Rellena todos los campos')
      return
    }
    if (form.password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (form.password !== form.confirm) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/auth/bootstrap', {
        email: form.email,
        full_name: form.full_name,
        password: form.password,
      })
      setAuth(data.access_token, data.user)
      toast.success('Superadmin creado correctamente')
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al crear el usuario inicial')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="lg" showText />
          </div>
          <p className="text-text-secondary text-sm">Configuración inicial — crea la cuenta superadmin</p>
        </div>

        <div className="card border-border-2">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={18} className="text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">Primer arranque</h2>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="label">Nombre completo</label>
              <input type="text" className="input" value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoFocus />
            </div>
            <div className="form-group">
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Contraseña</label>
              <input type="password" className="input" placeholder="Mínimo 8 caracteres" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="label">Confirmar contraseña</label>
              <input type="password" className="input" value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? 'Creando...' : 'Crear cuenta superadmin'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
