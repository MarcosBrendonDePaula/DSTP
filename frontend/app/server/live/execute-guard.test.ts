// Behavioral tests for the #4 fix (execute/call_component can freeze the master sim
// with an infinite loop; execute is admin RCE). Both run REAL mod Lua under fengari:
//
//  1) Core.RunGuarded — the instruction-budget watchdog: normal code runs, an
//     infinite loop is ABORTED (not hung), the env is NOT sandboxed (capability
//     preserved), and it falls back to plain pcall when debug.sethook is absent.
//  2) The ALLOW_EXECUTE gate on the `execute` command: ON (default) runs the Lua,
//     OFF makes it a no-op kill switch, and an infinite-loop execute is aborted.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

const LUA = (n: string) => readFileSync(join(import.meta.dir, '__lua__', n), 'utf8')

describe('mod core.lua — RunGuarded instruction-budget watchdog (#4)', () => {
  it('runs normal code, aborts infinite loops, keeps full _G, falls back without sethook', () => {
    const result = runLuaHarness({
      modules: { CORE: modSource('core.lua') },
      harness: LUA('run-guarded-harness.lua'),
    })
    expect(result).toBe('OK')
  })
})

describe('mod commands.lua — ALLOW_EXECUTE gate on execute (#4)', () => {
  it('ON (default) runs Lua, OFF is a kill switch, infinite-loop execute is aborted', () => {
    const result = runLuaHarness({
      modules: { CORE: modSource('core.lua'), COMMANDS: modSource('commands.lua') },
      harness: LUA('execute-gate-harness.lua'),
    })
    expect(result).toBe('OK')
  })
})

describe('mod #4 — modinfo flag present and defaults ON', () => {
  const modinfo = readFileSync(join(import.meta.dir, '..', '..', '..', '..', 'DST_MOD', 'modinfo.lua'), 'utf8')
  it('ALLOW_EXECUTE option exists with default = true', () => {
    expect(modinfo).toContain('ALLOW_EXECUTE')
    // the option block ends with default = true
    expect(modinfo).toMatch(/name = "ALLOW_EXECUTE"[\s\S]*?default = true/)
  })
})
