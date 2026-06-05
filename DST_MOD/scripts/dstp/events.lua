-- DSTP Events — FACADE. The actual listeners now live in dstp/events/<category>.lua
-- (one file per category, mirroring the frontend node folders). This file keeps the
-- public contract unchanged (Events.Init / Events.RegisterGameEvents /
-- Events.RegisterPerPlayerEvents) so client.lua doesn't change, owns the per-player
-- retry+guard ONCE, and fans out to each category submodule. Bodies are UNCHANGED —
-- this split is a move, not a rewrite. Each callback still gates on core.evt_config so
-- a category can be hot-toggled without re-registering; ALL listeners register at boot
-- and just early-return when their category is off (the panel enables only what its
-- flows need via enable_events).

local Events = {}

-- Forward-decls: RegisterGameEvents calls RegisterPerPlayerEvents; the retry closure
-- inside RegisterPerPlayerEvents recurses into it — declare before use (strict mode).
local RegisterPerPlayerEvents
local RegisterGameEvents

-- core aliases (set in Init).
local core, _G, evt_config, hooked_players, Log, DSTP

-- Category submodules. Per-player files expose RegisterForPlayer(player,uid,pname);
-- world-scoped files expose RegisterWorld(inst). players.lua exposes BOTH halves.
local Players     = require("dstp/events/players")
local Combat      = require("dstp/events/combat")
local Crafting    = require("dstp/events/crafting")
local Inventory   = require("dstp/events/inventory")
local Health      = require("dstp/events/health")
local Survival    = require("dstp/events/survival")
local Gathering   = require("dstp/events/gathering")
local Exploration = require("dstp/events/exploration")
local Griefing    = require("dstp/events/griefing")
local Character   = require("dstp/events/character")
local World       = require("dstp/events/world")
local Weather     = require("dstp/events/weather")
local Boss        = require("dstp/events/boss")
local GriefWorld  = require("dstp/events/grief_world")
local NonPlayer   = require("dstp/events/nonplayer")  -- combat/trader hooks (non-player entities)

-- Per-player fan-out order = original registration order (players -> combat -> ...).
local PER_PLAYER = {
    Players, Combat, Crafting, Inventory, Health,
    Survival, Gathering, Exploration, Griefing, Character,
}

-- The per-player retry+guard, owned centrally (was the top of RegisterPerPlayerEvents).
-- Computes uid/pname ONCE then fans out to every category's RegisterForPlayer.
RegisterPerPlayerEvents = function(player)
    if not player then return end
    local uid = player.userid or ""
    -- Skip if no userid yet or already hooked
    if uid == "" then
        -- Retry up to 5 times (0.5s intervals) until userid is populated
        if _G.TheWorld and not player._dstp_hook_retries then
            player._dstp_hook_retries = 0
        end
        if _G.TheWorld and (player._dstp_hook_retries or 0) < 5 then
            player._dstp_hook_retries = (player._dstp_hook_retries or 0) + 1
            _G.TheWorld:DoTaskInTime(0.5, function()
                if player:IsValid() and player.userid and player.userid ~= "" then
                    RegisterPerPlayerEvents(player)
                else
                    RegisterPerPlayerEvents(player) -- will retry again
                end
            end)
        else
            LogInfo("WARNING: Could not hook player events - userid still empty after retries")
        end
        return
    end
    if hooked_players[uid] then return end
    hooked_players[uid] = true

    local pname = player.name or "unknown"

    for _, M in ipairs(PER_PLAYER) do
        M.RegisterForPlayer(player, uid, pname)
    end
end

RegisterGameEvents = function(inst)
    -- Register ALL listeners unconditionally
    -- Each callback checks evt_config at runtime, so categories can be toggled without re-registering
    Players.RegisterWorld(inst)     -- player lifecycle (spawn/left/disconnected/death)
    World.RegisterWorld(inst)
    Weather.RegisterWorld(inst)
    Boss.RegisterWorld(inst)
    GriefWorld.RegisterWorld(inst)

    -- entity_death used to be hooked THREE times (players/boss/grief_world each added
    -- their own listener on the same world event). Unify into ONE listener that fans
    -- out to each module's OnEntityDeath — fewer engine callbacks, single dispatch point.
    inst:ListenForEvent("entity_death", function(world, data)
        Players.OnEntityDeath(world, data)
        Boss.OnEntityDeath(world, data)
        GriefWorld.OnEntityDeath(world, data)
    end)

    -- Hook per-player events for existing players
    for _, player in ipairs(_G.AllPlayers) do
        RegisterPerPlayerEvents(player)
    end

    local enabled = {}
    for k, v in pairs(evt_config) do
        if v then table.insert(enabled, k) end
    end
    if DSTP._DEBUG then Log("Event categories: " .. table.concat(enabled, ", ")) end
end

function Events.Init(c)
    core = c
    _G = c._G
    evt_config = c.evt_config
    hooked_players = c.hooked_players
    Log = c.Log
    DSTP = setmetatable({}, { __index = function(_, k)
        if k == "PushEvent" then return core.PushEvent end
        if k == "RegisterCommand" then return core.RegisterCommand end
        if k == "_DEBUG" then return core.DEBUG end
        return nil
    end })

    -- Init every category submodule.
    for _, M in ipairs(PER_PLAYER) do M.Init(c) end
    World.Init(c)
    Weather.Init(c)
    Boss.Init(c)
    GriefWorld.Init(c)
    NonPlayer.Init(c)

    -- Publish the per-player entry on core so players.lua's lifecycle listener can
    -- drive registration (on ms_playerspawn) without a circular require.
    core.RegisterPerPlayerEvents = RegisterPerPlayerEvents
    -- Publish the non-player component hooks so modmain's AddComponentPostInit can
    -- attach them (combat→newcombattarget, trader→trade) without importing internals.
    core.HookCombatComponent = NonPlayer.HookCombat
    core.HookTraderComponent = NonPlayer.HookTrader
    return Events
end

-- Public entry: register every listener on the world inst.
function Events.RegisterGameEvents(inst)
    core.world_inst = inst  -- share the world inst with core
    return RegisterGameEvents(inst)
end

-- RegisterPerPlayerEvents is also called from DSTP.Init for already-connected
-- players; expose it so the client can drive that without re-importing internals.
function Events.RegisterPerPlayerEvents(player)
    return RegisterPerPlayerEvents(player)
end

return Events
