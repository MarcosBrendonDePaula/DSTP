// Meta-test for the in-game self-test module (DST_MOD/scripts/dstp/selftest.lua).
// #selftest lets an admin run engine-side assertions in the live master sim; this
// test runs that REAL module under fengari (against real core.lua + commands.lua) so
// a false failure / state leak is caught HERE, before anyone runs it in-game.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { runLuaHarness, modSource } from './mod-test-kit'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('mod selftest.lua — in-game self-test is correct and side-effect-free', () => {
  it('all cases pass and the mutated core state is restored', () => {
    const result = runLuaHarness({
      modules: {
        CORE: modSource('core.lua'),
        COMMANDS: modSource('commands.lua'),
        SELFTEST: modSource('selftest.lua'),
      },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'selftest-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })

  // The entity-control case (#57-59) skips when there's no engine (the harness above).
  // This one injects a fake engine (SpawnPrefab + Ents + components) so the case runs
  // its REAL assertions + cleanup — proving the in-game path is correct before anyone
  // types #selftest on a live server.
  it('the entity-control case passes on a live (faked-engine) path and cleans up', () => {
    const result = runLuaHarness({
      modules: {
        CORE: modSource('core.lua'),
        COMMANDS: modSource('commands.lua'),
        SELFTEST: modSource('selftest.lua'),
      },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'selftest-entity-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
