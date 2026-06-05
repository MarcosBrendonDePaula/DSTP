-- Harness for the #16 draggable panel: a panel node with draggable=true gets a title-bar
-- hit target whose OnMouseButton(down) starts a per-frame OnUpdate that moves the panel
-- by the cursor delta, and OnMouseButton(up) stops it. Runs the REAL ui_widgets.lua under
-- fengari with stubs that record positions + a controllable mock cursor. "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

-- Mock cursor + control state, driven by the test.
local mouseX, mouseY, primaryDown = 0, 0, false

local created = {}
local function mkWidget(kind, ctorArgs)
    local w
    w = { kind = kind, ctorArgs = ctorArgs, children = {}, posx = 0, posy = 0,
          onmouse = nil, onupdate = nil, updating = false,
          inst = { IsValid = function() return true end } }
    if kind == "ImageButton" then w.image = { ScaleToSize = function() end } end
    setmetatable(w, { __index = function(_, key)
        -- IMPORTANT: OnMouseButton/OnUpdate must be nil until the code assigns them, so
        -- the test can find the drag bar by "has a real handler" (not a no-op stub).
        if key == "OnMouseButton" or key == "OnUpdate" then return nil end
        if key == "AddChild" then return function(self, c) self.children[#self.children+1]=c; c.parent=self; return c end end
        if key == "SetPosition" then return function(self, x, y) self.posx = x or 0; self.posy = y or 0; return self end end
        if key == "GetPosition" then return function(self) return { x = self.posx, y = self.posy } end end
        if key == "StartUpdating" then return function(self) self.updating = true; return self end end
        if key == "StopUpdating" then return function(self) self.updating = false; return self end end
        if key == "ForceImageSize" then return function(self) return self end end
        if key == "GetRegionSize" then return function() return 120, 40 end end
        return function(self) return self end
    end })
    -- expose OnMouseButton/OnUpdate as settable fields (the code assigns widget.OnX = fn)
    created[#created+1] = w
    return w
end
local function factory(kind) return setmetatable({}, { __call = function(_, ...) return mkWidget(kind, {...}) end }) end
local mods = {
    ["widgets/widget"]=factory("Widget"), ["widgets/text"]=factory("Text"),
    ["widgets/image"]=factory("Image"), ["widgets/imagebutton"]=factory("ImageButton"),
}
local hudRoot = mkWidget("Widget", {"hud"})
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
        IsControlPressed = function(_, c) return primaryDown end,
    },
    pcall = pcall,
})

local UIWidgets = KIT.load(MOD_UI, "ui_widgets.lua")
UIWidgets.Init({ GLOBAL = mock_G })

-- Create a draggable panel as the tree root.
UIWidgets.ProcessCommand({ action="create", type="tree", id="win", group="win",
    tree = { type="panel", width=360, height=200, draggable=true, title="T", body="B" } })

-- Find the panel holder (the tree root child Widget named "panel") and the drag hit
-- target (an ImageButton that got an OnMouseButton handler).
local panelHolder, dragArea
for _, w in ipairs(created) do
    if w.kind == "Widget" and w.ctorArgs and w.ctorArgs[1] == "panel" then panelHolder = w end
    if w.kind == "ImageButton" and w.OnMouseButton then dragArea = w end
end
check("drag: panel holder created", panelHolder ~= nil)
check("drag: a title-bar hit target with OnMouseButton exists", dragArea ~= nil and type(dragArea.OnMouseButton) == "function")
check("drag: hit target has an OnUpdate loop", dragArea ~= nil and type(dragArea.OnUpdate) == "function")

if panelHolder and dragArea then
    local startx, starty = panelHolder.posx, panelHolder.posy

    -- Press the mouse on the title bar at (100,100).
    mouseX, mouseY, primaryDown = 100, 100, true
    dragArea:OnMouseButton(mock_G.MOUSEBUTTON_LEFT, true, 100, 100)
    check("drag: mouse-down starts updating", dragArea.updating == true)

    -- Move the cursor +30,+20 and tick OnUpdate: the panel should move by the same delta.
    mouseX, mouseY = 130, 120
    dragArea.OnUpdate()
    check("drag: panel moved by the cursor delta", panelHolder.posx == startx + 30 and panelHolder.posy == starty + 20)

    -- Move again +10,-5.
    mouseX, mouseY = 140, 115
    dragArea.OnUpdate()
    check("drag: panel tracks further movement", panelHolder.posx == startx + 40 and panelHolder.posy == starty + 15)

    -- Release: stop updating; further cursor moves do nothing.
    primaryDown = false
    dragArea:OnMouseButton(mock_G.MOUSEBUTTON_LEFT, false, 140, 115)
    check("drag: mouse-up stops updating", dragArea.updating == false)
    local fx, fy = panelHolder.posx, panelHolder.posy
    mouseX, mouseY = 999, 999
    dragArea.OnUpdate()
    check("drag: released panel no longer moves", panelHolder.posx == fx and panelHolder.posy == fy)
end

return C.report()
