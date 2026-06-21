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
import { buildModel } from './buildModel'
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

// Short, human descriptions of the common actions so the model knows what each
// tool DOES (the rich client catalog isn't available on the backend). Falls back
// to the action_type name for anything not listed.
const ACTION_DESCRIPTIONS: Record<string, string> = {
  announce: 'Broadcast a global announcement to everyone on the server.',
  private_message: 'Whisper a private message to one player (needs userid).',
  chat_send: 'Send a message into the public chat as the bot.',
  heal: 'Restore a player\'s health (needs userid; amount optional, "max" for full).',
  feed: 'Restore a player\'s hunger (needs userid).',
  restore_sanity: 'Restore a player\'s sanity (needs userid).',
  respawn: 'Revive a player from ghost/dead state (needs userid).',
  kill: 'Instantly kill a player (needs userid).',
  kick: 'Disconnect a player from the server (needs userid).',
  ban: 'Ban a player (needs userid).',
  godmode: 'Toggle invincibility for a player (needs userid).',
  teleport: 'Teleport a player to coordinates x,z (needs userid, x, z).',
  teleport_to_player: 'Teleport one player to another.',
  give_item: 'Give an item (prefab) to a player (needs userid, prefab, count).',
  spawn_prefab: 'Spawn an entity at coordinates (prefab, x, z). prefab is the exact DST prefab id. Bosses: deerclops, bearger, moose (Moose/Goose), dragonfly, antlion, beequeen, klaus, toadstool, minotaur (Ancient Guardian), crabking, malbatross. Common mobs: hound, spider, pigman, merm, rabbit, beefalo.',
  spawn_at_player: 'Spawn an entity at a player\'s position (needs userid, prefab). Same prefab ids as spawn_prefab — use this when you have a userid and want it next to that player.',
  set_season: 'Change the world season (autumn/winter/spring/summer).',
  set_phase: 'Change the time of day (day/dusk/night).',
  skip_day: 'Advance the world by N days.',
}

// Tool schema for the ai_memory node (the AI's own key/value store).
const AI_MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    operation: { type: 'string', enum: ['save', 'get', 'list', 'delete'], description: 'What to do' },
    key: { type: 'string', description: 'Free-form key, e.g. "player:joe:house" or "server:pvp". For list, an optional prefix.' },
    value: { type: 'string', description: 'Value to store (only for save)' },
  },
  required: ['operation'],
  additionalProperties: false,
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

// Scope key for conversation history: per-player (keyed by userid/name) or one
// shared "global" history per flow.
export function computeScopeKey(scope: string, context: Record<string, any>): string {
  if (scope === 'global') return 'global'
  return `player:${context?.trigger?.userid ?? context?.trigger?.name ?? 'unknown'}`
}

export type MemoryMode = 'rotate' | 'compact'

function normLimit(limit: number): number {
  return Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 10
}

// ROTATE mode: keep only the last `limit` turn-pairs (oldest fall off, FIFO).
export function trimHistory(turns: ChatTurn[], limit: number): ChatTurn[] {
  return turns.slice(-(normLimit(limit) * 2))
}

// COMPACT mode: when the history exceeds `limit` pairs, summarize the OLDEST
// overflow into a single "assistant" summary turn and keep the recent pairs
// verbatim. `summarize` produces the summary text from the dropped turns. Async
// because summarizing calls the model. Falls back to rotate if no summarizer.
export async function compactHistory(
  turns: ChatTurn[],
  limit: number,
  summarize?: (toSummarize: ChatTurn[], priorSummary: string | null) => Promise<string>,
): Promise<ChatTurn[]> {
  const n = normLimit(limit)
  const maxMsgs = n * 2
  if (turns.length <= maxMsgs) return turns
  if (!summarize) return turns.slice(-maxMsgs) // no summarizer → behave like rotate

  // Carry forward an existing summary (first turn tagged) so context compounds.
  const SUMMARY_TAG = '[resumo da conversa anterior]'
  const hasPriorSummary = turns[0]?.role === 'assistant' && turns[0].content.startsWith(SUMMARY_TAG)
  const priorSummary = hasPriorSummary ? turns[0].content.slice(SUMMARY_TAG.length).trim() : null
  const body = hasPriorSummary ? turns.slice(1) : turns

  const keep = body.slice(-maxMsgs)        // recent pairs kept verbatim
  const drop = body.slice(0, body.length - maxMsgs) // older turns → summarized
  if (drop.length === 0) return turns.slice(-maxMsgs)

  const summaryText = await summarize(drop, priorSummary)
  return [{ role: 'assistant', content: `${SUMMARY_TAG} ${summaryText}` }, ...keep]
}

export interface AIAgentDeps {
  // Resolve a {{...}} template against the flow context (engine's resolveValue).
  resolve: (template: any, context: Record<string, any>) => any
  // Execute one tool node for real, with the params the model chose. Returns a
  // small JSON-serializable result handed back to the model.
  runTool: (toolNode: FlowNode, args: Record<string, any>, context: Record<string, any>) => Promise<any> | any
  // Conversation history (optional). Keyed by the agent's scope. Returns the
  // stored turns; saveHistory persists the (trimmed) list.
  loadHistory?: (scopeKey: string) => ChatTurn[]
  saveHistory?: (scopeKey: string, turns: ChatTurn[]) => void
}

// buildModel moved to ./buildModel (shared with the AI flow generator).

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

// Generate a JSON Schema (object) from a node's params. Only EMPTY params become
// inputs the model fills. A param the author already set is FIXED and must NOT be
// overridable by the model — this includes a `{{...}}` TEMPLATE: writing
// `x = {{trigger.x}}` means "the engine resolves this from context", not "model,
// invent a value". (Previously templates were exposed as fillable inputs, which made
// the model guess coordinates/ids it can't know — e.g. spawn at 0,0 in the ocean.)
// If the author wants the model to choose a value, they leave the param blank.
// Default hints for common param keys, so the model fills them with valid values
// instead of guessing (it would otherwise see only "Parameter \"prefab\"" and default
// to one it happened to learn). A node can override any of these via
// meta.aiParamDescriptions. Kept here because the backend has no rich client catalog.
const PARAM_HINTS: Record<string, string> = {
  prefab: 'The exact DST prefab id to spawn. Bosses: deerclops, bearger, moose, dragonfly, antlion, beequeen, klaus, toadstool, minotaur, crabking, malbatross, eyeofterror. Mobs: hound, spider, pigman, merm, killerbee, tentacle, rabbit, beefalo, koalefant_summer. Pick one that fits the situation — vary it, don\'t always pick the same one.',
  userid: 'The player\'s userid (e.g. from {{trigger.userid}}). Required to target a specific player.',
  message: 'The text to say. Plain text, no emojis (DST renders them as "?").',
  amount: 'A number, or "max" for full where supported.',
}

export function schemaForNode(node: FlowNode): Record<string, any> {
  const params = (node.data?.params || {}) as Record<string, any>
  const overrides = (node.data?.aiParamDescriptions || {}) as Record<string, string>
  const properties: Record<string, any> = {}
  const required: string[] = []
  for (const key of Object.keys(params)) {
    const raw = params[key]
    const isEmpty = raw == null || raw === ''
    if (!isEmpty) continue // set by the author (literal or {{template}}) → not a model input
    const t = NUMERIC_KEYS.has(key) ? 'number' : BOOLEAN_KEYS.has(key) ? 'boolean' : 'string'
    const description = overrides[key] || PARAM_HINTS[key] || `Parameter "${key}"`
    properties[key] = { type: t, description }
    required.push(key)
  }
  return { type: 'object', properties, additionalProperties: false, required }
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

  // Conversation memory (optional). Scope: per-player (keyed by trigger.userid)
  // or global (one history per flow). memory_limit = max turns kept.
  const memoryEnabled = !!data.memory_enabled && !!deps.loadHistory && !!deps.saveHistory
  const memoryScope = String(data.memory_scope || 'player')
  const memoryLimit = Number(deps.resolve(data.memory_limit, context))
  const memoryMode: MemoryMode = data.memory_mode === 'compact' ? 'compact' : 'rotate'
  const scopeKey = computeScopeKey(memoryScope, context)

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
    const isMem = node.type === 'ai_memory'
    const actionType = node.data?.action_type || node.type
    const description = isMem
      ? 'Persistent memory. Save/get/list/delete facts using a FREE-FORM key — YOU choose the scope by how you name the key: per-player facts as "player:<name>:<fact>", server-wide facts as "server:<fact>". operation: save|get|list|delete. For save, include value. For list, key is an optional prefix filter.'
      : (ACTION_DESCRIPTIONS[actionType] || `Run the "${actionType}" action. Fill the listed parameters.`)
    tools[name] = dynamicTool({
      description,
      inputSchema: jsonSchema((isMem ? AI_MEMORY_SCHEMA : schemaForNode(node)) as any),
      execute: async (args: any) => {
        const safeArgs = (args && typeof args === 'object') ? args : {}
        toolCalls.push({ tool: name, args: safeArgs })
        const result = await deps.runTool(node, safeArgs, context)
        return result ?? { ok: true }
      },
    })
  }

  // Load prior turns and build the message list (history + current prompt). With
  // memory off, fall back to a single-shot prompt.
  const history: ChatTurn[] = memoryEnabled ? (deps.loadHistory!(scopeKey) || []) : []
  const llm = buildModel(provider, model, apiKey)
  // Abort the agentic loop (mid-LLM-call / between steps) when the flow is deleted or
  // disabled — context._signal is the flow run's AbortSignal. Without this, a long
  // multi-step ai_agent keeps calling the API after you turned the flow off.
  const signal: AbortSignal | undefined = context?._signal
  if (signal?.aborted) return { aborted: true, text: '' }
  const result = await generateText({
    model: llm,
    system,
    ...(history.length > 0
      ? { messages: [...history, { role: 'user' as const, content: prompt }] }
      : { prompt }),
    tools,
    stopWhen: stepCountIs(maxSteps),
    ...(temperature != null && Number.isFinite(temperature) ? { temperature } : {}),
    ...(signal ? { abortSignal: signal } : {}),
  })

  const text = String(result.text ?? '')

  // Persist the turn. ROTATE drops the oldest pairs; COMPACT summarizes the
  // overflow into a single summary turn (preserving context) and keeps recents.
  if (memoryEnabled) {
    const next: ChatTurn[] = [...history, { role: 'user', content: prompt }, { role: 'assistant', content: text }]
    if (memoryMode === 'compact') {
      const summarize = async (toSummarize: ChatTurn[], prior: string | null): Promise<string> => {
        const convo = toSummarize.map(t => `${t.role === 'user' ? 'Jogador' : 'IA'}: ${t.content}`).join('\n')
        const sres = await generateText({
          model: llm,
          system: 'Você resume conversas de forma concisa, preservando fatos importantes (nomes, pedidos, decisões). Responda só com o resumo, sem preâmbulo.',
          prompt: `${prior ? `Resumo até agora:\n${prior}\n\n` : ''}Resuma a conversa abaixo em poucas frases, mantendo o que importa:\n${convo}`,
        })
        return String(sres.text ?? '').trim()
      }
      deps.saveHistory!(scopeKey, await compactHistory(next, memoryLimit, summarize))
    } else {
      deps.saveHistory!(scopeKey, trimHistory(next, memoryLimit))
    }
  }

  // Output. Mask any secret that may have leaked into the model's text.
  return {
    text: maskSecrets(text, context),
    steps: result.steps?.length ?? 0,
    toolCalls: maskSecrets(toolCalls, context),
    usage: result.usage ?? null,
  }
}
