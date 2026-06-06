import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Key, Plus, Pencil, Trash2, Loader, Eye, EyeOff,
  Star, Wifi, ArrowLeft, CheckCircle, XCircle, Circle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { credentialsApi, auditsApi } from '../lib/api'
import { CREDENTIAL_TYPES, DEVICE_TYPE_LABELS } from '../lib/utils'
import type { Credential, Device } from '../types'

interface Props {
  isOpen: boolean
  device: Device
  auditId: number
  clientId: number
  onClose: () => void
  onDeviceUpdate: () => void
}

// ── Suggestion logic ────────────────────────────────────────────────────────

const DEVICE_CRED_MAP: Record<string, string> = {
  ilo: 'ilo', idrac: 'idrac', fortigate: 'fortigate',
  esxi: 'vmware', vcenter: 'vmware', vmware_appliance: 'vmware',
  veeam: 'veeam', nas: 'nas', linux: 'ssh', switch: 'ssh', router: 'ssh',
  windows_server: 'windows', windows_workstation: 'windows',
}

const DEVICE_SUGGESTION_LABEL: Record<string, string> = {
  windows_server: 'Windows / RDP',
  windows_workstation: 'Windows / RDP',
  linux: 'SSH',
  esxi: 'VMware ESXi',
  vcenter: 'VMware vCenter',
  vmware_appliance: 'VMware',
  fortigate: 'FortiGate HTTPS',
  veeam: 'Veeam',
  nas: 'NAS',
  ilo: 'HP iLO',
  idrac: 'Dell iDRAC',
  printer: 'HTTP Web',
  switch: 'SSH',
  router: 'SSH',
}

const CRED_TYPE_PORTS: Record<string, number[]> = {
  windows: [3389, 445, 5985],
  ssh: [22],
  vmware: [443, 902],
  veeam: [9443, 9080, 443],
  fortigate: [443, 22],
  ilo: [443, 17988],
  idrac: [443],
  nas: [443, 80],
  snmp: [161],
  database: [1433, 3306, 5432],
}

function suggestCredType(device: Device): string {
  const mapped = DEVICE_CRED_MAP[device.device_type]
  if (mapped) return mapped
  const ports = device.ports.map(p => p.port_number)
  if (ports.includes(22)) return 'ssh'
  if (ports.includes(3389)) return 'windows'
  if (ports.includes(161)) return 'snmp'
  return 'windows'
}

function getTestPort(device: Device, credType: string): number {
  const ports = device.ports.map(p => p.port_number)
  const candidates = CRED_TYPE_PORTS[credType] ?? [443, 80]
  return candidates.find(p => ports.includes(p)) ?? candidates[0]
}

// ── Status icon ─────────────────────────────────────────────────────────────

function CredStatusIcon({ status }: { status: string }) {
  if (status === 'valid') return <CheckCircle size={13} className="text-green-400 shrink-0" />
  if (status === 'invalid') return <XCircle size={13} className="text-red-400 shrink-0" />
  return <Circle size={13} className="text-text-muted/40 shrink-0" />
}

// ── Initial form state ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '', credential_type: 'windows', username: '',
  password: '', host: '', port: '', domain: '', notes: '',
  is_preferred: false,
}

// ── Component ────────────────────────────────────────────────────────────────

export function CredentialQuickPanel({
  isOpen, device, auditId, clientId, onClose, onDeviceUpdate,
}: Props) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [editTarget, setEditTarget] = useState<Credential | null>(null)
  const [showPass, setShowPass] = useState(false)
  const [assigning, setAssigning] = useState<number | null>(null)
  const [testing, setTesting] = useState<number | null>(null)
  const [testResults, setTestResults] = useState<Record<number, { success: boolean; message: string }>>({})
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  const suggestedType = suggestCredType(device)
  const suggestionLabel = DEVICE_SUGGESTION_LABEL[device.device_type]
  const deviceTypeLabel = device.device_type === 'custom' && device.custom_category
    ? device.custom_category
    : (DEVICE_TYPE_LABELS[device.device_type] ?? device.device_type)
  const deviceLabel = device.display_name || device.hostname || device.ip_address

  useEffect(() => {
    if (isOpen) {
      setMode('list')
      setEditTarget(null)
      setTestResults({})
      setConfirmDelete(null)
      setShowPass(false)
    }
  }, [isOpen, device.id])

  const credsQ = useQuery<Credential[]>({
    queryKey: ['client-credentials', clientId],
    queryFn: () => credentialsApi.list(clientId).then(r => r.data),
    enabled: isOpen && clientId > 0,
  })
  const credentials = credsQ.data ?? []

  // ── Invalidate helpers ────────────────────────────────────────────────────

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['client-credentials', clientId] })
    queryClient.invalidateQueries({ queryKey: ['audit-client-credentials', auditId] })
    queryClient.invalidateQueries({ queryKey: ['audit-devices', auditId] })
    onDeviceUpdate()
  }

  // ── Assign / Unassign ─────────────────────────────────────────────────────

  async function handleAssign(credId: number) {
    setAssigning(credId)
    try {
      await auditsApi.updateDevice(auditId, device.id, { credential_id: credId })
      invalidateAll()
      toast.success('Credencial asignada')
    } catch {
      toast.error('Error al asignar la credencial')
    } finally {
      setAssigning(null)
    }
  }

  async function handleUnassign() {
    setAssigning(-1)
    try {
      await auditsApi.updateDevice(auditId, device.id, { credential_id: null })
      invalidateAll()
      toast.success('Credencial desasignada')
    } catch {
      toast.error('Error al desasignar')
    } finally {
      setAssigning(null)
    }
  }

  // ── Test ──────────────────────────────────────────────────────────────────

  async function handleTest(cred: Credential) {
    const port = getTestPort(device, cred.credential_type)
    setTesting(cred.id)
    try {
      const { data } = await credentialsApi.test(cred.id, { host: device.ip_address, port })
      setTestResults(prev => ({ ...prev, [cred.id]: data }))
      if (data.success) toast.success(data.message)
      else toast.error(data.message)
      credsQ.refetch()
    } catch {
      toast.error('Error al probar la credencial')
    } finally {
      setTesting(null)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteMut = useMutation({
    mutationFn: (id: number) => credentialsApi.delete(id),
    onSuccess: () => {
      setConfirmDelete(null)
      toast.success('Credencial eliminada')
      invalidateAll()
    },
    onError: () => toast.error('Error al eliminar la credencial'),
  })

  // ── Create / Edit form ────────────────────────────────────────────────────

  function startCreate() {
    const port = getTestPort(device, suggestedType)
    setForm({ ...EMPTY_FORM, credential_type: suggestedType, host: device.ip_address, port: String(port ?? '') })
    setEditTarget(null)
    setShowPass(false)
    setMode('create')
  }

  function startEdit(cred: Credential) {
    setEditTarget(cred)
    setForm({
      name: cred.name,
      credential_type: cred.credential_type,
      username: cred.username ?? '',
      password: '',
      host: cred.host ?? device.ip_address,
      port: String(cred.port ?? ''),
      domain: cred.domain ?? '',
      notes: cred.notes ?? '',
      is_preferred: cred.is_preferred,
    })
    setShowPass(false)
    setMode('edit')
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        credential_type: form.credential_type,
        username: form.username.trim() || null,
        password: form.password || null,
        host: form.host.trim() || null,
        port: form.port ? Number(form.port) : null,
        domain: form.domain.trim() || null,
        notes: form.notes.trim() || null,
        is_preferred: form.is_preferred,
        client_id: clientId,
      }
      if (mode === 'edit' && editTarget) return credentialsApi.update(editTarget.id, payload)
      return credentialsApi.create(payload)
    },
    onSuccess: async (res) => {
      const savedCred = res.data as Credential
      toast.success(mode === 'edit' ? 'Credencial actualizada' : 'Credencial guardada — contraseña cifrada')

      if (mode === 'create' && !device.credential_id) {
        try {
          await auditsApi.updateDevice(auditId, device.id, { credential_id: savedCred.id })
          toast.success(`Asignada automáticamente a ${device.ip_address}`)
        } catch {}
      }
      invalidateAll()
      setMode('list')
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Error al guardar la credencial')
    },
  })

  async function handleSaveAndTest() {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return }
    try {
      const res = await saveMut.mutateAsync()
      const saved = res.data as Credential
      await handleTest(saved)
    } catch {}
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full z-50 w-full max-w-md bg-surface border-l border-border shadow-2xl flex flex-col overflow-hidden">

        {/* HEADER */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
          {mode === 'list' ? (
            <div className="flex-1 min-w-0 mr-3">
              <div className="flex items-center gap-2">
                <Key size={14} className="text-primary shrink-0" />
                <h2 className="font-semibold text-text-primary text-sm">Credenciales del host</h2>
              </div>
              <p className="font-mono text-base text-primary mt-1">{device.ip_address}</p>
              {deviceLabel !== device.ip_address && (
                <p className="text-xs text-text-muted truncate">{deviceLabel}</p>
              )}
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                <span className="badge badge-info text-[10px]">{deviceTypeLabel}</span>
                {device.ports.slice(0, 6).map(p => (
                  <span
                    key={p.id}
                    className={`text-[10px] font-mono px-1 rounded ${
                      p.is_risky ? 'bg-warning/20 text-warning' : 'bg-surface-2 text-text-muted'
                    }`}
                  >
                    {p.port_number}
                  </span>
                ))}
                {device.ports.length > 6 && (
                  <span className="text-[10px] text-text-muted">+{device.ports.length - 6}</span>
                )}
              </div>
              {suggestionLabel && (
                <p className="text-[11px] text-text-muted mt-1.5">
                  Tipo sugerido: <span className="text-primary font-medium">{suggestionLabel}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setMode('list')} className="btn-ghost p-1.5 text-text-muted">
                <ArrowLeft size={15} />
              </button>
              <h2 className="font-semibold text-sm text-text-primary">
                {mode === 'create' ? 'Nueva credencial' : 'Editar credencial'}
              </h2>
            </div>
          )}
          <button onClick={onClose} className="btn-ghost p-1.5 shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto">

          {/* LIST MODE */}
          {mode === 'list' && (
            <div className="p-4 space-y-2">
              {credsQ.isLoading && (
                <div className="flex justify-center py-10">
                  <Loader size={20} className="animate-spin text-primary/50" />
                </div>
              )}

              {!credsQ.isLoading && credentials.length === 0 && (
                <div className="text-center py-10 text-text-muted">
                  <Key size={32} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Sin credenciales para este cliente</p>
                  <p className="text-xs mt-1 opacity-60">Crea una para comenzar</p>
                </div>
              )}

              {credentials.map(cred => {
                const isAssigned = device.credential_id === cred.id
                const isTesting = testing === cred.id
                const isAssigning = assigning === cred.id
                const testResult = testResults[cred.id]
                const isConfirmingDelete = confirmDelete === cred.id
                const credTypeLabel = CREDENTIAL_TYPES.find(t => t.value === cred.credential_type)?.label ?? cred.credential_type
                const effectiveStatus = testResult ? (testResult.success ? 'valid' : 'invalid') : cred.status

                return (
                  <div
                    key={cred.id}
                    className={`rounded-lg border p-3 transition-colors ${
                      isAssigned
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border bg-surface-2'
                    }`}
                  >
                    {/* Credential header */}
                    <div className="flex items-start gap-2 mb-2.5">
                      <CredStatusIcon status={effectiveStatus} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm text-text-primary leading-tight">{cred.name}</span>
                          {isAssigned && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold shrink-0">
                              Activa
                            </span>
                          )}
                          {cred.is_preferred && (
                            <span title="Preferida"><Star size={11} className="text-amber-400 fill-amber-400 shrink-0" /></span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-1 border border-border text-text-muted">
                            {credTypeLabel}
                          </span>
                          {cred.username && (
                            <span className="text-[11px] font-mono text-text-muted">
                              {cred.domain ? `${cred.domain}\\` : ''}{cred.username}
                            </span>
                          )}
                          {cred.has_password && <span className="text-[10px] text-green-400/80">🔒</span>}
                        </div>
                        {testResult && (
                          <p className={`text-[10px] mt-1 flex items-center gap-1 ${
                            testResult.success ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {testResult.success ? <CheckCircle size={9} /> : <XCircle size={9} />}
                            {testResult.message}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-text-muted flex-1">¿Eliminar esta credencial?</p>
                        <button
                          onClick={() => deleteMut.mutate(cred.id)}
                          disabled={deleteMut.isPending}
                          className="text-[11px] px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                          {deleteMut.isPending ? '...' : 'Eliminar'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-[11px] px-2 py-1 rounded border border-border text-text-muted hover:text-text-primary transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 flex-wrap">
                        {isAssigned ? (
                          <button
                            onClick={handleUnassign}
                            disabled={assigning !== null}
                            className="text-[11px] px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                          >
                            {assigning === -1 ? <Loader size={9} className="animate-spin" /> : 'Desasignar'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAssign(cred.id)}
                            disabled={assigning !== null}
                            className="text-[11px] px-2 py-1 rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors font-medium"
                          >
                            {isAssigning ? <Loader size={9} className="animate-spin" /> : 'Usar esta'}
                          </button>
                        )}
                        <button
                          onClick={() => handleTest(cred)}
                          disabled={isTesting}
                          title={`Probar TCP a ${device.ip_address}:${getTestPort(device, cred.credential_type)}`}
                          className="text-[11px] px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1"
                        >
                          {isTesting ? <Loader size={9} className="animate-spin" /> : <><Wifi size={9} /> Probar</>}
                        </button>
                        <button
                          onClick={() => startEdit(cred)}
                          className="text-[11px] px-2 py-1 rounded border border-border text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
                        >
                          <Pencil size={9} /> Editar
                        </button>
                        <button
                          onClick={() => setConfirmDelete(cred.id)}
                          className="text-[11px] px-1.5 py-1 rounded text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
                          title="Eliminar credencial"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* CREATE / EDIT MODE */}
          {(mode === 'create' || mode === 'edit') && (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">

                <div className="col-span-2">
                  <label className="block text-xs text-text-muted mb-1">Nombre identificativo *</label>
                  <input
                    className="input"
                    placeholder="ej: Admin dominio · SRV01"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-1">Tipo</label>
                  <select
                    className="input"
                    value={form.credential_type}
                    onChange={e => setForm(f => ({ ...f, credential_type: e.target.value }))}
                  >
                    {CREDENTIAL_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-1">Usuario</label>
                  <input
                    className="input"
                    placeholder="username"
                    value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-xs text-text-muted mb-1">Contraseña</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      className="input pr-9"
                      placeholder={mode === 'edit' ? 'Dejar vacío para no cambiar' : 'Se cifra al guardar'}
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                    >
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {mode === 'create' && (
                    <p className="text-[10px] text-text-muted mt-1">Cifrada con AES-128 · nunca en texto plano</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-1">Host / IP</label>
                  <input
                    className="input"
                    value={form.host}
                    onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                    placeholder={device.ip_address}
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-1">Puerto</label>
                  <input
                    className="input"
                    type="number"
                    value={form.port}
                    onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                    placeholder="443"
                  />
                </div>

                {form.credential_type === 'windows' && (
                  <div className="col-span-2">
                    <label className="block text-xs text-text-muted mb-1">Dominio Windows</label>
                    <input
                      className="input"
                      placeholder="EMPRESA.LOCAL"
                      value={form.domain}
                      onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                    />
                  </div>
                )}

                <div className="col-span-2">
                  <label className="block text-xs text-text-muted mb-1">Notas</label>
                  <textarea
                    className="input resize-none"
                    rows={2}
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Información adicional..."
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_preferred}
                  onChange={e => setForm(f => ({ ...f, is_preferred: e.target.checked }))}
                />
                <span className="text-xs text-text-secondary flex items-center gap-1">
                  <Star size={11} className="text-amber-400" /> Marcar como preferida
                </span>
              </label>

              {mode === 'create' && !device.credential_id && (
                <p className="text-[11px] text-primary/80 bg-primary/5 border border-primary/15 rounded px-2.5 py-1.5">
                  Se asignará automáticamente a {device.ip_address} al guardar.
                </p>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="shrink-0 border-t border-border px-4 py-3">
          {mode === 'list' ? (
            <button
              onClick={startCreate}
              className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
            >
              <Plus size={14} /> Nueva credencial
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending || !form.name.trim()}
                  className="btn-primary flex-1 text-sm"
                >
                  {saveMut.isPending ? 'Guardando...' : mode === 'edit' ? 'Actualizar' : 'Guardar'}
                </button>
                <button
                  onClick={handleSaveAndTest}
                  disabled={saveMut.isPending || !form.name.trim()}
                  title="Guardar y probar conectividad TCP"
                  className="btn-secondary px-3 flex items-center gap-1.5 text-sm"
                >
                  <Wifi size={13} /> Probar
                </button>
              </div>
              <button
                onClick={() => setMode('list')}
                disabled={saveMut.isPending}
                className="btn-ghost w-full text-sm text-text-muted"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
