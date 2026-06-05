-- Harness for the text_input tree node: RenderNode builds a TextEdit on the HUD with
-- SetForceEdit(true), a click overlay that SetEditing(true), and an OnTextEntered that
-- fires the ui_callback with the typed string as payload {value, id}. Runs the REAL
-- ui_widgets.lua under fengari with a TextEdit stub. "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

-- The TextEdit stub records the calls the node makes + lets us simulate Enter.
local lastTextEdit
local function mkTextEdit()
    local te = { _string = "", _forceEdit = false, _editing = false, _limit = nil,
                 inst = { IsValid = function() return true end } }
    setmetatable(te, { __index = function(_, k)
        if k == "SetForceEdit" then return function(self, v) self._forceEdit = v; return self end end
        if k == "SetEditing" then return function(self, v) self._editing = v; return self end end
        if k == "SetString" then return function(self, s) self._string = s or ""; return self end end
        if k == "GetString" then return function(self) return self._string end end
        if k == "SetTextLengthLimit" then return function(self, n) self._limit = n; return self end end
        if k == "SetRegionSize" then return function(self) return self end end
        if k == "SetTextPrompt" then return function(self, p) self._prompt = p; return self end end
        if k == "SetColour" then return function(self) return self end end
        return function(self) return self end
    end })
    lastTextEdit = te
    return te
end

-- Generic recording widget for everything else.
local created = {}
local function mkWidget(kind, args)
    if kind == "TextEdit" then return mkTextEdit() end
    local w = { kind = kind, ctorArgs = args, children = {}, onclick = nil,
                inst = { IsValid = function() return true end } }
    if kind == "ImageButton" then w.image = { ScaleToSize = function() end } end
    setmetatable(w, { __index = function(_, key)
        if key == "AddChild" then return function(self, c) self.children[#self.children+1]=c; return c end end
        if key == "SetOnClick" then return function(self, fn) self.onclick = fn; return self end end
        if key == "GetRegionSize" then return function() return 100, 20 end end
        if key == "ForceImageSize" then return function(self) return self end end
        return function(self) return self end
    end })
    created[#created+1] = w
    return w
end
local function factory(kind) return setmetatable({}, { __call = function(_, ...) return mkWidget(kind, {...}) end }) end
local mods = {
    ["widgets/widget"]=factory("Widget"), ["widgets/text"]=factory("Text"),
    ["widgets/image"]=factory("Image"), ["widgets/imagebutton"]=factory("ImageButton"),
    ["widgets/textedit"]=factory("TextEdit"),
}
local hudRoot = mkWidget("Widget", {"hud"})
local mock_G = KIT.make_G({
    require = function(n) return mods[n] or factory("Widget") end,
    ThePlayer = { HUD = { controls = hudRoot } },
    NEWFONT_OUTLINE="f", NEWFONT="f", CHATFONT="f", UIFONT="f", TITLEFONT="f",
    BODYTEXTFONT="f", NEWFONT_SMALL="f", TALKINGFONT="f",
    ANCHOR_MIDDLE=0, SCALEMODE_PROPORTIONAL=0, MOUSEBUTTON_LEFT=1000, CONTROL_PRIMARY=0,
    pcall = pcall,
})

local UIWidgets = KIT.load(MOD_UI, "ui_widgets.lua")
UIWidgets.Init({ GLOBAL = mock_G })

-- Capture the ui_callback payload (the 3rd arg is the new payload).
local fired = {}
UIWidgets.SetCallbackHandler(function(cb, wid, payload) fired[#fired+1] = { cb = cb, wid = wid, payload = payload } end)

-- Render a text_input as the tree root.
UIWidgets.ProcessCommand({ action="create", type="tree", id="form", group="form",
    tree = { type="text_input", id="name", callback="submit:name", max=20, placeholder="type",
             width=280, height=36, clear_on_submit=true } })

check("text_input: a TextEdit was created", lastTextEdit ~= nil)
check("text_input: SetForceEdit(true) was called (HUD keyboard grab)", lastTextEdit and lastTextEdit._forceEdit == true)
check("text_input: length limit applied", lastTextEdit and lastTextEdit._limit == 20)
check("text_input: OnTextEntered handler installed", lastTextEdit and type(lastTextEdit.OnTextEntered) == "function")

-- Find the click overlay (ImageButton with onclick) and confirm a click starts editing.
local hit
for _, w in ipairs(created) do if w.kind == "ImageButton" and w.onclick then hit = w end end
check("text_input: a click overlay exists", hit ~= nil)
if hit then hit.onclick() end
check("text_input: clicking starts editing (SetEditing true)", lastTextEdit and lastTextEdit._editing == true)

-- Simulate typing + Enter: set the string and fire OnTextEntered.
if lastTextEdit then
    lastTextEdit._string = "Marcos"
    KIT.now = 1000
    lastTextEdit.OnTextEntered("Marcos")
end
check("text_input: Enter fired the ui_callback", #fired == 1)
check("text_input: callback name is the node callback", fired[1] and fired[1].cb == "submit:name")
check("text_input: payload carries the typed value", fired[1] and fired[1].payload and fired[1].payload.value == "Marcos")
check("text_input: payload carries the node id", fired[1] and fired[1].payload and fired[1].payload.id == "name")
check("text_input: clear_on_submit wiped the field", lastTextEdit and lastTextEdit._string == "")

-- Backend can set the value via SetProps (the patch closure).
UIWidgets.SetProps({ id="form", node="name", props={ value="preset" } })
check("text_input: backend SetProps sets the field value", lastTextEdit and lastTextEdit._string == "preset")

return C.report()
