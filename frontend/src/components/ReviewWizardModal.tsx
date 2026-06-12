import { useState, useEffect, useCallback } from 'react'
import {
  X, ChevronLeft, ChevronRight, Save, Download, FileText,
  CheckCircle2, AlertTriangle, XCircle, ClipboardList, Loader2, Info,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { auditsApi, reviewsApi, clientsApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import type { Device, ReviewChecklist, ReviewItemStatus, ReviewResultsData, ReviewConfig } from '../types'
import type { ReviewConfigMode } from './ReviewPreDialog'
import { DEVICE_TYPE_LABELS } from '../lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReviewWizardModalProps {
  open: boolean
  onClose: () => void
  auditId: number
  clientId: number
  clientName?: string
  reviewConfig?: ReviewConfig | null
  configMode?: ReviewConfigMode
}

// deviceCategories: Record<deviceId string, string[]>
interface WizardState {
  technician: string
  reviewDate: string
  selectedDeviceIds: Set<number>
  categories: string[]
  deviceCategories: Record<string, string[]>
  results: ReviewResultsData
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_BTN: Record<string, { label: string; active: string; inactive: string }> = {
  ok:       { label: 'OK',       active: 'bg-green-600 border-green-700 text-white font-semibold', inactive: 'bg-transparent border-border text-text-secondary hover:border-green-500 hover:text-green-400' },
  warning:  { label: 'Warning',  active: 'bg-amber-500 border-amber-600 text-white font-semibold', inactive: 'bg-transparent border-border text-text-secondary hover:border-amber-400 hover:text-amber-400' },
  critical: { label: 'Critical', active: 'bg-red-600 border-red-700 text-white font-semibold',    inactive: 'bg-transparent border-border text-text-secondary hover:border-red-500 hover:text-red-400' },
}

const STATUS_BADGE: Record<string, string> = {
  ok:       'bg-green-600/15 text-green-400 border border-green-600/30',
  warning:  'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  critical: 'bg-red-600/15 text-red-400 border border-red-600/30',
  '':       'bg-surface-2 text-text-muted border border-border',
}

const STATUS_LABEL: Record<string, string> = {
  ok: 'OK', warning: 'Warning', critical: 'Critical', '': '—',
}

const PRIORITY: Record<string, number> = { critical: 3, warning: 2, ok: 1, '': 0 }

function worstStatus(results: ReviewResultsData, deviceId: number, categories: string[]): ReviewItemStatus {
  let worst: ReviewItemStatus = ''
  const devRes = results[String(deviceId)] ?? {}
  for (const cat of categories) {
    for (const s of Object.values(devRes[cat]?.items ?? {})) {
      if (PRIORITY[s] > PRIORITY[worst]) worst = s as ReviewItemStatus
    }
  }
  return worst
}

const TODAY = new Date().toISOString().split('T')[0]

/** Returns the category keys that have defined items for a device type */
function autoDetectCats(deviceType: string, categories: string[], checklist: ReviewChecklist | null): string[] {
  if (!checklist) return categories
  const matched = categories.filter(cat => (checklist.items[cat]?.[deviceType]?.length ?? 0) > 0)
  return matched.length > 0 ? matched : categories
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReviewWizardModal({
  open, onClose, auditId, clientId, clientName,
  reviewConfig = null, configMode = 'reset',
}: ReviewWizardModalProps) {
  const user = useAuthStore((s) => s.user)

  const [checklist, setChecklist] = useState<ReviewChecklist | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState<'' | 'excel' | 'pdf'>('')
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [resolvedClientName, setResolvedClientName] = useState(clientName ?? '')
  const [infraWarnings, setInfraWarnings] = useState<{ removed: string[]; added: string[] }>({ removed: [], added: [] })
  const [configSaved, setConfigSaved] = useState(false)

  const [state, setState] = useState<WizardState>({
    technician: user?.full_name ?? user?.username ?? '',
    reviewDate: TODAY,
    selectedDeviceIds: new Set(),
    categories: [],
    deviceCategories: {},
    results: {},
  })

  useEffect(() => {
    if (!open) return
    const startStep = (reviewConfig && configMode === 'use') ? 1 : 0
    setStep(startStep)
    setReviewId(null)
    setConfigSaved(false)
    setInfraWarnings({ removed: [], added: [] })
    setState({
      technician: user?.full_name ?? user?.username ?? '',
      reviewDate: TODAY,
      selectedDeviceIds: new Set(),
      categories: [],
      deviceCategories: {},
      results: {},
    })

    setLoading(true)
    Promise.all([
      reviewsApi.checklist(),
      auditsApi.getDevices(auditId),
      clientName ? Promise.resolve(null) : clientsApi.get(clientId).then(r => r.data).catch(() => null),
    ]).then(([chkRes, devRes, clientRes]) => {
      const chk = chkRes.data as ReviewChecklist
      setChecklist(chk)
      const credDevices = (devRes.data as Device[]).filter(d => !!d.credential_name || !!d.credential_id)
      setDevices(credDevices)
      if (!clientName && (clientRes as { name?: string })?.name) {
        setResolvedClientName((clientRes as { name: string }).name)
      }

      if (reviewConfig && configMode !== 'reset') {
        // Pre-populate from saved ReviewConfig (match by IP)
        const allCats = Array.from(new Set(reviewConfig.hosts.flatMap(h => h.categorias)))
        const selectedIds = new Set<number>()
        const devCats: Record<string, string[]> = {}
        const removed: string[] = []
        const addedDevices: string[] = []

        reviewConfig.hosts.forEach(configHost => {
          const device = credDevices.find(d => d.ip_address === configHost.ip)
          if (!device) {
            removed.push(`${configHost.nombre} (${configHost.ip})`)
            return
          }
          selectedIds.add(device.id)
          devCats[String(device.id)] = configHost.categorias
        })

        // Detect new credentialed devices not in config
        credDevices.forEach(d => {
          if (!selectedIds.has(d.id) && !reviewConfig.hosts.some(h => h.ip === d.ip_address)) {
            addedDevices.push(`${d.display_name || d.hostname || d.ip_address} (${d.ip_address})`)
          }
        })

        setInfraWarnings({ removed, added: addedDevices })
        setState(prev => ({
          ...prev,
          categories: allCats,
          selectedDeviceIds: selectedIds,
          deviceCategories: devCats,
        }))
      }
    }).catch(() => toast.error('Error cargando datos de revisión'))
      .finally(() => setLoading(false))
  }, [open, auditId, clientId, clientName, user, reviewConfig, configMode])

  const totalSteps = (state.categories.length || 1) + 2
  const currentLabel = step === 0
    ? 'Configuración'
    : step <= state.categories.length
    ? (checklist?.categories.find(c => c.key === state.categories[step - 1])?.label ?? '')
    : 'Resumen'

  // ─── State updaters ────────────────────────────────────────────────────────

  const setItemStatus = useCallback((deviceId: number, catKey: string, itemKey: string, status: ReviewItemStatus) => {
    setState(prev => {
      const devId = String(deviceId)
      const prev_cat = prev.results[devId]?.[catKey] ?? { items: {}, observations: '' }
      return {
        ...prev,
        results: {
          ...prev.results,
          [devId]: {
            ...prev.results[devId],
            [catKey]: { ...prev_cat, items: { ...prev_cat.items, [itemKey]: status } },
          },
        },
      }
    })
  }, [])

  const setObservations = useCallback((deviceId: number, catKey: string, text: string) => {
    setState(prev => {
      const devId = String(deviceId)
      const prev_cat = prev.results[devId]?.[catKey] ?? { items: {}, observations: '' }
      return {
        ...prev,
        results: {
          ...prev.results,
          [devId]: {
            ...prev.results[devId],
            [catKey]: { ...prev_cat, observations: text },
          },
        },
      }
    })
  }, [])

  const toggleDevice = (device: Device) => {
    setState(prev => {
      const next = new Set(prev.selectedDeviceIds)
      const devId = String(device.id)
      if (next.has(device.id)) {
        next.delete(device.id)
        const { [devId]: _, ...restCats } = prev.deviceCategories
        return { ...prev, selectedDeviceIds: next, deviceCategories: restCats }
      } else {
        next.add(device.id)
        const autoCats = autoDetectCats(device.device_type, prev.categories, checklist)
        return {
          ...prev,
          selectedDeviceIds: next,
          deviceCategories: { ...prev.deviceCategories, [devId]: autoCats },
        }
      }
    })
  }

  const toggleCategory = (key: string) => {
    setState(prev => {
      const isAdding = !prev.categories.includes(key)
      const newCategories = isAdding
        ? [...prev.categories, key]
        : prev.categories.filter(c => c !== key)

      // Update per-device categories
      const newDeviceCats: Record<string, string[]> = {}
      prev.selectedDeviceIds.forEach(id => {
        const devId = String(id)
        const existing = prev.deviceCategories[devId] ?? []
        if (isAdding) {
          const device = devices.find(d => d.id === id)
          const hasItems = device ? (checklist?.items[key]?.[device.device_type]?.length ?? 0) > 0 : false
          newDeviceCats[devId] = hasItems ? [...existing, key] : existing
        } else {
          newDeviceCats[devId] = existing.filter(c => c !== key)
        }
      })

      return { ...prev, categories: newCategories, deviceCategories: newDeviceCats }
    })
  }

  const setDeviceCategory = (deviceId: number, catKey: string, include: boolean) => {
    setState(prev => {
      const devId = String(deviceId)
      const existing = prev.deviceCategories[devId] ?? []
      return {
        ...prev,
        deviceCategories: {
          ...prev.deviceCategories,
          [devId]: include ? [...existing, catKey] : existing.filter(c => c !== catKey),
        },
      }
    })
  }

  // ─── Save ReviewConfig ─────────────────────────────────────────────────────

  const saveConfig = async (): Promise<boolean> => {
    if (state.selectedDeviceIds.size === 0 || state.categories.length === 0) return false
    try {
      const hosts = Array.from(state.selectedDeviceIds).map(id => {
        const device = devices.find(d => d.id === id)
        return {
          ip: device?.ip_address ?? '',
          nombre: device?.display_name || device?.hostname || device?.ip_address || '',
          categorias: state.deviceCategories[String(id)] ?? [],
        }
      }).filter(h => h.ip)

      await reviewsApi.upsertConfig({
        client_id: clientId,
        client_nombre: resolvedClientName,
        configurado_por: state.technician.trim() || (user?.full_name ?? user?.username ?? ''),
        fecha_configuracion: state.reviewDate,
        hosts,
      })
      setConfigSaved(true)
      toast.success(
        `Configuración guardada para ${resolvedClientName || 'el cliente'}`,
        { icon: '📋', duration: 3000 }
      )
      return true
    } catch {
      return false
    }
  }

  // ─── Save draft ────────────────────────────────────────────────────────────

  const saveDraft = async (): Promise<number | null> => {
    if (!state.technician.trim()) { toast.error('Indica el nombre del técnico'); return null }
    if (state.selectedDeviceIds.size === 0) { toast.error('Selecciona al menos un dispositivo'); return null }
    if (state.categories.length === 0) { toast.error('Selecciona al menos una categoría'); return null }

    setSaving(true)
    try {
      const reviewData = {
        _device_categories: Object.fromEntries(Object.entries(state.deviceCategories)),
        ...state.results,
      }
      const payload = {
        technician_name: state.technician.trim(),
        review_date: state.reviewDate,
        categories: state.categories,
        selected_device_ids: Array.from(state.selectedDeviceIds),
        review_data: reviewData,
      }

      let id = reviewId
      if (!id) {
        const { data } = await reviewsApi.create({ audit_id: auditId, ...payload })
        id = data.id
        setReviewId(id)
      } else {
        await reviewsApi.update(id, payload)
      }
      toast.success('Borrador guardado')
      return id
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ? `Error: ${msg}` : 'Error al guardar el borrador')
      return null
    } finally {
      setSaving(false)
    }
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  const handleNext = () => {
    if (step === 0) {
      if (!state.technician.trim() || state.selectedDeviceIds.size === 0 || state.categories.length === 0) {
        toast.error('Completa técnico, dispositivos y categorías')
        return
      }
    } else if (step <= state.categories.length) {
      const catKey = state.categories[step - 1]
      const catItems = checklist?.items ?? {}
      let missing = 0
      state.selectedDeviceIds.forEach(deviceId => {
        const devCats = state.deviceCategories[String(deviceId)] ?? []
        if (!devCats.includes(catKey)) return
        const devType = devices.find(d => d.id === deviceId)?.device_type ?? ''
        const items = catItems[catKey]?.[devType] ?? []
        for (const item of items) {
          if (!(state.results[String(deviceId)]?.[catKey]?.items?.[item.key])) missing++
        }
      })
      if (missing > 0) toast(`${missing} ítem(s) sin rellenar — puedes continuar`, { icon: '⚠️', duration: 3000 })
    }
    const nextStep = step + 1
    setStep(nextStep)
    // Auto-save config when entering summary (non-reset modes save silently)
    if (nextStep === totalSteps - 1 && configMode !== 'reset' && !configSaved) {
      void saveConfig()
    }
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  const handleExport = async (type: 'excel' | 'pdf') => {
    let id = reviewId
    if (!id) {
      id = await saveDraft()
      if (!id) return
    } else {
      setSaving(true)
      try {
        const reviewData = {
          _device_categories: Object.fromEntries(Object.entries(state.deviceCategories)),
          ...state.results,
        }
        await reviewsApi.update(id, { review_data: reviewData, is_completed: true })
      } catch {
        toast.error('Error actualizando los datos')
        setSaving(false)
        return
      }
      setSaving(false)
    }
    setExporting(type)
    try {
      const res = type === 'excel'
        ? await reviewsApi.exportExcel(id)
        : await reviewsApi.exportPdf(id)
      const ext = type === 'excel' ? 'xlsx' : 'pdf'
      const mime = type === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf'
      const blob = new Blob([res.data], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `REVISION_${state.reviewDate}_${resolvedClientName.replace(/\s+/g, '_') || 'cliente'}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
      toast.success(`Informe ${type.toUpperCase()} descargado`)
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: unknown } })?.response
      const status = response?.status
      let detail: string | undefined
      if (response?.data instanceof Blob) {
        try { detail = JSON.parse(await (response.data as Blob).text())?.detail } catch { /* ignore */ }
      } else {
        detail = (response?.data as { detail?: string })?.detail
      }
      if (status === 501) {
        toast.error('PDF no disponible: instala reportlab en el servidor (pip install reportlab)', { duration: 8000 })
      } else {
        toast.error(detail ? `Error: ${detail}` : `Error al exportar ${type.toUpperCase()}`)
      }
    } finally {
      setExporting('')
    }
  }

  // ─── Close guard ──────────────────────────────────────────────────────────

  const handleClose = () => {
    if (step > 0 && !reviewId) {
      if (!confirm('¿Cerrar sin guardar? Perderás los datos del wizard.')) return
    }
    onClose()
  }

  if (!open) return null

  const progressPct = Math.round((step / Math.max(totalSteps - 1, 1)) * 100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative w-full max-w-5xl bg-surface border border-border-2 rounded-xl shadow-2xl flex flex-col"
           style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border shrink-0">
          <ClipboardList size={18} className="text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-text-primary truncate">
              Revisión Manual{resolvedClientName ? ` — ${resolvedClientName}` : ''}
            </h2>
            <p className="text-xs text-text-muted">{currentLabel}</p>
          </div>
          <span className="text-xs text-text-muted shrink-0 font-medium">
            Paso {step + 1} de {totalSteps}
          </span>
          <button onClick={handleClose} className="btn-ghost p-1.5 rounded-lg ml-1">
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-surface-2 shrink-0">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {/* Infrastructure change warnings */}
          {!loading && (infraWarnings.removed.length > 0 || infraWarnings.added.length > 0) && (
            <div className="mb-4 space-y-2">
              {infraWarnings.removed.length > 0 && (
                <div className="flex gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Hosts excluidos automáticamente</span> (sin credenciales activas):
                    {' '}{infraWarnings.removed.join(', ')}
                  </div>
                </div>
              )}
              {infraWarnings.added.length > 0 && (
                <div className="flex gap-2 px-3 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Nuevos hosts con credenciales</span> no incluidos en la configuración:
                    {' '}{infraWarnings.added.join(', ')}. Puedes añadirlos en el paso de configuración.
                  </div>
                </div>
              )}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 size={28} className="animate-spin text-primary" />
            </div>
          ) : step === 0 ? (
            <StepConfig
              state={state}
              devices={devices}
              checklist={checklist}
              onToggleDevice={toggleDevice}
              onToggleCategory={toggleCategory}
              onSetDeviceCategory={setDeviceCategory}
              onSetTechnician={t => setState(p => ({ ...p, technician: t }))}
              onSetDate={d => setState(p => ({ ...p, reviewDate: d }))}
            />
          ) : step <= state.categories.length ? (
            <StepCategory
              catKey={state.categories[step - 1]}
              catLabel={checklist?.categories.find(c => c.key === state.categories[step - 1])?.label ?? ''}
              deviceCategories={state.deviceCategories}
              selectedDeviceIds={state.selectedDeviceIds}
              devices={devices}
              checklist={checklist}
              results={state.results}
              onSetItemStatus={setItemStatus}
              onSetObservations={setObservations}
            />
          ) : (
            <StepSummary
              state={state}
              devices={devices}
              checklist={checklist}
              exporting={exporting}
              onExport={handleExport}
              configMode={configMode}
              configSaved={configSaved}
              onSaveConfig={saveConfig}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border shrink-0 bg-surface">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-40"
          >
            <ChevronLeft size={15} /> Anterior
          </button>

          <button
            onClick={saveDraft}
            disabled={saving || step === 0}
            className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar borrador
          </button>

          {step < totalSteps - 1 ? (
            <button onClick={handleNext} className="btn-primary flex items-center gap-1.5 text-sm">
              {step === 0 ? 'Comenzar revisión' : 'Siguiente'} <ChevronRight size={15} />
            </button>
          ) : (
            <span className="text-xs text-success flex items-center gap-1">
              <CheckCircle2 size={14} /> Usa los botones de arriba para exportar
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Step 0: Configuration ────────────────────────────────────────────────────

interface StepConfigProps {
  state: WizardState
  devices: Device[]
  checklist: ReviewChecklist | null
  onToggleDevice: (d: Device) => void
  onToggleCategory: (key: string) => void
  onSetDeviceCategory: (deviceId: number, catKey: string, include: boolean) => void
  onSetTechnician: (v: string) => void
  onSetDate: (v: string) => void
}

function StepConfig({ state, devices, checklist, onToggleDevice, onToggleCategory, onSetDeviceCategory, onSetTechnician, onSetDate }: StepConfigProps) {
  const allSelected = devices.length > 0 && devices.every(d => state.selectedDeviceIds.has(d.id))
  const selectedList = devices.filter(d => state.selectedDeviceIds.has(d.id))

  const toggleAll = () => {
    if (allSelected) {
      devices.forEach(d => { if (state.selectedDeviceIds.has(d.id)) onToggleDevice(d) })
    } else {
      devices.forEach(d => { if (!state.selectedDeviceIds.has(d.id)) onToggleDevice(d) })
    }
  }

  return (
    <div className="space-y-6">
      {/* Técnico + fecha */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Técnico</label>
          <input
            type="text"
            value={state.technician}
            onChange={e => onSetTechnician(e.target.value)}
            placeholder="Nombre del técnico"
            className="input w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">Fecha</label>
          <input type="date" value={state.reviewDate} onChange={e => onSetDate(e.target.value)} className="input w-full" />
        </div>
      </div>

      {/* Categorías */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Categorías a revisar</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(checklist?.categories ?? []).map(cat => {
            const selected = state.categories.includes(cat.key)
            return (
              <button
                key={cat.key}
                onClick={() => onToggleCategory(cat.key)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  selected ? 'bg-primary/20 border-primary text-primary font-medium' : 'bg-surface border-border text-text-secondary hover:border-primary/50'
                }`}
              >
                <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${selected ? 'bg-primary border-primary' : 'border-border-2'}`}>
                  {selected && <CheckCircle2 size={11} className="text-white" />}
                </span>
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Hosts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Hosts a revisar
            <span className="ml-2 text-xs font-normal text-text-muted">
              ({state.selectedDeviceIds.size}/{devices.length} seleccionados)
            </span>
          </h3>
          {devices.length > 0 && (
            <button onClick={toggleAll} className="text-xs text-primary hover:underline">
              {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          )}
        </div>

        {devices.length === 0 ? (
          <div className="text-center py-8 text-text-muted text-sm border border-dashed border-border rounded-lg">
            No hay dispositivos con credenciales registradas en esta auditoría.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
            {devices.map(device => {
              const selected = state.selectedDeviceIds.has(device.id)
              const label = device.display_name || device.hostname || device.ip_address
              return (
                <button
                  key={device.id}
                  onClick={() => onToggleDevice(device)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                    selected ? 'bg-primary/10 border-primary/60' : 'bg-surface border-border hover:border-primary/40'
                  }`}
                >
                  <span className={`w-4 h-4 rounded border-2 shrink-0 ${selected ? 'bg-primary border-primary' : 'border-border-2'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate font-medium text-text-primary">{label}</p>
                    <p className="text-xs text-text-muted">{device.ip_address} · {DEVICE_TYPE_LABELS[device.device_type] ?? device.device_type}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Per-device category assignment */}
      {selectedList.length > 0 && state.categories.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Categorías por dispositivo</h3>
            <span className="text-xs text-text-muted">(un host puede pertenecer a varias categorías)</span>
          </div>
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Header */}
            <div className="grid bg-surface-2 border-b border-border px-4 py-2" style={{ gridTemplateColumns: `1fr ${state.categories.map(() => '80px').join(' ')}` }}>
              <span className="text-xs font-semibold text-text-secondary">Dispositivo</span>
              {state.categories.map(catKey => {
                const cat = checklist?.categories.find(c => c.key === catKey)
                return (
                  <span key={catKey} className="text-xs font-semibold text-text-secondary text-center truncate px-1">
                    {cat?.label ?? catKey}
                  </span>
                )
              })}
            </div>
            {/* Rows */}
            <div className="divide-y divide-border">
              {selectedList.map((device, idx) => {
                const devId = String(device.id)
                const devCats = state.deviceCategories[devId] ?? []
                const label = device.display_name || device.hostname || device.ip_address
                return (
                  <div
                    key={device.id}
                    className={`grid items-center px-4 py-2.5 ${idx % 2 === 1 ? 'bg-surface-2/30' : ''}`}
                    style={{ gridTemplateColumns: `1fr ${state.categories.map(() => '80px').join(' ')}` }}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-sm font-medium text-text-primary truncate">{label}</p>
                      <p className="text-xs text-text-muted">{device.ip_address}</p>
                    </div>
                    {state.categories.map(catKey => {
                      const included = devCats.includes(catKey)
                      const hasItems = (checklist?.items[catKey]?.[device.device_type]?.length ?? 0) > 0
                      return (
                        <div key={catKey} className="flex justify-center">
                          <button
                            onClick={() => onSetDeviceCategory(device.id, catKey, !included)}
                            title={hasItems ? `Ítems definidos para ${DEVICE_TYPE_LABELS[device.device_type] ?? device.device_type}` : 'Sin ítems predefinidos — se incluirá solo con observaciones'}
                            className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                              included ? 'bg-primary border-primary' : 'border-border-2 hover:border-primary/50'
                            }`}
                          >
                            {included && <CheckCircle2 size={12} className="text-white" />}
                            {!included && !hasItems && (
                              <span className="w-1.5 h-1.5 rounded-full bg-border-2" />
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
          <p className="text-xs text-text-muted mt-1.5">
            Los cuadros con <span className="text-primary font-medium">✓</span> tienen ítems predefinidos para ese tipo de dispositivo. Puedes activar cualquier categoría manualmente.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Step N: Category review ──────────────────────────────────────────────────

interface StepCategoryProps {
  catKey: string
  catLabel: string
  deviceCategories: Record<string, string[]>
  selectedDeviceIds: Set<number>
  devices: Device[]
  checklist: ReviewChecklist | null
  results: ReviewResultsData
  onSetItemStatus: (deviceId: number, catKey: string, itemKey: string, status: ReviewItemStatus) => void
  onSetObservations: (deviceId: number, catKey: string, text: string) => void
}

function StepCategory({
  catKey, catLabel, deviceCategories, selectedDeviceIds, devices, checklist, results,
  onSetItemStatus, onSetObservations,
}: StepCategoryProps) {
  const catItemsByType = checklist?.items[catKey] ?? {}

  // Show only devices assigned to this category
  const relevantDevices = devices.filter(d => {
    if (!selectedDeviceIds.has(d.id)) return false
    return (deviceCategories[String(d.id)] ?? []).includes(catKey)
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/20 text-primary border border-primary/30">
          {catLabel}
        </span>
        <span className="text-xs text-text-muted">{relevantDevices.length} dispositivo(s) asignados</span>
      </div>

      {relevantDevices.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm border border-dashed border-border rounded-lg">
          Ningún dispositivo está asignado a <strong>{catLabel}</strong>. Vuelve a Configuración para asignarlo.
        </div>
      )}

      {relevantDevices.map(device => {
        const items = catItemsByType[device.device_type] ?? []
        const devLabel = device.display_name || device.hostname || device.ip_address
        const devResults = results[String(device.id)]?.[catKey]
        const itemStatuses = devResults?.items ?? {}
        const obs = devResults?.observations ?? ''

        return (
          <div key={device.id} className="border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border-b border-border">
              <span className="text-primary font-bold text-sm">▸</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-text-primary">{devLabel}</span>
                <span className="text-xs text-text-muted ml-2">{device.ip_address}</span>
              </div>
              <span className="text-xs text-text-muted">
                {DEVICE_TYPE_LABELS[device.device_type] ?? device.device_type}
              </span>
            </div>

            <div className="divide-y divide-border">
              {items.length > 0 ? items.map((item, idx) => {
                const status = itemStatuses[item.key] ?? ''
                return (
                  <div key={item.key} className={`flex items-center gap-3 px-4 py-3 ${idx % 2 === 1 ? 'bg-surface-2/40' : ''}`}>
                    <span className="text-sm text-text-primary flex-1 min-w-0">{item.label}</span>
                    <div className="flex gap-1.5 shrink-0">
                      {(['ok', 'warning', 'critical'] as ReviewItemStatus[]).map(s => {
                        const cfg = STATUS_BTN[s]
                        return (
                          <button
                            key={s}
                            onClick={() => onSetItemStatus(device.id, catKey, item.key, status === s ? '' : s)}
                            className={`px-2.5 py-1 text-xs rounded border transition-all ${status === s ? cfg.active : cfg.inactive}`}
                          >
                            {cfg.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              }) : (
                <div className="flex items-center gap-3 px-4 py-3 bg-surface-2/20">
                  <span className="text-sm text-text-secondary flex-1">Estado general</span>
                  <div className="flex gap-1.5 shrink-0">
                    {(['ok', 'warning', 'critical'] as ReviewItemStatus[]).map(s => {
                      const cfg = STATUS_BTN[s]
                      const current = (itemStatuses['general'] ?? '') as ReviewItemStatus
                      return (
                        <button
                          key={s}
                          onClick={() => onSetItemStatus(device.id, catKey, 'general', current === s ? '' : s)}
                          className={`px-2.5 py-1 text-xs rounded border transition-all ${current === s ? cfg.active : cfg.inactive}`}
                        >
                          {cfg.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 py-3 bg-surface-2/20 border-t border-border">
              <label className="block text-xs text-text-muted mb-1.5">Observaciones del dispositivo</label>
              <textarea
                value={obs}
                onChange={e => onSetObservations(device.id, catKey, e.target.value)}
                placeholder="Notas, incidencias o comentarios adicionales…"
                rows={2}
                className="w-full text-sm bg-surface border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Final step: Summary ──────────────────────────────────────────────────────

interface StepSummaryProps {
  state: WizardState
  devices: Device[]
  checklist: ReviewChecklist | null
  exporting: '' | 'excel' | 'pdf'
  onExport: (type: 'excel' | 'pdf') => void
  configMode: ReviewConfigMode
  configSaved: boolean
  onSaveConfig: () => Promise<boolean>
}

function StepSummary({ state, devices, checklist, exporting, onExport, configMode, configSaved, onSaveConfig }: StepSummaryProps) {
  const [savingConfig, setSavingConfig] = useState(false)
  const selectedDevices = devices.filter(d => state.selectedDeviceIds.has(d.id))
  const catLabels = Object.fromEntries((checklist?.categories ?? []).map(c => [c.key, c.label]))

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    await onSaveConfig()
    setSavingConfig(false)
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 text-sm">
        {[
          ['Técnico', state.technician],
          ['Fecha', state.reviewDate],
          ['Categorías', state.categories.map(k => catLabels[k] ?? k).join(', ')],
        ].map(([k, v]) => (
          <div key={k} className="card py-2.5 px-3">
            <p className="text-xs text-text-muted">{k}</p>
            <p className="text-sm font-medium text-text-primary mt-0.5 truncate">{v}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Resultado por dispositivo</h3>
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 border-b border-border">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-secondary">Dispositivo</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-text-secondary">IP</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-text-secondary">Categorías</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-text-secondary">Estado</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-text-secondary">Observaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {selectedDevices.map((device, idx) => {
                const devId = String(device.id)
                const devCats = state.deviceCategories[devId] ?? state.categories
                const worst = worstStatus(state.results, device.id, devCats)
                const devRes = state.results[devId] ?? {}
                const obsList = devCats.map(cat => devRes[cat]?.observations ?? '').filter(Boolean)
                const label = device.display_name || device.hostname || device.ip_address

                return (
                  <tr key={device.id} className={idx % 2 === 1 ? 'bg-surface-2/30' : ''}>
                    <td className="px-4 py-2.5 font-medium text-text-primary">{label}</td>
                    <td className="px-3 py-2.5 text-text-secondary font-mono text-xs">{device.ip_address}</td>
                    <td className="px-3 py-2.5 text-xs text-text-muted">{devCats.map(k => catLabels[k] ?? k).join(', ') || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[worst]}`}>
                        {worst === 'ok' && <CheckCircle2 size={11} />}
                        {worst === 'warning' && <AlertTriangle size={11} />}
                        {worst === 'critical' && <XCircle size={11} />}
                        {STATUS_LABEL[worst]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-text-secondary text-xs max-w-xs truncate">
                      {obsList.join(' · ') || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Guardar configuración — solo en modo reset */}
      {configMode === 'reset' && !configSaved && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-primary/10 border border-primary/30">
          <ClipboardList size={16} className="text-primary shrink-0" />
          <p className="text-sm text-text-primary flex-1">
            ¿Guardar esta selección como configuración de revisión para el cliente?
          </p>
          <button
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="btn-primary text-xs px-3 py-1.5 shrink-0"
          >
            {savingConfig ? <Loader2 size={13} className="animate-spin" /> : null}
            Guardar
          </button>
        </div>
      )}
      {configMode === 'reset' && configSaved && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-success/10 border border-success/30 text-success text-sm">
          <CheckCircle2 size={15} /> Configuración guardada para futuras revisiones
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={() => onExport('excel')}
          disabled={!!exporting}
          className="btn-success flex items-center gap-2 flex-1 justify-center"
        >
          {exporting === 'excel' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          Exportar Excel (.xlsx)
        </button>
        <button
          onClick={() => onExport('pdf')}
          disabled={!!exporting}
          className="btn-primary flex items-center gap-2 flex-1 justify-center"
        >
          {exporting === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
          Exportar PDF
        </button>
      </div>
    </div>
  )
}
