import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirmar',
  onConfirm, onCancel, danger = false
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex gap-3">
          {danger && <AlertTriangle size={20} className="text-warning shrink-0 mt-0.5" />}
          <p className="text-sm text-text-secondary">{message}</p>
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
