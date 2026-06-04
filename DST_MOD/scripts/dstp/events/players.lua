-- DSTP Events / players — the "players" category, BOTH halves:
--  * per-player: ms_becameghost / ms_respawnedfromghost (M.RegisterForPlayer)
--  * world lifecycle: ms_playerspawn / ms_playerleft / ms_playerdisconnected /
--    entity_death(player) (M.RegisterWorld) — was RegisterPlayerEvents.
-- Extracted from events.lua verbatim. The world-lifecycle half drives per-player
-- registration + the owner-setup nudge: it reads core.RegisterPerPlayerEvents (the
-- facade's retry/guard entry) and core.MaybeNotifyOwnerSetup DYNAMICALLY at call time
-- (both published on core by the facade/chat), avoiding a circular require.

local M = {}

local core, evt_config, hooked_players, DSTP

-- owner-setup notifier comes from core (set by chat.Init); read dynamically.
local function MaybeNotifyOwnerSetup(player)
    if core.MaybeNotifyOwnerSetup then core.MaybeNotifyOwnerSetup(player) end
end

function M.Init(c)
    core = c
    evt_config = c.evt_config
    hooked_players = c.hooked_players
    DSTP = setmetatable({}, { __index = function(_, k)
        if k == "PushEvent" then return core.PushEvent end
        if k == "_DEBUG" then return core.DEBUG end
        return nil
    end })
    return M
end

-- per-player half (gate: players)
function M.RegisterForPlayer(player, uid, pname)
    player:ListenForEvent("ms_becameghost", function(inst)
        if not evt_config.players then return end
        DSTP.PushEvent("player_ghost", { userid = inst.userid or uid, name = inst.name or pname, prefab = inst.prefab or "" })
    end)

    player:ListenForEvent("ms_respawnedfromghost", function(inst, data)
        if not evt_config.players then return end
        -- player_respawn is the existing generic "came back" event. We ALSO surface a
        -- distinct player_resurrected: ms_respawnedfromghost is the unified completion
        -- signal for BOTH ghost revival and real-body (corpse) revival — data is {} for
        -- the ghost path, { corpse=true, reviver=<player|nil> } for the corpse path.
        DSTP.PushEvent("player_respawn", { userid = inst.userid or uid, name = inst.name or pname, prefab = inst.prefab or "" })
        local reviver = data and data.reviver
        DSTP.PushEvent("player_resurrected", {
            userid = inst.userid or uid, name = inst.name or pname,
            corpse = data and data.corpse or false,
            reviver = reviver and reviver.prefab or nil,
        }, data)
    end)
end

-- world-lifecycle half (was RegisterPlayerEvents). Drives per-player registration
-- via core.RegisterPerPlayerEvents (the facade's retry/guard entry).
function M.RegisterWorld(inst)
    inst:ListenForEvent("ms_playerspawn", function(world, player)
        -- Always hook per-player events, even if players category is disabled
        inst:DoTaskInTime(0, function()
            if not player:IsValid() then return end
            if core.RegisterPerPlayerEvents then core.RegisterPerPlayerEvents(player) end
            -- Seed the key_pressed watch set on this (possibly late-joining) player,
            -- so a client connecting after the set was last pushed still gets it.
            if core.PushWatchKeysTo then core.PushWatchKeysTo(player) end
            -- First-run: nudge the owner to set up the panel (once). Small delay
            -- so the client table (admin flag) is populated.
            inst:DoTaskInTime(2, function() MaybeNotifyOwnerSetup(player) end)
            if not evt_config.players then return end
            DSTP.PushEvent("player_spawn", {
                userid = player.userid,
                name = player.name,
                prefab = player.prefab,
            }, player)
        end)
    end)

    inst:ListenForEvent("ms_playerleft", function(world, player)
        hooked_players[player.userid] = nil
        if not evt_config.players then return end
        DSTP.PushEvent("player_left", {
            userid = player.userid,
            name = player.name,
        }, player)
    end)

    inst:ListenForEvent("ms_playerdisconnected", function(world, data)
        if not evt_config.players then return end
        local p = data and data.player
        DSTP.PushEvent("player_disconnected", {
            userid = p and p.userid or (data and data.userid) or "unknown",
            name = p and p.name or (data and data.name) or "unknown",
            reason = data and data.reason or "disconnect",
        }, data)
    end)

    inst:ListenForEvent("entity_death", function(world, data)
        if not evt_config.players then return end
        if data and data.inst and data.inst:HasTag("player") then
            DSTP.PushEvent("player_death", {
                userid = data.inst.userid,
                name = data.inst.name,
                cause = type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab) or "unknown",
            }, data)
        end
    end)

    -- A brand-new character first-spawned (NOT a reconnect). DST
    -- "ms_newplayercharacterspawned" fires on TheWorld with { player, mode } (keyed).
    -- It only fires for a genuinely new character on a fixed-spawn world (not loading
    -- in), so it cleanly distinguishes first-join from a normal player_spawn/rejoin —
    -- ideal for welcome/first-join reward flows.
    inst:ListenForEvent("ms_newplayercharacterspawned", function(world, data)
        if not evt_config.players then return end
        local p = data and data.player
        if not p then return end
        DSTP.PushEvent("player_new_character", {
            userid = p.userid,
            name = p.name,
            prefab = p.prefab,
            mode = data and data.mode or "unknown",
        }, data)
    end)

    -- A player is HOPPING SHARDS (overworld<->caves), not truly leaving. DST
    -- "ms_playerdespawnandmigrate" fires on TheWorld with { player, portalid, worldid,
    -- ... } (keyed) — lets the panel show "moved to caves" instead of "left". (This was
    -- previously skipped because the issue named a method, not this event.)
    inst:ListenForEvent("ms_playerdespawnandmigrate", function(world, data)
        if not evt_config.players then return end
        local p = data and data.player
        if not p then return end
        DSTP.PushEvent("player_migrated", {
            userid = p.userid,
            name = p.name,
            to_world = data and data.worldid or nil,
            portal = data and data.portalid or nil,
        }, data)
    end)
end

return M
