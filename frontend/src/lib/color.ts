/** Utilidades de color para aplicar los colores corporativos (informes) al tema claro de la interfaz. */

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, '')
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ]
}

/** "#7C3AED" → "124 58 237", formato esperado por las CSS custom properties `--ac-*`. */
export function hexToRgbTriplet(hex: string): string {
  const [r, g, b] = parseHex(hex)
  return `${r} ${g} ${b}`
}

/** Oscurece un color un `amount` (0-1) para variantes hover/borde. */
export function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex)
  const f = 1 - amount
  return `${Math.round(r * f)} ${Math.round(g * f)} ${Math.round(b * f)}`
}

/** Texto blanco o violeta oscuro (el mismo que usa el tema claro), según el brillo percibido del fondo. */
export function pickContrastRgbTriplet(hex: string): string {
  const [r, g, b] = parseHex(hex)
  const perceived = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return perceived > 0.6 ? '30 11 62' /* --ac-text-primary (claro) */ : '255 255 255'
}
