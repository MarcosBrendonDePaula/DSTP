-- DSTP data_feed — the GENERIC server→client data path, defined by flows at runtime.
--
-- Netvars are positional and frozen at PostInit (see specs/dynamic-data-bindings.md),
-- so "replicate field X of prefab P" could only be added by editing modmain and
-- reloading. This module is the dynamic alternative: a flow sends
--     feed_start { userid, id, prefabs|tags, radius, fields, interval, max }
-- and the SERVER half snapshots those fields for the entities around that player
-- every `interval` seconds and ships them over ONE net_string per player
-- (`player_classified._dstp_feed`, declared once in modmain — no new netvars). The
-- CLIENT half (`Apply`) writes them onto the matching local entities as
-- `inst.dstp_<field>` — exactly what the UI `bind` props (`entity.hp`, `entity.<x>`)
-- and the follow widgets already read. Prefabs and fields are chosen by the flow,
-- no reload.
--
-- Entities are keyed by NETWORK id (`Network:GetNetworkID()`), the only entity id
-- shared by both sims (GUIDs are per-sim). The client resolves them by scanning its
-- own entities around the player within the packet's radius.
--
-- Trade-offs vs a netvar: ~interval latency (0.2–1 s, not per frame) and bandwidth
-- proportional to the entities in range — hence the per-feed cap and the
-- send-only-on-change rule. Fields are DATA, not code: a whitelist of readers plus
-- plain `component.field` reads (numbers/strings/booleans only, no method calls).
--
-- Mechanic-module pattern (see CLAUDE.md): all state lives here; modmain only
-- declares the net_string + the client listener; client.lua only calls Init.

local M = {}

local _G = nil
local core = nil
local send = nil          -- function(player, packet_table)

-- Per-player feed state: [userid] = { player=, specs = { [id] = spec }, task=, lastSig= }
local feeds = {}

local HARD_CAP = 60
local DEFAULT_CAP = 30
local MIN_INTERVAL = 0.2

-------------------------------------------------
-- Readers (server)
-------------------------------------------------
-- Friendly names → a reader over inst.components. Add here; zero changes elsewhere.
local READERS = {
    hp          = function(c) return c.health and c.health.currenthealth end,
    hp_max      = function(c) return c.health and c.health.maxhealth end,
    hunger      = function(c) return c.hunger and c.hunger.current end,
    hunger_max  = function(c) return c.hunger and c.hunger.max end,
    sanity      = function(c) return c.sanity and c.sanity.current end,
    sanity_max  = function(c) return c.sanity and c.sanity.max end,
    temperature = function(c) if c.temperature and c.temperature.GetCurrent then return c.temperature:GetCurrent() end end,
    fuel        = function(c) return c.fueled and c.fueled.currentfuel end,
    fuel_max    = function(c) return c.fueled and c.fueled.maxfuel end,
    moisture    = function(c) return c.moisture and c.moisture.moisture end,
    burning     = function(c) if c.burnable and c.burnable.IsBurning then return c.burnable:IsBurning() == true end end,
    frozen      = function(c) if c.freezable and c.freezable.IsFrozen then return c.freezable:IsFrozen() == true end end,
    sleeping    = function(c) if c.sleeper and c.sleeper.IsAsleep then return c.sleeper:IsAsleep() == true end end,
}

local function plain(v)
    local t = type(v)
    if t == "number" or t == "string" or t == "boolean" then return v end
    return nil
end

-- Read ONE field of an entity: a whitelisted reader, or a plain `component.field`.
function M.Read(inst, field)
    local comps = inst.components
    if type(comps) ~= "table" then return nil end
    local r = READERS[field]
    if r then
        local ok, v = _G.pcall(r, comps)
        if ok then return plain(v) end
        return nil
    end
    local comp, key = tostring(field):match("^([%w_]+)%.([%w_]+)$")
    if not comp then return nil end
    local cobj = comps[comp]
    if type(cobj) ~= "table" then return nil end
    return plain(cobj[key])
end

-------------------------------------------------
-- Deterministic signature (change detection without a JSON lib)
-------------------------------------------------
local function sortedKeys(t)
    local ks = {}
    for k in pairs(t) do ks[#ks + 1] = k end
    table.sort(ks, function(a, b) return tostring(a) < tostring(b) end)
    return ks
end
local function serialize(v, out)
    local t = type(v)
    if t == "table" then
        out[#out + 1] = "{"
        for _, k in ipairs(sortedKeys(v)) do
            out[#out + 1] = tostring(k) .. "="
            serialize(v[k], out)
            out[#out + 1] = ","
        end
        out[#out + 1] = "}"
    else
        out[#out + 1] = tostring(v)
    end
end
local function signature(packet)
    local out = {}
    serialize(packet, out)
    return table.concat(out)
end

-------------------------------------------------
-- Snapshot (server)
-------------------------------------------------
local function netid(inst)
    local n = inst.Network
    if n and n.GetNetworkID then
        local ok, id = _G.pcall(function() return n:GetNetworkID() end)
        if ok then return id end
    end
    return nil
end

-- All entities one feed spec covers around `player`, capped.
local function scan(player, spec)
    local px, py, pz = player.Transform:GetWorldPosition()
    local oneof = (type(spec.tags) == "table" and #spec.tags > 0) and spec.tags or nil
    local ents = _G.TheSim:FindEntities(px, py, pz, spec.radius, nil, { "INLIMBO", "FX", "player", "playerghost" }, oneof)
    local out, n = {}, 0
    for _, ent in ipairs(ents) do
        if ent ~= player and ent:IsValid() and not ent:HasTag("player")
           and ((not spec.prefabset) or spec.prefabset[ent.prefab]) then
            out[#out + 1] = ent
            n = n + 1
            if n >= spec.max then break end
        end
    end
    return out
end

-- Build the merged packet for a player: { radius=<max feed radius>, ents={ [netid]={field=value} } }
function M.Snapshot(player, specs)
    local packet = { radius = 0, ents = {} }
    for _, spec in pairs(specs) do
        if spec.radius > packet.radius then packet.radius = spec.radius end
        for _, ent in ipairs(scan(player, spec)) do
            local id = netid(ent)
            if id ~= nil then
                local row = packet.ents[id] or {}
                for _, f in ipairs(spec.fields) do
                    local v = M.Read(ent, f)
                    if v ~= nil then row[f] = v end
                end
                packet.ents[id] = row
            end
        end
    end
    return packet
end

-------------------------------------------------
-- Feed lifecycle (server)
-------------------------------------------------
local function minInterval(st)
    local m = nil
    for _, spec in pairs(st.specs) do
        if m == nil or spec.interval < m then m = spec.interval end
    end
    return m or 0.5
end

local function stopTask(st)
    if st.task then st.task:Cancel(); st.task = nil end
end

local function tick(userid)
    local st = feeds[userid]
    if not st then return end
    local player = st.player
    if not (player and player:IsValid()) or next(st.specs) == nil then
        stopTask(st); feeds[userid] = nil
        return
    end
    local packet = M.Snapshot(player, st.specs)
    local sig = signature(packet)
    if sig ~= st.lastSig then
        st.lastSig = sig
        send(player, packet)
    end
end

local function ensureTask(st, userid)
    local want = minInterval(st)
    if st.task and st.interval == want then return end
    stopTask(st)
    st.interval = want
    st.task = st.player:DoPeriodicTask(want, function() tick(userid) end)
end

local function toSet(list)
    if type(list) ~= "table" or #list == 0 then return nil end
    local s = {}
    for _, p in ipairs(list) do s[tostring(p)] = true end
    return s
end

-- Start (or replace) feed `spec.id` for a player. spec: { id, prefabs, tags, radius,
-- fields, interval, max }.
function M.Start(player, spec)
    if not (player and player.userid) then return false end
    local id = tostring(spec.id or "default")
    local fields = {}
    for _, f in ipairs(type(spec.fields) == "table" and spec.fields or { "hp", "hp_max" }) do
        fields[#fields + 1] = tostring(f)
    end
    local s = {
        id = id,
        prefabset = toSet(spec.prefabs),
        tags = (type(spec.tags) == "table" and #spec.tags > 0) and spec.tags or nil,
        radius = tonumber(spec.radius) or 30,
        fields = fields,
        interval = math.max(MIN_INTERVAL, tonumber(spec.interval) or 0.5),
        max = math.min(HARD_CAP, math.max(1, tonumber(spec.max) or DEFAULT_CAP)),
    }
    local st = feeds[player.userid]
    if not st then
        st = { player = player, specs = {} }
        feeds[player.userid] = st
    end
    st.player = player
    st.specs[id] = s
    st.lastSig = nil          -- force a packet on the next tick
    ensureTask(st, player.userid)
    return true
end

function M.Stop(player, id)
    if not (player and player.userid) then return end
    local st = feeds[player.userid]
    if not st then return end
    st.specs[tostring(id or "default")] = nil
    st.lastSig = nil
    if next(st.specs) == nil then
        stopTask(st); feeds[player.userid] = nil
    end
end

function M.StopAll(player)
    if not (player and player.userid) then return end
    local st = feeds[player.userid]
    if st then stopTask(st); feeds[player.userid] = nil end
end

-------------------------------------------------
-- Apply (client)
-------------------------------------------------
-- packet = { radius=, ents = { [netid or "netid"] = { field = value } } }. Resolves
-- netids against the client's own entities around ThePlayer and writes each field as
-- inst.dstp_<field> — the names the UI `bind` props and follow widgets read.
function M.Apply(packet)
    if type(packet) ~= "table" or type(packet.ents) ~= "table" then return 0 end
    local player = _G.ThePlayer
    if not (player and player.Transform) then return 0 end
    local px, py, pz = player.Transform:GetWorldPosition()
    local r = (tonumber(packet.radius) or 30) + 8
    local ents = _G.TheSim:FindEntities(px, py, pz, r, nil, { "INLIMBO", "FX" })
    local byNet = {}
    for _, ent in ipairs(ents) do
        local id = netid(ent)
        if id ~= nil then byNet[id] = ent end
    end
    local applied = 0
    for key, row in pairs(packet.ents) do
        local inst = byNet[tonumber(key) or key]
        if inst and type(row) == "table" then
            for f, v in pairs(row) do inst["dstp_" .. tostring(f)] = v end
            applied = applied + 1
        end
    end
    return applied
end

-------------------------------------------------
-- Init
-------------------------------------------------
local function defaultSend(player, packet)
    local pc = player.player_classified
    if not (pc and pc._dstp_feed) then return end
    local ok, json = _G.pcall(_G.json.encode, packet)
    if ok and json then pc._dstp_feed:set(json) end
end

-- env = { GLOBAL, core (server only: registers feed_start/feed_stop), send (test hook) }
function M.Init(env)
    _G = env.GLOBAL
    core = env.core
    send = env.send or defaultSend
    if core and core.RegisterCommand then
        core.RegisterCommand("feed_start", function(data)
            local player = data and data.userid and core.FindPlayer(data.userid)
            if not player then return end
            M.Start(player, data)
        end)
        core.RegisterCommand("feed_stop", function(data)
            local player = data and data.userid and core.FindPlayer(data.userid)
            if not player then return end
            if data.id == "*" then M.StopAll(player) else M.Stop(player, data.id) end
        end)
    end
    return M
end

return M
