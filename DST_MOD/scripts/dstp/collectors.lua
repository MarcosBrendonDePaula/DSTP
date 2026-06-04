-- DSTP Collectors — read-only serializers of DST server/player state for /dst/sync.
--
-- Pure data gatherers: they only READ `_G` (TheSim/TheNet/TheWorld/AllPlayers and
-- player components) and serialize to plain tables. No mutation of shared state.
-- The http/poll module calls GetServerInfo + GetAllPlayersData each cycle to build
-- the sync payload. Receives the core (for `_G`) via Init(core); `cached_client_table`
-- is this module's own state (refreshed each poll via RefreshClientTable).

local Collectors = {}
local Core  -- set in Init

function Collectors.GetServerInfo()
    local _G = Core._G
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

-- Cache client table (refreshed each poll cycle). Module-local state.
local cached_client_table = {}
function Collectors.RefreshClientTable()
    cached_client_table = {}
    for _, client in pairs(Core._G.TheNet:GetClientTable() or {}) do
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
Collectors.GetPlayerData = GetPlayerData

function Collectors.GetAllPlayersData()
    local players = {}
    for _, player in ipairs(Core._G.AllPlayers) do
        local ok, data = pcall(GetPlayerData, player)
        if ok and data then
            table.insert(players, data)
        end
    end
    return players
end

function Collectors.Init(core)
    Core = core
    return Collectors
end

return Collectors
