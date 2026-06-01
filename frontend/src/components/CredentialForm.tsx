import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { credentialsApi } from '../lib/api'
import { CREDENTIAL_TYPES } from '../lib/utils'

interface Props {
  clientId?: number
  onSuccess: () => void
  onCancel: () => void
}

export function CredentialForm({ clientId, onSuccess, onCancel }: Props) {
  const [showPass, setShowPass] = useState(false)
  const [form, setForm] = useState({
    name: '',
    credential_type: 'windows',
    username: '',
    password: '',
    host: '',
    port: '',
    domain: '',
    notes: '',
    is_preferred: false,
  })

  const mut = useMutation({
    mutationFn: () =>
      credentialsApi.create({
        ...form,
        client_id: clientId ?? null,
        port: form.port ? Number(form.port) : null,
      }),
    onSuccess: () => {
      toast.success('Credencial guardada (contraseña cifrada)')
      onSuccess()
    },
    onError: () => toast.error('Error al guardar'),
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="form-group col-span-2">
          <label className="label">Nombre identificativo *</label>
          <input className="input" placeholder="ej: Dominio Gordillo" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Tipo *</label>
          <select className="input" value={form.credential_type}
            onChange={(e) => setForm({ ...form, credential_type: e.target.value })}>
            {CREDENTIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">Usuario</label>
          <input className="input" placeholder="username" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="form-group col-span-2">
          <label className="label">Contraseña</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              className="input pr-10"
              placeholder="Se cifra al guardar"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary">
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1">La contraseña se cifra antes de guardarse y nunca se expone en texto plano</p>
        </div>
        <div className="form-group">
          <label className="label">Host / IP</label>
          <input className="input" placeholder="192.168.1.1" value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label">Puerto</label>
          <input className="input" type="number" placeholder="443" value={form.port}
            onChange={(e) => setForm({ ...form, port: e.target.value })} />
        </div>
        <div className="form-group col-span-2">
          <label className="label">Dominio (Windows)</label>
          <input className="input" placeholder="EMPRESA.LOCAL" value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value })} />
        </div>
        <div className="form-group col-span-2">
          <label className="label">Notas</label>
          <textarea className="input resize-none" rows={2} value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_preferred}
          onChange={(e) => setForm({ ...form, is_preferred: e.target.checked })} />
        <span className="text-sm text-text-secondary">Marcar como credencial preferida para este cliente</span>
      </label>

      <div className="flex gap-3 justify-end pt-2 border-t border-border">
        <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" onClick={() => mut.mutate()} disabled={!form.name || mut.isPending}>
          {mut.isPending ? 'Guardando...' : 'Guardar credencial'}
        </button>
      </div>
    </div>
  )
}
