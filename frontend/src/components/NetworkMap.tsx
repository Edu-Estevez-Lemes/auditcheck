// ── Mapa de Red ──────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import cytoscape, { type Core, type NodeSingular } from 'cytoscape'
import { Share2, Download, X, ServerCog, TerminalSquare } from 'lucide-react'
import { auditsApi } from '../lib/api'
import { format } from 'date-fns'
import type { NetworkMapNode, NetworkMapOut } from '../types'
import { DEVICE_TYPE_LABELS } from '../lib/utils'
import { iconDataUri, riskBorderColor } from '../lib/cytoscapeIcons'
import { useConsoleStore } from '../store/consoleStore'

interface NetworkMapProps {
  auditId: number
  auditName?: string
  onViewFindings: (deviceId: number) => void
}

const LAYOUTS = [
  { key: 'breadthfirst', label: 'Por subredes' },
  { key: 'cose', label: 'Fuerza dirigida' },
  { key: 'circle', label: 'Circular' },
] as const

const RISK_LABELS: Record<string, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
  none: 'Sin hallazgos',
}

export function NetworkMap({ auditId, auditName, onViewFindings }: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [layout, setLayout] = useState<(typeof LAYOUTS)[number]['key']>('breadthfirst')
  const [selected, setSelected] = useState<NetworkMapNode | null>(null)
  const openConsole = useConsoleStore((s) => s.openWithContext)

  const mapQ = useQuery<NetworkMapOut>({
    queryKey: ['audit-network-map', auditId],
    queryFn: () => auditsApi.getNetworkMap(auditId).then(r => r.data),
  })

  const elements = useMemo(() => {
    const data = mapQ.data
    if (!data) return null
    const nodes = data.nodes.map(n => ({
      data: {
        id: n.id,
        label: n.label,
        ip: n.ip,
        hostname: n.hostname,
        type: n.type,
        risk_level: n.risk_level,
        open_ports: n.open_ports,
        findings_count: n.findings_count,
        icon: iconDataUri(n.type),
        borderColor: riskBorderColor(n.risk_level),
      },
    }))
    const edges = data.edges.map(e => ({
      data: { id: `${e.source}__${e.target}`, source: e.source, target: e.target },
    }))
    return { nodes, edges }
  }, [mapQ.data])

  useEffect(() => {
    if (!containerRef.current || !elements) return

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-image': 'data(icon)' as unknown as string,
            'background-fit': 'contain',
            'background-color': '#1c182a',
            'border-width': 3,
            'border-color': 'data(borderColor)' as unknown as string,
            shape: 'round-rectangle',
            width: 44,
            height: 44,
            label: 'data(label)' as unknown as string,
            color: '#EDE9FE',
            'font-size': 10,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-wrap': 'ellipsis',
            'text-max-width': '90px',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#3f3564',
            'curve-style': 'bezier',
            'target-arrow-shape': 'none',
          },
        },
        {
          selector: 'node:selected',
          style: { 'border-width': 5, 'border-color': '#8B5CF6' },
        },
      ],
      layout: { name: layout === 'breadthfirst' ? 'breadthfirst' : layout, animate: false } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.2,
    })

    cy.on('tap', 'node', (evt: cytoscape.EventObject) => {
      const node = evt.target as NodeSingular
      setSelected(node.data() as NetworkMapNode)
    })

    cy.on('tap', (evt: cytoscape.EventObject) => {
      if (evt.target === cy) setSelected(null)
    })

    cyRef.current = cy
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [elements])

  useEffect(() => {
    if (!cyRef.current) return
    cyRef.current.layout({ name: layout, animate: false } as cytoscape.LayoutOptions).run()
  }, [layout])

  const handleExportPng = () => {
    const cy = cyRef.current
    if (!cy || cy.nodes().length === 0) return
    const dataUri = cy.png({ full: true, scale: 2, bg: '#0f0c17' })
    const dateStr = format(new Date(), 'yyyy-MM-dd')
    const safeName = (auditName || 'auditoria').replace(/[^a-zA-Z0-9_-]+/g, '_')
    const a = document.createElement('a')
    a.href = dataUri
    a.download = `${safeName}_${dateStr}_mapa_red.png`
    a.click()
  }

  if (mapQ.isLoading) {
    return <div className="card text-center py-8 text-text-muted">Cargando mapa de red…</div>
  }

  if (!mapQ.data || mapQ.data.nodes.length === 0) {
    return <div className="card text-center py-8 text-text-muted">Sin dispositivos para visualizar en esta auditoría</div>
  }

  const isVirtual = selected ? !selected.id.startsWith('device-') : false
  const selectedDeviceId = selected && !isVirtual ? Number(selected.id.replace('device-', '')) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1">
          {LAYOUTS.map(l => (
            <button
              key={l.key}
              onClick={() => setLayout(l.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                layout === l.key ? 'bg-primary text-white border-primary' : 'border-border text-text-muted hover:border-primary/40'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button onClick={handleExportPng} className="btn-secondary text-xs flex items-center gap-1.5">
          <Download size={14} /> Exportar mapa
        </button>
      </div>

      <div className="flex gap-3">
        <div
          ref={containerRef}
          className="flex-1 h-[560px] rounded-xl border border-border bg-bg"
        />

        {selected && (
          <div className="w-72 shrink-0 card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <ServerCog size={16} /> {selected.label}
              </h3>
              <button onClick={() => setSelected(null)} className="btn-ghost p-1 rounded"><X size={14} /></button>
            </div>
            <div className="text-sm space-y-1.5 text-text-secondary">
              <div><span className="text-text-muted">IP:</span> {selected.ip || '—'}</div>
              <div><span className="text-text-muted">Hostname:</span> {selected.hostname || '—'}</div>
              <div><span className="text-text-muted">Tipo:</span> {DEVICE_TYPE_LABELS[selected.type] ?? selected.type}</div>
              <div><span className="text-text-muted">Riesgo:</span> {RISK_LABELS[selected.risk_level] ?? selected.risk_level}</div>
              <div>
                <span className="text-text-muted">Puertos abiertos:</span>{' '}
                {selected.open_ports.length ? selected.open_ports.join(', ') : '—'}
              </div>
              <div><span className="text-text-muted">Hallazgos:</span> {selected.findings_count}</div>
            </div>
            <div className="flex gap-2">
              {selectedDeviceId != null && (
                <button
                  onClick={() => onViewFindings(selectedDeviceId)}
                  className="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5"
                >
                  <Share2 size={14} /> Ver hallazgos
                </button>
              )}
              {selected.ip && (
                <button
                  onClick={() => openConsole({ auditId, auditName, prefill: selected.ip })}
                  title="Abrir en la Consola de Red"
                  className="btn-secondary text-sm flex items-center justify-center gap-1.5 px-3"
                >
                  <TerminalSquare size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
