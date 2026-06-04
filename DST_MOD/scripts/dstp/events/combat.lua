-- DSTP Events / combat — per-player combat listeners: killed / attacked +
-- onattackother / onhitother (attacks ON other entities, for grief/PvP detection).
-- Extracted from events.lua verbatim. Registered via M.RegisterForPlayer(player,uid,
-- pname) by the events facade. Gates on core.evt_config.combat; emits via DSTP proxy.

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
    player:ListenForEvent("killed", function(inst, data)
        if not evt_config.combat then return end
        DSTP.PushEvent("player_kill", {
            userid = uid, name = pname,
            victim = data and data.victim and data.victim.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("attacked", function(inst, data)
        if not evt_config.combat then return end
        DSTP.PushEvent("player_attacked", {
            userid = uid, name = pname,
            attacker = data and data.attacker and data.attacker.prefab or "unknown",
            damage = data and data.damage or 0,
            damage_resolved = data and data.damageresolved or 0,
            weapon = data and data.weapon and data.weapon.prefab or nil,
            stimuli = data and data.stimuli or nil,
        }, data)
    end)

    -- ── Combat / anti-grief: player attacking OTHER entities ───────────────
    -- The local client only sees its own player's attacks. attackother fires
    -- when this player swings at a target; useful to detect grief/PvP.
    player:ListenForEvent("onattackother", function(inst, data)
        if not evt_config.combat then return end
        local target = data and data.target
        DSTP.PushEvent("player_attack_other", {
            userid = uid, name = pname,
            target = target and target.prefab or "unknown",
            target_guid = target and target.GUID or nil,
            target_is_player = target and target:HasTag("player") or false,
            weapon = data and data.weapon and data.weapon.prefab or nil,
        }, data)
    end)

    -- Player landed a hit on another entity (resolved damage).
    player:ListenForEvent("onhitother", function(inst, data)
        if not evt_config.combat then return end
        local target = data and data.target
        DSTP.PushEvent("player_hit_other", {
            userid = uid, name = pname,
            target = target and target.prefab or "unknown",
            target_guid = target and target.GUID or nil,  -- p/ HUD seguir o alvo exato
            target_is_player = target and target:HasTag("player") or false,
            damage = data and data.damage or 0,
        }, data)
    end)
end

return M
