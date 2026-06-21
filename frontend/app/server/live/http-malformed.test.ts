// Resilience test for DST_MOD/scripts/dstp/http.lua: a backend that is UP but
// answers garbage (HTTP 200 + valid JSON whose fields are the wrong type) must NOT
// crash the game. The response handler must guard every field it iterates.
//
// Failure mode this pins: enable_events / debounce / watch_keys / commands arriving
// as a string/number instead of a table → unguarded pairs()/ipairs() threw out of
// the QueryServer callback → game crash. (Backend DOWN is the separate #17 case,
// covered by http-drain.test.ts.)
//
// Runs the REAL http.lua under fengari. Expected to FAIL before the guard fix is in
// place (the harness throws on the first unguarded crash), pass after.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

const HARNESS = readFileSync(join(import.meta.dir, '__lua__', 'http-malformed-harness.lua'), 'utf8')

describe('mod http.lua — malformed backend response resilience', () => {
  it('survives wrong-typed response fields without crashing, still processes valid bodies', () => {
    const result = runLuaHarness({ modules: { HTTP: modSource('http.lua') }, harness: HARNESS })
    expect(result).toBe('OK')
  })
})
