import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { clientsApi } from '../lib/api'
import type { Client } from '../types'

interface Props {
  initialData?: Partial<Client>
  onSuccess: () => void
  onCancel: () => void
}

export function ClientForm({ initialData, onSuccess, onCancel }: Props) {
  const isEdit = !!initialData?.id
  const [form, setForm] = useState({
    name: initialData?.name ?? '',
    cif_nif: initialData?.cif_nif ?? '',
    address: initialData?.address ?? '',
    contact_person: initialData?.contact_person ?? '',
    phone: initialData?.phone ?? '',
    email: initialData?.email ?? '',
    observations: initialData?.observations ?? '',
  })

  const mut = useMutation({
    mutationFn: () =>
      isEdit
        ? clientsApi.update(initialData!.id!, form)
        : clientsApi.create(form),
    onSuccess: () => {
      toast.success(isEdit ? 'Cliente actualizado' : 'Cliente creado')
      onSuccess()
    },
    onError: () => toast.error('Error al guardar el cliente'),
  })

  const field = (label: string, key: keyof typeof form, type = 'text', multiline = false) => (
    <div className="form-group" key={key}>
      <label className="label">{label}</label>
      {multiline ? (
        <textarea
          className="input min-h-[80px] resize-none"
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          rows={3}
        />
      ) : (
        <input
          type={type}
          className="input"
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {field('Nombre del cliente *', 'name')}
        {field('CIF/NIF', 'cif_nif')}
        {field('Persona de contacto', 'contact_person')}
        {field('Teléfono', 'phone', 'tel')}
        {field('Email', 'email', 'email')}
        {field('Dirección', 'address')}
      </div>
      {field('Observaciones', 'observations', 'text', true)}

      <div className="flex gap-3 justify-end pt-2 border-t border-border">
        <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
        <button
          className="btn-primary"
          onClick={() => mut.mutate()}
          disabled={!form.name || mut.isPending}
        >
          {mut.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
        </button>
      </div>
    </div>
  )
}
