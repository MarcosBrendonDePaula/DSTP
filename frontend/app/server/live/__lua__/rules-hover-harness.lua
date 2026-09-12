-- rules_engine `ui_hover` (task 7): a synthetic event (no DST listener) rules can
-- condition on (event.id / event.hovered) — e.g. show a tooltip node on hover and hide
-- it on leave, fully client-side. Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local listens = 0
local player = { userid = "KU_1", IsValid = function() return true end, ListenForEvent = function() listens = listens + 1 end, RemoveEventCallback = function() end }
local mock_G = KIT.make_G({ ThePlayer = player, print = function() end, json = KIT.fake_json })

local Rules = KIT.load(MOD_RULES, "rules_engine.lua")
Rules.Init({ GLOBAL = mock_G, modname = "dstp" })
local cmds = {}
Rules.SetUIWidgets({ CreateWidget = function() end, UpdateWidget = function() end, DestroyWidget = function() end,
    ProcessCommand = function(cmd) cmds[#cmds + 1] = cmd end })

Rules.ProcessCommand({ action = "rules_install", rules = {
    { id = "tip_on", when = { event = "ui_hover", conditions = { { field = "event.id", op = "equals", value = "buy" }, { field = "event.hovered", op = "equals", value = true } } },
      ["do"] = { { action = "dom_toggle", id = "{{event.ui}}", node = "tooltip", visible = true } } },
    { id = "tip_off", when = { event = "ui_hover", conditions = { { field = "event.id", op = "equals", value = "buy" }, { field = "event.hovered", op = "equals", value = false } } },
      ["do"] = { { action = "dom_toggle", id = "{{event.ui}}", node = "tooltip", visible = false } } },
} })
check("ui_hover is synthetic: no DST listener hooked on ThePlayer", listens == 0)

Rules.HandleEvent("ui_hover", { id = "buy", ui = "shop", hovered = true, callback = "buy:log" })
check("hover in → tooltip shown on the right ui", #cmds == 1 and cmds[1].action == "dom_toggle" and cmds[1].id == "shop" and cmds[1].visible == true)
Rules.HandleEvent("ui_hover", { id = "buy", ui = "shop", hovered = false })
check("hover out → tooltip hidden", #cmds == 2 and cmds[2].visible == false)
Rules.HandleEvent("ui_hover", { id = "other", ui = "shop", hovered = true })
check("another node's hover does not match", #cmds == 2)

return C.report()
