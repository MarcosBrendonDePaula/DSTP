-- DSTP Events / inventory — per-player inventory listeners: equip / pickup / drop /
-- unequip + itemget + inventoryfull. Registered via M.RegisterForPlayer(player,uid,
-- pname) by the events facade. Gates on core.evt_config.inventory; emits via DSTP proxy.

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
    player:ListenForEvent("equip", function(inst, data)
        if not evt_config.inventory then return end
        DSTP.PushEvent("player_equip", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
            slot = data and data.eslot or "unknown",
        }, data)
    end)

    player:ListenForEvent("onpickupitem", function(inst, data)
        if not evt_config.inventory then return end
        DSTP.PushEvent("player_pickup", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("dropitem", function(inst, data)
        if not evt_config.inventory then return end
        DSTP.PushEvent("player_drop", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("unequip", function(inst, data)
        if not evt_config.inventory then return end
        DSTP.PushEvent("player_unequip", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
            slot = data and data.eslot or "unknown",
        }, data)
    end)

    -- Player received an item into the inventory (gift, pickup, crafting...).
    player:ListenForEvent("itemget", function(inst, data)
        if not evt_config.inventory then return end
        local item = data and data.item
        DSTP.PushEvent("player_item_get", {
            userid = uid, name = pname,
            prefab = item and item.prefab or "unknown",
            slot = data and data.slot or nil,
        }, data)
    end)

    -- A pickup was REJECTED because every slot is taken ("inventoryfull",
    -- inventory.lua:1214; data.item = the item that couldn't be stored).
    player:ListenForEvent("inventoryfull", function(inst, data)
        if not evt_config.inventory then return end
        local item = data and data.item
        DSTP.PushEvent("inventory_full", {
            userid = uid, name = pname,
            item = item and item.prefab or "unknown",
        }, data)
    end)
end

return M
