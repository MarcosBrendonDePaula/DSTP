-- Hover as a local rule event (task 7): the focus-based hit targets (the invisible
-- ImageButton overlay of a clickable/hoverable text-icon-image, and the real tree
-- `button`) report OnGainFocus/OnLoseFocus through UIWidgets' hover handler, which
-- modmain routes to rules_engine as the synthetic `ui_hover` event
-- { id, ui, hovered, callback }. A node with `hover=true` but no callback gets an
-- overlay just for hovering. Runs the REAL ui_widgets.lua. Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local created = {}
local function mkWidget(kind, ctorArgs)
    local w = { kind = kind, ctorArgs = ctorArgs, children = {}, inst = { IsValid = function() return true end } }
    if kind == "ImageButton" then w.image = { ScaleToSize = function() end } end
    setmetatable(w, { __index = function(_, key)
        if key == "AddChild" then return function(self, c) self.children[#self.children + 1] = c; c.parent = self; return c end end
        if key == "SetOnClick" then return function(self, fn) self.onclick = fn; return self end end
        if key == "GetRegionSize" then return function() return 100, 20 end end
        if key == "GetSize" then return function() return 56, 56 end end
        return function(self) return self end
    end })
    created[#created + 1] = w
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
    ANCHOR_MIDDLE = 0, SCALEMODE_PROPORTIONAL = 0, RESOLUTION_X = 1280, RESOLUTION_Y = 720,
    pcall = pcall, print = function() end,
})

local UIWidgets = KIT.load(MOD_UI, "ui_widgets.lua")
UIWidgets.Init({ GLOBAL = mock_G })
local events = {}
UIWidgets.SetHoverHandler(function(id, ui, hovered, cb) events[#events + 1] = { id = id, ui = ui, hovered = hovered, cb = cb } end)
local clicks = {}
UIWidgets.SetCallbackHandler(function(cb) clicks[#clicks + 1] = cb end)

UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "shop", group = "shop", tree = {
    type = "col", children = {
        { type = "text", id = "tip", text = "Hover me", hover = true },      -- no callback: overlay just for hover
        { type = "button", id = "buy", text = "Buy", callback = "buy:log" }, -- real ImageButton
        { type = "text", id = "plain", text = "nothing" },                   -- neither: no overlay
    },
} })

-- overlays: one square.tex overlay (the hover-only text) + one carny button
local overlay, button = nil, nil
for _, w in ipairs(created) do
    if w.kind == "ImageButton" and w.ctorArgs[2] == "square.tex" then overlay = w end
    if w.kind == "ImageButton" and w.ctorArgs[2] == "button_carny_long_normal.tex" then button = w end
end
local nOverlays = 0
for _, w in ipairs(created) do if w.kind == "ImageButton" and w.ctorArgs[2] == "square.tex" then nOverlays = nOverlays + 1 end end
check("hover=true text gets an overlay; the plain text gets none (1 overlay total)", nOverlays == 1 and overlay ~= nil)
check("hover-only overlay has NO click wired", overlay ~= nil and rawget(overlay, "onclick") == nil)
check("hover hooks installed on the overlay and the button (OnGainFocus/OnLoseFocus are real fields)",
    overlay and rawget(overlay, "OnGainFocus") and rawget(overlay, "OnLoseFocus") and button and rawget(button, "OnGainFocus"))

overlay:OnGainFocus()
check("text overlay gain → ui_hover { id=tip, ui=shop, hovered=true, no callback }",
    #events == 1 and events[1].id == "tip" and events[1].ui == "shop" and events[1].hovered == true and events[1].cb == nil)
overlay:OnLoseFocus()
check("text overlay lose → hovered=false", #events == 2 and events[2].hovered == false and events[2].id == "tip")
button:OnGainFocus()
check("button gain → ui_hover with its callback name", #events == 3 and events[3].id == "buy" and events[3].cb == "buy:log" and events[3].hovered == true)
check("hover never fires a click", #clicks == 0)

return C.report()
