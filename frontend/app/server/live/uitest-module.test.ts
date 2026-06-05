// Meta-test for the in-game UI smoke test (DST_MOD/scripts/dstp/uitest.lua). #uitest
// lets an admin spawn one of each widget on their HUD to visually verify the renderer
// + click fix (#16). This runs that REAL module under fengari (with real core.lua) so
// the command wiring, the click tap, and the clear path are verified before anyone
// runs it in-game. The actual VISUAL/click validation is necessarily in-game.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { runLuaHarness, modSource } from './mod-test-kit'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('mod uitest.lua — in-game UI smoke test wiring is correct', () => {
  it('creates the 8 widgets, taps uitest: clicks (only those), and clears the group', () => {
    const result = runLuaHarness({
      modules: { CORE: modSource('core.lua'), UITEST: modSource('uitest.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'uitest-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
