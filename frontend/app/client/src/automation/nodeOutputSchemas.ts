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

// Helper for common player fields
const playerFields: OutputField[] = [
  { name: 'userid', type: 'string', description: 'Klei user ID (KU_xxx)' },
  { name: 'name', type: 'string', description: 'Player display name' },
]

export const triggerOutputSchemas: Record<string, NodeOutputSchema> = {
  // ── Players ──────────────────────────────────────────
  player_spawn: {
    description: 'Player joined the server',
    fields: [
      ...playerFields,
      { name: 'prefab', type: 'string', description: 'Character prefab (wilson, willow, etc)' },
    ],
  },
  player_left: {
    description: 'Player disconnected from the server',
    fields: [...playerFields],
  },
  player_death: {
    description: 'Player died',
    fields: [
      ...playerFields,
      { name: 'cause', type: 'string', description: 'Killer prefab or "unknown"' },
    ],
  },
  player_ghost: {
    description: 'Player became a ghost after death',
    fields: [...playerFields],
  },
  player_respawn: {
    description: 'Player respawned from ghost form',
    fields: [...playerFields],
  },
  player_disconnected: {
    description: 'Player disconnected from the server (network drop or quit)',
    fields: [
      ...playerFields,
      { name: 'reason', type: 'string', description: 'Disconnect reason (e.g. "disconnect", "kicked", "banned")' },
    ],
  },

  // ── Griefing (anti-grief detection) ──────────────────
  structure_burnt: {
    description: 'A structure burned down (destroyed by fire)',
    fields: [
      { name: 'prefab', type: 'string', description: 'Burnt structure prefab' },
      { name: 'cause', type: 'string', description: 'Cause of destruction (fire/prefab name)' },
      { name: 'x', type: 'number', description: 'X world coordinate' },
      { name: 'z', type: 'number', description: 'Z world coordinate' },
    ],
  },
  structure_hammered: {
    description: 'A player hammered a structure',
    fields: [
      ...playerFields,
      { name: 'prefab', type: 'string', description: 'Hammered structure prefab' },
    ],
  },
  container_opened: {
    description: 'Player opened a container (chest, icebox, etc)',
    fields: [
      ...playerFields,
      { name: 'container_prefab', type: 'string', description: 'Container prefab (treasurechest, icebox, etc)' },
    ],
  },
  container_closed: {
    description: 'Player closed a container',
    fields: [
      ...playerFields,
      { name: 'container_prefab', type: 'string', description: 'Container prefab' },
    ],
  },

  // ── Chat ─────────────────────────────────────────────
  chat_message: {
    description: 'Chat message sent by a player',
    fields: [
      ...playerFields,
      { name: 'message', type: 'string', description: 'Chat text content' },
      { name: 'prefab', type: 'string', description: 'Sender character prefab' },
    ],
  },

  // ── Combat ───────────────────────────────────────────
  player_kill: {
    description: 'Player killed an entity',
    fields: [
      ...playerFields,
      { name: 'victim', type: 'string', description: 'Killed entity prefab' },
    ],
  },
  player_attacked: {
    description: 'Player took damage from an attacker',
    fields: [
      ...playerFields,
      { name: 'attacker', type: 'string', description: 'Attacker entity prefab' },
      { name: 'damage', type: 'number', description: 'Raw damage amount' },
      { name: 'damage_resolved', type: 'number', description: 'Damage after armor' },
      { name: 'weapon', type: 'string', description: 'Weapon prefab used' },
      { name: 'stimuli', type: 'string', description: 'Damage type: electric/fire/etc' },
    ],
  },

  // ── Crafting ─────────────────────────────────────────
  player_craft: {
    description: 'Player crafted an item',
    fields: [
      ...playerFields,
      { name: 'item', type: 'string', description: 'Crafted item prefab' },
      { name: 'recipe', type: 'string', description: 'Recipe name' },
    ],
  },
  player_build: {
    description: 'Player placed a structure',
    fields: [
      ...playerFields,
      { name: 'item', type: 'string', description: 'Structure prefab' },
      { name: 'recipe', type: 'string', description: 'Recipe name' },
    ],
  },

  // ── Inventory ────────────────────────────────────────
  player_equip: {
    description: 'Player equipped an item',
    fields: [
      ...playerFields,
      { name: 'item', type: 'string', description: 'Equipped item prefab' },
      { name: 'slot', type: 'string', description: 'Equipment slot (hands/head/body)' },
    ],
  },
  player_pickup: {
    description: 'Player picked up an item',
    fields: [
      ...playerFields,
      { name: 'item', type: 'string', description: 'Picked up item prefab' },
    ],
  },
  player_drop: {
    description: 'Player dropped an item',
    fields: [
      ...playerFields,
      { name: 'item', type: 'string', description: 'Dropped item prefab' },
    ],
  },
  player_unequip: {
    description: 'Player unequipped an item',
    fields: [
      ...playerFields,
      { name: 'item', type: 'string', description: 'Unequipped item prefab' },
      { name: 'slot', type: 'string', description: 'Equipment slot (hands/head/body)' },
    ],
  },

  // ── Health ───────────────────────────────────────────
  health_delta: {
    description: 'Player health changed',
    fields: [
      ...playerFields,
      { name: 'old', type: 'number', description: 'Previous health percent (0-1)' },
      { name: 'new', type: 'number', description: 'New health percent (0-1)' },
      { name: 'amount', type: 'number', description: 'Signed change amount' },
      { name: 'cause', type: 'string', description: 'Cause of damage' },
      { name: 'afflicter', type: 'string', description: 'Entity that caused it' },
    ],
  },
  hunger_delta: {
    description: 'Player hunger changed',
    fields: [
      ...playerFields,
      { name: 'old', type: 'number', description: 'Previous hunger percent (0-1)' },
      { name: 'new', type: 'number', description: 'New hunger percent (0-1)' },
      { name: 'amount', type: 'number', description: 'Signed change amount' },
    ],
  },
  sanity_delta: {
    description: 'Player sanity changed',
    fields: [
      ...playerFields,
      { name: 'old', type: 'number', description: 'Previous sanity percent (0-1)' },
      { name: 'new', type: 'number', description: 'New sanity percent (0-1)' },
      { name: 'amount', type: 'number', description: 'Signed change amount' },
    ],
  },

  // ── Gathering ────────────────────────────────────────
  player_work: {
    description: 'Player performed a work action on an entity',
    fields: [
      ...playerFields,
      { name: 'target', type: 'string', description: 'Target entity prefab (evergreen, rock1, etc)' },
      { name: 'action', type: 'string', description: 'Work action (CHOP/MINE/HAMMER/DIG)' },
    ],
  },
  resource_gathered: {
    description: 'Loot dropped from a destroyed entity',
    fields: [
      ...playerFields,
      { name: 'source', type: 'string', description: 'Source entity prefab (evergreen, rock1)' },
      { name: 'action', type: 'string', description: 'Work action (CHOP/MINE/HAMMER)' },
      { name: 'loot', type: 'string', description: 'Loot item prefab (log, rocks, flint)' },
      { name: 'count', type: 'number', description: 'Stack size of the loot drop' },
    ],
  },
  player_harvest: {
    description: 'Player harvested a plant',
    fields: [
      ...playerFields,
      { name: 'source', type: 'string', description: 'Plant prefab (berrybush, farm_plant)' },
    ],
  },
  player_startfire: {
    description: 'Player started a fire on an entity',
    fields: [
      ...playerFields,
      { name: 'target', type: 'string', description: 'Entity that caught fire' },
    ],
  },

  // ── World ────────────────────────────────────────────
  new_day: {
    description: 'New day started in the world',
    fields: [
      { name: 'day', type: 'number', description: 'Current day count' },
    ],
  },
  phase_changed: {
    description: 'Day phase transitioned',
    fields: [
      { name: 'phase', type: 'string', description: 'New phase (day/dusk/night)' },
    ],
  },
  season_changed: {
    description: 'Season changed in the world',
    fields: [
      { name: 'season', type: 'string', description: 'New season (autumn/winter/spring/summer)' },
    ],
  },
  moon_phase_changed: {
    description: 'Moon phase changed (full/waxing/new/etc)',
    fields: [
      { name: 'phase', type: 'string', description: 'Moon phase name' },
      { name: 'is_new', type: 'boolean', description: 'True if new moon' },
      { name: 'is_full', type: 'boolean', description: 'True if full moon' },
    ],
  },
  earthquake: {
    description: 'Earthquake started (typically in caves)',
    fields: [
      { name: 'shard_type', type: 'string', description: 'Which shard (master/caves)' },
    ],
  },
  sinkhole_warn: {
    description: 'Sinkhole will appear soon',
    fields: [
      { name: 'shard_type', type: 'string', description: 'Which shard' },
    ],
  },
  world_save: {
    description: 'World was saved',
    fields: [],
  },
  player_teleported: {
    description: 'Player entered or exited a wormhole',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'type', type: 'string', description: 'wormhole_enter or wormhole_exit' },
    ],
  },

  // ── Weather ──────────────────────────────────────────
  storm_changed: {
    description: 'Storm started or ended',
    fields: [
      { name: 'stormtype', type: 'string', description: 'Storm type (sand/moonstorm/etc)' },
      { name: 'setting', type: 'boolean', description: 'true=started, false=ended' },
    ],
  },
  precipitation: {
    description: 'Rain/snow started or stopped',
    fields: [
      { name: 'enabled', type: 'boolean', description: 'true=raining/snowing, false=stopped' },
    ],
  },
  lightning_strike: {
    description: 'Lightning struck a location',
    fields: [
      { name: 'x', type: 'number', description: 'X world coordinate' },
      { name: 'z', type: 'number', description: 'Z world coordinate' },
    ],
  },

  // ── Bosses ───────────────────────────────────────────
  boss_event: {
    description: 'Boss-related event occurred',
    fields: [
      { name: 'event', type: 'string', description: 'Event name' },
      { name: 'data', type: 'object', description: 'Event-specific data' },
    ],
  },
  boss_killed: {
    description: 'A boss entity was killed',
    fields: [
      { name: 'prefab', type: 'string', description: 'Boss prefab name' },
      { name: 'cause', type: 'string', description: 'Kill cause' },
    ],
  },
  fire_started: {
    description: 'An entity caught fire',
    fields: [
      { name: 'prefab', type: 'string', description: 'Burning entity prefab' },
      { name: 'x', type: 'number', description: 'X world coordinate' },
      { name: 'z', type: 'number', description: 'Z coordinate' },
    ],
  },
  hound_warning: {
    description: 'Hound attack incoming (warning sound just played)',
    fields: [
      { name: 'shard_type', type: 'string', description: 'Which shard (master/caves)' },
    ],
  },
  hound_attack: {
    description: 'Hounds spawned and are attacking',
    fields: [
      { name: 'shard_type', type: 'string', description: 'Which shard (master/caves)' },
    ],
  },

  // ── Survival ─────────────────────────────────────────
  player_eat: {
    description: 'Player ate food',
    fields: [
      ...playerFields,
      { name: 'food', type: 'string', description: 'Food item prefab' },
      { name: 'health', type: 'number', description: 'Health restored' },
      { name: 'hunger', type: 'number', description: 'Hunger restored' },
      { name: 'sanity', type: 'number', description: 'Sanity restored' },
    ],
  },
  player_insane: {
    description: 'Player went insane (sanity below threshold)',
    fields: [...playerFields],
  },
  player_sane: {
    description: 'Player regained sanity (above threshold)',
    fields: [...playerFields],
  },
  player_starving: {
    description: 'Player started starving (hunger at 0)',
    fields: [...playerFields],
  },
  player_fed: {
    description: 'Player no longer starving',
    fields: [...playerFields],
  },
  player_freezing: {
    description: 'Player started freezing',
    fields: [...playerFields],
  },
  player_warm: {
    description: 'Player warmed up from freezing',
    fields: [...playerFields],
  },
  player_overheating: {
    description: 'Player started overheating',
    fields: [...playerFields],
  },
  player_cooled: {
    description: 'Player cooled down from overheating',
    fields: [...playerFields],
  },
  player_mounted: {
    description: 'Player mounted a beefalo',
    fields: [...playerFields],
  },
  player_dismounted: {
    description: 'Player dismounted a beefalo',
    fields: [...playerFields],
  },

  // ── Character ────────────────────────────────────────
  recipe_learned: {
    description: 'Player learned a new cookbook recipe (by eating new food)',
    fields: [
      ...playerFields,
      { name: 'product', type: 'string', description: 'Recipe/food prefab learned' },
    ],
  },
  book_read: {
    description: 'Player read a book (Wickerbottom or any character)',
    fields: [
      ...playerFields,
      { name: 'book', type: 'string', description: 'Book prefab (book_tentacles, book_birds, etc)' },
    ],
  },
  character_transform: {
    description: 'Character transformed (Woodie were-forms, Wurt, etc.)',
    fields: [
      ...playerFields,
      { name: 'form', type: 'string', description: 'Target form: "were" or "normal"' },
    ],
  },
  player_sleep_start: {
    description: 'Player started sleeping (tent, siesta, bedroll)',
    fields: [...playerFields],
  },
  player_sleep_end: {
    description: 'Player woke up',
    fields: [...playerFields],
  },

  // ── Exploration ──────────────────────────────────────
  player_sunk: {
    description: 'Player fell into water / sank',
    fields: [
      ...playerFields,
      { name: 'x', type: 'number', description: 'X world coordinate' },
      { name: 'z', type: 'number', description: 'Z world coordinate' },
    ],
  },
  fish_caught: {
    description: 'Player caught a fish',
    fields: [
      ...playerFields,
      { name: 'fish', type: 'string', description: 'Fish prefab name' },
    ],
  },
  boat_entered: {
    description: 'Player stepped onto a boat',
    fields: [...playerFields],
  },
  boat_exited: {
    description: 'Player left a boat',
    fields: [...playerFields],
  },

  // ── UI ───────────────────────────────────────────────
  ui_callback: {
    description: 'Player clicked a UI widget (button) or rule emitted event',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'callback_name', type: 'string', description: 'Name of the callback (e.g. "buy_item")' },
      { name: 'widget_id', type: 'string', description: 'ID of the widget that triggered' },
      { name: 'callback_data', type: 'object', description: 'Custom data sent with callback (optional)' },
    ],
  },
  key_pressed: {
    description: 'Player pressed a watched key (carries the mouse world position at press time)',
    fields: [
      { name: 'userid', type: 'string', description: 'Who pressed the key (player user ID)' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'key', type: 'string', description: 'The key that was pressed (e.g. "H", "F5")' },
      { name: 'world_x', type: 'number', description: 'Mouse X in WORLD coords at the moment of the press (for Teleport/Spawn). Absent if the cursor was not over terrain.' },
      { name: 'world_z', type: 'number', description: 'Mouse Z in WORLD coords at the moment of the press (for Teleport/Spawn). Absent if the cursor was not over terrain.' },
    ],
  },
  key_combo: {
    description: 'Player completed a key combo (Ctrl+H, a sequence, or any of a set). Carries the mouse world position.',
    fields: [
      { name: 'userid', type: 'string', description: 'Who triggered the combo (player user ID)' },
      { name: 'name', type: 'string', description: 'Player name' },
      { name: 'key', type: 'string', description: 'The key that fired it (main key for simultaneous, last for sequence, the pressed one for "any")' },
      { name: 'world_x', type: 'number', description: 'Mouse X in WORLD coords at the moment of the combo (for Teleport/Spawn). Absent if cursor was not over terrain.' },
      { name: 'world_z', type: 'number', description: 'Mouse Z in WORLD coords at the moment of the combo. Absent if cursor was not over terrain.' },
    ],
  },
}

// ─── Node type outputs ───────────────────────────────

export const nodeOutputSchemas: Record<string, NodeOutputSchema> = {
  condition: {
    description: 'Condition evaluation result',
    fields: [
      { name: 'result', type: 'boolean', description: 'Whether the condition passed' },
      { name: 'field', type: 'string', description: 'Evaluated field name' },
      { name: 'value', type: 'string', description: 'Compared value' },
    ],
  },
  delay: {
    description: 'Delay timer result',
    fields: [
      { name: 'delayed', type: 'boolean', description: 'Whether the delay was applied' },
      { name: 'ms', type: 'number', description: 'Delay duration in milliseconds' },
    ],
  },
  action: {
    description: 'Game action execution result',
    fields: [
      { name: 'executed', type: 'boolean', description: 'Whether the action was sent' },
      { name: 'action', type: 'string', description: 'Action type name' },
    ],
  },
  http_request: {
    description: 'HTTP request response',
    fields: [
      { name: 'status', type: 'number', description: 'HTTP status code (200, 404, etc)' },
      { name: 'ok', type: 'boolean', description: 'Response was successful (2xx)' },
      { name: 'body', type: 'any', description: 'Response body (parsed JSON or text)' },
      { name: 'error', type: 'string', description: 'Error message if request failed' },
    ],
  },
  find_player: {
    description: 'Find player by name (partial, case-insensitive)',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID (KU_xxx)' },
      { name: 'name', type: 'string', description: 'Player display name' },
      { name: 'prefab', type: 'string', description: 'Character prefab' },
      { name: 'age', type: 'number', description: 'Days survived' },
      { name: 'admin', type: 'boolean', description: 'Is server admin' },
      { name: 'health.current', type: 'number', description: 'Current HP' },
      { name: 'health.max', type: 'number', description: 'Max HP' },
      { name: 'hunger.current', type: 'number', description: 'Current hunger' },
      { name: 'sanity.current', type: 'number', description: 'Current sanity' },
      { name: 'position.x', type: 'number', description: 'X coordinate' },
      { name: 'position.z', type: 'number', description: 'Z coordinate' },
      { name: 'error', type: 'string', description: 'Error if not found' },
    ],
  },
  get_player: {
    description: 'Player data from DST server',
    fields: [
      { name: 'userid', type: 'string', description: 'Player user ID (KU_xxx)' },
      { name: 'name', type: 'string', description: 'Player display name' },
      { name: 'prefab', type: 'string', description: 'Character (wilson, willow, wx78...)' },
      { name: 'age', type: 'number', description: 'Days survived' },
      { name: 'admin', type: 'boolean', description: 'Is server admin' },
      { name: 'health.current', type: 'number', description: 'Current HP' },
      { name: 'health.max', type: 'number', description: 'Max HP' },
      { name: 'hunger.current', type: 'number', description: 'Current hunger' },
      { name: 'hunger.max', type: 'number', description: 'Max hunger' },
      { name: 'sanity.current', type: 'number', description: 'Current sanity' },
      { name: 'sanity.max', type: 'number', description: 'Max sanity' },
      { name: 'position.x', type: 'number', description: 'X coordinate' },
      { name: 'position.z', type: 'number', description: 'Z coordinate' },
      { name: 'buffs.temperature', type: 'number', description: 'Body temperature' },
      { name: 'buffs.moisture', type: 'number', description: 'Wetness level' },
    ],
  },
  set_variable: {
    description: 'User-defined variables',
    fields: [], // dynamic — defined by user key/value pairs
  },
  script: {
    description: 'Script return value',
    fields: [], // dynamic — whatever run() returns
  },
  ai_agent: {
    description: 'AI agent result (agentic loop over connected tool nodes)',
    fields: [
      { name: 'text', type: 'string', description: "The agent's final text response" },
      { name: 'steps', type: 'number', description: 'Number of tool-call rounds taken' },
      { name: 'toolCalls', type: 'object', description: 'List of tools the agent invoked, with args' },
      { name: 'usage', type: 'object', description: 'Token usage (input/output/total)' },
    ],
  },
  memory: {
    description: 'Persistent key-value storage (SQLite)',
    fields: [
      { name: 'action', type: 'string', description: 'Operation performed (read/write/delete/read_all)' },
      { name: 'key', type: 'string', description: 'Key name' },
      { name: 'value', type: 'any', description: 'Stored value (on read/write)' },
      { name: 'data', type: 'object', description: 'All key-values (on read_all)' },
    ],
  },
  wait: {
    description: 'Merged context from all branches',
    fields: [
      { name: 'merged', type: 'boolean', description: 'Whether merge completed' },
      { name: 'branches', type: 'object', description: 'Branch contexts keyed by trigger node ID' },
      { name: '_timedOut', type: 'boolean', description: 'True if wait timed out' },
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
