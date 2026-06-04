-- DSTP Events / world — world-scoped day/phase/season/moon/earthquake/sinkhole/
-- save/hound/rift listeners (was RegisterWorldEvents). Extracted from events.lua verbatim.
-- Registered via M.RegisterWorld(inst) by the events facade. Note: a few bodies here
-- gate on OTHER categories (lightning -> weather, hounds -> bosses) — kept as-is to
-- match the original file structure. Needs config (shard_type). DSTP proxy for PushEvent.

local M = {}

local core, evt_config, config, DSTP

function M.Init(c)
    core = c
    evt_config = c.evt_config
    config = c.config
    DSTP = setmetatable({}, { __index = function(_, k)
        if k == "PushEvent" then return core.PushEvent end
        if k == "_DEBUG" then return core.DEBUG end
        return nil
    end })
    return M
end

function M.RegisterWorld(inst)
    inst:ListenForEvent("ms_cyclecomplete", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("new_day", { day = world.state.cycles }, world)
    end)

    -- Day phase (day/dusk/night). Listen to the REAL notification `phasechanged`
    -- (clock.lua:396 pushes it with the phase name on a NATURAL transition), not the
    -- `ms_nextphase` COMMAND event — that only fires when the phase is forced, so
    -- natural day/dusk/night cycling was being missed.
    inst:ListenForEvent("phasechanged", function(world, phase)
        if not evt_config.world then return end
        DSTP.PushEvent("phase_changed", { phase = phase or world.state.phase }, world)
    end)

    -- Season. `seasontick` fires every tick with the current season name; emit
    -- season_changed only when it actually CHANGES (compare to the last one we saw,
    -- mirroring the moonphase pattern). `ms_setseason` was the force-command, so
    -- natural season rollover never fired.
    inst:ListenForEvent("seasontick", function(world, data)
        if not evt_config.world then return end
        local season = (data and data.season) or (world.state and world.state.season)
        if season and inst._dstp_last_season ~= season then
            inst._dstp_last_season = season
            DSTP.PushEvent("season_changed", { season = tostring(season) }, data)
        end
    end)

    inst:ListenForEvent("ms_sendlightningstrike", function(world, pt)
        if not evt_config.weather then return end
        DSTP.PushEvent("lightning_strike", {
            x = pt and pt.x and math.floor(pt.x) or 0,
            z = pt and pt.z and math.floor(pt.z) or 0,
        }, pt)
    end)

    -- Moon phase changed (fires when phase actually changes naturally)
    -- Also listen to ms_setmoonphase for manual/console changes
    local function OnMoonPhase(world, data)
        if not evt_config.world then return end
        local phase = (data and data.moonphase)
            or (data and type(data) == "string" and data)
            or (world.state and world.state.moonphase)
            or "unknown"
        DSTP.PushEvent("moon_phase_changed", {
            phase = tostring(phase),
            is_new = tostring(phase) == "new",
            is_full = tostring(phase) == "full",
        }, data)
    end
    inst:ListenForEvent("moonphasechanged", OnMoonPhase)
    inst:ListenForEvent("ms_setmoonphase", OnMoonPhase)
    -- Fallback: also listen to nightmarephase (triggered each phase transition)
    inst:ListenForEvent("phasechanged", function(world, phase)
        -- Check if moon phase actually changed
        if not evt_config.world then return end
        if world.state and world.state.moonphase and inst._last_moonphase ~= world.state.moonphase then
            local prev = inst._last_moonphase
            inst._last_moonphase = world.state.moonphase
            if prev ~= nil then
                DSTP.PushEvent("moon_phase_changed", {
                    phase = tostring(world.state.moonphase),
                    is_new = tostring(world.state.moonphase) == "new",
                    is_full = tostring(world.state.moonphase) == "full",
                })
            end
        end
    end)

    -- Earthquake started (caves only typically)
    inst:ListenForEvent("ms_earthquake", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("earthquake", {
            shard_type = config.shard_type,
        })
    end)

    -- Sinkhole warning
    inst:ListenForEvent("ms_sinkhole_warn", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("sinkhole_warn", {
            shard_type = config.shard_type,
        })
    end)

    -- World save triggered
    inst:ListenForEvent("ms_save", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("world_save", {})
    end)

    -- Hound attack warning (houndwarningsound fires when hounds are about to attack)
    -- This is on the hounded component of TheWorld
    inst:ListenForEvent("houndwarningsound", function(world)
        if not evt_config.bosses then return end
        DSTP.PushEvent("hound_warning", {
            shard_type = config.shard_type,
        })
    end)

    -- Hound attack begins (when hounds actually spawn)
    inst:ListenForEvent("ms_houndattack", function(world)
        if not evt_config.bosses then return end
        DSTP.PushEvent("hound_attack", {
            shard_type = config.shard_type,
        })
    end)

    -- A lunar/shadow rift opened ("ms_riftaddedtopool", riftspawner.lua:85;
    -- data.rift = the rift portal entity). Major late-game world event.
    inst:ListenForEvent("ms_riftaddedtopool", function(world, data)
        if not evt_config.world then return end
        local rift = data and data.rift
        local x, _, z = 0, 0, 0
        if rift and rift.Transform then x, _, z = rift.Transform:GetWorldPosition() end
        DSTP.PushEvent("rift_spawned", {
            rift_prefab = rift and rift.prefab or "unknown",
            x = math.floor(x), z = math.floor(z),
            shard_type = config.shard_type,
        }, data)
    end)
end

return M
