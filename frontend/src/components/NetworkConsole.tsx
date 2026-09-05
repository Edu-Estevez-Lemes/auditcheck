// ── Consola de Red ───────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Trash2, Copy, Paperclip, TerminalSquare, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { consoleApi, auditsApi } from '../lib/api'
import { useConsoleStore } from '../store/consoleStore'
import type { Finding } from '../types'

const WHITELIST_COMMANDS = ['ping', 'traceroute', 'nslookup', 'rdns', 'testport', 'banner', 'pingsweep', 'syncmatriz']
const PROMPT = 'auditcheck > '

export function NetworkConsole() {
  const { auditId, auditName, prefill, close } = useConsoleStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const outputBufferRef = useRef<string[]>([])

  const [findings, setFindings] = useState<Finding[]>([])
  const [attachOpen, setAttachOpen] = useState(false)
  const [selectedFindingId, setSelectedFindingId] = useState<number | ''>('')

  const termRef = useRef<XTerm | null>(null)
  const clearRef = useRef<() => void>(() => {})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", "Consolas", monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#0F172A',
        foreground: '#E2E8F0',
        cursor: '#A78BFA',
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()
    termRef.current = term

    const lineBuffer = { current: prefill || '' }
    const history: string[] = []
    let historyIndex = 0
    // Un comando interactivo (p.ej. syncmatriz) puede pedir un dato a mitad de
    // ejecución vía type=prompt. Mientras esté activo, Enter envía la respuesta
    // en vez de un comando nuevo, y si es secreto no se hace eco de lo tecleado.
    const promptState = { current: null as { secret: boolean } | null }

    const writePrompt = () => term.write(`\r\n${PROMPT}${lineBuffer.current}`)

    term.writeln('AuditCheck — Consola de Red')
    term.writeln(`Comandos disponibles: ${WHITELIST_COMMANDS.join(', ')}`)
    term.write(`${PROMPT}${lineBuffer.current}`)

    clearRef.current = () => {
      term.clear()
      outputBufferRef.current = []
      term.write(`${PROMPT}${lineBuffer.current}`)
    }

    const resizeObserver = new ResizeObserver(() => fitAddon.fit())
    resizeObserver.observe(container)

    let ws: WebSocket | null = null
    let cancelled = false

    consoleApi.startSession().then(({ data }) => {
      if (cancelled) return
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${window.location.host}${data.ws_url}`)
      wsRef.current = ws
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data)
        if (msg.type === 'output') {
          term.writeln(msg.line)
          outputBufferRef.current.push(msg.line)
        } else if (msg.type === 'error') {
          term.writeln(`\x1b[31m${msg.line}\x1b[0m`)
          outputBufferRef.current.push(msg.line)
          writePrompt()
        } else if (msg.type === 'prompt') {
          promptState.current = { secret: !!msg.secret }
          lineBuffer.current = ''
          term.write(`\r\n\x1b[36m${msg.line}\x1b[0m `)
        } else if (msg.type === 'done') {
          writePrompt()
        }
      }
    }).catch(() => {
      term.writeln('\r\n\x1b[31mNo se pudo iniciar la sesión de consola.\x1b[0m')
      writePrompt()
    })

    const sendCommand = (cmd: string) => {
      if (!cmd.trim()) { writePrompt(); return }
      history.push(cmd)
      historyIndex = history.length
      outputBufferRef.current.push(`${PROMPT}${cmd}`)
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ command: cmd }))
      } else {
        term.writeln('\x1b[31mConsola no conectada.\x1b[0m')
        writePrompt()
      }
    }

    const sendPromptAnswer = (answer: string) => {
      lineBuffer.current = ''
      term.write('\r\n')
      promptState.current = null
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ answer }))
      }
    }

    const keyDisposable = term.onKey(({ key, domEvent }) => {
      const ev = domEvent
      if (ev.key === 'Enter') {
        if (promptState.current) {
          sendPromptAnswer(lineBuffer.current)
          return
        }
        const cmd = lineBuffer.current
        lineBuffer.current = ''
        term.write('\r\n')
        sendCommand(cmd)
      } else if (ev.key === 'Backspace') {
        if (lineBuffer.current.length > 0) {
          lineBuffer.current = lineBuffer.current.slice(0, -1)
          term.write('\b \b')
        }
      } else if (promptState.current) {
        // Modo prompt: solo texto libre y Backspace; sin historial/tab/flechas.
        if (key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
          lineBuffer.current += key
          term.write(promptState.current.secret ? '*' : key)
        }
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault()
        if (historyIndex > 0) {
          historyIndex -= 1
          lineBuffer.current = history[historyIndex] ?? ''
          term.write(`\r\x1b[K${PROMPT}${lineBuffer.current}`)
        }
      } else if (ev.key === 'ArrowDown') {
        ev.preventDefault()
        if (historyIndex < history.length - 1) {
          historyIndex += 1
          lineBuffer.current = history[historyIndex] ?? ''
        } else {
          historyIndex = history.length
          lineBuffer.current = ''
        }
        term.write(`\r\x1b[K${PROMPT}${lineBuffer.current}`)
      } else if (ev.key === 'Tab') {
        ev.preventDefault()
        const match = WHITELIST_COMMANDS.find(c => c.startsWith(lineBuffer.current) && c !== lineBuffer.current)
        if (match) {
          lineBuffer.current = match
          term.write(`\r\x1b[K${PROMPT}${lineBuffer.current}`)
        }
      } else if (key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        lineBuffer.current += key
        term.write(key)
      }
    })

    return () => {
      cancelled = true
      keyDisposable.dispose()
      resizeObserver.disconnect()
      ws?.close()
      term.dispose()
      termRef.current = null
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClear = () => clearRef.current()

  const handleCopy = async () => {
    await navigator.clipboard.writeText(outputBufferRef.current.join('\n'))
    toast.success('Salida copiada al portapapeles')
  }

  const handleOpenAttach = async () => {
    if (!auditId) return
    try {
      const { data } = await auditsApi.getFindings(auditId)
      setFindings(data)
      setAttachOpen(true)
    } catch {
      toast.error('No se pudieron cargar los hallazgos de la auditoría')
    }
  }

  const handleAttach = async () => {
    if (!auditId || !selectedFindingId) return
    const finding = findings.find(f => f.id === selectedFindingId)
    const text = outputBufferRef.current.join('\n')
    const evidence = finding?.evidence ? `${finding.evidence}\n\n${text}` : text
    try {
      await auditsApi.updateFinding(auditId, Number(selectedFindingId), { evidence })
      toast.success('Evidencia adjuntada al hallazgo')
      setAttachOpen(false)
      setSelectedFindingId('')
    } catch {
      toast.error('Error al adjuntar la evidencia')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <TerminalSquare size={16} /> Consola de Red
          {auditName && <span className="text-text-muted font-normal">· {auditName}</span>}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={handleClear} className="btn-ghost text-xs flex items-center gap-1.5 px-2 py-1.5">
            <Trash2 size={13} /> Limpiar
          </button>
          <button onClick={handleCopy} className="btn-ghost text-xs flex items-center gap-1.5 px-2 py-1.5">
            <Copy size={13} /> Copiar salida
          </button>
          {auditId && (
            <button onClick={handleOpenAttach} className="btn-ghost text-xs flex items-center gap-1.5 px-2 py-1.5">
              <Paperclip size={13} /> Adjuntar a hallazgo
            </button>
          )}
          <button onClick={close} className="btn-ghost p-1.5 rounded-lg"><X size={16} /></button>
        </div>
      </div>

      {attachOpen && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface-2 shrink-0">
          <select
            className="input text-xs flex-1"
            value={selectedFindingId}
            onChange={(e) => setSelectedFindingId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">
              {findings.length === 0 ? 'No hay hallazgos en esta auditoría' : 'Selecciona un hallazgo…'}
            </option>
            {findings.map(f => (
              <option key={f.id} value={f.id}>{f.title}</option>
            ))}
          </select>
          <button onClick={handleAttach} disabled={!selectedFindingId} className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40">
            Adjuntar
          </button>
          <button onClick={() => setAttachOpen(false)} className="btn-ghost text-xs px-2 py-1.5">Cancelar</button>
        </div>
      )}

      <div className="flex-1 p-3 min-h-0" style={{ backgroundColor: '#0F172A' }}>
        <div ref={containerRef} className="h-full w-full" />
      </div>
    </div>
  )
}
