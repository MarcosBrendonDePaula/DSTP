// Regression test for the SafeSpawn guard (commands.lua): a non-spawnable prefab
// (a Prefabs entry with no .fn — placeholder/skin/dep) must NOT reach _G.SpawnPrefab,
// because doing so raises an UNCATCHABLE engine LUA ERROR that crashes the master sim.
// This is the crash hit when prefab autocomplete offered `backpack_bat`. Runs the real
// core.lua + commands.lua under fengari with a controlled Prefabs table.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

const LUA = (n: string) => readFileSync(join(import.meta.dir, '__lua__', n), 'utf8')

describe('mod commands.lua — SafeSpawn rejects non-spawnable prefabs (crash guard)', () => {
  it('only prefabs with a constructor fn reach SpawnPrefab; placeholders are skipped', () => {
    const result = runLuaHarness({
      modules: { CORE: modSource('core.lua'), COMMANDS: modSource('commands.lua') },
      harness: LUA('safespawn-harness.lua'),
    })
    expect(result).toBe('OK')
  })
})
