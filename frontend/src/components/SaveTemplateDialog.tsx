import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from './Modal'

interface SaveTemplateDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (name: string, description: string) => Promise<void>
}

export function SaveTemplateDialog({ open, onClose, onSubmit }: SaveTemplateDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const handleClose = () => {
    if (saving) return
    setName('')
    setDescription('')
    onClose()
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onSubmit(name.trim(), description.trim())
      setName('')
      setDescription('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Guardar como plantilla" size="sm" preventClose={saving}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Nombre de la plantilla</label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="p. ej. Servidores Windows — estándar"
            className="input w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Descripción (opcional)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Notas sobre cuándo usar esta plantilla…"
            className="w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-primary"
          />
        </div>
        <p className="text-xs text-text-muted">
          Se guardará como plantilla privada, solo visible para tu usuario. Podrás aplicarla en revisiones de otros clientes.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={handleClose} disabled={saving} className="btn-ghost text-sm px-3 py-1.5">Cancelar</button>
          <button onClick={handleSubmit} disabled={!name.trim() || saving} className="btn-primary text-sm px-3 py-1.5 disabled:opacity-40 flex items-center gap-1.5">
            {saving && <Loader2 size={13} className="animate-spin" />}
            Guardar plantilla
          </button>
        </div>
      </div>
    </Modal>
  )
}
