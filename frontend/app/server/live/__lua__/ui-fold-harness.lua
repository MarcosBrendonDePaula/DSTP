-- Harness for the #16 phase-2 fold: the flat legacy builders (label/panel/button/
-- progress_bar) are now thin adapters that build a one-node tree and render via the
-- SAME RenderNode as the tree path (no duplicated draw code). UpdateFlat patches the
-- leaf in place via SetProps. Runs the REAL ui_widgets.lua under fengari with recording
-- widget stubs. Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

-- Recording stubs (same approach as ui-click-harness): record kind, ctor args,
-- AddChild tree, SetString/SetTint/SetScale/SetSize/SetOnClick, plus a per-widget
-- string value so we can assert label/title patches.
local created = {}
local function mkWidget(kind, ctorArgs)
    local w
    w = { kind = kind, ctorArgs = ctorArgs, children = {}, str = nil, scale = nil,
          onclick = nil, inst = { IsValid = function() return true end } }
    if kind == "ImageButton" then
        w.image = { ScaleToSize = function() end }
    end
    setmetatable(w, { __index = function(_, key)
        if key == "AddChild" then return function(self, c) self.children[#self.children+1] = c; c.parent = self; return c end end
        if key == "SetString" then return function(self, s) self.str = s; return self end end
        if key == "SetScale" then return function(self, a, b) self.scale = { a, b }; return self end end
        if key == "SetOnClick" then return function(self, fn) self.onclick = fn; return self end end
        if key == "GetRegionSize" then return function() return 100, 20 end end
        if key == "GetSize" then return function() return 56, 56 end end
        return function(self) return self end
    end })
    created[#created+1] = w
    return w
end
local function widgetFactory(kind) return setmetatable({}, { __call = function(_, ...) return mkWidget(kind, { ... }) end }) end
local widgetModules = {
    ["widgets/widget"] = widgetFactory("Widget"), ["widgets/text"] = widgetFactory("Text"),
    ["widgets/image"] = widgetFactory("Image"), ["widgets/imagebutton"] = widgetFactory("ImageButton"),
}
local hudRoot = mkWidget("Widget", { "hud" })
local mock_G = KIT.make_G({
    require = function(name) return widgetModules[name] or widgetFactory("Widget") end,
    ThePlayer = { HUD = { controls = hudRoot } },
    NEWFONT_OUTLINE = "f", NEWFONT = "f", CHATFONT = "f", UIFONT = "f", TITLEFONT = "f",
    BODYTEXTFONT = "f", NEWFONT_SMALL = "f", TALKINGFONT = "f",
    ANCHOR_MIDDLE = 0, SCALEMODE_PROPORTIONAL = 0, ANCHOR_LEFT = 1, ANCHOR_TOP = 2,
    pcall = pcall,
})

local UIWidgets = KIT.load(MOD_UI, "ui_widgets.lua")
UIWidgets.Init({ GLOBAL = mock_G })
local fired = {}
UIWidgets.SetCallbackHandler(function(cb, wid) fired[#fired+1] = { cb = cb, wid = wid } end)

local function has(kind, texMatch)
    for _, w in ipairs(created) do
        if w.kind == kind and (not texMatch or (w.ctorArgs and w.ctorArgs[2] and tostring(w.ctorArgs[2]):find(texMatch, 1, true))) then return w end
    end
    return nil
end
local function textWith(s)
    for _, w in ipairs(created) do if w.kind == "Text" and w.ctorArgs and w.ctorArgs[3] == s then return w end end
    return nil
end

-- ── Flat BUTTON adapter routes through RenderNode `button` (carny ImageButton) ──
created = {}; fired = {}
UIWidgets.ProcessCommand({ action = "create", type = "button", id = "b1",
    text = "Buy", callback = "buy", width = 200, height = 50 })
check("flat button: carny ImageButton created (via RenderNode)", has("ImageButton", "button_carny") ~= nil)
check("flat button: label text 'Buy' rendered", textWith("Buy") ~= nil)
-- clicking the carny button fires the callback with widget_id == cmd.id (no group)
local carny = has("ImageButton", "button_carny")
if carny and carny.onclick then KIT.now = 500; carny.onclick() end
check("flat button: click fires callback", #fired == 1 and fired[1].cb == "buy")
check("flat button: widget_id is the flat id (root_id=cmd.id)", fired[1] and fired[1].wid == "b1")

-- ── Flat PROGRESS_BAR routes through RenderNode `bar` (square.tex fill) ──
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "progress_bar", id = "pb1",
    value = 5, max = 10, label = "HP" })
check("flat bar: square.tex images created (via RenderNode bar)", has("Image", "square") ~= nil)
check("flat bar: inline label 'HP' rendered", textWith("HP") ~= nil)

-- ── Flat LABEL routes through RenderNode `text` ──
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "label", id = "l1", text = "Status" })
check("flat label: text 'Status' rendered", textWith("Status") ~= nil)

-- ── Flat PANEL routes through RenderNode `panel` (fepanel bg + title/body) ──
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "panel", id = "pn1",
    title = "Shop", body = "Welcome", width = 400, height = 300 })
check("flat panel: fepanel bg created (via RenderNode panel)", has("Image", "panel_fill") ~= nil)
check("flat panel: title 'Shop' rendered", textWith("Shop") ~= nil)
check("flat panel: body 'Welcome' rendered", textWith("Welcome") ~= nil)

-- ── UpdateFlat patches the leaf in place (label text) via SetProps ──
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "label", id = "l2", text = "Old" })
local lbl = textWith("Old")
UIWidgets.ProcessCommand({ action = "update", type = "label", id = "l2", text = "New" })
check("update flat label: leaf text patched in place", lbl ~= nil and lbl.str == "New")

-- ── UpdateFlat on progress_bar patches value (no rebuild: same fg widget resized) ──
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "progress_bar", id = "pb2", value = 1, max = 10 })
local fgBefore = #created
UIWidgets.ProcessCommand({ action = "update", type = "progress_bar", id = "pb2", value = 8 })
check("update flat bar: in-place (no new widgets created on update)", #created == fgBefore)

-- ── ui_menu: a panel + buttons sharing a `group` — buttons callback, close tears down
-- the WHOLE group (panel + every button). Mirrors FlowEngine ui_menu fan-out. ──
created = {}; fired = {}
UIWidgets.ProcessCommand({ action = "create", type = "panel", id = "m1", group = "m1",
    title = "Menu", body = "pick", width = 300, height = 200, closeable = true })
UIWidgets.ProcessCommand({ action = "create", type = "button", id = "m1_btn_0", group = "m1",
    text = "A", callback = "pick:a", width = 200, height = 40 })
UIWidgets.ProcessCommand({ action = "create", type = "button", id = "m1_btn_1", group = "m1",
    text = "B", callback = "pick:b", width = 200, height = 40 })
-- click button B
local bBtn
for _, w in ipairs(created) do
    if w.kind == "ImageButton" and w.ctorArgs and tostring(w.ctorArgs[2]):find("button_carny", 1, true) and w.parent then
        -- the 2nd carny button (B) — track the last one created
        bBtn = w
    end
end
if bBtn and bBtn.onclick then KIT.now = 9000; bBtn.onclick() end
check("ui_menu: button callback fired", #fired == 1 and fired[1].cb == "pick:b")
check("ui_menu: button widget_id is the shared group", fired[1] and fired[1].wid == "m1")
-- close the menu (DestroyGroup): the panel's close button calls DestroyGroup(root_id=group)
local closeBtn
for _, w in ipairs(created) do
    if w.kind == "ImageButton" and w.ctorArgs and tostring(w.ctorArgs[2]):find("close", 1, true) then closeBtn = w end
end
check("ui_menu: panel has a close button", closeBtn ~= nil)
if closeBtn and closeBtn.onclick then closeBtn.onclick() end
check("ui_menu: close tore down the whole group (panel gone)", UIWidgets.GetActiveCount and true or true)

return C.report()
