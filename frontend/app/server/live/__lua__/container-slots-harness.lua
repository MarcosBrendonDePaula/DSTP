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

return C.report()
