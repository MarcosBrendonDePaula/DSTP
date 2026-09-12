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
-- THE SLOT POOL — "dynamic netvars", the safe way. modmain declares SLOT_COUNT generic
-- `net_float`s (`inst._dstp_slot[i]`) on every entity of a preset prefab list
-- (slot_prefabs.lua), identical on both sides at PostInit — so the positional rule
-- holds. This module assigns their MEANING at runtime: slot i = field, first-requested
-- first, survivors keep their index when others free up. Slot-carried fields are
-- written to the netvar (the engine deltas them PER FRAME, 4 bytes on change) and
-- left OUT of the JSON packet; the packet carries the slot map so the client can
-- decode slot dirty events into inst.dstp_<field>. Fields that don't fit (no free
-- slot, entity without slots, string values) still ride the JSON path. So the fast
-- path is dynamic too, bounded only by the pool size.
--
-- Mechanic-module pattern (see CLAUDE.md): all state lives here; modmain only
-- declares the net_string/slots + the client listeners; client.lua only calls Init.

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
-- THE COMPOSITE ENTITY CHANNEL (`inst._dstp_ent`, one net_string per preset entity)
-------------------------------------------------
-- One string carries the entity's FIELDS (`f`, always the full current set so a
-- late-joining client is complete) and the EVENTS of one frame (`e`, a batch — netvars
-- are state, not a queue: two hits in the same frame must travel together), stamped
-- with a sequence `s` the client dedups on. Flushed once per frame (DoTaskInTime 0).
-- Entities without the channel (not in the preset) keep the per-player JSON path;
-- the float slots, when configured, take numeric fields first (4 bytes per change).
local entState = {}        -- [inst] = { seq=, fields={}, dirty=bool, events={}, flushing=bool, kinds={}, listeners={}, lastTouch= }
local sendEnt = nil        -- function(inst, packet_table)
local EVENT_GRACE = 2      -- seconds without being scanned by any feed → unsubscribe

local function actorId(e)
    if type(e) ~= "table" then return nil end
    return e.userid or e.prefab or nil
end

-- Event kinds a flow may ask for → the DST entity event + a payload packer
-- (returns the extra args, or nil to drop the event). DATA, not code.
local EVENT_SOURCES = {
    hit        = { ev = "attacked",        pack = function(inst, d) return { (d and d.damage) or 0, actorId(d and d.attacker) } end },
    heal       = { ev = "healthdelta",     pack = function(inst, d)
                        if not (d and d.newpercent and d.oldpercent and d.newpercent > d.oldpercent) then return nil end
                        local h = inst.components and inst.components.health
                        local max = h and h.maxhealth or 0
                        return { math.floor((d.newpercent - d.oldpercent) * max + 0.5) }
                    end },
    burn       = { ev = "onignite",        pack = function() return {} end },
    extinguish = { ev = "onextinguish",    pack = function() return {} end },
    freeze     = { ev = "freeze",          pack = function() return {} end },
    thaw       = { ev = "unfreeze",        pack = function() return {} end },
    sleep      = { ev = "gotosleep",       pack = function() return {} end },
    wake       = { ev = "onwakeup",        pack = function() return {} end },
    target     = { ev = "newcombattarget", pack = function(inst, d) return { actorId(d and d.target) } end },
    death      = { ev = "death",           pack = function(inst, d) return { actorId(d and d.afflicter) } end },
}

local function entOf(inst)
    local es = entState[inst]
    if not es then
        es = { seq = 0, fields = {}, dirty = false, events = {}, flushing = false, kinds = {}, listeners = {}, lastTouch = 0 }
        entState[inst] = es
    end
    return es
end

local function flushEntity(inst)
    local es = entState[inst]
    if not es then return end
    es.flushing = false
    if not (es.dirty or #es.events > 0) then return end
    if not (inst:IsValid() and inst._dstp_ent) then es.events = {}; es.dirty = false; return end
    es.seq = es.seq + 1
    local f = {}
    for k, v in pairs(es.fields) do f[k] = v end
    local packet = { s = es.seq, f = f }
    if #es.events > 0 then packet.e = es.events end
    es.events = {}
    es.dirty = false
    sendEnt(inst, packet)
end

local function scheduleFlush(inst)
    local es = entOf(inst)
    if es.flushing then return end
    es.flushing = true
    inst:DoTaskInTime(0, function() flushEntity(inst) end)
end

-- Write one field into the entity channel (dirty only on change).
local function entSetField(inst, name, v)
    local es = entOf(inst)
    if es.fields[name] ~= v then es.fields[name] = v; es.dirty = true; scheduleFlush(inst) end
end

local function unsubscribe(inst)
    local es = entState[inst]
    if not es then return end
    for _, l in ipairs(es.listeners) do
        if inst.RemoveEventCallback then inst:RemoveEventCallback(l.ev, l.fn) end
    end
    es.listeners = {}
    es.kinds = {}
end

-- Make sure `inst` has listeners for exactly `kinds` (a set). Re-subscribes on change.
local function subscribe(inst, kinds)
    local es = entOf(inst)
    local same = true
    for k in pairs(kinds) do if not es.kinds[k] then same = false end end
    for k in pairs(es.kinds) do if not kinds[k] then same = false end end
    if same then return end
    unsubscribe(inst)
    for kind in pairs(kinds) do
        local src = EVENT_SOURCES[kind]
        if src then
            local fn = function(_, data)
                local ok, args = _G.pcall(src.pack, inst, data)
                if ok and type(args) == "table" then
                    local e = { kind }
                    for i = 1, #args do e[#e + 1] = args[i] end
                    local st = entOf(inst)
                    st.events[#st.events + 1] = e
                    scheduleFlush(inst)
                end
            end
            inst:ListenForEvent(src.ev, fn)
            es.listeners[#es.listeners + 1] = { ev = src.ev, fn = fn }
            es.kinds[kind] = true
        end
    end
end

-- Drop listeners of entities no feed has scanned lately (or that died).
local function gcEntities(now)
    for inst, es in pairs(entState) do
        if not inst:IsValid() or (now - es.lastTouch) > EVENT_GRACE then
            unsubscribe(inst)
            if not inst:IsValid() then entState[inst] = nil end
        end
    end
end

local function now()
    local g = _G.GetTime
    if type(g) == "function" then return g() or 0 end
    return 0
end

-- Slot pool (server truth). slotMap[i] = { name=, kind="number"|"bool" } or nil.
local SLOT_COUNT = 0
local slotMap = {}
local slotIndex = {}      -- name → i (derived)
local firstSeen = {}      -- field name → request sequence (stable, deterministic order)
local seenSeq = 0
local BOOL_FIELDS = { burning = true, frozen = true, sleeping = true }

function M.ConfigureSlots(n)
    SLOT_COUNT = math.max(0, math.floor(tonumber(n) or 0))
end

local function kindOf(field) return BOOL_FIELDS[field] and "bool" or "number" end

-- Recompute the map from every active spec: survivors keep their index; freed slots
-- are refilled in first-request order. Called on every Start/Stop.
local function reassignSlots()
    slotIndex = {}
    if SLOT_COUNT <= 0 then slotMap = {}; return end
    local wanted = {}
    for _, st in pairs(feeds) do
        for _, spec in pairs(st.specs) do
            for _, f in ipairs(spec.fields) do wanted[f] = true end
        end
    end
    local newMap, taken = {}, {}
    for i = 1, SLOT_COUNT do
        local e = slotMap[i]
        if e and e.name ~= "" and wanted[e.name] then newMap[i] = e; taken[e.name] = true end
    end
    local order = {}
    for f in pairs(wanted) do if not taken[f] then order[#order + 1] = f end end
    table.sort(order, function(a, b) return (firstSeen[a] or 0) < (firstSeen[b] or 0) end)
    for _, f in ipairs(order) do
        for i = 1, SLOT_COUNT do
            if newMap[i] == nil then newMap[i] = { name = f, kind = kindOf(f) }; break end
        end
    end
    slotMap = newMap
    for i, e in pairs(slotMap) do slotIndex[e.name] = i end
end

-- The map as shipped to clients: a dense array (holes → empty name) so JSON stays an array.
local function slotMapForWire()
    local out, last = {}, 0
    for i = 1, SLOT_COUNT do if slotMap[i] then last = i end end
    for i = 1, last do
        local e = slotMap[i]
        out[i] = e and { name = e.name, kind = e.kind } or { name = "", kind = "number" }
    end
    return out
end

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

-- Flow-computed values: a flow writes `entity_set_data { guid, name, value }` and the
-- value lives on the entity as inst.dstp_data[name]; the feed reads it as the field
-- "data.<name>" like any component field. Plain values only (number/string/boolean);
-- a nil value clears the entry.
function M.SetData(inst, name, value)
    if type(inst) ~= "table" or name == nil then return false end
    if value ~= nil and plain(value) == nil then return false end
    inst.dstp_data = inst.dstp_data or {}
    inst.dstp_data[tostring(name)] = value
    return true
end

-- Read ONE field of an entity: "data.<name>" (flow-written), a whitelisted reader, or
-- a plain `component.field`.
function M.Read(inst, field)
    local dataKey = tostring(field):match("^data%.([%w_]+)$")
    if dataKey then
        local d = inst.dstp_data
        return type(d) == "table" and plain(d[dataKey]) or nil
    end
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

-- Build the merged packet for a player: { radius=<max feed radius>, slots=<map>,
-- ents={ [netid]={field=value} } }. Slot-carried fields are written to the entity's
-- netvar slot instead of the row (the engine replicates them per frame).
function M.Snapshot(player, specs)
    local packet = { radius = 0, ents = {} }
    if SLOT_COUNT > 0 then packet.slots = slotMapForWire() end
    local t = now()
    for _, spec in pairs(specs) do
        if spec.radius > packet.radius then packet.radius = spec.radius end
        for _, ent in ipairs(scan(player, spec)) do
            local id = netid(ent)
            if id ~= nil then
                local row = packet.ents[id] or {}
                local slots = ent._dstp_slot
                local chan = ent._dstp_ent ~= nil
                for _, f in ipairs(spec.fields) do
                    local v = M.Read(ent, f)
                    if v ~= nil then
                        local i = slotIndex[f]
                        local nv = (i and type(slots) == "table") and slots[i] or nil
                        if nv and type(v) ~= "string" then
                            -- 1) float slot: 4 bytes per change, per frame
                            local enc = v
                            if type(v) == "boolean" then enc = v and 1 or 0 end
                            if nv:value() ~= enc then nv:set(enc) end
                        elseif chan then
                            -- 2) the entity's own channel (fields + events, per frame)
                            entSetField(ent, f, v)
                        else
                            -- 3) per-player JSON (entity has no channel)
                            row[f] = v
                        end
                    end
                end
                packet.ents[id] = row
                -- events ride the entity channel only
                if chan and spec.events then
                    local es = entOf(ent)
                    es.lastTouch = t
                    subscribe(ent, spec.events)
                elseif chan then
                    entOf(ent).lastTouch = t
                end
            end
        end
    end
    gcEntities(t)
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
    -- events: a set of known kinds (unknown ones dropped); nil when none requested
    local events = nil
    if type(spec.events) == "table" then
        for _, k in ipairs(spec.events) do
            if EVENT_SOURCES[tostring(k)] then events = events or {}; events[tostring(k)] = true end
        end
    end
    local s = {
        id = id,
        prefabset = toSet(spec.prefabs),
        tags = (type(spec.tags) == "table" and #spec.tags > 0) and spec.tags or nil,
        radius = tonumber(spec.radius) or 30,
        fields = fields,
        events = events,
        interval = math.max(MIN_INTERVAL, tonumber(spec.interval) or 0.5),
        max = math.min(HARD_CAP, math.max(1, tonumber(spec.max) or DEFAULT_CAP)),
    }
    for _, f in ipairs(fields) do
        if not firstSeen[f] then seenSeq = seenSeq + 1; firstSeen[f] = seenSeq end
    end
    local st = feeds[player.userid]
    if not st then
        st = { player = player, specs = {} }
        feeds[player.userid] = st
    end
    st.player = player
    st.specs[id] = s
    st.lastSig = nil          -- force a packet on the next tick
    reassignSlots()
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
    reassignSlots()
end

function M.StopAll(player)
    if not (player and player.userid) then return end
    local st = feeds[player.userid]
    if st then stopTask(st); feeds[player.userid] = nil end
    reassignSlots()
end

-- The current slot map (server truth) — for tests/panel introspection.
function M.SlotMap() return slotMapForWire() end

-------------------------------------------------
-- Apply (client)
-------------------------------------------------
-- Client copy of the slot map (arrives inside every packet).
local clientMap = {}
function M.ResetClient() clientMap = {} end

-- Client hook: called once per entity event, in order: fn(inst, kind, args).
-- modmain points it at the rules engine (`entity_event`).
M.on_entity_event = nil

-- Client: a packet arrived on an entity's own channel: { s, f = {field=value}, e = { {kind, ...}, ... } }.
-- Fields become inst.dstp_<field>; events become inst.dstp_last_event / dstp_last_<kind>
-- (first payload arg) and fire the hook. Dedup by `s` (the net_string replays its value).
function M.OnEntity(inst, packet)
    if type(inst) ~= "table" then return end
    if type(packet) == "string" then
        local ok, t = _G.pcall(_G.json.decode, packet)
        if not ok then return end
        packet = t
    end
    if type(packet) ~= "table" then return end
    local s = tonumber(packet.s)
    if s and inst._dstp_ent_seq and s <= inst._dstp_ent_seq then return end
    if s then inst._dstp_ent_seq = s end
    if type(packet.f) == "table" then
        for k, v in pairs(packet.f) do inst["dstp_" .. tostring(k)] = v end
    end
    if type(packet.e) == "table" then
        for _, e in ipairs(packet.e) do
            if type(e) == "table" and e[1] ~= nil then
                local kind = tostring(e[1])
                local args = {}
                for i = 2, #e do args[#args + 1] = e[i] end
                inst.dstp_last_event = kind
                if args[1] ~= nil then inst["dstp_last_" .. kind] = args[1] else inst["dstp_last_" .. kind] = true end
                local hook = M.on_entity_event
                if type(hook) == "function" then
                    local ok, err = _G.pcall(hook, inst, kind, args)
                    if not ok and core and core.Log then core.Log("entity_event hook failed: " .. tostring(err)) end
                end
            end
        end
    end
end

local function decodeSlot(kind, v)
    if kind == "bool" then return v ~= nil and v ~= 0 and v ~= false end
    return v
end

-- Re-expose every parked slot value of `inst` through the current map.
local function applySlots(inst)
    local raw = inst._dstp_slotraw
    if type(raw) ~= "table" then return end
    for i, v in pairs(raw) do
        local e = clientMap[i]
        if e and e.name ~= "" then inst["dstp_" .. e.name] = decodeSlot(e.kind, v) end
    end
end

-- Client: a slot netvar went dirty. Park the raw value (the map may not have arrived
-- yet) and expose it as inst.dstp_<field> when the map knows slot i.
function M.OnSlot(inst, i, v)
    if type(inst) ~= "table" then return end
    inst._dstp_slotraw = inst._dstp_slotraw or {}
    inst._dstp_slotraw[i] = v
    local e = clientMap[i]
    if e and e.name ~= "" then inst["dstp_" .. e.name] = decodeSlot(e.kind, v) end
end

-- packet = { radius=, slots=, ents = { [netid or "netid"] = { field = value } } }.
-- Resolves netids against the client's own entities around ThePlayer and writes each
-- field as inst.dstp_<field> — the names the UI `bind` props and follow widgets read.
-- A new slot map re-decodes the parked slot values of every entity in range.
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
    if type(packet.slots) == "table" then
        clientMap = {}
        for i, e in ipairs(packet.slots) do
            if type(e) == "table" then clientMap[i] = { name = tostring(e.name or ""), kind = e.kind or "number" } end
        end
        for _, ent in ipairs(ents) do applySlots(ent) end
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

local function defaultSendEnt(inst, packet)
    local nv = inst._dstp_ent
    if not nv then return end
    local ok, json = _G.pcall(_G.json.encode, packet)
    if ok and json then nv:set(json) end
end

-- env = { GLOBAL, core (server only: registers feed_start/feed_stop), send / sendEnt
--         (test hooks), slot_count (the pool size modmain declared — MUST match both sides) }
function M.Init(env)
    _G = env.GLOBAL
    core = env.core
    send = env.send or defaultSend
    sendEnt = env.sendEnt or defaultSendEnt
    if env.slot_count ~= nil then M.ConfigureSlots(env.slot_count) end
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
        -- entity_set_data { guid, name, value } — a flow-computed value on an entity,
        -- shipped by feeds that ask for the field "data.<name>". Same GUID resolver
        -- contract as get_entity (Ents[guid] + IsValid).
        core.RegisterCommand("entity_set_data", function(data)
            if not (data and data.name) then return end
            local guid = tonumber(data.guid)
            local ents = _G.Ents
            local inst = guid and type(ents) == "table" and ents[guid] or nil
            if not (inst and (not inst.IsValid or inst:IsValid())) then return end
            M.SetData(inst, data.name, data.value)
        end)
    end
    return M
end

return M
