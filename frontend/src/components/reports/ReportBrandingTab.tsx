import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, RotateCcw, Save, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { reportBrandingApi } from '../../lib/api'
import type { ReportBrandingConfig } from '../../types'

const DEFAULTS: ReportBrandingConfig = {
  header_color: '15121F',
  accent_color: '7C3AED',
  separator_color: '8B5CF6',
}

const FIELDS: { key: keyof ReportBrandingConfig; label: string; desc: string }[] = [
  { key: 'header_color', label: 'Color de cabecera / título', desc: 'Fondo de los títulos y cabeceras de tabla principales del informe.' },
  { key: 'accent_color', label: 'Color de acento de sección', desc: 'Barras de sección (p. ej. "RESUMEN") y banners de dispositivo.' },
  { key: 'separator_color', label: 'Color de línea separadora', desc: 'Línea entre la cabecera y el contenido (borde en Excel, regla en PDF).' },
]

function normalizeHex(v: string): string {
  return v.replace(/^#/, '').toUpperCase()
}

export function ReportBrandingTab() {
  const qc = useQueryClient()
  const [form, setForm] = useState<ReportBrandingConfig>(DEFAULTS)
  const [logoBust, setLogoBust] = useState(Date.now())

  const { data } = useQuery<ReportBrandingConfig>({
    queryKey: ['report-branding-config'],
    queryFn: () => reportBrandingApi.getConfig().then(r => r.data),
  })

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const saveMut = useMutation({
    mutationFn: (payload: ReportBrandingConfig) => reportBrandingApi.updateConfig(payload),
    onSuccess: () => {
      toast.success('Colores de informe guardados')
      qc.invalidateQueries({ queryKey: ['report-branding-config'] })
    },
    onError: () => toast.error('Error al guardar los colores'),
  })

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await reportBrandingApi.uploadLogo(file)
      toast.success('Logo de informes actualizado')
      setLogoBust(Date.now())
    } catch {
      toast.error('Error al subir el logo')
    }
    e.target.value = ''
  }

  const setColor = (key: keyof ReportBrandingConfig, value: string) =>
    setForm(prev => ({ ...prev, [key]: normalizeHex(value) }))

  return (
    <div className="space-y-5">
      <div className="card space-y-4 max-w-lg">
        <h3 className="section-title">Logo de informes</h3>
        <p className="text-sm text-text-muted">
          Logo que aparece en los informes PDF y Excel generados (auditorías y revisiones). Si no subes uno,
          se usa el logo de AuditCheck de <span className="text-text-primary">Identidad visual</span>.
        </p>
        <div className="flex items-center gap-4 p-4 bg-surface-2 rounded-lg border border-border">
          <img
            key={logoBust}
            src={`/api/v1/branding/report-logo?t=${logoBust}`}
            alt="Logo de informes"
            className="h-12 max-w-[160px] object-contain bg-white rounded p-1"
            onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden' }}
          />
          <div className="flex-1">
            <p className="text-xs text-text-muted">PNG recomendado, fondo transparente.</p>
          </div>
          <label className="btn-secondary cursor-pointer shrink-0">
            <Upload size={13} /> Subir
            <input type="file" accept="image/png" className="hidden" onChange={handleUploadLogo} />
          </label>
        </div>
      </div>

      <div className="card space-y-4 max-w-lg">
        <h3 className="section-title">Colores del informe</h3>
        <p className="text-sm text-text-muted">
          Solo afecta a las celdas/áreas decorativas de marca — los colores de estado (OK / Warning / Critical)
          y de severidad de hallazgos no cambian.
        </p>
        <div className="space-y-3">
          {FIELDS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center gap-3">
              <input
                type="color"
                value={`#${form[key]}`}
                onChange={e => setColor(key, e.target.value)}
                className="w-10 h-10 rounded border border-border bg-transparent cursor-pointer shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{label}</p>
                <p className="text-xs text-text-muted">{desc}</p>
              </div>
              <input
                type="text"
                value={form[key]}
                onChange={e => setColor(key, e.target.value)}
                maxLength={6}
                className="input w-24 text-sm font-mono uppercase shrink-0"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <button onClick={() => setForm(DEFAULTS)} className="btn-ghost text-xs flex items-center gap-1.5">
            <RotateCcw size={13} /> Restaurar valores por defecto
          </button>
          <button
            onClick={() => saveMut.mutate(form)}
            disabled={saveMut.isPending}
            className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
