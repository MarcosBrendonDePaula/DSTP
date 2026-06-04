-- DSTP Events / crafting — per-player crafting listeners: builditem / buildstructure +
-- unlockrecipe (new craftable learned) + techtreechange (prototyper range). Registered
-- via M.RegisterForPlayer(player,uid,pname) by the events facade. Gates on
-- core.evt_config.crafting; emits via DSTP proxy.

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

    -- Player learned/prototyped a new craftable ("unlockrecipe", builder.lua:468;
    -- data.recipe = recipe name string). NOTE: GiveAllRecipes / the client-replica
    -- refresh also push "unlockrecipe" with NO data — nil-guard data.recipe to skip
    -- those (else we'd emit a bogus unlock per freebuild toggle / replica dirty).
    player:ListenForEvent("unlockrecipe", function(inst, data)
        if not evt_config.crafting then return end
        if not (data and data.recipe) then return end
        DSTP.PushEvent("recipe_unlocked", {
            userid = uid, name = pname,
            recipe = data.recipe,
        }, data)
    end)

    -- Player's accessible tech trees changed — entered/left a prototyper's range
    -- ("techtreechange", builder.lua:414, edge-guarded so it only fires on real
    -- transitions). data.level is a MAP {SCIENCE=2, MAGIC=0, ...}, NOT a scalar.
    player:ListenForEvent("techtreechange", function(inst, data)
        if not evt_config.crafting then return end
        local lvl = data and data.level or {}
        DSTP.PushEvent("tech_tree_changed", {
            userid = uid, name = pname,
            science = lvl.SCIENCE or 0,
            magic = lvl.MAGIC or 0,
            ancient = lvl.ANCIENT or 0,
            celestial = lvl.CELESTIAL or 0,
            shadow = lvl.SHADOW or 0,
        }, data)
    end)
end

return M
