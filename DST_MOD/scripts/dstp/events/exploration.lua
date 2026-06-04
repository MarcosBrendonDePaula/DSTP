-- DSTP Events / exploration — per-player movement/exploration listeners. NOTE: the
-- wormhole pair (onwenthome/onleftplayer) was in a "world interactions" block and
-- gates on evt_config.WORLD (kept verbatim); the rest (sink/fishing/boat) gate on
-- evt_config.EXPLORATION. Extracted from events.lua verbatim. Registered via
-- M.RegisterForPlayer(player,uid,pname) by the events facade. Emits via DSTP proxy.

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
    -- world interactions
    -- Player entered a wormhole
    player:ListenForEvent("onwenthome", function(inst)
        if not evt_config.world then return end
        DSTP.PushEvent("player_teleported", {
            userid = uid, name = pname,
            type = "wormhole_enter",
        })
    end)

    -- Player left a wormhole / teleport
    player:ListenForEvent("onleftplayer", function(inst)
        if not evt_config.world then return end
        DSTP.PushEvent("player_teleported", {
            userid = uid, name = pname,
            type = "wormhole_exit",
        })
    end)

    -- exploration
    player:ListenForEvent("onsink", function(inst, data)
        if not evt_config.exploration then return end
        local x, _, z = 0, 0, 0
        if inst.Transform then x, _, z = inst.Transform:GetWorldPosition() end
        DSTP.PushEvent("player_sunk", {
            userid = uid, name = pname,
            x = math.floor(x), z = math.floor(z),
        }, data)
    end)

    player:ListenForEvent("fishingcollect", function(inst, data)
        if not evt_config.exploration then return end
        local fish = data and data.fish
        DSTP.PushEvent("fish_caught", {
            userid = uid, name = pname,
            fish = fish and fish.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("onboat", function(inst)
        if not evt_config.exploration then return end
        DSTP.PushEvent("boat_entered", { userid = uid, name = pname })
    end)

    player:ListenForEvent("onboatoff", function(inst)
        if not evt_config.exploration then return end
        DSTP.PushEvent("boat_exited", { userid = uid, name = pname })
    end)
end

return M
