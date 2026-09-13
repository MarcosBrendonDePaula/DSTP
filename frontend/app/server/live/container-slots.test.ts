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

describe('mod container_slots.lua — runtime pool cap (entity_set_slots past the netvar pool crashed)', () => {
  it('ReservePool raises containers.MAXITEMSLOTS to MAX_SLOTS (never lowers); ApplyToInstance refuses bigger as too_big', () => {
    const result = runLuaHarness({
      modules: { CONTAINER_SLOTS: modSource('container_slots.lua') },
      harness: `
        local CS = KIT.load(MOD_CONTAINER_SLOTS, "container_slots.lua")
        local c = { MAXITEMSLOTS = 15 }
        if CS.ReservePool(c) ~= 36 or c.MAXITEMSLOTS ~= 36 then return "FAIL: pool not reserved " .. tostring(c.MAXITEMSLOTS) end
        local big = { MAXITEMSLOTS = 50 }
        CS.ReservePool(big)
        if big.MAXITEMSLOTS ~= 50 then return "FAIL: lowered the pool" end
        local params = { chester = { widget = { slotpos = { {x=0,y=0,z=0} } } } }
        local applied = nil
        local inst = { prefab = "chester", components = { container = { numslots = 9, WidgetSetup = function(self, p, d) applied = #d.widget.slotpos end } } }
        local ok, why = CS.ApplyToInstance(inst, 37, params, nil, true)
        if ok or why ~= "too_big" or applied then return "FAIL: 37 accepted (" .. tostring(why) .. ")" end
        ok = CS.ApplyToInstance(inst, 36, params, nil, true)
        if not ok or applied ~= 36 then return "FAIL: 36 refused" end
        return "OK"`,
    })
    expect(result).toBe('OK')
  })
})
