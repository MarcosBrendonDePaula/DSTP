// Unit tests for collectWatchKeys — the FULL key-watch set the backend derives from
// the enabled flows and ships to the client (the key_pressed trigger). The model is
// "full set, recomputed every time" (not an additive delta) so deleting/disabling a
// key flow SHRINKS the set. We drive collectWatchKeys against a real FlowRepository
// (temp sqlite) and capture host.requestWatchKeys.
//
// Run under `bun test` (bun:sqlite + bun:test), same as FlowEngine.e2e.test.ts.
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowRepository } from '../db'

const SERVER = `__test_watchkeys_${Date.now()}`
let seq = 0
const uid = () => `f_${Date.now()}_${seq++}`

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

let engine: FlowEngine
let watchCalls: Array<{ serverId: string; keys: string[]; combos?: any[] }>

function makeHost() {
  watchCalls = []
  const host: EngineHost = {
    pushCommand: () => {},
    getServerGroups: () => [],
    emitState: () => {},
    requestEventToggle: () => {},
    requestWatchKeys: (serverId, keys, combos) => { watchCalls.push({ serverId, keys, combos }) },
  }
  return host
}

// A flow whose entry is a key_pressed trigger for `key`.
const keyFlow = (key: string, enabled = true) => ({
  id: uid(), name: 'k', enabled,
  nodes: [{ id: 't', type: 'trigger', data: { event_type: 'key_pressed', params: { key } }, position: { x: 0, y: 0 } }],
  edges: [],
})

function lastKeys(): string[] {
  return watchCalls.length ? [...watchCalls[watchCalls.length - 1].keys].sort() : []
}

beforeEach(() => {
  const repo = new FlowRepository(SERVER)
  for (const f of repo.findAll()) repo.delete(f.id)
  engine = new FlowEngine(makeHost())
})

describe('collectWatchKeys — derives the full watch set from enabled flows', () => {
  it('collects keys across flows, deduped and uppercased, disabled excluded', () => {
    const repo = new FlowRepository(SERVER)
    repo.save(keyFlow('H'))
    repo.save(keyFlow('F5'))
    repo.save(keyFlow('h'))          // dupe of H (case-insensitive)
    repo.save(keyFlow('X', false))   // disabled → excluded
    engine.collectWatchKeys(SERVER)
    expect(lastKeys()).toEqual(['F5', 'H'])
  })

  it('shrinks the set when a key flow is removed (full-set model, not additive)', () => {
    const repo = new FlowRepository(SERVER)
    const fh = keyFlow('H'); repo.save(fh)
    repo.save(keyFlow('J'))
    engine.collectWatchKeys(SERVER)
    expect(lastKeys()).toEqual(['H', 'J'])

    repo.delete(fh.id)
    engine.collectWatchKeys(SERVER)
    expect(lastKeys()).toEqual(['J'])   // H dropped out
  })

  it('requests an empty set when no flow uses keys', () => {
    new FlowRepository(SERVER).save({
      id: uid(), name: 'x', enabled: true,
      nodes: [{ id: 't', type: 'trigger', data: { event_type: 'player_death' }, position: { x: 0, y: 0 } }],
      edges: [],
    })
    engine.collectWatchKeys(SERVER)
    expect(lastKeys()).toEqual([])
  })

  it('ignores a key_pressed trigger with no key set', () => {
    new FlowRepository(SERVER).save({
      id: uid(), name: 'x', enabled: true,
      nodes: [{ id: 't', type: 'trigger', data: { event_type: 'key_pressed', params: {} }, position: { x: 0, y: 0 } }],
      edges: [],
    })
    engine.collectWatchKeys(SERVER)
    expect(lastKeys()).toEqual([])
  })
})

// key_combo: collectWatchKeys must derive both the combo descriptors AND fold their
// individual keys into the flat watch set (so the client's OnRawKey doesn't ignore
// them). Modifiers (CTRL/SHIFT/ALT) must NEVER enter the flat key set.
describe('collectWatchKeys — key_combo', () => {
  const comboFlow = (params: any, enabled = true) => ({
    id: uid(), name: 'c', enabled,
    nodes: [{ id: 'cmb', type: 'trigger', data: { event_type: 'key_combo', params }, position: { x: 0, y: 0 } }],
    edges: [],
  })
  const lastCombos = () => watchCalls.length ? (watchCalls[watchCalls.length - 1].combos ?? []) : []

  it('simultaneous: main key in watch set, modifiers NOT, combo descriptor emitted', () => {
    new FlowRepository(SERVER).save(comboFlow({ mode: 'simultaneous', key: 'h', modifiers: ['CTRL', 'SHIFT'] }))
    engine.collectWatchKeys(SERVER)
    expect(lastKeys()).toEqual(['H'])                 // main key in, CTRL/SHIFT out
    const c = lastCombos()
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ mode: 'simultaneous', key: 'H', modifiers: ['CTRL', 'SHIFT'] })
    expect(c[0].id).toBeString()
  })

  it('sequence: all keys folded into watch set, timeout defaulted', () => {
    new FlowRepository(SERVER).save(comboFlow({ mode: 'sequence', keys: 'h, j, k' }))
    engine.collectWatchKeys(SERVER)
    expect(lastKeys()).toEqual(['H', 'J', 'K'])
    expect(lastCombos()[0]).toMatchObject({ mode: 'sequence', keys: ['H', 'J', 'K'], timeoutMs: 1000 })
  })

  it('any: all keys folded into watch set', () => {
    new FlowRepository(SERVER).save(comboFlow({ mode: 'any', keys: 'F1,F2,F3' }))
    engine.collectWatchKeys(SERVER)
    expect(lastKeys()).toEqual(['F1', 'F2', 'F3'])
    expect(lastCombos()[0]).toMatchObject({ mode: 'any', keys: ['F1', 'F2', 'F3'] })
  })

  it('key_pressed and a combo sharing a key dedupe in the flat set', () => {
    const repo = new FlowRepository(SERVER)
    repo.save(keyFlow('H'))
    repo.save(comboFlow({ mode: 'simultaneous', key: 'H', modifiers: ['CTRL'] }))
    engine.collectWatchKeys(SERVER)
    expect(lastKeys()).toEqual(['H'])                 // H once
    expect(lastCombos()).toHaveLength(1)
  })

  it('disabled combo flow is excluded', () => {
    new FlowRepository(SERVER).save(comboFlow({ mode: 'any', keys: 'F5' }, false))
    engine.collectWatchKeys(SERVER)
    expect(lastKeys()).toEqual([])
    expect(lastCombos()).toEqual([])
  })
})

// Reconnection reconciliation: when a shard goes offline and comes back (game/server
// restart), the mod loses its watch set. The backend still remembers last_keys, so a
// plain "unchanged → skip" would never re-send. resetWatchKeysFor + recompute fixes
// it: the SAME watch set is re-delivered on the reconnect sync.
describe('DSTStateStore — watch keys re-sent on reconnect', () => {
  // Lazy import to avoid pulling the store into the engine-only tests above.
  const SRV = `__test_wkrc_${Date.now()}`
  const SHARD = `${SRV}:master`

  it('re-delivers watch_keys after a shard reconnects, even when unchanged', async () => {
    const { dstStateStore } = await import('../services/DSTStateStore')

    // First connect: request H, drain it (delivered once).
    dstStateStore.handleSync(SRV, SHARD, 'master', {}, [], [])
    dstStateStore.requestWatchKeysForServer(SRV, ['H'])
    const r1 = dstStateStore.handleSync(SRV, SHARD, 'master', {}, [], [])
    expect(r1.watch_keys).toEqual({ keys: ['H'], combos: [] })

    // Steady state: same set, not re-sent.
    dstStateStore.requestWatchKeysForServer(SRV, ['H'])
    const r2 = dstStateStore.handleSync(SRV, SHARD, 'master', {}, [], [])
    expect(r2.watch_keys).toBeUndefined()

    // Simulate reconnect: the route would see isShardOnline()===false and call
    // resetWatchKeysFor before recompute. Here we drive those two directly.
    expect(dstStateStore.isShardOnline(SHARD)).toBe(true)
    dstStateStore.resetWatchKeysFor(SRV)
    dstStateStore.requestWatchKeysForServer(SRV, ['H']) // recompute requests same set
    const r3 = dstStateStore.handleSync(SRV, SHARD, 'master', {}, [], [])
    expect(r3.watch_keys).toEqual({ keys: ['H'], combos: [] }) // re-delivered despite being unchanged
  })
})
