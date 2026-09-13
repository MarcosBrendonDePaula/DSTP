// container_slots.lua — bigger containers as load-time data. REAL module under fengari.
//
// Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runLuaHarness, modSource } from './mod-test-kit'

describe('mod container_slots.lua — grid layout and growing containers.params', () => {
  it('vanilla 3x3 reproduced, bigger grids centred, Apply only grows', () => {
    const result = runLuaHarness({
      modules: { CONTAINER_SLOTS: modSource('container_slots.lua') },
      harness: readFileSync(join(import.meta.dir, '__lua__', 'container-slots-harness.lua'), 'utf8'),
    })
    expect(result).toBe('OK')
  })
})
