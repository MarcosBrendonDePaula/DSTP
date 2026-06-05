// Regression net for the dead-listener cleanup (#5/#6/#7).
//
// Background: several trigger events had NO real in-game source (their Lua listener
// fired on the wrong entity or on an event DST never emits), so they were dropped
// from both the catalog (TRIGGER_EVENTS) and FlowEngine.categoryMap. A few others
// were REMAPPED to the correct DST event but kept the same trigger value (so flows
// keep working). This test pins both facts so a future edit can't silently:
//   - re-introduce a sourceless event into the catalog, or
//   - drop a still-valid remapped event from the category routing.
//
// categoryMap is private; we observe it through ensureEventCategories' toggle calls,
// matching event-categories.test.ts. Run under `bun test`.
import { describe, it, expect, beforeEach } from 'bun:test'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { TRIGGER_EVENTS } from '../../shared/automation/nodes/triggers/game/trigger/ui'

function makeHost() {
  const toggles: Array<{ category: string; enabled: boolean }> = []
  const host: EngineHost = {
    pushCommand: () => {},
    getServerGroups: () => [],
    emitState: () => {},
    requestEventToggle: (_s, category, enabled) => { toggles.push({ category, enabled }) },
    requestWatchKeys: () => {},
  }
  return { host, toggles }
}

let engine: FlowEngine
let toggles: Array<{ category: string; enabled: boolean }>

beforeEach(() => {
  const h = makeHost()
  engine = new FlowEngine(h.host)
  toggles = h.toggles
})

function categoriesFor(eventType: string): Set<string> {
  engine.ensureEventCategories({
    server_id: 'srv',
    nodes: [{ id: 'trg', type: 'trigger', data: { event_type: eventType }, position: { x: 0, y: 0 } }],
    edges: [],
  })
  return new Set(toggles.filter(t => t.enabled).map(t => t.category))
}

// Events whose in-game listener was dead → removed entirely (#5/#6/#7).
const REMOVED_EVENTS = [
  'player_action_start', // startlongaction fired on the action target, not the player
  'boat_entered',        // onboat not pushed on the player
  'boat_exited',         // onboatoff not pushed on the player
  'book_read',           // readbook not pushed on the player
  'hound_attack',        // ms_houndattack is not a real world event
  'fire_started',        // ms_registerfire is not a real world event
]

// Events kept but REMAPPED to the correct DST source — must still route to a category.
const REMAPPED_EVENTS: Array<[string, string]> = [
  ['earthquake', 'world'],        // ms_earthquake → startquake
  ['hound_warning', 'bosses'],    // houndwarningsound (world) → houndwarning (per-player)
  ['player_teleported', 'world'], // onleftplayer → wormholetravel
]

describe('dead listeners removed (#5/#6/#7) — sourceless events are gone', () => {
  for (const event of REMOVED_EVENTS) {
    it(`${event} is NOT in the catalog`, () => {
      expect(TRIGGER_EVENTS.some(e => e.value === event)).toBe(false)
    })
    it(`${event} activates NO category (dropped from categoryMap)`, () => {
      expect(categoriesFor(event).size).toBe(0)
    })
  }
})

describe('remapped listeners (#5/#6) — still in the catalog and still route', () => {
  for (const [event, category] of REMAPPED_EVENTS) {
    it(`${event} is in the catalog`, () => {
      expect(TRIGGER_EVENTS.some(e => e.value === event)).toBe(true)
    })
    it(`${event} → ${category}`, () => {
      expect(categoriesFor(event).has(category)).toBe(true)
    })
  }
})
