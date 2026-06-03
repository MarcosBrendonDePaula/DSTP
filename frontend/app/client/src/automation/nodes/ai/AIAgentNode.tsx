import { useCallback } from 'react'
import { useReactFlow, useStore, Handle, Position } from '@xyflow/react'
import { BaseNode, NodeField, NodeSelect, NodeInput } from '../BaseNode'

// Models offered per provider (a sensible default list; the field is free-text
// too, so any model id works).
const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI (GPT)' },
  { value: 'google', label: 'Google (Gemini)' },
]

const MODELS: Record<string, string[]> = {
  anthropic: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  google: ['gemini-2.0-flash', 'gemini-2.0-pro'],
}

// AI agent node. A dedicated `tools` input handle (left): nodes connected there
// become the agent's callable tools (the model fills their params and the engine
// runs them for real). The normal top handle is the flow entry; bottom is the
// flow continuation after the agent finishes.
export function AIAgentNode({ id, data, selected }: any) {
  const { updateNodeData } = useReactFlow()
  const set = useCallback((patch: Record<string, any>) => updateNodeData(id, { ...data, ...patch }), [id, data, updateNodeData])

  const provider = data.provider || 'anthropic'

  // Count nodes wired into this node's `tools` handle, for a hint in the UI.
  const toolCount = useStore((s) =>
    s.edges.filter((e: any) => e.target === id && e.targetHandle === 'tools').length
  )

  return (
    <div className="relative">
      <BaseNode
        type="ai_agent"
        icon="🤖"
        label="AI Agent"
        selected={selected}
        executionStatus={data._executionStatus}
        executionOutput={data._executionOutput}
        executionError={data._executionError}
        hasCaptureData={data._hasCaptureData}
        alias={data.alias}
        onAliasChange={(v: string) => set({ alias: v })}
      >
        <NodeField label="Provider">
          <NodeSelect value={provider} onChange={(v) => set({ provider: v, model: (MODELS[v] || [])[0] || '' })} options={PROVIDERS} />
        </NodeField>
        <NodeField label="Modelo">
          <NodeSelect
            value={data.model || ''}
            onChange={(v) => set({ model: v })}
            options={(MODELS[provider] || []).map((m) => ({ value: m, label: m }))}
          />
        </NodeField>
        <NodeField label="API Key">
          <NodeInput value={data.api_key || ''} onChange={(v) => set({ api_key: v })} placeholder="{{environment.prod.ANTHROPIC_KEY}}" />
        </NodeField>
        <NodeField label="System (opcional)">
          <NodeInput value={data.system || ''} onChange={(v) => set({ system: v })} placeholder="Você é um assistente do servidor DST..." />
        </NodeField>
        <NodeField label="Prompt">
          <NodeInput value={data.prompt || ''} onChange={(v) => set({ prompt: v })} placeholder="{{trigger.message}}" />
        </NodeField>
        <NodeField label="Max steps">
          <NodeInput value={data.max_steps || ''} onChange={(v) => set({ max_steps: v })} placeholder="8" />
        </NodeField>
        <div className="text-[8px] text-gray-500 mt-1">
          🔧 Conecte nós no handle <span className="text-purple-400">tools</span> (esquerda) — a IA os chama como ferramentas.
        </div>
      </BaseNode>

      {/* Tools input handle (left) — connect action/get_player/etc nodes here.
          Rendered AFTER BaseNode so the flow input (BaseNode's top handle) is the
          first target in the DOM — otherwise an edge with no targetHandle would
          bind to this `tools` handle instead of the flow input. */}
      <Handle
        type="target"
        position={Position.Left}
        id="tools"
        className="!w-3 !h-3 !border-2"
        style={{ background: '#2a2a2a', borderColor: '#a855f7', top: 32 }}
      />
      <div className="absolute -left-1 top-9 text-[8px] text-purple-400 -translate-x-full pr-1 whitespace-nowrap pointer-events-none">
        tools{toolCount ? ` (${toolCount})` : ''}
      </div>
    </div>
  )
}
