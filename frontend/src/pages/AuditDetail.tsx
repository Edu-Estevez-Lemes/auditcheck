import { useState, useMemo, Fragment } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Download, Server, AlertTriangle, Network, Shield,
  Copy, Monitor, Globe, Terminal, Pencil, Sparkles, Key, X, Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { auditsApi, rdpApi } from '../lib/api'
import { DeviceEditModal } from '../components/DeviceEditModal'
import type { Audit, Device, Finding } from '../types'
import { formatDate, SEVERITY_CONFIG, DEVICE_TYPE_LABELS } from '../lib/utils'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const SEV_COLORS = {
  critical: '#dc2626', high: '#ea580c', medium: '#d97706',
  low: '#2563eb', informational: '#6b7280',
}

// ─── Categorías de dispositivos ──────────────────────────────────────────────

interface CategoryTab {
  key: string
  label: string
  types: string[]
}

const CATEGORY_TABS: CategoryTab[] = [
  { key: 'all',            label: 'Todos',           types: [] },
  { key: 'windows_server', label: 'Windows Server',  types: ['windows_server'] },
  { key: 'windows_workstation', label: 'Windows PC', types: ['windows_workstation'] },
  { key: 'linux',          label: 'Linux',           types: ['linux'] },
  { key: 'vmware',         label: 'VMware',          types: ['esxi', 'vcenter', 'vmware_appliance'] },
  { key: 'fortigate',      label: 'Firewall',        types: ['fortigate', 'router'] },
  { key: 'veeam',          label: 'Veeam',           types: ['veeam'] },
  { key: 'nas',            label: 'NAS',             types: ['nas'] },
  { key: 'switch',         label: 'Switching',       types: ['switch'] },
  { key: 'printer',        label: 'Impresoras',      types: ['printer'] },
  { key: 'unknown',        label: 'Desconocidos',    types: ['unknown', 'custom'] },
]

function matchesCategory(device: Device, cat: CategoryTab): boolean {
  if (cat.key === 'all') return true
  return cat.types.includes(device.device_type)
}

// ─── Botones de acceso ───────────────────────────────────────────────────────

interface AccessBtn {
  type: 'rdp' | 'web' | 'ssh' | 'smb' | 'winrm' | 'copy'
  label: string
  title: string
  icon: React.ElementType
  style: string
  webUrl?: string            // URL destino para botones web
  credentialUsername?: string // usuario disponible para copiar (solo web con cred)
  credentialName?: string     // nombre de la credencial asociada
}

interface WebEntry {
  url: string
  label: string
}

function getDeviceWebEntries(d: Device): WebEntry[] {
  const ports = d.ports.map(p => p.port_number)
  const ip = d.ip_address

  // Dispositivos con URL específica por tipo (un solo botón)
  const byType: Record<string, WebEntry> = {
    esxi:      { url: `https://${ip}/ui`, label: 'ESXi' },
    vcenter:   { url: `https://${ip}/ui`, label: 'vCenter' },
    fortigate: { url: `https://${ip}`,    label: 'FortiGate' },
    ilo:       { url: `https://${ip}`,    label: 'iLO' },
    idrac:     { url: `https://${ip}`,    label: 'iDRAC' },
    printer:   { url: `http://${ip}`,     label: 'Web' },
  }
  if (byType[d.device_type]) return [byType[d.device_type]]

  // Genérico: mostrar HTTPS y/o HTTP por puerto detectado
  const entries: WebEntry[] = []
  if (ports.includes(443))       entries.push({ url: `https://${ip}`,      label: 'HTTPS' })
  else if (ports.includes(8443)) entries.push({ url: `https://${ip}:8443`, label: 'HTTPS' })
  else if (ports.includes(4443)) entries.push({ url: `https://${ip}:4443`, label: 'HTTPS' })
  else if (ports.includes(9443)) entries.push({ url: `https://${ip}:9443`, label: 'HTTPS' })

  if (ports.includes(80))        entries.push({ url: `http://${ip}`,       label: 'HTTP' })
  else if (ports.includes(8080)) entries.push({ url: `http://${ip}:8080`,  label: 'HTTP' })
  else if (ports.includes(8081)) entries.push({ url: `http://${ip}:8081`,  label: 'HTTP' })

  return entries
}

// getDeviceWebUrl — compatibilidad con usos existentes (devuelve la URL preferida)
function getDeviceWebUrl(d: Device): string | null {
  return getDeviceWebEntries(d)[0]?.url ?? null
}

function buildAccessButtons(device: Device, _auditId: number): AccessBtn[] {
  const ports = device.ports.map(p => p.port_number)
  const btns: AccessBtn[] = []
  const hasCred = !!device.credential_name
  const credUser = device.credential_username || undefined

  // ── RDP ──────────────────────────────────────────────────────────────────
  const hasRdp = ports.includes(3389) || ['windows_server', 'windows_workstation'].includes(device.device_type)
  if (hasRdp) {
    btns.push({
      type: 'rdp',
      label: hasCred ? '⚡ RDP' : 'RDP',
      title: hasCred
        ? `Abrir RDP con credenciales automáticas (${device.credential_name})`
        : `Descargar archivo RDP → ${device.ip_address}`,
      icon: hasCred ? Zap : Monitor,
      style: hasCred
        ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
        : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25',
    })
  }

  // ── HTTP / HTTPS ──────────────────────────────────────────────────────────
  const webEntries = getDeviceWebEntries(device)
  for (const entry of webEntries) {
    btns.push({
      type: 'web',
      label: hasCred ? `⚡ ${entry.label}` : entry.label,
      title: hasCred
        ? `${entry.url} · Credencial: ${device.credential_name}${credUser ? ` (${credUser})` : ''}`
        : entry.url,
      icon: Globe,
      style: hasCred
        ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
        : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25',
      webUrl: entry.url,
      credentialUsername: credUser,
      credentialName: device.credential_name || undefined,
    })
  }

  // ── SSH ───────────────────────────────────────────────────────────────────
  if (ports.includes(22)) {
    btns.push({
      type: 'ssh', label: 'SSH', title: `Copiar: ssh ${device.ip_address}`,
      icon: Terminal,
      style: 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/25',
    })
  }

  return btns
}

// ─── Componente de etiqueta de tipo ──────────────────────────────────────────

function DeviceTypeLabel({ device }: { device: Device }) {
  const label = device.device_type === 'custom' && device.custom_category
    ? device.custom_category
    : (DEVICE_TYPE_LABELS[device.device_type] ?? device.device_type)
  return <span className="badge badge-info text-xs">{label}</span>
}

// ─── Indicadores visuales ────────────────────────────────────────────────────

function DeviceBadges({ device }: { device: Device }) {
  return (
    <div className="flex gap-1 items-center">
      {device.is_new_device && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <Sparkles size={8} /> NUEVO
        </span>
      )}
      {device.manually_edited && (
        <span title="Editado manualmente">
          <Pencil size={11} className="text-amber-400" />
        </span>
      )}
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────

export function AuditDetail() {
  const { id } = useParams<{ id: string }>()
  const auditId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<'devices' | 'findings'>('devices')
  const [downloading, setDownloading] = useState(false)
  const [filterSev, setFilterSev] = useState<string>('all')
  const [categoryKey, setCategoryKey] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)

  const auditQ = useQuery<Audit>({
    queryKey: ['audit', auditId],
    queryFn: () => auditsApi.get(auditId).then(r => r.data),
  })
  const devicesQ = useQuery<Device[]>({
    queryKey: ['audit-devices', auditId],
    queryFn: () => auditsApi.getDevices(auditId).then(r => r.data),
    enabled: tab === 'devices',
  })
  const findingsQ = useQuery<Finding[]>({
    queryKey: ['audit-findings', auditId],
    queryFn: () => auditsApi.getFindings(auditId).then(r => r.data),
  })

  const audit = auditQ.data
  const devices = devicesQ.data ?? []
  const findings = findingsQ.data ?? []

  // Contar dispositivos por categoría
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: devices.length }
    CATEGORY_TABS.slice(1).forEach(cat => {
      map[cat.key] = devices.filter(d => matchesCategory(d, cat)).length
    })
    return map
  }, [devices])

  // Filtro de dispositivos
  const filteredDevices = useMemo(() => {
    const cat = CATEGORY_TABS.find(c => c.key === categoryKey) ?? CATEGORY_TABS[0]
    const q = search.toLowerCase()
    return devices.filter(d => {
      if (!matchesCategory(d, cat)) return false
      if (!q) return true
      return (
        d.ip_address.includes(q) ||
        (d.hostname ?? '').toLowerCase().includes(q) ||
        (d.display_name ?? '').toLowerCase().includes(q) ||
        (d.manufacturer ?? '').toLowerCase().includes(q) ||
        (d.os_type ?? '').toLowerCase().includes(q) ||
        (d.custom_category ?? '').toLowerCase().includes(q) ||
        (DEVICE_TYPE_LABELS[d.device_type] ?? '').toLowerCase().includes(q)
      )
    })
  }, [devices, categoryKey, search])

  const filteredFindings = filterSev === 'all' ? findings : findings.filter(f => f.severity === filterSev)

  const findingsBySev = findings.reduce<Record<string, number>>(
    (acc, f) => { acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc }, {}
  )
  const pieData = Object.entries(findingsBySev)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({
      name: SEVERITY_CONFIG[k as keyof typeof SEVERITY_CONFIG]?.label ?? k,
      value: v,
      color: SEV_COLORS[k as keyof typeof SEV_COLORS] ?? '#6b7280',
    }))

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const { data } = await auditsApi.downloadExcel(auditId)
      const name = audit?.name.replace(/\s+/g, '_') ?? 'auditoria'
      const url = URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url; a.download = `AUDITCHECK_${name}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Informe descargado')
    } catch { toast.error('Error al generar el informe') }
    finally { setDownloading(false) }
  }

  async function handleAccessBtn(btn: AccessBtn, device: Device) {
    // ── RDP ────────────────────────────────────────────────────────────────────
    if (btn.type === 'rdp') {
      const hasCred = !!device.credential_name
      const fileLabel = (device.display_name || device.hostname || device.ip_address)
        .replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40)

      if (hasCred) {
        // Con credencial: el backend ejecuta cmdkey + mstsc directamente (self-hosted)
        try {
          const { data } = await rdpApi.launch(auditId, device.id)
          toast.success(data.message || `Conectando a ${device.ip_address}...`)
        } catch (err: unknown) {
          const status = (err as { response?: { status?: number } })?.response?.status
          if (status === 501) {
            // Backend no corre en Windows → descargar .ps1 como alternativa
            try {
              const { data } = await auditsApi.launchRdp(auditId, device.id)
              const blob = new Blob([data])
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `RDP_${fileLabel}.ps1`
              a.click()
              URL.revokeObjectURL(url)
              toast.success(
                'Script RDP descargado → ejecútalo con PowerShell para conectar (incluye cmdkey automático)',
                { duration: 8000 }
              )
            } catch {
              toast.error('Error al generar el script RDP')
            }
          } else {
            const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
            toast.error(detail || 'Error al lanzar RDP')
          }
        }
      } else {
        // Sin credencial → descargar .rdp básico
        try {
          const { data } = await auditsApi.downloadRdp(auditId, device.id)
          const blob = new Blob([data], { type: 'application/x-rdp' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${fileLabel}.rdp`
          a.click()
          URL.revokeObjectURL(url)
          toast.success(`Archivo .rdp descargado → ábrelo para conectar a ${device.ip_address}`)
        } catch {
          toast.error('Error al generar el archivo RDP')
        }
      }
      return
    }

    // ── WEB (HTTP / HTTPS) ─────────────────────────────────────────────────────
    if (btn.type === 'web') {
      const url = btn.webUrl ?? getDeviceWebUrl(device)
      if (!url) return
      window.open(url, '_blank', 'noopener,noreferrer')
      if (btn.credentialUsername) {
        toast.success(
          `Abriendo ${url} · Usuario: ${btn.credentialUsername}`,
          { duration: 5000 }
        )
      }
      return
    }

    // ── SSH ────────────────────────────────────────────────────────────────────
    if (btn.type === 'ssh') {
      navigator.clipboard.writeText(`ssh ${device.ip_address}`)
      toast.success(`Copiado: ssh ${device.ip_address}`)
    } else if (btn.type === 'smb') {
      navigator.clipboard.writeText(`\\\\${device.ip_address}`)
      toast.success(`Copiado: \\\\${device.ip_address}`)
    }
  }

  async function handleUnassignCredential(device: Device) {
    try {
      await auditsApi.updateDevice(auditId, device.id, { credential_id: null })
      await queryClient.invalidateQueries({ queryKey: ['audit-devices', auditId] })
      toast.success(`Credencial desasignada de ${device.ip_address}`)
    } catch {
      toast.error('Error al desasignar la credencial')
    }
  }

  if (auditQ.isLoading) return (
    <div className="flex items-center justify-center h-64">
      <span className="animate-spin h-6 w-6 border-2 border-primary/30 border-t-primary rounded-full" />
    </div>
  )
  if (!audit) return <p className="text-text-muted">Auditoría no encontrada</p>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/audits')} className="btn-ghost p-2"><ArrowLeft size={18} /></button>
        <div className="flex-1">
          <h1 className="page-title">{audit.name}</h1>
          <p className="text-sm text-text-muted mt-0.5">
            <Link to={`/clients/${audit.client_id}`} className="text-primary hover:underline">Cliente</Link>
            {audit.completed_at && ` · ${formatDate(audit.completed_at)}`}
          </p>
        </div>
        {audit.status === 'completed' && (
          <button className="btn-success" onClick={handleDownload} disabled={downloading}>
            <Download size={15} />
            {downloading ? 'Generando...' : 'Descargar Excel'}
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Server,        label: 'Dispositivos', value: audit.total_devices,   color: 'text-primary' },
          { icon: AlertTriangle, label: 'Hallazgos',    value: audit.total_findings,  color: 'text-warning' },
          { icon: Shield,        label: 'Críticos',     value: audit.critical_findings, color: audit.critical_findings > 0 ? 'text-critical' : 'text-success' },
          { icon: Network,       label: 'Altos',        value: audit.high_findings,   color: audit.high_findings > 0 ? 'text-orange-400' : 'text-success' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="card flex items-center gap-3">
            <Icon size={22} className={color} />
            <div>
              <p className="text-text-muted text-xs">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Chart + info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card">
          <h3 className="section-title mb-3">Hallazgos por severidad</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={65}>
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #dde3ec', borderRadius: 8, color: '#1a2332' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-text-muted text-sm text-center py-8">Sin hallazgos</p>}
        </div>
        <div className="card lg:col-span-2">
          <h3 className="section-title mb-3">Información de la revisión</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Estado', audit.status],
              ['Rangos auditados', audit.scanned_ranges || '-'],
              ['Iniciado', formatDate(audit.started_at ?? null)],
              ['Completado', formatDate(audit.completed_at ?? null)],
              ['Versión', audit.app_version || '-'],
              ['Notas', audit.notes || '-'],
            ].map(([k, v]) => (
              <div key={k}>
                <span className="text-text-muted">{k}:</span>
                <span className="text-text-primary ml-2">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs principales */}
      <div className="flex gap-1 border-b border-border">
        {[
          { key: 'devices',  label: `Dispositivos (${audit.total_devices})`, icon: Server },
          { key: 'findings', label: `Hallazgos (${audit.total_findings})`,  icon: AlertTriangle },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as 'devices' | 'findings')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ── TAB DISPOSITIVOS ───────────────────────────────────────────────── */}
      {tab === 'devices' && (
        <div className="space-y-3">
          {/* Barra de búsqueda */}
          <div className="flex gap-3 items-center">
            <input
              className="input flex-1 text-sm"
              placeholder="Buscar por IP, hostname, fabricante, tipo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="text-xs text-text-muted hover:text-text-primary"
                onClick={() => setSearch('')}
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Filtros de categoría */}
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORY_TABS.map(cat => {
              const count = categoryCounts[cat.key] ?? 0
              if (cat.key !== 'all' && count === 0) return null
              return (
                <button
                  key={cat.key}
                  onClick={() => setCategoryKey(cat.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    categoryKey === cat.key
                      ? 'bg-primary text-white border-primary'
                      : 'border-border text-text-muted hover:border-primary/40'
                  }`}
                >
                  {cat.label}
                  <span className={`ml-1.5 font-bold ${categoryKey === cat.key ? 'text-white/80' : 'text-text-secondary'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Tabla de dispositivos */}
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>IP</th>
                  <th>Hostname / Nombre</th>
                  <th>Tipo</th>
                  <th>MAC / Fabricante</th>
                  <th>OS</th>
                  <th>Puertos</th>
                  <th>RTT</th>
                  <th>Acceso</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-text-muted">
                      {search ? `Sin resultados para "${search}"` : 'Sin dispositivos en esta categoría'}
                    </td>
                  </tr>
                )}
                {filteredDevices.map(d => {
                  const accessBtns = buildAccessButtons(d, auditId)
                  const displayLabel = d.display_name || d.hostname
                  return (
                    <tr key={d.id}>
                      {/* IP + badges */}
                      <td>
                        <div className="space-y-1">
                          <span className="font-mono text-sm text-primary">{d.ip_address}</span>
                          <DeviceBadges device={d} />
                          {d.credential_name && (
                            <span
                              title={`Credencial: ${d.credential_name}${d.credential_username ? ` · ${d.credential_username}` : ''}`}
                              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25"
                            >
                              <Key size={8} /> {d.credential_name}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Hostname / nombre visible */}
                      <td className="text-sm max-w-[200px]">
                        {d.display_name && (
                          <p className="font-medium text-text-primary truncate">{d.display_name}</p>
                        )}
                        {d.hostname && (
                          <p className={`font-mono truncate ${d.display_name ? 'text-xs text-text-muted' : 'text-text-primary'}`}>
                            {d.hostname}
                          </p>
                        )}
                        {!d.display_name && !d.hostname && (
                          <span className="text-text-muted">-</span>
                        )}
                        {d.location && (
                          <p className="text-[11px] text-text-muted truncate">{d.location}</p>
                        )}
                      </td>

                      {/* Tipo */}
                      <td><DeviceTypeLabel device={d} /></td>

                      {/* MAC + Fabricante */}
                      <td className="text-xs">
                        {d.mac_address
                          ? <span className="font-mono text-text-muted">{d.mac_address}</span>
                          : <span className="text-text-muted/50">No disponible</span>
                        }
                        {d.manufacturer && (
                          <p className="text-text-secondary mt-0.5">{d.manufacturer}</p>
                        )}
                      </td>

                      {/* OS */}
                      <td className="text-xs text-text-muted max-w-[120px]">
                        <span className="truncate block">{d.os_type || '-'}</span>
                      </td>

                      {/* Puertos */}
                      <td>
                        {d.ports.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {d.ports.slice(0, 7).map(p => (
                              <span
                                key={p.id}
                                title={p.service ?? undefined}
                                className={`text-xs font-mono px-1 rounded ${
                                  p.is_risky ? 'bg-warning/20 text-warning' : 'bg-surface-2 text-text-secondary'
                                }`}
                              >
                                {p.port_number}
                              </span>
                            ))}
                            {d.ports.length > 7 && (
                              <span className="text-xs text-text-muted">+{d.ports.length - 7}</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* RTT */}
                      <td className="text-xs text-text-muted">
                        {d.response_time_ms ? `${d.response_time_ms.toFixed(0)}ms` : '-'}
                      </td>

                      {/* Botones de acceso */}
                      <td>
                        <div className="flex items-center gap-1 flex-wrap">
                          {accessBtns.map(btn => (
                            <Fragment key={btn.label}>
                              <button
                                title={btn.title}
                                onClick={() => handleAccessBtn(btn, d)}
                                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors font-medium ${btn.style}`}
                              >
                                <btn.icon size={11} /> {btn.label}
                              </button>
                              {/* Botón "copiar usuario" para web con credenciales */}
                              {btn.type === 'web' && btn.credentialUsername && (
                                <button
                                  title={`Copiar usuario: ${btn.credentialUsername}`}
                                  onClick={() => {
                                    navigator.clipboard.writeText(btn.credentialUsername!)
                                    toast.success(`Usuario copiado: ${btn.credentialUsername}`)
                                  }}
                                  className="inline-flex items-center text-xs px-1.5 py-1 rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                                >
                                  <Copy size={9} />
                                </button>
                              )}
                            </Fragment>
                          ))}

                          {/* Gestión rápida de credencial RDP */}
                          {d.credential_name && (
                            <>
                              <button
                                title={`Editar credencial RDP: ${d.credential_name}`}
                                onClick={() => setEditingDevice(d)}
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors"
                              >
                                <Key size={11} />
                              </button>
                              <button
                                title={`Quitar credencial RDP: ${d.credential_name}`}
                                onClick={() => handleUnassignCredential(d)}
                                className="inline-flex items-center gap-1 text-xs px-1.5 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                              >
                                <X size={11} />
                              </button>
                            </>
                          )}

                          {/* SMB si aplica */}
                          {d.ports.some(p => p.port_number === 445) && (
                            <button
                              title={`Copiar ruta SMB: \\\\${d.ip_address}`}
                              onClick={() => {
                                navigator.clipboard.writeText(`\\\\${d.ip_address}`)
                                toast.success(`Copiado: \\\\${d.ip_address}`)
                              }}
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors font-medium"
                            >
                              SMB
                            </button>
                          )}
                          {/* WinRM badge */}
                          {d.ports.some(p => [5985, 5986].includes(p.port_number)) && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-text-muted" title="WinRM disponible">
                              WinRM
                            </span>
                          )}
                          {/* Copiar IP */}
                          <button
                            title="Copiar IP"
                            onClick={() => { navigator.clipboard.writeText(d.ip_address); toast.success(`IP copiada: ${d.ip_address}`) }}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-surface-2 text-text-muted hover:text-text-primary hover:bg-border transition-colors"
                          >
                            <Copy size={11} />
                          </button>
                        </div>
                      </td>

                      {/* Editar */}
                      <td>
                        <button
                          title="Editar dispositivo (nombre, tipo, ubicación, credencial...)"
                          onClick={() => setEditingDevice(d)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-surface-2 text-text-muted hover:text-text-primary hover:bg-border transition-colors"
                        >
                          <Pencil size={11} /> Editar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {filteredDevices.length > 0 && (
            <p className="text-xs text-text-muted text-right">
              {filteredDevices.length} de {devices.length} dispositivos
            </p>
          )}
        </div>
      )}

      {/* ── TAB HALLAZGOS ──────────────────────────────────────────────────── */}
      {tab === 'findings' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(['all', 'critical', 'high', 'medium', 'low', 'informational'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilterSev(s)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filterSev === s ? 'bg-primary text-white border-primary' : 'border-border text-text-muted hover:border-primary/40'
                }`}
              >
                {s === 'all' ? 'Todos' : SEVERITY_CONFIG[s]?.label ?? s}
                {s !== 'all' && findings.filter(f => f.severity === s).length > 0 && (
                  <span className="ml-1 font-bold">{findings.filter(f => f.severity === s).length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredFindings.length === 0 && (
              <div className="card text-center py-8 text-text-muted">Sin hallazgos para este filtro</div>
            )}
            {filteredFindings.map(f => {
              const sevCfg = SEVERITY_CONFIG[f.severity as keyof typeof SEVERITY_CONFIG]
              const sevColor = SEV_COLORS[f.severity as keyof typeof SEV_COLORS]
              return (
                <div key={f.id} className="card border-l-4 space-y-2" style={{ borderLeftColor: sevColor }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${sevCfg?.className}`}>{sevCfg?.label}</span>
                      <span className="badge badge-info">{f.category}</span>
                    </div>
                    <span className={`badge ${f.status === 'open' ? 'badge-warning' : 'badge-success'} shrink-0`}>
                      {f.status === 'open' ? 'Abierto' : f.status === 'resolved' ? 'Resuelto' : f.status}
                    </span>
                  </div>
                  {(f.device_ip || f.evidence) && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-sm"
                         style={{ backgroundColor: `${sevColor}15`, border: `1px solid ${sevColor}30` }}>
                      {f.device_ip && <span className="font-mono font-bold text-text-primary text-base">{f.device_ip}</span>}
                      {f.device_hostname && <span className="text-text-secondary">· {f.device_hostname}</span>}
                      {f.evidence && (
                        <span className="ml-auto font-mono text-xs font-semibold px-2 py-0.5 rounded"
                              style={{ backgroundColor: `${sevColor}20`, color: sevColor }}>
                          {f.evidence}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="font-semibold text-text-primary">{f.title}</p>
                  {f.description && <p className="text-text-secondary text-sm leading-relaxed">{f.description}</p>}
                  {f.recommendation && (
                    <div className="pt-2 border-t border-border">
                      <p className="text-sm text-text-secondary">
                        <span className="font-semibold text-primary">Recomendación: </span>
                        {f.recommendation}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal de edición */}
      {editingDevice && (
        <DeviceEditModal
          device={editingDevice}
          auditId={auditId}
          onClose={() => setEditingDevice(null)}
        />
      )}
    </div>
  )
}
