// Hover as a local rule event (task 7) — REAL ui_widgets.lua + rules_engine.lua under
// fengari. See __lua__/ui-hover-harness.lua and __lua__/rules-hover-harness.lua.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('ui_hover — hit targets report focus in/out, rules react client-side', () => {
  it('ui_widgets: overlay/button OnGainFocus/OnLoseFocus → hover handler', () => {
    const result = runLuaHarness({
      modules: { UI: modSource('ui_widgets.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'ui-hover-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
  it('rules_engine: ui_hover is a synthetic event rules can condition on', () => {
    const result = runLuaHarness({
      modules: { RULES: modSource('rules_engine.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'rules-hover-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
