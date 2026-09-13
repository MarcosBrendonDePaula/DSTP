// overflow:scroll (task 8) — REAL ui_widgets.lua under fengari with a recording
// TrueScrollArea mock. See __lua__/ui-scroll-harness.lua.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod ui_widgets.lua — overflow:scroll renders through TrueScrollArea', () => {
  it('taller content → scissored viewport; fitting / no-height → plain container', () => {
    const result = runLuaHarness({
      modules: { UI: modSource('ui_widgets.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'ui-scroll-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
