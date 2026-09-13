// Flow-driven mob brain — REAL flow_brain.lua + core.lua + commands.lua under fengari.
// See __lua__/flow-brain-harness.lua. The Klei BT file (brains/dstp_flowbrain.lua) needs
// the engine and is covered by the Lua syntax check + in-game.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod flow_brain.lua — spec normalisation, target decisions, brain swap/restore, commands', () => {
  it('runs the harness', () => {
    const result = runLuaHarness({
      modules: { CORE: modSource('core.lua'), COMMANDS: modSource('commands.lua'), FLOW_BRAIN: modSource('flow_brain.lua'), FLOWBRAIN_COMP: modSource('../components/dstp_flowbrain.lua'), ENTITY_IDS: modSource('entity_ids.lua'), DSTP_ID_COMP: modSource('../components/dstp_id.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'flow-brain-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
