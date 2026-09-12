-- rules_engine + entity events: `entity_event` is a SYNTHETIC event (dispatched by the
-- data-feed client half, never a DST listener on ThePlayer), rules can condition on
-- event.kind / event.amount and their `do` templates resolve the payload — e.g. a
-- floating "-30" label following the hit entity, fully client-side.
-- Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local playerListens = 0
local player = {
    userid = "KU_1", valid = true,
    IsValid = function() return true end,
    ListenForEvent = function() playerListens = playerListens + 1 end,
    RemoveEventCallback = function() end,
}
local mock_G = KIT.make_G({ ThePlayer = player, print = function() end, json = KIT.fake_json })

local Rules = KIT.load(MOD_RULES, "rules_engine.lua")
Rules.Init({ GLOBAL = mock_G, modname = "dstp" })
local created = {}
Rules.SetUIWidgets({
    CreateWidget = function(cmd) created[#created + 1] = cmd end,
    UpdateWidget = function() end, DestroyWidget = function() end,
})

Rules.ProcessCommand({ action = "rules_install", rules = {
    { id = "dmg", when = { event = "entity_event", conditions = { { field = "event.kind", op = "equals", value = "hit" } } },
      ["do"] = { { action = "show_widget", id = "dmg_{{event.guid}}_{{event.seq}}", type = "label", text = "-{{event.amount}}",
                   follow = { guid = "{{event.guid}}", offset_y = 80 }, ttl = 1 } } },
} })
check("installing a rule on entity_event hooks NO DST listener on ThePlayer (synthetic)", playerListens == 0)

Rules.HandleEvent("entity_event", { kind = "hit", amount = 30, guid = 4242, seq = 7, prefab = "spider" })
check("rule fired on kind=hit → show_widget", #created == 1)
local w = created[1] or {}
check("templates resolved from the event payload (text '-30', follow.guid 4242, id dmg_4242_7)",
    w.text == "-30" and w.follow and w.follow.guid == 4242 and w.id == "dmg_4242_7" and w.ttl == 1)

Rules.HandleEvent("entity_event", { kind = "burn", guid = 4242, seq = 8 })
check("kind=burn does not match the hit rule", #created == 1)

return C.report()
