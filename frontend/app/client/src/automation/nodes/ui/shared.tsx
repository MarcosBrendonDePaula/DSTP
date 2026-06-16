import { useCallback, useContext } from 'react'
import { Position } from '@xyflow/react'
import { useNodeDataUpdater, NodeDescriptionContext, ConfigOnlyContext, DstpHandle } from '../BaseNode'
import { nodeIcon } from '../nodeIcons'

// Shared bits for the UI composition nodes. UI nodes describe STRUCTURE (a tree
// the backend renders), not sequential actions. Each stores its props under
// data.params. Containers (panel/col/row/tabs) expose a child output handle.
//
// Visuals mirror BaseNode (same neutral surface + accent chip + big handles) so
// UI nodes feel like first-class citizens on the canvas; the accent is indigo to
// signal "this is presentation, not logic".

export const ACCENT = '#818cf8' // indigo-400
const NODE_BG = '#16181d'

export function UIBox({
  id, data, selected, icon, label, isContainer, hasInput = true, children, outputHandles, inputHandles,
}: {
  id: string; data: any; selected?: boolean; icon: string; label: string
  isContainer?: boolean; hasInput?: boolean; children?: React.ReactNode
  // Named source handles on the right edge (e.g. one per UI callback) so a flow can react
  // to a specific button/field event right from this node. id is the edge sourceHandle.
  outputHandles?: { id: string; label: string }[]
  // Extra named TARGET handles on the left edge (e.g. "repaint" — re-render this UI for the
  // player). Wiring a callback into one re-runs the node. id is the edge targetHandle.
  inputHandles?: { id: string; label: string }[]
}) {
  const Icon = nodeIcon(undefined, `${icon || ''} ${label || ''}`)
  const description = useContext(NodeDescriptionContext)
  const configOnly = useContext(ConfigOnlyContext)
  // Alias support (like BaseNode): lets a UI node be referenced as {{alias.field}} —
  // e.g. a ui_builder whose callback output you read as {{myUI.callback_data.fields.x}}.
  const updateNodeData = useNodeDataUpdater()
  const setAlias = (v: string) => updateNodeData(id, { ...data, alias: v.replace(/[^a-zA-Z0-9_]/g, '') })
  // In the detail modal, render ONLY the config fields (like BaseNode). On the
  // canvas we drop the fields and keep the card compact (icon + name + description).
  if (configOnly) {
    return (
      <div className="dstp-config space-y-3">
        <div>
          <span className="text-[9px] text-gray-500 block mb-0.5">Apelido (alias) — referencie como {'{{'}alias.campo{'}}'}</span>
          <input value={data.alias || ''} onChange={e => setAlias(e.target.value)} placeholder="apelido para {{alias.campo}}"
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-indigo-400/40 focus:outline-none placeholder:text-gray-600" />
        </div>
        {children}
      </div>
    )
  }
  return (
    <div className="dstp-node group relative">
      <div
        className="relative rounded-xl min-w-[180px] text-xs"
        style={{
          background: NODE_BG,
          border: `1px solid ${selected ? ACCENT : 'rgba(255,255,255,0.08)'}`,
          boxShadow: selected
            ? `0 0 0 1px ${ACCENT}, 0 8px 28px -6px ${ACCENT}55`
            : '0 6px 18px -8px rgba(0,0,0,0.7)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        <div className="h-[3px] w-full rounded-t-xl" style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}33)` }} />
        {hasInput && (!inputHandles || inputHandles.length === 0) && (
          <DstpHandle type="target" position={Position.Left} className="dstp-handle" style={{ '--h': ACCENT } as React.CSSProperties} />
        )}
        {/* Default input + extra named inputs (e.g. "repaint") stacked on the LEFT edge. */}
        {hasInput && inputHandles && inputHandles.length > 0 && (
          <div className="absolute left-0 top-0 h-full flex flex-col items-start justify-center gap-1 -translate-x-full pr-1">
            <div className="relative flex items-center gap-1 pl-1.5">
              <DstpHandle type="target" position={Position.Left} className="dstp-handle !relative !transform-none !top-0 !left-0" style={{ '--h': ACCENT } as React.CSSProperties} />
              <span className="text-[9px] font-medium text-gray-400">▸ entra</span>
            </div>
            {inputHandles.map(h => (
              <div key={h.id} className="relative flex items-center gap-1 pl-1.5">
                <DstpHandle type="target" position={Position.Left} id={h.id} className="dstp-handle !relative !transform-none !top-0 !left-0" style={{ '--h': '#22d3ee' } as React.CSSProperties} />
                <span className="text-[9px] font-medium text-cyan-300">⟳ {h.label}</span>
              </div>
            ))}
          </div>
        )}
        {/* Floating alias (top-right), like BaseNode — hidden until hover/focus unless set. */}
        <input
          value={data.alias || ''} onChange={e => setAlias(e.target.value)} placeholder="alias"
          className={`nodrag absolute top-2 right-2.5 w-16 bg-black/40 rounded border border-white/10 text-[9px] text-gray-300 focus:border-white/30 focus:outline-none focus:text-white px-1 py-0.5 text-right placeholder:text-gray-600 transition-opacity ${data.alias ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
          onMouseDown={e => e.stopPropagation()}
        />
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <span
            className="grid place-items-center w-7 h-7 rounded-lg shrink-0"
            style={{ background: `${ACCENT}1f`, color: ACCENT, boxShadow: `inset 0 0 0 1px ${ACCENT}33` }}
          >
            <Icon size={15} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="dstp-node-title font-semibold text-[12px] text-white leading-tight truncate">{label}</div>
            <div className="text-[9px] uppercase tracking-wider text-gray-500 leading-tight">{isContainer ? 'container' : 'interface'}</div>
          </div>
        </div>
        {/* Card stays compact on the canvas: description only, never the form
            fields (those live in the detail modal via configOnly above). A bit of
            bottom padding keeps the rounded corner clean when there's no text. */}
        {description
          ? <p className="px-3 pb-2.5 -mt-0.5 text-[10px] text-gray-400 leading-snug line-clamp-2">{description}</p>
          : <div className="pb-1" />}
        {isContainer && (
          <DstpHandle type="source" position={Position.Right} className="dstp-handle" style={{ '--h': ACCENT } as React.CSSProperties} title="conectar filhos" />
        )}
        {/* Default flow-continue output (when there are no named handles). */}
        {!isContainer && (!outputHandles || outputHandles.length === 0) && (
          <DstpHandle type="source" position={Position.Right} className="dstp-handle" style={{ '--h': ACCENT } as React.CSSProperties} />
        )}
        {/* Named event outputs — one per UI callback. The plain "▸" continue handle stays as
            id=undefined (default), each callback adds id="cb:<callback>". */}
        {!isContainer && outputHandles && outputHandles.length > 0 && (
          <div className="flex flex-col items-end gap-1 px-3 pb-2.5 pt-0.5">
            <div className="relative flex items-center gap-1.5 pr-1.5">
              <span className="text-[9px] font-medium text-gray-400">▸ continua</span>
              <DstpHandle type="source" position={Position.Right} className="dstp-handle !relative !transform-none !top-0 !right-0" style={{ '--h': ACCENT } as React.CSSProperties} />
            </div>
            {outputHandles.map(h => (
              <div key={h.id} className="relative flex items-center gap-1.5 pr-1.5">
                <span className="text-[9px] font-medium text-amber-300">⚡ {h.label}</span>
                <DstpHandle type="source" position={Position.Right} id={h.id} className="dstp-handle !relative !transform-none !top-0 !right-0" style={{ '--h': '#f59e0b' } as React.CSSProperties} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function field(label: string, value: string, onChange: (v: string) => void, placeholder?: string) {
  return (
    <div key={label}>
      <span className="text-[9px] text-gray-500 block mb-0.5">{label}</span>
      <input
        value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-indigo-400/40 focus:outline-none placeholder:text-gray-600"
      />
    </div>
  )
}

// A labeled <select> for a fixed set of options. Mirrors field()'s styling.
export function selectField(
  label: string,
  value: string,
  onChange: (v: string) => void,
  options: Array<{ value: string; label: string }>,
) {
  return (
    <div key={label}>
      <span className="text-[9px] text-gray-500 block mb-0.5">{label}</span>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-indigo-400/40 focus:outline-none"
      >
        {options.map(o => <option key={o.value} value={o.value} className="bg-[#10101e]">{o.label}</option>)}
      </select>
    </div>
  )
}

// Screen anchor positions supported by the mod renderer (ui_widgets AnchorOffset).
export const ANCHOR_OPTIONS = [
  { value: 'center', label: 'Centro' },
  { value: 'top', label: 'Topo' },
  { value: 'topleft', label: 'Topo-esquerda' },
  { value: 'topright', label: 'Topo-direita' },
  { value: 'left', label: 'Esquerda' },
  { value: 'right', label: 'Direita' },
  { value: 'bottom', label: 'Base' },
  { value: 'bottomleft', label: 'Base-esquerda' },
  { value: 'bottomright', label: 'Base-direita' },
]

// Update a single param key on data.params.
export function useParam(id: string, data: any) {
  const updateNodeData = useNodeDataUpdater()
  return useCallback((key: string, value: string) => {
    updateNodeData(id, { ...data, params: { ...data.params, [key]: value } })
  }, [id, data, updateNodeData])
}
