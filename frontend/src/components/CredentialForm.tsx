import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { credentialsApi } from '../lib/api'
import { CREDENTIAL_TYPES } from '../lib/utils'
import type { Credential } from '../types'

interface Props {
  clientId?: number
  initialData?: Credential
  onSuccess: () => void
  onCancel: () => void
}

export function CredentialForm({ clientId, initialData, onSuccess, onCancel }: Props) {
  const isEdit = !!initialData?.id
  const [showPass, setShowPass] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    name: initialData?.name ?? '',
    credential_type: initialData?.credential_type ?? 'windows',
    username: initialData?.username ?? '',
    password: '',
    host: initialData?.host ?? '',
    port: initialData?.port != null ? String(initialData.port) : '',
    domain: initialData?.domain ?? '',
    notes: initialData?.notes ?? '',
    is_preferred: initialData?.is_preferred ?? false,
  })

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'El nombre es obligatorio'
    if (form.port && isNaN(Number(form.port))) errs.port = 'El puerto debe ser un número'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const mut = useMutation({
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
      }
      return isEdit
        ? credentialsApi.update(initialData!.id, payload)
        : credentialsApi.create({ ...payload, client_id: clientId ?? null })
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Credencial actualizada' : 'Credencial guardada — contraseña cifrada')
      onSuccess()
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Error al guardar la credencial')
    },
  })

  function handleSubmit() {
    if (!validate()) return
    mut.mutate()
  }

  function field(name: string, value: string, onChange: (v: string) => void, props?: object) {
    return (
      <div className="form-group">
        <input
          className={`input ${errors[name] ? 'border-danger' : ''}`}
          value={value}
          onChange={(e) => { onChange(e.target.value); setErrors(prev => ({ ...prev, [name]: '' })) }}
          {...props}
        />
        {errors[name] && <p className="text-xs text-danger mt-1">{errors[name]}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {/* Nombre */}
        <div className="form-group col-span-2">
          <label className="label">Nombre identificativo *</label>
          <input
            className={`input ${errors.name ? 'border-danger' : ''}`}
            placeholder="ej: Dominio Gordillo · admin"
            value={form.name}
            onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors(p => ({ ...p, name: '' })) }}
          />
          {errors.name && <p className="text-xs text-danger mt-1">{errors.name}</p>}
        </div>

        {/* Tipo */}
        <div className="form-group">
          <label className="label">Tipo *</label>
          <select className="input" value={form.credential_type}
            onChange={(e) => setForm({ ...form, credential_type: e.target.value })}>
            {CREDENTIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Usuario */}
        <div className="form-group">
          <label className="label">Usuario</label>
          <input className="input" placeholder="username" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>

        {/* Contraseña */}
        <div className="form-group col-span-2">
          <label className="label">Contraseña</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              className="input pr-10"
              placeholder={isEdit ? 'Dejar vacío para no cambiar' : 'Se cifra al guardar'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1">
            {isEdit ? 'Solo rellena este campo si quieres cambiar la contraseña actual' : 'La contraseña se cifra con AES-128 antes de guardarse'}
          </p>
        </div>

        {/* Host */}
        <div className="form-group">
          <label className="label">Host / IP</label>
          <input className="input" placeholder="192.168.1.1 ó servidor.local" value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })} />
        </div>

        {/* Puerto */}
        <div className="form-group">
          <label className="label">Puerto</label>
          <input
            className={`input ${errors.port ? 'border-danger' : ''}`}
            type="number" placeholder="443"
            value={form.port}
            onChange={(e) => { setForm({ ...form, port: e.target.value }); setErrors(p => ({ ...p, port: '' })) }}
          />
          {errors.port && <p className="text-xs text-danger mt-1">{errors.port}</p>}
        </div>

        {/* Dominio */}
        {form.credential_type === 'windows' && (
          <div className="form-group col-span-2">
            <label className="label">Dominio Windows</label>
            <input className="input" placeholder="EMPRESA.LOCAL" value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })} />
          </div>
        )}

        {/* Notas */}
        <div className="form-group col-span-2">
          <label className="label">Notas</label>
          <textarea className="input resize-none" rows={2} value={form.notes}
            placeholder="Información adicional sobre esta credencial..."
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_preferred}
          onChange={(e) => setForm({ ...form, is_preferred: e.target.checked })} />
        <span className="text-sm text-text-secondary">Marcar como credencial preferida para este cliente</span>
      </label>

      <div className="flex gap-3 justify-end pt-2 border-t border-border">
        <button className="btn-secondary" onClick={onCancel} disabled={mut.isPending}>Cancelar</button>
        <button className="btn-primary" onClick={handleSubmit} disabled={mut.isPending}>
          {mut.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Guardar credencial'}
        </button>
      </div>
    </div>
  )
}
