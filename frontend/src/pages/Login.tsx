import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { Logo } from '../components/Logo'

export function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({ username: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username || !form.password) {
      toast.error('Introduce usuario y contraseña')
      return
    }
    setLoading(true)
    try {
      const { data } = await authApi.login(form.username, form.password)
      setAuth(data.access_token, data.user)
      toast.success(`Bienvenido, ${data.user.full_name}`)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error de autenticación')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="lg" showText />
          </div>
          <p className="text-text-secondary text-sm">
            Plataforma profesional de auditoría técnica
          </p>
        </div>

        {/* Card */}
        <div className="card border-border-2">
          <h2 className="text-lg font-semibold text-text-primary mb-6">Iniciar sesión</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group">
              <label className="label">Usuario</label>
              <input
                type="text"
                className="input"
                placeholder="admin"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="form-group">
              <label className="label">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5"
            >
              {loading ? (
                <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
              ) : (
                <LogIn size={16} />
              )}
              {loading ? 'Accediendo...' : 'Acceder'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-text-muted mt-6">
          ÃUDITCHECK — Uso exclusivo para personal autorizado
        </p>
      </div>
    </div>
  )
}
