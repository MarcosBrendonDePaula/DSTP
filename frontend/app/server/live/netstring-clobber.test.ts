// Behavioral tests for the #3 fix (net_string _dstp_ui clobber). Two angles, both
// running REAL mod Lua under fengari via the mod test kit:
//
//  1) SERVER (core.lua Core.ProcessCommands): coalesces ALL six _dstp_ui-writing
//     families per player into ONE batch envelope (broadcasts expanded per-player via
//     _G.AllPlayers), stamped with a monotonic per-player seq, set ONCE per player.
//  2) CLIENT routing (rules_engine.lua real + a UIWidgets stub): a batch envelope is
//     deduped once by seq, then each sub fans out by its own prefix to the right side.
//
// Plus a structural pin: modmain.lua must contain the batch-aware router (so the
// routing harness, which mirrors that logic, can't silently drift from the real code)
// and ui_widgets.lua must NOT still fan out 'batch' (no double-processing).
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

const LUA = (n: string) => readFileSync(join(import.meta.dir, '__lua__', n), 'utf8')

describe('mod core.lua — coalesce all _dstp_ui commands per player (#3)', () => {
  it('mixed/broadcast/ordering/seq: one batch envelope per player, nothing clobbered', () => {
    const result = runLuaHarness({
      modules: { CORE: modSource('core.lua') },
      harness: LUA('netstring-coalesce-harness.lua'),
    })
    expect(result).toBe('OK')
  })
})

describe('mod client routing — batch-aware fan-out + envelope dedup (#3)', () => {
  it('routes each sub by prefix, dedups the envelope by seq, rules_engine handles batch', () => {
    const result = runLuaHarness({
      modules: { RULES: modSource('rules_engine.lua') },
      harness: LUA('netstring-routing-harness.lua'),
    })
    expect(result).toBe('OK')
  })
})

describe('mod #3 — structural guards (router present, no double fan-out)', () => {
  const modmain = readFileSync(join(import.meta.dir, '..', '..', '..', '..', 'DST_MOD', 'modmain.lua'), 'utf8')
  const uiWidgets = modSource('ui_widgets.lua')

  it('modmain fans out a batch envelope (iterates cmd.commands and dispatches each)', () => {
    // The router must branch on action=="batch" and iterate sub-commands.
    expect(modmain).toContain('cmd.action == "batch"')
    expect(modmain).toContain('for _, sub in ipairs(cmd.commands) do dispatch(sub) end')
  })

  it('modmain dedups the envelope by seq', () => {
    expect(modmain).toContain('cmd.seq <= _dstp_ui_seq')
  })

  it('modmain routes each command by its own rules_/state_ prefix', () => {
    expect(modmain).toContain('a:sub(1, 6) == "rules_" or a:sub(1, 6) == "state_"')
  })

  it('ui_widgets no longer fans out "batch" itself (prevents double-processing)', () => {
    // The old internal fan-out (elseif cmd.action == "batch" then ... ProcessCommand)
    // must be gone — modmain owns fan-out now.
    expect(uiWidgets).not.toContain('elseif cmd.action == "batch" then')
  })
})
