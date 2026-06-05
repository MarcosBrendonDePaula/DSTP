// Behavioral test for the #17 fix in DST_MOD/scripts/dstp/http.lua: the mod must
// drain its event queue ONLY after a confirmed /dst/sync POST, and HOLD events for
// retry when the POST fails (backend down) — no silent loss.
//
// Runs the REAL http.lua under fengari via the shared mod test kit. The assertions
// live in a Lua harness (__lua__/http-drain-harness.lua) that drives Http.Start,
// fires success/failure QueryServer callbacks, and inspects the queue.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

const HARNESS = readFileSync(join(import.meta.dir, '__lua__', 'http-drain-harness.lua'), 'utf8')

describe('mod http.lua — event queue drain/retry (#17)', () => {
  it('drains only after a confirmed POST, holds events on failure, drains by identity', () => {
    const result = runLuaHarness({ modules: { HTTP: modSource('http.lua') }, harness: HARNESS })
    // The harness returns "OK" or "FAIL: <semicolon-joined failed checks>".
    expect(result).toBe('OK')
  })
})
