import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30_000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    if (err.response?.status === 423) {
      // Bloque 2 — vault bloqueado: no cerramos sesión, solo pedimos la passphrase.
      import('../store/vaultStore').then(({ useVaultStore }) => useVaultStore.getState().promptUnlock())
    }
    return Promise.reject(err)
  }
)

export default api

// Clientes
export const clientsApi = {
  list: () => api.get('/clients/'),
  get: (id: number) => api.get(`/clients/${id}`),
  create: (data: unknown) => api.post('/clients/', data),
  update: (id: number, data: unknown) => api.put(`/clients/${id}`, data),
  delete: (id: number) => api.delete(`/clients/${id}`),
  uploadLogo: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/clients/${id}/logo`, form)
  },
  getIpRanges: (id: number) => api.get(`/clients/${id}/ip-ranges`),
  addIpRange: (id: number, data: { range: string; description?: string }) =>
    api.post(`/clients/${id}/ip-ranges`, data),
  deleteIpRange: (clientId: number, rangeId: number) =>
    api.delete(`/clients/${clientId}/ip-ranges/${rangeId}`),
}

// Credenciales
export const credentialsApi = {
  list: (clientId?: number) =>
    api.get('/credentials/', { params: clientId ? { client_id: clientId } : {} }),
  create: (data: unknown) => api.post('/credentials/', data),
  update: (id: number, data: unknown) => api.put(`/credentials/${id}`, data),
  delete: (id: number) => api.delete(`/credentials/${id}`),
  getPassword: (id: number) => api.get(`/credentials/${id}/password`),
  test: (id: number, data: { host: string; port: number }) =>
    api.post(`/credentials/${id}/test`, data),
}

// Auditorías
export const auditsApi = {
  list: (clientId?: number) =>
    api.get('/audits/', { params: clientId ? { client_id: clientId } : {} }),
  get: (id: number) => api.get(`/audits/${id}`),
  create: (data: unknown) => api.post('/audits/', data),
  update: (id: number, data: unknown) => api.put(`/audits/${id}`, data),
  delete: (id: number) => api.delete(`/audits/${id}`),
  deleteBatch: (ids: number[]) => api.delete('/audits/batch', { data: { ids } }),
  getDevices: (id: number) => api.get(`/audits/${id}/devices`),
  updateDevice: (auditId: number, deviceId: number, data: unknown) =>
    api.put(`/audits/${auditId}/devices/${deviceId}`, data),
  downloadRdp: (auditId: number, deviceId: number) =>
    api.get(`/audits/${auditId}/devices/${deviceId}/rdp`, { responseType: 'blob' }),
  launchRdp: (auditId: number, deviceId: number) =>
    api.get(`/audits/${auditId}/devices/${deviceId}/rdp-launch`, { responseType: 'blob' }),
  getClientCredentials: (auditId: number) => api.get(`/audits/${auditId}/client-credentials`),
  getFindings: (id: number) => api.get(`/audits/${id}/findings`),
  addFinding: (id: number, data: unknown) => api.post(`/audits/${id}/findings`, data),
  updateFinding: (auditId: number, findingId: number, data: unknown) =>
    api.put(`/audits/${auditId}/findings/${findingId}`, data),
  downloadExcel: (id: number) =>
    api.get(`/audits/${id}/report/excel`, { responseType: 'blob' }),
  compare: (aId: number, bId: number) => api.get(`/audits/compare/${aId}/${bId}`),
  compareExcel: (aId: number, bId: number) =>
    api.get(`/audits/compare/${aId}/${bId}/excel`, { responseType: 'blob' }),
  getNetworkMap: (id: number) => api.get(`/audits/${id}/network-map`),
}

// Escaneo
export const scanApi = {
  start: (data: unknown) => api.post('/scan/start', data),
  cancel: (scanId: string) => api.post(`/scan/cancel/${scanId}`),
}

// Dashboard
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
  recentAudits: (limit = 10) => api.get('/dashboard/recent-audits', { params: { limit } }),
  findingsTrend: (days = 30) => api.get('/dashboard/findings-trend', { params: { days } }),
}

// RDP nativo — lanza mstsc directamente desde el backend local (self-hosted)
export const rdpApi = {
  launch: (auditId: number, deviceId: number) =>
    api.post('/rdp/launch', { audit_id: auditId, device_id: deviceId }),
}

// Acceso web asistido — credenciales + perfiles de login
export const accessApi = {
  getWebCredentials: (auditId: number, deviceId: number) =>
    api.post('/access/web-credentials', { audit_id: auditId, device_id: deviceId }),
  listLoginProfiles: (deviceType?: string) =>
    api.get('/access/login-profiles', { params: deviceType ? { device_type: deviceType } : {} }),
}

// Revisiones Manuales
export const reviewsApi = {
  checklist: (clientId?: number) =>
    api.get('/reviews/checklist', { params: clientId ? { client_id: clientId } : {} }),
  list: (auditId?: number, clientId?: number) =>
    api.get('/reviews/', { params: { ...(auditId ? { audit_id: auditId } : {}), ...(clientId ? { client_id: clientId } : {}) } }),
  create: (data: unknown) => api.post('/reviews/', data),
  update: (id: number, data: unknown) => api.put(`/reviews/${id}`, data),
  last: (clientId: number) => api.get('/reviews/last', { params: { client_id: clientId } }),
  delete: (id: number) => api.delete(`/reviews/${id}`),
  deleteBatch: (ids: number[]) => api.delete('/reviews/batch', { data: { ids } }),
  exportExcel: (id: number) => api.get(`/reviews/${id}/export/excel`, { responseType: 'blob' }),
  exportPdf: (id: number) => api.get(`/reviews/${id}/export/pdf`, { responseType: 'blob' }),
  // Configuración por cliente
  getConfig: (clientId: number) => api.get(`/reviews/configs/${clientId}`),
  upsertConfig: (data: unknown) => api.post('/reviews/configs', data),
  // Estado de revisión para múltiples clientes (badges en listado)
  getStatus: (clientIds: number[]) =>
    api.get('/reviews/status', { params: { client_ids: clientIds.join(',') } }),
}

// Marca de informes (logo + colores corporativos de PDF/Excel)
export const reportBrandingApi = {
  getConfig: () => api.get('/branding/report-config'),
  updateConfig: (data: { header_color: string; accent_color: string; separator_color: string; date_format: string }) =>
    api.put('/branding/report-config', data),
  uploadLogo: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/branding/report-logo', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

// Categorías de revisión (gestión — cualquier usuario autenticado)
export const reviewCategoriesApi = {
  list: () => api.get('/reviews/categories/'),
  create: (data: { label: string; key?: string; order?: number }) => api.post('/reviews/categories/', data),
  update: (id: number, data: { label?: string; order?: number }) => api.put(`/reviews/categories/${id}`, data),
  reorder: (order: number[]) => api.put('/reviews/categories/reorder', { order }),
  delete: (id: number, force = false) => api.delete(`/reviews/categories/${id}`, { params: { force } }),
}

// Plantillas de checklist (privadas por usuario)
export const reviewTemplatesApi = {
  list: () => api.get('/reviews/templates/'),
  create: (data: unknown) => api.post('/reviews/templates/', data),
  get: (id: number) => api.get(`/reviews/templates/${id}`),
  update: (id: number, data: unknown) => api.put(`/reviews/templates/${id}`, data),
  delete: (id: number) => api.delete(`/reviews/templates/${id}`),
  affectedClients: (id: number) => api.get(`/reviews/templates/${id}/affected-clients`),
  diff: (id: number, clientId: number) => api.get(`/reviews/templates/${id}/diff/${clientId}`),
  propagate: (id: number, clientIds: number[]) =>
    api.post(`/reviews/templates/${id}/propagate`, { client_ids: clientIds }),
}

// Consola de Red
export const consoleApi = {
  startSession: () => api.post('/ws/console/session'),
}

// Auth
export const authApi = {
  bootstrapStatus: () => api.get('/auth/bootstrap-status'),
  login: (username: string, password: string) => {
    const form = new FormData()
    form.append('username', username)
    form.append('password', password)
    return api.post('/auth/login', form)
  },
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  updateMe: (data: unknown) => api.put('/auth/me', data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/auth/change-password', data),
  listUsers: () => api.get('/auth/users'),
  createUser: (data: unknown) => api.post('/auth/users', data),
  updateUser: (id: number, data: unknown) => api.put(`/auth/users/${id}`, data),
  deleteUser: (id: number) => api.delete(`/auth/users/${id}`),
  updateUserRole: (id: number, role: string) => api.put(`/auth/users/${id}/role`, { role }),
  resetPassword: (id: number) => api.put(`/auth/users/${id}/reset-password`),
  setAvatarPreset: (preset: string) => api.put('/auth/me/avatar/preset', { preset }),
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/auth/me/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  deleteAvatar: () => api.delete('/auth/me/avatar'),
}

// Registro de actividad
export const auditLogApi = {
  list: (params?: { user_id?: number; action?: string; date_from?: string; date_to?: string }) =>
    api.get('/audit-log/', { params }),
}

// Bloque 3 — Base de datos: backup, exportación cifrada, importación/restauración
export const databaseApi = {
  info: () => api.get('/database/info'),
  listBackups: () => api.get('/database/backups'),
  createBackup: () => api.post('/database/backup'),
  openBackupsFolder: () => api.post('/database/open-backups-folder'),
  openExportsFolder: () => api.post('/database/open-exports-folder'),
  export: (data: {
    client_ids: number[] | null
    include_credentials: boolean
    password_mode: 'vault' | 'custom'
    password: string
    confirm_password?: string
  }) => api.post('/database/export', data, { responseType: 'blob' }),
  importPreview: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/database/import/preview', form)
  },
  importConfirm: (file: File, data: {
    password: string
    mode: 'restore' | 'merge' | 'replace'
    include_credentials: boolean
    confirm_word?: string
  }) => {
    const form = new FormData()
    form.append('file', file)
    form.append('password', data.password)
    form.append('mode', data.mode)
    form.append('include_credentials', String(data.include_credentials))
    if (data.confirm_word) form.append('confirm_word', data.confirm_word)
    return api.post('/database/import/confirm', form)
  },
}
