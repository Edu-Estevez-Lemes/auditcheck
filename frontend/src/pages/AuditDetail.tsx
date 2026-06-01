import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, Server, AlertTriangle, Network, Shield, ExternalLink, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { auditsApi } from '../lib/api'
import type { Audit, Device, Finding } from '../types'
import { formatDate, SEVERITY_CONFIG, DEVICE_TYPE_LABELS } from '../lib/utils'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const SEV_COLORS = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#2563eb', informational: '#6b7280' }

function getDeviceWebUrl(d: Device): string | null {
  const ports = d.ports.map(p => p.port_number)
  const ip = d.ip_address

  const webUrlByType: Record<string, string> = {
    esxi:      `https://${ip}/ui`,
    vcenter:   `https://${ip}/ui`,
    fortigate: `https://${ip}`,
    ilo:       `https://${ip}`,
    idrac:     `https://${ip}`,
    printer:   `http://${ip}`,
  }
  if (webUrlByType[d.device_type]) return webUrlByType[d.device_type]

  if (ports.includes(443))  return `https://${ip}`
  if (ports.includes(8443)) return `https://${ip}:8443`
  if (ports.includes(4443)) return `https://${ip}:4443`
  if (ports.includes(9443)) return `https://${ip}:9443`
  if (ports.includes(80))   return `http://${ip}`
  if (ports.includes(8080)) return `http://${ip}:8080`
  if (ports.includes(8081)) return `http://${ip}:8081`
  return null
}

const DEVICE_WEB_LABELS: Record<string, string> = {
  esxi: 'VMware ESXi', vcenter: 'vCenter', fortigate: 'FortiGate',
  ilo: 'iLO', idrac: 'iDRAC', printer: 'Impresora',
}

export function AuditDetail() {
  const { id } = useParams<{ id: string }>()
  const auditId = Number(id)
  const navigate = useNavigate()
  const [tab, setTab] = useState<'devices' | 'findings'>('devices')
  const [downloading, setDownloading] = useState(false)
  const [filterSev, setFilterSev] = useState<string>('all')

  const auditQ = useQuery<Audit>({
    queryKey: ['audit', auditId],
    queryFn: () => auditsApi.get(auditId).then((r) => r.data),
  })
  const devicesQ = useQuery<Device[]>({
    queryKey: ['audit-devices', auditId],
    queryFn: () => auditsApi.getDevices(auditId).then((r) => r.data),
    enabled: tab === 'devices',
  })
  const findingsQ = useQuery<Finding[]>({
    queryKey: ['audit-findings', auditId],
    queryFn: () => auditsApi.getFindings(auditId).then((r) => r.data),
  })

  const audit = auditQ.data
  const devices = devicesQ.data ?? []
  const findings = findingsQ.data ?? []

  const filteredFindings = filterSev === 'all' ? findings : findings.filter((f) => f.severity === filterSev)

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
      const client_name = audit?.name.replace(/\s+/g, '_') ?? 'auditoria'
      const url = URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url; a.download = `AUDITCHECK_${client_name}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Informe descargado')
    } catch { toast.error('Error al generar el informe') }
    finally { setDownloading(false) }
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
          { icon: Server, label: 'Dispositivos', value: audit.total_devices, color: 'text-primary' },
          { icon: AlertTriangle, label: 'Hallazgos', value: audit.total_findings, color: 'text-warning' },
          { icon: Shield, label: 'Críticos', value: audit.critical_findings, color: audit.critical_findings > 0 ? 'text-critical' : 'text-success' },
          { icon: Network, label: 'Altos', value: audit.high_findings, color: audit.high_findings > 0 ? 'text-orange-400' : 'text-success' },
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

      {/* Chart + rangos */}
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { key: 'devices', label: `Dispositivos (${audit.total_devices})`, icon: Server },
          { key: 'findings', label: `Hallazgos (${audit.total_findings})`, icon: AlertTriangle },
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

      {/* Devices tab */}
      {tab === 'devices' && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>{['IP', 'Hostname', 'Tipo', 'MAC', 'Fabricante', 'OS', 'Puertos', 'RTT', 'Acceso'].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {devices.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-text-muted">Sin dispositivos</td></tr>
              )}
              {devices.map((d) => (
                <tr key={d.id}>
                  <td className="font-mono text-sm text-primary">{d.ip_address}</td>
                  <td className="text-sm">{d.hostname || '-'}</td>
                  <td><span className="badge badge-info text-xs">{DEVICE_TYPE_LABELS[d.device_type] ?? d.device_type}</span></td>
                  <td className="font-mono text-xs text-text-muted">{d.mac_address || '-'}</td>
                  <td className="text-xs text-text-muted">{d.manufacturer || '-'}</td>
                  <td className="text-xs text-text-muted">{d.os_type || '-'}</td>
                  <td>
                    {d.ports.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {d.ports.slice(0, 6).map((p) => (
                          <span key={p.id} className={`text-xs font-mono px-1 rounded ${p.is_risky ? 'bg-warning/20 text-warning' : 'bg-surface-2 text-text-secondary'}`}>
                            {p.port_number}
                          </span>
                        ))}
                        {d.ports.length > 6 && <span className="text-xs text-text-muted">+{d.ports.length - 6}</span>}
                      </div>
                    )}
                  </td>
                  <td className="text-xs text-text-muted">
                    {d.response_time_ms ? `${d.response_time_ms.toFixed(0)}ms` : '-'}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      {(() => {
                        const url = getDeviceWebUrl(d)
                        const label = DEVICE_WEB_LABELS[d.device_type] ?? 'Abrir'
                        return url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            title={url}
                          >
                            <ExternalLink size={11} /> {label}
                          </a>
                        ) : null
                      })()}
                      <button
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-surface-2 text-text-muted hover:text-text-primary hover:bg-border transition-colors"
                        title="Copiar IP"
                        onClick={() => { navigator.clipboard.writeText(d.ip_address); toast.success(`IP copiada: ${d.ip_address}`) }}
                      >
                        <Copy size={11} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Findings tab */}
      {tab === 'findings' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(['all', 'critical', 'high', 'medium', 'low', 'informational'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterSev(s)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  filterSev === s ? 'bg-primary text-white border-primary' : 'border-border text-text-muted hover:border-primary/40'
                }`}
              >
                {s === 'all' ? 'Todos' : SEVERITY_CONFIG[s]?.label ?? s}
                {s !== 'all' && findings.filter((f) => f.severity === s).length > 0 && (
                  <span className="ml-1 font-bold">{findings.filter((f) => f.severity === s).length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredFindings.length === 0 && (
              <div className="card text-center py-8 text-text-muted">Sin hallazgos para este filtro</div>
            )}
            {filteredFindings.map((f) => {
              const sevCfg = SEVERITY_CONFIG[f.severity as keyof typeof SEVERITY_CONFIG]
              const sevColor = SEV_COLORS[f.severity as keyof typeof SEV_COLORS]
              return (
                <div key={f.id} className="card border-l-4 space-y-2" style={{ borderLeftColor: sevColor }}>

                  {/* Fila superior: severidad + categoría + estado */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${sevCfg?.className}`}>{sevCfg?.label}</span>
                      <span className="badge badge-info">{f.category}</span>
                    </div>
                    <span className={`badge ${f.status === 'open' ? 'badge-warning' : 'badge-success'} shrink-0`}>
                      {f.status === 'open' ? 'Abierto' : f.status === 'resolved' ? 'Resuelto' : f.status}
                    </span>
                  </div>

                  {/* IP + hostname + evidencia (puerto) — DESTACADO */}
                  {(f.device_ip || f.evidence) && (
                    <div className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-sm"
                         style={{ backgroundColor: `${sevColor}15`, border: `1px solid ${sevColor}30` }}>
                      {f.device_ip && (
                        <span className="font-mono font-bold text-text-primary text-base">{f.device_ip}</span>
                      )}
                      {f.device_hostname && (
                        <span className="text-text-secondary">· {f.device_hostname}</span>
                      )}
                      {f.evidence && (
                        <span className="ml-auto font-mono text-xs font-semibold px-2 py-0.5 rounded"
                              style={{ backgroundColor: `${sevColor}20`, color: sevColor }}>
                          {f.evidence}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Título del problema */}
                  <p className="font-semibold text-text-primary">{f.title}</p>

                  {/* Descripción */}
                  {f.description && (
                    <p className="text-text-secondary text-sm leading-relaxed">{f.description}</p>
                  )}

                  {/* Recomendación */}
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
    </div>
  )
}
