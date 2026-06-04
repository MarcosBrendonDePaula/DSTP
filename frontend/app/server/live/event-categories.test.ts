// Unit tests for the event→category routing (FlowEngine.ensureEventCategories).
//
// This is the integrity net for the 18 audit events (#8-14): each new trigger
// event must be in the categoryMap, mapped to the SAME category the in-game
// listener gates on (events/<cat>.lua) — otherwise the backend never auto-enables
// the category and the flow silently never fires. We drive ensureEventCategories
// for real (a flow whose only node is the trigger) and assert it requests the
// expected category toggle. categoryMap is private to the method, so we test it
// through its observable effect (requestEventToggle), matching the e2e style.
//
// Run under `bun test` (same runner as FlowEngine.e2e.test.ts).
import { describe, it, expect, beforeEach } from 'bun:test'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { TRIGGER_EVENTS } from '../../shared/automation/nodes/triggers/game/trigger/ui'

function makeHost() {
  const toggles: Array<{ serverId: string; category: string; enabled: boolean }> = []
  const host: EngineHost = {
    pushCommand: () => {},
    getServerGroups: () => [],
    emitState: () => {},
    requestEventToggle: (serverId, category, enabled) => { toggles.push({ serverId, category, enabled }) },
    requestWatchKeys: () => {},
  }
  return { host, toggles }
}

let engine: FlowEngine
let toggles: Array<{ serverId: string; category: string; enabled: boolean }>

beforeEach(() => {
  const h = makeHost()
  engine = new FlowEngine(h.host)
  toggles = h.toggles
})

// Build a minimal flow whose entry trigger is `eventType`, then run the
// category-activation scan and return the set of categories it requested.
function categoriesFor(eventType: string): Set<string> {
  const flow = {
    server_id: 'srv',
    nodes: [{ id: 'trg', type: 'trigger', data: { event_type: eventType }, position: { x: 0, y: 0 } }],
    edges: [],
  }
  engine.ensureEventCategories(flow)
  return new Set(toggles.filter(t => t.enabled).map(t => t.category))
}

// The 18 new events (#8-14) → the category their Lua listener gates on.
const NEW_EVENTS: Array<[string, string]> = [
  // players
  ['player_new_character', 'players'],
  ['player_resurrected', 'players'],
  ['player_migrated', 'players'],
  // combat
  ['player_block', 'combat'],
  ['player_attack_miss', 'combat'],
  ['player_min_health', 'combat'],
  ['player_combat_target', 'combat'],
  ['boss_warning', 'bosses'],   // boss-proximity → gates on `bosses`, not `combat`
  // gathering
  ['player_pick', 'gathering'],
  ['player_mine_chop_start', 'gathering'],
  // inventory
  ['inventory_full', 'inventory'],
  ['trade_received', 'inventory'],
  // crafting
  ['recipe_unlocked', 'crafting'],
  ['tech_tree_changed', 'crafting'],
  // survival
  ['player_enlightened', 'survival'],
  ['player_lunacy_normal', 'survival'],
  ['player_wet', 'survival'],
  // world
  ['rift_spawned', 'world'],
]

describe('ensureEventCategories — the 18 audit events route to the right category', () => {
  for (const [event, category] of NEW_EVENTS) {
    it(`${event} → ${category}`, () => {
      const cats = categoriesFor(event)
      expect(cats.has(category)).toBe(true)
    })
  }

  it('all 18 are mapped (none silently missing from categoryMap)', () => {
    const unmapped = NEW_EVENTS.filter(([e]) => categoriesFor(e).size === 0).map(([e]) => e)
    expect(unmapped).toEqual([])
  })
})

describe('ensureEventCategories — existing behavior still holds', () => {
  it('a known event still activates its category', () => {
    expect(categoriesFor('player_death').has('players')).toBe(true)
    expect(categoriesFor('chat_message').has('chat')).toBe(true)
    expect(categoriesFor('command').has('chat')).toBe(true)
  })

  it('an unmapped/unknown event activates nothing', () => {
    expect(categoriesFor('totally_made_up_event').size).toBe(0)
  })

  it('key_pressed activates NO category (it is not a DST event category)', () => {
    expect(categoriesFor('key_pressed').size).toBe(0)
  })

  it('a flow with no trigger activates nothing', () => {
    engine.ensureEventCategories({ server_id: 'srv', nodes: [{ id: 'a', type: 'action', data: {} }], edges: [] })
    expect(toggles.length).toBe(0)
  })
})

describe('catalog ↔ categoryMap integrity', () => {
  // Categories that are NOT real DST event categories (no Lua listener gates on
  // them): synthetic/result/UI events the engine emits internally. These catalog
  // entries are intentionally absent from ensureEventCategories' map.
  // 'input' (key_pressed) is NOT a DST event category — keys ride the parallel
  // watch_keys channel, not evt_config. So key_pressed must NOT be in categoryMap.
  const NON_LISTENER_CATEGORIES = new Set(['economy', 'ui', 'input'])
  // `tick` is a synthetic heartbeat (world category in the catalog) with no DST
  // listener; ui_callback is an in-game RPC, not a server-side event toggle.
  const SYNTHETIC = new Set(['tick', 'ui_callback'])

  it('every game-category catalog event is in the categoryMap with the SAME category', () => {
    const mismatches: string[] = []
    for (const ev of TRIGGER_EVENTS) {
      if (NON_LISTENER_CATEGORIES.has(ev.category) || SYNTHETIC.has(ev.value)) continue
      const cats = categoriesFor(ev.value)
      // The catalog category must be the one the engine activates for this event.
      if (!cats.has(ev.category)) {
        mismatches.push(`${ev.value}: catalog=${ev.category} engine=${[...cats].join('|') || '∅'}`)
      }
    }
    expect(mismatches).toEqual([])
  })
})
