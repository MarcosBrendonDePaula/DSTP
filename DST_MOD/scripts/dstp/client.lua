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
    panel_url_base = nil,  -- public URL for browser links; defaults to backend_url
    poll_interval = 5,
    max_batch_size = 50,
    dump_mode = false,  -- when true, events include raw DST data
    debug_logs = false,  -- when true, Log() prints to server log; errors always print
}

-- Chat command prefix: a message starting with this is treated as a flow command —
-- it still fires chat_message (so flows react) but is NOT broadcast to public chat.
-- We use "!" because the game leaves it alone (it passes through Networking_Say).
local COMMAND_PREFIX = "!"

local command_handlers = {}
local evt_config = {}
local evt_initialized = {}
local world_inst = nil
local hooked_players = {}
local LandClaims = nil  -- dstp/land_claims singleton, set in Init()

-- Forward declarations (DST strict mode requires variables to exist before reference)
local SendPrivateMessage
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

-------------------------------------------------
-- Logging
--
-- HOT-PATH RULE: always gate Log() calls with `if DEBUG then ... end` so the
-- string concatenation never runs when debug is off. `DEBUG` is a module-local
-- alias of config.debug_logs, updated by DSTP.Init().
--
-- Log()      — debug-only (gated via DEBUG)
-- LogError() — always prints (errors should never be silent)
-- LogInfo()  — always prints (boot banners, critical warnings)
-------------------------------------------------
-- Module-local debug flag. Updated by Init() from mod config.
-- Use `if DEBUG then Log(...) end` around expensive log lines to avoid
-- string concatenation/tostring() cost when debug is off.
DSTP._DEBUG = false
local function Log(msg)
    if DSTP._DEBUG then
        print("[DSTP] " .. msg)
    end
end

local function LogError(msg)
    print("[DSTP ERROR] " .. msg)
end

local function LogInfo(msg)
    print("[DSTP] " .. msg)
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
    local timescale = 1
    local ok_ts, ts = _G.pcall(function() return _G.TheSim:GetTimeScale() end)
    if ok_ts and type(ts) == "number" then timescale = ts end

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
        time_scale = timescale,
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

    -- Request an immediate flush so the next scheduled poll fires fast.
    -- The scheduler in ComputeNextDelay already checks event_queue length, but
    -- if a poll is currently in-flight this won't help — it just means the
    -- next reschedule picks 0.5s. That's fine; we avoid spamming here.
    state.flush_requested = true
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

    -- A player's _dstp_ui net_string holds a SINGLE value, so multiple
    -- ui_command in one sync would clobber each other (only the last :set
    -- survives). Coalesce all ui_command per userid into one batch so the
    -- client receives them all in a single net_string update.
    local ui_by_user = {}        -- userid -> { sub_cmd, sub_cmd, ... }
    local ui_order = {}          -- preserve first-seen userid order

    for _, cmd in ipairs(commands) do
        if cmd.type == "ui_command" and cmd.data and cmd.data.userid and cmd.data.cmd then
            local uid = cmd.data.userid
            if not ui_by_user[uid] then ui_by_user[uid] = {}; table.insert(ui_order, uid) end
            local c = cmd.data.cmd
            if c.action == "batch" and c.commands then
                for _, sub in ipairs(c.commands) do table.insert(ui_by_user[uid], sub) end
            else
                table.insert(ui_by_user[uid], c)
            end
        else
            if DSTP._DEBUG then Log("Exec: " .. tostring(cmd.type)) end
            ExecuteCommand(cmd)
        end
    end

    -- Flush one batched ui_command per player.
    for _, uid in ipairs(ui_order) do
        local subs = ui_by_user[uid]
        if #subs == 1 then
            ExecuteCommand({ type = "ui_command", data = { userid = uid, cmd = subs[1] } })
        elseif #subs > 1 then
            ExecuteCommand({ type = "ui_command", data = { userid = uid, cmd = { action = "batch", commands = subs } } })
        end
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
            if DSTP._DEBUG then Log("Admin added: " .. tostring(data.userid)) end
        end
    end)

    DSTP.RegisterCommand("remove_admin", function(data)
        if data.userid then
            _G.TheNet:SetIsClientAdmin(data.userid, false)
            if DSTP._DEBUG then Log("Admin removed: " .. tostring(data.userid)) end
        end
    end)

    DSTP.RegisterCommand("kill", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.health then
            player.components.health:Kill()
        end
    end)

    DSTP.RegisterCommand("respawn", function(data)
        if DSTP._DEBUG then Log("Respawn command: userid=" .. tostring(data.userid)) end
        local player = FindPlayer(data.userid)
        if player then
            if DSTP._DEBUG then Log("  Found player: " .. tostring(player.name) .. " ghost=" .. tostring(player:HasTag("playerghost"))) end
            if player:HasTag("playerghost") then
                player:PushEvent("respawnfromghost")
                Log("  Respawned!")
            else
                Log("  Player is NOT a ghost, skipping")
            end
        else
            if DSTP._DEBUG then Log("  Player NOT found for userid: " .. tostring(data.userid)) end
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
            if DSTP._DEBUG then Log("Godmode " .. (enable and "ON" or "OFF") .. " for " .. tostring(player.name)) end
        else
            LogError("Godmode: player not found or no health - " .. tostring(data.userid))
        end
    end)

    -- ── Player state control (real components, master sim) ──
    -- Each gates on the component existing, like heal/feed above. Admin gating is
    -- done in the FLOW (backend), not here.

    DSTP.RegisterCommand("set_temperature", function(data)
        local player = FindPlayer(data.userid)
        local v = _G.tonumber(data.value)
        if player and player.components.temperature and v then
            player.components.temperature:SetTemperature(v)
        end
    end)

    DSTP.RegisterCommand("set_moisture", function(data)
        local player = FindPlayer(data.userid)
        local p = _G.tonumber(data.percent)
        if player and player.components.moisture and p then
            player.components.moisture:SetPercent(math.max(0, math.min(1, p)))
        end
    end)

    DSTP.RegisterCommand("ignite", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.burnable then
            player.components.burnable:Ignite()
        end
    end)

    DSTP.RegisterCommand("extinguish", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.burnable then
            player.components.burnable:Extinguish()
        end
    end)

    DSTP.RegisterCommand("freeze", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.freezable then
            player.components.freezable:Freeze(_G.tonumber(data.duration))
        end
    end)

    DSTP.RegisterCommand("unfreeze", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.freezable then
            player.components.freezable:Unfreeze()
        end
    end)

    DSTP.RegisterCommand("set_player_speed", function(data)
        local player = FindPlayer(data.userid)
        local m = _G.tonumber(data.multiplier)
        if player and player.components.locomotor and m then
            if m == 1 then
                player.components.locomotor:RemoveExternalSpeedMultiplier(player, "dstp_speed")
            else
                player.components.locomotor:SetExternalSpeedMultiplier(player, "dstp_speed", m)
            end
        end
    end)

    -- Vitals: percent (0..1 via SetPercent) OR exact value.
    DSTP.RegisterCommand("set_health", function(data)
        local player = FindPlayer(data.userid)
        local h = player and player.components.health
        if not h then return end
        local p = _G.tonumber(data.percent)
        local v = _G.tonumber(data.value)
        if p then h:SetPercent(math.max(0, math.min(1, p)))
        elseif v then h:SetVal(v) end
    end)

    DSTP.RegisterCommand("set_hunger", function(data)
        local player = FindPlayer(data.userid)
        local hu = player and player.components.hunger
        if not hu then return end
        local p = _G.tonumber(data.percent)
        local v = _G.tonumber(data.value)
        if p then hu:SetPercent(math.max(0, math.min(1, p)))
        elseif v then hu.current = math.max(0, math.min(hu.max, v)); hu:DoDelta(0) end
    end)

    DSTP.RegisterCommand("set_sanity", function(data)
        local player = FindPlayer(data.userid)
        local s = player and player.components.sanity
        if not s then return end
        local p = _G.tonumber(data.percent)
        local v = _G.tonumber(data.value)
        if p then s:SetPercent(math.max(0, math.min(1, p)))
        elseif v then s.current = math.max(0, math.min(s.max, v)); s:DoDelta(0) end
    end)

    DSTP.RegisterCommand("set_max_health", function(data)
        local player = FindPlayer(data.userid)
        local v = _G.tonumber(data.value)
        if player and player.components.health and v and v > 0 then
            player.components.health:SetMaxHealth(v)
        end
    end)

    -- Tags: generic, safe-ish player mutation (fastpicker, insulated, ...).
    DSTP.RegisterCommand("add_tag", function(data)
        local player = FindPlayer(data.userid)
        if player and data.tag then player:AddTag(tostring(data.tag)) end
    end)

    DSTP.RegisterCommand("remove_tag", function(data)
        local player = FindPlayer(data.userid)
        if player and data.tag then player:RemoveTag(tostring(data.tag)) end
    end)

    -- call_component: invoke any method of any component on the player. This is
    -- ADMIN-POWER (RCE-equivalent on the server), same trust class as the `script`
    -- node and the existing `execute` command — gate it in the FLOW with
    -- get_player → condition {{player.admin}}==true. Contained by the outer pcall
    -- (a bad component/method name just logs, never crashes). The sentinel
    -- "{{self}}" in args is replaced by the player itself (many DST methods take
    -- `inst` as the first arg, e.g. locomotor:SetExternalSpeedMultiplier(inst,k,m)).
    DSTP.RegisterCommand("call_component", function(data)
        local player = FindPlayer(data.userid)
        if not (player and data.component and data.method) then return end
        local comp = player.components[data.component]
        if not comp then
            LogError("call_component: no component '" .. tostring(data.component) .. "'")
            return
        end
        local fn = comp[data.method]
        if type(fn) ~= "function" then
            LogError("call_component: '" .. tostring(data.component) .. "' has no method '" .. tostring(data.method) .. "'")
            return
        end
        -- Resolve args: "{{self}}" → the player entity; everything else passed as-is.
        local args = {}
        local n = 0
        if type(data.args) == "table" then
            for i, a in ipairs(data.args) do
                n = i
                args[i] = (a == "{{self}}") and player or a
            end
        end
        fn(comp, _G.unpack(args, 1, n))
    end)

    -- ---- Land claims (terrain protection) ----------------------------------
    -- These manage the claim store; the actual BLOCKING happens in modmain via
    -- workable/burnable/builder overrides that call LandClaims.IsProtected. The
    -- POLICY (who may claim, limits, cost) is up to the FLOW that calls these —
    -- e.g. gate claim_add behind condition {{player.admin}} or a coins check.
    -- A claim's position defaults to the player's current position when x/z are
    -- omitted (so a flow can do "!claim" with just the userid).

    local function ResolveXZ(data)
        if data.x ~= nil and data.z ~= nil then
            return tonumber(data.x), tonumber(data.z)
        end
        local player = data.userid and FindPlayer(data.userid)
        if player and player.Transform then
            local x, _, z = player.Transform:GetWorldPosition()
            return x, z
        end
        return nil, nil
    end

    DSTP.RegisterCommand("claim_add", function(data)
        if not LandClaims then return end
        local owner = data.owner or data.userid
        local x, z = ResolveXZ(data)
        if owner and x and z then
            LandClaims.Add(owner, x, z, data.radius)
        end
    end)

    DSTP.RegisterCommand("claim_remove", function(data)
        if not LandClaims then return end
        local x, z = nil, nil
        if data.x ~= nil and data.z ~= nil then x, z = tonumber(data.x), tonumber(data.z) end
        -- if no explicit point but a userid is given, remove the claim under them
        if (x == nil or z == nil) and data.at_player and data.userid then
            x, z = ResolveXZ(data)
        end
        LandClaims.Remove(data.owner, x, z)
    end)

    DSTP.RegisterCommand("claim_trust", function(data)
        if not LandClaims then return end
        local owner = data.owner or data.userid
        local x, z = ResolveXZ(data)
        if owner and data.friend then
            LandClaims.Trust(owner, x, z, tostring(data.friend), data.on ~= false)
        end
    end)

    DSTP.RegisterCommand("claim_list", function(data)
        if not LandClaims then return end
        DSTP.PushEvent("claim_list_result", {
            claims = LandClaims.List(),
            token = data.token,
        })
    end)

    DSTP.RegisterCommand("claim_check", function(data)
        if not LandClaims then return end
        local x, z = ResolveXZ(data)
        local owner = (x and z) and LandClaims.OwnerAt(x, z) or nil
        DSTP.PushEvent("claim_check_result", {
            x = x, z = z, owner = owner, protected = owner ~= nil,
            token = data.token,
        })
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

    -- Count how many of a prefab a player holds (main inventory + overflow/backpack,
    -- summing stack sizes). Reports back via a `item_count` event so flows can read it.
    local function CountPrefab(inv, prefab)
        local total = 0
        local function scan(slots)
            for _, item in pairs(slots or {}) do
                if item and item.prefab == prefab then
                    if item.components.stackable then
                        total = total + item.components.stackable:StackSize()
                    else
                        total = total + 1
                    end
                end
            end
        end
        scan(inv.itemslots)
        local bp = inv:GetOverflowContainer()
        if bp then scan(bp.slots) end
        return total
    end

    DSTP.RegisterCommand("count_item", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.inventory and data.prefab then
            local n = CountPrefab(player.components.inventory, data.prefab)
            DSTP.PushEvent("item_count", {
                userid = data.userid, prefab = data.prefab, count = n,
                token = data.token,  -- echo so the flow can correlate
            })
        end
    end)

    -- Remove N of a prefab from a player's inventory, ATOMICALLY: only removes if
    -- the player has at least N (so a sale can't credit coins for items they lack).
    -- Reports the outcome via an `item_removed` event { prefab, requested, removed,
    -- success } — a sell flow listens for it and credits coins only on success.
    DSTP.RegisterCommand("remove_item", function(data)
        local player = FindPlayer(data.userid)
        local prefab = data.prefab
        local need = tonumber(data.count) or 1
        if not (player and player.components.inventory and prefab) then return end
        local inv = player.components.inventory

        local have = CountPrefab(inv, prefab)
        local success = have >= need
        local removed = 0

        if success then
            local remaining = need
            -- Walk a snapshot of matching items; remove/shrink stacks until satisfied.
            local function take(slots)
                for _, item in pairs(slots or {}) do
                    if remaining <= 0 then return end
                    if item and item.prefab == prefab then
                        local stack = item.components.stackable and item.components.stackable:StackSize() or 1
                        if stack <= remaining then
                            inv:RemoveItem(item, true)
                            item:Remove()
                            removed = removed + stack
                            remaining = remaining - stack
                        else
                            -- shrink the stack in place
                            item.components.stackable:SetStackSize(stack - remaining)
                            removed = removed + remaining
                            remaining = 0
                        end
                    end
                end
            end
            take(inv.itemslots)
            local bp = inv:GetOverflowContainer()
            if bp then take(bp.slots) end
        end

        DSTP.PushEvent("item_removed", {
            userid = data.userid, prefab = prefab,
            requested = need, removed = removed, success = success,
            token = data.token,
        })
    end)

    -- has_item: boolean check (count >= need), reported via `item_has` event.
    DSTP.RegisterCommand("has_item", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.inventory and data.prefab then
            local need = tonumber(data.count) or 1
            local have = CountPrefab(player.components.inventory, data.prefab)
            DSTP.PushEvent("item_has", {
                userid = data.userid, prefab = data.prefab,
                count = have, needed = need, has = have >= need,
                token = data.token,
            })
        end
    end)

    -- equip_item: spawn an item and equip it (falls back to inventory if not equippable).
    DSTP.RegisterCommand("equip_item", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.inventory and data.prefab then
            local item = _G.SpawnPrefab(data.prefab)
            if item then
                if item.components.equippable then
                    player.components.inventory:Equip(item)
                else
                    player.components.inventory:GiveItem(item)
                end
            end
        end
    end)

    -- unequip: remove the item in an equip slot (hand/body/head) to inventory or drop.
    DSTP.RegisterCommand("unequip", function(data)
        local player = FindPlayer(data.userid)
        if player and player.components.inventory then
            local SLOTS = { hand = _G.EQUIPSLOTS.HANDS, body = _G.EQUIPSLOTS.BODY, head = _G.EQUIPSLOTS.HEAD }
            local slot = SLOTS[tostring(data.slot or "hand")] or _G.EQUIPSLOTS.HANDS
            local item = player.components.inventory:GetEquippedItem(slot)
            if item then
                player.components.inventory:Unequip(slot)
                if data.drop then
                    player.components.inventory:DropItem(item)
                end
            end
        end
    end)

    -- drop_item: drop N of a prefab on the ground at the player's feet.
    DSTP.RegisterCommand("drop_item", function(data)
        local player = FindPlayer(data.userid)
        local prefab = data.prefab
        if not (player and player.components.inventory and prefab) then return end
        local inv = player.components.inventory
        local need = tonumber(data.count) or 1
        local dropped = 0
        local function take(slots)
            for _, item in pairs(slots or {}) do
                if dropped >= need then return end
                if item and item.prefab == prefab then
                    inv:DropItem(item)
                    local stack = item.components.stackable and item.components.stackable:StackSize() or 1
                    dropped = dropped + stack
                end
            end
        end
        take(inv.itemslots)
        local bp = inv:GetOverflowContainer()
        if bp then take(bp.slots) end
    end)

    -- clear_inventory: remove everything, or only a given prefab when data.prefab set.
    DSTP.RegisterCommand("clear_inventory", function(data)
        local player = FindPlayer(data.userid)
        if not (player and player.components.inventory) then return end
        local inv = player.components.inventory
        local only = data.prefab
        local function purge(slots)
            local victims = {}
            for _, item in pairs(slots or {}) do
                if item and (not only or item.prefab == only) then
                    table.insert(victims, item)
                end
            end
            for _, item in ipairs(victims) do
                inv:RemoveItem(item, true)
                item:Remove()
            end
        end
        purge(inv.itemslots)
        local bp = inv:GetOverflowContainer()
        if bp then purge(bp.slots) end
        if not only then
            -- also clear equipped
            for _, slot in pairs(_G.EQUIPSLOTS) do
                local eq = inv:GetEquippedItem(slot)
                if eq then inv:Unequip(slot); eq:Remove() end
            end
        end
    end)

    -- transfer_item: move N of a prefab from one player to another. Atomic on the
    -- source side (only transfers what it can remove). Reports via item_transferred.
    DSTP.RegisterCommand("transfer_item", function(data)
        local from = FindPlayer(data.from_userid or data.userid)
        local to = FindPlayer(data.to_userid)
        local prefab = data.prefab
        local need = tonumber(data.count) or 1
        if not (from and to and prefab and from.components.inventory and to.components.inventory) then return end
        local inv = from.components.inventory
        local have = CountPrefab(inv, prefab)
        local moved = 0
        if have >= need then
            local remaining = need
            local function take(slots)
                for _, item in pairs(slots or {}) do
                    if remaining <= 0 then return end
                    if item and item.prefab == prefab then
                        local stack = item.components.stackable and item.components.stackable:StackSize() or 1
                        if stack <= remaining then
                            inv:RemoveItem(item, true)
                            item:Remove()
                            moved = moved + stack
                            remaining = remaining - stack
                        else
                            item.components.stackable:SetStackSize(stack - remaining)
                            moved = moved + remaining
                            remaining = 0
                        end
                    end
                end
            end
            take(inv.itemslots)
            local bp = inv:GetOverflowContainer()
            if bp then take(bp.slots) end
            -- give the moved amount to the recipient
            if moved > 0 then
                local gift = _G.SpawnPrefab(prefab)
                if gift then
                    if moved > 1 and gift.components.stackable then
                        gift.components.stackable:SetStackSize(moved)
                    end
                    to.components.inventory:GiveItem(gift)
                end
            end
        end
        DSTP.PushEvent("item_transferred", {
            from_userid = data.from_userid or data.userid, to_userid = data.to_userid,
            prefab = prefab, requested = need, moved = moved, success = moved >= need,
            token = data.token,
        })
    end)

    -- dump_inventory: report the player's full inventory (item -> total count) via
    -- an `inventory_dump` event, so a sell UI can list what they can sell.
    DSTP.RegisterCommand("dump_inventory", function(data)
        local player = FindPlayer(data.userid)
        if not (player and player.components.inventory) then return end
        local inv = player.components.inventory
        local counts = {}
        local function scan(slots)
            for _, item in pairs(slots or {}) do
                if item then
                    local stack = item.components.stackable and item.components.stackable:StackSize() or 1
                    counts[item.prefab] = (counts[item.prefab] or 0) + stack
                end
            end
        end
        scan(inv.itemslots)
        local bp = inv:GetOverflowContainer()
        if bp then scan(bp.slots) end
        DSTP.PushEvent("inventory_dump", {
            userid = data.userid, items = counts, token = data.token,
        })
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
        if DSTP._DEBUG then Log("Time scale set to " .. tostring(speed)) end
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
        if not (player and data.prefab) then return end
        local x, _, z = player.Transform:GetWorldPosition()
        local ox, oz = tonumber(data.offset_x) or 0, tonumber(data.offset_z) or 0
        local count = math.max(1, math.min(tonumber(data.count) or 1, 20))

        local first = _G.SpawnPrefab(data.prefab)
        if not first then return end
        first.Transform:SetPosition(x + ox, 0, z + oz)

        if count > 1 and first.components.stackable then
            -- Stackable items: one entity, set the stack size.
            first.components.stackable:SetStackSize(count)
        elseif count > 1 then
            -- Non-stackable (mobs/structures): spawn N separate copies spread in
            -- a small ring around the player so they don't stack on one tile.
            for i = 2, count do
                local ent = _G.SpawnPrefab(data.prefab)
                if ent then
                    local ang = (i / count) * 2 * math.pi
                    local r = 2 + (i % 3)
                    ent.Transform:SetPosition(x + ox + math.cos(ang) * r, 0, z + oz + math.sin(ang) * r)
                end
            end
        end
        if DSTP._DEBUG then Log("Spawned " .. count .. "x " .. data.prefab .. " at " .. player.name) end
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
            if DSTP._DEBUG then Log("Removed " .. removed .. "x " .. data.prefab .. " near " .. player.name) end
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
                    if DSTP._DEBUG then Log("Destroyed " .. ent.prefab) end
                    if not data.all then break end
                end
            end
        end
    end)

    DSTP.RegisterCommand("set_dump_mode", function(data)
        config.dump_mode = data.enabled ~= false
        if DSTP._DEBUG then Log("Dump mode: " .. tostring(config.dump_mode)) end
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
        if DSTP._DEBUG then Log("ui_command sent to " .. tostring(data.userid) .. ": " .. tostring(data.cmd.action)) end
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
        if DSTP._DEBUG then Log("ui_broadcast: " .. tostring(data.cmd.action) .. " to " .. #_G.AllPlayers .. " players") end
    end)

    -- Install rules for a specific player
    DSTP.RegisterCommand("install_rules", function(data)
        if not data.userid or not data.rules then return end
        local player = FindPlayer(data.userid)
        if not player or not player.player_classified or not player.player_classified._dstp_ui then return end
        local cmd = { action = "rules_install", rules = data.rules, seq = data.seq }
        local json_str = SafeEncode(cmd)
        if json_str then
            player.player_classified._dstp_ui:set(json_str)
            if DSTP._DEBUG then Log("install_rules sent to " .. data.userid .. " (" .. #data.rules .. " rules)") end
        end
    end)

    -- Uninstall rules
    DSTP.RegisterCommand("uninstall_rules", function(data)
        if not data.userid or not data.ids then return end
        local player = FindPlayer(data.userid)
        if not player or not player.player_classified or not player.player_classified._dstp_ui then return end
        local cmd = { action = "rules_uninstall", ids = data.ids, seq = data.seq }
        local json_str = SafeEncode(cmd)
        if json_str then
            player.player_classified._dstp_ui:set(json_str)
        end
    end)

    -- Set player state value (backend pushes a variable to client player_state)
    DSTP.RegisterCommand("set_player_state", function(data)
        if not data.userid or not data.key then return end
        local player = FindPlayer(data.userid)
        if not player or not player.player_classified or not player.player_classified._dstp_ui then return end
        local cmd = { action = "state_set", key = data.key, value = data.value, seq = data.seq }
        local json_str = SafeEncode(cmd)
        if json_str then
            player.player_classified._dstp_ui:set(json_str)
        end
    end)

    -- Broadcast rules to ALL players
    DSTP.RegisterCommand("install_rules_all", function(data)
        if not data.rules then return end
        local cmd = { action = "rules_install", rules = data.rules, seq = data.seq }
        local json_str = SafeEncode(cmd)
        if not json_str then return end
        for _, player in ipairs(_G.AllPlayers) do
            if player.player_classified and player.player_classified._dstp_ui then
                player.player_classified._dstp_ui:set(json_str)
            end
        end
        if DSTP._DEBUG then Log("install_rules broadcast (" .. #data.rules .. " rules)") end
    end)
end

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
SendPrivateMessage = function(player, message)
    if not player or not player:IsValid() then return end
    if player.player_classified and player.player_classified._dstp_pm then
        player.player_classified._dstp_pm:set(message)
        if DSTP._DEBUG then Log("PM to " .. tostring(player.name) .. ": " .. message) end
    end
end

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
    -- Set globals from mod environment
    _G = mod_env.GLOBAL
    json = _G.json

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
        DSTP._DEBUG = mod_config.debug_logs
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

    RegisterBuiltinCommands()

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
