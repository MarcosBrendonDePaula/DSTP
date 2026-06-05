-- DSTP Events / character — per-player character-specific listeners: cookbook recipe
-- learned, book read, were-transform, sleep start/end. Extracted from events.lua
-- verbatim. Registered via M.RegisterForPlayer(player,uid,pname) by the events facade.
-- Gates on core.evt_config.character; emits via DSTP proxy.

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
    -- Player learned a new cookbook recipe (fires when they eat something new)
    player:ListenForEvent("learncookbookrecipe", function(inst, data)
        if not evt_config.character then return end
        DSTP.PushEvent("recipe_learned", {
            userid = uid, name = pname,
            product = data and data.product or "unknown",
        }, data)
    end)

    -- NOTE: book_read was REMOVED. "readbook" is not pushed on the player by the engine
    -- (book reading goes through the book/ACTIONS path, no player event), so the listener
    -- was dead. Dropped rather than keep a never-firing hook.

    -- Woodie / Wurt / etc. transformed into were-form
    player:ListenForEvent("transformwere", function(inst)
        if not evt_config.character then return end
        DSTP.PushEvent("character_transform", {
            userid = uid, name = pname,
            form = "were",
        })
    end)

    -- Transformed back to normal form
    player:ListenForEvent("transformnormal", function(inst)
        if not evt_config.character then return end
        DSTP.PushEvent("character_transform", {
            userid = uid, name = pname,
            form = "normal",
        })
    end)

    -- Player went to sleep (tent, siesta, bedroll)
    player:ListenForEvent("gotosleep", function(inst)
        if not evt_config.character then return end
        DSTP.PushEvent("player_sleep_start", { userid = uid, name = pname })
    end)

    -- Player woke up
    player:ListenForEvent("onwakeup", function(inst)
        if not evt_config.character then return end
        DSTP.PushEvent("player_sleep_end", { userid = uid, name = pname })
    end)
end

return M
