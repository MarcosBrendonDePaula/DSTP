-- DSTP Events / survival — per-player survival-state listeners: eat / insane / sane /
-- starving / freezing / overheating / mounted + on-fire damage + lunacy (enlightened /
-- back-to-normal) + wetness (edge-detected at the 'soaked' threshold). Registered via
-- M.RegisterForPlayer(player,uid,pname) by the events facade. Gates on
-- core.evt_config.survival; emits via DSTP proxy.

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
    player:ListenForEvent("oneat", function(inst, data)
        if not evt_config.survival then return end
        local food = data and data.food
        local edible = food and food.components and food.components.edible
        DSTP.PushEvent("player_eat", {
            userid = uid, name = pname,
            food = food and food.prefab or "unknown",
            health = edible and edible.healthvalue or 0,
            hunger = edible and edible.hungervalue or 0,
            sanity = edible and edible.sanityvalue or 0,
        }, data)
    end)

    player:ListenForEvent("goinsane", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_insane", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("gosane", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_sane", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("startstarving", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_starving", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("stopstarving", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_fed", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("startfreezing", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_freezing", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("stopfreezing", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_warm", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("startoverheating", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_overheating", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("stopoverheating", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_cooled", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("mounted", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_mounted", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("dismounted", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_dismounted", { userid = uid, name = pname }, inst)
    end)

    -- ── Danger states ──────────────────────────────────────────────────────
    -- Player started taking fire damage (on fire).
    player:ListenForEvent("startfiredamage", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_on_fire", { userid = uid, name = pname }, inst)
    end)

    player:ListenForEvent("stopfiredamage", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_fire_out", { userid = uid, name = pname }, inst)
    end)

    -- ── Lunacy (Enlightenment) — the lunar counterpart of insane/sane ──────
    -- "goenlightened" (sanity.lua:429) fires with NO data on entering lunacy.
    player:ListenForEvent("goenlightened", function(inst)
        if not evt_config.survival then return end
        DSTP.PushEvent("player_enlightened", { userid = uid, name = pname }, inst)
    end)

    -- "sanitymodechanged" (sanity.lua:179) fires on BOTH directions; server mode
    -- is a NUMBER (0 = normal/insanity-mode, 1 = lunacy). Emit player_lunacy_normal
    -- only when leaving lunacy back to normal (mode == 0). The goenlightened above
    -- already covers entering lunacy, so we only surface the "back to normal" edge here.
    player:ListenForEvent("sanitymodechanged", function(inst, data)
        if not evt_config.survival then return end
        local mode = data and data.mode
        if mode == 0 then
            DSTP.PushEvent("player_lunacy_normal", { userid = uid, name = pname, mode = mode }, data)
        end
    end)

    -- ── Wetness ────────────────────────────────────────────────────────────
    -- "moisturedelta" (moisture.lua:146) fires per moisture tick with absolute
    -- levels {old, new}. We DON'T want per-tick spam — edge-detect the "soaked"
    -- crossing (level > 35, DST's 'wet' threshold) and emit once on getting wet /
    -- drying out, tracking the last state on the player inst.
    player:ListenForEvent("moisturedelta", function(inst, data)
        if not evt_config.survival then return end
        local new = data and data.new or 0
        local is_wet = new > 35
        if inst._dstp_was_wet == is_wet then return end  -- no crossing → skip
        inst._dstp_was_wet = is_wet
        DSTP.PushEvent("player_wet", {
            userid = uid, name = pname,
            moisture = new,
            was = data and data.old or 0,
            wet = is_wet,
        }, data)
    end)
end

return M
