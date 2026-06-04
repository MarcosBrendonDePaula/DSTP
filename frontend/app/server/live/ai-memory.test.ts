// Unit tests for runAiMemory — the AI's own key/value store (the ai_memory tool).
// It's a private method on FlowEngine but pure aside from FlowMemoryRepository
// (real SQLite, one db per serverId). We drive it through a cast and a temp db.
// Deterministic, no network. Runs under `bun test`.
import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowEngine, type EngineHost } from './FlowEngine'
import { FlowMemoryRepository } from '../db'

const SERVER = `__test_aimem_${Date.now()}`
const FLOW = 'flow_aimem'

const noopHost: EngineHost = {
  pushCommand: () => {}, getServerGroups: () => [], emitState: () => {}, requestEventToggle: () => {}, requestWatchKeys: () => {},
}

// runAiMemory(serverId, context, args) — private; reach it via cast.
function aimem(args: any) {
  const engine = new FlowEngine(noopHost) as any
  return engine.runAiMemory(SERVER, { _flowId: FLOW }, args)
}

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

beforeEach(() => {
  // Clear the flow's memory rows so each test starts clean.
  const repo = new FlowMemoryRepository(SERVER)
  for (const k of Object.keys(repo.getAll(FLOW))) repo.delete(FLOW, k)
})

describe('runAiMemory', () => {
  it('requires a flow context', () => {
    const engine = new FlowEngine(noopHost) as any
    expect(engine.runAiMemory(SERVER, {}, { operation: 'list' })).toEqual({ ok: false, error: 'no flow context' })
  })

  it('save then get round-trips a value', () => {
    expect(aimem({ operation: 'save', key: 'player:joe:house', value: 'cabin' })).toEqual({ ok: true, op: 'save', key: 'player:joe:house' })
    expect(aimem({ operation: 'get', key: 'player:joe:house' })).toEqual({ ok: true, op: 'get', key: 'player:joe:house', value: 'cabin', found: true })
  })

  it('get of a missing key reports found:false, value:null', () => {
    expect(aimem({ operation: 'get', key: 'nope' })).toEqual({ ok: true, op: 'get', key: 'nope', value: null, found: false })
  })

  it('list returns saved keys (without the aimem: prefix), values omitted', () => {
    aimem({ operation: 'save', key: 'server:pvp', value: 'on' })
    aimem({ operation: 'save', key: 'server:hardcore', value: 'off' })
    const r = aimem({ operation: 'list' })
    expect(r.ok).toBe(true)
    expect(r.keys.sort()).toEqual(['server:hardcore', 'server:pvp'])
  })

  it('list with a key acts as a prefix filter', () => {
    aimem({ operation: 'save', key: 'server:pvp', value: 'on' })
    aimem({ operation: 'save', key: 'player:joe', value: 'x' })
    expect(aimem({ operation: 'list', key: 'server:' }).keys).toEqual(['server:pvp'])
  })

  it('delete removes a key', () => {
    aimem({ operation: 'save', key: 'k', value: 'v' })
    expect(aimem({ operation: 'delete', key: 'k' })).toEqual({ ok: true, op: 'delete', key: 'k' })
    expect(aimem({ operation: 'get', key: 'k' }).found).toBe(false)
  })

  it('accepts operation aliases and is case-insensitive (set/read/del)', () => {
    expect(aimem({ op: 'SET', key: 'a', value: '1' }).op).toBe('save')
    expect(aimem({ operation: 'Read', key: 'a' })).toMatchObject({ op: 'get', value: '1', found: true })
    expect(aimem({ operation: 'del', key: 'a' }).op).toBe('delete')
  })

  it('save/get/delete require a key', () => {
    expect(aimem({ operation: 'save' })).toEqual({ ok: false, error: 'key required' })
    expect(aimem({ operation: 'get' })).toEqual({ ok: false, error: 'key required' })
  })

  it('rejects an unknown operation', () => {
    const r = aimem({ operation: 'frobnicate', key: 'k' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('unknown operation')
  })
})
