// Per-event field schemas — the SPECIFIC fields each DST trigger event puts on
// context.trigger, beyond the base { userid, name, _event_type }. Extracted from
// the mod's event files (DST_MOD/scripts/dstp/events/*.lua). Lets the detail
// panel show the REAL fields of a trigger's output without running a capture.
//
// Only the extra fields are listed here; BASE_TRIGGER_FIELDS are always added.
export const BASE_TRIGGER_FIELDS = ['userid', 'name', '_event_type']

export const EVENT_FIELDS: Record<string, string[]> = {
  player_spawn: ['prefab'],
  player_left: [],
  player_death: ['cause'],
  player_ghost: ['prefab'],
  player_respawn: ['prefab'],
  player_disconnected: ['reason'],
  player_new_character: ['prefab', 'mode'],
  player_resurrected: ['corpse', 'reviver'],
  player_migrated: ['to_world', 'portal'],

  player_kill: ['victim'],
  player_attacked: ['attacker', 'damage', 'damage_resolved', 'weapon', 'stimuli'],
  player_attack_other: ['target', 'target_guid', 'target_is_player', 'weapon'],
  player_hit_other: ['target', 'target_guid', 'target_is_player', 'damage'],
  player_block: ['attacker', 'attacker_is_player', 'damage', 'original_damage'],
  player_attack_miss: ['target', 'target_guid', 'target_is_player', 'weapon'],
  player_min_health: ['cause', 'afflicter'],
  hound_warning: ['level'],
  boss_warning: ['scarer', 'duration'],
  player_combat_target: ['aggressor', 'aggressor_guid', 'switched_from'],

  health_delta: ['old', 'new', 'amount', 'cause', 'afflicter'],
  hunger_delta: ['old', 'new', 'amount'],
  sanity_delta: ['old', 'new', 'amount'],

  player_equip: ['item', 'slot'],
  player_pickup: ['item'],
  player_drop: ['item'],
  player_unequip: ['item', 'slot'],
  player_item_get: ['prefab', 'slot'],
  inventory_full: ['item'],
  trade_received: ['receiver', 'item'],

  chat_message: ['message'],
  command: ['message', 'command_name', 'args', 'argc', 'rest', 'arg1', 'arg2', 'arg3'],

  container_opened: ['container_prefab'],
  container_closed: ['container_prefab'],
  structure_hammered: ['prefab'],
  container_opened_entity: ['container_prefab', 'container_guid', 'x', 'z'],
  container_item_added: ['container_prefab', 'container_guid', 'item', 'slot'],
  container_item_taken: ['container_prefab', 'container_guid', 'item', 'slot'],
  structure_worked: ['prefab', 'x', 'z'],
  object_ignited: ['prefab', 'doer_userid', 'doer_name', 'x', 'z'],
  structure_burnt: ['prefab', 'cause', 'x', 'z'],

  player_craft: ['item', 'recipe'],
  player_build: ['item', 'recipe'],
  recipe_unlocked: ['recipe'],
  tech_tree_changed: ['science', 'magic', 'ancient', 'celestial', 'shadow'],
  structure_built: ['prefab', 'x', 'z'],

  player_work: ['target', 'action'],
  resource_gathered: ['source', 'action', 'loot', 'count'],
  player_harvest: ['source'],
  player_startfire: ['target'],
  player_pick: ['source', 'loot', 'count'],
  player_mine_chop_start: ['target'],

  new_day: ['day'],
  phase_changed: ['phase'],
  season_changed: ['season'],
  moon_phase_changed: ['phase', 'is_new', 'is_full'],
  lightning_strike: ['x', 'z'],
  earthquake: ['shard_type', 'duration'],
  sinkhole_warn: ['shard_type'],
  world_save: [],
  rift_spawned: ['rift_prefab', 'x', 'z', 'shard_type'],
  rift_closed: ['rift_prefab', 'x', 'z', 'shard_type'],
  nightmare_phase: ['phase', 'shard_type'],
  item_planted: ['x', 'z', 'shard_type'],
  object_activated: ['prefab', 'guid', 'x', 'z'],
  machine_toggled: ['prefab', 'guid', 'state', 'x', 'z'],
  player_teleported: ['type'],

  storm_changed: ['stormtype', 'setting'],
  precipitation: ['type', 'enabled'],

  boss_event: ['event', 'data'],
  boss_killed: ['prefab', 'cause', 'x', 'z'],
  toadstool_state_changed: ['state'],

  recipe_learned: ['product'],
  character_transform: ['form'],

  player_eat: ['food', 'health', 'hunger', 'sanity'],
  player_lunacy_normal: ['mode'],
  player_wet: ['moisture', 'was', 'wet'],

  beefalo_tamed: ['prefab', 'guid'],
  beefalo_feral: ['prefab', 'guid', 'was_domesticated'],
  mob_transform: ['prefab', 'guid', 'form', 'x', 'z'],
  mob_frozen: ['prefab', 'guid', 'x', 'z'],
  resource_picked: ['prefab', 'count', 'x', 'z'],
  mount_rider_changed: ['prefab', 'guid', 'rider_userid', 'rider_name', 'mounted'],

  player_sunk: ['x', 'z'],
  fish_caught: ['fish'],

  // Key input triggers
  key_pressed: ['key'],
  key_combo: ['keys', 'mode'],
}

// Build a placeholder { field: '<field>' } object for an event type. Always includes the
// base trigger fields. Used by the detail panel's Input column. `params` lets a trigger add
// node-specific fields — e.g. a `command` trigger surfaces its declared arg names so the
// flow can reference {{trigger.<name>}} before any capture.
export function triggerShape(eventType: string | undefined, params?: Record<string, any>): Record<string, any> {
  const extra = (eventType && EVENT_FIELDS[eventType]) || []
  const all = [...BASE_TRIGGER_FIELDS, ...extra]
  const shape: Record<string, any> = {}
  for (const f of all) shape[f] = `<${f}>`
  if (eventType === 'command' && Array.isArray(params?.args)) {
    for (const a of params.args as Array<{ name?: string }>) {
      if (a?.name) shape[a.name] = `<${a.name}>`
    }
  }
  return shape
}
