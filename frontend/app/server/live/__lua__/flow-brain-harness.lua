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
    e._listeners = {}
    e.ListenForEvent = function(self, name, fn) self._listeners[name] = self._listeners[name] or {}; table.insert(self._listeners[name], fn) end
    e.RemoveEventCallback = function(self, name, fn)
        for i, f in ipairs(self._listeners[name] or {}) do if f == fn then table.remove(self._listeners[name], i) end end
    end
    e.PushEvent = function(self, name, data) for _, f in ipairs(self._listeners[name] or {}) do f(self, data) end end
    e.DoPeriodicTask = function(self, period, fn) self._task = { period = period, fn = fn, cancelled = false, Cancel = function(t) t.cancelled = true end }; return self._task end
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
-- ── events back to the flow ──
local function countEv(typ) local n = 0 for _, e in ipairs(Core.state.event_queue) do if e.type == typ then n = n + 1 end end return n end
check("hooks: newcombattarget/droppedtarget/death listeners + a 0.5s monitor installed once",
    #pig._listeners["newcombattarget"] == 1 and #pig._listeners["droppedtarget"] == 1 and #pig._listeners["death"] == 1 and pig._task and pig._task.period == 0.5)
pig:PushEvent("newcombattarget", { target = spider })
local ev = lastEvent("brain_target_acquired")
check("brain_target_acquired: guid/prefab/mode + target guid/prefab", ev and ev.guid == 100 and ev.prefab == "pigman" and ev.mode == "guard" and ev.target_guid == 200 and ev.target_prefab == "spider")
pig:PushEvent("droppedtarget", { target = spider })
check("brain_target_lost pushed", lastEvent("brain_target_lost") and lastEvent("brain_target_lost").target_guid == 200)
-- follow monitor: far (pig 0,0 / player 5,5 → 7.07 > follow_dist 4) → nothing; near → arrived ONCE
FlowBrain.Apply(pig, { mode = "follow", target = "KU_1" })
pig._task.fn()
check("monitor: far from the leader → no brain_arrived", countEv("brain_arrived") == 0)
pig.Transform.SetPosition(pig.Transform, 3, 0, 3)
pig._task.fn(); pig._task.fn()
check("monitor: within follow_dist → brain_arrived exactly once (edge-triggered)", countEv("brain_arrived") == 1 and lastEvent("brain_arrived").target_userid == "KU_1")
players[1] = nil
pig._task.fn(); pig._task.fn()
check("monitor: leader gone → brain_leader_lost once", countEv("brain_leader_lost") == 1 and lastEvent("brain_leader_lost").target_userid == "KU_1")
players[1] = { userid = "KU_1", IsValid = function() return true end, Transform = { GetWorldPosition = function() return 5, 0, 5 end }, isplayer = true, HasTag = function(_, t) return t == "player" end }
pig:PushEvent("death", { afflicter = spider })
check("brain_dead with the killer", lastEvent("brain_dead") and lastEvent("brain_dead").killer_prefab == "spider")

ok = FlowBrain.Apply(pig, { mode = "default" })
check("default: original brain restored, state cleared", ok == true and pig.brainfn == orig and pig._dstp_brain == nil and pig._dstp_brain_orig == nil)
check("default: listeners removed and monitor cancelled", #pig._listeners["newcombattarget"] == 0 and #pig._listeners["death"] == 0 and pig._task.cancelled == true)
check("Restore on a plain mob is a no-op error", select(2, FlowBrain.Restore(rabbit)) == "not_flow_brained")

-- ── collect ──
mock_G.BufferedAction = function(doer, target, action, inv, pos, recipe, dist)
    local ba = { doer = doer, target = target, action = action, pos = pos, distance = dist, onsuccess = {}, onfail = {} }
    ba.AddSuccessAction = function(self, fn) self.onsuccess[#self.onsuccess + 1] = fn end
    ba.AddFailAction = function(self, fn) self.onfail[#self.onfail + 1] = fn end
    ba.Succeed = function(self) for _, f in ipairs(self.onsuccess) do f() end end
    return ba
end
mock_G.ACTIONS = { WALKTO = { id = "WALKTO" } }
local given = {}
local chester = mkEnt(600, "chester", 0, 0, {})
chester.components.container = { full = false, IsFull = function(self) return self.full end, GiveItem = function(self, item) given[#given + 1] = item; return true end }
local function mkItem(guid, prefab, x, z, opts)
    opts = opts or {}
    local it = mkEnt(guid, prefab, x, z, opts.tags or {})
    it.components = { inventoryitem = { canbepickedup = opts.canbepickedup ~= false, owner = opts.owner } }
    if opts.stack then it.components.stackable = { StackSize = function() return opts.stack end } end
    if opts.burning then it.components.burnable = { IsBurning = function() return true end } end
    return it
end
local log = mkItem(601, "log", 2, 0, { stack = 3 })
local held = mkItem(602, "rocks", 1, 0, { owner = players[1] })
local hot = mkItem(603, "log", 1.5, 0, { burning = true })
local far = mkItem(604, "log", 40, 0, {})
local flint = mkItem(605, "flint", 3, 0, { tags = { "molebait" } })
ok = FlowBrain.Apply(chester, { mode = "collect", target = "KU_1" })
local cst = FlowBrain.GetState(chester)
check("collect: normalises with radius 8 + leader kept", ok == true and cst.mode == "collect" and cst.radius == 8 and cst.target_userid == "KU_1")
check("CanCollect: a free ground log → yes", FlowBrain.CanCollect(chester, log, cst) == true)
check("CanCollect: a held item → no", FlowBrain.CanCollect(chester, held, cst) == false)
check("CanCollect: a burning item → no", FlowBrain.CanCollect(chester, hot, cst) == false)
check("CanCollect: the spider (no inventoryitem) → no", FlowBrain.CanCollect(chester, spider, cst) == false)
-- FindEntities mock returns in table order; the harness only needs "some collectable within radius"
local pick = FlowBrain.FindPickup(chester, cst)
check("FindPickup: a collectable within 8 (not the far one, not the held/burning)", pick ~= nil and pick ~= far and pick ~= held and pick ~= hot)
local ba = FlowBrain.CollectAction(chester)
check("CollectAction: a WALKTO BufferedAction to the pickup, arrive at 1.5", ba and ba.action.id == "WALKTO" and ba.distance == 1.5 and ba.target == pick)
ba:Succeed()
check("arrival → container:GiveItem + brain_collected {item,count}", #given == 1 and given[1] == pick and lastEvent("brain_collected") and lastEvent("brain_collected").item == pick.prefab)
-- NO capacity policy in Lua (owner's rule): a full mob still walks to the item and tries;
-- the failed attempt is reported (brain_item_reached reason=full) and THAT item gets a
-- 10 s cooldown so the mob does not pace to it — the flow decides what to do.
chester.components.container.full = true
local rock = mkItem(610, "rocks", 2, 2, {})
check("full: the item is still a candidate (no policy in Lua)", FlowBrain.CanCollect(chester, rock, cst) == true)
given = {}
check("full: arrival → NOT taken, brain_item_reached reason=full", FlowBrain.Collect(chester, rock) == false and #given == 0
    and lastEvent("brain_item_reached") and lastEvent("brain_item_reached").item == "rocks" and lastEvent("brain_item_reached").reason == "full")
check("full: that item is on cooldown, others still candidates", FlowBrain.CanCollect(chester, rock, cst) == false and FlowBrain.CanCollect(chester, flint, cst) == true)
check("CanAccept primitive: 0 when full", FlowBrain.CanAccept(chester, flint) == 0)
chester.components.container.full = false
check("CanAccept primitive: >0 with room", FlowBrain.CanAccept(chester, flint) > 0)
run("entity_can_accept", { guid = 600, item_guid = 605, token = "cap1" })
local cap = lastEvent("entity_capacity")
check("entity_can_accept by item_guid → entity_capacity {count>0, is_full=false}", cap and cap.ok == true and cap.count > 0 and cap.is_full == false and cap.token == "cap1")
chester.components.container.full = true
run("entity_can_accept", { guid = 600, item_guid = 605, token = "cap2" })
check("entity_can_accept when full → count 0, is_full true", lastEvent("entity_capacity").count == 0 and lastEvent("entity_capacity").is_full == true)
chester.components.container.full = false
FlowBrain.Apply(chester, { mode = "collect", prefabs = "flint" })
check("collect with a prefabs filter: only flint", FlowBrain.FindPickup(chester, FlowBrain.GetState(chester)) == flint)
-- the search is centred on the LEADER: an item next to the owner (5,5) but 30 away from the mob is found; one next to the mob but far from the owner is not
local nearOwner = mkItem(606, "log", 6, 6, {})
local nearMob = mkItem(607, "log", 25, 0, {})
chester.Transform.SetPosition(chester.Transform, 25, 0, 0)
FlowBrain.Apply(chester, { mode = "collect", target = "KU_1", prefabs = "log" })
local found = FlowBrain.FindPickup(chester, FlowBrain.GetState(chester))
check("FindPickup centres on the leader (never the item by the wandering mob, 20 away from the owner)", found ~= nil and found ~= nearMob)
chester.Transform.SetPosition(chester.Transform, 0, 0, 0)
FlowBrain.Apply(chester, { mode = "stay" })
check("CollectAction outside collect mode → nil", FlowBrain.CollectAction(chester) == nil)

-- ── store = "event": the brain only reports; the FLOW takes the item through the generic command ──
given = {}
local apple = mkItem(608, "apple", 1, 1, { stack = 2 })
FlowBrain.Apply(chester, { mode = "collect", target = "KU_1", store = "event", prefabs = "apple" })
local ba2 = FlowBrain.CollectAction(chester)
check("event store: still walks to the item", ba2 and ba2.target == apple)
ba2:Succeed()
local reached = lastEvent("brain_item_reached")
check("event store: brain_item_reached {item,item_guid,count,x,z}, NOT taken", #given == 0 and reached and reached.item == "apple" and reached.item_guid == 608 and reached.count == 2 and reached.x == 1 and reached.z == 1)
run("entity_take_item", { guid = 600, item_guid = 608, token = "tk" })
local taken = lastEvent("item_taken")
check("entity_take_item: container:GiveItem + item_taken ack", #given == 1 and given[1] == apple and taken and taken.ok == true and taken.item == "apple" and taken.guid == 600)
run("entity_take_item", { guid = 600, item_guid = 999999, token = "tk2" })
check("entity_take_item: unknown item → ok=false reason=gone", lastEvent("item_taken").ok == false and lastEvent("item_taken").reason == "gone")
-- a mob with an INVENTORY (not a container) works the same
local pigInv = mkEnt(700, "pigman", 0, 0, {})
local invGiven = {}
pigInv.components.inventory = { IsFull = function() return false end, GiveItem = function(self, it) invGiven[#invGiven + 1] = it; return true end,
    FindItem = function(self, fn) for _, it in ipairs(invGiven) do if fn(it) then return it end end end,
    DropItem = function(self, it) for i, x in ipairs(invGiven) do if x == it then table.remove(invGiven, i) end end end,
    DropEverything = function(self) invGiven = {} end }
local twig = mkItem(609, "twigs", 0, 1, {})
run("entity_take_item", { guid = 700, item_guid = 609 })
check("entity_take_item on an inventory mob", #invGiven == 1 and invGiven[1] == twig)
run("entity_drop_item", { guid = 700, item = "twigs", token = "d1" })
check("entity_drop_item by prefab → dropped, item_dropped ack", #invGiven == 0 and lastEvent("item_dropped") and lastEvent("item_dropped").count == 1)

-- ── entity_give_item: spawn straight into the holder ──
local spawned = {}
mock_G.SpawnPrefab = function(name)
    local it = mkEnt(800 + #spawned, name, 0, 0, {})
    it.components = { inventoryitem = { canbepickedup = true }, stackable = { size = 1, SetStackSize = function(self, n) self.size = n end, StackSize = function(self) return self.size end } }
    spawned[#spawned + 1] = it
    return it
end
run("entity_give_item", { guid = 700, item = "log", count = "5", token = "g1" })
local gv = lastEvent("item_given")
check("entity_give_item: spawned ×5 into the inventory, item_given ack", #invGiven == 1 and invGiven[1].prefab == "log" and invGiven[1].components.stackable.size == 5 and gv and gv.ok == true and gv.item == "log" and gv.count == 5)
run("entity_give_item", { guid = 999999, item = "log", token = "g2" })
check("entity_give_item: unknown entity → ok=false reason=gone", lastEvent("item_given").ok == false and lastEvent("item_given").reason == "gone")

-- ── entity_transfer_item: holder → holder, no ground ──
local chestGiven = {}
local chest = mkEnt(900, "treasurechest", 0, 0, {})
chest.components.container = { IsFull = function() return false end, GiveItem = function(self, it) chestGiven[#chestGiven + 1] = it; return true end,
    GetAllItems = function(self) return chestGiven end,
    RemoveItem = function(self, it) for i, x in ipairs(chestGiven) do if x == it then table.remove(chestGiven, i) return it end end end }
pigInv.components.inventory.GetAllItems = function(self) return invGiven end
pigInv.components.inventory.RemoveItem = function(self, it) for i, x in ipairs(invGiven) do if x == it then table.remove(invGiven, i) return it end end end
run("entity_transfer_item", { guid = 700, target_guid = 900, item = "log", token = "t1" })
local tr = lastEvent("entity_item_transferred")
check("entity_transfer_item: the log moved pig → chest, ack moved=1", #invGiven == 0 and #chestGiven == 1 and chestGiven[1].prefab == "log" and tr and tr.moved == 1 and tr.refused == 0 and tr.ok == true)
run("entity_transfer_item", { guid = 900, target_guid = 700, item = "all", token = "t2" })
check("entity_transfer_item all: back to the pig", #chestGiven == 0 and #invGiven == 1 and lastEvent("entity_item_transferred").moved == 1)
-- the target refuses → the item goes back to the source
chest.components.container.GiveItem = function() return false end
run("entity_transfer_item", { guid = 700, target_guid = 900, item = "log", token = "t3" })
check("entity_transfer_item refused: item returned to the source, refused=1", #invGiven == 1 and lastEvent("entity_item_transferred").refused == 1 and lastEvent("entity_item_transferred").moved == 0)
FlowBrain.Apply(chester, { mode = "stay" })

-- ── one-shot tasks: entity_collect / entity_goto (any mode) ──
mock_G.Vector3 = function(x, y, z) return { x = x, y = y, z = z } end
mock_G.GetTime = function() return 100 end
given = {}
FlowBrain.Apply(chester, { mode = "stay" })
local berry = mkItem(611, "berries", 4, 4, { stack = 3 })
run("entity_collect", { guid = 600, item_guid = 611, token = "c1" })
check("entity_collect: a pickup task is set (mode untouched: stay)", FlowBrain.GetTask(chester) and FlowBrain.GetTask(chester).kind == "pickup" and FlowBrain.GetState(chester).mode == "stay")
local tba = FlowBrain.TaskAction(chester)
check("TaskAction: WALKTO the item", tba and tba.target == berry and tba.action.id == "WALKTO")
tba:Succeed()
local done = lastEvent("brain_task_done")
check("arrival → taken + brain_task_done ok with token/item/count, task cleared", #given == 1 and given[1] == berry and done and done.ok == true and done.token == "c1" and done.item == "berries" and done.count == 3 and FlowBrain.GetTask(chester) == nil)
-- by prefab: nearest matching ground item around the mob
local carrot = mkItem(612, "carrot", 1, 1, {})
run("entity_collect", { guid = 600, item = "carrot", token = "c2" })
check("entity_collect by prefab → task on the carrot", FlowBrain.GetTask(chester) and FlowBrain.GetTask(chester).item_guid == 612)
FlowBrain.TaskAction(chester):Succeed()
check("carrot taken", given[2] == carrot)
-- store=event: arrival reported, not taken
local gem = mkItem(613, "redgem", 1, 1, {})
run("entity_collect", { guid = 600, item_guid = 613, store = "event", token = "c3" })
FlowBrain.TaskAction(chester):Succeed()
check("store=event task: brain_task_done ok, item NOT taken", #given == 2 and lastEvent("brain_task_done").ok == true and lastEvent("brain_task_done").item == "redgem")
-- gone item → fails immediately; timeout via the monitor
run("entity_collect", { guid = 600, item_guid = 424242, token = "c4" })
check("entity_collect of a missing item → brain_task_done ok=false reason=gone", lastEvent("brain_task_done").ok == false and lastEvent("brain_task_done").reason == "gone" and FlowBrain.GetTask(chester) == nil)
run("entity_goto", { guid = 600, x = 10, z = 20, timeout = 5, token = "g1" })
local gba = FlowBrain.TaskAction(chester)
check("entity_goto: WALKTO a point", gba and gba.target == nil and gba.pos and gba.pos.x == 10 and gba.pos.z == 20)
mock_G.GetTime = function() return 200 end
chester._task.fn()
check("goto past its timeout → brain_task_done ok=false reason=timeout (monitor)", lastEvent("brain_task_done").reason == "timeout" and FlowBrain.GetTask(chester) == nil)
mock_G.GetTime = function() return 100 end
-- a mob WITHOUT a flow brain gets one (stay) so the task can run
local pigPlain = mkEnt(710, "pigman", 0, 0, {})
pigPlain.brainfn = orig
pigPlain.components.inventory = { IsFull = function() return false end, GiveItem = function() return true end }
run("entity_goto", { guid = 710, target_guid = 600, token = "g2" })
check("entity_goto on a plain mob: flow brain applied in stay + goto task to the target", FlowBrain.GetState(pigPlain) and FlowBrain.GetState(pigPlain).mode == "stay" and FlowBrain.GetTask(pigPlain).target_guid == 600)

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
check("spawn with brain + token also acks with brain_result", lastEvent("brain_result") and lastEvent("brain_result").token == "sp" and lastEvent("brain_result").ok == true and lastEvent("brain_result").mode == "follow")

return C.report()
