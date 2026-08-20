import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload, X } from 'lucide-react'
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

  // Logo: fichero seleccionado + URL de previsualización
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(
    isEdit && initialData?.id ? `/api/v1/clients/${initialData.id}/logo` : null
  )

  const handleLogoChange = (file: File) => {
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setLogoPreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const clearLogo = () => {
    setLogoFile(null)
    setLogoPreview(isEdit && initialData?.id ? `/api/v1/clients/${initialData.id}/logo` : null)
  }

  const mut = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        // Edición: actualizar datos y subir logo si se seleccionó uno
        await clientsApi.update(initialData!.id!, form)
        if (logoFile) {
          try {
            await clientsApi.uploadLogo(initialData!.id!, logoFile)
          } catch {
            toast.error('Datos guardados, pero el logo no se pudo subir')
          }
        }
      } else {
        // Creación: crear el cliente primero para obtener el ID, luego subir el logo
        const res = await clientsApi.create(form)
        const newId = (res.data as Client).id
        if (logoFile && newId) {
          try {
            await clientsApi.uploadLogo(newId, logoFile)
          } catch {
            toast.error('Cliente creado, pero el logo no se pudo subir')
          }
        }
      }
    },
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
      {/* Logo */}
      <div className="form-group">
        <label className="label">Logo del cliente</label>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-24 h-16 bg-surface-2 rounded-lg border-2 border-dashed border-border shrink-0 overflow-hidden">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Logo"
                className="h-full w-full object-contain p-1"
                onError={() => setLogoPreview(null)}
              />
            ) : (
              <span className="text-text-muted text-[10px] text-center leading-tight px-1">
                Sin logo
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="btn-secondary cursor-pointer text-xs">
              <Upload size={13} />
              {logoFile ? 'Cambiar logo' : logoPreview ? 'Reemplazar' : 'Subir logo'}
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleLogoChange(e.target.files[0])}
              />
            </label>
            {logoFile && (
              <button
                type="button"
                className="btn-ghost text-xs text-text-muted hover:text-danger flex items-center gap-1"
                onClick={clearLogo}
              >
                <X size={11} /> Quitar selección
              </button>
            )}
            <p className="text-xs text-text-muted">PNG, JPG, SVG · se sube al guardar</p>
          </div>
        </div>
      </div>

      {/* Campos de datos */}
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
