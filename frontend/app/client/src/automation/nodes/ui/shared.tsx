import { useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import { useNodeDataUpdater } from '../BaseNode'

// Shared bits for the UI composition nodes. UI nodes describe STRUCTURE (a tree
// the backend renders), not sequential actions. Each stores its props under
// data.params. Containers (panel/col/row/tabs) expose a child output handle.

export const ACCENT = '#818cf8' // indigo-400
const BORDER = '#818cf830'
const BG = '#10101e'

export function UIBox({
  id, data, selected, icon, label, isContainer, hasInput = true, children,
}: {
  id: string; data: any; selected?: boolean; icon: string; label: string
  isContainer?: boolean; hasInput?: boolean; children?: React.ReactNode
}) {
  return (
    <div className="relative">
      <div
        className="rounded-xl min-w-[170px] text-xs"
        style={{ background: BG, border: `1px solid ${selected ? ACCENT : BORDER}`, boxShadow: selected ? `0 0 16px ${ACCENT}20` : 'none' }}
      >
        {hasInput && (
          <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !border-2" style={{ background: '#2a2a2a', borderColor: ACCENT }} />
        )}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b" style={{ borderColor: BORDER }}>
          <span>{icon}</span>
          <span className="font-semibold text-[11px]" style={{ color: ACCENT }}>{label}</span>
        </div>
        {children && <div className="px-3 py-2 space-y-1.5">{children}</div>}
        {isContainer && (
          <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !border-2" style={{ background: '#2a2a2a', borderColor: ACCENT }} title="conectar filhos" />
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
