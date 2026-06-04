-- DSTP Events / combat — per-player combat listeners: killed / attacked +
-- onattackother / onhitother (attacks ON other entities, for grief/PvP detection) +
-- blocked / onmissother (defense + miss) + epicscare (boss-near warning, gates on
-- evt_config.bosses since it's a boss proximity signal). Registered via
-- M.RegisterForPlayer(player,uid,pname) by the events facade; emits via DSTP proxy.

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

    -- Player fully BLOCKED an incoming hit (armor recoil / shield / full absorb).
    -- DST "blocked" fires on the defender (combat.lua:700) with KEYED fields
    -- {attacker, damage, spdamage, original_damage}; attacker can be nil.
    player:ListenForEvent("blocked", function(inst, data)
        if not evt_config.combat then return end
        local attacker = data and data.attacker
        DSTP.PushEvent("player_block", {
            userid = uid, name = pname,
            attacker = attacker and attacker.prefab or "unknown",
            attacker_is_player = attacker and attacker:HasTag("player") or false,
            damage = data and data.damage or 0,
            original_damage = data and data.original_damage or 0,
        }, data)
    end)

    -- Player swung and MISSED a target (out of range / dodged). "onmissother"
    -- fires on the attacker (combat.lua:1088); {target, weapon} keyed, weapon nil on bare hands.
    player:ListenForEvent("onmissother", function(inst, data)
        if not evt_config.combat then return end
        local target = data and data.target
        DSTP.PushEvent("player_attack_miss", {
            userid = uid, name = pname,
            target = target and target.prefab or "unknown",
            target_guid = target and target.GUID or nil,
            target_is_player = target and target:HasTag("player") or false,
            weapon = data and data.weapon and data.weapon.prefab or nil,
        }, data)
    end)

    -- An epic/boss roar scared this player (boss is near). DST "epicscare"
    -- (epicscare.lua:23) is an AoE pulse pushed onto EVERY nearby _combat entity,
    -- so a single roar fires once per nearby player AND re-fires per roar — debounce
    -- per-player (3s) so a multi-roar fight doesn't spam. scarer is the boss entity.
    player:ListenForEvent("epicscare", function(inst, data)
        if not evt_config.bosses then return end
        local now = _G.GetTime and _G.GetTime() or 0
        if inst._dstp_last_epicscare and (now - inst._dstp_last_epicscare) < 3 then return end
        inst._dstp_last_epicscare = now
        local scarer = data and data.scarer
        DSTP.PushEvent("boss_warning", {
            userid = uid, name = pname,
            scarer = scarer and scarer.prefab or "unknown",
            duration = data and data.duration or 0,
        }, data)
    end)

    -- Player hit the death-floor with a death-preventing buff ("minhealth",
    -- health.lua:578). NOTE: in vanilla this only fires if something called
    -- health:SetMinHealth(>0) on the player (life-giving amulet, certain buffs, or
    -- c_setminhealth) — players default to min=0 (HP 0 = death path), so it's a
    -- "clutch / saved from death" signal that fires only when such a buff is active.
    player:ListenForEvent("minhealth", function(inst, data)
        if not evt_config.combat then return end
        local afflicter = data and data.afflicter
        DSTP.PushEvent("player_min_health", {
            userid = uid, name = pname,
            cause = data and (type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab)) or nil,
            afflicter = afflicter and afflicter.prefab or nil,
        }, data)
    end)
end

return M
