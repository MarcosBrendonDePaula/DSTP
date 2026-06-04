-- DSTP Events / weather — world-scoped weather listeners (storm + precipitation).
-- Extracted from events.lua verbatim. Registered via M.RegisterWorld(inst) by the
-- events facade. Gates on core.evt_config.weather; emits via core.PushEvent (DSTP proxy).

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
    inst:ListenForEvent("ms_stormchanged", function(world, data)
        if not evt_config.weather then return end
        DSTP.PushEvent("storm_changed", {
            stormtype = data and data.stormtype or "unknown",
            setting = data and data.setting,
        }, data)
    end)

    -- Precipitation. Listen to the REAL `precipitationchanged` (weather.lua:778
    -- pushes it with the precip-type name — "none"/"rain"/"snow" — when rain
    -- naturally starts/stops), not the `ms_forceprecipitation` COMMAND event.
    inst:ListenForEvent("precipitationchanged", function(world, ptype)
        if not evt_config.weather then return end
        DSTP.PushEvent("precipitation", {
            type = ptype,
            enabled = ptype ~= nil and ptype ~= "none",
        }, ptype)
    end)
end

return M
