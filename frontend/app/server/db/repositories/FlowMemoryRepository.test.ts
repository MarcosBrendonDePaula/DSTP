// Regression tests for FlowMemoryRepository round-tripping. The value column is
// text({ mode: 'json' }), so Drizzle (de)serializes automatically — the repo must
// NOT JSON.parse again. A raw string like "cabin" once threw on read (double
// parse); these lock that down across types. Runs under `bun test`.
import { describe, it, expect, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { FlowMemoryRepository } from './FlowMemoryRepository'

const SERVER = `__test_flowmem_${Date.now()}`
const repo = () => new FlowMemoryRepository(SERVER)
const FLOW = 'f1'

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${SERVER}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

describe('FlowMemoryRepository round-trip', () => {
  it('round-trips a plain string (the double-parse regression)', () => {
    repo().set(FLOW, 'house', 'cabin')
    expect(repo().get(FLOW, 'house')).toBe('cabin')
  })

  it('round-trips a number, boolean, object and array', () => {
    repo().set(FLOW, 'n', 42)
    repo().set(FLOW, 'b', true)
    repo().set(FLOW, 'o', { a: 1, b: 'x' })
    repo().set(FLOW, 'arr', [1, 2, 3])
    expect(repo().get(FLOW, 'n')).toBe(42)
    expect(repo().get(FLOW, 'b')).toBe(true)
    expect(repo().get(FLOW, 'o')).toEqual({ a: 1, b: 'x' })
    expect(repo().get(FLOW, 'arr')).toEqual([1, 2, 3])
  })

  it('overwrites an existing key', () => {
    repo().set(FLOW, 'k', 'first')
    repo().set(FLOW, 'k', 'second')
    expect(repo().get(FLOW, 'k')).toBe('second')
  })

  it('get of a missing key returns undefined', () => {
    expect(repo().get(FLOW, 'absent_xyz')).toBeUndefined()
  })

  it('getAll returns every key without throwing on string values', () => {
    repo().clearFlow(FLOW)
    repo().set(FLOW, 's', 'text')
    repo().set(FLOW, 'num', 7)
    expect(repo().getAll(FLOW)).toEqual({ s: 'text', num: 7 })
  })

  it('delete removes one key; clearFlow wipes the flow', () => {
    repo().set(FLOW, 'a', '1')
    repo().set(FLOW, 'b', '2')
    repo().delete(FLOW, 'a')
    expect(repo().get(FLOW, 'a')).toBeUndefined()
    expect(repo().get(FLOW, 'b')).toBe('2')
    repo().clearFlow(FLOW)
    expect(repo().getAll(FLOW)).toEqual({})
  })
})
