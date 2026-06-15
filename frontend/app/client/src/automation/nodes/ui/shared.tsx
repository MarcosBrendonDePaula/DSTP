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
  id, data, selected, icon, label, isContainer, hasInput = true, children,
}: {
  id: string; data: any; selected?: boolean; icon: string; label: string
  isContainer?: boolean; hasInput?: boolean; children?: React.ReactNode
}) {
  const Icon = nodeIcon(undefined, `${icon || ''} ${label || ''}`)
  const description = useContext(NodeDescriptionContext)
  const configOnly = useContext(ConfigOnlyContext)
  // In the detail modal, render ONLY the config fields (like BaseNode). On the
  // canvas we drop the fields and keep the card compact (icon + name + description).
  if (configOnly) {
    return <div className="dstp-config space-y-3">{children}</div>
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
        {hasInput && (
          <DstpHandle type="target" position={Position.Left} className="dstp-handle" style={{ '--h': ACCENT } as React.CSSProperties} />
        )}
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
