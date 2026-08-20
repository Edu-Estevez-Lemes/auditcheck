import { create } from 'zustand'
import api from '../lib/api'

interface VaultState {
  needsSetup: boolean
  needsMigration: boolean
  isUnlocked: boolean
  checked: boolean
  // Bloque 2 — se activa cuando una petición devuelve 423 (vault bloqueado);
  // VaultUnlockModal, montado una vez en MainLayout, observa este flag.
  unlockPrompt: boolean
  checkStatus: () => Promise<void>
  unlock: (passphrase: string) => Promise<boolean>
  setup: (passphrase: string, confirm: string) => Promise<void>
  migrateLegacy: (newPassphrase: string, confirm: string) => Promise<void>
  changePassphrase: (current: string, next: string, confirm: string) => Promise<void>
  lock: () => Promise<void>
  promptUnlock: () => void
  dismissUnlockPrompt: () => void
}

export const useVaultStore = create<VaultState>()((set) => ({
  needsSetup: false,
  needsMigration: false,
  isUnlocked: false,
  checked: false,
  unlockPrompt: false,

  checkStatus: async () => {
    try {
      const { data } = await api.get('/vault/status')
      set({
        needsSetup: data.needs_setup,
        needsMigration: data.needs_migration,
        isUnlocked: data.is_unlocked,
        checked: true,
      })
    } catch {
      set({ checked: true })
    }
  },

  unlock: async (passphrase: string) => {
    try {
      await api.post('/vault/unlock', { passphrase })
      set({ isUnlocked: true, unlockPrompt: false })
      return true
    } catch {
      return false
    }
  },

  setup: async (passphrase: string, confirm: string) => {
    await api.post('/vault/setup', { passphrase, confirm_passphrase: confirm })
    set({ needsSetup: false, isUnlocked: true })
  },

  migrateLegacy: async (newPassphrase: string, confirm: string) => {
    await api.post('/vault/migrate-legacy', { new_passphrase: newPassphrase, confirm_passphrase: confirm })
    set({ needsMigration: false, isUnlocked: true })
  },

  changePassphrase: async (current: string, next: string, confirm: string) => {
    await api.post('/vault/change-passphrase', {
      current_passphrase: current,
      new_passphrase: next,
      confirm_passphrase: confirm,
    })
    set({ isUnlocked: true })
  },

  lock: async () => {
    await api.post('/vault/lock')
    set({ isUnlocked: false })
  },

  promptUnlock: () => set({ unlockPrompt: true }),
  dismissUnlockPrompt: () => set({ unlockPrompt: false }),
}))
