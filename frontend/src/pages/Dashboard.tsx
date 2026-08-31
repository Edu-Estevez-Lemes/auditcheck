import { useQuery } from '@tanstack/react-query'
import {
  Users, ClipboardList, AlertTriangle, Server,
  TrendingUp, Clock, CheckCircle
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { dashboardApi } from '../lib/api'
import { formatDate, SEVERITY_CONFIG, STATUS_AUDIT, timeAgo } from '../lib/utils'
import type { DashboardStats, AuditSummary } from '../types'
import { useThemeStore } from '../store/themeStore'

const SEVERITY_COLORS = {
  critical: '#dc2626', high: '#ea580c', medium: '#d97706',
  low: '#2563eb', informational: '#6b7280',
}

function StatCard({
  icon: Icon, label, value, sub, color = 'text-primary',
}: {
  icon: React.ElementType; label: string; value: number | string; sub?: string; color?: string
}) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`p-3 rounded-xl bg-surface-2 ${color}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-text-muted text-sm">{label}</p>
        <p className="text-2xl font-bold text-text-primary mt-0.5">{value}</p>
        {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export function Dashboard() {
  const theme = useThemeStore((s) => s.theme)
  const tooltipStyle = theme === 'dark'
    ? { background: '#1c182a', border: '1px solid #28203e', borderRadius: 8, color: '#ede9fe' }
    : { background: '#ffffff', border: '1px solid #ddd6fe', borderRadius: 8, color: '#1e0b3e' }

  const statsQ = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.stats().then((r) => r.data),
    refetchInterval: 60_000,
  })
  const auditsQ = useQuery<AuditSummary[]>({
    queryKey: ['recent-audits'],
    queryFn: () => dashboardApi.recentAudits(8).then((r) => r.data),
    refetchInterval: 60_000,
  })

  const stats = statsQ.data
  const recentAudits = auditsQ.data ?? []

  // Datos para gráfico de hallazgos
  const findingsPieData = stats
    ? Object.entries(stats.findings)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({
          name: SEVERITY_CONFIG[k as keyof typeof SEVERITY_CONFIG]?.label ?? k,
          value: v,
          color: SEVERITY_COLORS[k as keyof typeof SEVERITY_COLORS] ?? '#6b7280',
        }))
    : []

  if (statsQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="animate-spin h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users} label="Clientes activos"
          value={stats?.clients.active ?? 0}
          sub={`${stats?.clients.total ?? 0} en total`}
        />
        <StatCard
          icon={ClipboardList} label="Auditorías"
          value={stats?.audits.completed ?? 0}
          sub={`${stats?.audits.total ?? 0} en total`}
          color="text-accent"
        />
        <StatCard
          icon={AlertTriangle} label="Hallazgos abiertos"
          value={stats?.total_open_findings ?? 0}
          sub={`${stats?.findings.critical ?? 0} críticos`}
          color="text-warning"
        />
        <StatCard
          icon={Server} label="Dispositivos"
          value={stats?.total_devices ?? 0}
          color="text-success"
        />
      </div>

      {/* Charts + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pie chart hallazgos */}
        <div className="card">
          <h3 className="section-title mb-4">Hallazgos abiertos por severidad</h3>
          {findingsPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={findingsPieData} dataKey="value" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`}>
                  {findingsPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: tooltipStyle.color }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-text-muted">
              <CheckCircle size={40} className="text-success/50 mb-2" />
              <p className="text-sm">Sin hallazgos abiertos</p>
            </div>
          )}
        </div>

        {/* Auditorías recientes */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Auditorías recientes</h3>
            <Link to="/audits" className="text-xs text-primary hover:underline">Ver todas</Link>
          </div>
          <div className="space-y-2">
            {recentAudits.length === 0 && (
              <p className="text-text-muted text-sm py-4 text-center">Sin auditorías recientes</p>
            )}
            {recentAudits.map((a) => {
              const statusCfg = STATUS_AUDIT[a.status as keyof typeof STATUS_AUDIT]
              return (
                <Link key={a.id} to={`/audits/${a.id}`} className="block">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-2 hover:bg-border-2 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate flex items-center gap-1.5">
                        {a.name}
                        {a.audit_type === 'manual' && (
                          <span className="badge badge-info text-[10px] shrink-0" title="Auditoría manual (sin escaneo)">Manual</span>
                        )}
                      </p>
                      <p className="text-xs text-text-muted">{a.client_name}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {a.critical_findings > 0 && (
                        <span className="badge-critical">{a.critical_findings} críticos</span>
                      )}
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <Clock size={12} />
                        {a.completed_at ? timeAgo(a.completed_at) : a.status}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: '/clients', label: 'Gestionar clientes', icon: Users },
          { to: '/audits', label: 'Nueva auditoría', icon: ClipboardList },
          { to: '/comparatives', label: 'Comparar revisiones', icon: TrendingUp },
          { to: '/settings', label: 'Configuración', icon: Server },
        ].map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="card-sm flex items-center gap-3 hover:border-primary/40 transition-colors cursor-pointer"
          >
            <Icon size={18} className="text-primary" />
            <span className="text-sm text-text-secondary">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
