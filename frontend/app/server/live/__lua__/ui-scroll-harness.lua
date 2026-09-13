-- overflow:scroll (task 8): a col/row with `overflow="scroll"` and a fixed height whose
-- content is taller renders through Klei's TrueScrollArea (a scissored viewport +
-- scrollbar): the children are laid out in an orphan content widget that becomes the
-- area's context.widget, the scissor is the box, and the content is offset so its top
-- sits at the viewport top. Fitting content / no overflow → plain container, no area.
-- Runs the REAL ui_widgets.lua under fengari. Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local created, areas = {}, {}
local function mkWidget(kind, ctorArgs)
    local w = { kind = kind, ctorArgs = ctorArgs, children = {}, inst = { IsValid = function() return true end } }
    if kind == "ImageButton" then w.image = { ScaleToSize = function() end } end
    setmetatable(w, { __index = function(_, key)
        if key == "AddChild" then return function(self, c) self.children[#self.children + 1] = c; c.parent = self; return c end end
        if key == "SetPosition" then return function(self, x, y) self.pos = { x, y }; return self end end
        if key == "GetRegionSize" then return function() return 100, 20 end end
        if key == "GetSize" then return function() return 56, 56 end end
        return function(self) return self end
    end })
    created[#created + 1] = w
    return w
end
local function widgetFactory(kind) return setmetatable({}, { __call = function(_, ...) return mkWidget(kind, { ... }) end }) end
-- TrueScrollArea mock: records (context, scissor, scrollbar) and parents the content like the real one
local scrollFactory = setmetatable({}, { __call = function(_, context, scissor, scrollbar)
    local a = mkWidget("TrueScrollArea", { context, scissor, scrollbar })
    a.context, a.scissor, a.scrollbar = context, scissor, scrollbar
    a:AddChild(context.widget)
    areas[#areas + 1] = a
    return a
end })
local widgetModules = {
    ["widgets/widget"] = widgetFactory("Widget"), ["widgets/text"] = widgetFactory("Text"),
    ["widgets/image"] = widgetFactory("Image"), ["widgets/imagebutton"] = widgetFactory("ImageButton"),
    ["widgets/truescrollarea"] = scrollFactory,
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

local function texts(n)
    local out = {}
    for i = 1, n do out[i] = { type = "text", text = "L" .. i, height = 30 } end
    return out
end

-- 5 rows of 30 + 4 gaps of 8 = 182 tall content in a 100-tall box → scroll area
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "s1", tree = {
    type = "col", id = "list", overflow = "scroll", width = 200, height = 100, gap = 8, children = texts(5),
} })
check("taller content → ONE TrueScrollArea", #areas == 1)
local a = areas[1] or { context = {}, scissor = {} }
check("scissor is the box: 200x100 at (-100,-50) " .. tostring(a.scissor.width) .. "x" .. tostring(a.scissor.height),
    a.scissor.width == 200 and a.scissor.height == 100 and a.scissor.x == -100 and a.scissor.y == -50)
check("context.size.height is the content height (182) got " .. tostring(a.context.size and a.context.size.height),
    a.context.size and math.abs(a.context.size.height - 182) < 0.5)
check("content offset puts its top at the viewport top: y = 50 - 91 = -41 got " .. tostring(a.context.offset and a.context.offset.y),
    a.context.offset and math.abs(a.context.offset.y - (-41)) < 0.5)
local n = 0
for _, ch in ipairs(a.context.widget and a.context.widget.children or {}) do if ch.kind == "Text" then n = n + 1 end end
check("the 5 texts live under the scrolled content widget", n == 5)
check("scroll step default 40", a.scrollbar and a.scrollbar.scroll_per_click == 40)

-- fitting content (2 rows = 68) → no area, texts parented under the col
areas = {}; created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "s2", tree = {
    type = "col", overflow = "scroll", width = 200, height = 100, gap = 8, children = texts(2),
} })
check("fitting content → no TrueScrollArea", #areas == 0)
local hasText = false
for _, w in ipairs(created) do if w.kind == "Text" and w.parent then hasText = true end end
check("fitting content still rendered", hasText)

-- overflow without a fixed height → plain container (nothing to clip to)
areas = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "s3", tree = {
    type = "col", overflow = "scroll", width = 200, gap = 8, children = texts(5),
} })
check("overflow:scroll without height → no area", #areas == 0)

return C.report()
