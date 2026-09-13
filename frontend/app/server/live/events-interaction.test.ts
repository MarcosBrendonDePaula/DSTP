// events/interaction.lua — REAL module under fengari. See __lua__/events-interaction-harness.lua.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod events/interaction.lua — player_action / player_action_failed', () => {
  it('describes every BufferedAction with the server guid, drops ground WALKTO, gates on the category', () => {
    const result = runLuaHarness({
      modules: { INTERACTION: modSource('events/interaction.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'events-interaction-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
