import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitCompare, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { auditsApi, clientsApi } from '../lib/api'
import type { AuditSummary, ClientSummary, ComparisonResult } from '../types'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { SEVERITY_CONFIG } from '../lib/utils'

export function ComparativesPage() {
  const [clientId, setClientId] = useState<number | null>(null)
  const [auditAId, setAuditAId] = useState<number | null>(null)
  const [auditBId, setAuditBId] = useState<number | null>(null)
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(false)

  const { data: clients = [] } = useQuery<ClientSummary[]>({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list().then((r) => r.data),
  })
  const { data: audits = [] } = useQuery<AuditSummary[]>({
    queryKey: ['audits', clientId],
    queryFn: () => auditsApi.list(clientId ?? undefined).then((r) => r.data),
    enabled: clientId !== null,
  })

  const completedAudits = audits.filter((a) => a.status === 'completed')

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
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #dde3ec', borderRadius: 8, color: '#1a2332' }} />
                <Legend />
                <Bar dataKey="Anterior" fill="#6b7280" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Actual" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cambios */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChangeSection
              title="Dispositivos nuevos"
              items={result.new_devices as Record<string, string>[]}
              icon={<TrendingUp size={16} className="text-warning" />}
              render={(d) => `${d.ip} ${d.hostname ? `(${d.hostname})` : ''}`}
              emptyMsg="Sin dispositivos nuevos"
            />
            <ChangeSection
              title="Dispositivos desaparecidos"
              items={result.removed_devices as Record<string, string>[]}
              icon={<TrendingDown size={16} className="text-critical" />}
              render={(d) => `${d.ip} ${d.hostname ? `(${d.hostname})` : ''}`}
              emptyMsg="Sin dispositivos eliminados"
            />
            <ChangeSection
              title="Hallazgos persistentes"
              items={result.persistent_findings as Record<string, string>[]}
              icon={<Minus size={16} className="text-text-muted" />}
              render={(f) => f.title}
              emptyMsg="Sin hallazgos persistentes"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChangeSection
              title="Hallazgos nuevos"
              items={result.new_findings as Record<string, string>[]}
              icon={<TrendingUp size={16} className="text-warning" />}
              render={(f) => f.title}
              emptyMsg="Sin nuevos hallazgos"
            />
            <ChangeSection
              title="Hallazgos resueltos"
              items={result.resolved_findings as Record<string, string>[]}
              icon={<TrendingDown size={16} className="text-success" />}
              render={(f) => f.title}
              emptyMsg="Sin hallazgos resueltos"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ChangeSection({ title, items, icon, render, emptyMsg }: {
  title: string
  items: Record<string, string>[]
  icon: React.ReactNode
  render: (item: Record<string, string>) => string
  emptyMsg: string
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold text-text-primary">{title} ({items.length})</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-text-muted text-xs">{emptyMsg}</p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 8).map((item, i) => (
            <li key={i} className="text-xs text-text-secondary bg-surface-2 rounded px-2 py-1 truncate">
              {render(item)}
            </li>
          ))}
          {items.length > 8 && (
            <li className="text-xs text-text-muted">+{items.length - 8} más...</li>
          )}
        </ul>
      )}
    </div>
  )
}
