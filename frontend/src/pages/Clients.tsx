import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Building2, Edit, Trash2, Power, AlertCircle, ClipboardList, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { clientsApi, reviewsApi } from '../lib/api'
import type { ClientSummary, ReviewClientStatus } from '../types'
import { Modal } from '../components/Modal'
import { ClientForm } from '../components/ClientForm'
import { ConfirmDialog } from '../components/ConfirmDialog'

export function ClientsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const { data: clients = [], isLoading } = useQuery<ClientSummary[]>({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list().then((r) => r.data),
  })

  const { data: reviewStatuses = [] } = useQuery<ReviewClientStatus[]>({
    queryKey: ['review-status', clients.map(c => c.id)],
    queryFn: () =>
      clients.length > 0
        ? reviewsApi.getStatus(clients.map(c => c.id)).then(r => r.data)
        : Promise.resolve([]),
    enabled: clients.length > 0,
  })

  const reviewStatusMap = Object.fromEntries(reviewStatuses.map(s => [s.client_id, s]))

  const deleteMut = useMutation({
    mutationFn: (id: number) => clientsApi.delete(id),
    onSuccess: () => {
      toast.success('Cliente eliminado')
      qc.invalidateQueries({ queryKey: ['clients'] })
      setDeleteId(null)
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      clientsApi.update(id, { is_active: active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="text-sm text-text-muted mt-0.5">{clients.length} clientes registrados</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          className="input pl-9"
          placeholder="Buscar clientes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <span className="animate-spin h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 size={40} className="text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-text-muted">
            {search ? 'Sin resultados para la búsqueda' : 'Sin clientes registrados'}
          </p>
          {!search && (
            <button className="btn-primary mt-4 mx-auto" onClick={() => setShowForm(true)}>
              <Plus size={14} /> Crear primer cliente
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const rs = reviewStatusMap[c.id]
            const reviewPending = rs && rs.last_review_completed && (rs.days_since_review ?? 0) > 7
            return (
            <div
              key={c.id}
              className={`card hover:border-primary/30 transition-colors ${!c.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {c.logo_path ? (
                    <img
                      src={`/api/v1/clients/${c.id}/logo`}
                      alt={c.name}
                      className="h-9 w-9 object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center">
                      <Building2 size={18} className="text-primary" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link
                        to={`/clients/${c.id}`}
                        className="font-semibold text-text-primary hover:text-primary transition-colors"
                      >
                        {c.name}
                      </Link>
                      {rs?.has_config && (
                        <span title="Configuración de revisión guardada" className="text-primary">
                          <ClipboardList size={13} />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-xs ${c.is_active ? 'text-success' : 'text-text-muted'}`}>
                        {c.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                      {reviewPending && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <Clock size={10} /> Revisión pendiente
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleMut.mutate({ id: c.id, active: !c.is_active })}
                    className="btn-ghost p-1.5"
                    title={c.is_active ? 'Desactivar' : 'Activar'}
                  >
                    <Power size={14} className={c.is_active ? 'text-success' : 'text-text-muted'} />
                  </button>
                  <Link to={`/clients/${c.id}`} className="btn-ghost p-1.5">
                    <Edit size={14} />
                  </Link>
                  <button
                    onClick={() => setDeleteId(c.id)}
                    className="btn-ghost p-1.5 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                <div className="text-center">
                  <p className="text-lg font-bold text-text-primary">{c.total_audits}</p>
                  <p className="text-xs text-text-muted">Revisiones</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-text-primary">{c.open_findings}</p>
                  <p className="text-xs text-text-muted">Hallazgos</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-bold ${c.critical_findings > 0 ? 'text-critical' : 'text-text-primary'}`}>
                    {c.critical_findings}
                  </p>
                  <p className="text-xs text-text-muted">Críticos</p>
                </div>
              </div>
            </div>
          )
          })}
        </div>
      )}

      {/* Modal nuevo cliente */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Nuevo cliente"
        size="lg"
      >
        <ClientForm
          onSuccess={() => {
            setShowForm(false)
            qc.invalidateQueries({ queryKey: ['clients'] })
          }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      {/* Confirmar borrado */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar cliente"
        message="¿Eliminar este cliente? Se eliminarán también todas sus auditorías, credenciales y hallazgos. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        danger
      />
    </div>
  )
}
