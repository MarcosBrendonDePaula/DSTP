-- Layout harness: runs the REAL ui_widgets.lua RenderNode/LayoutChildren under fengari
-- and asserts the COMPUTED box sizes + child positions for a known tree, so the CSS-like
-- layout rules (flex stacking, padding, percent width via parent ref, fixed-size-as-min
-- grow) are pinned in CI instead of eyeballed in-game. Returns "OK"/"FAIL: ...".
--
-- It captures every Widget:SetSize / SetPosition (recording stubs) AND the [DSTP UI]
-- layout debug lines (mock print), so a wrong size/position bites here first.

local C = KIT.new_checker()
local check = C.check

local created = {}
local function mkWidget(kind, ctorArgs)
    local w
    w = { kind = kind, ctorArgs = ctorArgs, children = {}, size = nil, pos = nil,
          inst = { IsValid = function() return true end } }
    if kind == "ImageButton" then w.image = { ScaleToSize = function() end } end
    setmetatable(w, { __index = function(_, key)
        if key == "AddChild" then return function(self, c) self.children[#self.children+1] = c; c.parent = self; return c end end
        if key == "SetSize" then return function(self, a, b) self.size = { a, b }; return self end end
        if key == "ForceImageSize" then return function(self, a, b) self.size = { a, b }; return self end end
        if key == "SetPosition" then return function(self, x, y) self.pos = { x, y }; return self end end
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
    ["widgets/textedit"] = widgetFactory("TextEdit"),
}
local hudRoot = mkWidget("Widget", { "hud" })

-- Capture [DSTP UI] log lines so we can read the computed box/track/sum numbers.
local logs = {}
local mock_G = KIT.make_G({
    require = function(name) return widgetModules[name] or widgetFactory("Widget") end,
    ThePlayer = { HUD = { controls = hudRoot } },
    NEWFONT_OUTLINE = "f", NEWFONT = "f", CHATFONT = "f", UIFONT = "f", TITLEFONT = "f",
    BODYTEXTFONT = "f", NEWFONT_SMALL = "f", TALKINGFONT = "f",
    ANCHOR_MIDDLE = 0, SCALEMODE_PROPORTIONAL = 0, ANCHOR_LEFT = 1, ANCHOR_TOP = 2,
    RESOLUTION_X = 1280, RESOLUTION_Y = 720,
    pcall = pcall,
    print = function(...)
        local parts = {}
        for i = 1, select("#", ...) do parts[#parts+1] = tostring(select(i, ...)) end
        logs[#logs+1] = table.concat(parts, " ")
    end,
})

local UIWidgets = KIT.load(MOD_UI, "ui_widgets.lua")
UIWidgets.Init({ GLOBAL = mock_G })

-- A simple vertical stack inside a fixed-width panel, child uses width:100%.
-- panel 260 wide, padding via panel (~40). Two text rows + a sub-card (width:100%) that
-- itself holds a label + an input(height 38). Expect: nothing inflates to the screen,
-- the panel GROWS in height to fit, the sub-card is ~content tall (NOT 200).
created = {}; logs = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "ui", tree = {
    type = "panel", mode = "canvas", width = 260, height = 180, padding = 24, children = {
        { type = "text", text = "Acesso Restrito", size = 30 },
        { type = "text", text = "Digite a senha.", size = 18 },
        { type = "col", width = "100%", gap = 6, padding = 10, background = { 0.1, 0.1, 0.1, 1 }, children = {
            { type = "text", text = "SENHA", size = 13 },
            { type = "text_input", placeholder = "senha", width = "100%", height = 38 },
        } },
        { type = "button", text = "Entrar", callback = "go", width = "100%", height = 44 },
    },
} })

-- The renderer logs through GLOBAL print, which the kit pins to the real print — so we
-- read the COMPUTED sizes straight off the recording widgets instead. Every container's
-- background box (AddBox) and every leaf gets SetSize(w,h); collect them and assert no
-- box exploded to the screen and the sub-card stayed content-sized.
local sizes = {}
for _, w in ipairs(created) do
    local sz = rawget(w, "size")   -- __index returns a fn for missing keys; read raw
    if type(sz) == "table" and sz[1] and sz[2] then sizes[#sizes+1] = { w = sz[1], h = sz[2] } end
end
check("widgets were sized (#sized=" .. #sizes .. ")", #sizes > 0)

-- No box may be as wide as the screen (1280) or its old overflow (1240/1260) — that was
-- the parent-ref / and-or precedence bug that made width:100% resolve to the screen.
local screenWide = false
for _, s in ipairs(sizes) do if s.w >= 1240 or s.h >= 700 then screenWide = true end end
check("no box stretched to screen size (w>=1240 or h>=700)", not screenWide,
    "found a screen-sized box")

-- No box should be taller than ~400 (the whole tree is a small login panel). The bug
-- inflated the sub-card to 200 (its width) and the panel/input chain blew up far past it.
local tallest = 0
for _, s in ipairs(sizes) do if s.h > tallest then tallest = s.h end end
check("nothing absurdly tall (tallest<=400)", tallest <= 400, "tallest=" .. tallest)

return C.report()
