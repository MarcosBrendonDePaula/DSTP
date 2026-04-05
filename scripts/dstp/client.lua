-- DSTP Client - DST Admin Panel Bridge
-- Bidirectional HTTP polling: DST server <-> DSTP backend
-- Focus: player management (stats, inventory, equipment, position)

local DSTP = {}

local _G = nil  -- set in Init()
local json = nil -- set in Init()

-- State
local state = {
    connected = false,
    connection_errors = 0,
    last_successful_poll = 0,
    event_queue = {},
}

local config = {
    server_id = nil,
    shard_id = nil,   -- auto: server_id:master or server_id:caves
    shard_type = nil,  -- "master" or "caves"
    backend_url = "http://127.0.0.1:3000",
    poll_interval = 5,
    max_batch_size = 50,
}

local command_handlers = {}

-------------------------------------------------
-- Logging
-------------------------------------------------
local function Log(msg)
    print("[DSTP] " .. msg)
end

local function LogError(msg)
    print("[DSTP ERROR] " .. msg)
end

-------------------------------------------------
-- JSON helpers
-------------------------------------------------
local function SafeEncode(data)
    local ok, result = pcall(json.encode, data)
    if ok then return result end
    LogError("JSON encode failed: " .. tostring(result))
    return nil
end

local function SafeDecode(str)
    local ok, result = pcall(json.decode, str)
    if ok then return result end
    LogError("JSON decode failed: " .. tostring(result))
    return nil
end

-------------------------------------------------
-- Data collectors
-------------------------------------------------
local function GetServerInfo()
    return {
        name = _G.TheNet:GetServerName() or "DST Server",
        current_players = #_G.AllPlayers,
        max_players = _G.TheNet:GetServerMaxPlayers() or 6,
        is_dedicated = _G.TheNet:IsDedicated(),
        day = _G.TheWorld.state and _G.TheWorld.state.cycles or 0,
        season = _G.TheWorld.state and _G.TheWorld.state.season or "unknown",
        phase = _G.TheWorld.state and _G.TheWorld.state.phase or "unknown",
        is_cave = _G.TheWorld:HasTag("cave"),
        uptime = math.floor(_G.GetTime()),
    }
end

local function SerializeItem(item)
    if not item then return nil end
    local data = {
        prefab = item.prefab,
        name = item:GetDisplayName() or item.prefab,
    }
    if item.components.stackable then
        data.stack = item.components.stackable:StackSize()
        data.max_stack = item.components.stackable.maxsize
    end
    if item.components.finiteuses then
        data.uses = item.components.finiteuses.current
        data.max_uses = item.components.finiteuses.total
    end
    if item.components.armor then
        data.armor = item.components.armor.condition
        data.max_armor = item.components.armor.maxcondition
        data.absorb = item.components.armor.absorb_percent
    end
    if item.components.weapon then
        data.damage = item.components.weapon.damage
    end
    if item.components.perishable then
        data.perish_remaining = item.components.perishable:GetPercent()
    end
    if item.components.fueled then
        data.fuel = item.components.fueled.currentfuel
        data.max_fuel = item.components.fueled.maxfuel
    end
    return data
end

local function GetPlayerInventory(player)
    local inv = player.components.inventory
    if not inv then return nil end

    local items = {}
    for i, item in pairs(inv.itemslots or {}) do
        items[tostring(i)] = SerializeItem(item)
    end

    local equips = {}
    for k, item in pairs(inv.equipslots or {}) do
        equips[k] = SerializeItem(item)
    end

    local backpack = nil
    local bp = inv:GetOverflowContainer()
    if bp then
        backpack = {
            prefab = bp.inst and bp.inst.prefab or "unknown",
            items = {},
        }
        for i, item in pairs(bp.slots or {}) do
            backpack.items[tostring(i)] = SerializeItem(item)
        end
    end

    return {
        items = items,
        equips = equips,
        backpack = backpack,
    }
end

local function GetPlayerBuffs(player)
    local buffs = {}

    if player.components.moisture then
        buffs.moisture = math.floor(player.components.moisture:GetMoisture())
    end
    if player.components.temperature then
        buffs.temperature = math.floor(player.components.temperature:GetCurrent())
    end
    if player:HasTag("playerghost") then
        buffs.is_ghost = true
    end
    if player:HasTag("beaver") then
        buffs.is_beaver = true
    end
    if player.components.mightiness then
        buffs.mightiness = math.floor(player.components.mightiness:GetPercent() * 100)
    end
    if player.components.hunger and player.components.hunger:IsStarving() then
        buffs.is_starving = true
    end
    if player.components.combat and player.components.combat.target then
        buffs.in_combat = true
        buffs.combat_target = player.components.combat.target.prefab or "unknown"
    end

    return buffs
end

-- Cache client table (refreshed each poll cycle)
local cached_client_table = {}
local function RefreshClientTable()
    cached_client_table = {}
    for _, client in pairs(_G.TheNet:GetClientTable() or {}) do
        if client.userid then
            cached_client_table[client.userid] = client
        end
    end
end

local function GetPlayerData(player)
    local x, y, z = player.Transform:GetWorldPosition()
    local client_info = cached_client_table[player.userid]

    local data = {
        userid = player.userid,
        name = player.name,
        prefab = player.prefab,
        admin = client_info and client_info.admin or false,
        age = player.components.age and math.floor(player.components.age:GetAgeInDays()) or 0,
        position = { x = math.floor(x), y = math.floor(y), z = math.floor(z) },
    }

    if player.components.health then
        data.health = {
            current = math.floor(player.components.health.currenthealth),
            max = math.floor(player.components.health.maxhealth),
            invincible = player.components.health.invincible or false,
        }
    end

    if player.components.hunger then
        data.hunger = {
            current = math.floor(player.components.hunger.current),
            max = math.floor(player.components.hunger.max),
        }
    end

    if player.components.sanity then
        data.sanity = {
            current = math.floor(player.components.sanity.current),
            max = math.floor(player.components.sanity.max),
        }
    end

    data.inventory = GetPlayerInventory(player)
    data.buffs = GetPlayerBuffs(player)

    return data
end

local function GetAllPlayersData()
    local players = {}
    for _, player in ipairs(_G.AllPlayers) do
        local ok, data = pcall(GetPlayerData, player)
        if ok and data then
            table.insert(players, data)
        end
    end
    return players
end

-------------------------------------------------
-- Event Queue
-------------------------------------------------
function DSTP.PushEvent(event_type, data)
    table.insert(state.event_queue, {
        type = event_type,
        timestamp = _G.GetTime(),
        data = data or {},
    })
    while #state.event_queue > config.max_batch_size * 2 do
        table.remove(state.event_queue, 1)
    end
end

-------------------------------------------------
-- Command system
-------------------------------------------------
function DSTP.RegisterCommand(command_type, handler)
    command_handlers[command_type] = handler
end

local function ExecuteCommand(cmd)
    local handler = command_handlers[cmd.type]
    if not handler then
        LogError("Unknown command: " .. tostring(cmd.type))
        return false
    end
    local ok, err = pcall(handler, cmd.data or {})
    if not ok then
        LogError("Command '" .. cmd.type .. "' failed: " .. tostring(err))
        return false
    end
    return true
end

local function ProcessCommands(commands)
    if not commands then return end
    for _, cmd in ipairs(commands) do
        Log("Exec: " .. tostring(cmd.type))
        ExecuteCommand(cmd)
    end
end

-------------------------------------------------
-- Player helper
-------------------------------------------------
local function FindPlayer(userid)
    for _, player in ipairs(_G.AllPlayers) do
        if player.userid == userid then return player end
    end
    return nil
end

-------------------------------------------------
-- Built-in commands (player management)
-------------------------------------------------
local function RegisterBuiltinCommands()
    DSTP.RegisterCommand("announce", function(data)
        if data.message then _G.TheNet:Announce(data.message) end
    end)

    DSTP.RegisterCommand("chat_send", function(data)
        if data.message then
            local name = data.name or "[DSTP Admin]"
            _G.TheNet:Announce(name .. ": " .. data.message)
        end
    end)

    DSTP.RegisterCommand("kick", function(data)
        if data.userid then _G.TheNet:Kick(data.userid) end
    end)

    DSTP.RegisterCommand("ban", function(data)
        if data.userid then _G.TheNet:Ban(data.userid) end
    end)

    DSTP.RegisterCommand("add_admin", function(data)
        if data.userid then
            _G.TheNet:SetIsClientAdmin(data.userid, true)
            Log("Admin added: " .. tostring(data.userid))
        end
    end)

    DSTP.RegisterCommand("remove_admin", function(data)
        if data.userid then
            _G.TheNet:SetIsClientAdmin(data.userid, false)
            Log("Admin removed: " .. tostring(data.userid))
        end
    end)

    DSTP.RegisterCommand("kill", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.health then
            player.components.health:Kill()
        end
    end)

    DSTP.RegisterCommand("respawn", function(data)
        local player = FindPlayer(data.userid)
        if player and player:HasTag("playerghost") then
            player:PushEvent("respawnfromghost")
        end
    end)

    DSTP.RegisterCommand("heal", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.health then
            player.components.health:DoDelta(data.amount or player.components.health.maxhealth)
        end
    end)

    DSTP.RegisterCommand("feed", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.hunger then
            player.components.hunger:DoDelta(data.amount or player.components.hunger.max)
        end
    end)

    DSTP.RegisterCommand("restore_sanity", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.sanity then
            player.components.sanity:DoDelta(data.amount or player.components.sanity.max)
        end
    end)

    DSTP.RegisterCommand("godmode", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.health then
            local enable = data.enabled ~= false
            player.components.health:SetInvincible(enable)
            player.components.health.invincible = enable
            Log("Godmode " .. (enable and "ON" or "OFF") .. " for " .. tostring(player.name))
        else
            LogError("Godmode: player not found or no health - " .. tostring(data.userid))
        end
    end)

    DSTP.RegisterCommand("give_item", function(data)
        local player = FindPlayer(data.userid)
        if player and data.prefab then
            local item = _G.SpawnPrefab(data.prefab)
            if item then
                if data.count and item.components.stackable then
                    item.components.stackable:SetStackSize(data.count)
                end
                player.components.inventory:GiveItem(item)
            end
        end
    end)

    DSTP.RegisterCommand("remove_inventory", function(data)
        local player = FindPlayer(data.userid)
        if player then
            local inv = player.components.inventory
            if inv and data.slot and inv.itemslots[tonumber(data.slot)] then
                local item = inv.itemslots[tonumber(data.slot)]
                inv:RemoveItem(item)
                item:Remove()
            end
        end
    end)

    DSTP.RegisterCommand("teleport", function(data)
        local player = FindPlayer(data.userid)
        if player and data.x and data.z then
            player.Transform:SetPosition(data.x, 0, data.z)
        end
    end)

    DSTP.RegisterCommand("teleport_to_player", function(data)
        local player = FindPlayer(data.userid)
        local target = FindPlayer(data.target_userid)
        if player and target then
            local x, y, z = target.Transform:GetWorldPosition()
            player.Transform:SetPosition(x, y, z)
        end
    end)

    DSTP.RegisterCommand("execute", function(data)
        if data.lua then
            local fn, err = loadstring(data.lua)
            if fn then
                local ok, result = pcall(fn)
                if not ok then LogError("Execute failed: " .. tostring(result)) end
            else
                LogError("Execute parse error: " .. tostring(err))
            end
        end
    end)

    DSTP.RegisterCommand("rollback", function(data)
        _G.TheNet:SendWorldRollbackRequestToServer(data.days or 0)
    end)

    DSTP.RegisterCommand("regenerate", function(data)
        _G.TheWorld:DoTaskInTime(0, function()
            _G.TheNet:SendWorldResetRequestToServer()
        end)
    end)

    -- World control commands
    DSTP.RegisterCommand("set_season", function(data)
        if data.season then
            _G.TheWorld:PushEvent("ms_setseason", data.season)
        end
    end)

    DSTP.RegisterCommand("set_phase", function(data)
        if data.phase then
            _G.TheWorld:PushEvent("ms_setphase", data.phase)
        end
    end)

    DSTP.RegisterCommand("set_next_phase", function(data)
        _G.TheWorld:PushEvent("ms_nextphase")
    end)

    DSTP.RegisterCommand("set_rain", function(data)
        _G.TheWorld:PushEvent("ms_forceprecipitation", data.enabled ~= false)
    end)

    DSTP.RegisterCommand("stop_rain", function(data)
        _G.TheWorld:PushEvent("ms_forceprecipitation", false)
    end)

    DSTP.RegisterCommand("set_snow", function(data)
        if _G.TheWorld.components.moisture then
            _G.TheWorld.components.moisture:SetMoistureFloor(data.enabled ~= false and 250 or 0)
        end
    end)

    DSTP.RegisterCommand("lightning", function(data)
        if _G.TheWorld.components.lightningstrikemanager then
            local player = data.userid and FindPlayer(data.userid)
            if player then
                local x, y, z = player.Transform:GetWorldPosition()
                _G.TheWorld.components.lightningstrikemanager:DoLightningStrike(x, y, z)
            end
        end
    end)

    DSTP.RegisterCommand("set_day_length", function(data)
        if data.day and data.dusk and data.night then
            _G.TheWorld:PushEvent("ms_setclocksegs", {day = data.day, dusk = data.dusk, night = data.night})
        end
    end)

    DSTP.RegisterCommand("skip_day", function(data)
        local days = data.days or 1
        for i = 1, days do
            _G.TheWorld:PushEvent("ms_nextcycle")
        end
    end)

    DSTP.RegisterCommand("set_speed", function(data)
        local speed = data.speed or 1
        _G.TheSim:SetTimeScale(speed)
        Log("Time scale set to " .. tostring(speed))
    end)

    DSTP.RegisterCommand("pause", function(data)
        _G.TheSim:SetTimeScale(0)
        _G.TheNet:Announce("[DSTP] Server PAUSED")
        Log("Server paused")
    end)

    DSTP.RegisterCommand("unpause", function(data)
        _G.TheSim:SetTimeScale(1)
        _G.TheNet:Announce("[DSTP] Server RESUMED")
        Log("Server unpaused")
    end)

    DSTP.RegisterCommand("set_season_length", function(data)
        if data.season and data.length then
            _G.TheWorld:PushEvent("ms_setseasonlength", {season = data.season, length = data.length})
        end
    end)

    DSTP.RegisterCommand("spawn_prefab", function(data)
        if data.prefab and data.x and data.z then
            local ent = _G.SpawnPrefab(data.prefab)
            if ent then
                ent.Transform:SetPosition(data.x, 0, data.z)
                local count = data.count or 1
                if count > 1 and ent.components.stackable then
                    ent.components.stackable:SetStackSize(count)
                end
            end
        end
    end)

    DSTP.RegisterCommand("remove_near", function(data)
        if data.prefab and data.x and data.z then
            local radius = data.radius or 10
            local x, z = data.x, data.z
            local ents = _G.TheSim:FindEntities(x, 0, z, radius, nil, nil, nil)
            local removed = 0
            for _, ent in ipairs(ents) do
                if ent.prefab == data.prefab then
                    ent:Remove()
                    removed = removed + 1
                    if data.limit and removed >= data.limit then break end
                end
            end
        end
    end)
end

-------------------------------------------------
-- Polling
-------------------------------------------------
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
                        ProcessCommands(data.commands)
                    end
                    -- Hot-toggle event categories from backend
                    if data.enable_events then
                        HotToggleEvents(data.enable_events)
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
local evt_config = {}
local evt_initialized = {}  -- tracks which categories have been registered
local world_inst = nil      -- reference to TheWorld for hot-toggle

-- Hot-toggle: enable/disable event categories at runtime
local function HotToggleEvents(requested)
    if not requested or not world_inst then return end
    local changed = false

    for category, enabled in pairs(requested) do
        if evt_config[category] ~= enabled then
            evt_config[category] = enabled
            changed = true
            Log("Event category '" .. category .. "' " .. (enabled and "ENABLED" or "DISABLED") .. " remotely")

            -- Register new listeners if enabling a category not yet initialized
            if enabled and not evt_initialized[category] then
                evt_initialized[category] = true
                if category == "players" then
                    RegisterPlayerEvents(world_inst)
                elseif category == "world" then
                    RegisterWorldEvents(world_inst)
                elseif category == "weather" then
                    RegisterWeatherEvents(world_inst)
                elseif category == "bosses" then
                    RegisterBossEvents(world_inst)
                elseif category == "chat" and config.shard_type == "master" then
                    HookChat()
                elseif category == "combat" or category == "crafting" or category == "inventory" or category == "health" then
                    -- Re-hook per-player events for all current players
                    hooked_players = {}
                    for _, player in ipairs(_G.AllPlayers) do
                        RegisterPerPlayerEvents(player)
                    end
                end
            end
        end
    end

    if changed then
        local active = {}
        for k, v in pairs(evt_config) do
            if v then table.insert(active, k) end
        end
        Log("Active events: " .. table.concat(active, ", "))
    end
end

local function RegisterPlayerEvents(inst)
    inst:ListenForEvent("ms_playerspawn", function(world, player)
        DSTP.PushEvent("player_spawn", {
            userid = player.userid,
            name = player.name,
            prefab = player.prefab,
        })
        -- Hook per-player events on new players
        RegisterPerPlayerEvents(player)
    end)

    inst:ListenForEvent("ms_playerleft", function(world, player)
        DSTP.PushEvent("player_left", {
            userid = player.userid,
            name = player.name,
        })
    end)

    inst:ListenForEvent("entity_death", function(world, data)
        if data and data.inst and data.inst:HasTag("player") then
            DSTP.PushEvent("player_death", {
                userid = data.inst.userid,
                name = data.inst.name,
                cause = data.cause or "unknown",
            })
        end
    end)

    inst:ListenForEvent("ms_becameghost", function(world, player)
        DSTP.PushEvent("player_ghost", { userid = player.userid, name = player.name })
    end)

    inst:ListenForEvent("ms_respawnedfromghost", function(world, player)
        DSTP.PushEvent("player_respawn", { userid = player.userid, name = player.name })
    end)
end

local function RegisterWorldEvents(inst)
    inst:ListenForEvent("ms_cyclecomplete", function(world)
        DSTP.PushEvent("new_day", { day = world.state.cycles })
    end)

    inst:ListenForEvent("ms_nextphase", function(world)
        DSTP.PushEvent("phase_changed", { phase = world.state.phase })
    end)

    inst:ListenForEvent("ms_setseason", function(world, season)
        DSTP.PushEvent("season_changed", { season = tostring(season) })
    end)
end

local function RegisterWeatherEvents(inst)
    inst:ListenForEvent("ms_stormchanged", function(world, data)
        DSTP.PushEvent("storm_changed", {
            stormtype = data and data.stormtype or "unknown",
            setting = data and data.setting,
        })
    end)

    inst:ListenForEvent("ms_forceprecipitation", function(world, enabled)
        DSTP.PushEvent("precipitation", { enabled = enabled })
    end)
end

local function RegisterBossEvents(inst)
    local boss_events = {
        "ms_moonboss_was_defeated",
        "beargerkilled",
        "hasslerkilled",
        "ms_lordfruitflykilled",
    }
    for _, evt in ipairs(boss_events) do
        inst:ListenForEvent(evt, function(world, data)
            DSTP.PushEvent("boss_event", { event = evt, data = data })
        end)
    end

    -- Track any entity death that's not a player (for notable mob kills)
    inst:ListenForEvent("entity_death", function(world, data)
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
                    cause = data.cause or "unknown",
                })
            end
        end
    end)
end

-- Per-player events (combat, crafting, inventory, health)
local hooked_players = {}
local function RegisterPerPlayerEvents(player)
    if not player or hooked_players[player.userid] then return end
    hooked_players[player.userid] = true

    local uid = player.userid
    local pname = player.name

    if evt_config.combat then
        player:ListenForEvent("killed", function(inst, data)
            DSTP.PushEvent("player_kill", {
                userid = uid, name = pname,
                victim = data and data.victim and data.victim.prefab or "unknown",
            })
        end)

        player:ListenForEvent("attacked", function(inst, data)
            DSTP.PushEvent("player_attacked", {
                userid = uid, name = pname,
                attacker = data and data.attacker and data.attacker.prefab or "unknown",
                damage = data and data.damage or 0,
            })
        end)
    end

    if evt_config.crafting then
        player:ListenForEvent("builditem", function(inst, data)
            DSTP.PushEvent("player_craft", {
                userid = uid, name = pname,
                item = data and data.item and data.item.prefab or "unknown",
                recipe = data and data.recipe and data.recipe.name or "unknown",
            })
        end)

        player:ListenForEvent("buildstructure", function(inst, data)
            DSTP.PushEvent("player_build", {
                userid = uid, name = pname,
                item = data and data.item and data.item.prefab or "unknown",
            })
        end)
    end

    if evt_config.inventory then
        player:ListenForEvent("equip", function(inst, data)
            DSTP.PushEvent("player_equip", {
                userid = uid, name = pname,
                item = data and data.item and data.item.prefab or "unknown",
                slot = data and data.eslot or "unknown",
            })
        end)

        player:ListenForEvent("onpickupitem", function(inst, data)
            DSTP.PushEvent("player_pickup", {
                userid = uid, name = pname,
                item = data and data.item and data.item.prefab or "unknown",
            })
        end)

        player:ListenForEvent("dropitem", function(inst, data)
            DSTP.PushEvent("player_drop", {
                userid = uid, name = pname,
                item = data and data.item and data.item.prefab or "unknown",
            })
        end)
    end

    if evt_config.health then
        player:ListenForEvent("healthdelta", function(inst, data)
            DSTP.PushEvent("health_delta", {
                userid = uid, name = pname,
                old = data and data.oldpercent or 0,
                new = data and data.newpercent or 0,
                amount = data and data.amount or 0,
            })
        end)

        player:ListenForEvent("hungerdelta", function(inst, data)
            DSTP.PushEvent("hunger_delta", {
                userid = uid, name = pname,
                old = data and data.oldpercent or 0,
                new = data and data.newpercent or 0,
            })
        end)

        player:ListenForEvent("sanitydelta", function(inst, data)
            DSTP.PushEvent("sanity_delta", {
                userid = uid, name = pname,
                old = data and data.oldpercent or 0,
                new = data and data.newpercent or 0,
            })
        end)
    end
end

local function RegisterGameEvents(inst)
    world_inst = inst

    if evt_config.players then
        RegisterPlayerEvents(inst)
        evt_initialized.players = true
    end

    if evt_config.world then
        RegisterWorldEvents(inst)
        evt_initialized.world = true
    end

    if evt_config.weather then
        RegisterWeatherEvents(inst)
        evt_initialized.weather = true
    end

    if evt_config.bosses then
        RegisterBossEvents(inst)
        evt_initialized.bosses = true
    end

    -- Hook per-player events for existing players
    if evt_config.combat or evt_config.crafting or evt_config.inventory or evt_config.health then
        for _, player in ipairs(_G.AllPlayers) do
            RegisterPerPlayerEvents(player)
        end
        evt_initialized.combat = evt_config.combat
        evt_initialized.crafting = evt_config.crafting
        evt_initialized.inventory = evt_config.inventory
        evt_initialized.health = evt_config.health
    end

    local enabled = {}
    for k, v in pairs(evt_config) do
        if v then table.insert(enabled, k) end
    end
    Log("Event categories: " .. table.concat(enabled, ", "))
end

-- Send panel URL to a specific player (if admin)
local function SendUrlToAdmin(player)
    if not player or not player:IsValid() then return end
    local client_table = _G.TheNet:GetClientTable() or {}
    for _, client in pairs(client_table) do
        if client.userid == player.userid and client.admin then
            -- Use Announce with player name prefix so they know it's for them
            _G.TheNet:Announce("[DSTP] " .. player.name .. ", painel: " .. config.panel_url)
            return
        end
    end
end

local function SendUrlToAdmins()
    local client_table = _G.TheNet:GetClientTable() or {}
    local admin_found = false
    for _, client in pairs(client_table) do
        if client.admin then
            admin_found = true
            break
        end
    end
    if admin_found then
        _G.TheNet:Announce("[DSTP] Panel: " .. config.panel_url)
    end
end

-- Hook chat via network message handler
local function HookChat()
    local OldNetworkSay = _G.Networking_Say
    if OldNetworkSay then
        _G.Networking_Say = function(guid, userid, name, prefab, message, colour, ...)
            DSTP.PushEvent("chat_message", {
                userid = userid,
                name = name,
                message = message,
                prefab = prefab,
            })
            return OldNetworkSay(guid, userid, name, prefab, message, colour, ...)
        end
    end
end

-------------------------------------------------
-- Init
-------------------------------------------------
function DSTP.Init(mod_env, mod_config)
    -- Set globals from mod environment
    _G = mod_env.GLOBAL
    json = _G.json

    config.is_auto_id = mod_config.is_auto_id or (mod_config.server_id == "auto")
    config.server_id = mod_config.server_id or "auto"
    if mod_config.backend_url then config.backend_url = mod_config.backend_url end
    if mod_config.poll_interval then config.poll_interval = mod_config.poll_interval end

    -- Event categories config
    if mod_config.events then
        for k, v in pairs(mod_config.events) do
            evt_config[k] = v
        end
    end

    RegisterBuiltinCommands()

    mod_env.AddPrefabPostInit("world", function(inst)
        if not inst.ismastersim then return end

        -- Detect shard type
        config.shard_type = inst:HasTag("cave") and "caves" or "master"

        -- Resolve server_id from world session_identifier if auto
        if config.is_auto_id then
            local session = _G.TheWorld.meta and _G.TheWorld.meta.session_identifier
            if session then
                -- Use first 12 chars of session_identifier as unique ID
                config.server_id = "dst-" .. session:sub(1, 12)
            end
        end

        config.shard_id = config.server_id .. ":" .. config.shard_type

        Log("=== DSTP Admin Panel ===")
        Log("Server ID: " .. config.server_id)
        Log("Shard: " .. config.shard_id .. " (" .. config.shard_type .. ")")
        Log("Backend: " .. config.backend_url)
        Log("Poll: " .. config.poll_interval .. "s")

        -- Build panel URL
        config.panel_url = config.backend_url .. "/?server=" .. config.server_id
        Log("============================================")
        Log("  DSTP Panel: " .. config.panel_url)
        Log("============================================")

        -- On master shard: whisper URL to admins when they join
        if config.shard_type == "master" then
            -- Send to currently connected admins on startup
            inst:DoTaskInTime(5, function()
                SendUrlToAdmins()
            end)

            -- Send to admins when they join
            inst:ListenForEvent("ms_playerspawn", function(world, player)
                inst:DoTaskInTime(3, function()
                    if player and player:IsValid() then
                        SendUrlToAdmin(player)
                    end
                end)
            end)
        end

        RegisterGameEvents(inst)
        -- Only hook chat on master shard to avoid duplicates
        if config.shard_type == "master" then
            HookChat()
        end
        inst:DoPeriodicTask(config.poll_interval, DoPoll)
        inst:DoTaskInTime(2, DoPoll)
    end)

    return DSTP
end

DSTP.IsConnected = function() return state.connected end

return DSTP
