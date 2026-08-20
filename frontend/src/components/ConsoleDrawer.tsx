// ── Consola de Red ───────────────────────────────────────────────────────────
import { useEffect } from 'react'

interface ConsoleDrawerProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

export function ConsoleDrawer({ open, onClose, children }: ConsoleDrawerProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full h-[70vh] bg-surface border-t border-border-2 rounded-t-xl shadow-2xl flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
