// rules_engine reacts to `entity_event` (dispatched by the data-feed client half) as a
// synthetic event: no DST listener, conditions on event.kind, templates from the
// payload. Runs the REAL rules_engine.lua under fengari.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod rules_engine.lua — entity_event rules (client-side reaction to entity events)', () => {
  it('synthetic install, kind condition, payload templates', () => {
    const result = runLuaHarness({
      modules: { RULES: modSource('rules_engine.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'rules-entity-event-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
