import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, Upload, Edit, ClipboardList, Key, Network, Download, ClipboardCheck, PlayCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { clientsApi, credentialsApi, auditsApi, reviewsApi } from '../lib/api'
import type { Client, Credential, AuditSummary, ReviewSession, ReviewConfig } from '../types'
import type { ReviewConfigMode } from '../components/ReviewPreDialog'
import { Modal } from '../components/Modal'
import { ClientForm } from '../components/ClientForm'
import { CredentialForm } from '../components/CredentialForm'
import { ReviewPreDialog } from '../components/ReviewPreDialog'
import { ReviewWizardModal } from '../components/ReviewWizardModal'
import { formatDate, CREDENTIAL_TYPES } from '../lib/utils'

export function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const clientId = Number(id)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'info' | 'credentials' | 'audits' | 'ranges' | 'reviews'>('info')
  const [editOpen, setEditOpen] = useState(false)
  const [credOpen, setCredOpen] = useState(false)
  const [preDialogOpen, setPreDialogOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardAuditId, setWizardAuditId] = useState<number | null>(null)
  const [reviewConfig, setReviewConfig] = useState<ReviewConfig | null>(null)
  const [configMode, setConfigMode] = useState<ReviewConfigMode>('reset')
  const [lastReviewDate, setLastReviewDate] = useState<string | null>(null)
  const [lastTechnician, setLastTechnician] = useState<string | null>(null)
  const [loadingReview, setLoadingReview] = useState(false)

  const clientQ = useQuery<Client>({
    queryKey: ['client', clientId],
    queryFn: () => clientsApi.get(clientId).then((r) => r.data),
  })
  const credsQ = useQuery<Credential[]>({
    queryKey: ['credentials', clientId],
    queryFn: () => credentialsApi.list(clientId).then((r) => r.data),
  })
  const auditsQ = useQuery<AuditSummary[]>({
    queryKey: ['audits', clientId],
    queryFn: () => auditsApi.list(clientId).then((r) => r.data),
  })

  const handleNewReview = async () => {
    if (audits.length === 0) {
      toast.error('No hay auditorías para este cliente. Realiza una auditoría primero.')
      return
    }
    const latestAudit = audits[0]
    setWizardAuditId(latestAudit.id)
    setLoadingReview(true)

    const [configResult, lastResult] = await Promise.allSettled([
      reviewsApi.getConfig(clientId),
      reviewsApi.last(clientId),
    ])

    const lastData = lastResult.status === 'fulfilled' ? (lastResult.value.data as { review_date?: string; technician_name?: string }) : null
    setLastReviewDate(lastData?.review_date ?? null)
    setLastTechnician(lastData?.technician_name ?? null)

    setLoadingReview(false)
    if (configResult.status === 'fulfilled') {
      setReviewConfig(configResult.value.data as ReviewConfig)
      setPreDialogOpen(true)
    } else {
      setReviewConfig(null)
      setConfigMode('reset')
      setWizardOpen(true)
    }
  }

  const handlePreDialogSelect = (mode: ReviewConfigMode) => {
    setPreDialogOpen(false)
    setConfigMode(mode)
    setWizardOpen(true)
  }

  const deleteCredMut = useMutation({
    mutationFn: (credId: number) => credentialsApi.delete(credId),
    onSuccess: () => {
      toast.success('Credencial eliminada')
      qc.invalidateQueries({ queryKey: ['credentials', clientId] })
    },
  })

  const deleteRangeMut = useMutation({
    mutationFn: (rangeId: number) => clientsApi.deleteIpRange(clientId, rangeId),
    onSuccess: () => {
      toast.success('Rango eliminado')
      qc.invalidateQueries({ queryKey: ['client', clientId] })
    },
  })

  const uploadLogoMut = useMutation({
    mutationFn: (file: File) => clientsApi.uploadLogo(clientId, file),
    onSuccess: () => {
      toast.success('Logo actualizado')
      qc.invalidateQueries({ queryKey: ['client', clientId] })
    },
    onError: () => toast.error('Error al subir el logo'),
  })

  const client = clientQ.data
  const creds = credsQ.data ?? []
  const audits = auditsQ.data ?? []

  if (clientQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="animate-spin h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full" />
      </div>
    )
  }
  if (!client) return <p className="text-text-muted">Cliente no encontrado</p>

  const tabs = [
    { key: 'info', label: 'Información', icon: Edit },
    { key: 'ranges', label: 'Rangos IP', icon: Network },
    { key: 'credentials', label: 'Credenciales', icon: Key },
    { key: 'audits', label: 'Auditorías', icon: ClipboardList },
    { key: 'reviews', label: 'Revisiones', icon: ClipboardCheck },
  ] as const

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/clients')} className="btn-ghost p-2">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <h1 className="page-title">{client.name}</h1>
          <span className={`badge ${client.is_active ? 'badge-success' : 'badge-info'}`}>
            {client.is_active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
        <button className="btn-secondary" onClick={() => setEditOpen(true)}>
          <Edit size={15} /> Editar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {tab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="card space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="section-title">Logo</h3>
              <label className="btn-secondary cursor-pointer text-xs">
                <Upload size={13} /> Subir logo
                <input
                  type="file" className="hidden" accept="image/*"
                  onChange={(e) => e.target.files?.[0] && uploadLogoMut.mutate(e.target.files[0])}
                />
              </label>
            </div>
            <div className="flex flex-col items-center justify-center h-40 bg-surface-2 rounded-lg border-2 border-dashed border-border gap-2">
              <img
                src={`/api/v1/clients/${clientId}/logo`}
                alt="Logo" className="h-28 w-auto object-contain"
                onError={(e) => {
                  const el = e.target as HTMLImageElement
                  el.style.display = 'none'
                  el.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <p className="text-text-muted text-xs hidden">Sin logo — usa "Subir logo"</p>
            </div>
          </div>

          <div className="card lg:col-span-2 space-y-3">
            {[
              ['CIF/NIF', client.cif_nif],
              ['Dirección', client.address],
              ['Contacto', client.contact_person],
              ['Teléfono', client.phone],
              ['Email', client.email],
              ['Observaciones', client.observations],
            ].map(([label, value]) => value ? (
              <div key={label} className="flex gap-3">
                <span className="text-sm text-text-muted w-28 shrink-0">{label}:</span>
                <span className="text-sm text-text-primary">{value}</span>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {/* Tab: Rangos IP */}
      {tab === 'ranges' && (
        <IPRangesTab clientId={clientId} ranges={client.ip_ranges} onDelete={(id) => deleteRangeMut.mutate(id)} />
      )}

      {/* Tab: Credenciales */}
      {tab === 'credentials' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setCredOpen(true)}>
              <Plus size={14} /> Nueva credencial
            </button>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  {['Nombre', 'Tipo', 'Usuario', 'Host', 'Estado', 'Último uso', ''].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {creds.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-text-muted py-8">Sin credenciales</td></tr>
                )}
                {creds.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td>{CREDENTIAL_TYPES.find((t) => t.value === c.credential_type)?.label ?? c.credential_type}</td>
                    <td className="font-mono text-xs">{c.username || '-'}</td>
                    <td className="font-mono text-xs">{c.host || '-'}</td>
                    <td>
                      <span className={`badge ${c.status === 'valid' ? 'badge-success' : c.status === 'invalid' ? 'badge-error' : 'badge-info'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="text-text-muted text-xs">{formatDate(c.last_used ?? null)}</td>
                    <td>
                      <button onClick={() => deleteCredMut.mutate(c.id)} className="btn-ghost p-1 hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Auditorías */}
      {tab === 'audits' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Link to="/audits" state={{ clientId }} className="btn-primary">
              <Plus size={14} /> Nueva auditoría
            </Link>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>{['Nombre', 'Estado', 'Dispositivos', 'Hallazgos', 'Críticos', 'Fecha'].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {audits.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-text-muted py-8">Sin auditorías</td></tr>
                )}
                {audits.map((a) => (
                  <tr key={a.id}>
                    <td><Link to={`/audits/${a.id}`} className="text-primary hover:underline">{a.name}</Link></td>
                    <td><span className={`badge badge-${a.status === 'completed' ? 'success' : a.status === 'error' ? 'error' : 'info'}`}>{a.status}</span></td>
                    <td>{a.total_devices}</td>
                    <td>{a.total_findings}</td>
                    <td className={a.critical_findings > 0 ? 'text-critical font-bold' : ''}>{a.critical_findings}</td>
                    <td className="text-text-muted text-xs">{formatDate(a.completed_at ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Revisiones */}
      {tab === 'reviews' && (
        <ReviewsTab clientId={clientId} onNewReview={handleNewReview} loadingReview={loadingReview} />
      )}

      {/* Modales */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Editar: ${client.name}`} size="lg">
        <ClientForm
          initialData={client}
          onSuccess={() => { setEditOpen(false); qc.invalidateQueries({ queryKey: ['client', clientId] }) }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>
      <Modal open={credOpen} onClose={() => setCredOpen(false)} title="Nueva credencial">
        <CredentialForm
          clientId={clientId}
          onSuccess={() => { setCredOpen(false); qc.invalidateQueries({ queryKey: ['credentials', clientId] }) }}
          onCancel={() => setCredOpen(false)}
        />
      </Modal>

      {reviewConfig && (
        <ReviewPreDialog
          open={preDialogOpen}
          onClose={() => setPreDialogOpen(false)}
          config={reviewConfig}
          lastReviewDate={lastReviewDate}
          lastTechnician={lastTechnician}
          onSelect={handlePreDialogSelect}
        />
      )}

      {wizardAuditId && (
        <ReviewWizardModal
          open={wizardOpen}
          onClose={() => {
            setWizardOpen(false)
            qc.invalidateQueries({ queryKey: ['reviews', clientId] })
          }}
          auditId={wizardAuditId}
          clientId={clientId}
          clientName={client?.name}
          reviewConfig={reviewConfig}
          configMode={configMode}
        />
      )}
    </div>
  )
}

const REVIEW_CAT_LABELS: Record<string, string> = {
  hardware: 'Hardware', vm: 'VM/Virt.', vm_idecnet: 'VM Idecnet',
  redes: 'Redes', almacenamiento: 'Almacen.', backup: 'Backup', antivirus: 'Antivirus',
}

function ReviewsTab({ clientId, onNewReview, loadingReview }: { clientId: number; onNewReview: () => void; loadingReview: boolean }) {
  const qc = useQueryClient()

  const reviewsQ = useQuery<ReviewSession[]>({
    queryKey: ['reviews', clientId],
    queryFn: () => reviewsApi.list(undefined, clientId).then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => reviewsApi.delete(id),
    onSuccess: () => {
      toast.success('Revisión eliminada')
      qc.invalidateQueries({ queryKey: ['reviews', clientId] })
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const handleExcel = async (review: ReviewSession) => {
    try {
      const res = await reviewsApi.exportExcel(review.id)
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `REVISION_${review.review_date}_${review.id}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: unknown } })?.response
      let detail: string | undefined
      if (response?.data instanceof Blob) {
        try { detail = JSON.parse(await (response.data as Blob).text())?.detail } catch { /* ignore */ }
      } else {
        detail = (response?.data as { detail?: string })?.detail
      }
      toast.error(detail ?? 'Error al exportar Excel')
    }
  }

  const reviews = reviewsQ.data ?? []

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={onNewReview} disabled={loadingReview}>
          {loadingReview
            ? <Loader2 size={15} className="animate-spin" />
            : <PlayCircle size={15} />
          }
          {loadingReview ? 'Cargando…' : 'Nueva revisión'}
        </button>
      </div>
      {reviewsQ.isLoading ? (
        <div className="flex justify-center py-10">
          <span className="animate-spin h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 text-text-muted border border-dashed border-border rounded-xl">
          <ClipboardCheck size={32} className="mx-auto mb-3 opacity-40" />
          <p>Sin revisiones para este cliente.</p>
          <p className="text-xs mt-1">Pulsa "Nueva revisión" para comenzar.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                {['Fecha', 'Técnico', 'Categorías', 'Dispositivos', 'Estado', 'Exportado', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviews.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-sm">{r.review_date}</td>
                  <td>{r.technician_name}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {r.categories.map(cat => (
                        <span key={cat} className="px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary border border-primary/20">
                          {REVIEW_CAT_LABELS[cat] ?? cat}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-center">{r.selected_device_ids.length}</td>
                  <td>
                    <span className={`badge ${r.is_completed ? 'badge-success' : 'badge-info'}`}>
                      {r.is_completed ? 'Completada' : 'Borrador'}
                    </span>
                  </td>
                  <td className="text-text-muted text-xs">{r.exported_at ? formatDate(r.exported_at) : '—'}</td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleExcel(r)}
                        title="Descargar Excel"
                        className="btn-ghost p-1.5 hover:text-success"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => { if (confirm('¿Eliminar esta revisión?')) deleteMut.mutate(r.id) }}
                        title="Eliminar"
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
    </div>
  )
}

function IPRangesTab({
  clientId, ranges, onDelete
}: {
  clientId: number
  ranges: { id: number; range: string; description?: string }[]
  onDelete: (id: number) => void
}) {
  const [newRange, setNewRange] = useState('')
  const [desc, setDesc] = useState('')
  const qc = useQueryClient()

  const addMut = useMutation({
    mutationFn: () => clientsApi.addIpRange(clientId, { range: newRange, description: desc }),
    onSuccess: () => {
      toast.success('Rango añadido')
      setNewRange(''); setDesc('')
      qc.invalidateQueries({ queryKey: ['client', clientId] })
    },
    onError: () => toast.error('Error al añadir rango'),
  })

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="section-title mb-4">Añadir rango IP</h3>
        <div className="flex gap-3">
          <input
            type="text" className="input" placeholder="192.168.1.0/24 ó 10.0.0.1-10.0.0.254"
            value={newRange} onChange={(e) => setNewRange(e.target.value)}
          />
          <input
            type="text" className="input" placeholder="Descripción (opcional)"
            value={desc} onChange={(e) => setDesc(e.target.value)}
          />
          <button className="btn-primary shrink-0" onClick={() => addMut.mutate()} disabled={!newRange}>
            <Plus size={14} /> Añadir
          </button>
        </div>
        <p className="text-xs text-text-muted mt-2">Formatos: CIDR (192.168.1.0/24), rango (10.0.0.1-254) o IP única</p>
      </div>
      <div className="table-container">
        <table className="table">
          <thead><tr>{['Rango IP', 'Descripción', ''].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {ranges.length === 0 && (
              <tr><td colSpan={3} className="text-center text-text-muted py-6">Sin rangos definidos</td></tr>
            )}
            {ranges.map((r) => (
              <tr key={r.id}>
                <td className="font-mono text-sm">{r.range}</td>
                <td className="text-text-muted">{r.description || '-'}</td>
                <td><button onClick={() => onDelete(r.id)} className="btn-ghost p-1 hover:text-danger"><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
