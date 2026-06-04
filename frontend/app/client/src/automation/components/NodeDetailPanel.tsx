import { useState, useEffect, useCallback } from 'react'
import type { Node } from '@xyflow/react'
import { ReactFlowProvider } from '@xyflow/react'
import {
  triggerOutputSchemas,
  nodeOutputSchemas,
  type OutputField,
  type NodeOutputSchema,
} from '../nodeOutputSchemas'
import { TRIGGER_EVENTS } from '../nodes'
import { ACTION_TYPES } from '../nodes/actions/actionTypes'
import { registryMetaByType, registryNodeTypes } from '../nodes/registry'
import { ConfigOnlyContext } from '../nodes/BaseNode'
import { UITreeEditor } from './UITreeEditor'

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
  webhook:      { icon: '🪝', label: 'Webhook',   color: '#22c55e' },
  condition:    { icon: '❓', label: 'Condição',  color: '#eab308' },
  action:       { icon: '🎯', label: 'Ação',      color: '#3b82f6' },
  delay:        { icon: '⏱', label: 'Delay',     color: '#a855f7' },
  http_request: { icon: '🌐', label: 'HTTP',      color: '#06b6d4' },
  set_variable: { icon: '📝', label: 'Variável',  color: '#a855f7' },
  script:       { icon: '🧩', label: 'Script',    color: '#f97316' },
  memory:       { icon: '💾', label: 'Memory',     color: '#f59e0b' },
  wait:         { icon: '🔀', label: 'Wait/Merge', color: '#ec4899' },
  ui_builder:   { icon: '🎨', label: 'UI Builder', color: '#818cf8' },
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
  onUpdateData?: (nodeId: string, data: Record<string, any>) => void
  captureTrace?: CaptureTraceEntry[] | null
  captureContext?: Record<string, any> | null
  allNodes?: Node[]
  allEdges?: Array<{ source: string; target: string }>
  onUpdateTree?: (nodeId: string, tree: any) => void
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
  const nodeData = node.data as Record<string, any>
  const triggerMatchesNode = node.type !== 'trigger'
    || !nodeData?.event_type
    || context?.trigger?._event_type === nodeData.event_type

  // Always include trigger data if available
  if (context?.trigger && triggerMatchesNode) {
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
  if (node.type === 'trigger' && context?.trigger) {
    const eventType = (node.data as any)?.event_type
    if (!eventType || context.trigger._event_type === eventType) return context.trigger
  }

  return null
}

function ConfigField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[9px] text-gray-500 block mb-1">{label}</span>
      {children}
    </label>
  )
}

function ConfigInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white focus:border-blue-500/30 focus:outline-none placeholder:text-gray-600"
    />
  )
}

function ConfigSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white focus:border-blue-500/30 focus:outline-none [&>option]:bg-[#1a1a1a] [&>option]:text-white"
    >
      <option value="">Selecionar...</option>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

function ConfigTextarea({ value, onChange, placeholder, rows = 6 }: { value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      spellCheck={false}
      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white font-mono leading-relaxed resize-y focus:border-blue-500/30 focus:outline-none placeholder:text-gray-600"
    />
  )
}

const CONDITION_OPERATORS = [
  { value: 'equals', label: '== Igual' },
  { value: 'not_equals', label: '!= Diferente' },
  { value: 'greater_than', label: '> Maior que' },
  { value: 'less_than', label: '< Menor que' },
  { value: 'contains', label: 'Contem' },
  { value: 'exists', label: 'Existe' },
]

const HTTP_METHODS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
]

function NodeConfigEditor({ nodeId, type, data, updateData }: { nodeId: string; type: string; data: Record<string, any>; updateData: (patch: Record<string, any>) => void }) {
  const updateParam = (key: string, value: string) => {
    updateData({ params: { ...(data.params || {}), [key]: value } })
  }

  if (type === 'trigger') {
    return (
      <ConfigField label="Evento">
        <ConfigSelect value={data.event_type || ''} onChange={event_type => updateData({ event_type })} options={TRIGGER_EVENTS} />
      </ConfigField>
    )
  }

  if (type === 'condition') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <ConfigField label="Campo">
          <ConfigInput value={data.field || ''} onChange={field => updateData({ field })} placeholder="userid ou {{alias.campo}}" />
        </ConfigField>
        <ConfigField label="Operador">
          <ConfigSelect value={data.operator || ''} onChange={operator => updateData({ operator })} options={CONDITION_OPERATORS} />
        </ConfigField>
        {data.operator !== 'exists' && (
          <ConfigField label="Valor">
            <ConfigInput value={data.value || ''} onChange={value => updateData({ value })} placeholder="valor esperado" />
          </ConfigField>
        )}
      </div>
    )
  }

  if (type === 'action') {
    const actionDef = ACTION_TYPES.find(action => action.value === data.action_type)
    return (
      <div className="space-y-2">
        <ConfigField label="Acao">
          <ConfigSelect
            value={data.action_type || ''}
            onChange={action_type => {
              const next = ACTION_TYPES.find(action => action.value === action_type)
              // Keep any already-entered values for params the new action still
              // has; start new params empty (NOT the placeholder, which is only
              // a hint and would otherwise be saved as literal data).
              const prev = data.params || {}
              const params = Object.fromEntries(
                (next?.params || []).map(param => [param.key, prev[param.key] ?? ''])
              )
              updateData({ action_type, params })
            }}
            options={ACTION_TYPES.map(action => ({ value: action.value, label: action.label }))}
          />
        </ConfigField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {(actionDef?.params || []).map(param => (
            <ConfigField key={param.key} label={param.label}>
              <ConfigInput value={data.params?.[param.key] || ''} onChange={value => updateParam(param.key, value)} placeholder={param.placeholder} />
            </ConfigField>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'delay') {
    return (
      <ConfigField label="Delay (ms)">
        <ConfigInput value={data.delay_ms || '3000'} onChange={delay_ms => updateData({ delay_ms })} placeholder="3000" />
      </ConfigField>
    )
  }

  if (type === 'http_request') {
    const method = data.params?.method || 'GET'
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <ConfigField label="URL">
          <ConfigInput value={data.params?.url || ''} onChange={value => updateParam('url', value)} placeholder="https://api.example.com/webhook" />
        </ConfigField>
        <ConfigField label="Metodo">
          <ConfigSelect value={method} onChange={value => updateParam('method', value)} options={HTTP_METHODS} />
        </ConfigField>
        <ConfigField label="Headers JSON">
          <ConfigInput value={data.params?.headers || ''} onChange={value => updateParam('headers', value)} placeholder='{"Authorization":"Bearer ..."}' />
        </ConfigField>
        {method !== 'GET' && (
          <ConfigField label="Body">
            <ConfigInput value={data.params?.body || ''} onChange={value => updateParam('body', value)} placeholder='{"text":"{{trigger.name}}"}' />
          </ConfigField>
        )}
      </div>
    )
  }

  if (type === 'wait') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <ConfigField label="Modo">
          <ConfigSelect value={data.mode || 'all'} onChange={mode => updateData({ mode })} options={[{ value: 'all', label: 'Esperar todos' }, { value: 'any', label: 'Qualquer um' }]} />
        </ConfigField>
        <ConfigField label="Correlacao">
          <ConfigSelect value={data.correlation || 'broadcast'} onChange={correlation => updateData({ correlation })} options={[{ value: 'broadcast', label: 'Broadcast' }, { value: 'correlation_key', label: 'Por campo' }, { value: 'all_to_one', label: 'Todos de uma vez' }]} />
        </ConfigField>
        {data.correlation === 'correlation_key' && (
          <ConfigField label="Chave">
            <ConfigInput value={data.correlationExpression || ''} onChange={correlationExpression => updateData({ correlationExpression })} placeholder="{{trigger.userid}}" />
          </ConfigField>
        )}
        <ConfigField label="Timeout (ms)">
          <ConfigInput value={data.timeoutMs || '300000'} onChange={timeoutMs => updateData({ timeoutMs })} placeholder="300000" />
        </ConfigField>
        <ConfigField label="Ao expirar">
          <ConfigSelect
            value={data.timeoutAction || 'discard'}
            onChange={timeoutAction => updateData({ timeoutAction })}
            options={[{ value: 'discard', label: 'Descartar' }, { value: 'timeout_branch', label: 'Seguir saida de timeout' }]}
          />
        </ConfigField>
      </div>
    )
  }

  if (type === 'get_player') {
    return (
      <ConfigField label="User ID">
        <ConfigInput value={data.params?.userid || ''} onChange={value => updateParam('userid', value)} placeholder="{{trigger.userid}}" />
      </ConfigField>
    )
  }

  if (type === 'find_player') {
    return (
      <ConfigField label="Nome do player">
        <ConfigInput value={data.params?.name || ''} onChange={value => updateParam('name', value)} placeholder="{{trigger.name}} ou nick" />
      </ConfigField>
    )
  }

  if (type === 'memory') {
    const action = data.action || 'read'
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <ConfigField label="Acao">
          <ConfigSelect
            value={action}
            onChange={value => updateData({ action: value, params: { ...(data.params || {}), action: value } })}
            options={[{ value: 'read', label: 'Ler' }, { value: 'write', label: 'Gravar' }, { value: 'delete', label: 'Apagar' }]}
          />
        </ConfigField>
        <ConfigField label="Chave">
          <ConfigInput value={data.params?.key || ''} onChange={value => updateParam('key', value)} placeholder="nome_da_chave" />
        </ConfigField>
        {action === 'write' && (
          <ConfigField label="Valor">
            <ConfigInput value={data.params?.value || ''} onChange={value => updateParam('value', value)} placeholder="{{trigger.userid}} ou texto" />
          </ConfigField>
        )}
      </div>
    )
  }

  if (type === 'script') {
    return (
      <ConfigField label="Codigo JavaScript">
        <ConfigTextarea value={data.params?.code || ''} onChange={value => updateParam('code', value)} placeholder="// retorne um objeto\nreturn { ok: true }" rows={10} />
      </ConfigField>
    )
  }

  if (type === 'ai_agent') {
    const provider = data.provider || 'anthropic'
    const MODELS: Record<string, string[]> = {
      anthropic: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
      openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
      google: ['gemini-2.0-flash', 'gemini-2.0-pro'],
    }
    return (
      <div className="space-y-2">
        <ConfigField label="Provider">
          <ConfigSelect
            value={provider}
            onChange={v => updateData({ provider: v, model: (MODELS[v] || [])[0] || '' })}
            options={[
              { value: 'anthropic', label: 'Anthropic (Claude)' },
              { value: 'openai', label: 'OpenAI (GPT)' },
              { value: 'google', label: 'Google (Gemini)' },
            ]}
          />
        </ConfigField>
        <ConfigField label="Modelo">
          <ConfigInput value={data.model || ''} onChange={v => updateData({ model: v })} placeholder={(MODELS[provider] || [])[0] || 'modelo'} />
        </ConfigField>
        <ConfigField label="API Key (use o cofre)">
          <ConfigInput value={data.api_key || ''} onChange={v => updateData({ api_key: v })} placeholder="{{environment.prod.OPENAI_KEY}}" />
        </ConfigField>
        <ConfigField label="System (instruções fixas)">
          <ConfigTextarea value={data.system || ''} onChange={v => updateData({ system: v })} placeholder="Você é um assistente do servidor DST..." rows={4} />
        </ConfigField>
        <ConfigField label="Prompt">
          <ConfigTextarea value={data.prompt || ''} onChange={v => updateData({ prompt: v })} placeholder='Jogador "{{trigger.name}}" disse: "{{trigger.message}}"' rows={3} />
        </ConfigField>
        <div className="grid grid-cols-2 gap-2">
          <ConfigField label="Max steps">
            <ConfigInput value={data.max_steps || ''} onChange={v => updateData({ max_steps: v })} placeholder="8" />
          </ConfigField>
          <ConfigField label="Temperature">
            <ConfigInput value={data.temperature || ''} onChange={v => updateData({ temperature: v })} placeholder="0.7" />
          </ConfigField>
        </div>

        <div className="pt-2 mt-1 border-t border-white/5">
          <div className="text-[10px] text-gray-500 mb-1">🧠 Memória de conversa (histórico)</div>
          <div className="grid grid-cols-2 gap-2">
            <ConfigField label="Memória">
              <ConfigSelect
                value={data.memory_enabled ? 'on' : 'off'}
                onChange={v => updateData({ memory_enabled: v === 'on' })}
                options={[{ value: 'off', label: 'Desligada' }, { value: 'on', label: 'Ligada' }]}
              />
            </ConfigField>
            <ConfigField label="Escopo">
              <ConfigSelect
                value={data.memory_scope || 'player'}
                onChange={v => updateData({ memory_scope: v })}
                options={[{ value: 'player', label: 'Por jogador' }, { value: 'global', label: 'Global do servidor' }]}
              />
            </ConfigField>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <ConfigField label="Limite (nº de mensagens)">
              <ConfigInput value={data.memory_limit || ''} onChange={v => updateData({ memory_limit: v })} placeholder="10" />
            </ConfigField>
            <ConfigField label="Modo ao atingir limite">
              <ConfigSelect
                value={data.memory_mode || 'rotate'}
                onChange={v => updateData({ memory_mode: v })}
                options={[
                  { value: 'rotate', label: 'Rotativo (descarta antiga)' },
                  { value: 'compact', label: 'Compactar (resume antigas)' },
                ]}
              />
            </ConfigField>
          </div>
        </div>

        <div className="text-[10px] text-gray-500">
          🔧 Conecte nós (action, ai_memory, etc.) no handle <span className="text-fuchsia-400">tools</span> — a IA os chama como ferramentas.
        </div>
      </div>
    )
  }

  if (type === 'set_variable') {
    const entries = Object.entries(data.params || {})
    const setKey = (oldKey: string, newKey: string) => {
      const next: Record<string, any> = {}
      for (const [k, v] of Object.entries(data.params || {})) next[k === oldKey ? newKey : k] = v
      updateData({ params: next })
    }
    const removeKey = (key: string) => {
      const next = { ...(data.params || {}) }
      delete next[key]
      updateData({ params: next })
    }
    return (
      <div className="space-y-2">
        {entries.length === 0 && (
          <div className="text-[10px] text-gray-500">Nenhuma variavel. Adicione abaixo.</div>
        )}
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <ConfigInput value={key} onChange={newKey => setKey(key, newKey.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="nome" />
            <span className="text-gray-500 text-[11px]">=</span>
            <ConfigInput value={String(value ?? '')} onChange={v => updateParam(key, v)} placeholder="valor ou {{ref}}" />
            <button onClick={() => removeKey(key)} className="shrink-0 px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] hover:bg-red-500/20">remover</button>
          </div>
        ))}
        <button
          onClick={() => updateParam(`var_${entries.length + 1}`, '')}
          className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px] hover:bg-blue-500/20"
        >
          + Adicionar variavel
        </button>
      </div>
    )
  }

  // Default: render the node's OWN ui.tsx (from the module registry) as the config
  // editor — single source of truth. The modal renders OUTSIDE <ReactFlow>, so:
  //  - wrap in a local ReactFlowProvider so the node's useReactFlow() calls don't
  //    throw (its result is ignored — see useNodeDataUpdater),
  //  - provide the real persist fn via ConfigOnlyContext (setNodes-backed),
  //  - ConfigOnly makes BaseNode emit just the fields.
  const RegistryNode = registryNodeTypes[type as keyof typeof registryNodeTypes]
  if (RegistryNode) {
    return (
      <ReactFlowProvider>
        <ConfigOnlyContext.Provider value={{ setNodeData: (_id, full) => updateData(full) }}>
          <RegistryNode id={nodeId} data={data} selected={false} />
        </ConfigOnlyContext.Provider>
      </ReactFlowProvider>
    )
  }

  // Last resort for any non-module type: generic param inputs.
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {Object.entries(data.params || {}).map(([key, value]) => (
        <ConfigField key={key} label={key}>
          <ConfigInput value={String(value ?? '')} onChange={next => updateParam(key, next)} />
        </ConfigField>
      ))}
      <ConfigField label="Alias">
        <ConfigInput value={data.alias || ''} onChange={alias => updateData({ alias: alias.replace(/[^a-zA-Z0-9_]/g, '') })} placeholder="apelido" />
      </ConfigField>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────

export function NodeDetailPanel({ node, onClose, onUpdateData, captureTrace, captureContext, allNodes = [], allEdges = [], onUpdateTree }: NodeDetailPanelProps) {
  const type = node.type || 'unknown'
  // Prefer the node's registry meta (icon/label/color); fall back to the local
  // map for any non-module type, then a generic default.
  const regMeta = registryMetaByType[type]
  const meta = regMeta
    ? { icon: regMeta.icon, label: regMeta.label, color: regMeta.color }
    : (nodeTypeMeta[type] || { icon: '?', label: type, color: '#888' })
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

  const hasInput = Object.keys(inputData).length > 0
  const hasOutput = outputData !== null
  const updateData = (patch: Record<string, any>) => {
    onUpdateData?.(node.id, { ...data, ...patch })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-[#0b0b0b] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 'min(1180px, calc(100vw - 32px))', height: 'min(780px, calc(100vh - 32px))' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0 bg-[#0f0f0f]">
          <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-base">{meta.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white">{meta.label}</div>
            <div className="text-xs text-gray-500">
              {getNodeCategory(type)}
              {alias && <> · <span className="text-purple-400">{alias}</span></>}
              <span className="font-mono ml-2">{node.id}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-sm px-2 py-1 rounded hover:bg-white/5 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* UI Builder: visual tree editor (replaces input/output body) */}
        {type === 'ui_builder' ? (
          <div className="flex min-h-0 flex-1">
            <aside className="w-[360px] shrink-0 border-r border-white/10 bg-[#0f0f0f] p-4 overflow-y-auto">
              <h3 className="text-[11px] font-semibold text-gray-300 mb-3 uppercase tracking-wider">Configuracao</h3>
              <NodeConfigEditor nodeId={node.id} type={type} data={data} updateData={updateData} />
            </aside>
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              <UITreeEditor nodeId={node.id} tree={(data as any)?.tree ?? null} onChange={tree => onUpdateTree?.(node.id, tree)} />
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px_1fr] flex-1 overflow-hidden min-h-0 bg-[#0a0a0a]">
          <section className="border-b lg:border-b-0 lg:border-r border-white/5 overflow-y-auto p-4 min-h-0">
            <h3 className="text-[11px] font-semibold text-gray-300 mb-3 uppercase tracking-wider">Entrada</h3>

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
          </section>

          <section className="border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0f0f0f] overflow-y-auto p-4 min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Configuracao</h3>
              <span className="text-[9px] text-gray-600">auto-save</span>
            </div>
            <div className="space-y-3">
              <NodeConfigEditor nodeId={node.id} type={type} data={data} updateData={updateData} />
            </div>
          </section>

          <section className="overflow-y-auto p-4 min-h-0">
            <h3 className="text-[11px] font-semibold text-gray-300 mb-3 uppercase tracking-wider">Saida</h3>

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
          </section>
        </div>
        )}
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
    <div
      className="group rounded-md bg-white/[0.03] px-2 py-1.5 hover:bg-white/[0.06] transition-colors cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={event => {
        event.dataTransfer.setData('application/dstp-expression', ref)
        event.dataTransfer.setData('text/plain', ref)
        event.dataTransfer.effectAllowed = 'copy'
      }}
      title="Arraste para um campo de parametro para inserir esta expressao"
    >
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
