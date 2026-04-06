import { Handle, Position } from '@xyflow/react'

const typeColors: Record<string, { bg: string; border: string; accent: string }> = {
  trigger: { bg: '#0d1f0d', border: '#22c55e30', accent: '#22c55e' },
  condition: { bg: '#1f1d0d', border: '#eab30830', accent: '#eab308' },
  action: { bg: '#0d0d1f', border: '#3b82f630', accent: '#3b82f6' },
  delay: { bg: '#1a1518', border: '#a855f730', accent: '#a855f7' },
  wait: { bg: '#1a0d1f', border: '#ec489930', accent: '#ec4899' },
}

interface BaseNodeProps {
  type: 'trigger' | 'condition' | 'action' | 'delay' | 'wait'
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

export function BaseNode({ type, icon, label, selected, children, hasInput = true, hasOutput = true, outputLabels, executionStatus, executionOutput, executionError, hasCaptureData, alias, onAliasChange }: BaseNodeProps) {
  const colors = typeColors[type]

  const execBorder = executionStatus === 'running' ? '#3b82f6'
    : executionStatus === 'completed' ? '#22c55e'
    : executionStatus === 'error' ? '#ef4444'
    : null

  const execShadow = executionStatus === 'running' ? '0 0 20px #3b82f680, 0 0 40px #3b82f630'
    : executionStatus === 'completed' ? '0 0 15px #22c55e50'
    : executionStatus === 'error' ? '0 0 15px #ef444450'
    : null

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

      {/* Body */}
      {children && (
        <div className="px-3 py-2 space-y-1.5">
          {children}
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
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:border-blue-500/30 focus:outline-none placeholder:text-gray-600"
    />
  )
}
