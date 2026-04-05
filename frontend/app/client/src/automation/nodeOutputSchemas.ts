// Output schemas for each node type
// Used for autocomplete hints and type validation in the editor

export interface OutputField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'any'
  description: string
  children?: OutputField[] // for nested objects
}

export interface NodeOutputSchema {
  description: string
  fields: OutputField[]
}

// ─── Trigger outputs (by event type) ─────────────────

export const triggerOutputSchemas: Record<string, NodeOutputSchema> = {
  player_spawn: {
    description: 'Player joined the server',
    fields: [
      { name: 'userid', type: 'string', description: 'Steam/Klei user ID (KU_xxx)' },
      { name: 'name', type: 'string', description: 'Player display name' },
      { name: 'prefab', type: 'string', description: 'Character prefab (wilson, willow...)' },
    ],
  },
  player_left: {
    description: 'Player left the server',
    fields: [
      { name: 'userid', type: 'string', description: 'Steam/Klei user ID' },
      { name: 'name', type: 'string', description: 'Player display name' },
    ],
  },
  player_death: {
    description: 'Player died',
    fields: [
      { name: 'userid', type: 'string', description: 'Steam/Klei user ID' },
      { name: 'name', type: 'string', description: 'Player display name' },
      { name: 'cause', type: 'string', description: 'Death cause (darkness, charlie, mob prefab...)' },
    ],
  },
  player_ghost: {
    description: 'Player became a ghost',
    fields: [
      { name: 'userid', type: 'string', description: 'Steam/Klei user ID' },
      { name: 'name', type: 'string', description: 'Player display name' },
    ],
  },
  player_respawn: {
    description: 'Player respawned from ghost',
    fields: [
      { name: 'userid', type: 'string', description: 'Steam/Klei user ID' },
      { name: 'name', type: 'string', description: 'Player display name' },
    ],
  },
  chat_message: {
    description: 'Chat message sent',
    fields: [
      { name: 'userid', type: 'string', description: 'Sender user ID' },
      { name: 'name', type: 'string', description: 'Sender name' },
      { name: 'message', type: 'string', description: 'Message text' },
      { name: 'prefab', type: 'string', description: 'Sender character prefab' },
    ],
  },
  new_day: {
    description: 'New day started',
    fields: [
      { name: 'day', type: 'number', description: 'Current day number' },
    ],
  },
  phase_changed: {
    description: 'Day phase changed',
    fields: [
      { name: 'phase', type: 'string', description: 'New phase (day, dusk, night)' },
    ],
  },
  season_changed: {
    description: 'Season changed',
    fields: [
      { name: 'season', type: 'string', description: 'New season (autumn, winter, spring, summer)' },
    ],
  },
  player_kill: {
    description: 'Player killed an entity',
    fields: [
      { name: 'userid', type: 'string', description: 'Killer user ID' },
      { name: 'name', type: 'string', description: 'Killer name' },
      { name: 'victim', type: 'string', description: 'Victim prefab' },
    ],
  },
  player_attacked: {
    description: 'Player was attacked',
    fields: [
      { name: 'userid', type: 'string', description: 'Victim user ID' },
      { name: 'name', type: 'string', description: 'Victim name' },
      { name: 'attacker', type: 'string', description: 'Attacker prefab' },
      { name: 'damage', type: 'number', description: 'Damage dealt' },
    ],
  },
  player_craft: {
    description: 'Player crafted an item',
    fields: [
      { name: 'userid', type: 'string', description: 'Crafter user ID' },
      { name: 'name', type: 'string', description: 'Crafter name' },
      { name: 'item', type: 'string', description: 'Crafted item prefab' },
      { name: 'recipe', type: 'string', description: 'Recipe name' },
    ],
  },
  player_build: {
    description: 'Player built a structure',
    fields: [
      { name: 'userid', type: 'string', description: 'Builder user ID' },
      { name: 'name', type: 'string', description: 'Builder name' },
      { name: 'item', type: 'string', description: 'Built structure prefab' },
    ],
  },
  player_equip: {
    description: 'Player equipped an item',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'item', type: 'string', description: 'Equipped item prefab' },
      { name: 'slot', type: 'string', description: 'Equipment slot' },
    ],
  },
  player_pickup: {
    description: 'Player picked up an item',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'item', type: 'string', description: 'Item prefab' },
    ],
  },
  player_drop: {
    description: 'Player dropped an item',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'item', type: 'string', description: 'Item prefab' },
    ],
  },
  storm_changed: {
    description: 'Storm state changed',
    fields: [
      { name: 'stormtype', type: 'string', description: 'Storm type' },
      { name: 'setting', type: 'any', description: 'Storm setting value' },
    ],
  },
  precipitation: {
    description: 'Precipitation state changed',
    fields: [
      { name: 'enabled', type: 'boolean', description: 'Is it raining' },
    ],
  },
  boss_killed: {
    description: 'Boss entity was killed',
    fields: [
      { name: 'prefab', type: 'string', description: 'Boss prefab name' },
      { name: 'cause', type: 'string', description: 'Kill cause' },
    ],
  },
  player_work: {
    description: 'Player finished breaking something',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'target', type: 'string', description: 'Target prefab (evergreen, rock1, etc)' },
      { name: 'action', type: 'string', description: 'Action type (CHOP, MINE, HAMMER, DIG)' },
    ],
  },
  resource_gathered: {
    description: 'Resource dropped from destroyed entity',
    fields: [
      { name: 'userid', type: 'string', description: 'Player who caused it' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'source', type: 'string', description: 'Source entity prefab (evergreen, rock1)' },
      { name: 'action', type: 'string', description: 'Action (CHOP, MINE, HAMMER)' },
      { name: 'loot', type: 'string', description: 'Loot item prefab (log, rocks, flint)' },
      { name: 'count', type: 'number', description: 'Stack size of the drop' },
    ],
  },
  player_harvest: {
    description: 'Player harvested a plant',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'source', type: 'string', description: 'Harvested plant prefab (berrybush, farm_plant)' },
    ],
  },
  player_startfire: {
    description: 'Player started a fire',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'target', type: 'string', description: 'Target that caught fire' },
    ],
  },
  health_delta: {
    description: 'Player health changed',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'old', type: 'number', description: 'Old health percent (0-1)' },
      { name: 'new', type: 'number', description: 'New health percent (0-1)' },
      { name: 'amount', type: 'number', description: 'Change amount' },
    ],
  },
  hunger_delta: {
    description: 'Player hunger changed',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'old', type: 'number', description: 'Old hunger percent (0-1)' },
      { name: 'new', type: 'number', description: 'New hunger percent (0-1)' },
    ],
  },
  sanity_delta: {
    description: 'Player sanity changed',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'old', type: 'number', description: 'Old sanity percent (0-1)' },
      { name: 'new', type: 'number', description: 'New sanity percent (0-1)' },
    ],
  },
}

// ─── Node type outputs ───────────────────────────────

export const nodeOutputSchemas: Record<string, NodeOutputSchema> = {
  condition: {
    description: 'Condition result',
    fields: [
      { name: 'result', type: 'boolean', description: 'Condition passed (true/false)' },
      { name: 'field', type: 'string', description: 'Evaluated field name' },
      { name: 'value', type: 'any', description: 'Compared value' },
    ],
  },
  http_request: {
    description: 'HTTP response',
    fields: [
      { name: 'status', type: 'number', description: 'HTTP status code (200, 404...)' },
      { name: 'ok', type: 'boolean', description: 'Was response successful (2xx)' },
      { name: 'body', type: 'object', description: 'Response body (parsed JSON or text)' },
      { name: 'error', type: 'string', description: 'Error message if request failed' },
    ],
  },
  set_variable: {
    description: 'Custom variables',
    fields: [], // dynamic — defined by user
  },
  script: {
    description: 'Script return value',
    fields: [], // dynamic — defined by user code
  },
  action: {
    description: 'Game action result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Action was executed' },
      { name: 'action', type: 'string', description: 'Action type name' },
    ],
  },
}

// ─── Build context type string for Monaco ────────────

export function buildContextTypeDefinition(
  nodes: Array<{ id: string; type: string; data: any }>,
  edges: Array<{ source: string; target: string }>,
  currentNodeId: string,
  triggerEventType?: string
): string {
  // Find all nodes that are upstream of the current node
  const upstreamIds = new Set<string>()
  const findUpstream = (nodeId: string) => {
    for (const edge of edges) {
      if (edge.target === nodeId && !upstreamIds.has(edge.source)) {
        upstreamIds.add(edge.source)
        findUpstream(edge.source)
      }
    }
  }
  findUpstream(currentNodeId)

  let typeDef = 'interface FlowContext {\n'

  // Trigger type
  const triggerSchema = triggerEventType ? triggerOutputSchemas[triggerEventType] : null
  if (triggerSchema) {
    typeDef += '  /** ' + triggerSchema.description + ' */\n'
    typeDef += '  trigger: {\n'
    typeDef += '    _event_type: string\n'
    typeDef += '    _timestamp: number\n'
    for (const f of triggerSchema.fields) {
      typeDef += `    /** ${f.description} */\n`
      typeDef += `    ${f.name}: ${f.type === 'any' ? 'any' : f.type}\n`
    }
    typeDef += '    [key: string]: any\n'
    typeDef += '  }\n'
  } else {
    typeDef += '  trigger: Record<string, any>\n'
  }

  // Upstream node outputs
  for (const node of nodes) {
    if (!upstreamIds.has(node.id)) continue
    const schema = nodeOutputSchemas[node.type]
    if (!schema) continue

    const label = node.data?.action_type || node.type
    typeDef += `  /** ${label} — ${schema.description} */\n`
    typeDef += `  '${node.id}': {\n`
    for (const f of schema.fields) {
      typeDef += `    /** ${f.description} */\n`
      typeDef += `    ${f.name}: ${f.type === 'any' ? 'any' : f.type}\n`
    }
    typeDef += '    [key: string]: any\n'
    typeDef += '  }\n'
  }

  typeDef += '  [nodeId: string]: any\n'
  typeDef += '}\n'

  return typeDef
}
