// AI agent node — runs an agentic loop (Vercel AI SDK) where the TOOLS are other
// flow nodes connected to this node's `tools` input handle. The model picks a
// tool, fills its params, and the engine executes that node for real (same
// runFlowAction → pushCommand → game pipeline). Loops until the model answers or
// the step cap is hit.
//
// Provider + model + api_key are configured per-node. The api_key is resolved
// from the vault ({{environment.X.KEY}}) at execution time and only ever feeds the
// provider client — never the prompt/system text sent to the model.

import { generateText, stepCountIs, dynamicTool, jsonSchema, type ToolSet } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { FlowNode, FlowEdge } from '../../db'
import { maskSecrets } from '../vault-mask'

// Params whose value should be a number in the generated tool schema (mirrors
// the engine's NUMERIC_PARAM_KEYS so the model sends the right JSON type).
const NUMERIC_KEYS = new Set([
  'amount', 'count', 'x', 'y', 'z', 'radius', 'limit', 'duration', 'days', 'speed',
  'length', 'day', 'dusk', 'night', 'slot', 'width', 'height', 'value', 'max',
  'offset_x', 'offset_z',
])
const BOOLEAN_KEYS = new Set(['enabled', 'drop', 'visible'])

const DEFAULT_MAX_STEPS = 8
const MAX_STEPS_CAP = 25

export interface AIAgentDeps {
  // Resolve a {{...}} template against the flow context (engine's resolveValue).
  resolve: (template: any, context: Record<string, any>) => any
  // Execute one tool node for real, with the params the model chose. Returns a
  // small JSON-serializable result handed back to the model.
  runTool: (toolNode: FlowNode, args: Record<string, any>, context: Record<string, any>) => Promise<any> | any
}

// Build the language model for the configured provider, using the resolved key.
function buildModel(provider: string, model: string, apiKey: string) {
  switch (provider) {
    case 'anthropic': return createAnthropic({ apiKey })(model)
    case 'openai': return createOpenAI({ apiKey })(model)
    case 'google': return createGoogleGenerativeAI({ apiKey })(model)
    default: throw new Error(`unknown AI provider: ${provider}`)
  }
}

// Sanitize a node into a valid tool name: [a-zA-Z0-9_], non-empty.
export function toolNameFor(node: FlowNode, used: Set<string>): string {
  let base = String(node.data?.alias || node.data?.action_type || node.type || 'tool')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '') || 'tool'
  let name = base
  let i = 2
  while (used.has(name)) name = `${base}_${i++}`
  used.add(name)
  return name
}

// Generate a JSON Schema (object) from a node's params. Each param key becomes a
// property; type inferred from the numeric/boolean key sets, else string.
export function schemaForNode(node: FlowNode): Record<string, any> {
  const params = (node.data?.params || {}) as Record<string, any>
  const properties: Record<string, any> = {}
  for (const key of Object.keys(params)) {
    const t = NUMERIC_KEYS.has(key) ? 'number' : BOOLEAN_KEYS.has(key) ? 'boolean' : 'string'
    properties[key] = { type: t, description: `Parameter "${key}"` }
  }
  return { type: 'object', properties, additionalProperties: false, required: [] }
}

// Discover the nodes wired into the ai_agent's `tools` input handle.
export function discoverToolNodes(aiNode: FlowNode, nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const sourceIds = edges
    .filter(e => e.target === aiNode.id && e.targetHandle === 'tools')
    .map(e => e.source)
  const seen = new Set<string>()
  const tools: FlowNode[] = []
  for (const id of sourceIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const n = nodes.find(x => x.id === id)
    // Never let the agent call itself.
    if (n && n.id !== aiNode.id && n.type !== 'ai_agent') tools.push(n)
  }
  return tools
}

export async function executeAIAgent(
  aiNode: FlowNode,
  nodes: FlowNode[],
  edges: FlowEdge[],
  context: Record<string, any>,
  deps: AIAgentDeps,
): Promise<any> {
  const data = aiNode.data || {}
  const provider = String(data.provider || 'anthropic')
  const model = String(data.model || '')
  const apiKey = String(deps.resolve(data.api_key, context) ?? '')
  const system = data.system ? String(deps.resolve(data.system, context)) : undefined
  const prompt = String(deps.resolve(data.prompt, context) ?? '')
  let maxSteps = Number(deps.resolve(data.max_steps, context))
  if (!Number.isFinite(maxSteps) || maxSteps < 1) maxSteps = DEFAULT_MAX_STEPS
  maxSteps = Math.min(maxSteps, MAX_STEPS_CAP)
  const temperature = data.temperature != null && data.temperature !== ''
    ? Number(deps.resolve(data.temperature, context)) : undefined

  if (!model) throw new Error('ai_agent: no model configured')
  if (!apiKey) throw new Error('ai_agent: no API key (set api_key, e.g. {{environment.prod.ANTHROPIC_KEY}})')
  if (!prompt) throw new Error('ai_agent: no prompt configured')

  // Build one dynamic tool per connected node.
  const toolNodes = discoverToolNodes(aiNode, nodes, edges)
  const used = new Set<string>()
  const toolCalls: Array<{ tool: string; args: any }> = []
  const tools: ToolSet = {}
  for (const node of toolNodes) {
    const name = toolNameFor(node, used)
    const label = node.data?.action_type || node.type
    tools[name] = dynamicTool({
      description: `Flow node "${label}". Call to run it with the given params.`,
      inputSchema: jsonSchema(schemaForNode(node) as any),
      execute: async (args: any) => {
        const safeArgs = (args && typeof args === 'object') ? args : {}
        toolCalls.push({ tool: name, args: safeArgs })
        const result = await deps.runTool(node, safeArgs, context)
        return result ?? { ok: true }
      },
    })
  }

  const llm = buildModel(provider, model, apiKey)
  const result = await generateText({
    model: llm,
    system,
    prompt,
    tools,
    stopWhen: stepCountIs(maxSteps),
    ...(temperature != null && Number.isFinite(temperature) ? { temperature } : {}),
  })

  // Output. Mask any secret that may have leaked into the model's text.
  return {
    text: maskSecrets(String(result.text ?? ''), context),
    steps: result.steps?.length ?? 0,
    toolCalls: maskSecrets(toolCalls, context),
    usage: result.usage ?? null,
  }
}
