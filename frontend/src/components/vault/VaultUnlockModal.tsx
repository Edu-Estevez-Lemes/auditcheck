import { useState } from 'react'
import { Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../Modal'
import { useVaultStore } from '../../store/vaultStore'

export function VaultUnlockModal() {
  const { unlockPrompt, dismissUnlockPrompt, unlock } = useVaultStore()
  const [passphrase, setPassphrase] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const ok = await unlock(passphrase)
      if (ok) {
        toast.success('Vault desbloqueado')
        setPassphrase('')
      } else {
        toast.error('Passphrase incorrecta')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={unlockPrompt} onClose={dismissUnlockPrompt} title="Vault bloqueado">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2 text-text-secondary text-sm">
          <Lock size={16} className="text-primary shrink-0" />
          Esta acción necesita la passphrase maestra para descifrar la credencial.
        </div>
        <div className="form-group">
          <label className="label">Passphrase maestra</label>
          <input
            type="password"
            className="input"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading || !passphrase}>
            {loading ? 'Verificando...' : 'Desbloquear'}
          </button>
          <button type="button" className="btn-secondary" onClick={dismissUnlockPrompt}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
