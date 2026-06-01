import { useState, useEffect, useRef } from 'react'
import { Play, StopCircle, CheckCircle, AlertCircle, Wifi, Server } from 'lucide-react'
import toast from 'react-hot-toast'
import { scanApi } from '../lib/api'
import type { ClientSummary, ScanEvent } from '../types'

interface Props {
  clients: ClientSummary[]
  onSuccess: (auditId: number) => void
  onCancel: () => void
}

type Phase = 'config' | 'scanning' | 'done' | 'error'

interface ScanProgress {
  total_ips: number
  live_count: number
  devices_found: number
  current_ip: string | null
  events: string[]
}

export function AuditWizard({ clients, onSuccess, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>('config')
  const [form, setForm] = useState({
    client_id: '',
    audit_name: '',
    use_client_ranges: true,
    extra_ranges: '',
    notes: '',
  })
  const [progress, setProgress] = useState<ScanProgress>({
    total_ips: 0, live_count: 0, devices_found: 0, current_ip: null, events: [],
  })
  const [auditId, setAuditId] = useState<number | null>(null)
  const [scanId, setScanId] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const eventsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [progress.events])

  useEffect(() => {
    return () => { wsRef.current?.close() }
  }, [])

  const handleStart = async () => {
    if (!form.client_id || !form.audit_name) {
      toast.error('Selecciona un cliente e introduce un nombre para la revisión')
      return
    }

    const extraRanges = form.extra_ranges
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean)

    try {
      const { data } = await scanApi.start({
        client_id: Number(form.client_id),
        audit_name: form.audit_name,
        use_client_ranges: form.use_client_ranges,
        ip_ranges: extraRanges,
        notes: form.notes,
      })

      setAuditId(data.audit_id)
      setScanId(data.scan_id)
      setProgress({ total_ips: data.total_ips, live_count: 0, devices_found: 0, current_ip: null, events: [] })
      setPhase('scanning')

      // Conectar WebSocket
      const wsUrl = `ws://${window.location.host}/api/v1/scan/ws/${data.scan_id}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onmessage = (e) => {
        const event: ScanEvent = JSON.parse(e.data)
        handleScanEvent(event)
      }
      ws.onerror = () => {
        setPhase('error')
        toast.error('Error en la conexión del escaneo')
      }
      ws.onclose = () => {
        if (phase === 'scanning') setPhase('done')
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail || 'Error al iniciar el escaneo')
    }
  }

  const handleScanEvent = (event: ScanEvent) => {
    setProgress((prev) => {
      const newEvents = [...prev.events]
      let newState = { ...prev }

      if (event.type === 'scan_start') {
        newState.total_ips = event.total_ips ?? 0
        newEvents.push(`Iniciando escaneo de ${event.total_ips} IPs...`)
      } else if (event.type === 'host_up') {
        newState.live_count = prev.live_count + 1
        newState.current_ip = event.ip ?? null
        newEvents.push(`✓ Activo: ${event.ip}${event.response_time_ms ? ` (${event.response_time_ms?.toFixed(0)}ms)` : ''}`)
      } else if (event.type === 'device_complete') {
        newState.devices_found = prev.devices_found + 1
        newEvents.push(`  → ${event.device?.ip_address} · ${event.device?.device_type ?? 'unknown'} · ${event.device?.ports?.length ?? 0} puertos`)
      } else if (event.type === 'scan_complete') {
        newEvents.push(`\n Escaneo completado: ${(event as unknown as Record<string, unknown>)['total_devices'] ?? 0} dispositivos encontrados`)
      } else if (event.type === 'scan_saved') {
        newEvents.push(`💾 Resultados guardados en auditoría #${event.audit_id}`)
        setTimeout(() => setPhase('done'), 800)
      } else if (event.type === 'scan_error') {
        newEvents.push(`❌ Error: ${event.error}`)
        setPhase('error')
      }

      if (newEvents.length > 200) newEvents.splice(0, newEvents.length - 200)
      return { ...newState, events: newEvents }
    })
  }

  const handleCancel = async () => {
    if (scanId) {
      try { await scanApi.cancel(scanId) } catch (_) {}
    }
    wsRef.current?.close()
    onCancel()
  }

  const selectedClient = clients.find((c) => c.id === Number(form.client_id))

  if (phase === 'config') {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="form-group col-span-2">
            <label className="label">Cliente *</label>
            <select className="input" value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
              <option value="">Selecciona un cliente...</option>
              {clients.filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group col-span-2">
            <label className="label">Nombre de la revisión *</label>
            <input className="input" placeholder="ej: Revisión mensual Mayo 2026"
              value={form.audit_name} onChange={(e) => setForm({ ...form, audit_name: e.target.value })} />
          </div>
        </div>

        <div className="space-y-3 p-4 bg-surface-2 rounded-lg border border-border">
          <p className="text-sm font-medium text-text-primary">Rangos IP a escanear</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.use_client_ranges}
              onChange={(e) => setForm({ ...form, use_client_ranges: e.target.checked })} />
            <span className="text-sm text-text-secondary">
              Usar rangos configurados del cliente
              {selectedClient && ` (${selectedClient.name})`}
            </span>
          </label>
          <div className="form-group">
            <label className="label">Rangos adicionales (uno por línea)</label>
            <textarea className="input font-mono text-xs resize-none" rows={3}
              placeholder={'192.168.10.0/24\n10.0.0.1-10.0.0.50'}
              value={form.extra_ranges}
              onChange={(e) => setForm({ ...form, extra_ranges: e.target.value })} />
          </div>
        </div>

        <div className="form-group">
          <label className="label">Notas</label>
          <input className="input" placeholder="Notas opcionales para esta revisión"
            value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="flex gap-3 justify-end border-t border-border pt-4">
          <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn-primary" onClick={handleStart}
            disabled={!form.client_id || !form.audit_name}>
            <Play size={15} /> Iniciar escaneo
          </button>
        </div>
      </div>
    )
  }

  const progressPct = progress.total_ips > 0
    ? Math.round(((progress.live_count) / progress.total_ips) * 100)
    : 0

  return (
    <div className="space-y-4">
      {/* Estado */}
      <div className="flex items-center gap-3">
        {phase === 'scanning' ? (
          <Wifi size={20} className="text-primary animate-pulse" />
        ) : phase === 'done' ? (
          <CheckCircle size={20} className="text-success" />
        ) : (
          <AlertCircle size={20} className="text-critical" />
        )}
        <div className="flex-1">
          <p className="font-medium text-text-primary text-sm">
            {phase === 'scanning' ? 'Escaneo en progreso...' : phase === 'done' ? 'Escaneo completado' : 'Error en el escaneo'}
          </p>
          {phase === 'scanning' && (
            <p className="text-xs text-text-muted">
              {progress.live_count} activos / {progress.total_ips} IPs · {progress.devices_found} dispositivos
            </p>
          )}
        </div>
      </div>

      {/* Barra de progreso */}
      {phase === 'scanning' && (
        <div className="w-full bg-surface-2 rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Log de eventos */}
      <div className="bg-background border border-border rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs">
        {progress.events.map((e, i) => (
          <p key={i} className="text-text-secondary whitespace-pre leading-5">{e}</p>
        ))}
        <div ref={eventsEndRef} />
      </div>

      {/* Acciones */}
      <div className="flex gap-3 justify-end">
        {phase === 'scanning' && (
          <button className="btn-danger" onClick={handleCancel}>
            <StopCircle size={14} /> Cancelar escaneo
          </button>
        )}
        {phase === 'done' && auditId && (
          <button className="btn-success" onClick={() => onSuccess(auditId)}>
            <CheckCircle size={14} /> Ver resultados
          </button>
        )}
        {phase === 'error' && (
          <button className="btn-secondary" onClick={handleCancel}>Cerrar</button>
        )}
      </div>
    </div>
  )
}
