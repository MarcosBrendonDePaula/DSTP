-- events/interaction.lua: every player action → player_action with the SERVER guid of
-- the target; actionfailed → player_action_failed with the reason; ground WALKTO
-- dropped; gated on evt_config.interaction. REAL module under fengari. "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local pushed = {}
local evt_config = { interaction = true }
local core = {
    _G = KIT.make_G(), evt_config = evt_config, DEBUG = false,
    PushEvent = function(typ, data) pushed[#pushed + 1] = { type = typ, data = data } end,
}
local Interaction = KIT.load(MOD_INTERACTION, "events/interaction.lua").Init(core)

local listeners = {}
local player = { ListenForEvent = function(_, name, fn) listeners[name] = fn end }
Interaction.RegisterForPlayer(player, "KU_1", "Joe")
check("hooks performaction + actionfailed", type(listeners.performaction) == "function" and type(listeners.actionfailed) == "function")

local chester = { GUID = 4242, prefab = "chester", Transform = { GetWorldPosition = function() return 10.4, 0, -3.6 end } }
local ba = { action = { id = "LOOK" }, target = chester, doer = player }
listeners.performaction(player, { action = ba })
local e = pushed[#pushed]
check("LOOK on chester → player_action with server guid/prefab/rounded pos + userid",
    e and e.type == "player_action" and e.data.action == "LOOK" and e.data.guid == 4242 and e.data.prefab == "chester"
    and e.data.x == 10 and e.data.z == -4 and e.data.userid == "KU_1" and e.data.name == "Joe")

local axe = { GUID = 7, prefab = "axe" }
listeners.performaction(player, { action = { action = { id = "CHOP" }, target = { GUID = 9, prefab = "evergreen" }, invobject = axe } })
e = pushed[#pushed]
check("CHOP with an axe → item + item_guid", e.data.action == "CHOP" and e.data.item == "axe" and e.data.item_guid == 7 and e.data.prefab == "evergreen")

local n = #pushed
listeners.performaction(player, { action = { action = { id = "WALKTO" }, pos = { x = 1, y = 0, z = 2 } } })
check("ground WALKTO (no target) is dropped", #pushed == n)
listeners.performaction(player, { action = { action = { id = "WALKTO" }, target = chester } })
check("WALKTO on an entity IS reported", #pushed == n + 1 and pushed[#pushed].data.guid == 4242)

listeners.performaction(player, { action = { action = { id = "DEPLOY" }, pos = { GetPosition = function() return { x = 5.6, z = 7.2 } end }, invobject = { prefab = "wall_wood_item", GUID = 11 } } })
e = pushed[#pushed]
check("DEPLOY at a DynamicPosition → x/z from the pos, item carried", e.data.action == "DEPLOY" and e.data.x == 6 and e.data.z == 7 and e.data.item == "wall_wood_item")

listeners.performaction(player, { action = { action = { id = "GIVE" }, target = { GUID = 55, prefab = "wilson", userid = "KU_2" }, invobject = { prefab = "meat", GUID = 12 } } })
check("GIVE to a player → target_userid", pushed[#pushed].data.target_userid == "KU_2")

listeners.actionfailed(player, { action = ba, reason = "INUSE" })
e = pushed[#pushed]
check("actionfailed → player_action_failed with the reason", e.type == "player_action_failed" and e.data.action == "LOOK" and e.data.reason == "INUSE" and e.data.guid == 4242)

evt_config.interaction = false
n = #pushed
listeners.performaction(player, { action = ba })
listeners.actionfailed(player, { action = ba, reason = "X" })
check("category off → nothing pushed", #pushed == n)

check("Describe(nil) is nil, no crash", Interaction.Describe(nil) == nil and Interaction.Describe({}) == nil)

return C.report()
