import { useState, useEffect, useCallback, useRef } from 'react'
import type { Node } from '@xyflow/react'
import { ReactFlowProvider } from '@xyflow/react'
import {
  triggerOutputSchemas,
  nodeOutputSchemas,
  type OutputField,
  type NodeOutputSchema,
} from '../nodeOutputSchemas'
import { ACTION_TYPES } from '../nodes/actions/actionTypes'
import { registryMetaByType, registryNodeTypes, registryOutputSchemas } from '../nodes/registry'
import { ConfigOnlyContext, NodePrefabInput } from '../nodes/BaseNode'
import { UITreeEditor } from './UITreeEditor'
import { nodeIcon } from '../nodes/nodeIcons'
import { triggerShape } from '../nodes/eventSchemas'
import { LuChevronDown, LuCheck, LuChevronRight, LuX, LuArrowRight, LuPanelLeftClose, LuPanelRightClose, LuPanelLeftOpen, LuPanelRightOpen } from 'react-icons/lu'
import type { IconType } from 'react-icons'

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
        className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors text-[10px]"
      >
        <LuChevronRight size={10} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} /> {label}
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

// Build a placeholder example object from a node's outputSchema, so the Input
// column can show the SHAPE of upstream data even when no capture has run yet.
// Each field becomes a typed placeholder (e.g. health → "object", userid → "string").
function schemaExample(type: string | undefined): Record<string, any> | null {
  const schema = type ? registryMetaByType[type]?.outputSchema : undefined
  if (!schema?.fields?.length) return null
  const ex: Record<string, any> = {}
  for (const f of schema.fields) {
    ex[f.name] = f.type === 'number' ? 0
      : f.type === 'boolean' ? false
      : f.type === 'object' ? { '…': `(${f.description || 'objeto'})` }
      : `<${f.name}>`
  }
  return ex
}

// Best-effort: pull the top-level keys from a script node's `return { ... }` so
// its output fields are discoverable WITHOUT running. The script return is
// arbitrary JS, so this is a heuristic — it reads the keys of the LAST top-level
// object literal returned. Returns null if it can't tell (then we fall back to
// the generic "<your return>" stub).
function scriptReturnShape(code: string | undefined): Record<string, any> | null {
  if (!code || typeof code !== 'string') return null
  // Find a `return {` and capture to the matching brace (shallow — good enough).
  const m = code.match(/return\s*\{/g)
  if (!m) return null
  const idx = code.lastIndexOf('return')
  const braceStart = code.indexOf('{', idx)
  if (braceStart < 0) return null
  let depth = 0, end = -1
  for (let i = braceStart; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end < 0) return null
  const body = code.slice(braceStart + 1, end)
  // Grab top-level `key:` at depth 0 inside the object.
  const keys: string[] = []
  let d = 0
  for (const part of body.split('\n')) {
    const km = part.match(/^\s*['"]?([a-zA-Z_$][\w$]*)['"]?\s*:/)
    // Only count keys when not nested inside a sub-object/array on a prior line.
    if (d === 0 && km) keys.push(km[1])
    for (const ch of part) { if (ch === '{' || ch === '[') d++; else if (ch === '}' || ch === ']') d-- }
  }
  if (!keys.length) return null
  const shape: Record<string, any> = {}
  for (const k of keys) shape[k] = '<valor>'
  return shape
}

function getInputData(
  node: Node,
  allNodes: Node[],
  allEdges: Array<{ source: string; target: string }>,
  trace: CaptureTraceEntry[],
  context: Record<string, any> | null
): { input: Record<string, any>; isSchema: boolean } {
  const input: Record<string, any> = {}
  const nodeData = node.data as Record<string, any>
  const triggerMatchesNode = node.type !== 'trigger'
    || !nodeData?.event_type
    || context?.trigger?._event_type === nodeData.event_type

  let anyReal = false

  // Trigger data: real capture if present, else a generic placeholder shape.
  if (node.type !== 'trigger') {
    if (context?.trigger && triggerMatchesNode) {
      input['trigger'] = context.trigger
      anyReal = true
    }
  }

  // For non-trigger nodes, include upstream outputs (real capture OR schema shape).
  if (node.type !== 'trigger') {
    const upstreamIds = getUpstreamNodeIds(node.id, allNodes, allEdges)
    for (const upId of upstreamIds) {
      const upNode = allNodes.find(n => n.id === upId)
      if (!upNode) continue
      const alias = (upNode.data as any)?.alias
      const key = alias || upId
      const traceEntry = [...trace].reverse().find(t => t.nodeId === upId && t.status === 'completed')
      // Last real output captured for this node (persisted on node.data during a
      // run). Crucial for `script`: its return shape is unknown until executed —
      // after one test the real fields show, instead of the "<your return>" stub.
      const lastOutput = (upNode.data as any)?._executionOutput
      if (upNode.type === 'trigger') {
        // A trigger's runtime output is `context.trigger`. Without a capture we
        // show the REAL fields of its event (eventSchemas) — not a generic stub.
        // With ONE upstream trigger it's the canonical `trigger`; with SEVERAL
        // (e.g. two triggers into a Merge) each extra also gets its own key so
        // none is lost.
        const real = traceEntry?.output || (lastOutput && typeof lastOutput === 'object' ? lastOutput : null)
        const shape = real || triggerShape((upNode.data as any)?.event_type)
        if (real) anyReal = true
        if (!input['trigger']) input['trigger'] = shape
        else if (key !== 'trigger') input[key] = shape   // 2nd+ trigger → its own key
      } else if (traceEntry?.output) {
        if (key !== 'trigger') { input[key] = traceEntry.output; anyReal = true }
      } else if (lastOutput && typeof lastOutput === 'object') {
        if (key !== 'trigger') { input[key] = lastOutput; anyReal = true }
      } else if (upNode.type === 'script') {
        // Static parse of the script's `return { ... }`, else the generic stub.
        const shape = scriptReturnShape((upNode.data as any)?.params?.code) || schemaExample('script')
        if (shape && key !== 'trigger') input[key] = shape
      } else {
        const ex = schemaExample(upNode.type)
        if (ex && key !== 'trigger') input[key] = ex
      }
    }
    // NOTE: we intentionally do NOT inject a fallback `trigger` here. A node with
    // no incoming connection has no upstream data — showing a phantom trigger was
    // confusing. The trigger only appears when it's actually reachable upstream
    // (added in the loop above) or present in the capture context.
  }

  return { input, isSchema: !anyReal }
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

  // NOTE: `trigger` is intentionally NOT special-cased here. It falls through to the
  // RegistryNode path below, which renders the node's OWN ui.tsx (single source of
  // truth per the Node Module System). The old hard-coded trigger editor here only
  // rendered the event select and silently dropped the key_pressed "Tecla" field
  // that ui.tsx has — so the trigger never got its key and never fired. Deleting the
  // duplicate makes the modal and the canvas show the exact same fields, always.

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
              {param.key === 'prefab'
                ? <NodePrefabInput value={data.params?.[param.key] || ''} onChange={value => updateParam(param.key, value)} placeholder={param.placeholder} />
                : <ConfigInput value={data.params?.[param.key] || ''} onChange={value => updateParam(param.key, value)} placeholder={param.placeholder} />}
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
    // Prefer the registry's schema (covers EVERY migrated node, incl. new ones
    // like list_all_players); fall back to the legacy map for anything missing.
    schema = registryOutputSchemas[type] || nodeOutputSchemas[type] || null
  }

  // Get trace data
  const trace = captureTrace || []
  const context = captureContext || null
  const { input: inputData, isSchema: inputIsSchema } = getInputData(node, allNodes, allEdges, trace, context)
  const outputData = getOutputData(node, trace, context)

  // Middle-column tabs. Most nodes only have "config"; ui_builder adds Árvore +
  // Render (the visual tree editor) as sibling tabs in the SAME middle column.
  const isUIBuilder = type === 'ui_builder'
  const [midTab, setMidTab] = useState<'config' | 'tree' | 'render'>('config')
  useEffect(() => { setMidTab('config') }, [node.id])
  // Collapse the Input/Output side columns to give the middle column more room.
  // Output starts collapsed — without a capture it's just the schema, rarely the
  // focus when you open a node; expand it when you want to inspect the result.
  const [inCollapsed, setInCollapsed] = useState(false)
  const [outCollapsed, setOutCollapsed] = useState(true)

  // Which upstream source the Input column is showing (n8n's "Input from" select).
  const inputKeys = Object.keys(inputData)
  const [inputSource, setInputSource] = useState<string>('')
  // Default to the first source; reset when the node (and thus its inputs) changes.
  useEffect(() => { setInputSource(inputKeys[0] ?? '') }, [node.id])
  const activeSource = inputKeys.includes(inputSource) ? inputSource : inputKeys[0]

  // Clicking a field in the Input column inserts {{ref}} into the last-focused
  // param input (n8n-style). We track focus on the config column's inputs.
  const lastFocusedRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const insertExpressionRef = useCallback((ref: string) => {
    const el = lastFocusedRef.current
    if (el && document.contains(el)) {
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      const next = el.value.slice(0, start) + ref + el.value.slice(end)
      // Set value via the native setter so React's onChange fires.
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
      setter?.call(el, next)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      requestAnimationFrame(() => { el.focus(); const c = start + ref.length; el.setSelectionRange(c, c) })
    } else {
      // No focused field — copy to clipboard as a fallback.
      navigator.clipboard?.writeText(ref).catch(() => {})
    }
  }, [])

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
            className="grid place-items-center text-gray-500 hover:text-white w-7 h-7 rounded hover:bg-white/5 transition-colors"
            aria-label="Fechar"
          >
            <LuX size={16} />
          </button>
        </div>

        <div
          className="grid grid-cols-1 flex-1 overflow-hidden min-h-0 bg-[#0a0a0a]"
          style={{
            // Middle column is the star: it takes ALL remaining space (1fr). The
            // side columns have a sensible fixed width when open, and shrink to a
            // 40px rail when collapsed — so the middle grows to fill the gap.
            gridTemplateColumns: `${inCollapsed ? '40px' : 'minmax(260px, 340px)'} 1fr ${outCollapsed ? '40px' : 'minmax(260px, 340px)'}`,
          }}
        >
          {inCollapsed ? (
            <CollapsedRail label="Entrada" side="left" onExpand={() => setInCollapsed(false)} />
          ) : (
          <section className="border-b lg:border-b-0 lg:border-r border-white/5 overflow-y-auto p-4 min-h-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <button onClick={() => setInCollapsed(true)} title="Recolher" className="grid place-items-center w-5 h-5 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
                  <LuPanelLeftClose size={13} />
                </button>
                <h3 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Entrada</h3>
              </div>
              {hasInput && inputIsSchema && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400/90 border border-amber-500/20" title="Sem captura — mostrando os campos esperados, não valores reais">
                  padrão esperado
                </span>
              )}
            </div>

            {hasInput ? (
              <>
                {/* "Input from" selector — pick which upstream source to inspect. */}
                {inputKeys.length > 1 && (
                  <InputSourceSelect
                    keys={inputKeys}
                    value={activeSource}
                    onChange={setInputSource}
                    allNodes={allNodes}
                  />
                )}
                <p className="text-[9px] text-gray-500 mb-3 leading-relaxed">
                  {inputIsSchema
                    ? 'Campos esperados (o teste ainda não rodou).'
                    : 'Dados capturados.'}{' '}
                  Clique ou arraste para inserir <code className="text-purple-400">{'{{…}}'}</code>.
                </p>
                <div className="space-y-2.5">
                  {activeSource && (
                    <InputGroup contextKey={activeSource} value={inputData[activeSource]} onPick={insertExpressionRef} defaultOpen hideHeader={inputKeys.length > 1} />
                  )}
                </div>
              </>
            ) : (
              <p className="text-[10px] text-gray-500 italic">
                Nenhum dado de entrada disponivel.
                {!captureTrace?.length && <><br />Inicie uma captura para ver os dados.</>}
              </p>
            )}
          </section>
          )}

          <section
            className="border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0f0f0f] overflow-y-auto p-4 min-h-0"
            onFocusCapture={e => {
              const t = e.target as HTMLElement
              if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) lastFocusedRef.current = t
            }}
          >
            {/* Middle-column tabs. ui_builder gets Config + Árvore + Render; other
                nodes show just the config form. */}
            <div className="flex items-center justify-between mb-3">
              {isUIBuilder ? (
                <div className="flex gap-1">
                  {([['config', 'Config'], ['tree', '🌳 Árvore'], ['render', '👁 Render']] as const).map(([k, lbl]) => (
                    <button key={k} onClick={() => setMidTab(k)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${midTab === k ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-500 hover:text-gray-300'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              ) : (
                <h3 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Configuracao</h3>
              )}
              <span className="text-[9px] text-gray-600">auto-save</span>
            </div>
            {isUIBuilder && midTab !== 'config' ? (
              <UITreeEditor nodeId={node.id} tree={(data as any)?.tree ?? null} onChange={tree => onUpdateTree?.(node.id, tree)} forceTab={midTab} />
            ) : (
              <div className="space-y-3">
                <NodeConfigEditor nodeId={node.id} type={type} data={data} updateData={updateData} />
              </div>
            )}
          </section>

          {outCollapsed ? (
            <CollapsedRail label="Saída" side="right" onExpand={() => setOutCollapsed(false)} />
          ) : (
          <section className="overflow-y-auto p-4 min-h-0">
            <div className="flex items-center gap-1.5 mb-3">
              <button onClick={() => setOutCollapsed(true)} title="Recolher" className="grid place-items-center w-5 h-5 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
                <LuPanelRightClose size={13} />
              </button>
              <h3 className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">Saida</h3>
            </div>

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
          )}
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

// A thin vertical rail shown in place of a collapsed Input/Output column. Click
// (or the open icon) expands it back. The label reads bottom-to-top.
function CollapsedRail({ label, side, onExpand }: { label: string; side: 'left' | 'right'; onExpand: () => void }) {
  const OpenIcon = side === 'left' ? LuPanelLeftOpen : LuPanelRightOpen
  return (
    <button
      onClick={onExpand}
      title={`Expandir ${label}`}
      className={`group flex flex-col items-center gap-2 py-3 min-h-0 hover:bg-white/[0.03] transition-colors ${side === 'left' ? 'border-r' : 'border-l'} border-white/5`}
    >
      <OpenIcon size={14} className="text-gray-500 group-hover:text-white shrink-0" />
      <span className="text-[10px] uppercase tracking-wider text-gray-500 group-hover:text-gray-300" style={{ writingMode: 'vertical-rl' }}>{label}</span>
    </button>
  )
}

// Resolve a friendly { Icon, label, sublabel } for an input source key. Icon is a
// vector (Lucide) component — never an ASCII/emoji glyph.
function describeSource(key: string, allNodes: Node[]): { Icon: IconType; label: string; sub: string } {
  if (key === 'trigger') return { Icon: nodeIcon('trigger'), label: 'Gatilho', sub: 'trigger' }
  const upNode = allNodes.find(n => n.id === key || (n.data as any)?.alias === key)
  const meta = upNode ? registryMetaByType[upNode.type || ''] : undefined
  return { Icon: nodeIcon(upNode?.type, `${meta?.icon || ''} ${meta?.label || ''}`), label: meta?.label || upNode?.type || key, sub: key }
}

// A pretty custom dropdown for "Input from: <node>" (replaces the native <select>).
function InputSourceSelect({ keys, value, onChange, allNodes }: { keys: string[]; value: string; onChange: (k: string) => void; allNodes: Node[] }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as globalThis.Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const cur = describeSource(value, allNodes)
  return (
    <div ref={boxRef} className="relative mb-3">
      <div className="text-[8px] uppercase tracking-wider text-gray-500 mb-1">Ver entrada de</div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 hover:bg-white/[0.07] hover:border-white/20 transition-colors"
      >
        <span className="grid place-items-center w-6 h-6 rounded-md bg-white/5 text-gray-300 shrink-0"><cur.Icon size={13} strokeWidth={2.2} /></span>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[11px] font-semibold text-white truncate leading-tight">{cur.label}</div>
          <div className="text-[8px] font-mono text-gray-500 truncate leading-tight">{cur.sub}</div>
        </div>
        <LuChevronDown size={12} className={`text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 py-1 bg-[#16181d] border border-white/15 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
          {keys.map(k => {
            const d = describeSource(k, allNodes)
            const active = k === value
            return (
              <button
                key={k}
                onClick={() => { onChange(k); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${active ? 'bg-blue-500/15' : 'hover:bg-white/[0.06]'}`}
              >
                <span className="grid place-items-center w-6 h-6 rounded-md bg-white/5 text-gray-300 shrink-0"><d.Icon size={13} strokeWidth={2.2} /></span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[11px] font-medium truncate leading-tight ${active ? 'text-blue-300' : 'text-gray-200'}`}>{d.label}</div>
                  <div className="text-[8px] font-mono text-gray-500 truncate leading-tight">{d.sub}</div>
                </div>
                {active && <LuCheck size={12} className="text-blue-400 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// A collapsible group of clickable/draggable fields for one upstream source
// (trigger or a node id/alias). Mirrors n8n's Input panel: each leaf field is a
// pill that inserts {{contextKey.path}} when clicked or dragged.
function InputGroup({ contextKey, value, onPick, defaultOpen = true, hideHeader = false }: { contextKey: string; value: any; onPick: (ref: string) => void; defaultOpen?: boolean; hideHeader?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const entries = (value && typeof value === 'object' && !Array.isArray(value)) ? Object.entries(value) : []
  const count = entries.length
  // When the source is already shown by the select, drop the redundant header
  // and render the fields flush.
  if (hideHeader) {
    return (
      <div className="space-y-1">
        {entries.length === 0 && <div className="text-[9px] text-gray-600 px-1.5 py-1">(sem campos)</div>}
        {entries.map(([k, v]) => (
          <InputLeaf key={k} path={k} value={v} contextKey={contextKey} onPick={onPick} />
        ))}
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-white/[0.03] transition-colors">
        <LuChevronRight size={11} className={`text-gray-600 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="text-[11px] font-mono font-semibold text-purple-300 truncate">{contextKey}</span>
        <span className="ml-auto text-[9px] text-gray-600">{count} {count === 1 ? 'campo' : 'campos'}</span>
      </button>
      {open && (
        <div className="px-1.5 pb-1.5 space-y-1">
          {entries.length === 0 && <div className="text-[9px] text-gray-600 px-1.5 py-1">(sem campos)</div>}
          {entries.map(([k, v]) => (
            <InputLeaf key={k} path={k} value={v} contextKey={contextKey} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  )
}

// One field row. Nested objects expand into dotted paths (health → health.current).
function InputLeaf({ path, value, contextKey, onPick, depth = 0 }: { path: string; value: any; contextKey: string; onPick: (ref: string) => void; depth?: number }) {
  const [open, setOpen] = useState(false)
  const isObj = value && typeof value === 'object' && !Array.isArray(value)
  const ref = `{{${contextKey}.${path}}}`
  const preview = isObj ? `{${Object.keys(value).length}}`
    : Array.isArray(value) ? `[${value.length}]`
    : typeof value === 'string' ? value
    : JSON.stringify(value)
  return (
    <div style={{ marginLeft: depth * 10 }}>
      <div
        className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-blue-500/10 cursor-pointer transition-colors"
        draggable
        onDragStart={e => { e.dataTransfer.setData('application/dstp-expression', ref); e.dataTransfer.setData('text/plain', ref); e.dataTransfer.effectAllowed = 'copy' }}
        onClick={() => { if (isObj) setOpen(o => !o); else onPick(ref) }}
        title={isObj ? 'Abrir' : `Inserir ${ref}`}
      >
        {isObj
          ? <LuChevronRight size={10} className={`text-gray-600 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          : <span className="w-2.5 h-2.5 shrink-0 grid place-items-center"><span className="w-1 h-1 rounded-full bg-gray-700" /></span>}
        <span className="text-[10px] font-mono text-gray-200">{path}</span>
        <span className="text-[9px] text-gray-500 font-mono truncate flex-1">{preview}</span>
        {!isObj && <span className="text-[8px] text-blue-400/0 group-hover:text-blue-400/80 font-mono shrink-0">+ inserir</span>}
      </div>
      {isObj && open && (
        <div className="space-y-0.5 mt-0.5">
          {Object.entries(value).map(([k, v]) => (
            <InputLeaf key={k} path={`${path}.${k}`} value={v} contextKey={contextKey} onPick={onPick} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
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
        <LuArrowRight size={9} className="shrink-0" />
        <code className="select-all">{ref}</code>
      </div>
    </div>
  )
}
