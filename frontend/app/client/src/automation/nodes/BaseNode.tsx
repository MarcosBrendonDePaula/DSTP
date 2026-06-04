import { Handle, Position, useReactFlow } from '@xyflow/react'
import { createContext, useContext } from 'react'

// Config-only mode: when the detail modal renders a node's ui.tsx as its config
// editor, it provides this context. `configOnly` makes BaseNode emit ONLY the
// config fields (no handles/header/border). `setNodeData` is the persist function
// — the modal renders OUTSIDE <ReactFlow>, so ui.tsx CANNOT use useReactFlow()
// there; the modal passes a setNodes-backed updater instead. On the canvas the
// context is absent and ui.tsx uses useReactFlow().updateNodeData as usual.
export interface ConfigOnlyValue {
  setNodeData: (id: string, data: any) => void
}
export const ConfigOnlyContext = createContext<ConfigOnlyValue | null>(null)

// Hook every node ui.tsx should use to persist data changes. Prefers the modal's
// updater (config-only); falls back to useReactFlow().updateNodeData on the canvas.
export function useNodeDataUpdater(): (id: string, data: any) => void {
  const cfg = useContext(ConfigOnlyContext)
  // useReactFlow is always called (hook rules); it's valid on the canvas. In the
  // modal we ignore its result and use the context updater instead.
  const rf = useReactFlow()
  return cfg ? cfg.setNodeData : rf.updateNodeData
}

const typeColors: Record<string, { bg: string; border: string; accent: string }> = {
  trigger: { bg: '#0d1f0d', border: '#22c55e30', accent: '#22c55e' },
  condition: { bg: '#1f1d0d', border: '#eab30830', accent: '#eab308' },
  action: { bg: '#0d0d1f', border: '#3b82f630', accent: '#3b82f6' },
  delay: { bg: '#1a1518', border: '#a855f730', accent: '#a855f7' },
  wait: { bg: '#1a0d1f', border: '#ec489930', accent: '#ec4899' },
  ai_agent: { bg: '#170d1f', border: '#d946ef30', accent: '#d946ef' },
}

interface BaseNodeProps {
  type: 'trigger' | 'condition' | 'action' | 'delay' | 'wait' | 'ai_agent'
  icon: string
  label: string
  selected?: boolean
  children?: React.ReactNode
  hasInput?: boolean
  hasOutput?: boolean
  outputLabels?: { id: string; label: string }[]
  executionStatus?: 'running' | 'completed' | 'error' | null
  executionOutput?: any
  executionError?: string
  hasCaptureData?: boolean
  alias?: string
  onAliasChange?: (alias: string) => void
}

function summarizeOutput(output: any): string {
  if (output == null) return ''
  if (typeof output === 'string') return output.length > 40 ? output.slice(0, 40) + '...' : output
  if (typeof output === 'number' || typeof output === 'boolean') return String(output)
  const json = JSON.stringify(output)
  return json.length > 50 ? json.slice(0, 50) + '...' : json
}

function outputPreviewEntries(output: any): Array<[string, string]> {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return []
  const preferred = ['userid', 'name', 'item', 'prefab', 'message', 'phase', 'day', 'season', 'cause', 'amount']
  const entries: Array<[string, string]> = []

  for (const key of preferred) {
    const value = output[key]
    if (value !== undefined && value !== null && value !== '') {
      entries.push([key, String(value)])
    }
    if (entries.length >= 4) return entries
  }

  for (const [key, value] of Object.entries(output)) {
    if (key.startsWith('_') || value === undefined || value === null || value === '') continue
    entries.push([key, typeof value === 'object' ? JSON.stringify(value) : String(value)])
    if (entries.length >= 4) break
  }

  return entries
}

export function BaseNode({ type, icon, label, selected, children, hasInput = true, hasOutput = true, outputLabels, executionStatus, executionOutput, executionError, hasCaptureData, alias, onAliasChange }: BaseNodeProps) {
  const configOnly = useContext(ConfigOnlyContext)
  // In the detail modal we only want the config fields + the alias input, not the
  // canvas chrome (handles/header/border/preview).
  if (configOnly) {
    // `dstp-config` scales up the canvas-sized fields (labels/inputs/selects) for
    // the roomy modal — see the CSS rules in index.css. No per-node changes.
    return (
      <div className="dstp-config space-y-3">
        {children}
        {onAliasChange && (
          <label className="block pt-2 border-t border-white/5">
            <span className="text-[11px] text-gray-400 block mb-1">Alias</span>
            <input
              value={alias || ''}
              onChange={e => onAliasChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              placeholder="apelido para {{alias.campo}}"
              className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-2 text-[13px] text-white focus:border-blue-500/30 focus:outline-none placeholder:text-gray-600"
            />
          </label>
        )}
      </div>
    )
  }

  const colors = typeColors[type]

  const execBorder = executionStatus === 'running' ? '#3b82f6'
    : executionStatus === 'completed' ? '#22c55e'
    : executionStatus === 'error' ? '#ef4444'
    : null

  const execShadow = executionStatus === 'running' ? '0 0 20px #3b82f680, 0 0 40px #3b82f630'
    : executionStatus === 'completed' ? '0 0 15px #22c55e50'
    : executionStatus === 'error' ? '0 0 15px #ef444450'
    : null
  const previewEntries = outputPreviewEntries(executionOutput)

  return (
    <div className="relative">
    <div
      className={`rounded-xl min-w-[200px] text-xs ${executionStatus === 'running' ? 'dstp-node-running' : ''} ${executionStatus === 'completed' ? 'dstp-node-completed' : ''} ${executionStatus === 'error' ? 'dstp-node-error' : ''}`}
      style={{
        background: colors.bg,
        border: `1px solid ${execBorder || (selected ? colors.accent : colors.border)}`,
        boxShadow: execShadow || (selected ? `0 0 20px ${colors.accent}20` : 'none'),
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      {/* Input handle */}
      {hasInput && (
        <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !border-2" style={{ background: '#2a2a2a', borderColor: colors.accent }} />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: colors.border }}>
        <span>{icon}</span>
        <span className="font-semibold text-[11px]" style={{ color: colors.accent }}>{label}</span>
        <div className="flex-1" />
        {onAliasChange && (
          <input
            value={alias || ''}
            onChange={e => onAliasChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            placeholder="alias"
            className="w-16 bg-transparent border-b border-white/10 text-[9px] text-gray-400 focus:border-white/30 focus:outline-none focus:text-white px-0.5 text-right placeholder:text-gray-600"
            title="Apelido para referenciar: {{alias.campo}}"
          />
        )}
      </div>

      {/* Config lives in NodeDetailPanel; keep cards compact on the canvas. */}
      {children && previewEntries.length === 0 && (
        <div className="px-3 py-2">
          <div className="rounded-md bg-white/[0.03] border border-white/5 px-2 py-1 text-[9px] text-gray-500">
            Duplo clique para configurar
          </div>
        </div>
      )}

      {previewEntries.length > 0 && (
        <div className="mx-3 mb-3 rounded-md border border-green-500/15 bg-green-500/[0.06] px-2 py-1.5">
          <div className="text-[8px] uppercase tracking-wide text-green-400/70 mb-1">Retorno</div>
          <div className="space-y-0.5">
            {previewEntries.map(([key, value]) => (
              <div key={key} className="flex gap-1 text-[9px] font-mono leading-tight">
                <span className="text-green-400/80 shrink-0">{key}:</span>
                <span className="text-gray-300 truncate">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output handle(s) */}
      {hasOutput && !outputLabels && (
        <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !border-2" style={{ background: '#2a2a2a', borderColor: colors.accent }} />
      )}

      {/* Named output handles (for conditions: true/false) */}
      {outputLabels && (
        <div className="flex justify-around px-2 pb-2 pt-1">
          {outputLabels.map((out, i) => (
            <div key={out.id} className="relative flex flex-col items-center">
              <span className="text-[9px] text-gray-500 mb-1">{out.label}</span>
              <Handle
                type="source"
                position={Position.Bottom}
                id={out.id}
                className="!w-2.5 !h-2.5 !border-2 !relative !transform-none !top-0 !left-0"
                style={{ background: '#2a2a2a', borderColor: out.id === 'true' ? '#22c55e' : '#ef4444' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Execution status badge */}
    {executionStatus === 'running' && (
      <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center dstp-spin">
        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
      </div>
    )}
    {executionStatus === 'completed' && (
      <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center dstp-badge-pop">
        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )}
    {executionStatus === 'error' && (
      <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center dstp-badge-pop">
        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )}

    {/* Capture data indicator */}
    {hasCaptureData && !executionStatus && (
      <div className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-amber-500/80 flex items-center justify-center" title="Dados de captura disponiveis (duplo clique para ver)">
        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
    )}

    {/* Output data preview */}
    {executionStatus === 'completed' && executionOutput && (
      <div className="absolute left-0 right-0 -bottom-7 flex justify-center pointer-events-none">
        <div className="bg-[#111] border border-green-500/20 rounded px-2 py-0.5 text-[8px] text-green-300/80 font-mono max-w-[220px] truncate">
          {summarizeOutput(executionOutput)}
        </div>
      </div>
    )}
    {executionStatus === 'error' && executionError && (
      <div className="absolute left-0 right-0 -bottom-7 flex justify-center pointer-events-none">
        <div className="bg-[#111] border border-red-500/20 rounded px-2 py-0.5 text-[8px] text-red-300/80 font-mono max-w-[220px] truncate">
          {executionError}
        </div>
      </div>
    )}
    </div>
  )
}

// Shared field component
export function NodeField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[9px] text-gray-500 block mb-0.5">{label}</span>
      {children}
    </div>
  )
}

export function NodeSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-blue-500/30 focus:outline-none [&>option]:bg-[#1a1a1a] [&>option]:text-white"
    >
      <option value="">Selecionar...</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function NodeInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const insertExpression = (input: HTMLInputElement, expression: string) => {
    const start = input.selectionStart ?? value.length
    const end = input.selectionEnd ?? value.length
    const next = `${value.slice(0, start)}${expression}${value.slice(end)}`
    onChange(next)
    requestAnimationFrame(() => {
      const cursor = start + expression.length
      input.focus()
      input.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      onDragOver={e => {
        if (e.dataTransfer.types.includes('application/dstp-expression') || e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={e => {
        const expression = e.dataTransfer.getData('application/dstp-expression') || e.dataTransfer.getData('text/plain')
        if (!expression) return
        e.preventDefault()
        insertExpression(e.currentTarget, expression)
      }}
      placeholder={placeholder}
      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-blue-500/30 focus:outline-none placeholder:text-gray-600"
      title="Aceita drop de expressoes {{...}} vindas do schema"
    />
  )
}
