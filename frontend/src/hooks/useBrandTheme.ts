import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportBrandingApi } from '../lib/api'
import type { ReportBrandingConfig } from '../types'
import type { Theme } from '../store/themeStore'
import { hexToRgbTriplet, darkenHex, pickContrastRgbTriplet } from '../lib/color'

const OVERRIDE_VARS = [
  '--ac-primary',
  '--ac-primary-hover',
  '--ac-accent',
  '--ac-brand-header',
  '--ac-brand-header-fg',
  '--ac-border',
  '--ac-border-2',
] as const

/**
 * Aplica los colores corporativos elegidos en la instalación (mismo origen que
 * Configuración → Edición de informes) al modo claro de la interfaz. El modo
 * oscuro nunca se toca — solo pinta variables cuando theme === 'light', y las
 * retira al volver a oscuro para restaurar la paleta violeta por defecto.
 */
export function useBrandTheme(theme: Theme) {
  const { data } = useQuery<ReportBrandingConfig>({
    queryKey: ['report-branding-config'],
    queryFn: () => reportBrandingApi.getConfig().then((r) => r.data),
    staleTime: 60_000,
  })

  useEffect(() => {
    const root = document.documentElement.style
    if (theme !== 'light' || !data) {
      OVERRIDE_VARS.forEach((v) => root.removeProperty(v))
      return
    }
    root.setProperty('--ac-primary', hexToRgbTriplet(data.accent_color))
    root.setProperty('--ac-primary-hover', darkenHex(data.accent_color, 0.12))
    root.setProperty('--ac-accent', hexToRgbTriplet(data.accent_color))
    root.setProperty('--ac-brand-header', hexToRgbTriplet(data.header_color))
    root.setProperty('--ac-brand-header-fg', pickContrastRgbTriplet(data.header_color))
    root.setProperty('--ac-border', hexToRgbTriplet(data.separator_color))
    root.setProperty('--ac-border-2', darkenHex(data.separator_color, 0.15))
  }, [theme, data])
}
