-- DSTP Events / gathering — per-player gathering listeners: finishedwork (+ nested
-- loot_prefab_spawned for resource_gathered), harvestsomething, startlongaction,
-- onstartedfire + picksomething (pick off ground) + working (edge-detected chop/mine
-- START). Registered via M.RegisterForPlayer(player,uid,pname) by the events facade.
-- Gates on core.evt_config.gathering; emits via DSTP proxy.

local M = {}

local core, _G, evt_config, DSTP

function M.Init(c)
    core = c
    _G = c._G
    evt_config = c.evt_config
    DSTP = setmetatable({}, { __index = function(_, k)
        if k == "PushEvent" then return core.PushEvent end
        if k == "_DEBUG" then return core.DEBUG end
        return nil
    end })
    return M
end

function M.RegisterForPlayer(player, uid, pname)
    -- Player finished breaking something (chop tree, mine rock, hammer structure)
    player:ListenForEvent("finishedwork", function(inst, data)
        if not evt_config.gathering then return end
        local target = data and data.target
        if not target then return end
        local action = data.action and tostring(data.action) or "unknown"

        DSTP.PushEvent("player_work", {
            userid = uid, name = pname,
            target = target.prefab or "unknown",
            action = action,
        }, data)

        -- Hook loot drops from the destroyed entity
        if target:IsValid() and target.components and target.components.lootdropper then
            target:ListenForEvent("loot_prefab_spawned", function(ent, lootdata)
                if lootdata and lootdata.loot then
                    local count = 1
                    if lootdata.loot.components and lootdata.loot.components.stackable then
                        count = lootdata.loot.components.stackable:StackSize()
                    end
                    DSTP.PushEvent("resource_gathered", {
                        userid = uid, name = pname,
                        source = target.prefab or "unknown",
                        action = action,
                        loot = lootdata.loot.prefab or "unknown",
                        count = count,
                    }, lootdata)
                end
            end)
        end
    end)

    -- Player harvested something (berry bush, farm plant, etc)
    player:ListenForEvent("harvestsomething", function(inst, data)
        if not evt_config.gathering then return end
        local obj = data and data.object
        DSTP.PushEvent("player_harvest", {
            userid = uid, name = pname,
            source = obj and obj.prefab or "unknown",
        }, data)
    end)

    -- Player STARTED a long action (e.g. harvesting/picking). Fires at the start,
    -- before the action completes — the "began" event that gathering otherwise
    -- lacks (player_harvest fires only on completion).
    player:ListenForEvent("startlongaction", function(inst, data)
        if not evt_config.gathering then return end
        DSTP.PushEvent("player_action_start", {
            userid = uid, name = pname,
        }, data)
    end)

    -- Player started a fire
    player:ListenForEvent("onstartedfire", function(inst, data)
        if not evt_config.gathering then return end
        DSTP.PushEvent("player_startfire", {
            userid = uid, name = pname,
            target = data and data.target and data.target.prefab or "unknown",
        }, data)
    end)

    -- Player PICKED something off the ground/plant ("picksomething", pickable.lua:481/505;
    -- data.object = the bush/plant picked, data.loot = item(s) — UNSTABLE shape: an array
    -- at the lootdropper path, a single entity at the SpawnPrefab path. Normalize: count +
    -- first prefab.
    player:ListenForEvent("picksomething", function(inst, data)
        if not evt_config.gathering then return end
        local obj = data and data.object
        local loot = data and data.loot
        local loot_prefab, count = "unknown", 0
        if loot then
            if loot.prefab then          -- single entity
                loot_prefab = loot.prefab; count = 1
            elseif type(loot) == "table" then  -- array of entities
                count = #loot
                if loot[1] and loot[1].prefab then loot_prefab = loot[1].prefab end
            end
        end
        DSTP.PushEvent("player_pick", {
            userid = uid, name = pname,
            source = obj and obj.prefab or "unknown",
            loot = loot_prefab,
            count = count,
        }, data)
    end)

    -- Player BEGAN chopping/mining/hammering. DST "working" (workable.lua:148) fires
    -- on EVERY swing with {target}, so we edge-detect: only emit when the target
    -- changes or after a 2s gap (a new "start"), and nil-guard data.target (the oar/
    -- rowing hack pushes "working" with no target).
    player:ListenForEvent("working", function(inst, data)
        if not evt_config.gathering then return end
        local target = data and data.target
        if not target then return end  -- rowing hack pushes empty {}
        local now = _G.GetTime and _G.GetTime() or 0
        local last_guid = inst._dstp_work_guid
        local last_time = inst._dstp_work_time or 0
        -- Same target still being worked within 2s → not a new start, skip.
        if last_guid == target.GUID and (now - last_time) < 2 then
            inst._dstp_work_time = now
            return
        end
        inst._dstp_work_guid = target.GUID
        inst._dstp_work_time = now
        DSTP.PushEvent("player_mine_chop_start", {
            userid = uid, name = pname,
            target = target.prefab or "unknown",
        }, data)
    end)
end

return M
