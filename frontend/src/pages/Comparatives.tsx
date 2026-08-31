import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitCompare, ArrowRight, TrendingUp, TrendingDown, Minus, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { auditsApi, clientsApi } from '../lib/api'
import type { AuditSummary, ClientSummary, ComparisonResult } from '../types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { SEVERITY_CONFIG } from '../lib/utils'
import { useThemeStore } from '../store/themeStore'

export function ComparativesPage() {
  const theme = useThemeStore((s) => s.theme)
  const tooltipStyle = theme === 'dark'
    ? { background: '#1c182a', border: '1px solid #28203e', borderRadius: 8, color: '#ede9fe' }
    : { background: '#ffffff', border: '1px solid #ddd6fe', borderRadius: 8, color: '#1e0b3e' }
  const barActual = theme === 'dark' ? '#8b5cf6' : '#7c3aed'
  const barAnterior = theme === 'dark' ? '#4a4066' : '#c4b5fd'
  const axisColor = theme === 'dark' ? '#9d8ec4' : '#4a3570'

  const [clientId, setClientId] = useState<number | null>(null)
  const [auditAId, setAuditAId] = useState<number | null>(null)
  const [auditBId, setAuditBId] = useState<number | null>(null)
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloadingExcel, setDownloadingExcel] = useState(false)

  const { data: clients = [] } = useQuery<ClientSummary[]>({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list().then((r) => r.data),
  })
  const { data: audits = [] } = useQuery<AuditSummary[]>({
    queryKey: ['audits', clientId],
    queryFn: () => auditsApi.list(clientId ?? undefined).then((r) => r.data),
    enabled: clientId !== null,
  })

  // Las auditorías manuales no tienen datos de escaneo (dispositivos/puertos) y se excluyen
  // del comparador técnico — se identifican con el badge "Manual" en el resto de la app.
  const completedAudits = audits.filter((a) => a.status === 'completed' && a.audit_type !== 'manual')

  const handleCompare = async () => {
    if (!auditAId || !auditBId) return
    setLoading(true)
    try {
      const { data } = await auditsApi.compare(auditAId, auditBId)
      setResult(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadExcel = async () => {
    if (!auditAId || !auditBId) return
    setDownloadingExcel(true)
    try {
      const { data } = await auditsApi.compareExcel(auditAId, auditBId)
      const clientName = clients.find((c) => c.id === clientId)?.name?.replace(/\s+/g, '_') ?? 'cliente'
      const url = URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `AUDITCHECK_Comparativa_${clientName}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel comparativa generado')
    } catch {
      toast.error('Error al generar el Excel comparativa')
    } finally {
      setDownloadingExcel(false)
    }
  }

  // Datos para gráfico comparativo
  const severities = ['critical', 'high', 'medium', 'low', 'informational']
  const chartData = result
    ? severities.map((s) => ({
        name: SEVERITY_CONFIG[s as keyof typeof SEVERITY_CONFIG]?.label ?? s,
        Anterior: result.findings_before[s] ?? 0,
        Actual: result.findings_after[s] ?? 0,
      }))
    : []

  const devicesDiff = result ? result.devices_after - result.devices_before : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Comparativas</h1>
        <p className="text-sm text-text-muted mt-1">
          Compara dos revisiones del mismo cliente para detectar cambios y evolución
        </p>
      </div>

      {/* Selector */}
      <div className="card space-y-4">
        <h3 className="section-title">Seleccionar revisiones a comparar</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="form-group">
            <label className="label">Cliente</label>
            <select
              className="input"
              value={clientId ?? ''}
              onChange={(e) => { setClientId(Number(e.target.value)); setAuditAId(null); setAuditBId(null); setResult(null) }}
            >
              <option value="">Selecciona un cliente...</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Revisión A (anterior)</label>
            <select
              className="input"
              value={auditAId ?? ''}
              onChange={(e) => setAuditAId(Number(e.target.value))}
              disabled={!clientId}
            >
              <option value="">Selecciona revisión...</option>
              {completedAudits.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Revisión B (actual)</label>
            <select
              className="input"
              value={auditBId ?? ''}
              onChange={(e) => setAuditBId(Number(e.target.value))}
              disabled={!clientId}
            >
              <option value="">Selecciona revisión...</option>
              {completedAudits.filter((a) => a.id !== auditAId).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={handleCompare}
          disabled={!auditAId || !auditBId || loading}
        >
          <GitCompare size={15} />
          {loading ? 'Comparando...' : 'Comparar revisiones'}
        </button>
      </div>

      {/* Resultados */}
      {result && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="section-title">Resultado de la comparativa</h3>
            <button className="btn-success" onClick={handleDownloadExcel} disabled={downloadingExcel}>
              <Download size={15} />
              {downloadingExcel ? 'Generando...' : 'Generar Excel comparativa'}
            </button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card text-center">
              <p className="text-text-muted text-xs mb-1">Dispositivos anterior</p>
              <p className="text-2xl font-bold text-text-primary">{result.devices_before}</p>
            </div>
            <div className="card text-center">
              <p className="text-text-muted text-xs mb-1">Dispositivos actual</p>
              <p className={`text-2xl font-bold ${devicesDiff > 0 ? 'text-warning' : devicesDiff < 0 ? 'text-success' : 'text-text-primary'}`}>
                {result.devices_after}
                {devicesDiff !== 0 && (
                  <span className="text-sm ml-1">{devicesDiff > 0 ? `+${devicesDiff}` : devicesDiff}</span>
                )}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-text-muted text-xs mb-1">Nuevos hallazgos</p>
              <p className="text-2xl font-bold text-warning">{result.new_findings.length}</p>
            </div>
            <div className="card text-center">
              <p className="text-text-muted text-xs mb-1">Hallazgos resueltos</p>
              <p className="text-2xl font-bold text-success">{result.resolved_findings.length}</p>
            </div>
          </div>

          {/* Chart */}
          <div className="card">
            <h3 className="section-title mb-4">Evolución de hallazgos por severidad</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 12 }} />
                <YAxis tick={{ fill: axisColor, fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="Anterior" fill={barAnterior} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Actual" fill={barActual} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cambios — dispositivos y hallazgos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChangeSection
              title="Dispositivos nuevos"
              items={result.new_devices}
              icon={<TrendingUp size={16} className="text-warning" />}
              render={(d) => `${d.ip} ${d.hostname ? `(${d.hostname})` : ''}`}
              emptyMsg="Sin dispositivos nuevos"
            />
            <ChangeSection
              title="Dispositivos desaparecidos"
              items={result.removed_devices}
              icon={<TrendingDown size={16} className="text-critical" />}
              render={(d) => `${d.ip} ${d.hostname ? `(${d.hostname})` : ''}`}
              emptyMsg="Sin dispositivos eliminados"
            />
            <ChangeSection
              title="IPs nuevas"
              items={result.new_ips.map((ip) => ({ ip }))}
              icon={<TrendingUp size={16} className="text-warning" />}
              render={(d) => d.ip}
              emptyMsg="Sin IPs nuevas"
            />
          </div>

          {/* Cambios — puertos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChangeSection
              title="Puertos nuevos"
              items={result.new_ports}
              icon={<TrendingUp size={16} className="text-warning" />}
              render={(p) => `${p.ip}${p.hostname ? ` (${p.hostname})` : ''} · puerto ${p.port}`}
              emptyMsg="Sin puertos nuevos"
            />
            <ChangeSection
              title="Puertos cerrados"
              items={result.closed_ports}
              icon={<TrendingDown size={16} className="text-success" />}
              render={(p) => `${p.ip}${p.hostname ? ` (${p.hostname})` : ''} · puerto ${p.port}`}
              emptyMsg="Sin puertos cerrados"
            />
          </div>

          {/* Cambios — hallazgos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChangeSection
              title="Hallazgos nuevos"
              items={result.new_findings}
              icon={<TrendingUp size={16} className="text-warning" />}
              render={(f) => f.title}
              emptyMsg="Sin nuevos hallazgos"
            />
            <ChangeSection
              title="Hallazgos resueltos"
              items={result.resolved_findings}
              icon={<TrendingDown size={16} className="text-success" />}
              render={(f) => f.title}
              emptyMsg="Sin hallazgos resueltos"
            />
            <ChangeSection
              title="Hallazgos persistentes"
              items={result.persistent_findings}
              icon={<Minus size={16} className="text-text-muted" />}
              render={(f) => f.title}
              emptyMsg="Sin hallazgos persistentes"
            />
          </div>
        </div>
      )}
    </div>
  )
}

const COLLAPSED_LIMIT = 8

function ChangeSection<T>({ title, items, icon, render, emptyMsg }: {
  title: string
  items: T[]
  icon: React.ReactNode
  render: (item: T) => string
  emptyMsg: string
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, COLLAPSED_LIMIT)

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold text-text-primary">{title} ({items.length})</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-text-muted text-xs">{emptyMsg}</p>
      ) : (
        <>
          <ul className="space-y-1">
            {visible.map((item, i) => {
              const text = render(item)
              return (
                <li key={i} className="text-xs text-text-secondary bg-surface-2 rounded px-2 py-1 truncate" title={text}>
                  {text}
                </li>
              )
            })}
          </ul>
          {items.length > COLLAPSED_LIMIT && (
            <button
              type="button"
              className="text-xs text-primary hover:underline mt-2"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? 'Ver menos' : `Ver todos (${items.length})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
