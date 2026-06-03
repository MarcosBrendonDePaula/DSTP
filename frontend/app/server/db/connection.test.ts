// Runs under `bun test`: getDb builds a sqlite filename from serverId, so it must
// refuse any id that could escape DATA_DIR (path traversal) or contain separators.
import { describe, it, expect, afterAll } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

const { getDb } = await import('./connection')

const VALID = `__test_conn_${Date.now()}`

afterAll(() => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { rmSync(join(process.cwd(), 'data', `${VALID}.sqlite`) + suffix) } catch { /* ignore */ }
  }
})

describe('getDb — serverId sanitization (path traversal defense)', () => {
  const BAD = [
    '../../etc/passwd',
    '..\\..\\windows',
    'a/b',
    'a\\b',
    'foo/../bar',
    'with space',
    'dot.sqlite',
    'null\x00byte',
    '',
  ]
  for (const bad of BAD) {
    it(`refuses ${JSON.stringify(bad)}`, () => {
      expect(() => getDb(bad)).toThrow(/Invalid serverId/)
    })
  }

  it('accepts a normal auto id (dst-<hex>) and a sharded id', () => {
    expect(() => getDb(VALID)).not.toThrow()
    // sharded form uses ":" which is in the allowlist
    const sharded = `${VALID}:master`
    expect(() => getDb(sharded)).not.toThrow()
    // cleanup the sharded file too
    for (const suffix of ['', '-shm', '-wal']) {
      try { rmSync(join(process.cwd(), 'data', `${sharded}.sqlite`) + suffix) } catch { /* ignore */ }
    }
  })
})
