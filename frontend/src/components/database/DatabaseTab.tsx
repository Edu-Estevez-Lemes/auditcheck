import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Database, Save, Upload, Download, FolderOpen, ShieldAlert, Lock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { databaseApi, clientsApi } from '../../lib/api'
import { Modal } from '../Modal'
import type { ClientSummary } from '../../types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function DatabaseTab() {
  const qc = useQueryClient()
  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const { data: info } = useQuery({
    queryKey: ['database-info'],
    queryFn: () => databaseApi.info().then((r) => r.data),
  })

  const backupMut = useMutation({
    mutationFn: () => databaseApi.createBackup(),
    onSuccess: () => {
      toast.success('Backup creado')
      qc.invalidateQueries({ queryKey: ['database-info'] })
    },
    onError: () => toast.error('Error al crear el backup'),
  })

  const openFolder = async (which: 'backups' | 'exports') => {
    try {
      await (which === 'backups' ? databaseApi.openBackupsFolder() : databaseApi.openExportsFolder())
    } catch {
      toast.error('No se pudo abrir la carpeta')
    }
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <h3 className="section-title flex items-center gap-2"><Database size={16} /> Base de datos</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoRow label="Ruta" value={info?.db_path ?? '—'} mono />
          <InfoRow label="Tamaño" value={info ? formatBytes(info.db_size) : '—'} />
          <InfoRow label="Clientes" value={info?.clients_count ?? '—'} />
          <InfoRow label="Auditorías" value={info?.audits_count ?? '—'} />
          <InfoRow label="Dispositivos" value={info?.devices_count ?? '—'} />
          <InfoRow label="Hallazgos" value={info?.findings_count ?? '—'} />
          <InfoRow label="Último backup" value={info?.last_backup_at ? new Date(info.last_backup_at).toLocaleString() : 'Nunca'} />
          <InfoRow label="Espacio en backups" value={info ? `${formatBytes(info.backups_total_size)} (${info.backups_count})` : '—'} />
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="section-title">Acciones</h3>
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" onClick={() => backupMut.mutate()} disabled={backupMut.isPending}>
            <Save size={14} /> {backupMut.isPending ? 'Creando...' : 'Crear backup ahora'}
          </button>
          <button className="btn-secondary" onClick={() => setShowExport(true)}>
            <Download size={14} /> Exportar base de datos
          </button>
          <button className="btn-secondary" onClick={() => setShowImport(true)}>
            <Upload size={14} /> Importar / Restaurar
          </button>
          <button className="btn-ghost" onClick={() => openFolder('backups')}>
            <FolderOpen size={14} /> Carpeta de backups
          </button>
          <button className="btn-ghost" onClick={() => openFolder('exports')}>
            <FolderOpen size={14} /> Carpeta de exportaciones
          </button>
        </div>
      </div>

      <ExportModal open={showExport} onClose={() => setShowExport(false)} />
      <ImportModal open={showImport} onClose={() => setShowImport(false)} onDone={() => qc.invalidateQueries({ queryKey: ['database-info'] })} />
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-border/50">
      <span className="text-text-muted">{label}</span>
      <span className={`text-text-primary text-right truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  )
}

function ExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [scope, setScope] = useState<'full' | 'selective'>('full')
  const [selectedClients, setSelectedClients] = useState<number[]>([])
  const [includeCredentials, setIncludeCredentials] = useState(true)
  const [passwordMode, setPasswordMode] = useState<'vault' | 'custom'>('vault')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: clients = [] } = useQuery<ClientSummary[]>({
    queryKey: ['clients-summary-export'],
    queryFn: () => clientsApi.list().then((r) => r.data),
    enabled: open && scope === 'selective',
  })

  const reset = () => {
    setScope('full'); setSelectedClients([]); setIncludeCredentials(true)
    setPasswordMode('vault'); setPassword(''); setConfirmPassword('')
  }

  const handleExport = async () => {
    if (password.length < 12) {
      toast.error('La contraseña debe tener al menos 12 caracteres')
      return
    }
    if (passwordMode === 'custom' && password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return
    }
    if (scope === 'selective' && selectedClients.length === 0) {
      toast.error('Selecciona al menos un cliente')
      return
    }
    setLoading(true)
    try {
      const res = await databaseApi.export({
        client_ids: scope === 'full' ? null : selectedClients,
        include_credentials: includeCredentials,
        password_mode: passwordMode,
        password,
        confirm_password: passwordMode === 'custom' ? confirmPassword : undefined,
      })
      const disposition = res.headers['content-disposition'] as string | undefined
      const match = disposition?.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] ?? `auditcheck_export_${Date.now()}.acbk`
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
      toast.success('Exportación generada')
      reset()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al exportar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Exportar base de datos" size="lg">
      <div className="space-y-4">
        <div className="form-group">
          <label className="label">Alcance</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={scope === 'full'} onChange={() => setScope('full')} />
              <span className="text-sm">Exportación completa</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={scope === 'selective'} onChange={() => setScope('selective')} />
              <span className="text-sm">Clientes seleccionados</span>
            </label>
          </div>
        </div>

        {scope === 'selective' && (
          <div className="max-h-40 overflow-y-auto border border-border rounded-lg p-2 space-y-1">
            {clients.map((c) => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm px-2 py-1 hover:bg-surface-2 rounded">
                <input
                  type="checkbox"
                  checked={selectedClients.includes(c.id)}
                  onChange={(e) => setSelectedClients(
                    e.target.checked ? [...selectedClients, c.id] : selectedClients.filter((id) => id !== c.id)
                  )}
                />
                {c.name}
              </label>
            ))}
            {clients.length === 0 && <p className="text-xs text-text-muted p-2">Sin clientes</p>}
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={includeCredentials} onChange={(e) => setIncludeCredentials(e.target.checked)} />
          <span className="text-sm text-text-secondary">Incluir credenciales cifradas</span>
        </label>

        <div className="form-group">
          <label className="label">Contraseña de cifrado</label>
          <div className="flex gap-3 mb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={passwordMode === 'vault'} onChange={() => setPasswordMode('vault')} />
              <span className="text-sm">Passphrase maestra del vault</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={passwordMode === 'custom'} onChange={() => setPasswordMode('custom')} />
              <span className="text-sm">Contraseña específica para este export</span>
            </label>
          </div>
          <input type="password" className="input" placeholder="Mínimo 12 caracteres"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {passwordMode === 'custom' && (
            <input type="password" className="input mt-2" placeholder="Confirmar contraseña"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          )}
        </div>

        <button className="btn-primary w-full justify-center" onClick={handleExport} disabled={loading}>
          <Download size={14} /> {loading ? 'Generando...' : 'Exportar'}
        </button>
      </div>
    </Modal>
  )
}

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
  const [mode, setMode] = useState<'restore' | 'merge' | 'replace'>('merge')
  const [includeCredentials, setIncludeCredentials] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmWord, setConfirmWord] = useState('')
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setFile(null); setPreview(null); setMode('merge'); setIncludeCredentials(true)
    setPassword(''); setConfirmWord('')
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(null)
    try {
      const { data } = await databaseApi.importPreview(f)
      setPreview(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Fichero .acbk inválido')
      setFile(null)
    }
  }

  const handleConfirm = async () => {
    if (!file) return
    if (mode === 'restore' && confirmWord !== 'RESTAURAR') {
      toast.error('Escribe la palabra RESTAURAR para confirmar')
      return
    }
    setLoading(true)
    try {
      const { data } = await databaseApi.importConfirm(file, {
        password, mode, include_credentials: includeCredentials,
        confirm_word: mode === 'restore' ? confirmWord : undefined,
      })
      toast.success(`Importación completada. Backup previo en ${data.backup_path}`)
      reset()
      onDone()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error al importar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Importar / Restaurar base de datos" size="lg">
      <div className="space-y-4">
        {!file && (
          <label className="btn-secondary cursor-pointer w-full justify-center py-6 border-2 border-dashed border-border">
            <Upload size={16} /> Seleccionar fichero .acbk
            <input type="file" accept=".acbk" className="hidden" onChange={handleFile} />
          </label>
        )}

        {file && preview && (
          <>
            <div className="bg-surface-2 border border-border rounded-lg p-3 text-sm space-y-1">
              <p><span className="text-text-muted">Exportado por:</span> {String(preview.exported_by)}</p>
              <p><span className="text-text-muted">Fecha:</span> {new Date(String(preview.exported_at)).toLocaleString()}</p>
              <p><span className="text-text-muted">Contenido:</span> {String(preview.clients_count)} clientes, {String(preview.audits_count)} auditorías, {String(preview.devices_count)} dispositivos</p>
              <p><span className="text-text-muted">Incluye credenciales:</span> {preview.includes_credentials ? 'sí' : 'no'}</p>
              <p><span className="text-text-muted">Tipo:</span> {preview.export_type === 'full' ? 'exportación completa' : 'exportación selectiva'}</p>
            </div>

            {preview.includes_credentials && (
              <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
                <Lock size={14} className="text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-text-secondary">
                  Las credenciales de este fichero requieren la passphrase maestra con la que fueron
                  cifradas originalmente. Si no coincide con la de este equipo, no se podrán descifrar.
                </p>
              </div>
            )}

            <div className="form-group">
              <label className="label">Modo de importación</label>
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="merge">Fusionar (añade clientes nuevos, no toca los existentes)</option>
                <option value="replace">Reemplazar coincidentes (sobrescribe por CIF/NIF)</option>
                <option value="restore" disabled={preview.export_type !== 'full'}>
                  Restaurar completa (reemplaza toda la BD){preview.export_type !== 'full' ? ' — requiere exportación completa' : ''}
                </option>
              </select>
            </div>

            {mode === 'restore' && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <ShieldAlert size={14} className="text-danger shrink-0 mt-0.5" />
                  <p className="text-xs text-text-secondary">
                    Se perderá todo el contenido actual de la base de datos. Se generará un backup
                    automático antes de continuar. Escribe <strong>RESTAURAR</strong> para confirmar.
                  </p>
                </div>
                <input type="text" className="input" placeholder="RESTAURAR"
                  value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} />
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includeCredentials} onChange={(e) => setIncludeCredentials(e.target.checked)} />
              <span className="text-sm text-text-secondary">Importar credenciales cifradas incluidas en el fichero</span>
            </label>

            <div className="form-group">
              <label className="label">Contraseña de descifrado del fichero</label>
              <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <div className="flex gap-3">
              <button className="btn-primary" onClick={handleConfirm} disabled={loading || !password}>
                {loading ? 'Importando...' : 'Confirmar importación'}
              </button>
              <button className="btn-secondary" onClick={reset}>Elegir otro fichero</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
