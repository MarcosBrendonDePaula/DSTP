-- Harness for the entity-control commands (#57-59). Loads REAL core.lua + commands.lua
-- under fengari, mocks _G.Ents (the GUID table) and TheSim:FindEntities (the prefab+pos
-- resolver), builds fake entities with components, and drives the entity_* commands.
-- Asserts: the resolver keys by GUID and by prefab+pos, stale GUID returns found:false,
-- get_entity emits a per-component entity_data block, and each mutator calls the right
-- component method gated on the component being present. Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local mock_G = KIT.make_G()
local Core = KIT.load(MOD_CORE, "core.lua")
Core.Init(mock_G, KIT.fake_json, { server_id = "s" })
local Commands = KIT.load(MOD_COMMANDS, "commands.lua")
Commands.RegisterAll(Core)

-- ── Fake entity factory ───────────────────────────────────────────────────
-- An entity is { GUID, prefab, components={}, Transform, IsValid }. Component methods
-- RECORD their calls so we can assert the mutators fired the right thing.
local calls = {}                  -- flat log: {comp=,method=,args=}
local function rec(comp, method, ...)
    calls[#calls + 1] = { comp = comp, method = method, args = { ... } }
end

local function mkEntity(guid, prefab, comps)
    local valid = true
    local e = {
        GUID = guid, prefab = prefab,
        components = comps or {},
        Transform = {
            GetWorldPosition = function() return 10, 0, 20 end,
            SetPosition = function(self, x, y, z) rec("Transform", "SetPosition", x, y, z) end,
        },
        IsValid = function() return valid end,
        GetTimeAlive = function() return 42 end,
        IsAsleep = function() return false end,
        GetDisplayName = function() return prefab end,
    }
    e._invalidate = function() valid = false end
    return e
end

-- component builders that record
local function healthComp(pct)
    return {
        currenthealth = (pct or 1) * 100, maxhealth = 100,
        GetPercent = function() return pct or 1 end,
        IsDead = function() return (pct or 1) <= 0 end,
        SetPercent = function(self, p) rec("health", "SetPercent", p) end,
        DoDelta = function(self, a) rec("health", "DoDelta", a) end,
        ForceKill = function(self) rec("health", "ForceKill") end,
        Kill = function(self) rec("health", "Kill") end,
    }
end
local function burnableComp(burning)
    return {
        IsBurning = function() return burning end,
        IsSmoldering = function() return false end,
        Extinguish = function(self) rec("burnable", "Extinguish") end,
        Ignite = function(self) rec("burnable", "Ignite") end,
    }
end
local function fueledComp(pct)
    return {
        GetPercent = function() return pct or 0.5 end,
        GetCurrentSection = function() return 2 end,
        SetPercent = function(self, p) rec("fueled", "SetPercent", p) end,
        DoDelta = function(self, d) rec("fueled", "DoDelta", d) end,
    }
end
local function freezableComp(frozen)
    return {
        IsFrozen = function() return frozen end,
        AddColdness = function(self, c) rec("freezable", "AddColdness", c) end,
        Unfreeze = function(self) rec("freezable", "Unfreeze") end,
    }
end

-- ── Mock the resolver inputs on _G ────────────────────────────────────────
local ENTS = {}
mock_G.Ents = ENTS
mock_G.TheSim.FindEntities = function(_, x, y, z, r, must, cant, ora)
    local out = {}
    for _, e in pairs(ENTS) do out[#out + 1] = e end
    return out
end

-- Helper: last entity_data event pushed
local function lastEvent(typ)
    for i = #Core.state.event_queue, 1, -1 do
        if Core.state.event_queue[i].type == typ then return Core.state.event_queue[i].data end
    end
    return nil
end
local function run(cmd, data) Core.ExecuteCommand({ type = cmd, data = data }) end

-- ════ Resolver: GUID hit ════
local beef = mkEntity(101, "beefalo", { health = healthComp(0.5), domesticatable = {
    GetDomestication = function() return 0.3 end, GetObedience = function() return 0.2 end, domesticated = false } })
ENTS[101] = beef
run("get_entity", { guid = 101, token = "t1" })
local d = lastEvent("entity_data")
check("get_entity by GUID: found", d ~= nil and d.found == true)
check("get_entity by GUID: prefab/guid", d and d.prefab == "beefalo" and d.guid == 101)
check("get_entity: token echoed", d and d.token == "t1")
check("get_entity: health block present", d and d.health_percent == 0.5 and d.health_max == 100)
check("get_entity: domesticatable block present", d and d.domestication == 0.3)
check("get_entity: position floored", d and d.x == 10 and d.z == 20)

-- ════ Resolver: prefab+pos fallback ════
run("get_entity", { prefab = "beefalo", x = 10, z = 20, radius = 8, token = "t2" })
local d2 = lastEvent("entity_data")
check("get_entity by prefab+pos: found beefalo", d2 and d2.found == true and d2.prefab == "beefalo")

-- ════ Resolver: stale GUID -> found:false, reason gone ════
beef._invalidate()
run("get_entity", { guid = 101, token = "t3" })
local d3 = lastEvent("entity_data")
check("get_entity stale GUID: found=false", d3 and d3.found == false)
check("get_entity stale GUID: reason gone", d3 and d3.reason == "gone")
beef = mkEntity(101, "beefalo", { health = healthComp(0.5) }); ENTS[101] = beef  -- restore valid

-- ════ Resolver: unknown GUID -> found:false ════
run("get_entity", { guid = 999, token = "t4" })
check("get_entity unknown GUID: found=false", lastEvent("entity_data").found == false)

-- ════ Mutator: entity_set_health (percent) ════
calls = {}
run("entity_set_health", { guid = 101, percent = 0.8 })
check("set_health percent: SetPercent called", calls[1] and calls[1].comp == "health" and calls[1].method == "SetPercent" and calls[1].args[1] == 0.8)

-- ════ Mutator: entity_set_health (amount delta) ════
calls = {}
run("entity_set_health", { guid = 101, amount = -25 })
check("set_health amount: DoDelta(-25)", calls[1] and calls[1].method == "DoDelta" and calls[1].args[1] == -25)

-- ════ Mutator: entity_kill -> ForceKill ════
calls = {}
run("entity_kill", { guid = 101 })
check("entity_kill: ForceKill called", calls[1] and calls[1].method == "ForceKill")

-- ════ Mutator gating: entity_set_fuel on an entity WITHOUT fueled = no-op ════
calls = {}
run("entity_set_fuel", { guid = 101, percent = 1 })   -- beefalo has no fueled
check("set_fuel on non-fueled entity: no-op (gated)", #calls == 0)

-- ════ Mutator: entity_set_fuel on a fueled entity ════
local fire = mkEntity(202, "campfire", { fueled = fueledComp(0.2) }); ENTS[202] = fire
calls = {}
run("entity_set_fuel", { guid = 202, percent = 1 })
check("set_fuel: SetPercent(1) on campfire", calls[1] and calls[1].comp == "fueled" and calls[1].args[1] == 1)

-- ════ Mutator: entity_extinguish only when burning ════
local burning = mkEntity(303, "treeguard", { burnable = burnableComp(true) }); ENTS[303] = burning
calls = {}
run("entity_extinguish", { guid = 303 })
check("extinguish: Extinguish called on burning entity", calls[1] and calls[1].method == "Extinguish")

local notburning = mkEntity(304, "chest", { burnable = burnableComp(false) }); ENTS[304] = notburning
calls = {}
run("entity_extinguish", { guid = 304 })
check("extinguish: no-op when not burning", #calls == 0)

-- ════ Mutator: entity_freeze uses AddColdness (not raw Freeze) ════
local mob = mkEntity(404, "pigman", { freezable = freezableComp(false) }); ENTS[404] = mob
calls = {}
run("entity_freeze", { guid = 404, coldness = 3 })
check("freeze: AddColdness(3) — not raw Freeze", calls[1] and calls[1].method == "AddColdness" and calls[1].args[1] == 3)

-- ════ Mutator: entity_unfreeze only when frozen ════
local frozen = mkEntity(505, "spider", { freezable = freezableComp(true) }); ENTS[505] = frozen
calls = {}
run("entity_unfreeze", { guid = 505 })
check("unfreeze: Unfreeze called on frozen mob", calls[1] and calls[1].method == "Unfreeze")

-- ════ spawn_prefab returns GUID via spawn_result when token given ════
mock_G.SpawnPrefab = function(name) return mkEntity(606, name, {}) end
run("spawn_prefab", { prefab = "rabbit", x = 1, z = 2, token = "sp1" })
local sr = lastEvent("spawn_result")
check("spawn_result: emitted with token+guid+prefab", sr and sr.token == "sp1" and sr.guid == 606 and sr.prefab == "rabbit")

-- ════ spawn WITHOUT token does NOT emit spawn_result (unchanged behavior) ════
local before = #Core.state.event_queue
run("spawn_prefab", { prefab = "rabbit", x = 1, z = 2 })   -- no token
local emitted = false
for i = before + 1, #Core.state.event_queue do
    if Core.state.event_queue[i].type == "spawn_result" then emitted = true end
end
check("spawn without token: no spawn_result (fire-and-forget unchanged)", not emitted)

return C.report()
