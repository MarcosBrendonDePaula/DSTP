import { Handle, Position } from '@xyflow/react'

const typeColors: Record<string, { bg: string; border: string; accent: string }> = {
  trigger: { bg: '#0a1a0a', border: '#22c55e30', accent: '#22c55e' },
  condition: { bg: '#1a1a0a', border: '#eab30830', accent: '#eab308' },
  action: { bg: '#0a0a1a', border: '#3b82f630', accent: '#3b82f6' },
}

interface BaseNodeProps {
  type: 'trigger' | 'condition' | 'action'
  icon: string
  label: string
  selected?: boolean
  children?: React.ReactNode
  hasInput?: boolean
  hasOutput?: boolean
  outputLabels?: { id: string; label: string }[]
}

export function BaseNode({ type, icon, label, selected, children, hasInput = true, hasOutput = true, outputLabels }: BaseNodeProps) {
  const colors = typeColors[type]

  return (
    <div
      className="rounded-xl min-w-[200px] text-xs"
      style={{
        background: colors.bg,
        border: `1px solid ${selected ? colors.accent : colors.border}`,
        boxShadow: selected ? `0 0 20px ${colors.accent}20` : 'none',
      }}
    >
      {/* Input handle */}
      {hasInput && (
        <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !border-2" style={{ background: '#1a1a1a', borderColor: colors.accent }} />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: colors.border }}>
        <span>{icon}</span>
        <span className="font-semibold text-[11px]" style={{ color: colors.accent }}>{label}</span>
      </div>

      {/* Body */}
      {children && (
        <div className="px-3 py-2 space-y-1.5">
          {children}
        </div>
      )}

      {/* Output handle(s) */}
      {hasOutput && !outputLabels && (
        <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !border-2" style={{ background: '#1a1a1a', borderColor: colors.accent }} />
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
                style={{ background: '#1a1a1a', borderColor: out.id === 'true' ? '#22c55e' : '#ef4444' }}
              />
            </div>
          ))}
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
      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-blue-500/30 focus:outline-none"
    >
      <option value="">Selecionar...</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function NodeInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-blue-500/30 focus:outline-none placeholder:text-gray-600"
    />
  )
}
