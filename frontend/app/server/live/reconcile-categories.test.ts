// Event categories must follow the ENABLED flows in the DB, not only the panel's
// saveFlow: a flow inserted directly (examples, scripts) or a DST restart (mod back to
// modinfo defaults) must still get its trigger categories requested. Pins
// FlowEngine.neededCategories (pure) + the ensureEventCategories pass over repo flows.
//
// Run under `bun test` (from frontend/).
import { describe, it, expect, afterAll } from 'bun:test'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowRepository } from '../db'

const SERVER = `__test_reccat_${Date.now()}`
afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

describe('event categories follow the enabled flows in the DB', () => {
  it('neededCategories is pure; a DB-inserted example flow (structure_built) needs crafting', () => {
    const toggles: Array<[string, string, boolean]> = []
    const host: EngineHost = {
      pushCommand: () => {}, getServerGroups: () => [], emitState: () => {},
      requestEventToggle: (s, c, e) => { toggles.push([s, c, e]) }, requestWatchKeys: () => {},
    }
    const engine = new FlowEngine(host)
    const flow = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', '..', '..', 'examples', 'flows', 'Baus_Grandes.dstp.json'), 'utf8'))
    const repo = new FlowRepository(SERVER)
    repo.save({ id: 'baus', name: flow.name, enabled: true, nodes: flow.nodes, edges: flow.edges })
    repo.save({ id: 'off', name: 'disabled', enabled: false, nodes: [{ id: 't', type: 'trigger', data: { event_type: 'player_attacked' }, position: { x: 0, y: 0 } }], edges: [] })

    const needed = new Set<string>()
    for (const f of repo.findEnabled()) {
      const cats = engine.neededCategories({ ...(f as any), server_id: SERVER })
      for (const c of cats) needed.add(c)
    }
    expect(needed.has('crafting')).toBe(true)     // structure_built
    expect(needed.has('combat')).toBe(false)      // the disabled flow does not count
    expect(toggles).toHaveLength(0)               // pure: nothing requested yet

    for (const f of repo.findEnabled()) engine.ensureEventCategories({ ...(f as any), server_id: SERVER })
    expect(toggles.some(([s, c, e]) => s === SERVER && c === 'crafting' && e === true)).toBe(true)
  })
})
