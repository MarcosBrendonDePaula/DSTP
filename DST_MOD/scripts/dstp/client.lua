-- DSTP Client - DST Admin Panel Bridge
-- Bidirectional HTTP polling: DST server <-> DSTP backend
-- Focus: player management (stats, inventory, equipment, position)

local DSTP = {}

-- Shared state + ubiquitous helpers now live in dstp/core (DI hub). We alias them
-- to module-locals so the ~700 internal call sites below stay unchanged. The TABLE
-- aliases (state/config/evt_config/...) point at core's tables BY REFERENCE — Init
-- mutates those tables in place, so the aliases stay live. The FUNCTION aliases are
-- stable (functions don't change). `_G`/`json` are reassigned at Init, so they're
-- aliased to module-locals set in DSTP.Init (same GLOBAL reference as core).
local Core = require("dstp/core")

local _G = nil  -- set in Init() (mirrors core._G; same GLOBAL ref)
local json = nil -- set in Init()

local state = Core.state
local config = Core.config
local COMMAND_PREFIX = Core.COMMAND_PREFIX
local command_handlers = Core.command_handlers
local evt_config = Core.evt_config
local hooked_players = Core.hooked_players
local event_debounce = Core.event_debounce
local LandClaims = nil  -- aliased from core in Init (set after require there)
local world_inst = nil  -- local mirror; events also set core.world_inst

-- Helper aliases (stable function refs from core)
local Log = Core.Log
local LogError = Core.LogError
local LogInfo = Core.LogInfo
local SafeEncode = Core.SafeEncode
local SafeDecode = Core.SafeDecode
local SafeDump = Core.SafeDump
local FindPlayer = Core.FindPlayer
local ExecuteCommand = Core.ExecuteCommand
local ProcessCommands = Core.ProcessCommands
-- Public API delegates to core (kept on DSTP so modmain/the rest call DSTP.X)
DSTP.PushEvent = Core.PushEvent
DSTP.RegisterCommand = Core.RegisterCommand

-- SendPrivateMessage moved to core (shared by commands + the panel-link helper).
local SendPrivateMessage = Core.SendPrivateMessage

-- Forward declarations (DST strict mode requires variables to exist before reference)
local SendUrlToAdmin
local SendUrlToAdmins
local MaybeNotifyOwnerSetup
local HookChat
local HotToggleEvents
local RegisterPerPlayerEvents
local RegisterPlayerEvents
local RegisterWorldEvents
local RegisterWeatherEvents
local RegisterBossEvents
local RegisterGriefEvents
local RegisterGameEvents

-- Logging + JSON helpers moved to dstp/core (aliased above: Log/LogError/LogInfo/
-- SafeEncode/SafeDecode). DSTP._DEBUG kept as a public alias of Core.DEBUG, synced
-- in DSTP.Init, since `if DSTP._DEBUG then` guards are used throughout.
DSTP._DEBUG = false

-- Data collectors moved to dstp/collectors (pure serializers of server/player
-- state). Aliased here for the poll loop. Collectors.Init(core) called in DSTP.Init.
local Collectors = require("dstp/collectors")
local GetServerInfo = Collectors.GetServerInfo
local GetAllPlayersData = Collectors.GetAllPlayersData
local RefreshClientTable = Collectors.RefreshClientTable


-- SafeDump / DSTP.PushEvent / the command system (RegisterCommand/Execute/Process)
-- / FindPlayer all moved to dstp/core and are aliased at the top of this file.

-- The ~55 command handlers moved to dstp/commands (bodies unchanged). Registered
-- via Commands.RegisterAll(Core) in DSTP.Init.
local Commands = require("dstp/commands")

-------------------------------------------------
-- Polling (adaptive)
-------------------------------------------------
-- Adaptive polling: rate depends on what the server is doing.
-- Empty server idles at 30s, active server syncs at 5s, burst mode (events
-- queued or commands arriving) drops to 0.5s briefly.
-- `state.next_poll_delay` is read by ScheduleNextPoll after each cycle.
state.next_poll_delay = nil
state.last_cmd_count = 0

local function ComputeNextDelay()
    -- Events in queue → flush ASAP. With the relay buffering pushed commands
    -- locally (WS), the round-trip cost of a fast poll is tiny, so we poll
    -- aggressively to make reactions (e.g. heal-on-hit) near-instant.
    if #state.event_queue > 0 then return 0.1 end

    -- Burst mode: backend sent commands recently → stay responsive
    if state.last_cmd_count > 0 then return 0.5 end

    -- Idle: no players connected → slow way down
    local client_count = 0
    for _, c in pairs(_G.TheNet and _G.TheNet:GetClientTable() or {}) do
        if c.userid and c.userid ~= "" then client_count = client_count + 1 end
    end
    if client_count == 0 then return 30 end

    -- Active server: use configured poll_interval as baseline
    return config.poll_interval
end

local function DoPoll()
    if not _G.TheWorld or not _G.TheWorld.ismastersim then return end

    RefreshClientTable()

    local events = {}
    for i = 1, math.min(#state.event_queue, config.max_batch_size) do
        table.insert(events, table.remove(state.event_queue, 1))
    end

    local payload = {
        server_id = config.server_id,
        shard_id = config.shard_id,
        shard_type = config.shard_type,
        server = GetServerInfo(),
        players = GetAllPlayersData(),
        events = events,
        active_events = evt_config,
        debounce = event_debounce,
    }

    local json_data = SafeEncode(payload)
    if not json_data then return end

    _G.TheSim:QueryServer(
        config.backend_url .. "/api/dst/sync",
        function(result, isSuccessful, resultCode)
            if isSuccessful and result then
                local data = SafeDecode(result)
                if data then
                    state.connected = true
                    state.connection_errors = 0
                    state.last_successful_poll = _G.GetTime()
                    if data.commands and #data.commands > 0 then
                        state.last_cmd_count = #data.commands
                        ProcessCommands(data.commands)
                    else
                        state.last_cmd_count = 0
                    end
                    -- Hot-toggle event categories from backend
                    if data.enable_events then
                        HotToggleEvents(data.enable_events)
                    end
                    -- Update debounce times from backend
                    if data.debounce then
                        for k, v in pairs(data.debounce) do
                            if type(v) == "number" then
                                event_debounce[k] = v
                            end
                        end
                    end
                end
            else
                state.connection_errors = state.connection_errors + 1
                state.connected = false
                if state.connection_errors % 10 == 1 then
                    LogError("Connection failed (attempt " .. state.connection_errors .. "): " .. tostring(resultCode))
                end
            end
        end,
        "POST",
        json_data
    )
end

-------------------------------------------------
-- Game event listeners (by category)
-------------------------------------------------
-- (evt_config, world_inst aliased from core at top of module)

-- Per-player events (combat, crafting, inventory, health, gathering)
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

    -- players
    player:ListenForEvent("ms_becameghost", function(inst)
        if not evt_config.players then return end
        DSTP.PushEvent("player_ghost", { userid = inst.userid or uid, name = inst.name or pname, prefab = inst.prefab or "" })
    end)

    player:ListenForEvent("ms_respawnedfromghost", function(inst)
        if not evt_config.players then return end
        DSTP.PushEvent("player_respawn", { userid = inst.userid or uid, name = inst.name or pname, prefab = inst.prefab or "" })
    end)

    -- combat
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

    -- crafting
    player:ListenForEvent("builditem", function(inst, data)
        if not evt_config.crafting then return end
        DSTP.PushEvent("player_craft", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
            recipe = data and data.recipe and data.recipe.name or "unknown",
        }, data)
    end)

    player:ListenForEvent("buildstructure", function(inst, data)
        if not evt_config.crafting then return end
        DSTP.PushEvent("player_build", {
            userid = uid, name = pname,
            item = data and data.item and data.item.prefab or "unknown",
            recipe = data and data.recipe and data.recipe.name or "unknown",
        }, data)
    end)

    -- inventory
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

    -- health
    player:ListenForEvent("healthdelta", function(inst, data)
        if not evt_config.health then return end
        DSTP.PushEvent("health_delta", {
            userid = uid, name = pname,
            old = data and data.oldpercent or 0,
            new = data and data.newpercent or 0,
            amount = data and data.amount or 0,
            cause = data and (type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab)) or nil,
            afflicter = data and data.afflicter and data.afflicter.prefab or nil,
        }, data)
    end)

    player:ListenForEvent("hungerdelta", function(inst, data)
        if not evt_config.health then return end
        DSTP.PushEvent("hunger_delta", {
            userid = uid, name = pname,
            old = data and data.oldpercent or 0,
            new = data and data.newpercent or 0,
            amount = data and data.amount or 0,
        }, data)
    end)

    player:ListenForEvent("sanitydelta", function(inst, data)
        if not evt_config.health then return end
        DSTP.PushEvent("sanity_delta", {
            userid = uid, name = pname,
            old = data and data.oldpercent or 0,
            new = data and data.newpercent or 0,
            amount = data and data.amount or 0,
        }, data)
    end)

    -- survival
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

    -- gathering
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

    -- world interactions
    -- Player entered a wormhole
    player:ListenForEvent("onwenthome", function(inst)
        if not evt_config.world then return end
        DSTP.PushEvent("player_teleported", {
            userid = uid, name = pname,
            type = "wormhole_enter",
        })
    end)

    -- Player left a wormhole / teleport
    player:ListenForEvent("onleftplayer", function(inst)
        if not evt_config.world then return end
        DSTP.PushEvent("player_teleported", {
            userid = uid, name = pname,
            type = "wormhole_exit",
        })
    end)

    -- exploration
    player:ListenForEvent("onsink", function(inst, data)
        if not evt_config.exploration then return end
        local x, _, z = 0, 0, 0
        if inst.Transform then x, _, z = inst.Transform:GetWorldPosition() end
        DSTP.PushEvent("player_sunk", {
            userid = uid, name = pname,
            x = math.floor(x), z = math.floor(z),
        }, data)
    end)

    player:ListenForEvent("fishingcollect", function(inst, data)
        if not evt_config.exploration then return end
        local fish = data and data.fish
        DSTP.PushEvent("fish_caught", {
            userid = uid, name = pname,
            fish = fish and fish.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("onboat", function(inst)
        if not evt_config.exploration then return end
        DSTP.PushEvent("boat_entered", { userid = uid, name = pname })
    end)

    player:ListenForEvent("onboatoff", function(inst)
        if not evt_config.exploration then return end
        DSTP.PushEvent("boat_exited", { userid = uid, name = pname })
    end)

    -- griefing: container open/close and hammer
    player:ListenForEvent("onopencontainer", function(inst, data)
        if not evt_config.griefing then return end
        local c = data and data.container
        DSTP.PushEvent("container_opened", {
            userid = uid, name = pname,
            container_prefab = c and c.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("onclosecontainer", function(inst, data)
        if not evt_config.griefing then return end
        local c = data and data.container
        DSTP.PushEvent("container_closed", {
            userid = uid, name = pname,
            container_prefab = c and c.prefab or "unknown",
        }, data)
    end)

    player:ListenForEvent("onhammer", function(inst, data)
        if not evt_config.griefing then return end
        local target = data and data.target
        if not target then return end
        DSTP.PushEvent("structure_hammered", {
            userid = uid, name = pname,
            prefab = target.prefab or "unknown",
        }, data)
    end)

    -- character-specific events
    -- Player learned a new cookbook recipe (fires when they eat something new)
    player:ListenForEvent("learncookbookrecipe", function(inst, data)
        if not evt_config.character then return end
        DSTP.PushEvent("recipe_learned", {
            userid = uid, name = pname,
            product = data and data.product or "unknown",
        }, data)
    end)

    -- Wickerbottom (or any character) read a book
    player:ListenForEvent("readbook", function(inst, data)
        if not evt_config.character then return end
        DSTP.PushEvent("book_read", {
            userid = uid, name = pname,
            book = data and data.book and data.book.prefab or "unknown",
        }, data)
    end)

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
end

RegisterPlayerEvents = function(inst)
    inst:ListenForEvent("ms_playerspawn", function(world, player)
        -- Always hook per-player events, even if players category is disabled
        inst:DoTaskInTime(0, function()
            if not player:IsValid() then return end
            RegisterPerPlayerEvents(player)
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
end

RegisterWorldEvents = function(inst)
    inst:ListenForEvent("ms_cyclecomplete", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("new_day", { day = world.state.cycles }, world)
    end)

    -- Day phase (day/dusk/night). Listen to the REAL notification `phasechanged`
    -- (clock.lua:396 pushes it with the phase name on a NATURAL transition), not the
    -- `ms_nextphase` COMMAND event — that only fires when the phase is forced, so
    -- natural day/dusk/night cycling was being missed.
    inst:ListenForEvent("phasechanged", function(world, phase)
        if not evt_config.world then return end
        DSTP.PushEvent("phase_changed", { phase = phase or world.state.phase }, world)
    end)

    -- Season. `seasontick` fires every tick with the current season name; emit
    -- season_changed only when it actually CHANGES (compare to the last one we saw,
    -- mirroring the moonphase pattern). `ms_setseason` was the force-command, so
    -- natural season rollover never fired.
    inst:ListenForEvent("seasontick", function(world, data)
        if not evt_config.world then return end
        local season = (data and data.season) or (world.state and world.state.season)
        if season and inst._dstp_last_season ~= season then
            inst._dstp_last_season = season
            DSTP.PushEvent("season_changed", { season = tostring(season) }, data)
        end
    end)

    inst:ListenForEvent("ms_sendlightningstrike", function(world, pt)
        if not evt_config.weather then return end
        DSTP.PushEvent("lightning_strike", {
            x = pt and pt.x and math.floor(pt.x) or 0,
            z = pt and pt.z and math.floor(pt.z) or 0,
        }, pt)
    end)

    -- Moon phase changed (fires when phase actually changes naturally)
    -- Also listen to ms_setmoonphase for manual/console changes
    local function OnMoonPhase(world, data)
        if not evt_config.world then return end
        local phase = (data and data.moonphase)
            or (data and type(data) == "string" and data)
            or (world.state and world.state.moonphase)
            or "unknown"
        DSTP.PushEvent("moon_phase_changed", {
            phase = tostring(phase),
            is_new = tostring(phase) == "new",
            is_full = tostring(phase) == "full",
        }, data)
    end
    inst:ListenForEvent("moonphasechanged", OnMoonPhase)
    inst:ListenForEvent("ms_setmoonphase", OnMoonPhase)
    -- Fallback: also listen to nightmarephase (triggered each phase transition)
    inst:ListenForEvent("phasechanged", function(world, phase)
        -- Check if moon phase actually changed
        if not evt_config.world then return end
        if world.state and world.state.moonphase and inst._last_moonphase ~= world.state.moonphase then
            local prev = inst._last_moonphase
            inst._last_moonphase = world.state.moonphase
            if prev ~= nil then
                DSTP.PushEvent("moon_phase_changed", {
                    phase = tostring(world.state.moonphase),
                    is_new = tostring(world.state.moonphase) == "new",
                    is_full = tostring(world.state.moonphase) == "full",
                })
            end
        end
    end)

    -- Earthquake started (caves only typically)
    inst:ListenForEvent("ms_earthquake", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("earthquake", {
            shard_type = config.shard_type,
        })
    end)

    -- Sinkhole warning
    inst:ListenForEvent("ms_sinkhole_warn", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("sinkhole_warn", {
            shard_type = config.shard_type,
        })
    end)

    -- World save triggered
    inst:ListenForEvent("ms_save", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("world_save", {})
    end)

    -- Hound attack warning (houndwarningsound fires when hounds are about to attack)
    -- This is on the hounded component of TheWorld
    inst:ListenForEvent("houndwarningsound", function(world)
        if not evt_config.bosses then return end
        DSTP.PushEvent("hound_warning", {
            shard_type = config.shard_type,
        })
    end)

    -- Hound attack begins (when hounds actually spawn)
    inst:ListenForEvent("ms_houndattack", function(world)
        if not evt_config.bosses then return end
        DSTP.PushEvent("hound_attack", {
            shard_type = config.shard_type,
        })
    end)
end

RegisterWeatherEvents = function(inst)
    inst:ListenForEvent("ms_stormchanged", function(world, data)
        if not evt_config.weather then return end
        DSTP.PushEvent("storm_changed", {
            stormtype = data and data.stormtype or "unknown",
            setting = data and data.setting,
        }, data)
    end)

    -- Precipitation. Listen to the REAL `precipitationchanged` (weather.lua:778
    -- pushes it with the precip-type name — "none"/"rain"/"snow" — when rain
    -- naturally starts/stops), not the `ms_forceprecipitation` COMMAND event.
    inst:ListenForEvent("precipitationchanged", function(world, ptype)
        if not evt_config.weather then return end
        DSTP.PushEvent("precipitation", {
            type = ptype,
            enabled = ptype ~= nil and ptype ~= "none",
        }, ptype)
    end)
end

RegisterBossEvents = function(inst)
    local boss_events = {
        "ms_moonboss_was_defeated",
        "ms_lordfruitflykilled",
    }
    for _, evt in ipairs(boss_events) do
        inst:ListenForEvent(evt, function(world, data)
            if not evt_config.bosses then return end
            DSTP.PushEvent("boss_event", { event = evt, data = data }, data)
        end)
    end

    inst:ListenForEvent("entity_death", function(world, data)
        if not evt_config.bosses then return end
        if data and data.inst and not data.inst:HasTag("player") then
            local prefab = data.inst.prefab
            -- Only track notable mobs
            local notable = {
                deerclops = true, bearger = true, moose = true, dragonfly = true,
                antlion = true, beequeen = true, klaus = true, toadstool = true,
                minotaur = true, stalker_atrium = true, alterguardian_phase3 = true,
                crabking = true, malbatross = true, lordfruitfly = true,
                shadowchesspieces = true, nightmare_werepig = true,
            }
            if notable[prefab] then
                DSTP.PushEvent("boss_killed", {
                    prefab = prefab,
                    cause = type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab) or "unknown",
                }, data)
            end
        end
    end)

    -- Fire detection (griefing)
    inst:ListenForEvent("ms_registerfire", function(world, data)
        if not evt_config.bosses then return end
        local fire = data
        if fire then
            local x, _, z = 0, 0, 0
            if fire.Transform then
                x, _, z = fire.Transform:GetWorldPosition()
            end
            DSTP.PushEvent("fire_started", {
                prefab = fire.prefab or "unknown",
                x = math.floor(x),
                z = math.floor(z),
            }, fire)
        end
    end)
end

-- Anti-grief detection: structure_burnt via entity_death + burnable check
RegisterGriefEvents = function(inst)
    inst:ListenForEvent("entity_death", function(world, data)
        if not evt_config.griefing then return end
        local ent = data and data.inst
        if not ent then return end
        -- Only report structures
        if not (ent:HasTag("structure") or (ent.components and ent.components.workable)) then return end
        -- Was it burnt?
        local was_burnt = ent.components and ent.components.burnable and ent.components.burnable.burning
        local is_fire_cause = data.cause == "fire"
            or (data.afflicter and data.afflicter.HasTag and data.afflicter:HasTag("fire"))
        if was_burnt or is_fire_cause then
            local x, _, z = 0, 0, 0
            if ent.Transform then x, _, z = ent.Transform:GetWorldPosition() end
            DSTP.PushEvent("structure_burnt", {
                prefab = ent.prefab or "unknown",
                cause = type(data.cause) == "string" and data.cause or (data.cause and data.cause.prefab) or "fire",
                x = math.floor(x),
                z = math.floor(z),
            }, data)
        end
    end)
end

RegisterGameEvents = function(inst)
    world_inst = inst

    -- Register ALL listeners unconditionally
    -- Each callback checks evt_config at runtime, so categories can be toggled without re-registering
    RegisterPlayerEvents(inst)
    RegisterWorldEvents(inst)
    RegisterWeatherEvents(inst)
    RegisterBossEvents(inst)
    RegisterGriefEvents(inst)

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

-- Send private message to a specific player via net_string
-- SendPrivateMessage now lives in dstp/core (aliased at the top of this file).

-- Issue a one-shot magic link from the backend and call cb(url) with the final
-- URL. `panel_base` is the resolved panel address (e.g. http://localhost:3000)
-- already containing "/?server=...". Falls back to the plain base if the token
-- request fails.
local function IssueLinkAndBuild(panel_base, cb)
    local link_url = config.backend_url .. "/api/panel-auth/issue-link/" .. config.server_id
    if DSTP._DEBUG then Log("IssueLink: GET " .. link_url) end
    _G.TheSim:QueryServer(link_url, function(result, is_ok, http_code)
        local final_url = panel_base
        if is_ok and http_code == 200 and result then
            local ok, parsed = _G.pcall(_G.json.decode, result)
            if ok and parsed and parsed.token then
                final_url = panel_base .. "&access=" .. tostring(parsed.token)
            end
        end
        cb(final_url)
    end, "GET")
end

-- Fetch a one-shot magic link from the backend and call cb(url) with the final URL.
-- Re-resolves the panel address from the relay (/relay-status -> upstream) at click
-- time instead of trusting the value cached at boot. Without this, a #panel issued
-- before the boot-time relay-status reply lands uses the provisional URL, which falls
-- back to the prod domain (https://dstp.marcosbrendon.com) even on a dev/local relay.
-- The two QueryServer calls are CHAINED (relay-status, then issue-link) so they never
-- run concurrently — DST has very few concurrent QueryServer slots.
local function FetchPanelUrlWithToken(cb)
    local status_url = config.backend_url .. "/relay-status"
    _G.TheSim:QueryServer(status_url, function(result, is_ok, http_code)
        local panel_base = config.panel_url  -- fallback: whatever we resolved at boot
        if is_ok and http_code == 200 and result then
            local ok, parsed = _G.pcall(_G.json.decode, result)
            if ok and parsed and type(parsed.upstream) == "string" and parsed.upstream ~= "" then
                panel_base = parsed.upstream .. "/?server=" .. config.server_id
                -- Refresh the cache too, so other paths benefit.
                config.panel_url_base = parsed.upstream
                config.panel_url = panel_base
                if DSTP._DEBUG then Log("FetchPanelUrl: upstream resolved -> " .. tostring(panel_base)) end
            end
        end
        IssueLinkAndBuild(panel_base, cb)
    end, "GET")
end

-- Send panel URL to a specific player (if admin)
SendUrlToAdmin = function(player)
    if not player or not player:IsValid() then return end
    local client_table = _G.TheNet:GetClientTable() or {}
    for _, client in pairs(client_table) do
        if client.userid == player.userid and client.admin then
            FetchPanelUrlWithToken(function(url)
                if player:IsValid() then
                    SendPrivateMessage(player, "Panel: " .. url)
                end
            end)
            return
        end
    end
end

SendUrlToAdmins = function()
    local client_table = _G.TheNet:GetClientTable() or {}
    for _, client in pairs(client_table) do
        if client.admin and client.userid then
            for _, player in ipairs(_G.AllPlayers) do
                if player.userid == client.userid then
                    local captured = player
                    FetchPanelUrlWithToken(function(url)
                        if captured:IsValid() then
                            SendPrivateMessage(captured, "Panel: " .. url)
                        end
                    end)
                end
            end
        end
    end
end

-- First-run nudge: when an admin spawns and the server has no panel password
-- yet, send them the setup link automatically (once per server boot) so the
-- owner doesn't have to know about #panel. Checks /status via the relay; only
-- fires when setup == false (no password). Once configured, this goes quiet.
local owner_notified = false
MaybeNotifyOwnerSetup = function(player)
    if owner_notified or not player or not player:IsValid() then return end
    -- Only for admins.
    local is_admin = false
    for _, client in pairs(_G.TheNet:GetClientTable() or {}) do
        if client.userid == player.userid and client.admin then is_admin = true; break end
    end
    if not is_admin then return end

    local status_url = config.backend_url .. "/api/panel-auth/status/" .. config.server_id
    _G.TheSim:QueryServer(status_url, function(result, is_ok, http_code)
        if not (is_ok and http_code == 200 and result) then return end
        local ok, parsed = _G.pcall(_G.json.decode, result)
        if not (ok and parsed) then return end
        owner_notified = true
        -- setup == false means no password set yet → first run. Tell the admin
        -- to run #panel to start configuring (don't push a link unprompted).
        if parsed.setup == false then
            local captured = player
            if captured:IsValid() then
                SendPrivateMessage(captured, "Painel DSTP ainda nao configurado. Digite #panel no chat para iniciar a configuracao do cluster.")
            end
        end
    end, "GET")
end

-- Hook chat via network message handler
-- Built-in chat commands (client-facing, intercepted before Networking_Say)
-- Return true to suppress the message (not broadcast to chat).
local function HandleBuiltinCommand(userid, name, message, player)
    if not message or type(message) ~= "string" then return false end
    -- Normalize: DST rewrites "/" to "#" on send. Accept both.
    local trimmed = message:match("^%s*(.-)%s*$") or message
    local cmd = trimmed:lower()

    if cmd == "#painel" or cmd == "/painel" or cmd == "#panel" or cmd == "/panel" then
        -- Only admins get the panel link
        local is_admin = false
        for _, client in pairs(_G.TheNet:GetClientTable() or {}) do
            if client.userid == userid and client.admin then
                is_admin = true
                break
            end
        end
        if is_admin and player and player:IsValid() then
            SendUrlToAdmin(player)
        end
        return true -- suppress
    end

    return false
end

HookChat = function()
    local OldNetworkSay = _G.Networking_Say
    if OldNetworkSay then
        _G.Networking_Say = function(guid, userid, name, prefab, message, colour, ...)
            -- Resolve the speaking player from userid
            local speaker = nil
            for _, p in ipairs(_G.AllPlayers or {}) do
                if p.userid == userid then speaker = p; break end
            end

            -- Intercept built-in commands before chat event is pushed
            if HandleBuiltinCommand(userid, name, message, speaker) then
                return -- suppress: do not broadcast, do not push event
            end

            -- A message that starts with the command prefix ("!") is a flow command:
            -- still emit chat_message (so flows react), but DON'T broadcast it to
            -- public chat (silent). Other players never see "!comprar lança".
            local is_command = type(message) == "string"
                and (message:match("^%s*(.-)%s*$") or message):sub(1, #COMMAND_PREFIX) == COMMAND_PREFIX

            DSTP.PushEvent("chat_message", {
                userid = userid,
                name = name,
                message = message,
                prefab = prefab,
                is_command = is_command,
            }, { guid = guid, userid = userid, name = name, prefab = prefab, message = message, colour = colour })

            if is_command then return end  -- suppress broadcast, event already pushed
            return OldNetworkSay(guid, userid, name, prefab, message, colour, ...)
        end
    end
end

-- Hot-toggle: just flip evt_config flags
-- All listeners are already registered and check evt_config at runtime
HotToggleEvents = function(requested)
    if not requested then return end
    local changed = false

    for category, enabled in pairs(requested) do
        if evt_config[category] ~= enabled then
            evt_config[category] = enabled
            changed = true
            if DSTP._DEBUG then Log("Event category '" .. category .. "' " .. (enabled and "ENABLED" or "DISABLED") .. " remotely") end
        end
    end

    if changed then
        local active = {}
        for k, v in pairs(evt_config) do
            if v then table.insert(active, k) end
        end
        if DSTP._DEBUG then Log("Active events: " .. table.concat(active, ", ")) end
    end
end

-------------------------------------------------
-- Init
-------------------------------------------------
function DSTP.Init(mod_env, mod_config)
    -- Inject the mod globals into the shared core FIRST, so core._G/json/config are
    -- populated before any helper (PushEvent/FindPlayer/...) runs. Then mirror them
    -- to this file's local aliases (same GLOBAL reference).
    Core.Init(mod_env.GLOBAL, mod_env.GLOBAL.json, nil)
    _G = Core._G
    json = Core.json

    config.is_auto_id = mod_config.is_auto_id or (mod_config.server_id == "auto")
    config.server_id = mod_config.server_id or "auto"
    if mod_config.backend_url then config.backend_url = mod_config.backend_url end
    if mod_config.panel_url_base and mod_config.panel_url_base ~= "" then
        config.panel_url_base = mod_config.panel_url_base
    else
        config.panel_url_base = config.backend_url
    end
    if mod_config.poll_interval then config.poll_interval = mod_config.poll_interval end
    if mod_config.debug_logs ~= nil then
        config.debug_logs = mod_config.debug_logs
        Core.DEBUG = mod_config.debug_logs
        DSTP._DEBUG = mod_config.debug_logs  -- public alias kept in sync with Core.DEBUG
    end

    -- Event categories config
    if mod_config.events then
        for k, v in pairs(mod_config.events) do
            evt_config[k] = v
        end
    end

    -- Land-claims store (terrain protection). The blocking overrides live in
    -- modmain; here we just init the singleton so the claim_* commands work.
    LandClaims = _G.require("dstp/land_claims").Init({
        GLOBAL = _G, debug_logs = config.debug_logs,
    })
    Core.LandClaims = LandClaims  -- share with core (commands will read it from there)

    Collectors.Init(Core)  -- inject core so collectors can read _G

    Commands.RegisterAll(Core)  -- register the ~55 command handlers

    mod_env.AddPrefabPostInit("world", function(inst)
        if not inst.ismastersim then return end

        -- Detect shard type
        config.shard_type = inst:HasTag("cave") and "caves" or "master"

        -- Attach the persistence component so claims save with the world.
        if not inst.components.dstp_landclaims then
            inst:AddComponent("dstp_landclaims")
        end

        -- Defer 1 frame so TheWorld.meta is fully populated
        inst:DoTaskInTime(0, function()
            -- Resolve server_id from world session_identifier if auto
            if config.is_auto_id then
                local session = _G.TheWorld.meta and _G.TheWorld.meta.session_identifier
                if session then
                    -- Use first 12 chars of session_identifier as unique ID
                    config.server_id = "dst-" .. session:sub(1, 12)
                else
                    LogInfo("WARNING: session_identifier not available, using fallback ID")
                    config.server_id = "dst-" .. tostring(_G.TheWorld.GUID)
                end
            end

            config.shard_id = config.server_id .. ":" .. config.shard_type

            -- Safety: force 1x speed on mod boot. If the previous session
            -- was paused (speed=0), keeping it paused would freeze our own
            -- polling loop (DoTaskInTime pauses with the sim), making the
            -- mod unrecoverable without a client connecting. Resetting
            -- here guarantees the mod always starts responsive.
            _G.pcall(function() _G.TheSim:SetTimeScale(1) end)

            LogInfo("=== DSTP Admin Panel ===")
            LogInfo("Server ID: " .. config.server_id)
            LogInfo("Shard: " .. config.shard_id .. " (" .. config.shard_type .. ")")
            LogInfo("Backend: " .. config.backend_url)
            LogInfo("Poll: " .. config.poll_interval .. "s")
            LogInfo("Debug logs: " .. (config.debug_logs and "ON" or "OFF"))

            -- Build panel URL (provisional; refined once the relay answers).
            config.panel_url = config.panel_url_base .. "/?server=" .. config.server_id
            LogInfo("============================================")
            LogInfo("  DSTP Panel: " .. config.panel_url)
            LogInfo("============================================")

            -- Ask the relay where it points (/relay-status -> upstream) and use
            -- that as the public panel address. The relay is the source of truth
            -- for the domain — nothing is hardcoded. If the relay is offline or
            -- doesn't answer, we keep the provisional URL above (which already
            -- falls back to backend_url/localhost), so this never breaks.
            _G.TheSim:QueryServer(config.backend_url .. "/relay-status", function(result, is_ok, http_code)
                if is_ok and http_code == 200 and result then
                    local ok, parsed = _G.pcall(_G.json.decode, result)
                    if ok and parsed and type(parsed.upstream) == "string" and parsed.upstream ~= "" then
                        config.panel_url_base = parsed.upstream
                        config.panel_url = parsed.upstream .. "/?server=" .. config.server_id
                        LogInfo("  DSTP Panel (via relay): " .. config.panel_url)
                    end
                end
            end, "GET")


            -- Panel URL is NOT auto-sent on boot or spawn anymore.
            -- Admins must use the `#panel` chat command to open the panel.

            RegisterGameEvents(inst)
            -- Only hook chat on master shard to avoid duplicates
            if config.shard_type == "master" then
                HookChat()
            end
            -- Self-scheduling adaptive poll: each cycle picks its own delay.
            local function ScheduleNextPoll()
                local delay = ComputeNextDelay()
                inst:DoTaskInTime(delay, function()
                    DoPoll()
                    ScheduleNextPoll()
                end)
            end
            inst:DoTaskInTime(2, function()
                DoPoll()
                ScheduleNextPoll()
            end)
        end) -- DoTaskInTime(0)
    end)

    return DSTP
end

DSTP.IsConnected = function() return state.connected end
DSTP.GetServerId = function() return config.server_id end
-- Issue a magic link and PM it to the given admin player. Uses the cached
-- panel_url (already resolved from the relay's upstream) + a one-shot token,
-- in a single QueryServer call. This is the canonical #panel path.
DSTP.SendUrlToAdmin = function(player) return SendUrlToAdmin(player) end

return DSTP
