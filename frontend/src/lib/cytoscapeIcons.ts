// ── Mapa de Red ──────────────────────────────────────────────────────────────
// Iconos SVG por tipo de dispositivo, codificados como data-URI para usarse
// como `background-image` de los nodos de Cytoscape (que no soporta iconos
// React ni variables CSS, solo URLs estáticas).

const ICON_FILL = '#EDE9FE' // ~ac-text-primary, visible sobre fondos oscuros

const ICONS: Record<string, string> = {
  windows_server: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_FILL}" stroke-width="2"><rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><circle cx="7" cy="7" r="0.6" fill="${ICON_FILL}"/><circle cx="7" cy="17" r="0.6" fill="${ICON_FILL}"/></svg>`,
  esxi: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_FILL}" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10l3 2-3 2M13 14h3"/></svg>`,
  fortigate: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_FILL}" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/></svg>`,
  switch: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_FILL}" stroke-width="2"><rect x="3" y="3" width="18" height="6" rx="1"/><rect x="3" y="9" width="18" height="6" rx="1"/><rect x="3" y="15" width="18" height="6" rx="1"/></svg>`,
  nas: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_FILL}" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="8" cy="7" r="0.6" fill="${ICON_FILL}"/><circle cx="8" cy="13" r="0.6" fill="${ICON_FILL}"/></svg>`,
  printer: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_FILL}" stroke-width="2"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="8" rx="1"/><path d="M6 17v4h12v-4"/></svg>`,
  workstation: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_FILL}" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="1"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/></svg>`,
  ilo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_FILL}" stroke-width="2"><rect x="7" y="7" width="10" height="10" rx="1"/><line x1="9" y1="3" x2="9" y2="7"/><line x1="15" y1="3" x2="15" y2="7"/><line x1="9" y1="17" x2="9" y2="21"/><line x1="15" y1="17" x2="15" y2="21"/><line x1="3" y1="9" x2="7" y2="9"/><line x1="3" y1="15" x2="7" y2="15"/><line x1="17" y1="9" x2="21" y2="9"/><line x1="17" y1="15" x2="21" y2="15"/></svg>`,
  unknown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ICON_FILL}" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.9.5c0 1.5-2.4 1.8-2.4 3.5"/><circle cx="12" cy="17" r="0.6" fill="${ICON_FILL}"/></svg>`,
}

const RISK_COLORS: Record<string, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#EAB308',
  low: '#3B82F6',
  none: '#22C55E',
}

export function iconDataUri(type: string): string {
  const svg = ICONS[type] || ICONS.unknown
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function riskBorderColor(riskLevel: string): string {
  return RISK_COLORS[riskLevel] || RISK_COLORS.none
}
