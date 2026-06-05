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

-- ── Structure / world-object hooks (griefing category) ─────────────────────
-- workable & burnable are COMMON components (thousands of entities). The cost rule:
-- the modmain postinit attaches us to every one, but we gate on evt_config.griefing
-- (cheap early-return when off) and second-stage filter to entities worth surfacing.

-- Hard filter: is this a placed structure / notable resource node (vs a held item,
-- a critter, a piece of loot)? Workable/burnable fire on trees, walls, chests, boulders
-- AND on dropped tools, food, mobs — we only want the world-object grief surface.
local function IsWorldObject(inst)
    if not inst then return false end
    if inst:HasTag("player") then return false end
    if inst:HasTag("structure") then return true end          -- chests, walls, science machine...
    if inst:HasTag("CHOP_workable") or inst:HasTag("DIG_workable")
        or inst:HasTag("MINE_workable") or inst:HasTag("HAMMER_workable") then
        return true                                            -- trees, rocks, stumps, diggables
    end
    return false
end

-- Attach to a workable component's entity. "workfinished" (workable.lua:165) fires on
-- the STRUCTURE/RESOURCE when its work hits 0 (wall hammered down, tree felled, rock
-- mined out) with { worker }. The structure-side of player_work — tells WHICH object
-- was destroyed and by whom. High anti-grief value (hammering someone's base).
function M.HookWorkable(self)
    local inst = self.inst
    if not inst then return end
    if not IsWorldObject(inst) then return end
    inst:ListenForEvent("workfinished", function(ent, data)
        if not evt_config.griefing then return end
        local worker = data and data.worker
        local x, _, z = 0, 0, 0
        if ent and ent.Transform then x, _, z = ent.Transform:GetWorldPosition() end
        DSTP.PushEvent("structure_worked", {
            prefab = ent and ent.prefab or "unknown",
            userid = worker and worker.userid or "",
            name = worker and worker.name or "unknown",
            x = math.floor(x), z = math.floor(z),
        }, data)
    end)
end

-- Attach to a burnable component's entity. "onignite" (burnable.lua:375) fires on the
-- object that just CAUGHT fire with { source, doer }. This is the live IGNITION detector
-- boss.lua notes is missing — it catches the arsonist (data.doer) at the moment of
-- ignition, before the structure_burnt post-mortem. Filter to world objects.
function M.HookBurnable(self)
    local inst = self.inst
    if not inst then return end
    if not IsWorldObject(inst) then return end
    inst:ListenForEvent("onignite", function(ent, data)
        if not evt_config.griefing then return end
        local doer = data and data.doer
        local x, _, z = 0, 0, 0
        if ent and ent.Transform then x, _, z = ent.Transform:GetWorldPosition() end
        DSTP.PushEvent("object_ignited", {
            prefab = ent and ent.prefab or "unknown",
            doer_userid = doer and doer.userid or "",
            doer_name = doer and doer.name or "unknown",
            x = math.floor(x), z = math.floor(z),
        }, data)
    end)
end

-- Attach to a container component's entity. container fires three events ON THE
-- CONTAINER (so we know WHICH chest, unlike the player-side onopencontainer):
--   onopen  { doer }            -> container_opened_entity  (chest opened by X)
--   itemget { slot, item }      -> container_item_added     (deposit)
--   itemlose{ slot, prev_item } -> container_item_taken     (withdraw / loot)
-- container is COMMON (every chest, icebox, backpack, cookpot UI, player inventory's
-- backing...). We hard-filter to PLACED world containers (structure tag) so a player's
-- own inventory/backpack churn doesn't flood — anti-grief cares about base chests.
-- itemget/itemlose are per-item; we gate on griefing and emit compactly (prefab+slot).
function M.HookContainer(self)
    local inst = self.inst
    if not inst then return end
    if not inst:HasTag("structure") then return end           -- only placed world containers
    local function pos(ent)
        local x, _, z = 0, 0, 0
        if ent and ent.Transform then x, _, z = ent.Transform:GetWorldPosition() end
        return math.floor(x), math.floor(z)
    end
    inst:ListenForEvent("onopen", function(ent, data)
        if not evt_config.griefing then return end
        local doer = data and data.doer
        local x, z = pos(ent)
        DSTP.PushEvent("container_opened_entity", {
            container_prefab = ent and ent.prefab or "unknown",
            container_guid = ent and ent.GUID or nil,
            userid = doer and doer.userid or "",
            name = doer and doer.name or "unknown",
            x = x, z = z,
        }, data)
    end)
    inst:ListenForEvent("itemget", function(ent, data)
        if not evt_config.griefing then return end
        local item = data and data.item
        DSTP.PushEvent("container_item_added", {
            container_prefab = ent and ent.prefab or "unknown",
            container_guid = ent and ent.GUID or nil,
            item = item and item.prefab or "unknown",
            slot = data and data.slot or nil,
        }, data)
    end)
    inst:ListenForEvent("itemlose", function(ent, data)
        if not evt_config.griefing then return end
        local item = data and data.prev_item
        DSTP.PushEvent("container_item_taken", {
            container_prefab = ent and ent.prefab or "unknown",
            container_guid = ent and ent.GUID or nil,
            item = item and item.prefab or "unknown",
            slot = data and data.slot or nil,
        }, data)
    end)
end

-- ── Creature hooks (creatures category) ────────────────────────────────────
-- All on RARE components (domesticatable, werebeast, rideable) or hard-filtered common
-- ones (freezable, pickable). Each gates on evt_config.creatures.

-- A small helper to read a mob's world position.
local function MobPos(ent)
    local x, _, z = 0, 0, 0
    if ent and ent.Transform then x, _, z = ent.Transform:GetWorldPosition() end
    return math.floor(x), math.floor(z)
end

-- domesticatable (RARE — beefalo only). domesticated{tendencies} = tamed;
-- goneferal{domesticated} = reverted to wild.
function M.HookDomesticatable(self)
    local inst = self.inst
    if not inst then return end
    inst:ListenForEvent("domesticated", function(ent)
        if not evt_config.creatures then return end
        local x, z = MobPos(ent)
        DSTP.PushEvent("beefalo_tamed", {
            prefab = ent and ent.prefab or "unknown",
            guid = ent and ent.GUID or nil,
            x = x, z = z,
        })
    end)
    inst:ListenForEvent("goneferal", function(ent, data)
        if not evt_config.creatures then return end
        local x, z = MobPos(ent)
        DSTP.PushEvent("beefalo_feral", {
            prefab = ent and ent.prefab or "unknown",
            guid = ent and ent.GUID or nil,
            was_domesticated = data and data.domesticated == true,
            x = x, z = z,
        }, data)
    end)
end

-- werebeast (RARE — werepig, etc.). transformwere/transformnormal carry no payload.
-- Bail on players (the character were-transform is its own player-side event).
function M.HookWerebeast(self)
    local inst = self.inst
    if not inst then return end
    if inst:HasTag("player") then return end
    local function emit(form)
        return function(ent)
            if not evt_config.creatures then return end
            local x, z = MobPos(ent)
            DSTP.PushEvent("mob_transform", {
                prefab = ent and ent.prefab or "unknown",
                guid = ent and ent.GUID or nil,
                form = form,
                x = x, z = z,
            })
        end
    end
    inst:ListenForEvent("transformwere", emit("were"))
    inst:ListenForEvent("transformnormal", emit("normal"))
end

-- freezable (COMMON — anything that can freeze). Filter to actual combat mobs (a frozen
-- chest/sapling is noise); "freeze" has no payload.
function M.HookFreezable(self)
    local inst = self.inst
    if not inst then return end
    if inst:HasTag("player") then return end
    inst:ListenForEvent("freeze", function(ent)
        if not evt_config.creatures then return end
        if not (ent and ent.HasTag and (ent:HasTag("monster") or ent:HasTag("animal") or ent:HasTag("character"))) then
            return  -- only real creatures, not frozen world objects
        end
        local x, z = MobPos(ent)
        DSTP.PushEvent("mob_frozen", {
            prefab = ent and ent.prefab or "unknown",
            guid = ent and ent.GUID or nil,
            x = x, z = z,
        })
    end)
end

-- pickable (VERY COMMON — every bush/grass/flower/reed). The node-side of player_pick:
-- "picked"{picker,loot,plant} fires on the PLANT. Gate hard; emit loot count compactly.
function M.HookPickable(self)
    local inst = self.inst
    if not inst then return end
    inst:ListenForEvent("picked", function(ent, data)
        if not evt_config.creatures then return end
        local picker = data and data.picker
        local loot = data and data.loot
        local count = 0
        if type(loot) == "table" then for _ in pairs(loot) do count = count + 1 end end
        local x, z = MobPos(ent)
        DSTP.PushEvent("resource_picked", {
            prefab = ent and ent.prefab or "unknown",
            userid = picker and picker.userid or "",
            name = picker and picker.name or "unknown",
            count = count,
            x = x, z = z,
        }, data)
    end)
end

-- rideable (RARE — beefalo/woby). riderchanged{oldrider,newrider} on the MOUNT;
-- mounted = a new rider got on, else dismounted.
function M.HookRideable(self)
    local inst = self.inst
    if not inst then return end
    inst:ListenForEvent("riderchanged", function(ent, data)
        if not evt_config.creatures then return end
        local rider = data and data.newrider
        local x, z = MobPos(ent)
        DSTP.PushEvent("mount_rider_changed", {
            prefab = ent and ent.prefab or "unknown",
            guid = ent and ent.GUID or nil,
            rider_userid = rider and rider.userid or "",
            rider_name = rider and rider.name or "",
            mounted = rider ~= nil,
        }, data)
    end)
end

-- ── World-object hooks that ride the 'world' category ──────────────────────

-- activatable (RARE — ancient station, terrarium…). onactivated{doer}.
function M.HookActivatable(self)
    local inst = self.inst
    if not inst then return end
    inst:ListenForEvent("onactivated", function(ent, data)
        if not evt_config.world then return end
        local doer = data and data.doer
        local x, z = MobPos(ent)
        DSTP.PushEvent("object_activated", {
            prefab = ent and ent.prefab or "unknown",
            guid = ent and ent.GUID or nil,
            userid = doer and doer.userid or "",
            name = doer and doer.name or "unknown",
            x = x, z = z,
        }, data)
    end)
end

-- machine (RARE — flingomatic, lightning rod…). machineturnedon/off, no payload.
function M.HookMachine(self)
    local inst = self.inst
    if not inst then return end
    local function emit(state)
        return function(ent)
            if not evt_config.world then return end
            local x, z = MobPos(ent)
            DSTP.PushEvent("machine_toggled", {
                prefab = ent and ent.prefab or "unknown",
                guid = ent and ent.GUID or nil,
                state = state,
                x = x, z = z,
            })
        end
    end
    inst:ListenForEvent("machineturnedon", emit("on"))
    inst:ListenForEvent("machineturnedoff", emit("off"))
end

return M
