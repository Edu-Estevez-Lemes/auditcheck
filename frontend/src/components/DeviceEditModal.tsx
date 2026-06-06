import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save, X, Key } from 'lucide-react'
import toast from 'react-hot-toast'
import { auditsApi } from '../lib/api'
import type { Credential, Device, DeviceUpdate } from '../types'
import { DEVICE_TYPE_OPTIONS, DEVICE_TYPE_LABELS } from '../lib/utils'

interface Props {
  device: Device
  auditId: number
  onClose: () => void
}

export function DeviceEditModal({ device, auditId, onClose }: Props) {
  const queryClient = useQueryClient()

  const initialType = device.device_type === 'custom' || !DEVICE_TYPE_OPTIONS.find(o => o.value === device.device_type && o.value !== 'custom')
    ? (DEVICE_TYPE_OPTIONS.find(o => o.value === device.device_type) ? device.device_type : 'custom')
    : device.device_type

  const [form, setForm] = useState<DeviceUpdate & { _customCategory: string }>({
    display_name:    device.display_name ?? '',
    hostname:        device.hostname ?? '',
    device_type:     initialType,
    custom_category: device.custom_category ?? '',
    manufacturer:    device.manufacturer ?? '',
    os_type:         device.os_type ?? '',
    location:        device.location ?? '',
    description:     device.description ?? '',
    observations:    device.observations ?? '',
    credential_id:   device.credential_id ?? null,
    _customCategory: device.custom_category ?? '',
  })
  const [saving, setSaving] = useState(false)

  const credsQ = useQuery<Credential[]>({
    queryKey: ['audit-client-credentials', auditId],
    queryFn: () => auditsApi.getClientCredentials(auditId).then(r => r.data),
  })
  const credentials = credsQ.data ?? []

  const isCustomType = form.device_type === 'custom'

  function set(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload: DeviceUpdate = {
        display_name:    form.display_name || undefined,
        hostname:        form.hostname     || undefined,
        device_type:     isCustomType ? 'custom' : (form.device_type || undefined),
        custom_category: isCustomType ? (form._customCategory || undefined) : undefined,
        manufacturer:    form.manufacturer || undefined,
        os_type:         form.os_type      || undefined,
        location:        form.location     || undefined,
        description:     form.description  || undefined,
        observations:    form.observations || undefined,
        credential_id:   form.credential_id ?? null,
      }
      await auditsApi.updateDevice(auditId, device.id, payload)
      await queryClient.invalidateQueries({ queryKey: ['audit-devices', auditId] })
      toast.success('Dispositivo actualizado')
      onClose()
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const displayLabel = DEVICE_TYPE_LABELS[device.device_type] ?? device.device_type

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-border"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-text-primary">Editar dispositivo</h2>
            <p className="text-xs text-text-muted font-mono mt-0.5">{device.ip_address} · {displayLabel}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Identificación */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Identificación</h3>
            <div className="space-y-3">
              <Field label="Nombre visible">
                <input
                  className="input"
                  value={form.display_name ?? ''}
                  onChange={e => set('display_name', e.target.value)}
                  placeholder="Ej: DC01 - Controlador de dominio"
                />
              </Field>
              <Field label="Hostname">
                <input
                  className="input"
                  value={form.hostname ?? ''}
                  onChange={e => set('hostname', e.target.value)}
                  placeholder="Ej: DC01.gordillo.local"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2 text-xs text-text-muted">
                <div><span className="text-text-secondary">IP:</span> <span className="font-mono">{device.ip_address}</span></div>
                <div><span className="text-text-secondary">MAC:</span> <span className="font-mono">{device.mac_address || 'No disponible'}</span></div>
              </div>
            </div>
          </section>

          {/* Clasificación */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Clasificación</h3>
            <div className="space-y-3">
              <Field label="Tipo de dispositivo">
                <select
                  className="input"
                  value={form.device_type ?? 'unknown'}
                  onChange={e => set('device_type', e.target.value)}
                >
                  {DEVICE_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Field>
              {isCustomType && (
                <Field label="Categoría personalizada">
                  <input
                    className="input"
                    value={form._customCategory ?? ''}
                    onChange={e => set('_customCategory', e.target.value)}
                    placeholder="Ej: Cámara IP, SAI, VoIP, PLC..."
                    autoFocus
                  />
                </Field>
              )}
              <Field label="Fabricante">
                <input
                  className="input"
                  value={form.manufacturer ?? ''}
                  onChange={e => set('manufacturer', e.target.value)}
                  placeholder="Ej: Cisco, Dell, HPE, Fortinet..."
                />
              </Field>
              <Field label="Sistema operativo">
                <input
                  className="input"
                  value={form.os_type ?? ''}
                  onChange={e => set('os_type', e.target.value)}
                  placeholder="Ej: Windows Server 2022, FortiOS 7.4..."
                />
              </Field>
            </div>
          </section>

          {/* Credencial de acceso */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Key size={11} /> Credencial de acceso
            </h3>
            <Field label="Credencial asignada">
              <select
                className="input"
                value={form.credential_id ?? ''}
                onChange={e => setForm(prev => ({
                  ...prev,
                  credential_id: e.target.value === '' ? null : Number(e.target.value),
                }))}
              >
                <option value="">Sin credencial</option>
                {credentials.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.username ? ` · ${c.domain ? `${c.domain}\\` : ''}${c.username}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            {form.credential_id && (() => {
              const cred = credentials.find(c => c.id === form.credential_id)
              return cred ? (
                <p className="text-xs text-text-muted mt-1.5">
                  Tipo: <span className="text-text-secondary">{cred.credential_type}</span>
                  {cred.host && <> · Host: <span className="font-mono text-text-secondary">{cred.host}</span></>}
                  {' · El usuario y dominio se pre-rellenarán en el archivo RDP. La contraseña debe introducirse manualmente (limitación de seguridad de Windows).'}
                </p>
              ) : null
            })()}
            {credentials.length === 0 && !credsQ.isLoading && (
              <p className="text-xs text-text-muted mt-1.5">
                Este cliente no tiene credenciales. Añádelas en la ficha del cliente.
              </p>
            )}
          </section>

          {/* Ubicación y notas */}
          <section>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Ubicación y notas</h3>
            <div className="space-y-3">
              <Field label="Ubicación">
                <input
                  className="input"
                  value={form.location ?? ''}
                  onChange={e => set('location', e.target.value)}
                  placeholder="Ej: Rack principal - CPD"
                />
              </Field>
              <Field label="Descripción">
                <textarea
                  className="input resize-none"
                  rows={2}
                  value={form.description ?? ''}
                  onChange={e => set('description', e.target.value)}
                  placeholder="Descripción breve del dispositivo..."
                />
              </Field>
              <Field label="Observaciones">
                <textarea
                  className="input resize-none"
                  rows={3}
                  value={form.observations ?? ''}
                  onChange={e => set('observations', e.target.value)}
                  placeholder="Notas técnicas, pendientes, incidencias..."
                />
              </Field>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            <Save size={14} />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      {children}
    </div>
  )
}
