// ui_track (follow) rules, run against the REAL ui_widgets.lua under fengari:
// mode=all (one follower per entity in range), per-entity template with local `bind`
// props evaluated every frame, require_hp, and the legacy single-target bar hiding
// when the entity has no HP data. See __lua__/ui-track-harness.lua.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod ui_widgets.lua — ui_track follow: mode=all, template bindings, HP gating', () => {
  it('followers per entity, bound props tracked per frame, hidden bars without HP', () => {
    const result = runLuaHarness({
      modules: { UI: modSource('ui_widgets.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'ui-track-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
