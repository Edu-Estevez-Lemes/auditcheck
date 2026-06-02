import { useState, useEffect, useRef } from 'react'
import { X, Copy, Eye, EyeOff, Key, ExternalLink, Clock, Info } from 'lucide-react'
import toast from 'react-hot-toast'

export interface LoginProfileData {
  id: number
  name: string
  device_type: string
  username_selector: string | null
  password_selector: string | null
  submit_selector: string | null
  pre_login_path: string | null
  notes: string | null
}

export interface WebCredData {
  credential_name: string
  username: string
  domain: string
  password: string
  has_password: boolean
  login_profile: LoginProfileData | null
}

interface Props {
  isOpen: boolean
  loading: boolean
  url: string
  deviceLabel: string
  data: WebCredData | null
  onClose: () => void
}

const AUTO_CLOSE_SECONDS = 90

export function WebCredentialPanel({ isOpen, loading, url, deviceLabel, data, onClose }: Props) {
  const [showPassword, setShowPassword] = useState(false)
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SECONDS)
  const [showProfile, setShowProfile] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setShowPassword(false)
      setShowProfile(false)
      setCountdown(AUTO_CLOSE_SECONDS)
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    setCountdown(AUTO_CLOSE_SECONDS)
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { onClose(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copiado`, { duration: 2000 })
  }

  const copyBoth = () => {
    if (!data?.username) return
    const user = data.domain ? `${data.domain}\\${data.username}` : data.username
    const text = data.has_password ? `${user}\n${data.password}` : user
    navigator.clipboard.writeText(text)
    toast.success('Usuario y contraseña copiados (dos líneas)', { duration: 2500 })
  }

  const displayUser = data?.domain ? `${data.domain}\\${data.username}` : (data?.username || '')

  const urgencyColor =
    countdown <= 15 ? 'text-red-400' :
    countdown <= 30 ? 'text-amber-400' :
    'text-text-muted'

  return (
    <>
      {/* Backdrop semitransparente */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar panel"
      />

      {/* Panel centrado */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Credenciales web"
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm"
      >
        <div className="bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">

          {/* Cabecera */}
          <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Key size={14} className="text-primary shrink-0" />
              <span className="text-sm font-semibold text-text-primary">Credenciales web</span>
            </div>
            <div className="flex items-center gap-2.5">
              <span
                className={`text-xs font-mono tabular-nums flex items-center gap-1 ${urgencyColor}`}
                title="Cierre automático por seguridad"
              >
                <Clock size={11} />
                {countdown}s
              </span>
              <button
                onClick={onClose}
                className="text-text-muted hover:text-text-primary transition-colors"
                title="Cerrar (Escape)"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* URL destino */}
          <div className="px-4 py-2.5 bg-surface-2/40 border-b border-border/50">
            <div className="flex items-center gap-1.5 text-xs">
              <ExternalLink size={11} className="text-text-muted shrink-0" />
              <span className="font-mono text-primary truncate">{url}</span>
            </div>
            {deviceLabel && (
              <p className="text-xs text-text-muted mt-0.5 pl-4">{deviceLabel}</p>
            )}
          </div>

          {/* Contenido */}
          <div className="p-4 space-y-3.5">
            {loading ? (
              <div className="flex items-center justify-center py-6 gap-2.5 text-text-muted text-sm">
                <span className="animate-spin h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full" />
                Cargando credenciales...
              </div>
            ) : data ? (
              <>
                {/* Nombre de credencial */}
                <p className="text-xs text-text-muted">
                  Credencial:{' '}
                  <span className="text-text-secondary font-medium">{data.credential_name}</span>
                </p>

                {/* Usuario */}
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-muted mb-1">Usuario</p>
                    <div className="font-mono text-sm text-text-primary bg-surface-2 rounded-lg px-3 py-2 truncate select-all">
                      {displayUser || <span className="text-text-muted/60 italic">(sin usuario)</span>}
                    </div>
                  </div>
                  {displayUser && (
                    <button
                      onClick={() => copy(displayUser, 'Usuario')}
                      className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                      title="Copiar usuario"
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </div>

                {/* Contraseña */}
                {data.has_password ? (
                  <div className="flex items-end gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-muted mb-1">Contraseña</p>
                      <div className="font-mono text-sm text-text-primary bg-surface-2 rounded-lg px-3 py-2 truncate select-all">
                        {showPassword
                          ? <span>{data.password}</span>
                          : <span className="tracking-widest text-text-muted">••••••••••</span>
                        }
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setShowPassword(p => !p)}
                        className="p-2 rounded-lg bg-surface-2 text-text-muted hover:text-text-primary transition-colors"
                        title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        onClick={() => copy(data.password, 'Contraseña')}
                        className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title="Copiar contraseña"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted italic">Sin contraseña guardada</p>
                )}

                {/* Perfil de login */}
                {data.login_profile && (
                  <div className="rounded-lg border border-indigo-500/25 overflow-hidden">
                    <button
                      onClick={() => setShowProfile(p => !p)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/15 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Info size={11} />
                        Perfil: <strong>{data.login_profile.name}</strong>
                      </span>
                      <span className="text-indigo-400/60">{showProfile ? '▲' : '▼'}</span>
                    </button>
                    {showProfile && (
                      <div className="px-3 py-2.5 space-y-1.5 text-xs bg-indigo-500/5 text-indigo-300">
                        {data.login_profile.pre_login_path && (
                          <p>
                            <span className="text-indigo-400/70">Ruta login: </span>
                            <code className="font-mono text-[11px]">{data.login_profile.pre_login_path}</code>
                          </p>
                        )}
                        {data.login_profile.username_selector && (
                          <p>
                            <span className="text-indigo-400/70">Campo usuario: </span>
                            <code className="font-mono text-[11px]">{data.login_profile.username_selector}</code>
                          </p>
                        )}
                        {data.login_profile.password_selector && (
                          <p>
                            <span className="text-indigo-400/70">Campo contraseña: </span>
                            <code className="font-mono text-[11px]">{data.login_profile.password_selector}</code>
                          </p>
                        )}
                        {data.login_profile.notes && (
                          <p className="text-indigo-400/50 italic pt-0.5 border-t border-indigo-500/20">
                            {data.login_profile.notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-text-muted text-center py-4">
                No se encontraron credenciales para este dispositivo
              </p>
            )}
          </div>

          {/* Pie — acciones rápidas */}
          {!loading && data && (
            <div className="px-4 pb-4 flex gap-2">
              {(displayUser || data.has_password) && (
                <button
                  onClick={copyBoth}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                  title="Copia usuario y contraseña separados por línea"
                >
                  <Copy size={12} /> Copiar ambos
                </button>
              )}
              <button
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-surface-2 text-text-muted hover:text-text-primary hover:bg-border transition-colors"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
