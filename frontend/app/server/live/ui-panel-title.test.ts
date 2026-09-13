// Panel title strip — REAL ui_widgets.lua under fengari. See __lua__/ui-panel-title-harness.lua.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod ui_widgets.lua — a panel title reserves a top strip (no overlap with the content)', () => {
  it('fixed wallet grows for the strip; auto panel draws its title; no title = nothing reserved', () => {
    const result = runLuaHarness({
      modules: { UI: modSource('ui_widgets.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'ui-panel-title-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
