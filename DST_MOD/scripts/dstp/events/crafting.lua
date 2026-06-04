-- DSTP Events / crafting — per-player crafting listeners: builditem / buildstructure.
-- Extracted from events.lua verbatim. Registered via M.RegisterForPlayer(player,uid,
-- pname) by the events facade. Gates on core.evt_config.crafting; emits via DSTP proxy.

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
    player:ListenForEvent("builditem", function(inst, data)
        if not evt_config.crafting then return end
        DSTP.PushEvent("player_craft", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
            recipe = data and data.recipe and data.recipe.name or "unknown",
        }, data)
    end)

    player:ListenForEvent("buildstructure", function(inst, data)
        if not evt_config.crafting then return end
        DSTP.PushEvent("player_build", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
            recipe = data and data.recipe and data.recipe.name or "unknown",
        }, data)
    end)
end

return M
