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
local MOVE_ORDER = {}   -- records MoveToFront calls in order (for z-index assertions)
local function mkWidget(kind, ctorArgs)
    local w
    w = { kind = kind, ctorArgs = ctorArgs, children = {}, size = nil, pos = nil,
          inst = { IsValid = function() return true end } }
    if kind == "ImageButton" then w.image = { ScaleToSize = function() end } end
    setmetatable(w, { __index = function(_, key)
        if key == "AddChild" then return function(self, c) self.children[#self.children+1] = c; c.parent = self; return c end end
        if key == "SetSize" then return function(self, a, b) self.size = { a, b }; return self end end
        if key == "SetHAlign" then return function(self, a) self.halign = a; return self end end
        if key == "SetVAlign" then return function(self, a) self.valign = a; return self end end
        if key == "SetRegionSize" then return function(self, a, b) self.region = { a, b }; return self end end
        if key == "EnableWordWrap" then return function(self, v) self.wrap = v; return self end end
        if key == "ForceImageSize" then return function(self, a, b) self.size = { a, b }; return self end end
        if key == "SetPosition" then return function(self, x, y) self.pos = { x, y }; return self end end
        if key == "MoveToFront" then return function(self) MOVE_ORDER[#MOVE_ORDER+1] = self; self.moved = true; return self end end
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
    ANCHOR_MIDDLE = 0, SCALEMODE_PROPORTIONAL = 0, ANCHOR_LEFT = 1, ANCHOR_TOP = 2, ANCHOR_RIGHT = 3, ANCHOR_BOTTOM = 4,
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

-- ── z-index: children re-stacked by z (higher draws on top via MoveToFront) ──
-- Three texts, middle one z=5. Expect: MoveToFront ran, and the z=5 widget was moved
-- LAST among the three (ascending z → highest ends on top). z=0 trees do NOT reorder.
created = {}; MOVE_ORDER = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "z1", tree = {
    type = "col", gap = 4, children = {
        { type = "text", text = "A" },
        { type = "text", text = "B", z = 5 },
        { type = "text", text = "C" },
    },
} })
-- find the Text widget whose ctor string is "B"
local bWidget
for _, w in ipairs(created) do if w.kind == "Text" and w.ctorArgs and w.ctorArgs[3] == "B" then bWidget = w end end
check("z-index reordered (MoveToFront ran)", #MOVE_ORDER >= 3)
check("z=5 child moved to front LAST (drawn on top)", #MOVE_ORDER > 0 and MOVE_ORDER[#MOVE_ORDER] == bWidget)

-- A plain z=0 tree must NOT reorder (no MoveToFront on children).
created = {}; MOVE_ORDER = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "z2", tree = {
    type = "col", gap = 4, children = { { type = "text", text = "X" }, { type = "text", text = "Y" } },
} })
check("z=0 tree does not reorder children", #MOVE_ORDER == 0)

-- ── CSS semantics of justify/align/margin/grow (the layout_math port) ─────────
-- Text widgets measure 100x20 (GetRegionSize stub). Positions are the widget CENTER in
-- DST space (y UP). Helper: the Text widget whose ctor string is `name`.
local function textPos(name)
    for _, w in ipairs(created) do
        if w.kind == "Text" and w.ctorArgs and w.ctorArgs[3] == name then return rawget(w, "pos") end
    end
end
local function fmt(p) return p and string.format("(%.1f,%.1f)", p[1], p[2]) or "nil" end

-- row + align:start = TOP (CSS flex-start on the cross axis of a row). The old
-- crossPos used the column formula for both axes and put it at the BOTTOM (y<0).
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "al1", tree = {
    type = "row", align = "start", height = 100, gap = 0, children = {
        { type = "text", text = "RS" }, { type = "text", text = "RS2" } },
} })
local rs = textPos("RS")
check("row align=start puts the child at the TOP (y>0) " .. fmt(rs), rs and rs[2] > 0)
-- row + align:end = BOTTOM
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "al2", tree = {
    type = "row", align = "end", height = 100, gap = 0, children = { { type = "text", text = "RE" } },
} })
local re = textPos("RE")
check("row align=end puts the child at the BOTTOM (y<0) " .. fmt(re), re and re[2] < 0)
-- col + align:start = LEFT (unchanged), align:end = RIGHT
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "al3", tree = {
    type = "col", align = "start", width = 300, gap = 0, children = { { type = "text", text = "CS" } },
} })
local cs = textPos("CS")
check("col align=start puts the child at the LEFT (x<0) " .. fmt(cs), cs and cs[1] < 0)
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "al4", tree = {
    type = "col", align = "end", width = 300, gap = 0, children = { { type = "text", text = "CE" } },
} })
local ce = textPos("CE")
check("col align=end puts the child at the RIGHT (x>0) " .. fmt(ce), ce and ce[1] > 0)

-- margin_left:"auto" on the 2nd child of a fixed-width row pushes it to the far right,
-- even though justify is the default center. Row 400 wide, two 100-wide texts:
-- M1 at the left edge (center x = -150), M2 at the right edge (center x = +150).
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "ma", tree = {
    type = "row", width = 400, gap = 0, children = {
        { type = "text", text = "M1" }, { type = "text", text = "M2", margin_left = "auto" } },
} })
local m1, m2 = textPos("M1"), textPos("M2")
check("margin_left=auto pushes the 2nd child to the right edge " .. fmt(m1) .. " " .. fmt(m2),
    m1 and m2 and math.abs(m1[1] + 150) < 0.5 and math.abs(m2[1] - 150) < 0.5)

-- grow:1 on the 1st child of a fixed-width row gives it the free space: row 400, two
-- 100-wide texts, gap 0 → slot1 = 300 (center x = -50), slot2 = 100 (center x = +150).
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "gr", tree = {
    type = "row", width = 400, gap = 0, justify = "start", children = {
        { type = "text", text = "G1", grow = 1 }, { type = "text", text = "G2" } },
} })
local g1, g2 = textPos("G1"), textPos("G2")
check("grow=1 child takes the free space " .. fmt(g1) .. " " .. fmt(g2),
    g1 and g2 and math.abs(g1[1] + 50) < 0.5 and math.abs(g2[1] - 150) < 0.5)

-- justify:evenly in a fixed-width row: 400 wide, two 100-wide → free 200, 3 gaps of
-- 66.67 → E1 spans 66.67..166.67 (center 116.67 → -83.33 from the middle), E2 mirrors.
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "je", tree = {
    type = "row", width = 400, gap = 0, justify = "evenly", children = {
        { type = "text", text = "E1" }, { type = "text", text = "E2" } },
} })
local e1, e2 = textPos("E1"), textPos("E2")
check("justify=evenly spaces the children evenly " .. fmt(e1) .. " " .. fmt(e2),
    e1 and e2 and math.abs(e1[1] + 83.33) < 0.5 and math.abs(e2[1] - 83.33) < 0.5)

-- Element-model children with style.x/y under display:absolute are placed by them
-- (HasChildXY must read style too, not only the flat x/y).
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "abs", tree = {
    tag = "div", style = { display = "absolute", width = 300, height = 200 }, children = {
        { tag = "text", text = "AX", style = { x = 50, y = 30 } } },
} })
local ax = textPos("AX")
-- top-left (50,30) of a 100x20 text in a 300x200 box → center (-150+50+50, 100-30-10) = (-50, 60)
check("display:absolute child with style.x/y is placed at its coords " .. fmt(ax),
    ax and math.abs(ax[1] + 50) < 0.5 and math.abs(ax[2] - 60) < 0.5)

-- Element-model node with FLAT size attrs and no style (what <panel width="200"
-- height="84"> parses to): NormalizeElement must keep them, not wipe them with the
-- (absent) style values. The panel then renders in fixed mode → bg Image 200x84.
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "flat", tree = {
    tag = "panel", title = "Carteira", width = 200, height = 84, closeable = false, children = {
        { tag = "text", text = "x" } },
} })
local has200x84 = false
for _, w in ipairs(created) do
    local sz = rawget(w, "size")
    if w.kind == "Image" and type(sz) == "table" and sz[1] == 200 and sz[2] == 84 then has200x84 = true end
end
check("element panel with flat width/height (no style) renders fixed 200x84", has200x84)

-- ── task 1: border with only a width (HTML `border:2`) draws a frame; align:stretch ──
-- A col 200x60 (pad 0) with border=2 → a square.tex frame sized 204x64 behind the bg.
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "bd", tree = {
    type = "col", width = 200, height = 60, gap = 0, background = { 0, 0, 0, 0.5 }, border = 2,
    children = { { type = "text", text = "b" } },
} })
local frame204 = false
for _, w in ipairs(created) do
    local sz = rawget(w, "size")
    if w.kind == "Image" and type(sz) == "table" and sz[1] == 204 and sz[2] == 64 then frame204 = true end
end
check("border given as a bare width draws a frame image box+2*width (204x64)", frame204)

-- align:stretch — a bar with NO width inside a col of width 300 (pad 10) fills the
-- content box: its bg image becomes 280 wide (instead of the bar's default 200).
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "st", tree = {
    type = "col", width = 300, padding = 10, align = "stretch", gap = 0,
    children = { { type = "bar", value = 1, max = 1, height = 12 } },
} })
local bar280 = false
for _, w in ipairs(created) do
    local sz = rawget(w, "size")
    if w.kind == "Image" and type(sz) == "table" and sz[1] == 280 and sz[2] == 12 then bar280 = true end
end
check("align=stretch: a bar without width fills the col content box (280 wide)", bar280)
-- a child WITH its own width is not stretched
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "st2", tree = {
    type = "col", width = 300, padding = 10, align = "stretch", gap = 0,
    children = { { type = "bar", value = 1, max = 1, width = 120, height = 12 } },
} })
local bar120 = false
for _, w in ipairs(created) do
    local sz = rawget(w, "size")
    if w.kind == "Image" and type(sz) == "table" and sz[1] == 120 and sz[2] == 12 then bar120 = true end
end
check("align=stretch leaves a child with an explicit width alone (120)", bar120)

-- ── task 2: wrap — a 250-wide row with three 100-wide texts breaks into 2 lines ──
-- Text stubs measure 100x20. gap 10, row_gap 10 → line 1: W1,W2; line 2: W3.
-- Content box 250x50 centred on the origin: W1 → (-75, 15), W3 → (-75, -15).
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "wrap", tree = {
    type = "row", width = 250, gap = 10, row_gap = 10, wrap = true, justify = "start", align = "start",
    children = { { type = "text", text = "W1" }, { type = "text", text = "W2" }, { type = "text", text = "W3" } },
} })
local function tpos(name) for _, w in ipairs(created) do if w.kind == "Text" and w.ctorArgs and w.ctorArgs[3] == name then return rawget(w, "pos") end end end
local w1, w3 = tpos("W1"), tpos("W3")
local function f2(p) return p and string.format("(%.1f,%.1f)", p[1], p[2]) or "nil" end
check("wrap: W1 on the first line at (-75,15) " .. f2(w1), w1 and math.abs(w1[1] + 75) < 0.5 and math.abs(w1[2] - 15) < 0.5)
check("wrap: W3 wrapped to the second line at (-75,-15) " .. f2(w3), w3 and math.abs(w3[1] + 75) < 0.5 and math.abs(w3[2] + 15) < 0.5)

-- ── task 3: text — CSS words for alignment (left/center/right, top/middle/bottom),
--            wrap inside a width, font by friendly name ──
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "txt", tree = {
    type = "col", children = {
        { type = "text", text = "T1", width = 200, halign = "left", valign = "top" },
        { type = "text", text = "T2", halign = "ANCHOR_RIGHT" },   -- legacy DST constant name still works
    },
} })
local t1, t2
for _, w in ipairs(created) do
    if w.kind == "Text" and w.ctorArgs and w.ctorArgs[3] == "T1" then t1 = w end
    if w.kind == "Text" and w.ctorArgs and w.ctorArgs[3] == "T2" then t2 = w end
end
check("text halign='left' → SetHAlign(ANCHOR_LEFT=1)", t1 and rawget(t1, "halign") == 1)
check("text valign='top' → SetVAlign(ANCHOR_TOP=2)", t1 and rawget(t1, "valign") == 2)
check("text with a width gets a region + word wrap", t1 and rawget(t1, "region") and rawget(t1, "region")[1] == 200 and rawget(t1, "wrap") == true)
check("legacy 'ANCHOR_RIGHT' still resolves", t2 and rawget(t2, "halign") == mock_G.ANCHOR_RIGHT)

-- ── task 5: display:absolute is a plain CANVAS container — no panel frame, no close
--            button, and its background/children x,y are honoured ──
created = {}
UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "abs2", tree = {
    tag = "div", style = { display = "absolute", width = 300, height = 200, background = { 1, 0, 0, 1 } },
    children = { { tag = "text", text = "AB", style = { x = 50, y = 30 } } },
} })
local closeBtns, sq, ab = 0, 0, nil
for _, w in ipairs(created) do
    if w.kind == "ImageButton" and w.ctorArgs and w.ctorArgs[2] == "close.tex" then closeBtns = closeBtns + 1 end
    if w.kind == "Image" and w.ctorArgs and w.ctorArgs[2] == "square.tex" then sq = sq + 1 end
    if w.kind == "Text" and w.ctorArgs and w.ctorArgs[3] == "AB" then ab = rawget(w, "pos") end
end
check("display:absolute draws NO panel close button", closeBtns == 0)
check("display:absolute draws its style.background (square.tex)", sq >= 1)
check("display:absolute child at style.x/y → (-50,60) " .. f2(ab), ab and math.abs(ab[1] + 50) < 0.5 and math.abs(ab[2] - 60) < 0.5)

return C.report()
