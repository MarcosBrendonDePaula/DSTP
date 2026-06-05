-- Harness: a UI icon/image node whose texture fails to resolve must NOT crash the whole
-- render tree. Vanilla Image:SetSize indexes self.inst.ImageWidget, which is nil when the
-- atlas/tex didn't load ("SetSize on bad self") — the in-game crash seen on the wallet UI
-- (goldnugget icon). The fix guards build+SetSize in pcall and falls back to a placeholder.
-- Here we make the Image stub THROW from SetSize and assert ProcessCommand still completes
-- and the sibling text node still renders. Returns "OK"/"FAIL: ...".

local C = KIT.new_checker()
local check = C.check

local created = {}
local function mkWidget(kind, ctorArgs)
    local w
    w = { kind = kind, ctorArgs = ctorArgs, children = {}, killed = false,
          inst = { IsValid = function() return true end } }
    if kind == "ImageButton" then
        w.image = { ScaleToSize = function() end }
    end
    setmetatable(w, { __index = function(_, key)
        if key == "AddChild" then
            return function(self, child) self.children[#self.children+1] = child; child.parent = self; return child end
        elseif key == "SetSize" then
            -- THE failure: an Image built from a bad texture errors here (bad self).
            if w.kind == "Image" and w.ctorArgs and w.ctorArgs[2] == "BADTEX.tex" then
                return function() error("SetSize on bad self (number expected, got nil)") end
            end
            return function(self) return self end
        elseif key == "Kill" then
            return function(self) self.killed = true end
        elseif key == "GetRegionSize" then
            return function() return 100, 20 end
        elseif key == "GetSize" then
            return function() return 56, 56 end
        end
        return function(self) return self end
    end })
    created[#created+1] = w
    return w
end

local function widgetFactory(kind)
    return setmetatable({}, { __call = function(_, ...) return mkWidget(kind, { ... }) end })
end
local widgetModules = {
    ["widgets/widget"] = widgetFactory("Widget"),
    ["widgets/text"] = widgetFactory("Text"),
    ["widgets/image"] = widgetFactory("Image"),
    ["widgets/imagebutton"] = widgetFactory("ImageButton"),
}
local hudRoot = mkWidget("Widget", { "hud" })
local mock_G = KIT.make_G({
    require = function(name) return widgetModules[name] or widgetFactory("Widget") end,
    ThePlayer = { HUD = { controls = hudRoot } },
    NEWFONT_OUTLINE = "f", NEWFONT = "f", CHATFONT = "f", UIFONT = "f", TITLEFONT = "f",
    BODYTEXTFONT = "f", NEWFONT_SMALL = "f", TALKINGFONT = "f",
    ANCHOR_MIDDLE = 0, ANCHOR_LEFT = 1, ANCHOR_TOP = 2, SCALEMODE_PROPORTIONAL = 0,
    pcall = pcall,
    GetInventoryItemAtlas = function() return "images/inventoryimages.xml" end,
})

local UIWidgets = KIT.load(MOD_UI, "ui_widgets.lua")
UIWidgets.Init({ GLOBAL = mock_G })

-- A panel with a GOOD text child and a BAD image child (BADTEX.tex makes SetSize throw).
-- Without the guard, the whole ProcessCommand crashes and nothing renders.
created = {}
local ok = mock_G.pcall(function()
    UIWidgets.ProcessCommand({
        action = "create", type = "tree", id = "wallet", group = "g_wallet",
        tree = { type = "panel", title = "Wallet", children = {
            { type = "text", text = "Coins: 5" },
            { type = "image", tex = "BADTEX.tex", atlas = "images/x.xml", size = 40 },
        } },
    })
end)
check("render did NOT crash on a bad-texture image", ok == true)

-- The good text sibling still made it into the tree.
local hasText = false
for _, w in ipairs(created) do if w.kind == "Text" then hasText = true end end
check("sibling text node still rendered", hasText)

-- A placeholder Widget("noimage") was created in place of the broken image.
local hasPlaceholder = false
for _, w in ipairs(created) do if w.kind == "Widget" and w.ctorArgs and w.ctorArgs[1] == "noimage" then hasPlaceholder = true end end
check("broken image fell back to a 'noimage' placeholder", hasPlaceholder)

-- The half-built bad Image was Killed (not leaked into the tree).
local badImg
for _, w in ipairs(created) do if w.kind == "Image" and w.ctorArgs and w.ctorArgs[2] == "BADTEX.tex" then badImg = w end end
check("the half-built bad image was Killed", badImg ~= nil and badImg.killed == true)

return C.report()
