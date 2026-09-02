import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { uiThemeApi } from '../lib/api'
import type { UIThemeConfig } from '../types'
import type { Theme } from '../store/themeStore'
import { hexToRgbTriplet, darkenHex, mixHex } from '../lib/color'

const OVERRIDE_VARS = [
  '--ac-bg',
  '--ac-surface',
  '--ac-surface-2',
  '--ac-text-primary',
  '--ac-text-secondary',
  '--ac-text-muted',
  '--ac-primary',
  '--ac-primary-hover',
  '--ac-accent',
  '--ac-brand-header',
  '--ac-brand-header-fg',
] as const

// Fondo/texto por defecto de cada modo (index.css), usado solo como
// referencia para mezclar el texto secundario/muted o el contraste de la
// cabecera de marca cuando el usuario personaliza un campo pero deja otro
// en su valor por defecto.
const DEFAULT_BG: Record<Theme, string> = { dark: '0E0C14', light: 'F5F3FF' }
const DEFAULT_TEXT: Record<Theme, string> = { dark: 'EDE9FE', light: '1E0B3E' }

/**
 * Aplica los colores de Identidad visual (Configuración → Identidad visual),
 * distintos para modo oscuro y claro, a las variables CSS `--ac-*` que
 * consume toda la interfaz. El logo/icono no se tocan aquí: son comunes a
 * ambos modos (assets/branding/logo.png, icon.png).
 */
export function useUiTheme(theme: Theme) {
  const { data } = useQuery<UIThemeConfig>({
    queryKey: ['ui-theme-config'],
    queryFn: () => uiThemeApi.getConfig().then((r) => r.data),
    staleTime: 60_000,
  })

  useEffect(() => {
    const root = document.documentElement.style
    OVERRIDE_VARS.forEach((v) => root.removeProperty(v))
    if (!data) return

    const background = theme === 'dark' ? data.dark_background : data.light_background
    const text = theme === 'dark' ? data.dark_text : data.light_text
    const accent = theme === 'dark' ? data.dark_accent : data.light_accent

    if (background) {
      root.setProperty('--ac-bg', hexToRgbTriplet(background))
      root.setProperty('--ac-surface', mixHex(background, 'FFFFFF', 0.08))
      root.setProperty('--ac-surface-2', mixHex(background, 'FFFFFF', 0.16))
    }

    if (text) {
      const bgRef = background || DEFAULT_BG[theme]
      root.setProperty('--ac-text-primary', hexToRgbTriplet(text))
      root.setProperty('--ac-text-secondary', mixHex(text, bgRef, 0.35))
      root.setProperty('--ac-text-muted', mixHex(text, bgRef, 0.55))
    }

    if (accent) {
      const textRef = text || DEFAULT_TEXT[theme]
      root.setProperty('--ac-primary', hexToRgbTriplet(accent))
      root.setProperty('--ac-primary-hover', darkenHex(accent, 0.12))
      root.setProperty('--ac-accent', hexToRgbTriplet(accent))
      root.setProperty('--ac-brand-header', hexToRgbTriplet(accent))
      root.setProperty('--ac-brand-header-fg', hexToRgbTriplet(pickContrast(accent, textRef)))
    }
  }, [theme, data])
}

/** El color de texto configurado, o blanco, según el brillo percibido del acento. */
function pickContrast(accentHex: string, textHex: string): string {
  const clean = accentHex.replace(/^#/, '')
  const r = parseInt(clean.slice(0, 2), 16) || 0
  const g = parseInt(clean.slice(2, 4), 16) || 0
  const b = parseInt(clean.slice(4, 6), 16) || 0
  const perceived = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return perceived > 0.6 ? textHex : 'FFFFFF'
}
