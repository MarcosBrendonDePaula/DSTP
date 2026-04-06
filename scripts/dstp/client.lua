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
    dump_mode = false,  -- when true, events include raw DST data
}

local command_handlers = {}
local evt_config = {}
local evt_initialized = {}
local world_inst = nil
local hooked_players = {}

-- Forward declarations (DST strict mode requires variables to exist before reference)
local SendPrivateMessage
local SendUrlToAdmin
local SendUrlToAdmins
local HookChat
local HotToggleEvents
local RegisterPerPlayerEvents
local RegisterPlayerEvents
local RegisterWorldEvents
local RegisterWeatherEvents
local RegisterBossEvents
local RegisterGameEvents

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
-- Event Queue (with debounce)
-------------------------------------------------

-- Debounce config: event_type -> minimum seconds between events
-- Updated remotely via sync response
local event_debounce = {
    phase_changed = 1,
    season_changed = 5,
    health_delta = 1,
    hunger_delta = 1,
    sanity_delta = 1,
    storm_changed = 5,
    precipitation = 5,
}
local last_event_time = {} -- event_type -> last GetTime()

-- Safe dump of a Lua table (handles entities, userdata, circular refs)
local function SafeDump(obj, depth, seen)
    if depth and depth > 3 then return "<max depth>" end
    if obj == nil then return nil end
    local t = type(obj)
    if t == "string" or t == "number" or t == "boolean" then return obj end
    if t == "userdata" then return "<userdata>" end
    if t == "function" then return "<function>" end
    if t ~= "table" then return tostring(obj) end

    seen = seen or {}
    if seen[obj] then return "<circular>" end
    seen[obj] = true

    local result = {}
    local count = 0
    for k, v in pairs(obj) do
        local key = type(k) == "string" and k or tostring(k)
        -- Skip internal/heavy fields
        if key ~= "entity" and key ~= "Transform" and key ~= "AnimState" and key ~= "Physics"
           and key ~= "SoundEmitter" and key ~= "Network" and key ~= "Light" and key ~= "DynamicShadow"
           and not key:match("^_") then
            if count >= 20 then result["..."] = "truncated"; break end
            result[key] = SafeDump(v, (depth or 0) + 1, seen)
            count = count + 1
        end
    end

    -- Add useful entity info if available
    if obj.prefab then result["_prefab"] = obj.prefab end
    if obj.userid then result["_userid"] = obj.userid end
    if obj.name and type(obj.name) == "string" then result["_name"] = obj.name end
    if obj.GUID then result["_GUID"] = obj.GUID end

    return result
end

function DSTP.PushEvent(event_type, data, raw_data)
    -- Debounce check
    local debounce = event_debounce[event_type]
    if debounce then
        local now = _G.GetTime()
        local last = last_event_time[event_type] or 0
        if now - last < debounce then
            return -- skip, too soon
        end
        last_event_time[event_type] = now
    end

    -- Merge raw DST data into event data so flows have access to everything
    -- Only merge plain data tables, NOT entity objects (which have GUID/entity/Transform)
    local merged = data or {}
    if raw_data and type(raw_data) == "table" and not raw_data.GUID and not raw_data.entity then
        local ok, dumped = pcall(SafeDump, raw_data)
        if ok and type(dumped) == "table" then
            for k, v in pairs(dumped) do
                if merged[k] == nil then
                    merged[k] = v
                end
            end
        end
    end

    local event = {
        type = event_type,
        timestamp = _G.GetTime(),
        data = merged,
    }

    -- If dump mode is active, also keep the full raw separately
    if config.dump_mode and raw_data then
        local ok, dumped = pcall(SafeDump, raw_data)
        if ok then
            event.raw = dumped
        end
    end

    table.insert(state.event_queue, event)
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
            DSTP.PushEvent("chat_message", {
                userid = "dstp",
                name = name,
                message = data.message,
                prefab = "system",
            })
        end
    end)

    DSTP.RegisterCommand("private_message", function(data)
        if data.userid and data.message then
            local player = FindPlayer(data.userid)
            if player then
                SendPrivateMessage(player, data.message)
            end
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
        Log("Respawn command: userid=" .. tostring(data.userid))
        local player = FindPlayer(data.userid)
        if player then
            Log("  Found player: " .. tostring(player.name) .. " ghost=" .. tostring(player:HasTag("playerghost")))
            if player:HasTag("playerghost") then
                player:PushEvent("respawnfromghost")
                Log("  Respawned!")
            else
                Log("  Player is NOT a ghost, skipping")
            end
        else
            Log("  Player NOT found for userid: " .. tostring(data.userid))
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
                setfenv(fn, _G)
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

    -- Spawn prefab at player's position (or with offset)
    DSTP.RegisterCommand("spawn_at_player", function(data)
        local player = FindPlayer(data.userid)
        if player and data.prefab then
            local x, _, z = player.Transform:GetWorldPosition()
            local ox, oz = tonumber(data.offset_x) or 0, tonumber(data.offset_z) or 0
            local ent = _G.SpawnPrefab(data.prefab)
            if ent then
                ent.Transform:SetPosition(x + ox, 0, z + oz)
                local count = tonumber(data.count) or 1
                if count > 1 and ent.components.stackable then
                    ent.components.stackable:SetStackSize(count)
                end
                Log("Spawned " .. data.prefab .. " at " .. player.name)
            end
        end
    end)

    -- Remove entities near a player
    DSTP.RegisterCommand("remove_near_player", function(data)
        local player = FindPlayer(data.userid)
        if player and data.prefab then
            local x, _, z = player.Transform:GetWorldPosition()
            local radius = tonumber(data.radius) or 10
            local ents = _G.TheSim:FindEntities(x, 0, z, radius, nil, nil, nil)
            local removed = 0
            local limit = tonumber(data.limit) or 999
            for _, ent in ipairs(ents) do
                if ent.prefab == data.prefab and ent ~= player then
                    ent:Remove()
                    removed = removed + 1
                    if removed >= limit then break end
                end
            end
            Log("Removed " .. removed .. "x " .. data.prefab .. " near " .. player.name)
        end
    end)

    -- Destroy/hammer a structure at coordinates
    DSTP.RegisterCommand("destroy_structure", function(data)
        if data.x and data.z then
            local radius = tonumber(data.radius) or 3
            local ents = _G.TheSim:FindEntities(data.x, 0, data.z, radius, nil, nil, nil)
            for _, ent in ipairs(ents) do
                if (not data.prefab or ent.prefab == data.prefab) and ent.components and ent.components.workable then
                    ent.components.workable:Destroy(ent)
                    Log("Destroyed " .. ent.prefab)
                    if not data.all then break end
                end
            end
        end
    end)

    DSTP.RegisterCommand("set_dump_mode", function(data)
        config.dump_mode = data.enabled ~= false
        Log("Dump mode: " .. tostring(config.dump_mode))
    end)

    -- UI Widget commands: send JSON command to a specific player's client
    -- data = { userid = "KU_xxx", cmd = { action="create", id="...", type="...", ... } }
    -- or data = { userid = "KU_xxx", cmd = { action="batch", commands = [{...}, ...] } }
    DSTP.RegisterCommand("ui_command", function(data)
        if not data.userid or not data.cmd then
            LogError("ui_command: missing userid or cmd")
            return
        end
        local player = FindPlayer(data.userid)
        if not player then
            LogError("ui_command: player not found: " .. tostring(data.userid))
            return
        end
        if not player.player_classified or not player.player_classified._dstp_ui then
            LogError("ui_command: player has no _dstp_ui net_string")
            return
        end
        local json_str = SafeEncode(data.cmd)
        if not json_str then
            LogError("ui_command: failed to encode cmd")
            return
        end
        player.player_classified._dstp_ui:set(json_str)
        Log("ui_command sent to " .. tostring(data.userid) .. ": " .. tostring(data.cmd.action))
    end)

    -- Broadcast UI command to all connected players
    -- data = { cmd = { action="create", ... } }
    DSTP.RegisterCommand("ui_broadcast", function(data)
        if not data.cmd then
            LogError("ui_broadcast: missing cmd")
            return
        end
        local json_str = SafeEncode(data.cmd)
        if not json_str then
            LogError("ui_broadcast: failed to encode cmd")
            return
        end
        for _, player in ipairs(_G.AllPlayers) do
            if player.player_classified and player.player_classified._dstp_ui then
                player.player_classified._dstp_ui:set(json_str)
            end
        end
        Log("ui_broadcast: " .. tostring(data.cmd.action) .. " to " .. #_G.AllPlayers .. " players")
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
                        ProcessCommands(data.commands)
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
-- (evt_config, evt_initialized, world_inst declared at top of module)

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
            Log("WARNING: Could not hook player events - userid still empty after retries")
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

    -- Player started a fire
    player:ListenForEvent("onstartedfire", function(inst, data)
        if not evt_config.gathering then return end
        DSTP.PushEvent("player_startfire", {
            userid = uid, name = pname,
            target = data and data.target and data.target.prefab or "unknown",
        }, data)
    end)
end

RegisterPlayerEvents = function(inst)
    inst:ListenForEvent("ms_playerspawn", function(world, player)
        -- Always hook per-player events, even if players category is disabled
        inst:DoTaskInTime(0, function()
            if not player:IsValid() then return end
            RegisterPerPlayerEvents(player)
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

    inst:ListenForEvent("ms_nextphase", function(world)
        if not evt_config.world then return end
        DSTP.PushEvent("phase_changed", { phase = world.state.phase }, world)
    end)

    inst:ListenForEvent("ms_setseason", function(world, season)
        if not evt_config.world then return end
        DSTP.PushEvent("season_changed", { season = tostring(season) }, season)
    end)

    inst:ListenForEvent("ms_sendlightningstrike", function(world, pt)
        if not evt_config.weather then return end
        DSTP.PushEvent("lightning_strike", {
            x = pt and pt.x and math.floor(pt.x) or 0,
            z = pt and pt.z and math.floor(pt.z) or 0,
        }, pt)
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

    inst:ListenForEvent("ms_forceprecipitation", function(world, enabled)
        if not evt_config.weather then return end
        DSTP.PushEvent("precipitation", { enabled = enabled }, enabled)
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

RegisterGameEvents = function(inst)
    world_inst = inst

    -- Register ALL listeners unconditionally
    -- Each callback checks evt_config at runtime, so categories can be toggled without re-registering
    RegisterPlayerEvents(inst)
    RegisterWorldEvents(inst)
    RegisterWeatherEvents(inst)
    RegisterBossEvents(inst)

    -- Hook per-player events for existing players
    for _, player in ipairs(_G.AllPlayers) do
        RegisterPerPlayerEvents(player)
    end

    local enabled = {}
    for k, v in pairs(evt_config) do
        if v then table.insert(enabled, k) end
    end
    Log("Event categories: " .. table.concat(enabled, ", "))
end

-- Send private message to a specific player via net_string
SendPrivateMessage = function(player, message)
    if not player or not player:IsValid() then return end
    if player.player_classified and player.player_classified._dstp_pm then
        player.player_classified._dstp_pm:set(message)
        Log("PM to " .. tostring(player.name) .. ": " .. message)
    end
end

-- Send panel URL to a specific player (if admin)
SendUrlToAdmin = function(player)
    if not player or not player:IsValid() then return end
    local client_table = _G.TheNet:GetClientTable() or {}
    for _, client in pairs(client_table) do
        if client.userid == player.userid and client.admin then
            SendPrivateMessage(player, "Panel: " .. config.panel_url)
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
                    SendPrivateMessage(player, "Panel: " .. config.panel_url)
                end
            end
        end
    end
end

-- Hook chat via network message handler
HookChat = function()
    local OldNetworkSay = _G.Networking_Say
    if OldNetworkSay then
        _G.Networking_Say = function(guid, userid, name, prefab, message, colour, ...)
            DSTP.PushEvent("chat_message", {
                userid = userid,
                name = name,
                message = message,
                prefab = prefab,
            }, { guid = guid, userid = userid, name = name, prefab = prefab, message = message, colour = colour })
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
            Log("Event category '" .. category .. "' " .. (enabled and "ENABLED" or "DISABLED") .. " remotely")
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

        -- Defer 1 frame so TheWorld.meta is fully populated
        inst:DoTaskInTime(0, function()
            -- Resolve server_id from world session_identifier if auto
            if config.is_auto_id then
                local session = _G.TheWorld.meta and _G.TheWorld.meta.session_identifier
                if session then
                    -- Use first 12 chars of session_identifier as unique ID
                    config.server_id = "dst-" .. session:sub(1, 12)
                else
                    Log("WARNING: session_identifier not available, using fallback ID")
                    config.server_id = "dst-" .. tostring(_G.TheWorld.GUID)
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
        end) -- DoTaskInTime(0)
    end)

    return DSTP
end

DSTP.IsConnected = function() return state.connected end
DSTP.GetServerId = function() return config.server_id end

return DSTP
