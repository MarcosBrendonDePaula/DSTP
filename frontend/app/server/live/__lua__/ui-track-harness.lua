-- ui_track harness: runs the REAL ui_widgets.lua CreateFollow under fengari with a mocked
-- world (ThePlayer, TheSim:FindEntities/GetScreenPos, entities carrying the dstp_hp
-- netvar cache) and drives the per-frame task by hand. Pins:
--   * follow.mode="all": one follower per entity in range matching `prefabs`, created on
--     enter, destroyed on leave, positioned at the entity's screen pos + offset_y;
--   * a `tree` template renders per entity and its `bind` props are evaluated locally
--     every frame against {entity=...} (bar value/max from dstp_hp, text from the name);
--   * require_hp skips entities without the HP netvar (no lying 100% bars);
--   * legacy single-target follow HIDES the bar when the entity has no HP data.
-- Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local created = {}
local function mkWidget(kind, ctorArgs)
    local w = { kind = kind, ctorArgs = ctorArgs, children = {}, shown = true, dead = false,
                inst = { IsValid = function() return true end } }
    w.inst.IsValid = function() return not w.dead end
    if kind == "ImageButton" then w.image = { ScaleToSize = function() end } end
    setmetatable(w, { __index = function(_, key)
        if key == "AddChild" then return function(self, c) self.children[#self.children+1] = c; c.parent = self; return c end end
        if key == "SetSize" then return function(self, a, b) self.size = { a, b }; return self end end
        if key == "ForceImageSize" then return function(self, a, b) self.size = { a, b }; return self end end
        if key == "SetPosition" then return function(self, x, y) self.pos = { x, y }; return self end end
        if key == "SetString" then return function(self, s) self.str = s; return self end end
        if key == "Show" then return function(self) self.shown = true; return self end end
        if key == "Hide" then return function(self) self.shown = false; return self end end
        -- Kill propagates to the subtree, like the engine (a killed parent kills its children).
        if key == "Kill" then return function(self)
            local function k(x) x.dead = true; for _, c in ipairs(x.children) do k(c) end end
            k(self); return self
        end end
        if key == "GetRegionSize" then return function() return 100, 20 end end
        if key == "GetSize" then return function() return 56, 56 end end
        return function(self) return self end
    end })
    created[#created+1] = w
    return w
end
local function widgetFactory(kind) return setmetatable({}, { __call = function(_, ...) return mkWidget(kind, { ... }) end }) end
local mods = {
    ["widgets/widget"] = widgetFactory("Widget"), ["widgets/text"] = widgetFactory("Text"),
    ["widgets/image"] = widgetFactory("Image"), ["widgets/imagebutton"] = widgetFactory("ImageButton"),
    ["widgets/textedit"] = widgetFactory("TextEdit"),
}
local hudRoot = mkWidget("Widget", { "hud" })

-- World mocks ------------------------------------------------------------------
local tasks = {}          -- periodic tasks registered on the player (we tick them by hand)
local NEAR = {}           -- what TheSim:FindEntities returns (the test mutates it)
local ENTS = {}
local function mkEnt(guid, prefab, x, z, hp, hpmax, name)
    local e = { GUID = guid, prefab = prefab, valid = true, tags = {} }
    e.Transform = { GetWorldPosition = function() return x, 0, z end }
    e.IsValid = function(self) return self.valid end
    e.HasTag = function(self, t) return self.tags[t] == true end
    e.GetDisplayName = function() return name or prefab end
    e.dstp_hp, e.dstp_hp_max = hp, hpmax
    ENTS[guid] = e
    return e
end
local player = {
    HUD = { controls = hudRoot },
    Transform = { GetWorldPosition = function() return 0, 0, 0 end },
    replica = {},
    HasTag = function() return false end,
    IsValid = function() return true end,
    DoPeriodicTask = function(self, period, fn)
        local t = { fn = fn, cancelled = false }
        t.Cancel = function(tt) tt.cancelled = true end
        tasks[#tasks+1] = t
        return t
    end,
}
local function tick(n) for _ = 1, (n or 1) do for _, t in ipairs(tasks) do if not t.cancelled then t.fn() end end end end

local mock_G = KIT.make_G({
    require = function(name) return mods[name] or widgetFactory("Widget") end,
    ThePlayer = player,
    Ents = ENTS,
    TheSim = {
        FindEntities = function(_, x, y, z, r, must, cant, oneof) local out = {}; for _, e in ipairs(NEAR) do out[#out+1] = e end; return out end,
        GetScreenPos = function(_, x, y, z) return 640 + x * 10, 360 + z * 10 end,
    },
    NEWFONT_OUTLINE = "f", NEWFONT = "f", CHATFONT = "f", UIFONT = "f", TITLEFONT = "f",
    BODYTEXTFONT = "f", NEWFONT_SMALL = "f", TALKINGFONT = "f",
    ANCHOR_MIDDLE = 0, SCALEMODE_PROPORTIONAL = 0, ANCHOR_LEFT = 1, ANCHOR_TOP = 2, MAX_HUD_SCALE = 1,
    RESOLUTION_X = 1280, RESOLUTION_Y = 720,
    pcall = pcall, print = function() end,
    json = KIT.fake_json,
})

local UIWidgets = KIT.load(MOD_UI, "ui_widgets.lua")
UIWidgets.Init({ GLOBAL = mock_G })

-- helpers over the recording widgets ------------------------------------------
local function walk(w, fn) fn(w); for _, c in ipairs(w.children) do walk(c, fn) end end
local function followers(id)
    local out = {}
    for _, w in ipairs(created) do
        if w.kind == "Widget" and w.ctorArgs and type(w.ctorArgs[1]) == "string"
           and w.ctorArgs[1]:sub(1, #("dstp_follow_" .. id .. ":")) == ("dstp_follow_" .. id .. ":") and not w.dead then
            out[#out+1] = w
        end
    end
    return out
end
local function findText(root, s) local f; walk(root, function(w) if w.kind == "Text" and w.str == s then f = w end end); return f end
local function barFillWidth(root)
    -- the bar's fg is the square.tex Image whose height is (bh-2)=6 for an 8px bar
    local fw; walk(root, function(w) if w.kind == "Image" and w.size and w.size[2] == 6 then fw = w.size[1] end end); return fw
end

-- ── 1) mode=all + template + bindings ─────────────────────────────────────────
local spA = mkEnt(101, "spider", 2, 0, 50, 100, "Spider A")
local spB = mkEnt(102, "spider", -3, 1, 100, 100, "Spider B")
local tree = mkEnt(103, "evergreen", 1, 1, nil, nil, "Tree")
NEAR = { spA, spB, tree }

UIWidgets.ProcessCommand({ action = "create", id = "hpbars", type = "progress_bar",
    -- scan_every=1 so enter/leave shows up on the very next tick in this test
    follow = { mode = "all", radius = 20, prefabs = { "spider" }, offset_y = 50, require_hp = true, scan_every = 1 },
    tree = { type = "col", gap = 2, children = {
        { type = "text", id = "nm", text = "?", size = 14, bind = { text = "entity.name" } },
        { type = "bar", id = "hp", value = 1, max = 1, width = 60, height = 8, bind = { value = "entity.hp", max = "entity.hp_max" } },
    } },
})
tick(1)
local f = followers("hpbars")
check("mode=all: one follower per matching entity in range (got " .. #f .. ", want 2)", #f == 2)
local fA
for _, w in ipairs(f) do if findText(w, "Spider A") then fA = w end end
check("template text bound to entity.name", fA ~= nil)
check("template bar bound to entity.hp/hp_max (50/100 of 60px = 30) got " .. tostring(fA and barFillWidth(fA)),
    fA ~= nil and barFillWidth(fA) == 30)
check("follower positioned at screen pos + offset_y (spider A at x=2 → 660, y=360+50)",
    fA ~= nil and fA.pos ~= nil and fA.pos[1] == 660 and fA.pos[2] == 410)

-- HP changes → bar follows on the next tick, no rebuild (same widget object)
spA.dstp_hp = 25
tick(1)
check("bar tracks HP changes each frame (25/100 → 15px) got " .. tostring(fA and barFillWidth(fA)),
    fA ~= nil and barFillWidth(fA) == 15 and not fA.dead)

-- entity leaves range → its follower is destroyed; the other survives
NEAR = { spA, tree }
tick(1)
local f2 = followers("hpbars")
check("entity out of range → its follower destroyed (got " .. #f2 .. ", want 1)", #f2 == 1 and f2[1] == fA)

-- entity re-enters → a fresh follower
NEAR = { spA, spB, tree }
tick(1)
check("entity re-entering gets a follower again", #followers("hpbars") == 2)

-- an entity with no HP netvar is skipped when require_hp=true (no lying 100% bar)
local hound = mkEnt(104, "spider", 5, 5, nil, nil, "Hound-ish spider")  -- matching prefab, no dstp_hp
NEAR = { spA, spB, hound }
tick(1)
check("require_hp skips entities without dstp_hp", #followers("hpbars") == 2)

-- destroying the widget kills every follower and cancels the task
UIWidgets.DestroyWidget({ id = "hpbars" })
check("destroy → all followers killed", #followers("hpbars") == 0)
local anyAlive = false
for _, t in ipairs(tasks) do if not t.cancelled then anyAlive = true end end
check("destroy → periodic task cancelled", not anyAlive)

-- ── 2) legacy single-target follow hides the bar when there is no HP data ─────
created = {}; tasks = {}
local rock = mkEnt(201, "rock1", 1, 0, nil, nil, "Rock")
NEAR = { rock }
UIWidgets.ProcessCommand({ action = "create", id = "one", type = "progress_bar",
    follow = { prefab = "rock1", max_dist = 20 }, width = 80, height = 10, label = "Rock" })
tick(1)
local barImgs = {}
for _, w in ipairs(created) do if w.kind == "Image" and w.ctorArgs and w.ctorArgs[2] == "square.tex" then barImgs[#barImgs+1] = w end end
local anyShown = false
for _, w in ipairs(barImgs) do if w.shown then anyShown = true end end
check("legacy follow with no HP data hides the bar images (#imgs=" .. #barImgs .. ")", #barImgs > 0 and not anyShown)
-- and shows them again once HP arrives
rock.dstp_hp, rock.dstp_hp_max = 30, 60
tick(1)
local allShown = #barImgs > 0
for _, w in ipairs(barImgs) do if not w.shown then allShown = false end end
check("legacy follow shows the bar once dstp_hp is present", allShown)

return C.report()
