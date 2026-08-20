import { useState } from 'react'
import { Modal } from './Modal'
import type { ReviewCategory } from '../types'

interface AddChecklistItemDialogProps {
  open: boolean
  onClose: () => void
  categories: ReviewCategory[]
  defaultCategoryKey: string
  onSubmit: (label: string, categoryKey: string) => void
}

export function AddChecklistItemDialog({
  open, onClose, categories, defaultCategoryKey, onSubmit,
}: AddChecklistItemDialogProps) {
  const [label, setLabel] = useState('')
  const [categoryKey, setCategoryKey] = useState(defaultCategoryKey)

  const handleClose = () => {
    setLabel('')
    setCategoryKey(defaultCategoryKey)
    onClose()
  }

  const handleSubmit = () => {
    if (!label.trim()) return
    onSubmit(label.trim(), categoryKey)
    handleClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Añadir ítem personalizado" size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Título del ítem</label>
          <input
            type="text"
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="p. ej. Revisión de ventiladores"
            className="input w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Categoría</label>
          <select value={categoryKey} onChange={e => setCategoryKey(e.target.value)} className="input w-full">
            {categories.map(cat => (
              <option key={cat.key} value={cat.key}>{cat.label}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={handleClose} className="btn-ghost text-sm px-3 py-1.5">Cancelar</button>
          <button onClick={handleSubmit} disabled={!label.trim()} className="btn-primary text-sm px-3 py-1.5 disabled:opacity-40">
            Añadir
          </button>
        </div>
      </div>
    </Modal>
  )
}
