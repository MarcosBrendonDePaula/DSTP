-- Micro-DOM harness (task 10): the REAL ui_widgets.lua keeps each tree's DEFINITION next
-- to the live widgets, so dom_append / dom_remove mutate the definition and rebuild the
-- tree in place (same id, same placement), while dom_set / dom_toggle patch the live
-- node AND persist into the definition (so a later rebuild keeps them). Data, not code:
-- the client never parses HTML — nodes arrive as tree JSON. Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local created = {}
local function mkWidget(kind, ctorArgs)
    local w
    w = { kind = kind, ctorArgs = ctorArgs, children = {}, hidden = false,
          inst = { IsValid = function() return true end } }
    if kind == "ImageButton" then w.image = { ScaleToSize = function() end } end
    setmetatable(w, { __index = function(_, key)
        if key == "AddChild" then return function(self, c) self.children[#self.children+1] = c; c.parent = self; return c end end
        if key == "SetSize" then return function(self, a, b) self.size = { a, b }; return self end end
        if key == "SetPosition" then return function(self, x, y) self.pos = { x, y }; return self end end
        if key == "SetString" then return function(self, s) self.str = s; return self end end
        if key == "Hide" then return function(self) self.hidden = true; return self end end
        if key == "Show" then return function(self) self.hidden = false; return self end end
        if key == "Kill" then return function(self) self.killed = true; return self end end
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
local mock_G = KIT.make_G({
    require = function(name) return widgetModules[name] or widgetFactory("Widget") end,
    ThePlayer = { HUD = { controls = hudRoot } },
    NEWFONT_OUTLINE = "f", NEWFONT = "f", CHATFONT = "f", UIFONT = "f", TITLEFONT = "f",
    BODYTEXTFONT = "f", NEWFONT_SMALL = "f", TALKINGFONT = "f",
    ANCHOR_MIDDLE = 0, SCALEMODE_PROPORTIONAL = 0, ANCHOR_LEFT = 1, ANCHOR_TOP = 2, ANCHOR_RIGHT = 3, ANCHOR_BOTTOM = 4,
    RESOLUTION_X = 1280, RESOLUTION_Y = 720,
    pcall = pcall, print = function() end,
})

local UIWidgets = KIT.load(MOD_UI, "ui_widgets.lua")
UIWidgets.Init({ GLOBAL = mock_G })

-- a widget is alive only if neither it nor an ancestor was killed (Kill on the root kills the subtree)
local function alive_w(w)
    while w do if rawget(w, "killed") then return false end; w = rawget(w, "parent") end
    return true
end
-- live Text widgets by their string
local function live_texts()
    local out = {}
    for _, w in ipairs(created) do
        if w.kind == "Text" and alive_w(w) then
            local s = rawget(w, "str") or (w.ctorArgs and w.ctorArgs[3])
            if s then out[s] = { pos = rawget(w, "pos"), hidden = rawget(w, "hidden"), w = w } end
        end
    end
    return out
end

UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "ui", anchor = "topleft", x = 10, y = -20, tree = {
    type = "col", id = "list", gap = 10, children = { { type = "text", id = "t1", text = "A" } },
} })
local t = live_texts()
check("baseline: A rendered", t["A"] ~= nil)
local root0
for _, w in ipairs(created) do if w.kind == "Widget" and w.ctorArgs and w.ctorArgs[1] == "dstp_tree_ui" then root0 = rawget(w, "pos") end end
check("baseline: root placed", root0 ~= nil)

-- dom_append: a new node under #list → tree rebuilt, B exists BELOW A (col stacks down)
UIWidgets.ProcessCommand({ action = "dom_append", id = "ui", parent = "list", node = { type = "text", id = "t2", text = "B" } })
t = live_texts()
check("dom_append: B rendered", t["B"] ~= nil)
check("dom_append: A still rendered after the rebuild", t["A"] ~= nil)
check("dom_append: B stacked below A (y smaller)", t["A"] and t["B"] and t["B"].pos and t["A"].pos and t["B"].pos[2] < t["A"].pos[2])

-- placement survives the rebuild: the root keeps anchor/x/y from the create command
local roots = {}
for _, w in ipairs(created) do if w.kind == "Widget" and w.ctorArgs and w.ctorArgs[1] == "dstp_tree_ui" and alive_w(w) then roots[#roots+1] = w end end
check("rebuild keeps ONE live root for the tree id", #roots == 1)
check("rebuild keeps the original placement (same root position as the create)", roots[1] and roots[1].pos and root0 and math.abs(roots[1].pos[1] - root0[1]) < 0.5 and math.abs(roots[1].pos[2] - root0[2]) < 0.5)

-- dom_set persists into the definition: patch t2 → "C", then force another rebuild
UIWidgets.ProcessCommand({ action = "dom_set", id = "ui", node = "t2", props = { text = "C" } })
t = live_texts()
check("dom_set: live text patched to C", t["C"] ~= nil)
UIWidgets.ProcessCommand({ action = "dom_append", id = "ui", parent = "list", node = { type = "text", id = "t3", text = "D" } })
t = live_texts()
check("dom_set persisted: after a rebuild C is still there (not B)", t["C"] ~= nil and t["B"] == nil)

-- dom_remove: A goes away and stays away
UIWidgets.ProcessCommand({ action = "dom_remove", id = "ui", node = "t1" })
t = live_texts()
check("dom_remove: A gone, C and D remain", t["A"] == nil and t["C"] ~= nil and t["D"] ~= nil)

-- dom_toggle: hides the live widget; persisted, so a rebuild re-creates it hidden
UIWidgets.ProcessCommand({ action = "dom_toggle", id = "ui", node = "t3" })
t = live_texts()
check("dom_toggle: D hidden", t["D"] and t["D"].hidden == true)
UIWidgets.ProcessCommand({ action = "dom_append", id = "ui", parent = "list", node = { type = "text", id = "t4", text = "E" } })
t = live_texts()
check("dom_toggle persisted through a rebuild (D still hidden)", t["D"] and t["D"].hidden == true)
UIWidgets.ProcessCommand({ action = "dom_toggle", id = "ui", node = "t3" })
t = live_texts()
check("dom_toggle again: D visible", t["D"] and t["D"].hidden == false)

-- unknown ids are ignored (no crash, no rebuild)
local before = #created
UIWidgets.ProcessCommand({ action = "dom_append", id = "nope", parent = "list", node = { type = "text", text = "X" } })
UIWidgets.ProcessCommand({ action = "dom_remove", id = "ui", node = "ghost" })
check("unknown tree/node ids are no-ops", #created == before)

return C.report()
