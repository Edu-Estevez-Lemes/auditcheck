import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../Modal'
import { useVaultStore } from '../../store/vaultStore'

export function VaultMigrationModal({ open }: { open: boolean }) {
  const { migrateLegacy } = useVaultStore()
  const [form, setForm] = useState({ passphrase: '', confirm: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.passphrase.length < 12) {
      toast.error('La passphrase debe tener al menos 12 caracteres')
      return
    }
    if (form.passphrase !== form.confirm) {
      toast.error('Las passphrases no coinciden')
      return
    }
    setLoading(true)
    try {
      await migrateLegacy(form.passphrase, form.confirm)
      toast.success('Vault migrado a passphrase maestra')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg || 'Error en la migración del vault')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={() => {}} title="Migración del vault de credenciales" preventClose>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
          <ShieldAlert size={16} className="text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary">
            Este equipo usa el sistema de cifrado antiguo, ligado a esta máquina. Se generará un
            backup automático de la base de datos y todas las credenciales se re-cifrarán con la
            nueva passphrase maestra, que será portable entre equipos.
          </p>
        </div>
        <div className="form-group">
          <label className="label">Nueva passphrase maestra (mínimo 12 caracteres)</label>
          <input type="password" className="input" value={form.passphrase}
            onChange={(e) => setForm({ ...form, passphrase: e.target.value })} autoFocus />
        </div>
        <div className="form-group">
          <label className="label">Confirmar passphrase</label>
          <input type="password" className="input" value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </div>
        <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
          {loading ? 'Migrando...' : 'Migrar vault ahora'}
        </button>
      </form>
    </Modal>
  )
}
