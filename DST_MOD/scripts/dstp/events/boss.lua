-- DSTP Events / boss — world-scoped boss + notable-mob death + fire-register.
-- Extracted from events.lua verbatim. Registered via M.RegisterWorld(inst) by the
-- events facade. Gates on core.evt_config.bosses; emits via core.PushEvent (DSTP proxy).

local M = {}

local core, evt_config, DSTP

function M.Init(c)
    core = c
    evt_config = c.evt_config
    DSTP = setmetatable({}, { __index = function(_, k)
        if k == "PushEvent" then return core.PushEvent end
        if k == "_DEBUG" then return core.DEBUG end
        return nil
    end })
    return M
end

function M.RegisterWorld(inst)
    local boss_events = {
        "ms_moonboss_was_defeated",
        "ms_lordfruitflykilled",
    }
    for _, evt in ipairs(boss_events) do
        inst:ListenForEvent(evt, function(world, data)
            if not evt_config.bosses then return end
            DSTP.PushEvent("boss_event", { event = evt, data = data }, data)
        end)
    end

    -- entity_death (notable-mob death) is now dispatched centrally by the facade via
    -- M.OnEntityDeath (single world listener fanned out) — see events.lua.

    -- Toadstool (mushroom boss) spawner state machine changed
    -- ("toadstoolstatechanged", toadstoolspawner.lua:70; data = { spawner, state }).
    -- The closest thing to "a boss is now spawnable" — no generic boss-spawn event
    -- exists (giants are SpawnPrefab'd with no PushEvent). state is a number/enum.
    inst:ListenForEvent("toadstoolstatechanged", function(world, data)
        if not evt_config.bosses then return end
        DSTP.PushEvent("toadstool_state_changed", {
            state = data and tostring(data.state) or "unknown",
        }, data)
    end)

    -- NOTE: ms_registerfire was REMOVED. It is NOT a real fire-START event — burnable.lua
    -- fires `onignite` per-burnable (burnable.lua:375), never an `ms_registerfire` on the
    -- world, so this listener was dead (never fired). A genuine "fire started" detector
    -- would need an AddComponentPostInit on `burnable` (a mechanic module), out of scope
    -- here. structure_burnt (grief_world.lua) already covers burnt structures on death.
end

-- Central entity_death dispatch (called by the facade's single listener). Notable-mob kill.
local NOTABLE = {
    deerclops = true, bearger = true, moose = true, dragonfly = true,
    antlion = true, beequeen = true, klaus = true, toadstool = true,
    minotaur = true, stalker_atrium = true, alterguardian_phase3 = true,
    crabking = true, malbatross = true, lordfruitfly = true,
    shadowchesspieces = true, nightmare_werepig = true,
}
function M.OnEntityDeath(world, data)
    if not evt_config.bosses then return end
    if data and data.inst and not data.inst:HasTag("player") then
        local prefab = data.inst.prefab
        if NOTABLE[prefab] then
            DSTP.PushEvent("boss_killed", {
                prefab = prefab,
                cause = type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab) or "unknown",
            }, data)
        end
    end
end

return M
