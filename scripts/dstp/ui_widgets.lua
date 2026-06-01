-- DSTP UI Widgets — Client-side widget rendering system
-- Backend sends JSON commands via net_string, client creates/updates/destroys widgets
-- All rendering happens CLIENT-SIDE only

local UIWidgets = {}

local _G = nil
local _seq = -1  -- last processed sequence number (dedup net_string replays)

-- Active widget registry: id -> { widget=, type=, parent=, task= }
local active_widgets = {}

-- Widget root (lazy-created, attached to HUD)
local _root = nil

-- Font name lookup
local FONT_MAP = nil

-------------------------------------------------
-- Helpers
-------------------------------------------------

local function Log(msg)
    print("[DSTP UI] " .. msg)
end

local function InitFontMap()
    FONT_MAP = {
        NEWFONT           = _G.NEWFONT,
        NEWFONT_OUTLINE   = _G.NEWFONT_OUTLINE,
        CHATFONT          = _G.CHATFONT,
        UIFONT            = _G.UIFONT,
        TITLEFONT         = _G.TITLEFONT,
        BODYTEXTFONT      = _G.BODYTEXTFONT,
        NEWFONT_SMALL     = _G.NEWFONT_SMALL,
        TALKINGFONT       = _G.TALKINGFONT,
    }
end

local function ResolveFont(name)
    if not name then return _G.NEWFONT_OUTLINE end
    if not FONT_MAP then InitFontMap() end
    return FONT_MAP[name] or _G.NEWFONT_OUTLINE
end

local function ResolveColor(c)
    if not c then return {1, 1, 1, 1} end
    return {c[1] or 1, c[2] or 1, c[3] or 1, c[4] or 1}
end

--- Get or create the widget root attached to the player HUD
local function GetRoot()
    if _root and _root.inst:IsValid() then return _root end

    local player = _G.ThePlayer
    if not player or not player.HUD or not player.HUD.controls then
        return nil
    end

    local Widget = _G.require("widgets/widget")
    _root = player.HUD.controls:AddChild(Widget("dstp_ui_root"))
    _root:SetHAnchor(_G.ANCHOR_MIDDLE)
    _root:SetVAnchor(_G.ANCHOR_MIDDLE)
    _root:SetScaleMode(_G.SCALEMODE_PROPORTIONAL)
    _root:MoveToFront()
    return _root
end

--- Resolve anchor name to x/y offset base from screen center
--- Returns base_x, base_y that positions a widget at that corner/edge
local function AnchorOffset(anchor_name)
    -- Half-extents of the UI coordinate space. The root is ANCHOR_MIDDLE +
    -- SCALEMODE_PROPORTIONAL, so coords are relative to screen center in DST's
    -- virtual UI space (RESOLUTION_X/Y, ~1280x720). Use those constants instead
    -- of a hardcoded guess, with a margin so widgets stay on-screen. Falls back
    -- to 640x360 if the constants aren't available.
    local resx = _G.RESOLUTION_X or 1280
    local resy = _G.RESOLUTION_Y or 720
    local margin = 120
    local hw = resx / 2 - margin
    local hh = resy / 2 - margin
    local map = {
        topleft      = {-hw,  hh},
        top          = {  0,  hh},
        topcenter    = {  0,  hh},
        topright     = { hw,  hh},
        left         = {-hw,   0},
        center       = {  0,   0},
        right        = { hw,   0},
        bottomleft   = {-hw, -hh},
        bottom       = {  0, -hh},
        bottomcenter = {  0, -hh},
        bottomright  = { hw, -hh},
    }
    local key = anchor_name and anchor_name:lower() or "center"
    local a = map[key] or map.center
    return a[1], a[2]
end

-------------------------------------------------
-- Widget Builders
-------------------------------------------------

--- NOTIFICATION — toast that auto-dismisses
local function CreateNotification(cmd)
    local root = GetRoot()
    if not root then return nil end

    local Widget = _G.require("widgets/widget")
    local Text   = _G.require("widgets/text")

    local w = root:AddChild(Widget("dstp_notif_" .. cmd.id))
    local col = ResolveColor(cmd.color)
    local font = ResolveFont(cmd.font)
    local size = cmd.size or 28

    local txt = w:AddChild(Text(font, size, cmd.text or ""))
    txt:SetColour(col[1], col[2], col[3], col[4])

    -- Position at top-center
    local ax, ay = AnchorOffset("top")
    w:SetPosition(ax + (cmd.x or 0), ay - 40 + (cmd.y or 0))

    -- Slide-in: start slightly above, tween down
    local startY = ay + 20 + (cmd.y or 0)
    local endY   = ay - 40 + (cmd.y or 0)
    w:SetPosition(ax + (cmd.x or 0), startY)
    w:MoveTo(_G.Vector3(ax + (cmd.x or 0), startY, 0),
             _G.Vector3(ax + (cmd.x or 0), endY,   0), 0.3)

    -- Auto-dismiss
    local duration = cmd.duration or 5
    local task = _G.ThePlayer:DoTaskInTime(duration, function()
        if w and w.inst:IsValid() then
            -- Fade out by just killing — DST widgets don't have great fade support
            w:Kill()
            active_widgets[cmd.id] = nil
        end
    end)

    return { widget = w, text = txt, type = "notification", task = task }
end

local function UpdateNotification(entry, cmd)
    if cmd.text and entry.text and entry.text.inst:IsValid() then
        entry.text:SetString(cmd.text)
    end
    if cmd.color and entry.text and entry.text.inst:IsValid() then
        local c = ResolveColor(cmd.color)
        entry.text:SetColour(c[1], c[2], c[3], c[4])
    end
end

--- LABEL — persistent HUD text
local function CreateLabel(cmd)
    local root = GetRoot()
    if not root then return nil end

    local Widget = _G.require("widgets/widget")
    local Text   = _G.require("widgets/text")

    local w = root:AddChild(Widget("dstp_label_" .. cmd.id))
    local col  = ResolveColor(cmd.color)
    local font = ResolveFont(cmd.font)
    local size = cmd.size or 20

    local txt = w:AddChild(Text(font, size, cmd.text or ""))
    txt:SetColour(col[1], col[2], col[3], col[4])

    local ax, ay = AnchorOffset(cmd.anchor)
    w:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))

    return { widget = w, text = txt, type = "label" }
end

local function UpdateLabel(entry, cmd)
    if cmd.text and entry.text and entry.text.inst:IsValid() then
        entry.text:SetString(cmd.text)
    end
    if cmd.color and entry.text and entry.text.inst:IsValid() then
        local c = ResolveColor(cmd.color)
        entry.text:SetColour(c[1], c[2], c[3], c[4])
    end
    if cmd.size and entry.text and entry.text.inst:IsValid() then
        entry.text:SetSize(cmd.size)
    end
    if (cmd.x or cmd.y or cmd.anchor) and entry.widget and entry.widget.inst:IsValid() then
        local ax, ay = AnchorOffset(cmd.anchor or "center")
        entry.widget:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))
    end
end

--- PANEL — window with title and body
local function CreatePanel(cmd)
    local root = GetRoot()
    if not root then return nil end

    local Widget = _G.require("widgets/widget")
    local Text   = _G.require("widgets/text")
    local Image  = _G.require("widgets/image")
    local ImageButton = _G.require("widgets/imagebutton")

    local pw = cmd.width or 400
    local ph = cmd.height or 300

    local w = root:AddChild(Widget("dstp_panel_" .. cmd.id))

    -- Background using 9-slice panel image
    local bg = w:AddChild(Image("images/fepanel_fills.xml", "panel_fill_tiny.tex"))
    bg:SetSize(pw, ph)
    bg:SetTint(0.1, 0.1, 0.1, 0.85)

    -- Border overlay
    local border = w:AddChild(Image("images/fepanel_fills.xml", "panel_fill_tiny.tex"))
    border:SetSize(pw + 4, ph + 4)
    border:SetTint(0.3, 0.3, 0.4, 0.6)
    border:MoveToBack()

    -- Title
    local title_text = nil
    if cmd.title then
        title_text = w:AddChild(Text(_G.TITLEFONT, 24, cmd.title))
        title_text:SetColour(1, 1, 0.8, 1)
        title_text:SetPosition(0, ph / 2 - 25)
    end

    -- Body
    local body_text = nil
    if cmd.body then
        body_text = w:AddChild(Text(_G.BODYTEXTFONT, 18, cmd.body))
        body_text:SetColour(1, 1, 1, 1)
        body_text:SetRegionSize(pw - 40, ph - 80)
        body_text:SetHAlign(_G.ANCHOR_LEFT)
        body_text:SetVAlign(_G.ANCHOR_TOP)
        body_text:EnableWordWrap(true)
        body_text:SetPosition(0, -10)
    end

    -- Close button
    local close_btn = nil
    if cmd.closeable ~= false then
        close_btn = w:AddChild(ImageButton(
            "images/global_redux.xml",
            "close.tex", "close.tex", "close.tex", "close.tex"
        ))
        close_btn:SetPosition(pw / 2 - 15, ph / 2 - 15)
        close_btn:SetScale(0.4)
        close_btn:SetOnClick(function()
            -- A menu's panel + buttons share a `group`; closing the panel must
            -- tear down the whole group, not just the panel widget itself.
            if cmd.group then
                UIWidgets.DestroyGroup(cmd.group)
            else
                UIWidgets.DestroyWidget({ id = cmd.id })
            end
        end)
    end

    -- Position
    local ax, ay = AnchorOffset(cmd.anchor or "center")
    w:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))

    return {
        widget = w, type = "panel",
        title = title_text, body = body_text,
        close_btn = close_btn, bg = bg,
    }
end

local function UpdatePanel(entry, cmd)
    if cmd.title and entry.title and entry.title.inst:IsValid() then
        entry.title:SetString(cmd.title)
    end
    if cmd.body and entry.body and entry.body.inst:IsValid() then
        entry.body:SetString(cmd.body)
    end
    if (cmd.x or cmd.y or cmd.anchor) and entry.widget and entry.widget.inst:IsValid() then
        local ax, ay = AnchorOffset(cmd.anchor or "center")
        entry.widget:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))
    end
end

--- BUTTON — clickable HUD button, sends callback event to backend
local function CreateButton(cmd)
    local root = GetRoot()
    if not root then return nil end

    local Widget      = _G.require("widgets/widget")
    local Text        = _G.require("widgets/text")
    local ImageButton = _G.require("widgets/imagebutton")

    local w = root:AddChild(Widget("dstp_btn_" .. cmd.id))

    local btn = w:AddChild(ImageButton(
        "images/global_redux.xml",
        "button_carny_long_normal.tex",
        "button_carny_long_hover.tex",
        "button_carny_long_disabled.tex",
        "button_carny_long_down.tex"
    ))

    local bw = cmd.width or 200
    local bh = cmd.height or 50
    btn:SetScale(bw / 340, bh / 70)  -- base tex is ~340x70

    -- Label on button
    local label = w:AddChild(Text(_G.NEWFONT_OUTLINE, cmd.size or 22, cmd.text or "Button"))
    local col = ResolveColor(cmd.color)
    label:SetColour(col[1], col[2], col[3], col[4])

    -- Debounce: ignore repeat clicks on the same button within a short window.
    -- DST's ImageButton can fire OnClick more than once per real press, and an
    -- impatient player double-clicking a shop button would otherwise queue
    -- several ui_callback events (each a full flow run).
    local last_click = -1
    btn:SetOnClick(function()
        local now = _G.GetTime and _G.GetTime() or 0
        if last_click >= 0 and (now - last_click) < 0.5 then return end
        last_click = now
        if cmd.callback and UIWidgets._callback_fn then
            UIWidgets._callback_fn(cmd.callback, cmd.id)
        end
    end)

    local ax, ay = AnchorOffset(cmd.anchor)
    w:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))

    return { widget = w, btn = btn, label = label, type = "button", callback = cmd.callback }
end

local function UpdateButton(entry, cmd)
    if cmd.text and entry.label and entry.label.inst:IsValid() then
        entry.label:SetString(cmd.text)
    end
    if cmd.color and entry.label and entry.label.inst:IsValid() then
        local c = ResolveColor(cmd.color)
        entry.label:SetColour(c[1], c[2], c[3], c[4])
    end
    if cmd.callback then
        entry.callback = cmd.callback
        if entry.btn and entry.btn.inst:IsValid() then
            entry.btn:SetOnClick(function()
                if UIWidgets._callback_fn then
                    UIWidgets._callback_fn(cmd.callback, cmd.id)
                end
            end)
        end
    end
    if (cmd.x or cmd.y or cmd.anchor) and entry.widget and entry.widget.inst:IsValid() then
        local ax, ay = AnchorOffset(cmd.anchor)
        entry.widget:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))
    end
end

--- PROGRESS_BAR — horizontal bar with optional label
local function CreateProgressBar(cmd)
    local root = GetRoot()
    if not root then return nil end

    local Widget = _G.require("widgets/widget")
    local Image  = _G.require("widgets/image")
    local Text   = _G.require("widgets/text")

    local bw = cmd.width or 200
    local bh = cmd.height or 20
    local value = math.max(0, math.min(cmd.value or 0, cmd.max or 1))
    local max_val = cmd.max or 1
    local pct = max_val > 0 and (value / max_val) or 0

    local w = root:AddChild(Widget("dstp_bar_" .. cmd.id))

    -- Background bar
    local bg_col = ResolveColor(cmd.bg_color or {0.2, 0.2, 0.2, 1})
    local bg = w:AddChild(Image("images/global.xml", "square.tex"))
    bg:SetSize(bw, bh)
    bg:SetTint(bg_col[1], bg_col[2], bg_col[3], bg_col[4])

    -- Foreground (fill) bar
    local fg_col = ResolveColor(cmd.color or {0, 1, 0, 1})
    local fg = w:AddChild(Image("images/global.xml", "square.tex"))
    local fill_w = math.max(1, bw * pct)
    fg:SetSize(fill_w, bh - 2)
    fg:SetTint(fg_col[1], fg_col[2], fg_col[3], fg_col[4])
    -- Offset fill to align left edge with bg left edge
    fg:SetPosition(-(bw - fill_w) / 2, 0)

    -- Label
    local label = nil
    if cmd.label then
        label = w:AddChild(Text(_G.NEWFONT_OUTLINE, math.min(bh - 2, 18), cmd.label))
        label:SetColour(1, 1, 1, 1)
    end

    local ax, ay = AnchorOffset(cmd.anchor)
    w:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))

    return {
        widget = w, type = "progress_bar",
        bg = bg, fg = fg, label = label,
        bar_width = bw, bar_height = bh,
        max_val = max_val,
    }
end

local function UpdateProgressBar(entry, cmd)
    local bw = entry.bar_width
    local bh = entry.bar_height
    local max_val = cmd.max or entry.max_val or 1

    if cmd.value and entry.fg and entry.fg.inst:IsValid() then
        local value = math.max(0, math.min(cmd.value, max_val))
        local pct = max_val > 0 and (value / max_val) or 0
        local fill_w = math.max(1, bw * pct)
        entry.fg:SetSize(fill_w, bh - 2)
        entry.fg:SetPosition(-(bw - fill_w) / 2, 0)
        entry.max_val = max_val
    end
    if cmd.color and entry.fg and entry.fg.inst:IsValid() then
        local c = ResolveColor(cmd.color)
        entry.fg:SetTint(c[1], c[2], c[3], c[4])
    end
    if cmd.label and entry.label and entry.label.inst:IsValid() then
        entry.label:SetString(cmd.label)
    end
    if (cmd.x or cmd.y or cmd.anchor) and entry.widget and entry.widget.inst:IsValid() then
        local ax, ay = AnchorOffset(cmd.anchor)
        entry.widget:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))
    end
end

-------------------------------------------------
-- Generic UI tree renderer (composed by flow nodes)
-------------------------------------------------
-- A UI is a tree of nodes: { type=, ...props, children={...} }. Each leaf/box
-- reports its (w,h) so col/row containers can auto-layout (DST has no flex —
-- we measure with Text:GetRegionSize / Image:GetSize and stack with gap).
--
-- RenderNode(node, parent, ctx) -> widget, w, h
-- ctx carries the callback fn and a per-tree click-debounce table.

local function ResolveItemAtlas(prefab)
    -- DST scatters item icons across inventoryimages{1..4}.xml; the engine
    -- helper resolves the right atlas for "<prefab>.tex".
    local tex = tostring(prefab) .. ".tex"
    if _G.GetInventoryItemAtlas then
        local ok, atlas = _G.pcall(_G.GetInventoryItemAtlas, tex)
        if ok and atlas then return atlas, tex end
    end
    return "images/inventoryimages.xml", tex
end

local RenderNode  -- forward decl (recursive)

-- Render every child, then stack them along one axis with `gap`. `axis` is
-- "y" (column, top→down) or "x" (row, left→right). Returns total (w,h).
local function LayoutChildren(node, container, ctx, axis)
    local gap = node.gap or 8
    local kids = {}
    for _, childdef in ipairs(node.children or {}) do
        local cw, ch
        local cwidget
        cwidget, cw, ch = RenderNode(childdef, container, ctx)
        if cwidget then
            table.insert(kids, { w = cwidget, width = cw or 0, height = ch or 0 })
        end
    end

    -- Total extent along the layout axis + max cross extent.
    local total, cross = 0, 0
    for i, k in ipairs(kids) do
        if axis == "y" then
            total = total + k.height
            if k.width > cross then cross = k.width end
        else
            total = total + k.width
            if k.height > cross then cross = k.height end
        end
        if i < #kids then total = total + gap end
    end

    -- Place children centered on the cross axis, stacked on the main axis,
    -- with the group centered around the container origin (0,0).
    if axis == "y" then
        local cursor = total / 2
        for _, k in ipairs(kids) do
            cursor = cursor - k.height / 2
            k.w:SetPosition(0, cursor, 0)
            cursor = cursor - k.height / 2 - gap
        end
        return cross, total
    else
        local cursor = -total / 2
        for _, k in ipairs(kids) do
            cursor = cursor + k.width / 2
            k.w:SetPosition(cursor, 0, 0)
            cursor = cursor + k.width / 2 + gap
        end
        return total, cross
    end
end

-- Register an addressable node: ctx.byId[id] = { widget, patch }. `patch` is a
-- per-type closure that applies prop updates in place. `visible` is handled
-- generically here (Show/Hide). This is what makes ui_set work on any node.
local function Register(ctx, node, widget, patch)
    if not (node.id and ctx.byId) then return end
    ctx.byId[node.id] = {
        widget = widget,
        patch = function(props)
            if props.visible ~= nil and widget.inst:IsValid() then
                if props.visible then widget:Show() else widget:Hide() end
            end
            if patch then patch(props) end
        end,
    }
end

-- Make any widget clickable if the node carries a callback (debounced 0.5s).
-- DST widgets receive clicks via OnControl; we attach a lightweight handler.
local function MaybeClickable(widget, node, ctx)
    if not node.callback then return end
    local last = -1
    local cb = node.callback
    local function fire()
        local now = _G.GetTime and _G.GetTime() or 0
        if last >= 0 and (now - last) < 0.5 then return end
        last = now
        if ctx.callback_fn then ctx.callback_fn(cb, ctx.root_id) end
    end
    -- Text/Image widgets aren't buttons; wire OnControl + make focusable.
    widget.OnControl = function(self, control, down)
        if not down and (control == _G.CONTROL_ACCEPT) then fire(); return true end
        return false
    end
    if widget.SetClickable then widget:SetClickable(true) end
end

RenderNode = function(node, parent, ctx)
    if not node or not node.type then return nil, 0, 0 end
    local Widget      = _G.require("widgets/widget")
    local Text        = _G.require("widgets/text")
    local Image       = _G.require("widgets/image")
    local ImageButton = _G.require("widgets/imagebutton")
    local t = node.type

    if t == "col" or t == "row" then
        local c = parent:AddChild(Widget("col_row"))
        local w, h = LayoutChildren(node, c, ctx, t == "col" and "y" or "x")
        return c, w, h

    elseif t == "tabs" then
        -- Tab bar (row of buttons) on top + a content stack below; only the
        -- active tab's content is shown. Switching is fully client-side.
        local tabs = node.tabs or {}
        local holder = parent:AddChild(Widget("tabs"))
        local barH = 40
        local gap = 8

        -- Render each tab's content once, stacked at the same spot; hide all but active.
        local pages = {}
        local contentW, contentH = 0, 0
        for i, tab in ipairs(tabs) do
            local pageWrap = holder:AddChild(Widget("page_" .. i))
            local cw, ch = 0, 0
            if tab.child then
                local _, w, h = RenderNode(tab.child, pageWrap, ctx)
                cw, ch = w or 0, h or 0
            end
            if cw > contentW then contentW = cw end
            if ch > contentH then contentH = ch end
            pages[i] = pageWrap
            pageWrap:Hide()
        end

        -- Tab buttons row, centered above the content.
        local btnW = 120
        local totalBar = #tabs * btnW + (#tabs - 1) * gap
        local barWidgets = {}
        local function activate(idx)
            for j, pg in ipairs(pages) do
                if j == idx then pg:Show() else pg:Hide() end
            end
            for j, b in ipairs(barWidgets) do
                -- highlight active tab label
                if b.label and b.label.inst:IsValid() then
                    if j == idx then b.label:SetColour(1, 1, 0.5, 1) else b.label:SetColour(0.7, 0.7, 0.7, 1) end
                end
            end
        end

        -- Whole block (bar + gap + content) is centered on the holder origin so
        -- the parent col lays it out correctly. Bar sits at the top, content below.
        local totalH = barH + gap + contentH
        local barY = totalH / 2 - barH / 2                 -- bar centered at top
        local contentY = totalH / 2 - barH - gap - contentH / 2  -- content below bar

        local barX = -totalBar / 2 + btnW / 2
        for i, tab in ipairs(tabs) do
            local bwrap = holder:AddChild(Widget("tabbtn_" .. i))
            local btn = bwrap:AddChild(ImageButton(
                "images/global_redux.xml",
                "button_carny_long_normal.tex", "button_carny_long_hover.tex",
                "button_carny_long_disabled.tex", "button_carny_long_down.tex"))
            btn:SetScale(btnW / 340, barH / 70)
            local lbl = bwrap:AddChild(Text(_G.NEWFONT_OUTLINE, 18, tab.label or ("Aba " .. i)))
            bwrap:SetPosition(barX + (i - 1) * (btnW + gap), barY, 0)
            local idx = i
            btn:SetOnClick(function() activate(idx) end)
            barWidgets[i] = { btn = btn, label = lbl }
        end

        -- Content stack sits below the bar.
        for _, pg in ipairs(pages) do pg:SetPosition(0, contentY, 0) end
        activate((node.active or 0) + 1)

        local totalW = math.max(contentW, totalBar)
        return holder, totalW, totalH

    elseif t == "text" then
        local txt = parent:AddChild(Text(ResolveFont(node.font), node.size or 18, node.text or ""))
        local col = ResolveColor(node.color)
        txt:SetColour(col[1], col[2], col[3], col[4])
        if node.wrap_width then
            txt:SetRegionSize(node.wrap_width, node.wrap_height or 60)
            txt:EnableWordWrap(true)
        end
        MaybeClickable(txt, node, ctx)
        Register(ctx, node, txt, function(props)
            if props.text ~= nil and txt.inst:IsValid() then txt:SetString(tostring(props.text)) end
            if props.color and txt.inst:IsValid() then local c = ResolveColor(props.color); txt:SetColour(c[1], c[2], c[3], c[4]) end
            if props.size and txt.inst:IsValid() then txt:SetSize(props.size) end
        end)
        local w, h = txt:GetRegionSize()
        return txt, w or (#(node.text or "") * (node.size or 18) * 0.5), h or (node.size or 18)

    elseif t == "icon" then
        local atlas, tex
        if node.atlas and node.tex then atlas, tex = node.atlas, node.tex
        else atlas, tex = ResolveItemAtlas(node.prefab or "log") end
        local size = node.size or 56
        local img
        local ok = _G.pcall(function() img = parent:AddChild(Image(atlas, tex)) end)
        if ok and img then
            img:SetSize(size, size)
            MaybeClickable(img, node, ctx)
            Register(ctx, node, img, function(props)
                if not img.inst:IsValid() then return end
                if props.prefab then local a, x = ResolveItemAtlas(props.prefab); img:SetTexture(a, x) end
                if props.atlas and props.tex then img:SetTexture(props.atlas, props.tex) end
                if props.tint then local c = ResolveColor(props.tint); img:SetTint(c[1], c[2], c[3], c[4]) end
            end)
            return img, size, size
        end
        return parent:AddChild(Widget("noicon")), size, size

    elseif t == "image" then
        local size = node.size or 64
        local img = parent:AddChild(Image(node.atlas or "images/global.xml", node.tex or "square.tex"))
        img:SetSize(node.width or size, node.height or size)
        if node.tint then local c = ResolveColor(node.tint); img:SetTint(c[1], c[2], c[3], c[4]) end
        MaybeClickable(img, node, ctx)
        Register(ctx, node, img, function(props)
            if not img.inst:IsValid() then return end
            if props.atlas and props.tex then img:SetTexture(props.atlas, props.tex) end
            if props.tint then local c = ResolveColor(props.tint); img:SetTint(c[1], c[2], c[3], c[4]) end
        end)
        return img, node.width or size, node.height or size

    elseif t == "button" then
        local bw = node.width or 160
        local bh = node.height or 44
        local holder = parent:AddChild(Widget("btn"))
        local btn = holder:AddChild(ImageButton(
            "images/global_redux.xml",
            "button_carny_long_normal.tex", "button_carny_long_hover.tex",
            "button_carny_long_disabled.tex", "button_carny_long_down.tex"))
        btn:SetScale(bw / 340, bh / 70)
        local label = holder:AddChild(Text(_G.NEWFONT_OUTLINE, node.size or 20, node.text or "OK"))
        local col = ResolveColor(node.color)
        label:SetColour(col[1], col[2], col[3], col[4])
        local last = -1
        local cb = node.callback
        btn:SetOnClick(function()
            local now = _G.GetTime and _G.GetTime() or 0
            if last >= 0 and (now - last) < 0.5 then return end
            last = now
            if cb and ctx.callback_fn then ctx.callback_fn(cb, ctx.root_id) end
        end)
        Register(ctx, node, holder, function(props)
            if props.text ~= nil and label.inst:IsValid() then label:SetString(tostring(props.text)) end
            if props.color and label.inst:IsValid() then local c = ResolveColor(props.color); label:SetColour(c[1], c[2], c[3], c[4]) end
        end)
        return holder, bw, bh

    elseif t == "bar" then
        local bw = node.width or 200
        local bh = node.height or 16
        local value = math.max(0, math.min(node.value or 0, node.max or 1))
        local maxv = node.max or 1
        local pct = maxv > 0 and (value / maxv) or 0
        local holder = parent:AddChild(Widget("bar"))
        local bgc = ResolveColor(node.bg_color or {0.2, 0.2, 0.2, 1})
        local bg = holder:AddChild(Image("images/global.xml", "square.tex"))
        bg:SetSize(bw, bh); bg:SetTint(bgc[1], bgc[2], bgc[3], bgc[4])
        local fgc = ResolveColor(node.color or {0.2, 0.9, 0.2, 1})
        local fg = holder:AddChild(Image("images/global.xml", "square.tex"))
        local fillw = math.max(1, bw * pct)
        fg:SetSize(fillw, bh - 2); fg:SetTint(fgc[1], fgc[2], fgc[3], fgc[4])
        fg:SetPosition(-(bw - fillw) / 2, 0)
        local curMax = maxv
        Register(ctx, node, holder, function(props)
            if not fg.inst:IsValid() then return end
            if props.max ~= nil then curMax = tonumber(props.max) or curMax end
            if props.value ~= nil then
                local v = math.max(0, math.min(tonumber(props.value) or 0, curMax))
                local p = curMax > 0 and (v / curMax) or 0
                local fw = math.max(1, bw * p)
                fg:SetSize(fw, bh - 2); fg:SetPosition(-(bw - fw) / 2, 0)
            end
            if props.color then local c = ResolveColor(props.color); fg:SetTint(c[1], c[2], c[3], c[4]) end
        end)
        return holder, bw, bh

    elseif t == "spacer" then
        return parent:AddChild(Widget("spacer")), node.width or 0, node.height or 8

    elseif t == "panel" then
        -- Panel = framed background sized to fit its content (laid out as a col).
        local holder = parent:AddChild(Widget("panel"))
        local bg = holder:AddChild(Image("images/fepanel_fills.xml", "panel_fill_tiny.tex"))
        local border = holder:AddChild(Image("images/fepanel_fills.xml", "panel_fill_tiny.tex"))
        -- content container (column) holding title + children
        local content = holder:AddChild(Widget("content"))
        local cw, ch = LayoutChildren(node, content, ctx, "y")
        local padX, padY = 28, 28
        local pw = math.max(node.min_width or 160, cw + padX * 2)
        local ph = math.max(node.min_height or 80, ch + padY * 2)
        bg:SetSize(pw, ph); bg:SetTint(0.08, 0.08, 0.1, 0.92)
        border:SetSize(pw + 4, ph + 4); border:SetTint(0.35, 0.3, 0.5, 0.7); border:MoveToBack()
        -- close button
        if node.closeable ~= false then
            local close_btn = holder:AddChild(ImageButton(
                "images/global_redux.xml", "close.tex", "close.tex", "close.tex", "close.tex"))
            close_btn:SetPosition(pw / 2 - 18, ph / 2 - 18, 0)
            close_btn:SetScale(0.4)
            close_btn:SetOnClick(function() UIWidgets.DestroyGroup(ctx.root_id) end)
        end
        return holder, pw, ph
    end

    -- Unknown type: empty placeholder
    return parent:AddChild(Widget("unknown")), 0, 0
end

--- Create a UI from a tree definition. cmd = { id, group, tree, anchor, x, y }
local function CreateTree(cmd)
    local root = GetRoot()
    if not root or not cmd.tree then return nil end
    local w = root:AddChild(_G.require("widgets/widget")("dstp_tree_" .. cmd.id))
    local ctx = { callback_fn = UIWidgets._callback_fn, root_id = cmd.group or cmd.id, byId = {} }
    RenderNode(cmd.tree, w, ctx)
    local ax, ay = AnchorOffset(cmd.anchor or "center")
    w:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))
    return { widget = w, type = "tree", group = cmd.group, byId = ctx.byId }
end

--- Generic in-place update: patch any addressable node's props (text, color,
--- value, max, visible, tint, prefab, tex/atlas) without rebuilding the tree.
--- cmd = { id = <tree id>, node = <node id>, props = {...} }
--- (Legacy: cmd.text patches the `text` prop; kept for set_text compatibility.)
function UIWidgets.SetProps(cmd)
    local entry = active_widgets[cmd.id]
    if not entry or not entry.byId then return end
    local target = entry.byId[cmd.node]
    if not target or not target.patch then return end
    local props = cmd.props
    if not props and cmd.text ~= nil then props = { text = cmd.text } end
    if props then target.patch(props) end
end

local function UpdateTree(entry, cmd)
    -- In-place prop patch (no rebuild, no flicker).
    if cmd.set_props then
        UIWidgets.SetProps({ id = cmd.id, node = cmd.set_props.node, props = cmd.set_props.props })
        return entry
    end
    -- Otherwise rebuild wholesale (tree changed on open/refresh).
    if entry.widget and entry.widget.inst:IsValid() then
        local group = entry.group
        entry.widget:Kill()
        local fresh = CreateTree(cmd)
        if fresh then fresh.group = group end
        return fresh
    end
end

-------------------------------------------------
-- FOLLOW — a widget that tracks a world entity (e.g. boss HP bar)
-------------------------------------------------
-- Resolves an entity on the client (by guid, by nearest prefab within max_dist,
-- or just nearest non-player) and repositions a progress_bar + label over it
-- every frame via TheSim:GetScreenPos (world→screen). The widget attaches to the
-- HUD directly (not the centered _root) so screen coords map 1:1.

local function FindFollowTarget(follow)
    local player = _G.ThePlayer
    if not player or not player.Transform then return nil end
    -- Combat-target mode: follow whoever the player is currently fighting.
    -- onhitother/onattackother are SERVER-only, but the client knows the live
    -- combat target via the combat replica — this is what works client-side.
    if follow.mode == "combat_target" then
        local cmb = player.replica and player.replica.combat
        local tgt = cmb and cmb.GetTarget and cmb:GetTarget()
        if tgt and tgt:IsValid() then return tgt end
        return nil
    end
    -- By explicit GUID first.
    if follow.guid then
        local ent = _G.Ents and _G.Ents[follow.guid]
        if ent and ent:IsValid() then return ent end
    end
    -- Otherwise search around the player.
    local px, py, pz = player.Transform:GetWorldPosition()
    local radius = (follow.max_dist and follow.max_dist > 0) and follow.max_dist or 40
    local ents = _G.TheSim:FindEntities(px, py, pz, radius, nil, { "INLIMBO", "FX", "player" })
    local best, bestd = nil, math.huge
    for _, ent in ipairs(ents) do
        if ent ~= player and ent:IsValid() and (not ent:HasTag("player")) then
            if (not follow.prefab) or ent.prefab == follow.prefab then
                local ex, ey, ez = ent.Transform:GetWorldPosition()
                local d = (ex - px) * (ex - px) + (ez - pz) * (ez - pz)
                if d < bestd then best, bestd = ent, d end
            end
        end
    end
    return best
end

local function CreateFollow(cmd)
    local player = _G.ThePlayer
    if not player or not player.HUD or not player.HUD.controls then return nil end

    local Widget = _G.require("widgets/widget")
    local Image  = _G.require("widgets/image")
    local Text   = _G.require("widgets/text")

    local follow = cmd.follow or {}
    local bw = cmd.width or 80
    local bh = cmd.height or 10
    local offset_y = follow.offset_y or 60

    -- Attached to the HUD with proportional scale so GetScreenPos maps directly.
    local w = player.HUD.controls:AddChild(Widget("dstp_follow_" .. cmd.id))
    w:SetScaleMode(_G.SCALEMODE_PROPORTIONAL)
    w:SetMaxPropUpscale(_G.MAX_HUD_SCALE or 1)
    w:MoveToFront()

    -- progress bar
    local bgc = ResolveColor(cmd.bg_color or {0.1, 0.1, 0.1, 0.8})
    local bg = w:AddChild(Image("images/global.xml", "square.tex"))
    bg:SetSize(bw, bh); bg:SetTint(bgc[1], bgc[2], bgc[3], bgc[4])
    local fgc = ResolveColor(cmd.color or {0.9, 0.2, 0.2, 1})
    local fg = w:AddChild(Image("images/global.xml", "square.tex"))
    local maxv = cmd.max or 1
    local function setBar(v)
        local pct = maxv > 0 and math.max(0, math.min(v / maxv, 1)) or 0
        local fw = math.max(1, bw * pct)
        fg:SetSize(fw, bh - 2); fg:SetPosition(-(bw - fw) / 2, 0)
    end
    fg:SetTint(fgc[1], fgc[2], fgc[3], fgc[4])
    setBar(cmd.value or maxv)

    local label = nil
    if cmd.label or cmd.text then
        label = w:AddChild(Text(_G.NEWFONT_OUTLINE, 16, cmd.label or cmd.text or ""))
        label:SetPosition(0, bh + 6)
    end

    -- Per-frame reposition + auto-track the entity's health if it has a replica.
    local entry = { widget = w, type = "follow", group = cmd.group, bar = fg, label = label, setBar = setBar }
    local lost = 0
    local task
    local dynamic = follow.mode == "combat_target"  -- alvo muda → re-resolve sempre
    task = player:DoPeriodicTask(0, function()
        local ent = entry.target
        if dynamic or not (ent and ent:IsValid()) then
            ent = FindFollowTarget(follow)
            entry.target = ent
        end
        if not (ent and ent:IsValid()) then
            w:Hide()
            lost = lost + 1
            if lost > 600 then  -- ~5s of nothing → give up
                if task then task:Cancel() end
                UIWidgets.DestroyWidget({ id = cmd.id })
            end
            return
        end
        lost = 0
        w:Show()
        -- live health from the entity's replica/components, if present
        local h = ent.replica and ent.replica.health
        if h and h.GetCurrent then
            maxv = (h.Max and h:Max()) or maxv
            setBar(h:GetCurrent() or maxv)
        end
        -- keep the label on the current target's name (dynamic modes)
        if label and label.inst:IsValid() and ent.GetDisplayName then
            local nm = ent:GetDisplayName()
            if nm and nm ~= entry._lastname then label:SetString(nm); entry._lastname = nm end
        end
        local sx, sy = _G.TheSim:GetScreenPos(ent.Transform:GetWorldPosition())
        w:SetPosition(sx, sy + offset_y, 0)
    end)
    entry.task = task
    return entry
end

-------------------------------------------------
-- Dispatch tables
-------------------------------------------------

local CREATORS = {
    notification = CreateNotification,
    label        = CreateLabel,
    panel        = CreatePanel,
    tree         = CreateTree,
    button       = CreateButton,
    progress_bar = CreateProgressBar,
    follow       = CreateFollow,
}

local UPDATERS = {
    notification = UpdateNotification,
    label        = UpdateLabel,
    panel        = UpdatePanel,
    tree         = UpdateTree,
    button       = UpdateButton,
    progress_bar = UpdateProgressBar,
}

-------------------------------------------------
-- Public API
-------------------------------------------------

function UIWidgets.Init(env)
    _G = env.GLOBAL
    -- Optional: callback function for button clicks (set by modmain)
    UIWidgets._callback_fn = nil
end

--- Set the callback function that button widgets invoke
--- fn(callback_name, widget_id) — should send an event to the backend
function UIWidgets.SetCallbackHandler(fn)
    UIWidgets._callback_fn = fn
end

function UIWidgets.CreateWidget(cmd)
    if not cmd.id or not cmd.type then
        Log("create: missing id or type")
        return
    end

    -- Destroy existing widget with same id
    if active_widgets[cmd.id] then
        UIWidgets.DestroyWidget({ id = cmd.id })
    end

    -- A `follow` block means "track a world entity" regardless of widget type.
    local creator = cmd.follow and CREATORS.follow or CREATORS[cmd.type]
    if not creator then
        Log("create: unknown widget type '" .. tostring(cmd.type) .. "'")
        return
    end

    local entry = creator(cmd)
    if entry then
        entry.group = cmd.group
        active_widgets[cmd.id] = entry
        Log("created " .. cmd.type .. " '" .. cmd.id .. "'")
    end
end

--- Destroy every widget tagged with the given group (e.g. a whole menu).
function UIWidgets.DestroyGroup(group)
    if not group then return end
    local ids = {}
    for id, entry in pairs(active_widgets) do
        if entry.group == group then table.insert(ids, id) end
    end
    for _, id in ipairs(ids) do
        UIWidgets.DestroyWidget({ id = id })
    end
    Log("destroyed group '" .. tostring(group) .. "' (" .. #ids .. " widgets)")
end

function UIWidgets.UpdateWidget(cmd)
    if not cmd.id then
        Log("update: missing id")
        return
    end

    local entry = active_widgets[cmd.id]
    if not entry then
        -- If widget doesn't exist yet and full create data is provided, create it
        if cmd.type then
            UIWidgets.CreateWidget(cmd)
        else
            Log("update: widget '" .. cmd.id .. "' not found")
        end
        return
    end

    local updater = UPDATERS[entry.type]
    if updater then
        updater(entry, cmd)
    end
end

function UIWidgets.DestroyWidget(cmd)
    if not cmd.id then return end
    local entry = active_widgets[cmd.id]
    if not entry then return end

    -- Cancel any pending tasks (e.g. notification auto-dismiss)
    if entry.task then
        entry.task:Cancel()
    end

    -- Kill the widget tree
    if entry.widget and entry.widget.inst:IsValid() then
        entry.widget:Kill()
    end

    active_widgets[cmd.id] = nil
    Log("destroyed '" .. cmd.id .. "'")
end

function UIWidgets.ClearAll()
    local ids = {}
    for id, _ in pairs(active_widgets) do
        table.insert(ids, id)
    end
    for _, id in ipairs(ids) do
        UIWidgets.DestroyWidget({ id = id })
    end
    Log("cleared all widgets")
end

function UIWidgets.ProcessCommand(cmd)
    if not cmd or not cmd.action then
        Log("invalid command (no action)")
        return
    end

    -- Sequence-based dedup: skip if we already processed this seq
    if cmd.seq then
        if cmd.seq <= _seq then return end
        _seq = cmd.seq
    end

    if cmd.action == "create" then
        UIWidgets.CreateWidget(cmd)
    elseif cmd.action == "update" then
        UIWidgets.UpdateWidget(cmd)
    elseif cmd.action == "destroy" then
        UIWidgets.DestroyWidget(cmd)
    elseif cmd.action == "destroy_group" then
        UIWidgets.DestroyGroup(cmd.group)
    elseif cmd.action == "set_text" then
        -- Legacy: patch a text node by string. Generalized by set/ui_set below.
        UIWidgets.SetProps({ id = cmd.id, node = cmd.node, text = cmd.text })
    elseif cmd.action == "set" or cmd.action == "ui_set" then
        -- Generic in-place prop patch on any addressable node.
        UIWidgets.SetProps({ id = cmd.id, node = cmd.node, props = cmd.props })
    elseif cmd.action == "clear" then
        UIWidgets.ClearAll()
    elseif cmd.action == "batch" then
        -- Process multiple commands in one net_string payload
        if cmd.commands then
            for _, sub_cmd in ipairs(cmd.commands) do
                UIWidgets.ProcessCommand(sub_cmd)
            end
        end
    else
        Log("unknown action '" .. tostring(cmd.action) .. "'")
    end
end

--- Get count of active widgets (for debugging)
function UIWidgets.GetActiveCount()
    local count = 0
    for _ in pairs(active_widgets) do count = count + 1 end
    return count
end

return UIWidgets
