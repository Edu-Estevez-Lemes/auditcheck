export interface User {
  id: number
  username: string
  email: string
  full_name: string
  is_active: boolean
  is_admin: boolean
  must_change_password: boolean
  created_at: string
}

export interface Token {
  access_token: string
  token_type: string
  user: User
}

export interface Client {
  id: number
  name: string
  cif_nif?: string
  address?: string
  contact_person?: string
  phone?: string
  email?: string
  logo_path?: string
  observations?: string
  is_active: boolean
  created_at: string
  updated_at: string
  ip_ranges: IPRange[]
}

export interface ClientSummary {
  id: number
  name: string
  is_active: boolean
  logo_path?: string
  total_audits: number
  last_audit_date?: string
  open_findings: number
  critical_findings: number
}

export interface IPRange {
  id: number
  client_id: number
  range: string
  description?: string
  is_active: boolean
}

export interface Credential {
  id: number
  client_id?: number
  name: string
  credential_type: string
  username?: string
  host?: string
  port?: number
  domain?: string
  notes?: string
  status: 'unknown' | 'valid' | 'invalid' | 'expired'
  is_preferred: boolean
  has_password: boolean
  last_used?: string
  last_validated?: string
  created_at: string
  updated_at: string
}

export interface Audit {
  id: number
  client_id: number
  technician_id?: number
  name: string
  status: 'pending' | 'scanning' | 'completed' | 'error'
  started_at?: string
  completed_at?: string
  file_path?: string
  notes?: string
  summary?: Record<string, unknown>
  scanned_ranges?: string
  app_version?: string
  created_at: string
  updated_at: string
  total_devices: number
  total_findings: number
  critical_findings: number
  high_findings: number
}

export interface AuditSummary {
  id: number
  client_id: number
  client_name: string
  name: string
  status: string
  started_at?: string
  completed_at?: string
  total_devices: number
  total_findings: number
  critical_findings: number
}

export interface Device {
  id: number
  audit_id: number
  ip_address: string
  hostname?: string
  netbios_name?: string
  mac_address?: string
  manufacturer?: string
  os_type?: string
  os_version?: string
  device_type: string
  display_name?: string
  custom_category?: string
  location?: string
  description?: string
  observations?: string
  manually_edited: boolean
  is_new_device: boolean
  credential_id?: number
  credential_name?: string
  credential_username?: string
  credential_domain?: string
  is_up: boolean
  response_time_ms?: number
  ttl?: number
  first_seen?: string
  last_seen?: string
  ports: Port[]
}

export interface DeviceUpdate {
  display_name?: string
  hostname?: string
  device_type?: string
  custom_category?: string
  manufacturer?: string
  os_type?: string
  location?: string
  description?: string
  observations?: string
  credential_id?: number | null
}

export interface Port {
  id: number
  port_number: number
  protocol: string
  service?: string
  state: string
  banner?: string
  is_risky: boolean
}

export interface Finding {
  id: number
  audit_id: number
  device_id?: number
  client_id: number
  category: string
  title: string
  description?: string
  evidence?: string
  recommendation?: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'
  status: 'open' | 'resolved' | 'accepted' | 'false_positive'
  resolved_at?: string
  resolution_notes?: string
  created_at: string
  device_ip?: string
  device_hostname?: string
}

export interface DashboardStats {
  clients: { total: number; active: number }
  audits: { total: number; completed: number }
  findings: Record<string, number>
  total_open_findings: number
  total_devices: number
}

export interface ScanEvent {
  type: string
  ip?: string
  hostname?: string
  response_time_ms?: number
  device?: Device
  total_ips?: number
  live_count?: number
  total?: number
  audit_id?: number
  error?: string
}

export interface ComparisonResult {
  audit_a_id: number
  audit_b_id: number
  audit_a_name: string
  audit_b_name: string
  new_devices: Array<{ ip: string; hostname?: string; device_type: string }>
  removed_devices: Array<{ ip: string; hostname?: string; device_type: string }>
  changed_devices: Array<{ ip: string; hostname?: string; changes: Record<string, unknown> }>
  new_ips: string[]
  hostname_changes: Array<{ ip: string; hostname?: string; before?: string; after?: string }>
  type_changes: Array<{ ip: string; hostname?: string; before?: string; after?: string }>
  new_ports: Array<{ ip: string; hostname?: string; port: number }>
  closed_ports: Array<{ ip: string; hostname?: string; port: number }>
  devices_before: number
  devices_after: number
  new_findings: Array<{ title: string; severity: string; category: string }>
  resolved_findings: Array<{ title: string; severity: string; category: string }>
  persistent_findings: Array<{ title: string; severity: string; category: string }>
  findings_before: Record<string, number>
  findings_after: Record<string, number>
}
