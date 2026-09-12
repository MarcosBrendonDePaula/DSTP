-- rules_engine dom_* actions (task 10): a rule's `do` can mutate a live tree through
-- UIWidgets (dom_set / dom_append / dom_remove / dom_toggle), with templates resolved
-- from the event payload — no backend round-trip. Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local player = { userid = "KU_1", IsValid = function() return true end, ListenForEvent = function() end, RemoveEventCallback = function() end }
local mock_G = KIT.make_G({ ThePlayer = player, print = function() end, json = KIT.fake_json })

local Rules = KIT.load(MOD_RULES, "rules_engine.lua")
Rules.Init({ GLOBAL = mock_G, modname = "dstp" })
local cmds = {}
Rules.SetUIWidgets({
    CreateWidget = function() end, UpdateWidget = function() end, DestroyWidget = function() end,
    ProcessCommand = function(cmd) cmds[#cmds + 1] = cmd end,
})

Rules.ProcessCommand({ action = "rules_install", rules = {
    { id = "r1", when = { event = "entity_event" },
      ["do"] = {
        { action = "dom_append", id = "ui", parent = "list", node = { type = "text", id = "hit_{{event.seq}}", text = "-{{event.amount}}" } },
        { action = "dom_set", id = "ui", node = "total", props = { text = "{{event.amount}}" } },
        { action = "dom_toggle", id = "ui", node = "flash" },
        { action = "dom_remove", id = "ui", node = "hit_{{event.seq}}" },
      } },
} })
Rules.HandleEvent("entity_event", { kind = "hit", amount = 30, seq = 7 })
check("four dom_* actions reached UIWidgets.ProcessCommand", #cmds == 4)
local a, s, t, r = cmds[1] or {}, cmds[2] or {}, cmds[3] or {}, cmds[4] or {}
check("dom_append keeps its action name + tree id + parent, node templates resolved",
    a.action == "dom_append" and a.id == "ui" and a.parent == "list" and a.node and a.node.id == "hit_7" and a.node.text == "-30")
check("dom_set props resolved (a sole template keeps the raw value)", s.action == "dom_set" and s.node == "total" and s.props and tostring(s.props.text) == "30")
check("dom_toggle passes through", t.action == "dom_toggle" and t.node == "flash")
check("dom_remove node id resolved", r.action == "dom_remove" and r.node == "hit_7")
check("no seq is attached (it would trip the UIWidgets dedup against real commands)", a.seq == nil and s.seq == nil)

return C.report()
