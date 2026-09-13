// rules_engine dom_* actions (task 10) — the REAL rules_engine.lua under fengari.
// See __lua__/rules-dom-harness.lua.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod rules_engine.lua — dom_* rule actions reach UIWidgets with resolved templates', () => {
  it('dom_append / dom_set / dom_toggle / dom_remove', () => {
    const result = runLuaHarness({
      modules: { RULES: modSource('rules_engine.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'rules-dom-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
