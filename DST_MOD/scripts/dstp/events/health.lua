-- DSTP Events / health — per-player health/hunger/sanity delta listeners.
-- Extracted from events.lua verbatim. Registered via M.RegisterForPlayer(player,uid,
-- pname) by the events facade. Gates on core.evt_config.health; emits via DSTP proxy.

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

function M.RegisterForPlayer(player, uid, pname)
    player:ListenForEvent("healthdelta", function(inst, data)
        if not evt_config.health then return end
        DSTP.PushEvent("health_delta", {
            userid = uid, name = pname,
            old = data and data.oldpercent or 0,
            new = data and data.newpercent or 0,
            amount = data and data.amount or 0,
            cause = data and (type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab)) or nil,
            afflicter = data and data.afflicter and data.afflicter.prefab or nil,
        }, data)
    end)

    player:ListenForEvent("hungerdelta", function(inst, data)
        if not evt_config.health then return end
        DSTP.PushEvent("hunger_delta", {
            userid = uid, name = pname,
            old = data and data.oldpercent or 0,
            new = data and data.newpercent or 0,
            amount = data and data.amount or 0,
        }, data)
    end)

    player:ListenForEvent("sanitydelta", function(inst, data)
        if not evt_config.health then return end
        DSTP.PushEvent("sanity_delta", {
            userid = uid, name = pname,
            old = data and data.oldpercent or 0,
            new = data and data.newpercent or 0,
            amount = data and data.amount or 0,
        }, data)
    end)
end

return M
