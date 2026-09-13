-- data_feed harness: runs the REAL DST_MOD/scripts/dstp/data_feed.lua under fengari.
-- The feed is the GENERIC server→client data path: a flow says "for this player, ship
-- fields X/Y of entities matching P within R every T seconds" and the server module
-- snapshots them (whitelisted readers + `component.field` plain reads) over ONE
-- net_string per player; the client half writes them onto the matching entities as
-- `inst.dstp_<field>` — the same fields the UI `bind` props read. No netvars, no reload.
-- Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

-- ── world mocks ─────────────────────────────────────────────────────────────
local tasks = {}
local NEAR = {}          -- what TheSim:FindEntities returns (server AND client scans)
local function mkPlayer(userid)
    local p = { userid = userid, valid = true, prefab = "wilson" }
    p.Transform = { GetWorldPosition = function() return 0, 0, 0 end }
    p.IsValid = function(self) return self.valid end
    p.HasTag = function(self, t) return t == "player" end
    p.DoPeriodicTask = function(self, period, fn)
        local t = { fn = fn, period = period, cancelled = false }
        t.Cancel = function(tt) tt.cancelled = true end
        tasks[#tasks + 1] = t
        return t
    end
    return p
end
local frameTasks = {}   -- inst:DoTaskInTime(0, fn) = "end of frame" work; endFrame() runs it
local function endFrame() local t = frameTasks; frameTasks = {}; for _, fn in ipairs(t) do fn() end end
local function mkEnt(netid, prefab, comps)
    local e = { prefab = prefab, valid = true, tags = {}, components = comps or {}, listeners = {} }
    e.Network = { GetNetworkID = function() return netid end }
    e.Transform = { GetWorldPosition = function() return 1, 0, 1 end }
    e.IsValid = function(self) return self.valid end
    e.HasTag = function(self, t) return self.tags[t] == true end
    -- DST entity event API (what the server half hooks for event feeds)
    e.ListenForEvent = function(self, ev, fn) self.listeners[ev] = self.listeners[ev] or {}; table.insert(self.listeners[ev], fn) end
    e.RemoveEventCallback = function(self, ev, fn)
        local l = self.listeners[ev] or {}
        for i = #l, 1, -1 do if l[i] == fn then table.remove(l, i) end end
    end
    e.PushEvent = function(self, ev, data) for _, fn in ipairs(self.listeners[ev] or {}) do fn(self, data) end end
    e.DoTaskInTime = function(self, delay, fn) frameTasks[#frameTasks + 1] = fn; return { Cancel = function() end } end
    e.listenerCount = function(self) local n = 0; for _, l in pairs(self.listeners) do n = n + #l end; return n end
    return e
end
local function tick(n) for _ = 1, (n or 1) do for _, t in ipairs(tasks) do if not t.cancelled then t.fn() end end end end
local function liveTasks() local n = 0; for _, t in ipairs(tasks) do if not t.cancelled then n = n + 1 end end; return n end

local player = mkPlayer("KU_1")
local sent = {}   -- every packet the module would put on the wire: { player=, packet= }
local mock_G = KIT.make_G({
    AllPlayers = { player },
    ThePlayer = player,
    TheSim = { FindEntities = function() local out = {}; for _, e in ipairs(NEAR) do out[#out + 1] = e end; return out end },
    TheWorld = { ismastersim = true, state = {} },
    pcall = pcall, print = function() end,
})

local registered = {}
local core = {
    _G = mock_G,
    RegisterCommand = function(name, fn) registered[name] = fn end,
    FindPlayer = function(userid) for _, p in ipairs(mock_G.AllPlayers) do if p.userid == userid then return p end end end,
    Log = function() end, LogError = function() end,
}
local Feed = KIT.load(MOD_DATA_FEED, "data_feed.lua")
Feed.Init({ GLOBAL = mock_G, core = core, send = function(p, packet) sent[#sent + 1] = { player = p, packet = packet } end })

check("feed_start / feed_stop commands registered", registered.feed_start ~= nil and registered.feed_stop ~= nil)

-- ── 1) snapshot: whitelisted readers + generic component.field, prefab filter, netid keys ──
local spA = mkEnt(5001, "spider", { health = { currenthealth = 50, maxhealth = 100 }, hunger = { current = 20, max = 80 } })
local spB = mkEnt(5002, "spider", { health = { currenthealth = 100, maxhealth = 100 }, burnable = { IsBurning = function() return true end } })
local tree = mkEnt(5003, "evergreen", { health = { currenthealth = 9, maxhealth = 9 } })
NEAR = { spA, spB, tree }

registered.feed_start({ userid = "KU_1", id = "mobs", prefabs = { "spider" }, radius = 25, interval = 0.5,
                        fields = { "hp", "hp_max", "hunger", "burning", "health.maxhealth", "bogus_field" } })
check("start registers ONE periodic task per player", liveTasks() == 1)
tick(1)
check("first tick sends a packet", #sent == 1)
local pk = sent[1] and sent[1].packet or {}
local ents = pk.ents or {}
check("packet keyed by NETWORK id, only matching prefabs (spiders yes, tree no)",
    ents[5001] ~= nil and ents[5002] ~= nil and ents[5003] == nil)
check("hp/hp_max read from components.health", ents[5001] and ents[5001].hp == 50 and ents[5001].hp_max == 100)
check("hunger read from components.hunger", ents[5001] and ents[5001].hunger == 20)
check("burning read via IsBurning()", ents[5002] and ents[5002].burning == true)
check("generic component.field read (health.maxhealth)", ents[5001] and ents[5001]["health.maxhealth"] == 100)
check("unknown field is dropped, not an error", ents[5001] and ents[5001].bogus_field == nil)
check("packet carries the scan radius for the client to resolve netids", pk.radius == 25)

-- ── 2) change detection: identical state → no packet; a change → packet ──
tick(1)
check("no change → no packet (still 1)", #sent == 1)
spA.components.health.currenthealth = 25
tick(1)
check("hp changed → new packet with the new value", #sent == 2 and sent[2].packet.ents[5001].hp == 25)

-- ── 3) entity leaves range → it disappears from the next packet ──
NEAR = { spA, tree }
tick(1)
check("entity out of range dropped from the packet", #sent == 3 and sent[3].packet.ents[5002] == nil and sent[3].packet.ents[5001] ~= nil)

-- ── 4) cap: at most `max` entities per feed (default 30, hard cap 60) ──
local many = {}
for i = 1, 70 do many[i] = mkEnt(6000 + i, "spider", { health = { currenthealth = i, maxhealth = 100 } }) end
NEAR = many
registered.feed_start({ userid = "KU_1", id = "mobs", prefabs = { "spider" }, radius = 25, fields = { "hp" }, max = 500 })
tick(1)
local n = 0
for _ in pairs(sent[#sent].packet.ents) do n = n + 1 end
check("entities per feed hard-capped at 60 (got " .. n .. ")", n == 60)
check("re-starting the same feed id replaces it (still ONE task)", liveTasks() == 1)

-- ── 5) two feeds on one player merge into ONE packet (one net_string, no clobber) ──
local hound = mkEnt(7001, "hound", { health = { currenthealth = 10, maxhealth = 150 }, temperature = { GetCurrent = function() return 33 end } })
NEAR = { spA, hound }
registered.feed_start({ userid = "KU_1", id = "mobs", prefabs = { "spider" }, radius = 25, fields = { "hp" } })
registered.feed_start({ userid = "KU_1", id = "hounds", prefabs = { "hound" }, radius = 40, fields = { "temperature" } })
tick(1)
local last = sent[#sent].packet
check("two feeds → one merged packet (spider hp + hound temperature)",
    last.ents[5001] and last.ents[5001].hp == 25 and last.ents[7001] and last.ents[7001].temperature == 33)
check("merged packet radius = the largest feed radius", last.radius == 40)
check("still ONE task for the player", liveTasks() == 1)

-- ── 6) stop: one feed stops, the other keeps going; stopping all cancels the task ──
local before = #sent
registered.feed_stop({ userid = "KU_1", id = "hounds" })
tick(1)
check("after stopping 'hounds' its entity leaves the packet", #sent == before + 1 and sent[#sent].packet.ents[7001] == nil)
registered.feed_stop({ userid = "KU_1", id = "mobs" })
check("stopping the last feed cancels the player's task", liveTasks() == 0)

-- ── 7) player gone → task stops itself ──
registered.feed_start({ userid = "KU_1", id = "mobs", prefabs = { "spider" }, radius = 25, fields = { "hp" } })
player.valid = false
tick(1)
check("invalid player → task cancelled", liveTasks() == 0)
player.valid = true

-- ── 8) CLIENT half: Apply writes dstp_<field> onto the entity with the same netid ──
local cSpider = mkEnt(5001, "spider")   -- the client's OWN instance of spider A
local cOther = mkEnt(9999, "spider")
NEAR = { cSpider, cOther }
Feed.Apply({ radius = 25, ents = { [5001] = { hp = 25, hp_max = 100, burning = false } } })
check("client Apply sets inst.dstp_hp / dstp_hp_max on the matching entity", cSpider.dstp_hp == 25 and cSpider.dstp_hp_max == 100)
check("client Apply leaves other entities untouched", cOther.dstp_hp == nil)
check("client Apply writes booleans too", cSpider.dstp_burning == false)
-- JSON object keys arrive as STRINGS after decode — must still match
Feed.Apply({ radius = 25, ents = { ["5001"] = { hp = 7 } } })
check("client Apply accepts string netid keys (JSON)", cSpider.dstp_hp == 7)
-- generic `component.field` names are exposed with the dot replaced by `_` so a UI
-- `bind` can reach them (entity.dstp_workable_workleft — a dotted key is unreachable)
Feed.Apply({ radius = 25, ents = { [5001] = { ["workable.workleft"] = 3 } } })
check("client Apply exposes dotted fields as dstp_<comp>_<field>", cSpider.dstp_workable_workleft == 3)
Feed.OnEntity(cSpider, { s = 99, f = { ["workable.maxwork"] = 6 } })
check("client OnEntity exposes dotted fields the same way", cSpider.dstp_workable_maxwork == 6)

-- ── 9) FLOW-COMPUTED values: entity_set_data writes inst.dstp_data[name]; the feed
--       reads it as the field "data.<name>" like any component field ──
check("entity_set_data command registered", registered.entity_set_data ~= nil)
local bounty = mkEnt(5555, "spider", { health = { currenthealth = 1, maxhealth = 2 } })
bounty.GUID = 777
mock_G.Ents = { [777] = bounty }
registered.entity_set_data({ guid = 777, name = "bounty", value = 150 })
check("SetData stores a plain value on the entity", bounty.dstp_data and bounty.dstp_data.bounty == 150)
check("Read('data.bounty') returns the flow-written value", Feed.Read(bounty, "data.bounty") == 150)
registered.entity_set_data({ guid = 777, name = "label", value = "Chefe" })
check("strings are allowed too", Feed.Read(bounty, "data.label") == "Chefe")
registered.entity_set_data({ guid = 777, name = "junk", value = { nested = true } })
check("tables are rejected at WRITE time (data, not structures)", bounty.dstp_data.junk == nil and Feed.Read(bounty, "data.junk") == nil)
registered.entity_set_data({ guid = 777, name = "bounty" })          -- no value → clear
check("no value clears the field", Feed.Read(bounty, "data.bounty") == nil)
registered.entity_set_data({ guid = 999999, name = "x", value = 1 })  -- unknown guid → no crash
-- the feed ships data.* fields like any other (JSON here: no slots on this entity)
registered.entity_set_data({ guid = 777, name = "bounty", value = 42 })
NEAR = { bounty }
sent = {}; tasks = {}
registered.feed_start({ userid = "KU_1", id = "bounty", prefabs = { "spider" }, radius = 20, fields = { "hp", "data.bounty", "data.label" } })
tick(1)
local pb = sent[#sent] and sent[#sent].packet
check("feed ships flow-written fields (data.bounty=42, data.label=Chefe) next to component fields",
    pb and pb.ents[5555] and pb.ents[5555]["data.bounty"] == 42 and pb.ents[5555]["data.label"] == "Chefe" and pb.ents[5555].hp == 1)
registered.feed_stop({ userid = "KU_1", id = "bounty" })

-- ── 10) THE COMPOSITE ENTITY CHANNEL: ONE net_string per entity (`inst._dstp_ent`),
--        carrying its fields AND the events of one frame as a batch with a sequence.
--        Netvars are state, not a queue, so two hits in the same frame must travel
--        together, not overwrite each other. Replaces N float slots with one string;
--        the float slots stay as an optional fast path for hot numeric fields ──
local evts = {}
Feed.Init({ GLOBAL = mock_G, core = core,
            send = function(p, packet) sent[#sent + 1] = { player = p, packet = packet } end,
            sendEnt = function(inst, packet) evts[#evts + 1] = { inst = inst, packet = packet } end })
local function mkNet() local s = { v = nil }; s.set = function(self, v) self.v = v end; s.value = function(self) return self.v end; return s end
local ev = mkEnt(5601, "spider", { health = { currenthealth = 50, maxhealth = 100 } }); ev._dstp_ent = mkNet()
local evOther = mkEnt(5602, "evergreen", {}); evOther._dstp_ent = mkNet()
local noChan = mkEnt(5603, "spider", { health = { currenthealth = 7, maxhealth = 9 } })   -- not in the preset: no channel
NEAR = { ev, evOther, noChan }
sent = {}; tasks = {}
registered.feed_start({ userid = "KU_1", id = "ev", prefabs = { "spider" }, radius = 20, fields = { "hp" }, events = { "hit", "burn", "bogus" } })
tick(1)
check("event feed subscribes the matching entity (attacked + onignite listeners)",
    ev.listeners.attacked and #ev.listeners.attacked == 1 and ev.listeners.onignite and #ev.listeners.onignite == 1)
check("unknown event kind ('bogus') is ignored, non-matching entity untouched", ev:listenerCount() == 2 and evOther:listenerCount() == 0)
check("entity WITHOUT a channel gets no listeners (nowhere to send)", noChan:listenerCount() == 0)
check("fields of a channel entity leave the per-player JSON (they ride the entity channel)",
    sent[#sent] and sent[#sent].packet.ents[5601] ~= nil and sent[#sent].packet.ents[5601].hp == nil)
check("entity without a channel still gets its fields by per-player JSON", sent[#sent].packet.ents[5603] and sent[#sent].packet.ents[5603].hp == 7)

-- two hits in the same frame → ONE packet with the fields AND both hits, in order, seq 1
ev:PushEvent("attacked", { damage = 30, attacker = player })
ev:PushEvent("attacked", { damage = 12, attacker = evOther })
check("nothing on the entity channel before the frame ends", #evts == 0)
check("exactly ONE flush task scheduled for the frame (not one per event)", #frameTasks == 1)
endFrame()
check("one packet per frame: fields + BOTH hits (s=1)", #evts == 1 and evts[1].inst == ev and evts[1].packet.s == 1
    and evts[1].packet.f and evts[1].packet.f.hp == 50 and #evts[1].packet.e == 2)
local h1, h2 = evts[1].packet.e[1], evts[1].packet.e[2]
check("hit payload = kind, damage, attacker id (userid for players, prefab otherwise)",
    h1[1] == "hit" and h1[2] == 30 and h1[3] == "KU_1" and h2[1] == "hit" and h2[2] == 12 and h2[3] == "evergreen")

-- next frame: burn only → seq 2, fields still included (a late-joining client must see them)
ev:PushEvent("onignite", {})
endFrame()
check("next batch has seq 2, burn event, fields still carried", #evts == 2 and evts[2].packet.s == 2
    and evts[2].packet.e[1][1] == "burn" and evts[2].packet.f.hp == 50)
endFrame()
check("a quiet frame sends nothing", #evts == 2)
-- a field change alone → packet with no events
ev.components.health.currenthealth = 44
tick(1); endFrame()
check("field change → packet with f.hp=44 and no e", #evts == 3 and evts[3].packet.f.hp == 44 and evts[3].packet.e == nil)
tick(1); endFrame()
check("unchanged fields → nothing", #evts == 3)

-- entity leaves every feed → listeners removed (after the grace window)
NEAR = { evOther, noChan }
KIT.now = (KIT.now or 0) + 10
tick(1)
check("entity out of range → unsubscribed (no listeners left)", ev:listenerCount() == 0)
ev:PushEvent("attacked", { damage = 5 }); endFrame()
check("no packet after unsubscribe", #evts == 3)
registered.feed_stop({ userid = "KU_1", id = "ev" })

-- CLIENT: OnEntity → dstp_<field>, dstp_last_* + the entity_event hook; duplicates by seq ignored
local hooks = {}
Feed.on_entity_event = function(inst, kind, args) hooks[#hooks + 1] = { inst = inst, kind = kind, args = args } end
local cEv = mkEnt(5601, "spider")
Feed.OnEntity(cEv, { s = 1, f = { hp = 50 }, e = { { "hit", 30, "KU_1" }, { "burn" } } })
check("client applies fields (dstp_hp=50)", cEv.dstp_hp == 50)
check("client exposes last event + per-kind payload (dstp_last_event=burn, dstp_last_hit=30)", cEv.dstp_last_event == "burn" and cEv.dstp_last_hit == 30)
check("client hook fired once per event, in order", #hooks == 2 and hooks[1].kind == "hit" and hooks[1].args[1] == 30 and hooks[2].kind == "burn")
Feed.OnEntity(cEv, { s = 1, f = { hp = 50 }, e = { { "hit", 30, "KU_1" }, { "burn" } } })   -- replay of the same batch
check("same seq replayed → ignored", #hooks == 2)
Feed.OnEntity(cEv, { s = 2, f = { hp = 42 }, e = { { "heal", 8 } } })
check("newer seq processed (hp=42, heal hook)", #hooks == 3 and cEv.dstp_last_heal == 8 and cEv.dstp_hp == 42)

-- ═══════════════════════════════════════════════════════════════════════════════
-- SLOT POOL — "dynamic netvars" the safe way. modmain declares N generic net_floats
-- (`inst._dstp_slot[i]`) on a preset prefab list, identical both sides at PostInit;
-- data_feed assigns MEANING to the slots at runtime (slot i = field), writes them
-- per tick (the engine deltas them per frame), ships the slot map in the JSON packet,
-- and the client decodes slot dirty events into inst.dstp_<field>. Fields that don't
-- fit (no free slot, entity without slots, string values) still go through JSON.
-- ═══════════════════════════════════════════════════════════════════════════════
local function mkSlot()
    local s = { v = nil }
    s.set = function(self, v) self.v = v end
    s.value = function(self) return self.v end
    return s
end
local function addSlots(e, n) e._dstp_slot = {}; for i = 1, n do e._dstp_slot[i] = mkSlot() end; return e end

-- presets data module (what modmain gates the slot declaration by)
local SlotPrefabs = KIT.load(MOD_SLOT_PREFABS, "slot_prefabs.lua")
check("slot_prefabs: presets off/mobs/mobs_structures exist",
    type(SlotPrefabs.presets) == "table" and SlotPrefabs.presets.off and SlotPrefabs.presets.mobs and SlotPrefabs.presets.mobs_structures)
check("slot_prefabs: 'mobs' has spider, 'mobs_structures' has firepit too",
    SlotPrefabs.presets.mobs.spider == true and SlotPrefabs.presets.mobs_structures.firepit == true and SlotPrefabs.presets.mobs.firepit == nil)
check("slot_prefabs: 'off' is empty", next(SlotPrefabs.presets.off) == nil)

-- fresh module state for the slot scenario
sent = {}; tasks = {}
Feed.ConfigureSlots(2)
local sp = addSlots(mkEnt(8001, "spider", { health = { currenthealth = 25, maxhealth = 100 }, temperature = { GetCurrent = function() return 12 end },
                                            burnable = { IsBurning = function() return true end } }), 2)
local hd = mkEnt(8002, "hound", { health = { currenthealth = 40, maxhealth = 150 } })   -- NO slots (not in preset)
NEAR = { sp, hd }

-- 1) fields beyond the pool, and entities without slots, fall back to JSON
registered.feed_start({ userid = "KU_1", id = "A", prefabs = { "spider", "hound" }, radius = 20, fields = { "hp", "hp_max", "temperature" } })
tick(1)
local p1 = sent[#sent].packet
check("slot map assigned in request order, capped at the pool size (2)",
    p1.slots and #p1.slots == 2 and p1.slots[1].name == "hp" and p1.slots[2].name == "hp_max" and p1.slots[1].kind == "number")
check("slot-carried fields are WRITTEN to the entity's netvar slots", sp._dstp_slot[1].v == 25 and sp._dstp_slot[2].v == 100)
check("slot-carried fields are NOT repeated in the JSON row", p1.ents[8001] and p1.ents[8001].hp == nil and p1.ents[8001].hp_max == nil)
check("field with no free slot (temperature) still travels by JSON", p1.ents[8001] and p1.ents[8001].temperature == 12)
check("entity WITHOUT slots gets everything by JSON", p1.ents[8002] and p1.ents[8002].hp == 40 and p1.ents[8002].hp_max == 150)

-- 2) slot values delta per tick; unchanged JSON → no packet even though slots were re-set
sp.components.health.currenthealth = 10
tick(1)
check("slot rewritten with the new value", sp._dstp_slot[1].v == 10)
check("a slot-only change does NOT produce a JSON packet (the engine deltas the slot)", #sent == 1)

-- 3) stable map: a new field waits for a free slot; freeing slots reassigns without moving survivors
registered.feed_start({ userid = "KU_1", id = "B", prefabs = { "spider" }, radius = 20, fields = { "burning" } })
tick(1)
check("no free slot → burning goes by JSON meanwhile", sent[#sent].packet.ents[8001].burning == true)
registered.feed_stop({ userid = "KU_1", id = "A" })
tick(1)
local p3 = sent[#sent].packet
check("after feed A stops, 'burning' takes the freed slot 1 with kind=bool",
    p3.slots and p3.slots[1] and p3.slots[1].name == "burning" and p3.slots[1].kind == "bool" and p3.slots[2] == nil)
check("bool encoded as 1/0 in the slot", sp._dstp_slot[1].v == 1)
registered.feed_stop({ userid = "KU_1", id = "B" })

-- 4) CLIENT: slot dirty events decode through the map; events before the map are queued
local cSp = addSlots(mkEnt(8001, "spider"), 2)
NEAR = { cSp }
Feed.ResetClient()
Feed.OnSlot(cSp, 1, 42)                       -- arrives BEFORE any map is known
check("slot value before the map is parked, not exposed", cSp.dstp_hp == nil)
Feed.Apply({ radius = 20, slots = { { name = "hp", kind = "number" }, { name = "burning", kind = "bool" } }, ents = {} })
check("map arrival applies the parked slot value (dstp_hp = 42)", cSp.dstp_hp == 42)
Feed.OnSlot(cSp, 2, 1)
check("bool slot decodes 1 → true", cSp.dstp_burning == true)
Feed.OnSlot(cSp, 2, 0)
check("bool slot decodes 0 → false", cSp.dstp_burning == false)
Feed.OnSlot(cSp, 1, 7)
check("later slot dirty updates the field directly", cSp.dstp_hp == 7)

return C.report()
