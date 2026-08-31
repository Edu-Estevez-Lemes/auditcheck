import { useState, useMemo, Fragment } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Download, Server, AlertTriangle, Network, Shield, Plus,
  Copy, Monitor, Globe, Terminal, Pencil, Sparkles, Key, Zap,
  ChevronUp, ChevronDown, ChevronsUpDown, ClipboardList, Map, XCircle,
} from 'lucide-react'
import { useThemeStore } from '../store/themeStore'
import toast from 'react-hot-toast'
import { auditsApi, rdpApi, accessApi } from '../lib/api'
import { DeviceEditModal } from '../components/DeviceEditModal'
import { WebCredentialPanel } from '../components/WebCredentialPanel'
import { CredentialQuickPanel } from '../components/CredentialQuickPanel'
import { ReviewWizardModal } from '../components/ReviewWizardModal'
import { NetworkMap } from '../components/NetworkMap'
import type { WebCredData } from '../components/WebCredentialPanel'
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

const STATIC_CATEGORY_TABS: CategoryTab[] = [
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
  { key: 'ilo',            label: 'HP iLO',          types: ['ilo'] },
  { key: 'idrac',          label: 'Dell iDRAC',      types: ['idrac'] },
  { key: 'unknown',        label: 'Desconocidos',    types: ['unknown', 'custom'] },
]

// Tipos cubiertos por tabs estáticas (para detectar tipos "huérfanos")
const STATIC_COVERED_TYPES = new Set(STATIC_CATEGORY_TABS.flatMap(c => c.types))

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

// ─── Icono de ordenación ─────────────────────────────────────────────────────

function SortIcon({ field, current, dir }: { field: string; current: string | null; dir: 'asc' | 'desc' }) {
  if (current !== field)
    return <ChevronsUpDown size={11} className="opacity-25 group-hover:opacity-60 transition-opacity" />
  return dir === 'asc'
    ? <ChevronUp size={11} className="text-primary" />
    : <ChevronDown size={11} className="text-primary" />
}

// ─── Componente principal ────────────────────────────────────────────────────

export function AuditDetail() {
  const { id } = useParams<{ id: string }>()
  const auditId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const theme = useThemeStore((s) => s.theme)
  const tooltipStyle = theme === 'dark'
    ? { background: '#1c182a', border: '1px solid #28203e', borderRadius: 8, color: '#ede9fe' }
    : { background: '#ffffff', border: '1px solid #ddd6fe', borderRadius: 8, color: '#1e0b3e' }

  const [tab, setTab] = useState<'devices' | 'findings' | 'topology'>('devices')
  const [findingsDeviceFilter, setFindingsDeviceFilter] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [filterSev, setFilterSev] = useState<string>('all')
  const [categoryKey, setCategoryKey] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [filterCredentials, setFilterCredentials] = useState(false)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [addingDevice, setAddingDevice] = useState(false)
  const [credPanel, setCredPanel] = useState<{ open: boolean; device: Device | null }>({ open: false, device: null })
  const [reviewWizardOpen, setReviewWizardOpen] = useState(false)
  const [webPanel, setWebPanel] = useState<{
    open: boolean
    loading: boolean
    url: string
    deviceLabel: string
    data: WebCredData | null
  }>({ open: false, loading: false, url: '', deviceLabel: '', data: null })

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

  // Pestañas dinámicas: añade una por cada tipo de dispositivo no cubierto por tabs estáticas
  const allCategoryTabs = useMemo(() => {
    const extra = new Set<string>()
    devices.forEach(d => {
      if (!STATIC_COVERED_TYPES.has(d.device_type) && d.device_type !== 'unknown' && d.device_type !== 'custom') {
        extra.add(d.device_type)
      }
    })
    const dynamic: CategoryTab[] = Array.from(extra).map(type => ({
      key: type,
      label: DEVICE_TYPE_LABELS[type] ?? type,
      types: [type],
    }))
    // Insertar dinámicas antes de "Desconocidos" (último tab estático)
    return [
      ...STATIC_CATEGORY_TABS.slice(0, -1),
      ...dynamic,
      STATIC_CATEGORY_TABS[STATIC_CATEGORY_TABS.length - 1],
    ]
  }, [devices])

  // Contar dispositivos por categoría
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: devices.length }
    allCategoryTabs.slice(1).forEach(cat => {
      map[cat.key] = devices.filter(d => matchesCategory(d, cat)).length
    })
    return map
  }, [devices, allCategoryTabs])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // Filtro de dispositivos
  const filteredDevices = useMemo(() => {
    const cat = allCategoryTabs.find(c => c.key === categoryKey) ?? allCategoryTabs[0]
    const q = search.toLowerCase()
    return devices.filter(d => {
      if (!matchesCategory(d, cat)) return false
      if (filterCredentials && !d.credential_name) return false
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
  }, [devices, categoryKey, search, filterCredentials, allCategoryTabs])

  const sortedDevices = useMemo(() => {
    if (!sortField) return filteredDevices
    return [...filteredDevices].sort((a, b) => {
      let aVal: string | number = ''
      let bVal: string | number = ''
      switch (sortField) {
        case 'ip': {
          const ip2n = (ip: string) => ip.split('.').reduce((acc, n) => acc * 256 + parseInt(n, 10), 0)
          aVal = ip2n(a.ip_address)
          bVal = ip2n(b.ip_address)
          break
        }
        case 'hostname':
          aVal = (a.display_name || a.hostname || '').toLowerCase()
          bVal = (b.display_name || b.hostname || '').toLowerCase()
          break
        case 'type':
          aVal = (DEVICE_TYPE_LABELS[a.device_type] ?? a.device_type).toLowerCase()
          bVal = (DEVICE_TYPE_LABELS[b.device_type] ?? b.device_type).toLowerCase()
          break
        case 'mac':
          aVal = (a.mac_address || '').toLowerCase()
          bVal = (b.mac_address || '').toLowerCase()
          break
        case 'os':
          aVal = (a.os_type || '').toLowerCase()
          bVal = (b.os_type || '').toLowerCase()
          break
        case 'rtt':
          aVal = a.response_time_ms ?? Infinity
          bVal = b.response_time_ms ?? Infinity
          break
      }
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filteredDevices, sortField, sortDir])

  const filteredFindings = filterSev === 'all' ? findings : findings.filter(f => f.severity === filterSev)
  const findingsForDisplay = findingsDeviceFilter != null
    ? filteredFindings.filter(f => f.device_id === findingsDeviceFilter)
    : filteredFindings

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

      // Abrir URL en una ventana nueva independiente (no en pestaña del navegador actual)
      const winFeatures = 'noopener,noreferrer,popup=yes,width=1366,height=850,menubar=no,toolbar=no,location=no,status=no'
      window.open(url, '_blank', winFeatures)

      // Si hay credencial → mostrar panel de asistencia al login
      if (btn.credentialName && device.credential_id) {
        const label = device.display_name || device.hostname || device.ip_address
        setWebPanel({ open: true, loading: true, url, deviceLabel: label, data: null })
        try {
          const { data } = await accessApi.getWebCredentials(auditId, device.id)
          setWebPanel(prev => ({ ...prev, loading: false, data: data as WebCredData }))
        } catch {
          setWebPanel(prev => ({ ...prev, loading: false }))
          toast.error('No se pudieron cargar las credenciales')
        }
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
          <h1 className="page-title flex items-center gap-2">
            {audit.name}
            {audit.audit_type === 'manual' && (
              <span className="badge badge-info text-[10px]" title="Auditoría manual (sin escaneo)">Manual</span>
            )}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            <Link to={`/clients/${audit.client_id}`} className="text-primary hover:underline">Cliente</Link>
            {audit.completed_at && ` · ${formatDate(audit.completed_at)}`}
          </p>
        </div>
        {audit.audit_type === 'manual' && (
          <button className="btn-ghost flex items-center gap-1.5" onClick={() => setAddingDevice(true)}>
            <Plus size={15} />
            Añadir host
          </button>
        )}
        {audit.total_devices > 0 && (
          <button className="btn-ghost flex items-center gap-1.5" onClick={() => setReviewWizardOpen(true)}>
            <ClipboardList size={15} />
            Revisión Manual
          </button>
        )}
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
                <Tooltip contentStyle={tooltipStyle} />
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
          { key: 'topology', label: 'Mapa de Red', icon: Map },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as 'devices' | 'findings' | 'topology')}
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
          <div className="flex gap-2 items-center">
            <input
              className="input flex-1 text-sm"
              placeholder="Buscar por IP, hostname, fabricante, tipo..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="text-xs text-text-muted hover:text-text-primary shrink-0"
                onClick={() => setSearch('')}
              >
                Limpiar
              </button>
            )}
            <button
              onClick={() => setFilterCredentials(f => !f)}
              title={filterCredentials
                ? 'Mostrando solo hosts con credenciales — pulsa para ver todos'
                : 'Filtrar: mostrar solo hosts con credenciales registradas'}
              className={`shrink-0 p-2 rounded-lg border transition-all ${
                filterCredentials
                  ? 'border-primary bg-primary/15 ring-1 ring-primary/30'
                  : 'border-border hover:border-primary/40 opacity-50 hover:opacity-100'
              }`}
            >
              <img
                src="/api/v1/branding/emoji1"
                alt="Con credenciales"
                className="w-5 h-5 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </button>
          </div>

          {/* Filtros de categoría */}
          <div className="flex gap-1.5 flex-wrap">
            {allCategoryTabs.map(cat => {
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
                  {[
                    { label: 'IP',              field: 'ip'       },
                    { label: 'Hostname / Nombre', field: 'hostname' },
                    { label: 'Tipo',            field: 'type'     },
                    { label: 'MAC / Fabricante', field: 'mac'      },
                    { label: 'OS',              field: 'os'       },
                  ].map(({ label, field }) => (
                    <th
                      key={field}
                      onClick={() => handleSort(field)}
                      className="cursor-pointer select-none hover:text-primary group transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        {label}
                        <SortIcon field={field} current={sortField} dir={sortDir} />
                      </span>
                    </th>
                  ))}
                  <th>Puertos</th>
                  <th
                    onClick={() => handleSort('rtt')}
                    className="cursor-pointer select-none hover:text-primary group transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      RTT
                      <SortIcon field="rtt" current={sortField} dir={sortDir} />
                    </span>
                  </th>
                  <th>Acceso</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedDevices.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-text-muted">
                      {filterCredentials
                        ? 'Ningún host tiene credenciales registradas en esta selección'
                        : search
                          ? `Sin resultados para "${search}"`
                          : 'Sin dispositivos en esta categoría'}
                    </td>
                  </tr>
                )}
                {sortedDevices.map(d => {
                  const accessBtns = buildAccessButtons(d, auditId)
                  const displayLabel = d.display_name || d.hostname
                  return (
                    <tr key={d.id}>
                      {/* IP + badges */}
                      <td>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            {d.credential_name && (
                              <img
                                src="/api/v1/branding/emoji1"
                                alt=""
                                title={`Credenciales registradas: ${d.credential_name}`}
                                className="w-5 h-5 shrink-0 object-contain"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                              />
                            )}
                            <span className="font-mono text-sm text-primary">{d.ip_address}</span>
                          </div>
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

                          {/* Gestión rápida de credenciales */}
                          <button
                            title={d.credential_name
                              ? `Gestionar credencial: ${d.credential_name}`
                              : 'Añadir credencial a este host'}
                            onClick={() => setCredPanel({ open: true, device: d })}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                              d.credential_name
                                ? 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25'
                                : 'bg-surface-2 text-text-muted hover:text-primary hover:bg-primary/10'
                            }`}
                          >
                            <Key size={11} />
                            {d.credential_name
                              ? (d.credential_name.length > 14 ? d.credential_name.slice(0, 14) + '…' : d.credential_name)
                              : 'Credenciales'}
                          </button>

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

          {sortedDevices.length > 0 && (
            <p className="text-xs text-text-muted text-right">
              {sortedDevices.length} de {devices.length} dispositivos
              {filterCredentials && (
                <span className="ml-2 text-primary">· filtro: con credenciales</span>
              )}
            </p>
          )}
        </div>
      )}

      {/* ── TAB HALLAZGOS ──────────────────────────────────────────────────── */}
      {tab === 'findings' && (
        <div className="space-y-3">
          {findingsDeviceFilter != null && (
            <div className="flex items-center gap-2 text-xs bg-primary/10 border border-primary/30 text-primary rounded-lg px-3 py-2 w-fit">
              Filtrando por dispositivo (ID {findingsDeviceFilter})
              <button onClick={() => setFindingsDeviceFilter(null)} className="flex items-center gap-1 font-semibold hover:underline">
                <XCircle size={13} /> Quitar filtro
              </button>
            </div>
          )}
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
            {findingsForDisplay.length === 0 && (
              <div className="card text-center py-8 text-text-muted">Sin hallazgos para este filtro</div>
            )}
            {findingsForDisplay.map(f => {
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

      {/* ── TAB MAPA DE RED ────────────────────────────────────────────────── */}
      {tab === 'topology' && (
        <NetworkMap
          auditId={auditId}
          auditName={audit.name}
          onViewFindings={(deviceId) => { setTab('findings'); setFindingsDeviceFilter(deviceId) }}
        />
      )}

      {/* Panel flotante de credenciales web */}
      <WebCredentialPanel
        isOpen={webPanel.open}
        loading={webPanel.loading}
        url={webPanel.url}
        deviceLabel={webPanel.deviceLabel}
        data={webPanel.data}
        onClose={() => setWebPanel(prev => ({ ...prev, open: false }))}
      />

      {/* Modal de edición */}
      {editingDevice && (
        <DeviceEditModal
          device={editingDevice}
          auditId={auditId}
          onClose={() => setEditingDevice(null)}
        />
      )}

      {/* Modal de alta manual de host */}
      {addingDevice && (
        <DeviceEditModal
          device={null}
          auditId={auditId}
          onClose={() => setAddingDevice(false)}
        />
      )}

      {/* Panel rápido de credenciales */}
      {credPanel.device && audit && (
        <CredentialQuickPanel
          isOpen={credPanel.open}
          device={credPanel.device}
          auditId={auditId}
          clientId={audit.client_id}
          onClose={() => setCredPanel(prev => ({ ...prev, open: false }))}
          onDeviceUpdate={() => queryClient.invalidateQueries({ queryKey: ['audit-devices', auditId] })}
        />
      )}

      {/* ── REVISIÓN MANUAL ─────────────────────────────────────────────────── */}
      <ReviewWizardModal
        open={reviewWizardOpen}
        onClose={() => setReviewWizardOpen(false)}
        auditId={auditId}
        clientId={audit.client_id}
        auditType={audit.audit_type}
      />
    </div>
  )
}
