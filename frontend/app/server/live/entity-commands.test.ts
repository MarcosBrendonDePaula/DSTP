// Behavioral + structural tests for the entity-control commands (#57-59): the
// foundational GUID/pos resolver, get_entity's per-component read object, the
// spawn-returns-GUID change, and the state mutators (set_health/kill/extinguish/
// set_fuel/freeze/unfreeze). Runs the REAL core.lua + commands.lua under fengari with
// mocked _G.Ents + TheSim:FindEntities, plus a catalog↔command consistency net.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'
import { TRIGGER_EVENTS } from '../../shared/automation/nodes/triggers/game/trigger/ui'
import { ACTION_TYPES } from '../../client/src/automation/nodes/actions/actionTypes'

const LUA = (n: string) => readFileSync(join(import.meta.dir, '__lua__', n), 'utf8')
const commandsSrc = modSource('commands.lua')

describe('mod commands.lua — entity-control commands behave (#57-59)', () => {
  it('resolver keys by GUID/pos, get_entity emits per-component blocks, mutators fire the right method', () => {
    const result = runLuaHarness({
      modules: { CORE: modSource('core.lua'), COMMANDS: commandsSrc },
      harness: LUA('entity-commands-harness.lua'),
    })
    expect(result).toBe('OK')
  })
})

describe('mod commands.lua — entity commands registered + resolver shape (structural)', () => {
  it('every entity_* command + get_entity is registered', () => {
    for (const cmd of [
      'get_entity', 'entity_set_health', 'entity_kill', 'entity_extinguish',
      'entity_ignite', 'entity_set_fuel', 'entity_freeze', 'entity_unfreeze',
    ]) {
      expect(commandsSrc).toContain(`RegisterCommand("${cmd}"`)
    }
  })
  it('the resolver uses Ents[guid] AND the IsValid guard (no stale-GUID crash)', () => {
    expect(commandsSrc).toContain('_G.Ents[guid]')
    expect(commandsSrc).toContain('inst:IsValid()')
    expect(commandsSrc).toContain('TheSim:FindEntities')
  })
  it('entity_freeze uses AddColdness (the safe path) per the spec correction', () => {
    // The entity_freeze command body must use AddColdness, not raw Freeze. (The legacy
    // player-side `freeze` command still uses freezable:Freeze — that's a different
    // handler, so we scope the assertion to the entity_freeze registration block.)
    const block = commandsSrc.slice(commandsSrc.indexOf('RegisterCommand("entity_freeze"'))
      .slice(0, 400)
    expect(block).toContain('freezable:AddColdness')
    expect(block).not.toContain('freezable:Freeze(')
  })
  it('spawn reports the GUID back via spawn_result', () => {
    expect(commandsSrc).toContain('"spawn_result"')
    expect(commandsSrc).toContain('ent.GUID')
  })
})

describe('entity actions ↔ result-event catalog wiring', () => {
  const actionValues = new Set(ACTION_TYPES.map(a => a.value))
  const eventValues = new Set(TRIGGER_EVENTS.map(e => e.value))

  it('the entity actions are in the ACTION_TYPES catalog', () => {
    for (const a of [
      'get_entity', 'entity_set_health', 'entity_kill', 'entity_extinguish',
      'entity_ignite', 'entity_set_fuel', 'entity_freeze', 'entity_unfreeze',
    ]) {
      expect(actionValues.has(a)).toBe(true)
    }
  })

  it('the result events (spawn_result, entity_data) are triggerable', () => {
    expect(eventValues.has('spawn_result')).toBe(true)
    expect(eventValues.has('entity_data')).toBe(true)
  })

  it('every entity action exposes both keying paths (guid + prefab/x/z)', () => {
    for (const a of ACTION_TYPES) {
      if (!a.value.startsWith('entity_') && a.value !== 'get_entity') continue
      const keys = new Set(a.params.map((p: any) => p.key))
      expect(keys.has('guid')).toBe(true)
      expect(keys.has('prefab')).toBe(true)
      expect(keys.has('x')).toBe(true)
      expect(keys.has('z')).toBe(true)
    }
  })
})
