// Behavioral test for the CLIENT-side keys.lua combo detection (key_pressed +
// key_combo's 3 modes). Runs the REAL keys.lua under fengari with a fake _G
// (KEY_* constants + a controllable TheInput) and drives OnRawKey via the handler
// keys.lua registers. The mouse world pos, the 3 modes, sequence timeout, and
// auto-repeat dedupe are all asserted in the harness.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'
import { TRIGGER_EVENTS } from '../../shared/automation/nodes/triggers/game/trigger/ui'

const LUA = (n: string) => readFileSync(join(import.meta.dir, '__lua__', n), 'utf8')

describe('mod keys.lua — key_pressed + key_combo (3 modes) detection', () => {
  it('fires bare key_pressed, simultaneous, sequence (+ timeout), any, and dedupes', () => {
    const result = runLuaHarness({
      modules: { KEYS: modSource('keys.lua') },
      harness: LUA('keys-combo-harness.lua'),
    })
    expect(result).toBe('OK')
  })
})

describe('key_combo trigger is registered in the catalog (structural)', () => {
  it('key_combo is an offerable trigger event', () => {
    expect(TRIGGER_EVENTS.some(e => e.value === 'key_combo')).toBe(true)
  })
})
