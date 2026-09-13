-- flow_brain: a mob brain driven by data the flow sets. REAL flow_brain.lua + core.lua +
-- commands.lua under fengari; the Klei brain file is mocked (it needs the engine's BT).
-- Pins: spec normalisation, leader/anchor/target decisions, the one-time brain swap +
-- restore, and the entity_set_brain / spawn `brain` command paths. "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

-- ── fake world ──
local ENTS, players = {}, {}
local brainClassCalls = 0
local FakeBrainClass = function(inst) brainClassCalls = brainClassCalls + 1; return { inst = inst, bt = { Reset = function() end } } end
local mock_G = KIT.make_G({
    Ents = ENTS,
    AllPlayers = players,
    require = function(name) if name == "brains/dstp_flowbrain" then return FakeBrainClass end error("no module " .. name) end,
    pcall = pcall,
})
mock_G.TheSim.FindEntities = function(_, x, y, z, r)
    local out = {}
    for _, e in pairs(ENTS) do
        local ex, _, ez = e.Transform:GetWorldPosition()
        if math.sqrt((ex - x) ^ 2 + (ez - z) ^ 2) <= r then out[#out + 1] = e end
    end
    return out
end

local Core = KIT.load(MOD_CORE, "core.lua")
Core.Init(mock_G, KIT.fake_json, { server_id = "s" })
local FlowBrain = KIT.load(MOD_FLOWBRAIN, "flow_brain.lua").Init({ GLOBAL = mock_G, core = Core })
Core.FlowBrain = FlowBrain
local Commands = KIT.load(MOD_COMMANDS, "commands.lua")
Commands.RegisterAll(Core)

local function mkEnt(guid, prefab, x, z, tags, isplayer)
    local set = {}
    for _, t in ipairs(tags or {}) do set[t] = true end
    local e = { GUID = guid, prefab = prefab, isplayer = isplayer or nil, _tags = set, _log = {} }
    e.Transform = { GetWorldPosition = function() return x, 0, z end, SetPosition = function(_, nx, _, nz) x, z = nx, nz end }
    e.IsValid = function() return true end
    e.HasTag = function(self, t) return set[t] == true end
    e.SetBrain = function(self, fn) self._log[#self._log + 1] = { "SetBrain", fn }; self.brainfn = fn; self.brain = fn and fn() or nil end
    e.components = { combat = {
        target = nil,
        SetRetargetFunction = function(self, period, fn) self.retargetperiod, self.targetfn = period, fn; e._log[#e._log + 1] = { "SetRetargetFunction", period } end,
        SetTarget = function(self, t) self.target = t; e._log[#e._log + 1] = { "SetTarget", t } end,
    } }
    ENTS[guid] = e
    return e
end
local function count(e, name) local n = 0 for _, l in ipairs(e._log) do if l[1] == name then n = n + 1 end end return n end
local function lastEvent(typ)
    for i = #Core.state.event_queue, 1, -1 do
        if Core.state.event_queue[i].type == typ then return Core.state.event_queue[i].data end
    end
end
local function run(cmd, data) Core.ExecuteCommand({ type = cmd, data = data }) end

-- ── Normalize ──
local st, why = FlowBrain.Normalize({ mode = "dance" })
check("Normalize: unknown mode rejected", st == nil and why == "bad_mode")
st, why = FlowBrain.Normalize({ mode = "follow" })
check("Normalize: follow needs a target", st == nil and why == "follow_needs_target")
st = FlowBrain.Normalize({ mode = "follow", target = "KU_1" })
check("Normalize: a KU_ target is a userid", st and st.target_userid == "KU_1" and st.target_guid == nil)
st = FlowBrain.Normalize({ mode = "follow", target = "42" })
check("Normalize: a numeric target is a guid", st and st.target_guid == 42)
st = FlowBrain.Normalize({ mode = "guard", anchor_x = "10", anchor_z = "20", brain_radius = "6", tags = "hostile, monster", attack_players = "true" })
check("Normalize: guard anchors + csv tags + booleans", st and st.x == 10 and st.z == 20 and st.radius == 6 and #st.tags == 2 and st.tags[2] == "monster" and st.attack_players == true)
st, why = FlowBrain.Normalize({ mode = "guard" })
check("Normalize: guard needs an anchor", st == nil and why == "needs_anchor")

-- ── decisions ──
local orig = function() return { bt = { Reset = function() end } } end
local pig = mkEnt(100, "pigman", 0, 0, {})
pig.brainfn = orig
players[1] = { userid = "KU_1", IsValid = function() return true end, Transform = { GetWorldPosition = function() return 5, 0, 5 end }, isplayer = true, HasTag = function(_, t) return t == "player" end }
local spider = mkEnt(200, "spider", 3, 0, { "hostile", "monster" })
local rabbit = mkEnt(300, "rabbit", 2, 0, { "animal" })
local farSpider = mkEnt(400, "spider", 50, 0, { "hostile" })

local guard = FlowBrain.Normalize({ mode = "guard", anchor_x = 0, anchor_z = 0, brain_radius = 8, tags = "hostile" })
check("ShouldTarget: hostile in guard mode → yes", FlowBrain.ShouldTarget(pig, spider, guard) == true)
check("ShouldTarget: untagged rabbit → no", FlowBrain.ShouldTarget(pig, rabbit, guard) == false)
check("ShouldTarget: players untouchable unless attack_players", FlowBrain.ShouldTarget(pig, players[1], guard) == false)
local pvp = FlowBrain.Normalize({ mode = "attack", attack_players = true })
check("ShouldTarget: attack_players → players are targets", FlowBrain.ShouldTarget(pig, players[1], pvp) == true)
check("ShouldTarget: never the leader", FlowBrain.ShouldTarget(pig, players[1], pvp, players[1]) == false)
check("ShouldTarget: follow mode never attacks", FlowBrain.ShouldTarget(pig, spider, FlowBrain.Normalize({ mode = "follow", target = "KU_1" })) == false)
check("FindTarget: guard picks the hostile inside the radius (not the far one)", FlowBrain.FindTarget(pig, guard) == spider)
check("ResolveLeader: userid → the live player", FlowBrain.ResolveLeader(FlowBrain.Normalize({ mode = "follow", target = "KU_1" })) == players[1])
check("ResolveLeader: guid → Ents[guid]", FlowBrain.ResolveLeader(FlowBrain.Normalize({ mode = "follow", target = 200 })) == spider)
local a = FlowBrain.ResolveAnchor(pig, guard)
check("ResolveAnchor: the state's point", a and a.x == 0 and a.z == 0)

-- ── Apply / Restore ──
local ok = FlowBrain.Apply(pig, { mode = "follow", target = "KU_1" })
check("Apply: ok, brain swapped ONCE, original remembered", ok == true and count(pig, "SetBrain") == 1 and pig._dstp_brain_orig.brainfn == orig and brainClassCalls == 1)
check("Apply: retarget fn installed with period 1", pig.components.combat.retargetperiod == 1 and type(pig.components.combat.targetfn) == "function")
check("Apply: state readable by the brain", FlowBrain.GetState(pig).mode == "follow")
pig.components.combat.target = spider
ok = FlowBrain.Apply(pig, { mode = "stay" })
check("Apply again: no second swap, state updated, forbidden target dropped",
    ok == true and count(pig, "SetBrain") == 1 and FlowBrain.GetState(pig).mode == "stay" and pig.components.combat.target == nil)
check("retarget fn: follows the CURRENT state (stay → no target)", pig.components.combat.targetfn(pig) == nil)
FlowBrain.Apply(pig, { mode = "guard", anchor_x = 0, anchor_z = 0, brain_radius = 8, tags = "hostile" })
check("retarget fn: guard → the spider", pig.components.combat.targetfn(pig) == spider)
ok = FlowBrain.Apply(pig, { mode = "default" })
check("default: original brain restored, state cleared", ok == true and pig.brainfn == orig and pig._dstp_brain == nil and pig._dstp_brain_orig == nil)
check("Restore on a plain mob is a no-op error", select(2, FlowBrain.Restore(rabbit)) == "not_flow_brained")

-- ── command path ──
run("entity_set_brain", { guid = 100, mode = "follow", target = "KU_1", token = "b1" })
local ev = lastEvent("brain_result")
check("entity_set_brain by guid: applied + brain_result", FlowBrain.GetState(pig).mode == "follow" and ev and ev.ok == true and ev.token == "b1" and ev.guid == 100 and ev.mode == "follow")
run("entity_set_brain", { guid = 999, mode = "stay", token = "b2" })
ev = lastEvent("brain_result")
check("entity_set_brain stale guid: brain_result ok=false reason=gone", ev and ev.ok == false and ev.reason == "gone" and ev.token == "b2")
run("entity_set_brain", { guid = 100, mode = "guard", token = "b3" })
ev = lastEvent("brain_result")
check("entity_set_brain bad spec: ok=false with the reason", ev and ev.ok == false and ev.reason == "needs_anchor")

-- spawn with a brain: born controlled
mock_G.SpawnPrefab = function(name) return mkEnt(500, name, 1, 1, {}) end
run("spawn_prefab", { prefab = "spider", x = 1, z = 1, token = "sp", brain = { mode = "follow", target = "KU_1" } })
local born = ENTS[500]
check("spawn_prefab brain: the spawned mob is flow-brained on birth", born and FlowBrain.GetState(born) and FlowBrain.GetState(born).mode == "follow" and count(born, "SetBrain") == 1)
check("spawn_result still emitted", lastEvent("spawn_result") and lastEvent("spawn_result").guid == 500)

return C.report()
