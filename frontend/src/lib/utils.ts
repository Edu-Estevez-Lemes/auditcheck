import { clsx, type ClassValue } from 'clsx'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatDate(date: string | null | undefined, fmt = 'dd/MM/yyyy HH:mm'): string {
  if (!date) return '-'
  try {
    return format(parseISO(date), fmt, { locale: es })
  } catch {
    return date
  }
}

export function timeAgo(date: string | null | undefined): string {
  if (!date) return '-'
  try {
    return formatDistanceToNow(parseISO(date), { addSuffix: true, locale: es })
  } catch {
    return date
  }
}

export const SEVERITY_CONFIG = {
  critical:      { label: 'CRÍTICO',    className: 'badge-critical', color: '#dc2626' },
  high:          { label: 'ALTO',       className: 'badge-high',     color: '#ea580c' },
  medium:        { label: 'MEDIO',      className: 'badge-medium',   color: '#d97706' },
  low:           { label: 'BAJO',       className: 'badge-low',      color: '#2563eb' },
  informational: { label: 'INFO',       className: 'badge-info',     color: '#6b7280' },
} as const

export const STATUS_AUDIT = {
  pending:   { label: 'Pendiente', className: 'badge-info' },
  scanning:  { label: 'Escaneando', className: 'badge-warning' },
  completed: { label: 'Completada', className: 'badge-success' },
  error:     { label: 'Error', className: 'badge-error' },
} as const

export const DEVICE_TYPE_LABELS: Record<string, string> = {
  windows_server: 'Windows Server',
  windows_workstation: 'Windows PC',
  linux: 'Linux',
  esxi: 'VMware ESXi',
  vcenter: 'VMware vCenter',
  fortigate: 'FortiGate',
  nas: 'NAS',
  switch: 'Switch',
  router: 'Router',
  ilo: 'HP iLO',
  idrac: 'Dell iDRAC',
  printer: 'Impresora',
  veeam: 'Veeam',
  unknown: 'Desconocido',
}

export const CREDENTIAL_TYPES = [
  { value: 'windows',   label: 'Windows / Dominio' },
  { value: 'vmware',    label: 'VMware' },
  { value: 'veeam',     label: 'Veeam' },
  { value: 'fortigate', label: 'FortiGate' },
  { value: 'ssh',       label: 'SSH' },
  { value: 'snmp',      label: 'SNMP' },
  { value: 'ilo',       label: 'HP iLO' },
  { value: 'idrac',     label: 'Dell iDRAC' },
  { value: 'nas',       label: 'NAS' },
  { value: 'database',  label: 'Base de datos' },
]

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
