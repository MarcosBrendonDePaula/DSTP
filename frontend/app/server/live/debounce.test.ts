// Behavioral test for the #2 fix in DST_MOD/scripts/dstp/core.lua: per-player
// debounce. health/hunger/sanity_delta are debounced 1s; the key must include the
// player's userid so player B's delta isn't dropped just because player A's was
// within the window. World/global events (no userid) keep the plain per-type key.
//
// Runs the REAL core.lua under fengari via the mod test kit. Run under `bun test`.
import { describe, it, expect } from 'bun:test'
import { runLuaHarness, modSource } from './mod-test-kit'

// Drives core.PushEvent with two players + the same event type and inspects the
// resulting event queue. KIT provides the controllable clock (KIT.now/advance).
const HARNESS = `
local Core = KIT.load(MOD_CORE, "core.lua")
Core.Init(KIT.make_G(), KIT.fake_json, { server_id = "s", shard_id = "s:master",
  shard_type = "master", max_batch_size = 50, debug_logs = false })

local C = KIT.new_checker()
local function qlen() return #Core.state.event_queue end
-- last_event_time is a module local we can't reset between cases, so each scenario
-- jumps the clock far past every debounce window (max 5s) to start fresh.
local function fresh() KIT.advance(100); Core.state.event_queue = {} end

-- health_delta is debounced 1s (Core.event_debounce default).
-- ── Two players in the SAME window must BOTH get through (the #2 fix) ──
fresh()
Core.PushEvent("health_delta", { userid = "A", name = "A" })
Core.PushEvent("health_delta", { userid = "B", name = "B" })  -- same instant
C.check("both players pass in same window", qlen() == 2)

-- ── Same player twice in the window: second is debounced away ──
fresh()
Core.PushEvent("health_delta", { userid = "A" })
Core.PushEvent("health_delta", { userid = "A" })  -- within 1s → dropped
C.check("same player debounced within window", qlen() == 1)

-- ── After the window elapses, same player passes again ──
fresh()
Core.PushEvent("health_delta", { userid = "A" })
KIT.advance(1.5)
Core.PushEvent("health_delta", { userid = "A" })
C.check("same player passes after window", qlen() == 2)

-- ── A debounce on player A must NOT block a DIFFERENT type for A ──
fresh()
Core.PushEvent("health_delta", { userid = "A" })
Core.PushEvent("hunger_delta", { userid = "A" })  -- different type, same instant
C.check("different types are independent", qlen() == 2)

-- ── World/global event (no userid) keeps the plain per-type debounce ──
fresh()
Core.PushEvent("season_changed", { season = "winter" })   -- debounced 5s
Core.PushEvent("season_changed", { season = "spring" })   -- within 5s → dropped
C.check("global event debounced by type", qlen() == 1)

-- ── Non-debounced event type is never dropped ──
fresh()
Core.PushEvent("player_death", { userid = "A" })
Core.PushEvent("player_death", { userid = "A" })
C.check("non-debounced type always passes", qlen() == 2)

return C.report()
`

describe('mod core.lua — per-player debounce (#2)', () => {
  it('debounces per (type,userid): two players never mask each other, same player still throttled', () => {
    const result = runLuaHarness({ modules: { CORE: modSource('core.lua') }, harness: HARNESS })
    expect(result).toBe('OK')
  })
})
