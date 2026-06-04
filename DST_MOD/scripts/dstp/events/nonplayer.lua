-- DSTP Events / nonplayer — events that fire on NON-player entities (mobs/NPCs), so
-- they can't ride the per-player fan-out. These need a broad AddComponentPostInit hook
-- (installed from modmain) that attaches a ListenForEvent to EVERY entity that gets the
-- component. To keep the cost sane we filter hard inside the callback (e.g. only emit a
-- combat-target event when the target is a player). Init(core) wires the DSTP proxy;
-- HookCombat(self)/HookTrader(self) are called by modmain's AddComponentPostInit.
--
--   player_combat_target  <- "newcombattarget" on any combat entity (the aggro'ing mob)
--   trade_received        <- "trade" on any trader entity (the NPC/structure receiver)

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

-- Attach to a combat component's entity. "newcombattarget" (combat.lua:385) fires on
-- the entity ACQUIRING a target (a mob aggroing). We only surface it when the target
-- is a PLAYER (a mob locked onto player X — the actionable "you're being hunted" case),
-- and skip the player's own combat entity (players don't meaningfully "acquire" via this).
function M.HookCombat(self)
    local inst = self.inst
    if not inst then return end
    if inst:HasTag("player") then return end  -- don't hook player combat (it doesn't fire here)
    inst:ListenForEvent("newcombattarget", function(ent, data)
        if not evt_config.combat then return end
        local target = data and data.target
        if not (target and target.HasTag and target:HasTag("player")) then return end  -- only mob→player aggro
        local old = data and data.oldtarget
        DSTP.PushEvent("player_combat_target", {
            userid = target.userid or "",
            name = target.name or "unknown",
            aggressor = ent and ent.prefab or "unknown",      -- the mob that aggroed
            aggressor_guid = ent and ent.GUID or nil,
            switched_from = old and old.prefab or nil,         -- previous target (retarget)
        }, data)
    end)
end

-- Attach to a trader component's entity. "trade" (trader.lua:155) fires on the NPC/
-- structure RECEIVING the gift; the giving player is data.giver. We emit who gave what
-- to which receiver — the receiver is the hooked entity (self.inst).
function M.HookTrader(self)
    local inst = self.inst
    if not inst then return end
    inst:ListenForEvent("trade", function(ent, data)
        if not evt_config.inventory then return end
        local giver = data and data.giver
        local item = data and data.item
        DSTP.PushEvent("trade_received", {
            receiver = ent and ent.prefab or "unknown",        -- the NPC/structure (pigking, wormwood...)
            userid = giver and giver.userid or "",             -- the giving player
            name = giver and giver.name or "unknown",
            item = item and item.prefab or "unknown",
        }, data)
    end)
end

return M
