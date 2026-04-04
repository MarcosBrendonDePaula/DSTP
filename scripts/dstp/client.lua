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

local function GetPlayerData(player)
    local x, y, z = player.Transform:GetWorldPosition()

    local data = {
        userid = player.userid,
        name = player.name,
        prefab = player.prefab,
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
-- Game event listeners
-------------------------------------------------
local function RegisterGameEvents(inst)
    inst:ListenForEvent("ms_playerspawn", function(world, player)
        DSTP.PushEvent("player_spawn", {
            userid = player.userid,
            name = player.name,
            prefab = player.prefab,
        })
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

    if not mod_config or not mod_config.server_id then
        LogError("server_id is required!")
        return DSTP
    end

    config.server_id = mod_config.server_id
    config.is_auto_id = mod_config.is_auto_id or false
    if mod_config.backend_url then config.backend_url = mod_config.backend_url end
    if mod_config.poll_interval then config.poll_interval = mod_config.poll_interval end

    RegisterBuiltinCommands()

    mod_env.AddPrefabPostInit("world", function(inst)
        if not inst.ismastersim then return end

        -- Detect shard type
        config.shard_type = inst:HasTag("cave") and "caves" or "master"
        config.shard_id = config.server_id .. ":" .. config.shard_type

        Log("=== DSTP Admin Panel ===")
        Log("Server ID: " .. config.server_id)
        Log("Shard: " .. config.shard_id .. " (" .. config.shard_type .. ")")
        Log("Backend: " .. config.backend_url)
        Log("Poll: " .. config.poll_interval .. "s")

        -- Announce auto-generated ID in server log and chat (only on master shard)
        if config.is_auto_id and config.shard_type == "master" then
            Log("*** Auto-generated Server ID: " .. config.server_id .. " ***")
            inst:DoTaskInTime(5, function()
                _G.TheNet:Announce("[DSTP] Admin Panel ID: " .. config.server_id)
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
