-- container_slots.lua: grid layout + growing Klei's containers.params at load.
-- REAL module under fengari. "OK"/"FAIL: ...".
local C = KIT.new_checker()
local check = C.check

local CS = KIT.load(MOD_CONTAINER_SLOTS, "container_slots.lua")

check("Cols: 9→3, 16→4, 25→5, 36→6", CS.Cols(9) == 3 and CS.Cols(16) == 4 and CS.Cols(25) == 5 and CS.Cols(36) == 6)

-- 9 slots = Klei's own 3x3 chest: first slot (-80, 80), centre (0,0), last (80,-80)
local g9 = CS.Grid(9)
check("Grid(9) is the vanilla 3x3: first (-80,80), 5th (0,0), last (80,-80)",
    #g9 == 9 and g9[1].x == -80 and g9[1].y == 80 and g9[5].x == 0 and g9[5].y == 0 and g9[9].x == 80 and g9[9].y == -80)
local g16 = CS.Grid(16)
check("Grid(16): 4x4 centred, first (-120,120), last (120,-120)", #g16 == 16 and g16[1].x == -120 and g16[1].y == 120 and g16[16].x == 120 and g16[16].y == -120)
local g12 = CS.Grid(12)
check("Grid(12): 4 cols x 3 rows, rows centred (y 80, 0, -80)", #g12 == 12 and g12[1].y == 80 and g12[5].y == 0 and g12[9].y == -80 and g12[4].x == 120)

-- Apply: only grows; aliases sharing the table grow together; a Vector3 ctor is used
local V3 = function(x, y, z) return { x = x, y = y, z = z, isv3 = true } end
local chest = { widget = { slotpos = { 1, 2, 3, 4, 5, 6, 7, 8, 9 }, animbank = "ui_chest_3x3" } }
local params = { treasurechest = chest, pandoraschest = chest, chester = { widget = { slotpos = { 1, 2, 3, 4, 5, 6, 7, 8, 9 } } }, backpack = { widget = { slotpos = { 1, 2, 3, 4, 5, 6, 7, 8 } } } }
local changed = CS.Apply(params, { treasurechest = 25, chester = 9, backpack = 4, nothere = 30 }, V3)
table.sort(changed)
check("Apply: only the growing prefab changed (chester=9 same, backpack=4 shrink refused, unknown ignored)", #changed == 1 and changed[1] == "treasurechest")
check("Apply: chest now 25 Vector3 slots, aliases follow (same table)", #params.treasurechest.widget.slotpos == 25 and params.treasurechest.widget.slotpos[1].isv3 and #params.pandoraschest.widget.slotpos == 25)
check("Apply: chester untouched at 9, backpack untouched at 8", #params.chester.widget.slotpos == 9 and #params.backpack.widget.slotpos == 8)
check("Apply: animbank kept (cosmetic frame untouched)", params.treasurechest.widget.animbank == "ui_chest_3x3")

-- ── per-instance (runtime, flow-controlled) ──
local base = { widget = { slotpos = { 1, 2, 3, 4, 5, 6, 7, 8, 9 }, animbank = "ui_chest_3x3" }, type = "chest" }
local P = { treasurechest = base }
local d16 = CS.Data(P, "treasurechest", 16, V3)
check("Data: a COPY with 16 Vector3 slots, base untouched", d16 and #d16.widget.slotpos == 16 and d16.widget.slotpos[1].isv3 and d16.type == "chest" and #base.widget.slotpos == 9 and d16.widget.animbank == "ui_chest_3x3")
check("Data: unknown prefab → nil", CS.Data(P, "nope", 16, V3) == nil)

-- server instance: component WidgetSetup called with the grown data; netvar + persistence updated
local setups = {}
local inst = { prefab = "treasurechest", GUID = 5,
    components = { container = { numslots = 9, WidgetSetup = function(self, prefab, data) setups[#setups + 1] = { prefab, data }; self.numslots = #data.widget.slotpos end }, dstp_slots = {} },
    _dstp_slots = { v = nil, set = function(self, n) self.v = n end } }
local ok, why = CS.SetInstance(inst, 25, P, V3)
check("SetInstance server: WidgetSetup(prefab, 25-slot data), netvar set, component n", ok == true and #setups == 1 and setups[1][1] == "treasurechest" and #setups[1][2].widget.slotpos == 25 and inst._dstp_slots.v == 25 and inst.components.dstp_slots.n == 25 and inst.components.container.numslots == 25)
ok, why = CS.SetInstance(inst, 16, P, V3)
check("SetInstance: shrinking refused (not_bigger), nothing applied", ok == false and why == "not_bigger" and #setups == 1)
ok, why = CS.SetInstance({ prefab = "rabbit", GUID = 6, components = {} }, 16, P, V3)
check("SetInstance: no container → no_container", ok == false and why == "no_container")

-- client instance: the replica gets the same layout
local rsetups = {}
local cinst = { prefab = "treasurechest", GUID = 5, replica = { container = { n = 9, GetNumSlots = function(self) return self.n end, WidgetSetup = function(self, prefab, data) rsetups[#rsetups + 1] = data; self.n = #data.widget.slotpos end } } }
check("ApplyToInstance client: replica WidgetSetup with 25 slots", CS.ApplyToInstance(cinst, 25, P, V3, false) == true and #rsetups == 1 and #rsetups[1].widget.slotpos == 25 and cinst.replica.container.n == 25)

return C.report()
