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
let watchCalls: Array<{ serverId: string; keys: string[] }>

function makeHost() {
  watchCalls = []
  const host: EngineHost = {
    pushCommand: () => {},
    getServerGroups: () => [],
    emitState: () => {},
    requestEventToggle: () => {},
    requestWatchKeys: (serverId, keys) => { watchCalls.push({ serverId, keys }) },
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
