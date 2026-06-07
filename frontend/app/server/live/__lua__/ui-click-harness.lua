-- Harness for the #16 fix in ui_widgets.lua: text/icon/image with a `callback` become
-- clickable via a transparent ImageButton overlay (DST's own pattern, widget.lua:757),
-- wired to ctx.callback_fn(cb, root_id) with a 0.5s debounce — NOT the old broken
-- OnControl/SetClickable path. Runs the REAL ui_widgets.lua under fengari with stubbed
-- DST widget classes that RECORD construction + SetOnClick. Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

-- ── Recording widget stubs ────────────────────────────────────────────────
-- Every DST widget method we don't care about is a no-op returning self/plausible
-- values. We DO record: AddChild (parent->child tree), the widget `kind`, SetOnClick
-- handlers, and ScaleToSize calls. A stub answers ANY method via __index.
local created = {}        -- flat list of every widget made, in order
local function mkWidget(kind, ctorArgs)
    local w
    w = {
        kind = kind, ctorArgs = ctorArgs, children = {}, onclick = nil,
        scaled = nil, inst = { IsValid = function() return true end },
        image = nil,
    }
    -- ImageButton has a `.image` sub-widget (ScaleToSize) and ForceImageSize (which is
    -- what sets the clickable hit region — recorded as w.sized).
    if kind == "ImageButton" then
        w.image = { ScaleToSize = function(_, ww, hh) w.scaled = { ww, hh } end }
    end
    local mt = { __index = function(_, key)
        -- Recorded methods:
        if key == "AddChild" then
            return function(self, child) self.children[#self.children + 1] = child; child.parent = self; return child end
        elseif key == "ForceImageSize" then
            return function(self, ww, hh) self.sized = { ww, hh }; return self end
        elseif key == "SetOnClick" then
            return function(self, fn) self.onclick = fn; return self end
        elseif key == "GetRegionSize" then
            return function() return 100, 20 end
        elseif key == "GetSize" then
            return function() return 56, 56 end
        end
        -- Everything else: a chainable no-op returning self.
        return function(self) return self end
    end }
    setmetatable(w, mt)
    created[#created + 1] = w
    return w
end

-- ── Mock _G with require returning widget factories + a HUD root ───────────
local function widgetFactory(kind)
    return setmetatable({}, { __call = function(_, ...) return mkWidget(kind, { ... }) end })
end
local widgetModules = {
    ["widgets/widget"]      = widgetFactory("Widget"),
    ["widgets/text"]        = widgetFactory("Text"),
    ["widgets/image"]       = widgetFactory("Image"),
    ["widgets/imagebutton"] = widgetFactory("ImageButton"),
}
local hudRoot = mkWidget("Widget", { "hud" })
local mock_G = KIT.make_G({
    require = function(name) return widgetModules[name] or widgetFactory("Widget") end,
    ThePlayer = { HUD = { controls = hudRoot } },
    NEWFONT_OUTLINE = "font", NEWFONT = "font", CHATFONT = "font", UIFONT = "font",
    TITLEFONT = "font", BODYTEXTFONT = "font", NEWFONT_SMALL = "font", TALKINGFONT = "font",
    ANCHOR_MIDDLE = 0, SCALEMODE_PROPORTIONAL = 0,
    pcall = pcall,
})

local UIWidgets = KIT.load(MOD_UI, "ui_widgets.lua")
UIWidgets.Init({ GLOBAL = mock_G })

-- Capture callbacks the click path fires.
local fired = {}
UIWidgets.SetCallbackHandler(function(cb, wid) fired[#fired + 1] = { cb = cb, wid = wid } end)

local function countKind(k)
    local n = 0
    for _, w in ipairs(created) do if w.kind == k then n = n + 1 end end
    return n
end
local function lastOnClick()
    for i = #created, 1, -1 do if created[i].onclick then return created[i].onclick end end
    return nil
end

-- ── A clickable TEXT node creates a transparent ImageButton overlay ───────
created = {}; fired = {}
UIWidgets.ProcessCommand({
    action = "create", type = "tree", id = "t1", group = "g1",
    tree = { type = "text", text = "Buy", callback = "buy_log" },
})
check("clickable text: an ImageButton overlay was created", countKind("ImageButton") >= 1)
local btn = nil
for _, w in ipairs(created) do if w.kind == "ImageButton" then btn = w end end
check("overlay: SetOnClick was wired", btn ~= nil and type(btn.onclick) == "function")
check("overlay: opaque square.tex used (real hit region, made invisible via alpha-0)", btn ~= nil and btn.ctorArgs[1] == "images/global.xml" and btn.ctorArgs[2] == "square.tex")
check("overlay: ForceImageSize set the clickable hit region", btn ~= nil and btn.sized ~= nil)

-- ── Clicking fires ctx.callback_fn ONCE (debounce), with (callback, root_id) ──
KIT.now = 1000
local click = btn and btn.onclick
if click then click() end
check("click: callback fired once", #fired == 1)
check("click: callback name is the node.callback", fired[1] and fired[1].cb == "buy_log")
check("click: widget id is the tree root id", fired[1] and fired[1].wid == "g1")
-- second click within 0.5s is debounced away
if click then click() end
check("click: debounced within 0.5s (still 1)", #fired == 1)
-- after 0.5s it fires again
KIT.now = 1001
if click then click() end
check("click: fires again after debounce window", #fired == 2)

-- ── A NON-clickable text (no callback) creates NO overlay ──────────────────
created = {}; fired = {}
UIWidgets.ProcessCommand({
    action = "create", type = "tree", id = "t2",
    tree = { type = "text", text = "Just label" },
})
check("non-clickable text: no ImageButton overlay", countKind("ImageButton") == 0)

-- ── A clickable IMAGE node also gets an overlay (same path) ────────────────
created = {}; fired = {}
UIWidgets.ProcessCommand({
    action = "create", type = "tree", id = "t3", group = "g3",
    tree = { type = "image", tex = "square.tex", callback = "pick" },
})
check("clickable image: overlay created", countKind("ImageButton") >= 1)
local ibtn = nil
for _, w in ipairs(created) do if w.kind == "ImageButton" then ibtn = w end end
if ibtn and ibtn.onclick then KIT.now = 2000; ibtn.onclick() end
check("clickable image: click fires callback 'pick'", #fired == 1 and fired[1].cb == "pick")

-- ── A text node with a NUMERIC `text` must not crash (#tostring guard) ─────
-- (a template can resolve to a number; #number errors "attempt to get length").
created = {}; fired = {}
local ok_num = pcall(function()
    UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "tn", group = "gn",
        tree = { type = "text", text = 42 } })
end)
check("numeric text does not crash (tostring guard)", ok_num == true)

-- ── A tree with NON-NUMERIC / NON-TABLE props (templates that resolved badly) must
-- not crash the renderer (the ui_builder literal-tree path doesn't coerce). Covers the
-- type-hardening sweep: bar value/max/size strings, panel width/height strings, tabs/
-- children as non-arrays, color as non-table. ──
created = {}; fired = {}
local ok_hard = pcall(function()
    UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "hard", group = "gh",
        tree = { type = "panel", width = "oops", height = "nope", children = "not-a-table",
            -- a column whose children resolved to a string, holding mixed bad nodes
        } })
    UIWidgets.ProcessCommand({ action = "create", type = "tree", id = "hard2", group = "gh2",
        tree = { type = "col", gap = "x", children = {
            { type = "bar", value = "50%", max = "N/A", width = "200px", height = "" },
            { type = "text", text = "ok", size = "big", color = 5 },
            { type = "tabs", active = "two", tabs = "not-array" },
        } } })
end)
check("non-numeric/non-table props do not crash the renderer", ok_hard == true)

-- ── The OLD broken path is GONE: no OnControl/SetClickable wiring remains ──
-- (structural assertion lives in the TS test; here we just confirm behavior.)

return C.report()
