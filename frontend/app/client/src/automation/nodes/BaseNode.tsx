import { Handle, Position, useReactFlow, useNodeConnections, type HandleProps } from '@xyflow/react'
import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { getPrefabs, subscribePrefabs } from '../prefabCache'

// A handle that knows whether it's wired: adds `connected` (→ a black centre dot
// via CSS) when at least one edge attaches to it. Lets you tell a plugged port
// from a free one at a glance — especially on the dynamic Merge inputs.
export function DstpHandle({ type, id, className, ...rest }: HandleProps & { className?: string }) {
  const connections = useNodeConnections({ handleType: type as any, handleId: id ?? undefined })
  const cls = `${className || ''}${connections.length ? ' connected' : ''}`
  return <Handle type={type} id={id} className={cls} {...rest} />
}

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

// The registry wraps each canvas ui with this so BaseNode can show the node's
// own meta.description on the card WITHOUT every ui.tsx passing it explicitly.
// An explicit `description` prop still wins over this fallback.
export const NodeDescriptionContext = createContext<string | undefined>(undefined)

// Hook every node ui.tsx should use to persist data changes. Prefers the modal's
// updater (config-only); falls back to useReactFlow().updateNodeData on the canvas.
export function useNodeDataUpdater(): (id: string, data: any) => void {
  const cfg = useContext(ConfigOnlyContext)
  // useReactFlow is always called (hook rules); it's valid on the canvas. In the
  // modal we ignore its result and use the context updater instead.
  const rf = useReactFlow()
  return cfg ? cfg.setNodeData : rf.updateNodeData
}

import { nodeIcon } from './nodeIcons'

// n8n/Zapier-style palette: nodes share ONE neutral dark surface; the TYPE colour
// lives in the header icon-chip + a thin top accent line, not as a muddy tinted
// background. This reads cleaner and keeps every node legible at a glance.
const NODE_BG = '#16181d'
const typeColors: Record<string, { accent: string }> = {
  trigger: { accent: '#22c55e' },
  condition: { accent: '#eab308' },
  action: { accent: '#3b82f6' },
  delay: { accent: '#a855f7' },
  wait: { accent: '#ec4899' },
  ai_agent: { accent: '#d946ef' },
}

interface BaseNodeProps {
  type: 'trigger' | 'condition' | 'action' | 'delay' | 'wait' | 'ai_agent'
  icon: string
  label: string
  /** Small uppercase sub-label under the title. Defaults to the `type` (e.g.
   *  "ACTION"). Pass it when `type` doesn't read well (e.g. ai_memory reuses the
   *  ai_agent type/colour but should still say "AI MEMORY"). */
  subtitle?: string
  /** One-line node description shown in the card body (from meta.description). */
  description?: string
  selected?: boolean
  children?: React.ReactNode
  hasInput?: boolean
  hasOutput?: boolean
  /** Named INPUT handles stacked on the left edge (e.g. Wait/Merge: Entrada 1..N).
   *  When set, replaces the single input handle. The engine still counts arriving
   *  edges, so these are primarily a clearer affordance for "this joins paths". */
  inputLabels?: { id: string; label: string }[]
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

export function BaseNode({ type, icon, label, subtitle, description: descriptionProp, selected, children, hasInput = true, hasOutput = true, inputLabels, outputLabels, executionStatus, executionOutput, executionError, hasCaptureData, alias, onAliasChange }: BaseNodeProps) {
  // Explicit prop wins; else fall back to the meta.description the registry injects.
  const ctxDescription = useContext(NodeDescriptionContext)
  const description = descriptionProp ?? ctxDescription
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

  const colors = typeColors[type] || { accent: '#3b82f6' }
  const Icon = nodeIcon(type, `${icon || ''} ${label || ''}`)

  const execBorder = executionStatus === 'running' ? '#3b82f6'
    : executionStatus === 'completed' ? '#22c55e'
    : executionStatus === 'error' ? '#ef4444'
    : null

  const execShadow = executionStatus === 'running' ? '0 0 20px #3b82f680, 0 0 40px #3b82f630'
    : executionStatus === 'completed' ? '0 0 15px #22c55e50'
    : executionStatus === 'error' ? '0 0 15px #ef444450'
    : null
  const previewEntries = outputPreviewEntries(executionOutput)
  const borderColor = execBorder || (selected ? colors.accent : 'rgba(255,255,255,0.08)')

  return (
    <div className="dstp-node group relative">
    <div
      className={`relative rounded-xl min-w-[210px] text-xs ${executionStatus === 'running' ? 'dstp-node-running' : ''} ${executionStatus === 'completed' ? 'dstp-node-completed' : ''} ${executionStatus === 'error' ? 'dstp-node-error' : ''}`}
      style={{
        background: NODE_BG,
        border: `1px solid ${borderColor}`,
        boxShadow: execShadow || (selected
          ? `0 0 0 1px ${colors.accent}, 0 8px 28px -6px ${colors.accent}55`
          : '0 6px 18px -8px rgba(0,0,0,0.7)'),
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      {/* Top accent line — the only place the type colour fills horizontally */}
      <div className="h-[3px] w-full rounded-t-xl" style={{ background: `linear-gradient(90deg, ${colors.accent}, ${colors.accent}33)` }} />

      {/* Input handle(s) — left side (data flows left → right). Named inputs
          (Wait/Merge) stack vertically, each with a small label inside the card. */}
      {hasInput && !inputLabels && (
        <DstpHandle type="target" position={Position.Left} className="dstp-handle" style={{ '--h': colors.accent } as React.CSSProperties} />
      )}
      {hasInput && inputLabels && (
        <div className="flex flex-col items-start gap-1 px-3 pt-2.5 pb-1">
          {inputLabels.map((inp) => (
            <div key={inp.id} className="relative flex items-center gap-1.5 pl-1">
              <DstpHandle
                type="target"
                position={Position.Left}
                id={inp.id}
                className="dstp-handle !relative !transform-none !top-0 !left-0"
                style={{ '--h': colors.accent } as React.CSSProperties}
              />
              <span className="text-[9px] font-medium" style={{ color: `${colors.accent}cc` }}>{inp.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Header: colour icon-chip + title. The alias floats top-right and only
          shows when set OR on node hover, so a long title is never squeezed. */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span
          className="grid place-items-center w-7 h-7 rounded-lg shrink-0"
          style={{ background: `${colors.accent}1f`, color: colors.accent, boxShadow: `inset 0 0 0 1px ${colors.accent}33` }}
        >
          <Icon size={15} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="dstp-node-title font-semibold text-[12px] text-white leading-tight truncate pr-2">{label}</div>
          <div className="text-[9px] uppercase tracking-wider text-gray-500 leading-tight">{subtitle ?? type.replace('_', ' ')}</div>
        </div>
        {onAliasChange && (
          <input
            value={alias || ''}
            onChange={e => onAliasChange(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
            onMouseDown={e => e.stopPropagation()}
            placeholder="alias"
            // `nodrag` tells React Flow to NOT drag the node when interacting here,
            // so you can click/select text in the alias field normally.
            className={`nodrag absolute top-2 right-2.5 w-16 bg-black/40 rounded border border-white/10 text-[9px] text-gray-300 focus:border-white/30 focus:outline-none focus:text-white px-1 py-0.5 text-right placeholder:text-gray-600 transition-opacity ${alias ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
            title="Apelido para referenciar: {{alias.campo}}"
          />
        )}
      </div>

      {/* Config lives in NodeDetailPanel; show the node's description on the card
          (falls back to a "double-click to configure" hint when absent). */}
      {children && previewEntries.length === 0 && (
        <div className="px-3 pb-2.5 -mt-0.5">
          {description ? (
            <p className="text-[10px] text-gray-400 leading-snug line-clamp-2">{description}</p>
          ) : (
            <div className="flex items-center gap-1.5 rounded-md bg-white/[0.04] border border-white/[0.06] px-2 py-1.5 text-[10px] text-gray-400 group-hover:text-gray-300 group-hover:border-white/10 transition-colors">
              <svg className="w-3 h-3 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4h10M11 12h10M11 20h10M3 4l1.5 1.5L7 3M3 12l1.5 1.5L7 11M3 20l1.5 1.5L7 19" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Duplo clique para configurar
            </div>
          )}
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

      {/* Output handle — right side */}
      {hasOutput && !outputLabels && (
        <DstpHandle type="source" position={Position.Right} className="dstp-handle" style={{ '--h': colors.accent } as React.CSSProperties} />
      )}

      {/* Named output handles (condition true/false, switch cases, foreach
          each/done) — stacked on the RIGHT edge, one row each with its label. */}
      {outputLabels && (
        <div className="flex flex-col items-end gap-1 px-3 pb-2.5 pt-0.5">
          {outputLabels.map((out) => {
            const c = out.id === 'true' ? '#22c55e' : out.id === 'false' ? '#ef4444' : colors.accent
            return (
              <div key={out.id} className="relative flex items-center gap-1.5 pr-1.5">
                <span className="text-[9px] font-medium" style={{ color: `${c}cc` }}>{out.label}</span>
                <DstpHandle
                  type="source"
                  position={Position.Right}
                  id={out.id}
                  className="dstp-handle !relative !transform-none !top-0 !right-0"
                  style={{ '--h': c } as React.CSSProperties}
                />
              </div>
            )
          })}
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

// Like NodeInput but with an autocomplete dropdown of this server's runtime prefabs
// (spawn / give_item etc). It's a free-text input — suggestions, not a hard
// restriction — so templates like {{trigger.prefab}} still work.
//
// We render our OWN dropdown instead of the native <datalist>: the DST/Steam
// in-game browser is an old CEF (Chromium Embedded) that does not render the
// native datalist popup at all. A React-rendered popover works in any Chromium.
export function NodePrefabInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [prefabs, setPrefabs] = useState<string[]>(() => getPrefabs())
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const off = subscribePrefabs(() => setPrefabs(getPrefabs()))
    setPrefabs(getPrefabs()) // triggers a fetch if not cached
    return off
  }, [])
  // Close on click outside.
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Filter by what's typed (case-insensitive substring). Skip filtering when the
  // field holds a template so {{...}} isn't drowned by 6k unrelated suggestions.
  const q = value.trim().toLowerCase()
  const isTemplate = value.includes('{{')
  const matches = (!isTemplate && prefabs.length)
    ? (q ? prefabs.filter(p => p.toLowerCase().includes(q)) : prefabs).slice(0, 50)
    : []
  const showList = open && matches.length > 0

  const pick = (p: string) => { onChange(p); setOpen(false) }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!showList) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, matches.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]) }
          else if (e.key === 'Escape') { setOpen(false) }
        }}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-blue-500/30 focus:outline-none placeholder:text-gray-600"
        title={prefabs.length ? `${prefabs.length} prefabs deste servidor` : 'Lista de prefabs ainda nao carregada'}
      />
      {showList && (
        <div className="absolute z-50 left-0 right-0 mt-0.5 max-h-44 overflow-y-auto bg-[#1a1d24] border border-white/15 rounded shadow-lg">
          {matches.map((p, i) => (
            <div
              key={p}
              onMouseDown={e => { e.preventDefault(); pick(p) }}
              onMouseEnter={() => setActive(i)}
              className={`px-2 py-1 text-[10px] cursor-pointer ${i === active ? 'bg-blue-500/30 text-white' : 'text-gray-300'}`}
            >
              {p}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
