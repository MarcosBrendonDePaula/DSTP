-- Harness for the #16 draggable panel: a panel node with draggable=true gets a title-bar
-- hit target whose OnMouseButton(down) registers GLOBAL TheInput move + mouse-button
-- handlers (so a fast move off the bar doesn't stop the drag); the move handler moves the
-- panel by the cursor delta / parentScale; the global mouse-up handler ends it and removes
-- both handlers. Runs the REAL ui_widgets.lua under fengari with recording stubs +
-- controllable mock input handlers. "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local created = {}
local function mkWidget(kind, ctorArgs)
    local w
    w = { kind = kind, ctorArgs = ctorArgs, children = {}, posx = 0, posy = 0,
          inst = { IsValid = function() return true end } }
    if kind == "ImageButton" then w.image = { ScaleToSize = function() end } end
    setmetatable(w, { __index = function(_, key)
        if key == "OnMouseButton" or key == "OnUpdate" then return nil end
        if key == "AddChild" then return function(self, c) self.children[#self.children+1]=c; c.parent=self; return c end end
        if key == "SetPosition" then return function(self, x, y) self.posx = x or 0; self.posy = y or 0; return self end end
        if key == "GetPosition" then return function(self) return { x = self.posx, y = self.posy } end end
        if key == "GetScale" then return function() return { x = 1, y = 1, z = 1 } end end  -- 1:1, delta unchanged
        if key == "ForceImageSize" then return function(self) return self end end
        if key == "GetRegionSize" then return function() return 120, 40 end end
        return function(self) return self end
    end })
    created[#created+1] = w
    return w
end
local function factory(kind) return setmetatable({}, { __call = function(_, ...) return mkWidget(kind, {...}) end }) end
local mods = {
    ["widgets/widget"]=factory("Widget"), ["widgets/text"]=factory("Text"),
    ["widgets/image"]=factory("Image"), ["widgets/imagebutton"]=factory("ImageButton"),
}
local hudRoot = mkWidget("Widget", {"hud"})

-- Mock TheInput with registerable global handlers the test can fire + a movable cursor.
local mouseX, mouseY = 0, 0
local moveHandlers, btnHandlers = {}, {}
local function addHandler(list, fn)
    local h = { fn = fn }
    list[#list+1] = h
    h.Remove = function(self) for i, e in ipairs(list) do if e == self then table.remove(list, i); break end end end
    return h
end
local function fireMove(x, y) mouseX, mouseY = x, y; for _, h in ipairs({table.unpack(moveHandlers)}) do h.fn(x, y) end end
local function fireBtn(btn, down) for _, h in ipairs({table.unpack(btnHandlers)}) do h.fn(btn, down) end end

local mock_G = KIT.make_G({
    require = function(n) return mods[n] or factory("Widget") end,
    ThePlayer = { HUD = { controls = hudRoot } },
    TITLEFONT="f", BODYTEXTFONT="f", NEWFONT_OUTLINE="f", NEWFONT="f", CHATFONT="f",
    UIFONT="f", NEWFONT_SMALL="f", TALKINGFONT="f",
    ANCHOR_MIDDLE=0, SCALEMODE_PROPORTIONAL=0, ANCHOR_LEFT=1, ANCHOR_TOP=2,
    MOUSEBUTTON_LEFT=1000, CONTROL_PRIMARY=0,
    Vector3 = function(x,y,z) return { x=x, y=y, z=z } end,
    TheInput = {
        GetScreenPosition = function() return { x = mouseX, y = mouseY } end,
        AddMoveHandler = function(_, fn) return addHandler(moveHandlers, fn) end,
        AddMouseButtonHandler = function(_, fn) return addHandler(btnHandlers, fn) end,
    },
    pcall = pcall,
})

local UIWidgets = KIT.load(MOD_UI, "ui_widgets.lua")
UIWidgets.Init({ GLOBAL = mock_G })

UIWidgets.ProcessCommand({ action="create", type="tree", id="win", group="win",
    tree = { type="panel", width=360, height=200, draggable=true, title="T", body="B" } })

local panelHolder, dragArea
for _, w in ipairs(created) do
    if w.kind == "Widget" and w.ctorArgs and w.ctorArgs[1] == "panel" then panelHolder = w end
    if w.kind == "ImageButton" and w.OnMouseButton then dragArea = w end
end
check("drag: panel holder created", panelHolder ~= nil)
check("drag: a title-bar hit target with OnMouseButton exists", dragArea ~= nil and type(dragArea.OnMouseButton) == "function")

if panelHolder and dragArea then
    local startx, starty = panelHolder.posx, panelHolder.posy

    -- Press the mouse on the title bar at (100,100): registers the global handlers.
    mouseX, mouseY = 100, 100
    dragArea:OnMouseButton(mock_G.MOUSEBUTTON_LEFT, true, 100, 100)
    check("drag: mouse-down registered a global move handler", #moveHandlers == 1)
    check("drag: mouse-down registered a global mouse-button handler", #btnHandlers == 1)

    -- A GLOBAL move (even if the cursor would be off the bar) moves the panel by delta.
    fireMove(130, 120)
    check("drag: panel moved by the cursor delta", panelHolder.posx == startx + 30 and panelHolder.posy == starty + 20)

    -- Fast move far away still tracks (no focus dependency).
    fireMove(500, 400)
    check("drag: panel tracks a large/fast move", panelHolder.posx == startx + 400 and panelHolder.posy == starty + 300)

    -- Global mouse-up (released anywhere) ends the drag and removes both handlers.
    fireBtn(mock_G.MOUSEBUTTON_LEFT, false)
    check("drag: mouse-up removed the move handler", #moveHandlers == 0)
    check("drag: mouse-up removed the button handler", #btnHandlers == 0)

    -- After release, further moves do nothing.
    local fx, fy = panelHolder.posx, panelHolder.posy
    fireMove(999, 999)
    check("drag: released panel no longer moves", panelHolder.posx == fx and panelHolder.posy == fy)
end

return C.report()
