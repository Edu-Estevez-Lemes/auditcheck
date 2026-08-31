import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, ClipboardList, Trash2, Download, Play } from 'lucide-react'
import toast from 'react-hot-toast'
import { auditsApi, clientsApi } from '../lib/api'
import type { AuditSummary, ClientSummary } from '../types'
import { Modal } from '../components/Modal'
import { AuditWizard } from '../components/AuditWizard'
import { formatDate, SEVERITY_CONFIG } from '../lib/utils'
import { ConfirmDialog } from '../components/ConfirmDialog'

export function AuditsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showWizard, setShowWizard] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data: audits = [], isLoading } = useQuery<AuditSummary[]>({
    queryKey: ['audits'],
    queryFn: () => auditsApi.list().then((r) => r.data),
    refetchInterval: 10_000,
  })
  const { data: clients = [] } = useQuery<ClientSummary[]>({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list().then((r) => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => auditsApi.delete(id),
    onSuccess: () => {
      toast.success('Auditoría eliminada')
      qc.invalidateQueries({ queryKey: ['audits'] })
      setDeleteId(null)
    },
  })

  const downloadMut = useMutation({
    mutationFn: async (id: number) => {
      const { data } = await auditsApi.downloadExcel(id)
      const url = URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `AUDITCHECK_${id}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    },
    onError: () => toast.error('Error al generar el informe'),
  })

  const filtered = audits.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.client_name.toLowerCase().includes(search.toLowerCase())
  )

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'badge-success', scanning: 'badge-warning',
      error: 'badge-error', pending: 'badge-info',
    }
    const labels: Record<string, string> = {
      completed: 'Completada', scanning: 'Escaneando',
      error: 'Error', pending: 'Pendiente',
    }
    return <span className={`badge ${map[status] ?? 'badge-info'}`}>{labels[status] ?? status}</span>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Auditorías</h1>
          <p className="text-sm text-text-muted mt-0.5">{audits.length} revisiones registradas</p>
        </div>
        <button className="btn-primary" onClick={() => setShowWizard(true)}>
          <Play size={15} /> Nueva auditoría
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text" className="input pl-9" placeholder="Buscar auditorías..."
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <span className="animate-spin h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full" />
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                {['Nombre', 'Cliente', 'Estado', 'Dispositivos', 'Críticos', 'Hallazgos', 'Fecha', ''].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <ClipboardList size={36} className="mx-auto text-text-muted/40 mb-2" />
                    <p className="text-text-muted text-sm">
                      {search ? 'Sin resultados' : 'Sin auditorías. Inicia una nueva revisión.'}
                    </p>
                  </td>
                </tr>
              )}
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/audits/${a.id}`} className="font-medium text-primary hover:underline">
                      {a.name}
                    </Link>
                    {a.audit_type === 'manual' && (
                      <span className="badge badge-info ml-2 text-[10px]" title="Auditoría manual (sin escaneo)">Manual</span>
                    )}
                  </td>
                  <td className="text-text-secondary">{a.client_name}</td>
                  <td>{statusBadge(a.status)}</td>
                  <td className="font-mono text-sm">{a.total_devices}</td>
                  <td>
                    {a.critical_findings > 0 ? (
                      <span className="badge-critical">{a.critical_findings}</span>
                    ) : '-'}
                  </td>
                  <td className="font-mono text-sm">{a.total_findings}</td>
                  <td className="text-text-muted text-xs whitespace-nowrap">
                    {formatDate(a.completed_at ?? a.started_at ?? null)}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      {a.status === 'completed' && (
                        <button
                          onClick={() => downloadMut.mutate(a.id)}
                          className="btn-ghost p-1.5" title="Descargar Excel"
                          disabled={downloadMut.isPending}
                        >
                          <Download size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteId(a.id)}
                        className="btn-ghost p-1.5 hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showWizard} onClose={() => setShowWizard(false)} title="Nueva auditoría" size="lg">
        <AuditWizard
          clients={clients}
          onSuccess={(auditId) => {
            setShowWizard(false)
            qc.invalidateQueries({ queryKey: ['audits'] })
            navigate(`/audits/${auditId}`)
          }}
          onCancel={() => setShowWizard(false)}
        />
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar auditoría"
        message="¿Eliminar esta auditoría? Se eliminarán todos los dispositivos y hallazgos asociados."
        confirmLabel="Eliminar"
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  )
}
