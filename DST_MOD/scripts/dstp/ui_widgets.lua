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
    if type(c) ~= "table" then return {1, 1, 1, 1} end
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

-- Forward decl: the flat label/panel/button/progress_bar builders below are now thin
-- adapters that build a one-node tree and call CreateTree (defined later). Declaring it
-- here lets the adapters reference it (strict mode + local-after-definition).
local CreateTree

-- Build a flat cmd into a one-node tree, render it via CreateTree, and tag the result
-- with the legacy `entry_type` + the single leaf's node id so the generic UpdateFlat
-- can patch it by props. The leaf node is given id "_leaf" so SetProps can address it;
-- a `panel` uses its own holder (title/body patched via the panel's own Register).
local function FlatAdapter(cmd, entry_type, node)
    node.id = node.id or "_leaf"
    local entry = CreateTree({
        id = cmd.id, group = cmd.group,
        tree = node, anchor = cmd.anchor, x = cmd.x, y = cmd.y,
    })
    if entry then
        entry.type = entry_type   -- so UPDATERS[entry.type] dispatches to UpdateFlat
        entry.leaf = node.id
    end
    return entry
end

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

--- LABEL — persistent HUD text. Now a thin adapter over the tree `text` node (the
--- draw code lives ONLY in RenderNode). The whole one-node tree is anchor-positioned
--- by CreateTree, reproducing the legacy per-label anchor placement.
local function CreateLabel(cmd)
    return FlatAdapter(cmd, "label", {
        type = "text", text = cmd.text or "",
        font = cmd.font, size = cmd.size or 20, color = cmd.color,
    })
end

--- PANEL — window with title and body. Now a thin adapter over the tree `panel` node
--- in FIXED-size mode (width/height + title/body string slots), so the draw code lives
--- only in RenderNode. Title/body are addressable for update-by-name via the panel
--- node's own Register (props.title/props.body).
local function CreatePanel(cmd)
    return FlatAdapter(cmd, "panel", {
        type = "panel",
        width = cmd.width or 400, height = cmd.height or 300,
        title = cmd.title, body = cmd.body,
        closeable = cmd.closeable,
    })
end

--- BUTTON — clickable HUD button. Now a thin adapter over the tree `button` node. The
--- tree button fires ctx.callback_fn(cb, root_id); since the adapter passes NO group,
--- CreateTree sets root_id = cmd.id, so the callback carries the same widget_id the
--- legacy button reported. Draw code (ImageButton+scale+debounce) lives only in RenderNode.
local function CreateButton(cmd)
    return FlatAdapter(cmd, "button", {
        type = "button", text = cmd.text or "Button",
        width = cmd.width or 200, height = cmd.height or 50,
        size = cmd.size or 22, color = cmd.color, callback = cmd.callback,
    })
end

--- PROGRESS_BAR — horizontal bar with optional inline label. Now a thin adapter over
--- the tree `bar` node (which gained an optional `label`). Fill math + label live only
--- in RenderNode; value/max/color/label are patched in place via the bar's Register.
local function CreateProgressBar(cmd)
    return FlatAdapter(cmd, "progress_bar", {
        type = "bar",
        width = cmd.width or 200, height = cmd.height or 20,
        value = cmd.value or 0, max = cmd.max or 1,
        color = cmd.color, bg_color = cmd.bg_color, label = cmd.label,
    })
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

local RenderNode      -- forward decl (recursive) — public wrapper (applies scale)
local RenderNodeImpl  -- the per-type renderer

-- Render every child, then stack them along one axis with `gap`. `axis` is
-- "y" (column, top→down) or "x" (row, left→right). Returns total (w,h).
local function LayoutChildren(node, container, ctx, axis)
    local gap = tonumber(node.gap) or 8
    local kids = {}
    -- children may be a non-table on the ui_builder literal-tree path (an author bound it
    -- to a template that resolved to a non-array); guard so ipairs doesn't crash.
    for _, childdef in ipairs(type(node.children) == "table" and node.children or {}) do
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

-- Canvas mode: place each child at its own absolute x,y (px in game space) relative to
-- the container's TOP-LEFT corner ("the panel is the form"). The container needs a fixed
-- width/height (the canvas area). DST widgets sit on a centered origin growing UP, while
-- the editor x,y grow right/DOWN from the corner — so convert:
--   px =  x - W/2        (left edge is -W/2)
--   py =  H/2 - y        (top edge is +H/2; y grows down → subtract)
-- Returns (W, H) so the parent reserves the canvas slot.
local function CanvasChildren(node, container, ctx)
    local W = tonumber(node.width) or 0
    local H = tonumber(node.height) or 0
    for _, childdef in ipairs(type(node.children) == "table" and node.children or {}) do
        local cwidget, cw, ch = RenderNode(childdef, container, ctx)
        if cwidget then
            -- x,y is the child's TOP-LEFT corner relative to the container's top-left
            -- (matches the editor). DST widgets are centered on their own origin, so the
            -- widget's CENTER must land at corner + half its own size. Container origin is
            -- its center → left edge = -W/2, top edge = +H/2 (y grows up).
            local x = tonumber(childdef.x) or 0
            local y = tonumber(childdef.y) or 0
            cw, ch = cw or 0, ch or 0
            cwidget:SetPosition(-W / 2 + x + cw / 2, H / 2 - y - ch / 2, 0)
        end
    end
    return W, H
end

-- Grid mode: lay children out in a `cols`-column grid, row by row, with `gap` between
-- cells. Each cell is the size of the largest child (uniform grid). Children stay
-- "blocked" (auto-placed) but the whole grid sits inside a canvas container at its x,y.
-- Returns (W, H) of the grid so the parent reserves the slot.
-- Parse a row spec "50 50" / "25 25 25 25" / "50 50 @120" into { weights..., h=height }.
-- "@N" (anywhere) fixes the row height in px; otherwise the row auto-sizes.
local function ParseRowSpec(s)
    local str = tostring(s or "")
    local out = {}
    local h = tonumber(str:match("@%s*(%d+%.?%d*)"))
    str = str:gsub("@%s*%d+%.?%d*", " ")
    for tok in str:gmatch("%S+") do
        local n = tonumber(tok)
        if n and n > 0 then table.insert(out, n) end
    end
    out.h = h
    return out
end

-- Layout grid by ROWS of widths (Bootstrap-like). node.grid_rows = list of width specs,
-- one per row ("50 50", "25 25 25 25"). A child sits in cell (gr=row, gc=col within the
-- row). The grid has a fixed total width (node.width or measured); each row's columns split
-- it by their weights. Children are centered in their cell. Rows stack top→down.
local function GridChildren(node, container, ctx)
    local gap = tonumber(node.gap) or 8
    -- Build row specs (default: one row of `cols` equal columns).
    local rowSpecs = {}
    if type(node.grid_rows) == "table" then
        for _, r in ipairs(node.grid_rows) do
            local spec = ParseRowSpec(r)
            if #spec > 0 then table.insert(rowSpecs, spec) end
        end
    end
    if #rowSpecs == 0 then
        local cols = math.max(1, math.floor(tonumber(node.cols) or 2))
        local r = {}
        for _ = 1, cols do table.insert(r, 1) end
        rowSpecs = { r }
    end

    -- Render children; bucket by explicit (gr,gc), auto-flow the rest into free cells.
    local placed = {}        -- placed[r][c] = widget
    local kids = {}
    for _, childdef in ipairs(type(node.children) == "table" and node.children or {}) do
        local cwidget, cw, ch = RenderNode(childdef, container, ctx)
        if cwidget then
            local gr = tonumber(childdef.gr)
            local gc = tonumber(childdef.gc)
            table.insert(kids, { w = cwidget, width = cw or 0, height = ch or 0,
                gr = gr and math.floor(gr) or nil, gc = gc and math.floor(gc) or nil })
        end
    end
    local function put(r, c, k) placed[r] = placed[r] or {}; placed[r][c] = k end
    for _, k in ipairs(kids) do
        if k.gr ~= nil and k.gc ~= nil then put(k.gr, k.gc, k) end
    end
    -- auto-flow
    do
        local fr, fc = 0, 0
        local function nextFree()
            while true do
                local cols = rowSpecs[fr + 1]
                if not cols then return nil end
                if fc >= #cols then fr = fr + 1; fc = 0
                elseif placed[fr] and placed[fr][fc] then fc = fc + 1
                else local r, c = fr, fc; fc = fc + 1; return r, c end
            end
        end
        for _, k in ipairs(kids) do
            if k.gr == nil or k.gc == nil then
                local r, c = nextFree()
                if r then put(r, c, k) end
            end
        end
    end

    -- Measure: total width = node.width (or the widest natural row), row height = tallest cell.
    local totalW = tonumber(node.width)
    if not totalW then
        -- natural width = max over rows of (sum of cell natural widths + gaps)
        totalW = 0
        for r, cols in ipairs(rowSpecs) do
            local sumw = 0
            for c = 0, #cols - 1 do
                local k = placed[r - 1] and placed[r - 1][c]
                sumw = sumw + (k and k.width or 0)
            end
            sumw = sumw + gap * (#cols - 1)
            if sumw > totalW then totalW = sumw end
        end
        if totalW <= 0 then totalW = 200 end
    end

    -- Row heights: each row's "@N" is a HEIGHT WEIGHT (fr) of the grid's total height
    -- (node.height). Rows without @ get weight 1. If node.height is unset, fall back to the
    -- measured (content) height per row so the grid still renders.
    local rowH = {}
    local gridH = 0
    local totalH = tonumber(node.height)
    if totalH then
        local sumW = 0
        for _, cols in ipairs(rowSpecs) do sumW = sumW + (cols.h and cols.h > 0 and cols.h or 1) end
        local usableH = totalH - gap * (#rowSpecs - 1)
        if usableH < 0 then usableH = totalH end
        for r, cols in ipairs(rowSpecs) do
            local wgt = (cols.h and cols.h > 0) and cols.h or 1
            rowH[r] = usableH * (wgt / sumW)
        end
        gridH = totalH
    else
        for r, cols in ipairs(rowSpecs) do
            local h = 0
            for c = 0, #cols - 1 do
                local k = placed[r - 1] and placed[r - 1][c]
                if k and k.height > h then h = k.height end
            end
            if h <= 0 then h = 24 end
            rowH[r] = h
            gridH = gridH + h
        end
        gridH = gridH + gap * (#rowSpecs - 1)
    end

    -- Place: rows top→down (DST grows up → start at +gridH/2). Within a row, columns split
    -- totalW by weight; center each child in its column band.
    local yTop = gridH / 2
    for r, cols in ipairs(rowSpecs) do
        local total = 0
        for _, wgt in ipairs(cols) do total = total + wgt end
        local h = rowH[r]
        local yCenter = yTop - h / 2
        local usableW = totalW - gap * (#cols - 1)
        local xLeft = -totalW / 2
        for c = 0, #cols - 1 do
            local wgt = cols[c + 1]
            local bandW = usableW * (wgt / total)
            local k = placed[r - 1] and placed[r - 1][c]
            if k then
                local xCenter = xLeft + bandW / 2
                k.w:SetPosition(xCenter, yCenter, 0)
            end
            xLeft = xLeft + bandW + gap
        end
        yTop = yTop - h - gap
    end
    return totalW, gridH
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

-- Make a text/icon/image node clickable if it carries a callback (debounced 0.5s).
--
-- WHY A WRAP AND NOT OnControl: a bare Text/Image is NOT focusable on the HUD, so it
-- never receives OnControl — the engine only delivers a click (CONTROL_ACCEPT) to a
-- widget that consumes it the way an ImageButton does. SetClickable only grants
-- focus/hover routing, which a non-focusable HUD widget never gets. This is DST's OWN
-- fix: widgets/widget.lua:757-760 makes a Text clickable by adding a transparent
-- ImageButton("images/ui.xml","blank.tex") child and ScaleToSize'ing it over the text
-- ("Text widgets don't receive OnGainFocus calls" — Klei's own comment).
--
-- We overlay an invisible ImageButton sized to the primitive (w×h) and SetOnClick it,
-- riding the SAME ctx.callback_fn(cb, root_id) path the tree `button` uses → no new
-- RPC/event/trigger. The overlay is a child of the primitive, co-located at (0,0); it
-- does NOT change the (w,h) RenderNode returns, so layout is unaffected.
-- Build an INVISIBLE, CLICKABLE hit target (an ImageButton) over a primitive. This is
-- the load-bearing pattern for the whole "make a HUD thing clickable" problem:
--
-- HUD click routing is FOCUS-based: the engine hit-test (GetEntitiesAtScreenPoint) only
-- returns entities with a REAL clickable region; that entity gains focus on hover, and
-- only a FOCUSED widget's OnControl fires (button.lua:59). A blank/transparent texture
-- wins NO hit-test, so a transparent overlay never focuses and the click falls through
-- to the world (the player walks). So: an OPAQUE tex (square.tex) for a real hit region,
-- made invisible via per-state alpha-0 colours (NOT a one-time tint — OnGainFocus would
-- re-show it), scale_on_focus=false (else hover grows it 1.2x and resets the texture to a
-- square), ForceImageSize for the region, SetClickable(true), MoveToFront. Returns the
-- ImageButton; caller wires SetOnClick / OnMouseButton.
local function MakeHitTarget(parent, w, h, pad, debug)
    local ImageButton = _G.require("widgets/imagebutton")
    local hit = parent:AddChild(ImageButton("images/global.xml", "square.tex", "square.tex", "square.tex"))
    hit.scale_on_focus = false
    pad = pad or 0
    if hit.ForceImageSize and w and h and w > 0 and h > 0 then
        hit:ForceImageSize(w + pad * 2, h + pad * 2)
    end
    local a = debug and { 1, 0, 0, 0.35 } or { 1, 1, 1, 0 }
    if hit.SetImageNormalColour then
        hit:SetImageNormalColour(a[1], a[2], a[3], a[4])
        hit:SetImageFocusColour(a[1], a[2], a[3], a[4])
        if hit.SetImageDisabledColour then hit:SetImageDisabledColour(a[1], a[2], a[3], a[4]) end
    elseif hit.image and hit.image.SetTint then
        hit.image:SetTint(a[1], a[2], a[3], a[4])
    end
    hit:SetPosition(0, 0, 0)
    if hit.SetClickable then hit:SetClickable(true) end
    hit:MoveToFront()
    return hit
end

local function MaybeClickable(widget, node, ctx, w, h)
    if not node.callback then return end
    local cb = node.callback
    local last = -1
    local function fire()
        local now = _G.GetTime and _G.GetTime() or 0
        if last >= 0 and (now - last) < 0.5 then return end  -- 0.5s debounce, as buttons
        last = now
        -- node.data (a table set by the author, e.g. { slot=.., prefab=.. }) rides along in
        -- callback_data.data so ONE callback can carry per-item info (a list's drop button).
        if ctx.fire then ctx.fire(cb, { data = node.data })
        elseif ctx.callback_fn then ctx.callback_fn(cb, ctx.root_id, { data = node.data }) end
    end
    -- pad: Text's GetRegionSize can under-report the glyphs, so inflate a touch so the
    -- whole string is clickable. node.hit_pad tunes it; default 8.
    local pad = (node.hit_pad ~= nil) and node.hit_pad or 8
    local hit = MakeHitTarget(widget, w, h, pad, node.hit_debug)
    hit:SetOnClick(fire)
end

-- Make a window draggable by a title-bar hit target. `dragArea` is the invisible
-- ImageButton the user grabs; `target` is the widget that MOVES (the panel holder /
-- tree root). On mouse-down we record the cursor→target offset and start a per-frame
-- OnUpdate that pins the target under the cursor; on mouse-up we stop. Uses
-- TheInput:GetScreenPosition (vanilla's own drag input, e.g. widget.lua:537) — the
-- engine fully supports this; nothing DST-specific blocks it.
local function MakeDraggable(dragArea, target)
    -- The title bar's OnMouseButton only STARTS the drag. The tracking + end are done by
    -- GLOBAL input handlers (TheInput:AddMoveHandler / AddMouseButtonHandler), which fire
    -- regardless of focus/hover — so a fast move that leaves the bar doesn't stop the drag
    -- (the earlier OnUpdate+IsControlPressed approach was focus-gated and stalled), and
    -- there's no 1-frame startup delay (the move handler fires immediately).
    local lastx, lasty = 0, 0
    local move_handle, btn_handle = nil, nil

    local function scaleXY()
        local parent = target.parent
        if parent and parent.GetScale then
            local s = parent:GetScale()
            if s then return (s.x ~= 0 and s.x) or 1, (s.y ~= 0 and s.y) or 1 end
        end
        return 1, 1   -- target is in PROPORTIONAL HUD space; divide screen px by its scale
    end

    local function stop()
        if move_handle then move_handle:Remove(); move_handle = nil end
        if btn_handle then btn_handle:Remove(); btn_handle = nil end
    end

    dragArea.OnMouseButton = function(self, button, down, x, y)
        if button ~= _G.MOUSEBUTTON_LEFT then return false end
        if down then
            if move_handle then return true end  -- already dragging
            local p = _G.TheInput:GetScreenPosition(); lastx, lasty = p.x, p.y
            target:MoveToFront()
            -- Global move: fires on EVERY cursor move during the drag, no focus needed.
            move_handle = _G.TheInput:AddMoveHandler(function(mx, my)
                local dx, dy = mx - lastx, my - lasty
                lastx, lasty = mx, my
                if dx ~= 0 or dy ~= 0 then
                    local sx, sy = scaleXY()
                    local tp = target:GetPosition()
                    target:SetPosition(tp.x + dx / sx, tp.y + dy / sy)
                end
            end)
            -- Global mouse-up: ends the drag even if released off the bar.
            btn_handle = _G.TheInput:AddMouseButtonHandler(function(btn, bdown)
                if btn == _G.MOUSEBUTTON_LEFT and not bdown then stop() end
            end)
        else
            stop()
        end
        return true
    end
end

RenderNodeImpl = function(node, parent, ctx)
    if not node or not node.type then return nil, 0, 0 end
    local Widget      = _G.require("widgets/widget")
    local Text        = _G.require("widgets/text")
    local Image       = _G.require("widgets/image")
    local ImageButton = _G.require("widgets/imagebutton")
    local t = node.type

    if t == "col" or t == "row" then
        local c = parent:AddChild(Widget("col_row"))
        -- Canvas mode: absolute x,y per child instead of stacking. Needs fixed width/height.
        if node.mode == "canvas" then
            local w, h = CanvasChildren(node, c, ctx)
            return c, w, h
        elseif node.mode == "grid" then
            local w, h = GridChildren(node, c, ctx)
            return c, tonumber(node.width) or w, tonumber(node.height) or h
        end
        local w, h = LayoutChildren(node, c, ctx, t == "col" and "y" or "x")
        -- Optional fixed size: when width/height are set, REPORT that size to the parent
        -- layout (overrides the measured content size). Content still lays out by gap; this
        -- only changes the slot the container claims. Unset = auto-size (unchanged).
        return c, tonumber(node.width) or w, tonumber(node.height) or h

    elseif t == "tabs" then
        -- Tab bar (row of buttons) on top + a content stack below; only the
        -- active tab's content is shown. Switching is fully client-side.
        local tabs = type(node.tabs) == "table" and node.tabs or {}  -- guard non-array
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
        activate((tonumber(node.active) or 0) + 1)

        local totalW = math.max(contentW, totalBar)
        return holder, totalW, totalH

    elseif t == "text" then
        -- size/wrap_* are NOT numeric-coerced on the ui_builder literal-tree path, so a
        -- template that resolved to a non-number would crash the arithmetic / native
        -- setters below. Coerce once up front.
        local sz = tonumber(node.size) or 18
        local txt = parent:AddChild(Text(ResolveFont(node.font), sz, tostring(node.text or "")))
        local col = ResolveColor(node.color)
        txt:SetColour(col[1], col[2], col[3], col[4])
        -- A fixed text box: width/height (or the legacy wrap_width/wrap_height) set the
        -- region + enable word-wrap. width is the intuitive alias for wrap_width.
        local fixW = tonumber(node.width) or tonumber(node.wrap_width)
        local fixH = tonumber(node.height) or tonumber(node.wrap_height)
        if fixW then
            txt:SetRegionSize(fixW, fixH or 60)
            txt:EnableWordWrap(true)
        end
        -- Optional alignment within a sized region (used by the folded panel body).
        if node.halign and txt.SetHAlign and _G[node.halign] then txt:SetHAlign(_G[node.halign]) end
        if node.valign and txt.SetVAlign and _G[node.valign] then txt:SetVAlign(_G[node.valign]) end
        local rw, rh = txt:GetRegionSize()
        -- LAYOUT size: an explicit width/height wins; else the measured region (with a
        -- per-char/size fallback if nil/0). node.text may be a NUMBER (template), so
        -- tostring before length (#number errors).
        local txtlen = #tostring(node.text or "")
        local w = fixW or ((rw and rw > 0) and rw or (txtlen * sz * 0.5))
        local h = fixH or ((rh and rh > 0) and rh or sz)
        -- HITBOX size: GetRegionSize can under-report the rendered glyphs, leaving the
        -- text edges unclickable. Feed MaybeClickable the LARGER of the measured region
        -- and a per-char estimate so the overlay always covers the whole string — this
        -- does NOT affect layout (the return below uses the measured w,h).
        local hit_w = math.max(w, txtlen * sz * 0.5)
        MaybeClickable(txt, node, ctx, hit_w, h)
        Register(ctx, node, txt, function(props)
            if props.text ~= nil and txt.inst:IsValid() then txt:SetString(tostring(props.text)) end
            if props.color and txt.inst:IsValid() then local c = ResolveColor(props.color); txt:SetColour(c[1], c[2], c[3], c[4]) end
            if props.size and txt.inst:IsValid() then txt:SetSize(props.size) end
        end)
        return txt, w, h

    elseif t == "icon" then
        local atlas, tex
        if node.atlas and node.tex then atlas, tex = node.atlas, node.tex
        else atlas, tex = ResolveItemAtlas(node.prefab or "log") end
        -- size = square default; width/height override for a rectangular icon.
        local size = tonumber(node.size) or 56
        local iw = tonumber(node.width) or size
        local ih = tonumber(node.height) or size
        local img
        -- Build AND size inside the pcall: a missing/invalid .tex makes the engine's
        -- Image construct a widget whose SetSize then errors ("SetSize on bad self") —
        -- so SetSize must be guarded too, not just the constructor. Any failure here
        -- falls through to the empty placeholder below instead of crashing the render.
        local ok = _G.pcall(function()
            img = parent:AddChild(Image(atlas, tex))
            img:SetSize(iw, ih)
        end)
        if ok and img then
            MaybeClickable(img, node, ctx, iw, ih)
            Register(ctx, node, img, function(props)
                if not img.inst:IsValid() then return end
                if props.prefab then local a, x = ResolveItemAtlas(props.prefab); img:SetTexture(a, x) end
                if props.atlas and props.tex then img:SetTexture(props.atlas, props.tex) end
                if props.tint then local c = ResolveColor(props.tint); img:SetTint(c[1], c[2], c[3], c[4]) end
            end)
            return img, iw, ih
        end
        -- Build failed (bad texture) — drop the half-built image and use a placeholder.
        if img and img.Kill then _G.pcall(function() img:Kill() end) end
        return parent:AddChild(Widget("noicon")), iw, ih

    elseif t == "image" then
        local size = tonumber(node.size) or 64
        local iw, ih = tonumber(node.width) or size, tonumber(node.height) or size
        local img
        -- Guard build+size together: a bad atlas/tex makes the engine's Image error in
        -- SetSize ("SetSize on bad self"), which must not crash the whole render tree.
        local ok = _G.pcall(function()
            img = parent:AddChild(Image(node.atlas or "images/global.xml", node.tex or "square.tex"))
            img:SetSize(iw, ih)
        end)
        if ok and img then
            if node.tint then local c = ResolveColor(node.tint); img:SetTint(c[1], c[2], c[3], c[4]) end
            MaybeClickable(img, node, ctx, iw, ih)
            Register(ctx, node, img, function(props)
                if not img.inst:IsValid() then return end
                if props.atlas and props.tex then img:SetTexture(props.atlas, props.tex) end
                if props.tint then local c = ResolveColor(props.tint); img:SetTint(c[1], c[2], c[3], c[4]) end
            end)
            return img, iw, ih
        end
        if img and img.Kill then _G.pcall(function() img:Kill() end) end
        return parent:AddChild(Widget("noimage")), iw, ih

    elseif t == "button" then
        local bw = node.width or 160
        local bh = node.height or 44
        local holder = parent:AddChild(Widget("btn"))
        local btn = holder:AddChild(ImageButton(
            "images/global_redux.xml",
            "button_carny_long_normal.tex", "button_carny_long_hover.tex",
            "button_carny_long_disabled.tex", "button_carny_long_down.tex"))
        btn:SetScale(bw / 340, bh / 70)
        local label = holder:AddChild(Text(_G.NEWFONT_OUTLINE, node.size or 20, tostring(node.text or "OK")))
        local col = ResolveColor(node.color)
        label:SetColour(col[1], col[2], col[3], col[4])
        local last = -1
        local cb = node.callback
        btn:SetOnClick(function()
            local now = _G.GetTime and _G.GetTime() or 0
            if last >= 0 and (now - last) < 0.5 then return end
            last = now
            if ctx.fire then ctx.fire(cb, { id = node.id, data = node.data })
            elseif cb and ctx.callback_fn then ctx.callback_fn(cb, ctx.root_id, { data = node.data }) end
        end)
        Register(ctx, node, holder, function(props)
            if props.text ~= nil and label.inst:IsValid() then label:SetString(tostring(props.text)) end
            if props.color and label.inst:IsValid() then local c = ResolveColor(props.color); label:SetColour(c[1], c[2], c[3], c[4]) end
        end)
        return holder, bw, bh

    elseif t == "text_input" then
        -- Editable text field. The engine supports this on the HUD via TextEdit +
        -- SetForceEdit(true): SetEditing(true) then routes ALL keystrokes to this widget
        -- (TheFrontEnd:SetForceProcessTextInput) AND suppresses WASD/hotkeys (the player
        -- controller's IsEnabled goes false while a field has input focus). No modal
        -- screen needed. On Enter the typed string rides the EXISTING ui_callback path as
        -- callback_data (read in a flow as {{trigger.callback_data.value}}).
        local TextEdit = _G.require("widgets/textedit")
        local iw = node.width or 220
        local ih = node.height or 36
        local holder = parent:AddChild(Widget("text_input"))
        local bg = holder:AddChild(Image("images/global.xml", "square.tex"))
        bg:SetSize(iw, ih); bg:SetTint(0.05, 0.05, 0.07, 0.85)
        -- DST's TextEdit hardcodes idle_text_color/edit_text_color to BLACK ({0,0,0,1},
        -- textedit.lua:28-29) and RE-APPLIES them on SetEditing in/out — overwriting the
        -- constructor colour. So the field always looked black. Set BOTH to our colour
        -- (default white) so the typed text is visible in idle AND editing states.
        local col = ResolveColor(node.color)
        local te = holder:AddChild(TextEdit(ResolveFont(node.font), node.size or 22, tostring(node.value or ""), col))
        te.idle_text_color = { col[1], col[2], col[3], col[4] }
        te.edit_text_color = { col[1], col[2], col[3], col[4] }
        te:SetColour(col[1], col[2], col[3], col[4])
        if te.SetRegionSize then te:SetRegionSize(iw - 12, ih) end
        te:SetForceEdit(true)  -- REQUIRED on the HUD: enables the force-process keyboard grab
        if node.max and te.SetTextLengthLimit then te:SetTextLengthLimit(node.max) end
        if node.password and te.SetPassword then te:SetPassword(true) end
        if node.placeholder and te.SetTextPrompt then te:SetTextPrompt(tostring(node.placeholder), { 0.6, 0.6, 0.6, 1 }) end
        if node.valid_chars and te.SetCharacterFilter then te:SetCharacterFilter(node.valid_chars) end
        if node.invalid_chars and te.SetInvalidCharacterFilter then te:SetInvalidCharacterFilter(node.invalid_chars) end

        local cb = node.callback
        local last = -1
        local function submit()
            if not cb or not ctx.callback_fn then return end
            local now = _G.GetTime and _G.GetTime() or 0
            if last >= 0 and (now - last) < 0.3 then return end  -- debounce vs double-fire
            last = now
            local s = (node.password and te.GetLineEditString) and te:GetLineEditString() or te:GetString()
            if ctx.fire then ctx.fire(cb, { value = s or "", id = node.id })
            else ctx.callback_fn(cb, ctx.root_id, { value = s or "", id = node.id }) end
            if node.clear_on_submit and te.SetString then te:SetString("") end
        end
        te.OnTextEntered = function() submit() end                          -- Enter commit
        if node.submit_on_blur then te.OnStopForceEdit = function() submit() end end  -- blur commit

        -- A bare TextEdit on the HUD isn't focusable; reuse the opaque hit target so a
        -- click starts editing (which grabs the keyboard).
        local hit = MakeHitTarget(holder, iw, ih, 0, node.hit_debug)
        hit:SetOnClick(function() te:SetEditing(true) end)
        -- Remember the field so the tree-destroy path can release the keyboard grab.
        ctx.text_fields = ctx.text_fields or {}
        ctx.text_fields[#ctx.text_fields + 1] = te
        -- Register a value getter keyed by the field id, so ANY callback (a button, another
        -- field) can ship every field's current value as callback_data.fields[id]. If the
        -- field has no explicit id, auto-assign "field_N" so it STILL shows up in fields
        -- (generic — the user doesn't have to set an id for the data to be captured).
        do
            ctx.field_getters = ctx.field_getters or {}
            local fid = node.id and tostring(node.id) or ("field_" .. (#ctx.field_getters + 1))
            ctx.field_getters[#ctx.field_getters + 1] = { id = fid, get = function()
                if not te.inst:IsValid() then return "" end
                return ((node.password and te.GetLineEditString) and te:GetLineEditString() or te:GetString()) or ""
            end }
        end

        Register(ctx, node, holder, function(props)
            if not te.inst:IsValid() then return end
            if props.value ~= nil and te.SetString then te:SetString(tostring(props.value)) end
            if props.text ~= nil and te.SetString then te:SetString(tostring(props.text)) end
            if props.placeholder ~= nil and te.SetTextPrompt then te:SetTextPrompt(tostring(props.placeholder), { 0.6, 0.6, 0.6, 1 }) end
            if props.color and te.SetColour then local c = ResolveColor(props.color); te:SetColour(c[1], c[2], c[3], c[4]) end
        end)
        return holder, iw, ih

    elseif t == "bar" then
        -- Coerce all numerics once (ui_builder literal-tree path doesn't num()-coerce, so
        -- a template resolving to a non-number would crash the arithmetic below).
        local bw = tonumber(node.width) or 200
        local bh = tonumber(node.height) or 16
        local maxv = tonumber(node.max) or 1
        local value = math.max(0, math.min(tonumber(node.value) or 0, maxv))
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
        -- Optional inline label centered on the bar (used by the folded progress_bar).
        local barlabel = nil
        if node.label then
            barlabel = holder:AddChild(Text(_G.NEWFONT_OUTLINE, math.min(bh - 2, 18), tostring(node.label)))
            barlabel:SetColour(1, 1, 1, 1)
        end
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
            if props.label ~= nil and barlabel and barlabel.inst:IsValid() then barlabel:SetString(tostring(props.label)) end
        end)
        return holder, bw, bh

    elseif t == "spacer" then
        return parent:AddChild(Widget("spacer")), node.width or 0, node.height or 8

    elseif t == "panel" then
        -- Panel = framed background. Two sizing modes:
        --  • auto (default): sized to fit its `children` laid out as a col.
        --  • fixed: node.width/height set (used by the folded legacy panel), with
        --    optional title/body STRING slots (addressable as "_title"/"_body" so the
        --    legacy update-by-name path round-trips via SetProps).
        local holder = parent:AddChild(Widget("panel"))
        local bg = holder:AddChild(Image("images/fepanel_fills.xml", "panel_fill_tiny.tex"))
        local border = holder:AddChild(Image("images/fepanel_fills.xml", "panel_fill_tiny.tex"))
        -- Coerce width/height: a non-numeric value (ui_builder template) must NOT enter
        -- fixed mode and crash the arithmetic (ph/2-25, pw-40). Only fixed when BOTH
        -- coerce to a number.
        local fw, fh = tonumber(node.width), tonumber(node.height)
        local fixed = fw ~= nil and fh ~= nil
        local pw, ph
        local title_txt, body_txt
        if fixed then
            pw, ph = fw, fh
            if node.title then
                title_txt = holder:AddChild(Text(_G.TITLEFONT, tonumber(node.title_size) or 24, tostring(node.title)))
                title_txt:SetColour(1, 1, 0.8, 1)
                title_txt:SetPosition(0, ph / 2 - 25, 0)
            end
            if node.body then
                body_txt = holder:AddChild(Text(_G.BODYTEXTFONT, tonumber(node.body_size) or 18, tostring(node.body)))
                body_txt:SetColour(1, 1, 1, 1)
                body_txt:SetRegionSize(pw - 40, ph - 80)
                if body_txt.SetHAlign and _G.ANCHOR_LEFT then body_txt:SetHAlign(_G.ANCHOR_LEFT) end
                if body_txt.SetVAlign and _G.ANCHOR_TOP then body_txt:SetVAlign(_G.ANCHOR_TOP) end
                body_txt:EnableWordWrap(true)
                body_txt:SetPosition(0, -10, 0)
            end
            -- Render any children too (composed nodes), centered as a col (or canvas).
            local content = holder:AddChild(Widget("content"))
            if node.mode == "canvas" then CanvasChildren(node, content, ctx)
            elseif node.mode == "grid" then GridChildren(node, content, ctx)
            else LayoutChildren(node, content, ctx, "y") end
        else
            local content = holder:AddChild(Widget("content"))
            local cw, ch
            if node.mode == "canvas" then cw, ch = CanvasChildren(node, content, ctx)
            elseif node.mode == "grid" then cw, ch = GridChildren(node, content, ctx)
            else cw, ch = LayoutChildren(node, content, ctx, "y") end
            local padX, padY = 28, 28
            pw = math.max(tonumber(node.min_width) or 160, cw + padX * 2)
            ph = math.max(tonumber(node.min_height) or 80, ch + padY * 2)
        end
        bg:SetSize(pw, ph); bg:SetTint(0.08, 0.08, 0.1, 0.92)
        border:SetSize(pw + 4, ph + 4); border:SetTint(0.35, 0.3, 0.5, 0.7); border:MoveToBack()
        -- Draggable window: a title-bar hit target the user grabs to move the whole panel.
        -- Created BEFORE the close button so the close button's later MoveToFront keeps it
        -- ON TOP and clickable. The bar leaves a GENEROUS gap on the right for the close
        -- button (the X) so the drag overlay never covers the X's hit area.
        local CLOSE_GAP = 64
        if node.draggable then
            local barH = node.drag_height or 44
            local barW = (node.closeable ~= false) and (pw - CLOSE_GAP) or pw
            local drag = MakeHitTarget(holder, barW, barH, 0, node.hit_debug)
            drag:SetPosition(-(pw - barW) / 2, ph / 2 - barH / 2, 0)  -- top strip, left of the X
            MakeDraggable(drag, holder)
        end
        -- close button (after the drag bar so its MoveToFront wins z-order over the bar)
        if node.closeable ~= false then
            local close_btn = holder:AddChild(ImageButton(
                "images/global_redux.xml", "close.tex", "close.tex", "close.tex", "close.tex"))
            close_btn:SetScale(0.4)
            -- Give the X an explicit, generous hit region (the scaled tex alone can be a
            -- tiny target) and force it into the hit-test, mirroring MakeHitTarget.
            if close_btn.ForceImageSize then close_btn:ForceImageSize(64, 64) end
            if close_btn.SetClickable then close_btn:SetClickable(true) end
            close_btn:SetPosition(pw / 2 - 18, ph / 2 - 18, 0)
            close_btn:SetOnClick(function() UIWidgets.DestroyGroup(ctx.root_id) end)
            close_btn:MoveToFront()
        end
        -- Make title/body addressable so update-by-name patches them in place.
        Register(ctx, node, holder, function(props)
            if props.title ~= nil and title_txt and title_txt.inst:IsValid() then title_txt:SetString(tostring(props.title)) end
            if props.body ~= nil and body_txt and body_txt.inst:IsValid() then body_txt:SetString(tostring(props.body)) end
        end)
        return holder, pw, ph
    end

    -- Unknown type: empty placeholder
    return parent:AddChild(Widget("unknown")), 0, 0
end

-- Public wrapper: render the node, then apply per-component `scale` (SetScale).
-- Some types (button/bar) already SetScale internally to size themselves; this
-- COMPOSES with the user factor by reading the widget's current scale and
-- multiplying, never overwriting. Reported (w,h) is multiplied so the parent
-- layout reserves the scaled slot.
RenderNode = function(node, parent, ctx)
    local widget, w, h = RenderNodeImpl(node, parent, ctx)
    local s = node and tonumber(node.scale)
    if widget and s and s ~= 1 and widget.SetScale then
        -- Compose with any existing self-scale instead of overwriting it.
        local cx, cy = 1, 1
        if widget.GetScale then
            local cur = widget:GetScale()
            if cur then cx, cy = cur.x or 1, cur.y or 1 end
        end
        widget:SetScale(cx * s, cy * s)
        w = (w or 0) * s
        h = (h or 0) * s
    end
    return widget, w, h
end

--- Create a UI from a tree definition. cmd = { id, group, tree, anchor, x, y }
--- (Assigned to the forward-declared `CreateTree` so the flat adapters above can call it.)
CreateTree = function(cmd)
    local root = GetRoot()
    if not root or not cmd.tree then return nil end
    local w = root:AddChild(_G.require("widgets/widget")("dstp_tree_" .. cmd.id))
    local ctx = { callback_fn = UIWidgets._callback_fn, root_id = cmd.group or cmd.id, byId = {} }
    -- fire(cb, data): send a callback, ALWAYS enriching callback_data with `fields` = every
    -- text_input's current value keyed by its id. So a button click ships the whole form.
    ctx.fire = function(cb, data)
        if not (cb and ctx.callback_fn) then return end
        local fields = {}
        for _, fg in ipairs(ctx.field_getters or {}) do
            local ok, v = _G.pcall(fg.get)
            fields[fg.id] = ok and v or ""
        end
        data = data or {}
        data.fields = fields
        ctx.callback_fn(cb, ctx.root_id, data)
    end
    RenderNode(cmd.tree, w, ctx)
    local ax, ay = AnchorOffset(cmd.anchor or "center")
    w:SetPosition(ax + (cmd.x or 0), ay + (cmd.y or 0))
    return { widget = w, type = "tree", group = cmd.group, byId = ctx.byId, text_fields = ctx.text_fields }
end

-- Release the keyboard grab of any editing text_input in an entry, so destroying a tree
-- while a field is being edited doesn't leave the player unable to move (force-process
-- stays on until SetEditing(false)).
local function ReleaseTextFields(entry)
    if not (entry and entry.text_fields) then return end
    for _, te in ipairs(entry.text_fields) do
        if te.inst and te.inst:IsValid() and te.SetEditing then
            local ok = _G.pcall(function() te:SetEditing(false) end)
        end
    end
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
    -- Combat-target mode: prefer whoever the player is fighting (combat replica),
    -- but fall back to the nearest non-player entity so "I hit that tentacle"
    -- still shows a bar even when no formal combat target is set.
    if follow.mode == "combat_target" then
        local cmb = player.replica and player.replica.combat
        local tgt = cmb and cmb.GetTarget and cmb:GetTarget()
        if tgt and tgt:IsValid() then return tgt end
        -- fall through to nearest-entity search below
    end
    -- By explicit GUID first.
    if follow.guid then
        local ent = _G.Ents and _G.Ents[follow.guid]
        if ent and ent:IsValid() then return ent end
    end
    -- Otherwise search around the player. When no specific prefab is given, only
    -- consider creatures (so trees/rocks/etc. don't grab the bar) by requiring
    -- one of the combat-ish tags. With a prefab, match it directly.
    local px, py, pz = player.Transform:GetWorldPosition()
    local radius = (follow.max_dist and follow.max_dist > 0) and follow.max_dist or 40
    local mustoneof = (not follow.prefab) and { "_combat", "monster", "animal", "hostile", "epic" } or nil
    local ents = _G.TheSim:FindEntities(px, py, pz, radius, nil, { "INLIMBO", "FX", "player", "playerghost" }, mustoneof)
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
    -- setBarPct receives a 0..1 fraction directly (mob health is only available
    -- client-side as a percent for entities that replicate it).
    local function setBarPct(pct)
        pct = math.max(0, math.min(pct or 1, 1))
        local fw = math.max(1, bw * pct)
        fg:SetSize(fw, bh - 2); fg:SetPosition(-(bw - fw) / 2, 0)
    end
    fg:SetTint(fgc[1], fgc[2], fgc[3], fgc[4])
    setBarPct(1)

    local label = nil
    if cmd.label or cmd.text then
        label = w:AddChild(Text(_G.NEWFONT_OUTLINE, 16, cmd.label or cmd.text or ""))
        label:SetPosition(0, bh + 6)
    end

    -- Per-frame reposition + track the entity's health PERCENT (the only thing
    -- the client reliably knows for replicated mobs).
    local entry = { widget = w, type = "follow", group = cmd.group, bar = fg, label = label }
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
        -- Live health. DST doesn't replicate mob HP, so DSTP injects its own
        -- netvar (dstp_hp/dstp_hp_max, see modmain) that the client reads here.
        -- Fall back to the player health replica (works for players).
        if ent.dstp_hp and ent.dstp_hp_max and ent.dstp_hp_max > 0 then
            setBarPct(ent.dstp_hp / ent.dstp_hp_max)
        else
            local h = ent.replica and ent.replica.health
            if h and h.GetPercent then
                local ok, pct = _G.pcall(function() return h:GetPercent() end)
                if ok and type(pct) == "number" then setBarPct(pct) end
            end
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

-- Generic update for the folded flat widgets (label/panel/button/progress_bar): they
-- are one-node trees, so an `update` just patches the leaf node's props in place via
-- SetProps. Translates the flat cmd fields to the leaf's prop names. Reposition by
-- anchor isn't supported in-place (the legacy reposition was rare); a flow that needs
-- to move a flat widget re-creates it (same id replaces).
local function UpdateFlat(entry, cmd)
    local leaf = entry.leaf or "_leaf"
    local props = {}
    if cmd.text ~= nil then props.text = cmd.text end
    if cmd.color ~= nil then props.color = cmd.color end
    if cmd.size ~= nil then props.size = cmd.size end
    if cmd.value ~= nil then props.value = cmd.value end
    if cmd.max ~= nil then props.max = cmd.max end
    if cmd.label ~= nil then props.label = cmd.label end
    if cmd.title ~= nil then props.title = cmd.title end
    if cmd.body ~= nil then props.body = cmd.body end
    if cmd.visible ~= nil then props.visible = cmd.visible end
    if next(props) then
        UIWidgets.SetProps({ id = cmd.id, node = leaf, props = props })
    end
end

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
    label        = UpdateFlat,
    panel        = UpdateFlat,
    tree         = UpdateTree,
    button       = UpdateFlat,
    progress_bar = UpdateFlat,
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

    -- Release any editing text_input keyboard grab BEFORE killing, so the player isn't
    -- left unable to move if the tree is destroyed mid-edit.
    ReleaseTextFields(entry)

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
    -- NOTE: the "batch" envelope is no longer fanned out HERE. The client router in
    -- modmain (dstp_ui_dirty) owns fan-out now: it dedups the envelope by seq once and
    -- dispatches EACH sub-command by its own prefix (rules_/state_ -> RulesEngine, else
    -- -> UIWidgets), so a mixed UI+rules batch reaches both sides and a pure-UI batch is
    -- processed exactly once. UIWidgets only ever sees individual UI sub-commands.
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
