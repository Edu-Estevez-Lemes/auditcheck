// ── Consola de Red ───────────────────────────────────────────────────────────
import { create } from 'zustand'

interface ConsoleContext {
  auditId?: number
  auditName?: string
  prefill?: string
}

interface ConsoleStore {
  open: boolean
  auditId: number | null
  auditName: string | null
  prefill: string
  openWithContext: (ctx?: ConsoleContext) => void
  close: () => void
}

export const useConsoleStore = create<ConsoleStore>((set) => ({
  open: false,
  auditId: null,
  auditName: null,
  prefill: '',
  openWithContext: (ctx) =>
    set({
      open: true,
      auditId: ctx?.auditId ?? null,
      auditName: ctx?.auditName ?? null,
      prefill: ctx?.prefill ?? '',
    }),
  close: () => set({ open: false }),
}))
