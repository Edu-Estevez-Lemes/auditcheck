import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ListChecks, Plus, Trash2, Pencil, ArrowUp, ArrowDown, BookTemplate,
  Users2, ChevronDown, ChevronRight, AlertTriangle, Check, X as XIcon, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { reviewCategoriesApi, reviewTemplatesApi } from '../../lib/api'
import { Modal } from '../Modal'
import type { ReviewCategory, ReviewTemplate, ReviewTemplateAffectedClient, ReviewTemplateDiff } from '../../types'

export function ChecklistSettingsTab() {
  return (
    <div className="space-y-6">
      <CategoriesSection />
      <TemplatesSection />
    </div>
  )
}

// ─── Categorías ─────────────────────────────────────────────────────────────

function CategoriesSection() {
  const qc = useQueryClient()
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ cat: ReviewCategory; usage?: { review_configs: number; review_sessions: number; review_templates: number } } | null>(null)

  const { data: categories = [], isLoading } = useQuery<ReviewCategory[]>({
    queryKey: ['review-categories'],
    queryFn: () => reviewCategoriesApi.list().then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['review-categories'] })

  const createMut = useMutation({
    mutationFn: (label: string) => reviewCategoriesApi.create({ label }),
    onSuccess: () => { toast.success('Categoría creada'); setNewLabel(''); invalidate() },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Error al crear la categoría')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, label, order }: { id: number; label?: string; order?: number }) =>
      reviewCategoriesApi.update(id, { label, order }),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Error al actualizar la categoría'),
  })

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => reviewCategoriesApi.delete(id, force),
    onSuccess: () => { toast.success('Categoría eliminada'); setConfirmDelete(null); invalidate() },
    onError: (err: unknown, vars) => {
      const response = (err as { response?: { status?: number; data?: { detail?: { usage?: { review_configs: number; review_sessions: number; review_templates: number } } } } })?.response
      if (response?.status === 409 && !vars.force) {
        const cat = categories.find(c => c.id === vars.id)
        if (cat) setConfirmDelete({ cat, usage: response.data?.detail?.usage })
        return
      }
      toast.error('Error al eliminar la categoría')
    },
  })

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= categories.length) return
    const reordered = [...categories]
    const [item] = reordered.splice(idx, 1)
    reordered.splice(target, 0, item)
    reviewCategoriesApi.reorder(reordered.map(c => c.id!)).then(invalidate).catch(() => toast.error('Error al reordenar'))
  }

  return (
    <div className="card space-y-4">
      <h3 className="section-title flex items-center gap-2"><ListChecks size={16} /> Categorías de revisión</h3>
      <p className="text-xs text-text-muted -mt-2">
        Categorías compartidas por todos los usuarios y clientes. Cualquier técnico puede añadir, renombrar, reordenar o eliminar categorías.
      </p>

      {isLoading ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {categories.map((cat, idx) => (
            <div key={cat.id} className="flex items-center gap-2 px-3 py-2">
              <div className="flex flex-col shrink-0">
                <button disabled={idx === 0} onClick={() => move(idx, -1)} className="text-text-muted hover:text-text-primary disabled:opacity-25">
                  <ArrowUp size={13} />
                </button>
                <button disabled={idx === categories.length - 1} onClick={() => move(idx, 1)} className="text-text-muted hover:text-text-primary disabled:opacity-25">
                  <ArrowDown size={13} />
                </button>
              </div>

              {editingId === cat.id ? (
                <input
                  autoFocus
                  value={editingLabel}
                  onChange={e => setEditingLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && editingLabel.trim()) { updateMut.mutate({ id: cat.id!, label: editingLabel.trim() }); setEditingId(null) }
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="input flex-1 text-sm py-1"
                />
              ) : (
                <span className="flex-1 text-sm text-text-primary">
                  {cat.label}
                  {cat.is_system && <span className="ml-2 text-[10px] text-text-muted border border-border rounded px-1 py-0.5">Predefinida</span>}
                </span>
              )}

              {editingId === cat.id ? (
                <>
                  <button
                    onClick={() => { if (editingLabel.trim()) { updateMut.mutate({ id: cat.id!, label: editingLabel.trim() }); setEditingId(null) } }}
                    className="p-1 text-success hover:bg-success/10 rounded"
                  ><Check size={14} /></button>
                  <button onClick={() => setEditingId(null)} className="p-1 text-text-muted hover:bg-surface-2 rounded"><XIcon size={14} /></button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setEditingId(cat.id!); setEditingLabel(cat.label) }}
                    className="p-1 text-text-muted hover:text-primary hover:bg-primary/10 rounded"
                    title="Renombrar"
                  ><Pencil size={13} /></button>
                  <button
                    onClick={() => deleteMut.mutate({ id: cat.id!, force: false })}
                    className="p-1 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded"
                    title="Eliminar"
                  ><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newLabel.trim()) createMut.mutate(newLabel.trim()) }}
          placeholder="Nueva categoría…"
          className="input flex-1 text-sm"
        />
        <button
          onClick={() => newLabel.trim() && createMut.mutate(newLabel.trim())}
          disabled={!newLabel.trim() || createMut.isPending}
          className="btn-secondary text-sm px-3 disabled:opacity-40"
        >
          <Plus size={14} /> Añadir
        </button>
      </div>

      {confirmDelete && (
        <Modal open onClose={() => setConfirmDelete(null)} title="Categoría en uso" size="sm">
          <div className="space-y-3">
            <div className="flex gap-2 text-amber-400 text-sm">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p>
                <strong>{confirmDelete.cat.label}</strong> está en uso:
                {confirmDelete.usage && (
                  <span className="block text-text-secondary text-xs mt-1">
                    {confirmDelete.usage.review_configs} configuración(es) de cliente ·{' '}
                    {confirmDelete.usage.review_sessions} revisión(es) ·{' '}
                    {confirmDelete.usage.review_templates} plantilla(s)
                  </span>
                )}
              </p>
            </div>
            <p className="text-xs text-text-muted">
              Eliminarla no borra las revisiones/plantillas existentes, pero desaparecerá del catálogo para revisiones futuras.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost text-sm px-3 py-1.5">Cancelar</button>
              <button
                onClick={() => deleteMut.mutate({ id: confirmDelete.cat.id!, force: true })}
                className="text-sm px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
              >
                Eliminar de todos modos
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Plantillas ─────────────────────────────────────────────────────────────

function TemplatesSection() {
  const qc = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [affectedFor, setAffectedFor] = useState<ReviewTemplate | null>(null)

  const { data: templates = [], isLoading } = useQuery<ReviewTemplate[]>({
    queryKey: ['review-templates'],
    queryFn: () => reviewTemplatesApi.list().then(r => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['review-templates'] })

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => reviewTemplatesApi.update(id, { name }),
    onSuccess: () => invalidate(),
    onError: () => toast.error('Error al renombrar la plantilla'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => reviewTemplatesApi.delete(id),
    onSuccess: () => { toast.success('Plantilla eliminada'); invalidate() },
    onError: () => toast.error('Error al eliminar la plantilla'),
  })

  return (
    <div className="card space-y-4">
      <h3 className="section-title flex items-center gap-2"><BookTemplate size={16} /> Mis plantillas de checklist</h3>
      <p className="text-xs text-text-muted -mt-2">
        Plantillas privadas: solo tú puedes verlas, editarlas o aplicarlas al iniciar una nueva revisión.
      </p>

      {isLoading ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-text-muted italic">
          Aún no has guardado ninguna plantilla. Puedes crear una desde el resumen de una revisión.
        </p>
      ) : (
        <div className="border border-border rounded-lg divide-y divide-border">
          {templates.map(tpl => (
            <div key={tpl.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                {editingId === tpl.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && editingName.trim()) { renameMut.mutate({ id: tpl.id, name: editingName.trim() }); setEditingId(null) }
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="input text-sm py-1 w-full"
                  />
                ) : (
                  <>
                    <p className="text-sm font-medium text-text-primary truncate">{tpl.name}</p>
                    <p className="text-xs text-text-muted truncate">
                      {tpl.categories.length} categoría(s)
                      {tpl.description ? ` · ${tpl.description}` : ''}
                    </p>
                  </>
                )}
              </div>
              {editingId === tpl.id ? (
                <>
                  <button
                    onClick={() => { if (editingName.trim()) { renameMut.mutate({ id: tpl.id, name: editingName.trim() }); setEditingId(null) } }}
                    className="p-1.5 text-success hover:bg-success/10 rounded"
                  ><Check size={14} /></button>
                  <button onClick={() => setEditingId(null)} className="p-1.5 text-text-muted hover:bg-surface-2 rounded"><XIcon size={14} /></button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setAffectedFor(tpl)}
                    className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded"
                    title="Ver clientes afectados / propagar cambios"
                  ><Users2 size={14} /></button>
                  <button
                    onClick={() => { setEditingId(tpl.id); setEditingName(tpl.name) }}
                    className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded"
                    title="Renombrar"
                  ><Pencil size={14} /></button>
                  <button
                    onClick={() => { if (confirm(`¿Eliminar la plantilla "${tpl.name}"?`)) deleteMut.mutate(tpl.id) }}
                    className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded"
                    title="Eliminar"
                  ><Trash2 size={14} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {affectedFor && (
        <AffectedClientsModal template={affectedFor} onClose={() => setAffectedFor(null)} />
      )}
    </div>
  )
}

function AffectedClientsModal({ template, onClose }: { template: ReviewTemplate; onClose: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const [diffs, setDiffs] = useState<Record<number, ReviewTemplateDiff>>({})
  const [propagating, setPropagating] = useState<number | null>(null)

  const { data: clients = [], isLoading, refetch } = useQuery<ReviewTemplateAffectedClient[]>({
    queryKey: ['review-template-affected', template.id],
    queryFn: () => reviewTemplatesApi.affectedClients(template.id).then(r => r.data),
  })

  const toggleExpand = async (clientId: number) => {
    if (expanded === clientId) { setExpanded(null); return }
    setExpanded(clientId)
    if (!diffs[clientId]) {
      try {
        const { data } = await reviewTemplatesApi.diff(template.id, clientId)
        setDiffs(prev => ({ ...prev, [clientId]: data as ReviewTemplateDiff }))
      } catch {
        toast.error('Error al calcular los cambios')
      }
    }
  }

  const propagate = async (clientId: number) => {
    setPropagating(clientId)
    try {
      await reviewTemplatesApi.propagate(template.id, [clientId])
      toast.success('Cambios propagados')
      setDiffs(prev => { const n = { ...prev }; delete n[clientId]; return n })
      setExpanded(null)
      refetch()
    } catch {
      toast.error('Error al propagar los cambios')
    } finally {
      setPropagating(null)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Clientes que usan "${template.name}"`} size="md">
      {isLoading ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : clients.length === 0 ? (
        <p className="text-sm text-text-muted italic">
          Ningún cliente tiene esta plantilla aplicada todavía. Se vincula automáticamente cuando guardas la configuración de un cliente usando esta plantilla.
        </p>
      ) : (
        <div className="space-y-2">
          {clients.map(c => (
            <div key={c.client_id} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 text-sm text-text-primary">{c.client_name}</span>
                {c.up_to_date ? (
                  <span className="text-xs text-success flex items-center gap-1"><Check size={12} /> Actualizado</span>
                ) : (
                  <button onClick={() => toggleExpand(c.client_id)} className="text-xs text-primary flex items-center gap-1 hover:underline">
                    {expanded === c.client_id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    Ver cambios pendientes
                  </button>
                )}
              </div>
              {expanded === c.client_id && (
                <div className="px-3 pb-3 pt-1 border-t border-border bg-surface-2/30 space-y-2">
                  {!diffs[c.client_id] ? (
                    <Loader2 size={14} className="animate-spin text-text-muted" />
                  ) : diffs[c.client_id].entries.length === 0 && diffs[c.client_id].categories_added.length === 0 ? (
                    <p className="text-xs text-text-muted italic">Sin cambios de ítems pendientes.</p>
                  ) : (
                    <>
                      {diffs[c.client_id].entries.map((e, i) => (
                        <div key={i} className="text-xs text-text-secondary">
                          <span className="font-medium">{e.category} / {e.device_type}</span>
                          {e.added_items.length > 0 && (
                            <span className="block text-success">+ {e.added_items.map(it => it.label).join(', ')}</span>
                          )}
                          {e.removed_items.length > 0 && (
                            <span className="block text-red-400">− {e.removed_items.join(', ')}</span>
                          )}
                        </div>
                      ))}
                      {diffs[c.client_id].categories_added.length > 0 && (
                        <p className="text-xs text-amber-400">
                          Categorías nuevas en la plantilla sin hosts asignados en este cliente: {diffs[c.client_id].categories_added.join(', ')}
                        </p>
                      )}
                      <button
                        onClick={() => propagate(c.client_id)}
                        disabled={propagating === c.client_id}
                        className="btn-primary text-xs px-3 py-1.5 mt-1 disabled:opacity-40"
                      >
                        {propagating === c.client_id ? <Loader2 size={12} className="animate-spin" /> : null}
                        Propagar a este cliente
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
