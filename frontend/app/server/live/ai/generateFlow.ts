// AI flow generation + editing core. Two entry points:
//   generateFlowFromPrompt — text prompt (+ optional reference flow) → a fresh,
//     validated {nodes, edges}.
//   editFlowWithPrompt — current flow + change request → a PATCH (add/remove/update
//     nodes & edges) that is applied locally, then validated.
//
// The LLM call (generateObject) is injected as `runModel` so the pure parts —
// prompt building, schema, patch application, id/position normalization — are
// unit-tested WITHOUT a network call or API key. The LiveAutomation method wires the
// real model + vault key in.

import { jsonSchema } from 'ai'
import { buildNodeCatalog, renderCatalogForPrompt, type CatalogEntry } from '../nodes/catalogSerializer'
import { validateFlow, type ValidationResult } from '../validateFlow'
import type { FlowNode, FlowEdge } from '../../db'

export interface GenFlow {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

// ── JSON schemas the model must satisfy ────────────────────────────────────────
// NOTE: OpenAI's strict structured-output mode requires EVERY object to declare
// `additionalProperties: false` AND list all properties as required. A node's `data`
// is free-form (params vary per type), which can't be expressed as a closed object —
// so `data` is carried as a JSON STRING the model writes and we parse in coerceFlow.
// This keeps the whole schema strictly closed (OpenAI-compatible) while still letting
// the model emit arbitrary node config.
const NODE_SCHEMA = {
  type: 'object',
  required: ['id', 'type', 'data'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'Unique node id, e.g. "n1".' },
    type: { type: 'string', description: 'A node type from the catalog.' },
    data: { type: 'string', description: 'Node config as a JSON OBJECT STRING, e.g. "{\\"event_type\\":\\"player_spawn\\"}" or "{\\"field\\":\\"x\\",\\"operator\\":\\"equals\\",\\"value\\":\\"1\\"}". Use "{}" when there is no config.' },
  },
}
const EDGE_SCHEMA = {
  type: 'object',
  required: ['id', 'source', 'target', 'sourceHandle'],
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    source: { type: 'string', description: 'Source node id.' },
    target: { type: 'string', description: 'Target node id.' },
    sourceHandle: { type: 'string', description: 'Branch handle for condition/switch/foreach/loop/try_catch. Use "" (empty string) for sequential nodes.' },
  },
}
export const FLOW_SCHEMA = jsonSchema({
  type: 'object',
  required: ['name', 'nodes', 'edges'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'A short, descriptive flow name in Portuguese (e.g. "Loja de itens", "Boas-vindas").' },
    nodes: { type: 'array', items: NODE_SCHEMA },
    edges: { type: 'array', items: EDGE_SCHEMA },
  },
} as any)

// Patch op the model returns for an EDIT. Removes are by id; adds/updates carry the
// node/edge. update merges into existing data. All fields required + closed for
// OpenAI strict mode; empty arrays mean "no change of that kind".
export const PATCH_SCHEMA = jsonSchema({
  type: 'object',
  required: ['addNodes', 'removeNodeIds', 'updateNodes', 'addEdges', 'removeEdgeIds'],
  additionalProperties: false,
  properties: {
    addNodes: { type: 'array', items: NODE_SCHEMA },
    removeNodeIds: { type: 'array', items: { type: 'string' } },
    updateNodes: { type: 'array', items: NODE_SCHEMA },
    addEdges: { type: 'array', items: EDGE_SCHEMA },
    removeEdgeIds: { type: 'array', items: { type: 'string' } },
  },
} as any)

export interface FlowPatch {
  addNodes?: FlowNode[]
  removeNodeIds?: string[]
  updateNodes?: Array<{ id: string; type?: string; data?: Record<string, any> }>
  addEdges?: FlowEdge[]
  removeEdgeIds?: string[]
}

// ── global knowledge blocks (paid once per prompt, not per node) ──────────────

// The full trigger event_type list, grouped by category. The trigger node is hidden
// from the catalog, so this is where the model learns valid data.event_type values.
const EVENT_CATEGORIES = `EVENT CATEGORIES (valid trigger data.event_type values):
players: player_spawn, player_left, player_death, player_ghost, player_respawn, player_disconnected, player_new_character, player_resurrected, player_migrated
chat: chat_message, command
combat: player_kill, player_attacked, player_attack_other, player_hit_other, player_block, player_attack_miss, player_min_health, player_combat_target
crafting: player_craft, player_build, recipe_unlocked, structure_built
inventory: player_equip, player_unequip, player_pickup, player_drop, player_item_get, inventory_full, trade_received
health: health_delta, hunger_delta, sanity_delta
gathering: player_work, resource_gathered, player_harvest, player_startfire, player_pick
survival: player_eat, player_insane, player_sane, player_starving, player_fed, player_freezing, player_warm, player_mounted, player_dismounted, player_on_fire, player_wet
world: new_day, phase_changed, season_changed, moon_phase_changed, earthquake, rift_spawned, nightmare_phase, item_planted
weather: storm_changed, precipitation, lightning_strike
bosses: boss_event, boss_killed, toadstool_state_changed
griefing: structure_burnt, structure_hammered, container_opened, container_closed, structure_worked, object_ignited
creatures: beefalo_tamed, mob_transform, mob_frozen, mount_rider_changed
input: key_pressed, key_combo
For a chat command use event_type:"command" (auto-parses {{cmd.command_name}}, {{cmd.args}}, {{cmd.rest}}); optionally data.command:"tp" to match one command.`

// The recursive ui_builder tree grammar — a flat param list can't express it.
const UI_TREE_GRAMMAR = `UI TREE GRAMMAR (ui_builder node → data.tree; data.params = {userid, id, anchor}):
A tree node = { type, id?, callback?, ...props, children?[] }.
  types: panel | col | row | tabs | text | text_input | icon | image | button | bar | spacer
  containers (hold children[]): panel, col, row.  tabs holds tabs:[{label, child}].
LAYOUT (how to POSITION — by NESTING, not x/y):
  col  = stacks children VERTICALLY (a list). props: gap, width?, height?
  row  = lays children side-by-side HORIZONTALLY. props: gap, width?, height?
  grid = col/row with mode:"grid" + cols:N → uniform N-column grid. Or grid_rows:["50 50","25 25 25 25"] for proportional columns per row ("@120" = fixed row height px).
  A "list of rules" = a col (gap) of rows, each row = [text label, button]. A 2-col tile grid = col with mode:"grid", cols:2.
PROPS by type:
  panel { title, body?, width, height?, gap?, draggable?, closeable? }
  text  { text, size, color:[r,g,b,a] floats 0..1 }
  button { text, callback, width, height, color? }   // callback REQUIRED to be clickable
  text_input { callback, placeholder, value?, width, height }
  icon { prefab, size }   image { atlas, tex, width, height }   bar { value, max, label?, color? }   spacer { width?, height? }
  anchor (params.anchor): center | top | topleft | topright | left | right | bottom | bottomleft | bottomright
  A node with callback:"name" → the ui_builder node exposes an output handle "cb:name" to wire the click reaction. Give a node an id to patch it later.`

// Four minimal, real flows — one per archetype. The model imitates the STRUCTURE.
const FEW_SHOT_EXAMPLES = `EXAMPLE FLOWS (imitate the structure, not the content):

1) simple fan-out (no branch):
{"nodes":[{"id":"n1","type":"trigger","data":{"event_type":"inventory_full","alias":"ev"}},{"id":"n2","type":"private_message","data":{"action_type":"private_message","params":{"userid":"{{ev.userid}}","message":"Inventory full!"}}},{"id":"n3","type":"ui_notification","data":{"params":{"userid":"{{ev.userid}}","text":"Inventory full"}}}],"edges":[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n1","target":"n3"}]}

2) condition branch (sourceHandle "true"; 'exists' has empty value):
{"nodes":[{"id":"n1","type":"trigger","data":{"event_type":"boss_killed","alias":"boss"}},{"id":"n2","type":"find_player","data":{"params":{"name":"{{boss.cause}}"},"alias":"killer"}},{"id":"n3","type":"condition","data":{"field":"{{killer.userid}}","operator":"exists","value":""}},{"id":"n4","type":"give_item","data":{"action_type":"give_item","params":{"userid":"{{killer.userid}}","prefab":"purpleamulet","count":"1"}}}],"edges":[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"},{"id":"e3","source":"n3","target":"n4","sourceHandle":"true"}]}

3) chat command → roll a die → announce:
{"nodes":[{"id":"n1","type":"trigger","data":{"event_type":"command","alias":"cmd"}},{"id":"n2","type":"condition","data":{"field":"{{cmd.message}}","operator":"starts_with","value":"!dado"}},{"id":"n3","type":"random","data":{"params":{"min":"1","max":"6"},"alias":"d"}},{"id":"n4","type":"announce","data":{"action_type":"announce","params":{"message":"{{cmd.name}} rolou {{d.value}}!"}}}],"edges":[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3","sourceHandle":"true"},{"id":"e3","source":"n3","target":"n4"}]}

4) ui_builder panel with a list (col of rows) + a callback button:
{"nodes":[{"id":"n1","type":"trigger","data":{"event_type":"player_spawn","alias":"j"}},{"id":"n2","type":"ui_builder","data":{"params":{"userid":"{{j.userid}}","id":"rules","anchor":"center"},"tree":{"type":"panel","title":"Regras","width":320,"gap":8,"children":[{"type":"row","gap":12,"children":[{"type":"text","text":"Sem griefar","size":18,"color":[1,1,1,1]},{"type":"button","text":"OK","callback":"ack1","width":60,"height":32}]},{"type":"row","gap":12,"children":[{"type":"text","text":"Sem PvP","size":18,"color":[1,1,1,1]},{"type":"button","text":"OK","callback":"ack2","width":60,"height":32}]}]}}}],"edges":[{"id":"e1","source":"n1","target":"n2"}]}`

// ── prompt building ─────────────────────────────────────────────────────────
const RULES = `RULES:
- Use ONLY node types from the catalog above.
- Every flow needs at least one trigger or webhook node (the entry point). A trigger needs data.event_type.
- Give each node a short unique id (n1, n2, ...).
- Sequential nodes connect with a plain edge (no sourceHandle).
- BRANCHING nodes MUST use their named handles for the sourceHandle:
  condition → "true"/"false"; switch → "case_0","case_1",.../"default"; foreach → "each"/"done"; loop → "body"/"done"; try_catch → "try"/"catch".
- Do NOT create cycles; use a loop/foreach node for repetition.
- Put node config in data. COPY the "example data" shape shown for each node: match its nesting (flat field vs data.params) and use the EXACT enum values listed (operator, event_type, etc) — never invent values.
- A ui_builder node MUST set data.tree to a non-empty panel with children (never data:{}). Build the layout by NESTING: a col of rows for a list, mode:"grid"+cols:N for a grid. Each clickable item is a button with a callback; wire each callback from the ui_builder node via a "cb:<callback>" edge.
- Positions are optional; they will be auto-laid out.`

// Does this catalog/flow involve a ui_builder, so the UI grammar block is worth its tokens?
function usesUI(catalog: CatalogEntry[]): boolean {
  return catalog.some((n) => n.type === 'ui_builder' || n.type.startsWith('ui_'))
}
function flowUsesUI(flow: GenFlow): boolean {
  return flow.nodes.some((n) => String(n.type).startsWith('ui_'))
}

export function buildGenerateMessages(prompt: string, referenceFlow?: GenFlow): { system: string; user: string } {
  const catalog = buildNodeCatalog()
  let system = `You are an expert designer of DSTP automation flows. Output a flow as {nodes, edges}.

NODE CATALOG:
${renderCatalogForPrompt(catalog)}

${EVENT_CATEGORIES}`
  if (usesUI(catalog)) system += `\n\n${UI_TREE_GRAMMAR}`
  system += `\n\n${FEW_SHOT_EXAMPLES}\n\n${RULES}`
  if (referenceFlow && referenceFlow.nodes.length) {
    system += `\n\nREFERENCE FLOW (an existing flow to use as a structural example — do not copy verbatim):\n${JSON.stringify(referenceFlow)}`
  }
  return { system, user: prompt }
}

export function buildEditMessages(prompt: string, currentFlow: GenFlow): { system: string; user: string } {
  const catalog = buildNodeCatalog()
  // On edits the current flow already shows local conventions, so skip the few-shot
  // block; keep the catalog (enums/examples) + event list, and the UI grammar only if
  // the flow already has UI.
  let system = `You are editing an existing DSTP automation flow. Return a PATCH (addNodes/removeNodeIds/updateNodes/addEdges/removeEdgeIds) that applies the user's requested change. Touch as little as possible — only what the change requires.

NODE CATALOG:
${renderCatalogForPrompt(catalog)}

${EVENT_CATEGORIES}`
  if (flowUsesUI(currentFlow)) system += `\n\n${UI_TREE_GRAMMAR}`
  system += `\n\n${RULES}\n\nCURRENT FLOW:\n${JSON.stringify(currentFlow)}`
  return { system, user: prompt }
}

// ── patch application (pure) ──────────────────────────────────────────────────
export function applyPatch(flow: GenFlow, patch: FlowPatch): GenFlow {
  const removeN = new Set(patch.removeNodeIds ?? [])
  const removeE = new Set(patch.removeEdgeIds ?? [])
  const updates = new Map((patch.updateNodes ?? []).map((u) => [u.id, u]))

  let nodes = flow.nodes
    .filter((n) => !removeN.has(n.id))
    .map((n) => {
      const u = updates.get(n.id)
      if (!u) return n
      return { ...n, type: u.type ?? n.type, data: { ...(n.data as any), ...(u.data ?? {}) } } as FlowNode
    })
  // adds (skip ids that already exist to avoid dupes)
  const haveN = new Set(nodes.map((n) => n.id))
  for (const a of patch.addNodes ?? []) if (!haveN.has(a.id)) { nodes.push(a); haveN.add(a.id) }

  // edges: drop removed AND any edge touching a removed node, then add.
  let edges = flow.edges.filter((e) => !removeE.has(e.id) && !removeN.has(e.source) && !removeN.has(e.target))
  const haveE = new Set(edges.map((e) => e.id))
  for (const a of patch.addEdges ?? []) if (!haveE.has(a.id)) { edges.push(a); haveE.add(a.id) }

  return { nodes, edges }
}

// ── id + position normalization (pure) ────────────────────────────────────────
// The model may emit missing/duplicate positions. Lay nodes out by BFS depth from
// triggers (column = depth, row = order within depth) so the result is readable
// without importing the client's React-Flow autoLayout.
export function normalizeLayout(flow: GenFlow): GenFlow {
  const COL = 280, ROW = 130
  const adj = new Map<string, string[]>()
  for (const e of flow.edges) (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target)

  const depth = new Map<string, number>()
  const roots = flow.nodes.filter((n) => n.type === 'trigger' || n.type === 'webhook').map((n) => n.id)
  const queue: Array<[string, number]> = (roots.length ? roots : flow.nodes.slice(0, 1).map((n) => n.id)).map((id) => [id, 0])
  while (queue.length) {
    const [id, d] = queue.shift()!
    if (depth.has(id) && depth.get(id)! <= d) continue
    depth.set(id, d)
    for (const nxt of adj.get(id) ?? []) queue.push([nxt, d + 1])
  }
  let maxD = 0
  for (const d of depth.values()) maxD = Math.max(maxD, d)
  // unreached nodes go in a trailing column
  const rowByCol = new Map<number, number>()
  const nodes = flow.nodes.map((n) => {
    const d = depth.get(n.id) ?? maxD + 1
    const row = rowByCol.get(d) ?? 0
    rowByCol.set(d, row + 1)
    return { ...n, position: { x: d * COL, y: row * ROW } } as FlowNode
  })
  return { nodes, edges: flow.edges }
}

// ── full pipelines ────────────────────────────────────────────────────────────
// onPartial (optional) is called with the growing partial object as the model streams,
// so the caller can push live progress to the UI.
export type RunModel = (args: { system: string; user: string; schema: any; onPartial?: (partial: any) => void }) => Promise<any>

export interface GenResult {
  ok: boolean
  flow?: GenFlow
  name?: string
  validation: ValidationResult
  error?: string
}

// The model emits node.data as a JSON STRING (OpenAI strict-mode constraint). Parse
// it back to an object; tolerate an already-object (other providers) or bad JSON.
function parseNode(n: any): FlowNode {
  let data: any = n?.data
  if (typeof data === 'string') {
    try { data = JSON.parse(data || '{}') } catch { data = {} }
  } else if (data == null || typeof data !== 'object') {
    data = {}
  }
  return { id: String(n?.id ?? ''), type: String(n?.type ?? ''), data, position: n?.position ?? { x: 0, y: 0 } } as FlowNode
}

// sourceHandle "" (strict-mode placeholder for "no handle") → undefined.
function parseEdge(e: any): FlowEdge {
  const sh = e?.sourceHandle
  return {
    id: String(e?.id ?? ''),
    source: String(e?.source ?? ''),
    target: String(e?.target ?? ''),
    sourceHandle: sh === '' || sh == null ? undefined : String(sh),
  } as FlowEdge
}

function coerceFlow(obj: any): GenFlow {
  const nodes = (Array.isArray(obj?.nodes) ? obj.nodes : []).map(parseNode)
  const edges = (Array.isArray(obj?.edges) ? obj.edges : []).map(parseEdge)
  return { nodes, edges }
}

function coercePatch(obj: any): FlowPatch {
  return {
    addNodes: (Array.isArray(obj?.addNodes) ? obj.addNodes : []).map(parseNode),
    removeNodeIds: Array.isArray(obj?.removeNodeIds) ? obj.removeNodeIds.map(String) : [],
    updateNodes: (Array.isArray(obj?.updateNodes) ? obj.updateNodes : []).map(parseNode),
    addEdges: (Array.isArray(obj?.addEdges) ? obj.addEdges : []).map(parseEdge),
    removeEdgeIds: Array.isArray(obj?.removeEdgeIds) ? obj.removeEdgeIds.map(String) : [],
  }
}

const MAX_REPAIR_ROUNDS = 2

export async function generateFlowFromPrompt(prompt: string, runModel: RunModel, referenceFlow?: GenFlow, onPartial?: (partial: any) => void): Promise<GenResult> {
  const { system, user } = buildGenerateMessages(prompt, referenceFlow)
  let obj = await runModel({ system, user, schema: FLOW_SCHEMA, onPartial })
  let flow = normalizeLayout(coerceFlow(obj))
  let validation = validateFlow(flow.nodes, flow.edges)

  // Repair rounds: feed the validation errors back so the model fixes them (the most
  // common is a ui_builder with an empty data.tree — gpt-4o sometimes skips it).
  for (let round = 0; round < MAX_REPAIR_ROUNDS && !validation.ok; round++) {
    const errs = validation.errors.map((e) => `- ${e.rule}: ${e.message}`).join('\n')
    const repairUser = `${user}\n\nYour previous attempt had these ERRORS — fix ALL of them and return the full corrected flow:\n${errs}\n\nReminder: a ui_builder node MUST include a non-empty data.tree (a panel with children — buttons/text nested in col/row), exactly like its "example data". Do not return an empty data for ui_builder.`
    obj = await runModel({ system, user: repairUser, schema: FLOW_SCHEMA, onPartial })
    flow = normalizeLayout(coerceFlow(obj))
    validation = validateFlow(flow.nodes, flow.edges)
  }
  // Return the flow even if still invalid — the user can fix it in the editor. The
  // caller surfaces validation.errors as warnings; never swallow the whole result.
  const name = typeof obj?.name === 'string' && obj.name.trim() ? obj.name.trim() : undefined
  return { ok: validation.ok, flow, name, validation }
}

export async function editFlowWithPrompt(prompt: string, currentFlow: GenFlow, runModel: RunModel, onPartial?: (partial: any) => void): Promise<GenResult> {
  const { system, user } = buildEditMessages(prompt, currentFlow)
  const patch = coercePatch(await runModel({ system, user, schema: PATCH_SCHEMA, onPartial }))
  const merged = normalizeLayout(applyPatch(currentFlow, patch))
  const validation = validateFlow(merged.nodes, merged.edges)
  return { ok: validation.ok, flow: merged, validation }
}
