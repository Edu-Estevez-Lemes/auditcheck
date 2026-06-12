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
  checklist: () => api.get('/reviews/checklist'),
  list: (auditId?: number, clientId?: number) =>
    api.get('/reviews/', { params: { ...(auditId ? { audit_id: auditId } : {}), ...(clientId ? { client_id: clientId } : {}) } }),
  create: (data: unknown) => api.post('/reviews/', data),
  update: (id: number, data: unknown) => api.put(`/reviews/${id}`, data),
  last: (clientId: number) => api.get('/reviews/last', { params: { client_id: clientId } }),
  delete: (id: number) => api.delete(`/reviews/${id}`),
  exportExcel: (id: number) => api.get(`/reviews/${id}/export/excel`, { responseType: 'blob' }),
  exportPdf: (id: number) => api.get(`/reviews/${id}/export/pdf`, { responseType: 'blob' }),
  // Configuración por cliente
  getConfig: (clientId: number) => api.get(`/reviews/configs/${clientId}`),
  upsertConfig: (data: unknown) => api.post('/reviews/configs', data),
  // Estado de revisión para múltiples clientes (badges en listado)
  getStatus: (clientIds: number[]) =>
    api.get('/reviews/status', { params: { client_ids: clientIds.join(',') } }),
}

// Auth
export const authApi = {
  login: (username: string, password: string) => {
    const form = new FormData()
    form.append('username', username)
    form.append('password', password)
    return api.post('/auth/login', form)
  },
  me: () => api.get('/auth/me'),
  updateMe: (data: unknown) => api.put('/auth/me', data),
  listUsers: () => api.get('/auth/users'),
  createUser: (data: unknown) => api.post('/auth/users', data),
  deleteUser: (id: number) => api.delete(`/auth/users/${id}`),
}
