import { ClipboardList, CheckCircle2, PencilLine, Trash2, X } from 'lucide-react'
import type { ReviewConfig } from '../types'

export type ReviewConfigMode = 'use' | 'edit' | 'reset'

interface ReviewPreDialogProps {
  open: boolean
  onClose: () => void
  config: ReviewConfig
  lastReviewDate: string | null
  lastTechnician: string | null
  onSelect: (mode: ReviewConfigMode) => void
}

export function ReviewPreDialog({
  open, onClose, config, lastReviewDate, lastTechnician, onSelect,
}: ReviewPreDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-surface border border-border-2 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <ClipboardList size={18} className="text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-text-primary">Configuración de revisión encontrada</h2>
            <p className="text-xs text-text-muted">{config.client_nombre}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <X size={15} />
          </button>
        </div>

        {/* Info */}
        <div className="px-5 py-4 space-y-2">
          <div className="p-3 rounded-lg bg-surface-2 border border-border text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-text-muted">Hosts configurados</span>
              <span className="font-semibold text-text-primary">{config.hosts.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Configurado por</span>
              <span className="font-medium text-text-primary">{config.configurado_por}</span>
            </div>
            {lastReviewDate && (
              <div className="flex justify-between">
                <span className="text-text-muted">Última revisión</span>
                <span className="font-medium text-text-primary">
                  {lastReviewDate}{lastTechnician ? ` — ${lastTechnician}` : ''}
                </span>
              </div>
            )}
            {!lastReviewDate && (
              <div className="flex justify-between">
                <span className="text-text-muted">Revisiones previas</span>
                <span className="text-text-muted italic">Ninguna</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 space-y-2">
          <button
            onClick={() => onSelect('use')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
          >
            <CheckCircle2 size={16} className="shrink-0" />
            <span>Usar configuración guardada</span>
          </button>
          <button
            onClick={() => onSelect('edit')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-surface hover:border-primary/40 hover:bg-surface-2 transition-colors text-sm text-text-primary"
          >
            <PencilLine size={16} className="shrink-0 text-text-secondary" />
            <span>Revisar y modificar configuración</span>
          </button>
          <button
            onClick={() => onSelect('reset')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-surface hover:border-danger/40 hover:text-danger transition-colors text-sm text-text-secondary"
          >
            <Trash2 size={16} className="shrink-0" />
            <span>Empezar desde cero</span>
          </button>
        </div>
      </div>
    </div>
  )
}
