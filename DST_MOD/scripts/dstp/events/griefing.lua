-- DSTP Events / griefing — per-player anti-grief listeners: container open/close +
-- structure hammer. Extracted from events.lua verbatim. Registered via
-- M.RegisterForPlayer(player,uid,pname) by the events facade. Gates on
-- core.evt_config.griefing; emits via DSTP proxy. (Distinct from grief_world.lua,
-- which handles the WORLD-scoped structure_burnt detection.)

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
    player:ListenForEvent("onopencontainer", function(inst, data)
        if not evt_config.griefing then return end
        local c = data and data.container
        DSTP.PushEvent("container_opened", {
            userid = uid, name = pname,
            container_prefab = c and c.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("onclosecontainer", function(inst, data)
        if not evt_config.griefing then return end
        local c = data and data.container
        DSTP.PushEvent("container_closed", {
            userid = uid, name = pname,
            container_prefab = c and c.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("onhammer", function(inst, data)
        if not evt_config.griefing then return end
        local target = data and data.target
        if not target then return end
        DSTP.PushEvent("structure_hammered", {
            userid = uid, name = pname,
            prefab = target.prefab or "unknown",
        }, data)
    end)
end

return M
