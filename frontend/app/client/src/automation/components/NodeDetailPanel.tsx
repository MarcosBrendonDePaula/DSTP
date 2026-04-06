import { useState, useEffect, useCallback } from 'react'
import type { Node } from '@xyflow/react'
import {
  triggerOutputSchemas,
  nodeOutputSchemas,
  type OutputField,
  type NodeOutputSchema,
} from '../nodeOutputSchemas'
import { TRIGGER_EVENTS } from '../nodes'

// ─── JSON Viewer ──────────────────────────────────────

function JsonValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) {
    return <span className="text-gray-500 italic">null</span>
  }
  if (typeof value === 'boolean') {
    return <span className="text-red-400">{String(value)}</span>
  }
  if (typeof value === 'number') {
    return <span className="text-amber-400">{value}</span>
  }
  if (typeof value === 'string') {
    return <span className="text-green-400">"{value}"</span>
  }
  if (Array.isArray(value)) {
    return <CollapsibleJson label={`Array[${value.length}]`} depth={depth}>
      {value.map((item, i) => (
        <div key={i} className="flex items-start gap-1" style={{ paddingLeft: 12 }}>
          <span className="text-gray-600 shrink-0">{i}:</span>
          <JsonValue value={item} depth={depth + 1} />
        </div>
      ))}
    </CollapsibleJson>
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return <CollapsibleJson label={`{${entries.length}}`} depth={depth}>
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-start gap-1" style={{ paddingLeft: 12 }}>
          <span className="text-purple-400 shrink-0">"{k}":</span>
          <JsonValue value={v} depth={depth + 1} />
        </div>
      ))}
    </CollapsibleJson>
  }
  return <span className="text-gray-400">{String(value)}</span>
}

function CollapsibleJson({ label, children, depth }: { label: string; children: React.ReactNode; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-gray-500 hover:text-gray-300 transition-colors text-[10px]"
      >
        {open ? '▾' : '▸'} {label}
      </button>
      {open && <div className="border-l border-white/5 ml-1">{children}</div>}
    </div>
  )
}

// ─── Node metadata ────────────────────────────────────

const nodeTypeMeta: Record<string, { icon: string; label: string; color: string }> = {
  trigger:      { icon: '⚡', label: 'Trigger',   color: '#22c55e' },
  condition:    { icon: '❓', label: 'Condição',  color: '#eab308' },
  action:       { icon: '🎯', label: 'Ação',      color: '#3b82f6' },
  delay:        { icon: '⏱', label: 'Delay',     color: '#a855f7' },
  http_request: { icon: '🌐', label: 'HTTP',      color: '#06b6d4' },
  set_variable: { icon: '📝', label: 'Variável',  color: '#a855f7' },
  script:       { icon: '🧩', label: 'Script',    color: '#f97316' },
  memory:       { icon: '💾', label: 'Memory',     color: '#f59e0b' },
  wait:         { icon: '🔀', label: 'Wait/Merge', color: '#ec4899' },
}

function getNodeCategory(type: string): string {
  if (type === 'trigger') return 'Trigger'
  if (type === 'condition') return 'Condição'
  return 'Ação'
}

// ─── Types ────────────────────────────────────────────

export interface CaptureTraceEntry {
  nodeId: string
  status: string
  input: Record<string, any>
  output: any
  error?: string
  timestamp: number
}

interface NodeDetailPanelProps {
  node: Node
  onClose: () => void
  captureTrace?: CaptureTraceEntry[] | null
  captureContext?: Record<string, any> | null
  allNodes?: Node[]
  allEdges?: Array<{ source: string; target: string }>
}

// ─── Helpers: find upstream data ──────────────────────

function getUpstreamNodeIds(nodeId: string, allNodes: Node[], allEdges: Array<{ source: string; target: string }>): string[] {
  const upstream: string[] = []
  const visited = new Set<string>()

  function walk(currentId: string) {
    for (const edge of allEdges) {
      if (edge.target === currentId && !visited.has(edge.source)) {
        visited.add(edge.source)
        upstream.push(edge.source)
        walk(edge.source)
      }
    }
  }

  walk(nodeId)
  return upstream
}

function getInputData(
  node: Node,
  allNodes: Node[],
  allEdges: Array<{ source: string; target: string }>,
  trace: CaptureTraceEntry[],
  context: Record<string, any> | null
): Record<string, any> {
  const input: Record<string, any> = {}

  // Always include trigger data if available
  if (context?.trigger) {
    input['trigger'] = context.trigger
  }

  // For non-trigger nodes, include upstream outputs
  if (node.type !== 'trigger') {
    const upstreamIds = getUpstreamNodeIds(node.id, allNodes, allEdges)
    for (const upId of upstreamIds) {
      const upNode = allNodes.find(n => n.id === upId)
      if (!upNode) continue
      // Find trace entry for this upstream node
      const traceEntry = [...trace].reverse().find(t => t.nodeId === upId && t.status === 'completed')
      if (traceEntry?.output) {
        const alias = (upNode.data as any)?.alias
        const key = alias || upId
        // Don't duplicate trigger
        if (key !== 'trigger') {
          input[key] = traceEntry.output
        }
      }
    }
  }

  return input
}

function getOutputData(
  node: Node,
  trace: CaptureTraceEntry[],
  context: Record<string, any> | null
): any {
  // Find the trace entry for this specific node
  const traceEntry = [...trace].reverse().find(t => t.nodeId === node.id && t.status === 'completed')
  if (traceEntry?.output) return traceEntry.output

  // Fallback: check context by alias or node id
  const alias = (node.data as any)?.alias
  if (alias && context?.[alias]) return context[alias]
  if (context?.[node.id]) return context[node.id]
  if (node.type === 'trigger' && context?.trigger) return context.trigger

  return null
}

// ─── Modal ────────────────────────────────────────────

export function NodeDetailPanel({ node, onClose, captureTrace, captureContext, allNodes = [], allEdges = [] }: NodeDetailPanelProps) {
  const [showConfig, setShowConfig] = useState(true)

  const type = node.type || 'unknown'
  const meta = nodeTypeMeta[type] || { icon: '?', label: type, color: '#888' }
  const data = node.data as Record<string, any>
  const alias = data?.alias as string | undefined

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Determine output schema
  let schema: NodeOutputSchema | null = null
  let contextKey = alias || node.id

  if (type === 'trigger') {
    const eventType = data?.event_type as string
    schema = eventType ? triggerOutputSchemas[eventType] || null : null
    contextKey = alias || 'trigger'
  } else {
    schema = nodeOutputSchemas[type] || null
  }

  // Get trace data
  const trace = captureTrace || []
  const context = captureContext || null
  const inputData = getInputData(node, allNodes, allEdges, trace, context)
  const outputData = getOutputData(node, trace, context)

  // Get trigger event label
  const triggerEvent = type === 'trigger'
    ? TRIGGER_EVENTS.find(e => e.value === data?.event_type)
    : null

  // Build config entries
  const configEntries: Array<{ label: string; value: string }> = []
  if (type === 'trigger' && data?.event_type) {
    configEntries.push({ label: 'Evento', value: triggerEvent?.label || data.event_type })
    if (triggerEvent?.category) configEntries.push({ label: 'Categoria', value: triggerEvent.category })
  }
  if (type === 'condition') {
    if (data?.field) configEntries.push({ label: 'Campo', value: String(data.field) })
    if (data?.operator) configEntries.push({ label: 'Operador', value: String(data.operator) })
    if (data?.value !== undefined) configEntries.push({ label: 'Valor', value: String(data.value) })
  }
  if (type === 'delay') {
    const ms = Number(data?.delay_ms || 3000)
    configEntries.push({ label: 'Delay', value: `${ms}ms (${ms / 1000}s)` })
  }
  if (data?.alias) {
    configEntries.push({ label: 'Alias', value: data.alias })
  }
  if (data?.action_type) {
    configEntries.push({ label: 'Tipo de acao', value: data.action_type })
  }
  if (data?.params && typeof data.params === 'object') {
    for (const [k, v] of Object.entries(data.params)) {
      if (v !== '' && v !== undefined && v !== null) {
        const display = typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '...' : String(v)
        configEntries.push({ label: k, value: display })
      }
    }
  }

  const hasInput = Object.keys(inputData).length > 0
  const hasOutput = outputData !== null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-[#111] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 'min(900px, 90vw)', minWidth: 700, maxHeight: '70vh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
          <span className="text-base">{meta.icon}</span>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-white">{meta.label}</span>
            <span className="text-xs text-gray-500 ml-2">
              {getNodeCategory(type)}
              {alias && <> · <span className="text-purple-400">{alias}</span></>}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-sm px-2 py-1 rounded hover:bg-white/5 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left: Input */}
          <div className="flex-1 bg-[#0d0d0d] border-r border-white/5 overflow-y-auto p-4">
            <h3 className="text-[11px] font-semibold text-gray-300 mb-3 uppercase tracking-wider">Entrada (Input)</h3>

            {hasInput ? (
              <div className="space-y-3">
                {Object.entries(inputData).map(([key, value]) => (
                  <div key={key}>
                    <div className="text-[10px] text-purple-400 font-mono mb-1">{key}:</div>
                    <div className="font-mono text-[10px] leading-relaxed pl-2 border-l border-white/5">
                      <JsonValue value={value} depth={0} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-gray-500 italic">
                Nenhum dado de entrada disponivel.
                {!captureTrace?.length && <><br />Inicie uma captura para ver os dados.</>}
              </p>
            )}

            {/* Configuration */}
            {configEntries.length > 0 && (
              <div className="mt-5 pt-4 border-t border-white/5">
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-3"
                >
                  <span className="text-[8px]">{showConfig ? '▾' : '▸'}</span>
                  Configuracao
                </button>
                {showConfig && (
                  <div className="space-y-1.5">
                    {configEntries.map((entry, i) => (
                      <div key={i}>
                        <div className="text-[9px] text-gray-500">{entry.label}</div>
                        <div className="text-[10px] text-white font-mono bg-white/5 rounded px-2 py-1 break-all">
                          {entry.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Output */}
          <div className="flex-1 bg-[#0a0a0a] overflow-y-auto p-4">
            <h3 className="text-[11px] font-semibold text-gray-300 mb-3 uppercase tracking-wider">Saida (Output)</h3>

            {hasOutput ? (
              <div className="font-mono text-[10px] leading-relaxed">
                <JsonValue value={outputData} depth={0} />
              </div>
            ) : (
              <p className="text-[10px] text-gray-500 italic">
                Nenhum dado de saida disponivel.
                {!captureTrace?.length && <><br />Inicie uma captura para ver os dados.</>}
              </p>
            )}

            {/* Output Schema */}
            {schema && (
              <div className="mt-5 pt-4 border-t border-white/5">
                <h4 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider mb-3">Schema</h4>
                {schema.description && (
                  <p className="text-[9px] text-gray-500 mb-2">{schema.description}</p>
                )}
                {schema.fields.length === 0 ? (
                  <p className="text-[9px] text-gray-500 italic">Campos dinamicos (definidos pelo usuario)</p>
                ) : (
                  <div className="space-y-1">
                    {schema.fields.map(field => (
                      <SchemaField key={field.name} field={field} contextKey={contextKey} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────

const typeColors: Record<string, string> = {
  string: 'text-green-400',
  number: 'text-amber-400',
  boolean: 'text-red-400',
  object: 'text-purple-400',
  any: 'text-gray-400',
}

function SchemaField({ field, contextKey }: { field: OutputField; contextKey: string }) {
  const ref = `{{${contextKey}.${field.name}}}`
  return (
    <div className="group rounded-md bg-white/[0.03] px-2 py-1.5 hover:bg-white/[0.06] transition-colors">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white font-mono">{field.name}</span>
        <span className={`text-[9px] ${typeColors[field.type] || 'text-gray-400'}`}>{field.type}</span>
      </div>
      <div className="text-[9px] text-gray-500 mt-0.5">{field.description}</div>
      <div className="text-[9px] text-blue-400/70 font-mono mt-0.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <span>→</span>
        <code className="select-all">{ref}</code>
      </div>
    </div>
  )
}
