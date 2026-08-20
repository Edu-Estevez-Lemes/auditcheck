/**
 * Bloque 6 — Fondo de gradiente animado, reutilizado en la pantalla de
 * login (a pantalla completa, paleta "brand") y en la cabecera del logo
 * del sidebar (paleta "sidebar", `waveCount` reducido). Ambas paletas usan
 * los mismos dos colores fijos definidos en index.css como --gw-c1/c2
 * (#161224 / #0c0914), solo con distinto orden de arranque — no
 * dependen del tema claro/oscuro, EXCEPTO la variante "sidebar": en tema
 * claro se anula por completo (fondo blanco liso) vía el selector
 * `:root.theme-light .gw-root--sidebar` en index.css, porque la cabecera
 * del logo debe volverse blanca en claro en vez de conservar este
 * gradiente oscuro. Transición no lineal (easing), superposición de ruido
 * sutil y líneas onduladas con deriva horizontal lenta en direcciones
 * opuestas. Puramente CSS/SVG — sin canvas ni JS por fotograma. Estilos en
 * index.css (.gw-*); fallback estático vía `prefers-reduced-motion` ya
 * cubierto ahí.
 */
const WAVE_PATH_UP = 'M0,20 C25,5 75,35 100,20 C125,5 175,35 200,20'
const WAVE_PATH_DOWN = 'M0,20 C25,35 75,5 100,20 C125,35 175,5 200,20'
const WAVE_PATH_UP_SOFT = 'M0,20 C33,10 67,30 100,20 C133,10 167,30 200,20'
const WAVE_PATH_DOWN_SOFT = 'M0,20 C33,30 67,10 100,20 C133,30 167,10 200,20'
const WAVE_PATH_STEEP = 'M0,20 C20,0 80,40 100,20 C120,0 180,40 200,20'
const WAVE_PATH_GENTLE = 'M0,20 C40,13 60,27 100,20 C140,13 160,27 200,20'
const WAVE_PATH_DOUBLE = 'M0,20 C12,8 38,8 50,20 C62,32 88,32 100,20 C112,8 138,8 150,20 C162,32 188,32 200,20'

interface WaveLayer {
  animClass: string
  top: string
  height: string
  path: string
  color: string
  opacity: number
  strokeWidth: number
}

const WAVE_LAYERS: WaveLayer[] = [
  { animClass: 'gw-wave-a', top: '14%', height: '16%', path: WAVE_PATH_UP,        color: '--ac-text-muted', opacity: 0.20, strokeWidth: 1.2 },
  { animClass: 'gw-wave-b', top: '34%', height: '18%', path: WAVE_PATH_DOWN,      color: '--ac-accent',     opacity: 0.14, strokeWidth: 1 },
  { animClass: 'gw-wave-c', top: '52%', height: '16%', path: WAVE_PATH_UP_SOFT,   color: '--ac-text-muted', opacity: 0.12, strokeWidth: 1 },
  { animClass: 'gw-wave-d', top: '70%', height: '18%', path: WAVE_PATH_DOWN_SOFT, color: '--ac-accent',     opacity: 0.10, strokeWidth: 1 },
  { animClass: 'gw-wave-e', top: '86%', height: '14%', path: WAVE_PATH_STEEP,     color: '--ac-text-muted', opacity: 0.16, strokeWidth: 1.2 },
  { animClass: 'gw-wave-f', top: '4%',  height: '14%', path: WAVE_PATH_GENTLE,    color: '--ac-text-muted', opacity: 0.10, strokeWidth: 1 },
  { animClass: 'gw-wave-g', top: '44%', height: '16%', path: WAVE_PATH_DOUBLE,    color: '--ac-accent',     opacity: 0.09, strokeWidth: 0.9 },
  { animClass: 'gw-wave-h', top: '96%', height: '12%', path: WAVE_PATH_GENTLE,    color: '--ac-accent',     opacity: 0.12, strokeWidth: 1 },
]

interface GradientWavesProps {
  className?: string
  /** "brand" (login, a pantalla completa) o "sidebar" (cabecera del logo). */
  palette?: 'brand' | 'sidebar'
  /** Nº de líneas onduladas a mostrar (de las 8 definidas), de arriba abajo. */
  waveCount?: number
}

export function GradientWaves({ className = '', palette = 'brand', waveCount = WAVE_LAYERS.length }: GradientWavesProps) {
  const layers = WAVE_LAYERS.slice(0, waveCount)
  return (
    <div className={`gw-root gw-root--${palette} relative overflow-hidden ${className}`}>
      <div className={`gw-gradient${palette === 'sidebar' ? '--sidebar' : ''} absolute inset-0`} />
      {layers.map((wave) => (
        <svg
          key={wave.animClass}
          className={`${wave.animClass} absolute left-0`}
          style={{ top: wave.top, width: '200%', height: wave.height }}
          viewBox="0 0 200 40"
          preserveAspectRatio="none"
        >
          <path
            d={wave.path}
            fill="none"
            stroke={`rgb(var(${wave.color}) / ${wave.opacity})`}
            strokeWidth={wave.strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ))}
      <div className="gw-noise absolute inset-0" />
    </div>
  )
}
