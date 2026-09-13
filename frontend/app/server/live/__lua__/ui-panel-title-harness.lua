-- Panel title bar (in-game 2026-09-12: the wallet's "Carteira" title was drawn over its
-- first row). A panel with a title must RESERVE a title strip at the top: the content
-- box shrinks by it and shifts down, the minimum-size growth accounts for it, and the
-- title is positioned from the FINAL height (it used the pre-growth one). Auto-sized
-- panels draw their title too (they used to ignore it). REAL ui_widgets.lua under fengari.

local C = KIT.new_checker()
local check = C.check

local created = {}
local function mkWidget(kind, ctorArgs)
    local w = { kind = kind, ctorArgs = ctorArgs, children = {}, inst = { IsValid = function() return true end } }
    if kind == "ImageButton" then w.image = { ScaleToSize = function() end } end
    setmetatable(w, { __index = function(_, key)
        if key == "AddChild" then return function(self, c) self.children[#self.children + 1] = c; c.parent = self; return c end end
        if key == "SetSize" then return function(self, a, b) self.size = { a, b }; return self end end
        if key == "SetPosition" then return function(self, x, y) self.pos = { x, y }; return self end end
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

local function find(kind, pred)
    for _, w in ipairs(created) do if w.kind == kind and (not pred or pred(w)) then return w end end
end
local function f2(p) return p and string.format("(%.1f,%.1f)", p[1], p[2]) or "nil" end

-- ── the wallet: fixed 170x64, title, a 26-tall row + 30-tall button, gap 6 ──
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "w", tree = {
    type = "panel", title = "Carteira", width = 170, height = 64, closeable = false, gap = 6, children = {
        { type = "row", gap = 8, align = "center", children = { { type = "text", text = "60", size = 22, height = 26 } } },
        { type = "button", text = "Abrir Loja", callback = "open", width = 130, height = 30 },
    },
} })
local bg = find("Image", function(w) return w.ctorArgs and w.ctorArgs[2] == "panel_fill_tiny.tex" end)
local title = find("Text", function(w) return w.ctorArgs and w.ctorArgs[3] == "Carteira" end)
local content = find("Widget", function(w) return w.ctorArgs and w.ctorArgs[1] == "content" end)
local TITLE_H = 40   -- title_size 24 + 16
local ph = bg and bg.size and bg.size[2]
check("panel grows to content (62) + padding (40) + title strip (40) = 142, got " .. tostring(ph), ph and math.abs(ph - 142) < 0.5)
check("title exists", title ~= nil)
check("title sits centred in the top strip: y = ph/2 - 20 " .. f2(title and title.pos),
    title and title.pos and ph and math.abs(title.pos[2] - (ph / 2 - TITLE_H / 2)) < 0.5)
check("content shifted down by half the strip: y = -20 " .. f2(content and content.pos),
    content and content.pos and math.abs(content.pos[2] + TITLE_H / 2) < 0.5)
-- no overlap: the content box top (content.y + 62/2) must be below the strip bottom (ph/2 - 40)
check("content top is below the title strip",
    content and content.pos and ph and (content.pos[2] + 31) <= (ph / 2 - TITLE_H) + 0.5)

-- ── auto-sized panel with a title draws it and reserves the strip ──
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "a", tree = {
    type = "panel", title = "Painel", children = { { type = "text", text = "corpo", height = 20 } },
} })
local t2 = find("Text", function(w) return w.ctorArgs and w.ctorArgs[3] == "Painel" end)
local bg2 = find("Image", function(w) return w.ctorArgs and w.ctorArgs[2] == "panel_fill_tiny.tex" end)
local c2 = find("Widget", function(w) return w.ctorArgs and w.ctorArgs[1] == "content" end)
check("auto panel draws its title", t2 ~= nil)
local ph2 = bg2 and bg2.size and bg2.size[2]
check("auto panel height = max(min 80, 20 + 56 + 40) = 116, got " .. tostring(ph2), ph2 and math.abs(ph2 - 116) < 0.5)
check("auto panel: title in the strip, content shifted down",
    t2 and t2.pos and ph2 and math.abs(t2.pos[2] - (ph2 / 2 - TITLE_H / 2)) < 0.5 and c2 and c2.pos and math.abs(c2.pos[2] + TITLE_H / 2) < 0.5)

-- ── no title: nothing reserved (content centred, height unchanged) ──
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "n", tree = {
    type = "panel", width = 170, height = 64, closeable = false, children = { { type = "text", text = "x", height = 20 } },
} })
local bg3 = find("Image", function(w) return w.ctorArgs and w.ctorArgs[2] == "panel_fill_tiny.tex" end)
local c3 = find("Widget", function(w) return w.ctorArgs and w.ctorArgs[1] == "content" end)
check("no title: height stays 64 (content 20 + 40 fits)", bg3 and bg3.size and math.abs(bg3.size[2] - 64) < 0.5)
local p3 = c3 and rawget(c3, "pos")
check("no title: content centred (never repositioned)", c3 ~= nil and (p3 == nil or math.abs(p3[2]) < 0.5))

return C.report()
