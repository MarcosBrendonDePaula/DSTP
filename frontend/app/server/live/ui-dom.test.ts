// Micro-DOM (task 10): dom_append / dom_remove / dom_set / dom_toggle on a live tree —
// the REAL ui_widgets.lua under fengari. See __lua__/ui-dom-harness.lua.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod ui_widgets.lua — micro-DOM commands mutate the definition and rebuild in place', () => {
  it('append/remove rebuild, set/toggle patch + persist, placement survives', () => {
    const result = runLuaHarness({
      modules: { UI: modSource('ui_widgets.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'ui-dom-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
